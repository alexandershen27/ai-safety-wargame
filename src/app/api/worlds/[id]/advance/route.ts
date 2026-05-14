// Reality advances the active turn's phase. State machine is asymmetric:
//
//   DISCUSSION -> RESOLVE  if every seat has submitted (skip VOTE entirely;
//                          voting was already happening inline)
//   DISCUSSION -> VOTE     if there are stragglers (forces them out of drafting;
//                          everyone else keeps voting on what's submitted)
//   VOTE       -> RESOLVE  always (with soft warning for unfinished voters,
//                          enforced client-side; the server lets it through)
//   RESOLVE    -> CLOSED   only if every submitted action has a resolution
//
// Reads/writes the active branch through worlds.current_turn_id; falls back to
// the legacy "find an open turn" lookup so old worlds keep working.
import { NextRequest, NextResponse } from "next/server";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { advanceDate, type TimestepUnit } from "@/lib/timestep";
import { newId } from "@/lib/ids";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await params;
  const player = await ensurePlayer();
  const world = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, id))
    .get();
  if (!world) return new NextResponse("World not found.", { status: 404 });
  if (world.realityPlayerId !== player.id)
    return new NextResponse("Only Reality can advance.", { status: 403 });

  // Find the active turn via the pointer; fall back to the open turn for
  // pre-branching worlds.
  const turn = world.currentTurnId
    ? await db
        .select()
        .from(schema.turns)
        .where(eq(schema.turns.id, world.currentTurnId))
        .get()
    : await db
        .select()
        .from(schema.turns)
        .where(and(eq(schema.turns.worldId, id), isNull(schema.turns.closedAt)))
        .get();
  if (!turn) return new NextResponse("No active turn.", { status: 400 });

  if (turn.phase === "DISCUSSION") {
    const seats = await db
      .select()
      .from(schema.seats)
      .where(eq(schema.seats.worldId, id))
      .all();
    const actions = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.turnId, turn.id))
      .all();
    const allSubmitted =
      seats.length === 0 ||
      seats.every((s) =>
        actions.some(
          (a) =>
            a.roleId === s.roleId &&
            a.authorPlayerId === s.playerId &&
            a.submittedAt !== null,
        ),
      );
    const nextPhase = allSubmitted ? "RESOLVE" : "VOTE";
    await db
      .update(schema.turns)
      .set({ phase: nextPhase, phaseStartedAt: new Date().toISOString() })
      .where(eq(schema.turns.id, turn.id))
      .run();
    return NextResponse.json({ ok: true, phase: nextPhase });
  }

  if (turn.phase === "VOTE") {
    await db
      .update(schema.turns)
      .set({ phase: "RESOLVE", phaseStartedAt: new Date().toISOString() })
      .where(eq(schema.turns.id, turn.id))
      .run();
    return NextResponse.json({ ok: true, phase: "RESOLVE" });
  }

  if (turn.phase === "RESOLVE") {
    const submittedActions = await db
      .select()
      .from(schema.actions)
      .where(
        and(eq(schema.actions.turnId, turn.id), isNotNull(schema.actions.submittedAt)),
      )
      .all();
    const unresolved = submittedActions.filter((a) => !a.resolvedText);
    if (unresolved.length > 0) {
      return new NextResponse(
        `Resolve ${unresolved.length} more action${unresolved.length === 1 ? "" : "s"} first.`,
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    await db
      .update(schema.turns)
      .set({ phase: "CLOSED", closedAt: now })
      .where(eq(schema.turns.id, turn.id))
      .run();
    // Advance from the closing turn's own date — works correctly after a
    // branch reset (worlds.currentDate might be at the fork point).
    const newDate = advanceDate(
      turn.dateAtTurn,
      world.timestepUnit as TimestepUnit,
      world.timestepAmount,
    );
    const nextTurnId = newId();
    await db
      .insert(schema.turns)
      .values({
        id: nextTurnId,
        worldId: id,
        parentTurnId: turn.id,
        turnNumber: turn.turnNumber + 1,
        phase: "DISCUSSION",
        dateAtTurn: newDate,
        worldStateSnapshot: world.worldState,
      })
      .run();
    await db
      .update(schema.worlds)
      .set({ currentDate: newDate, currentTurnId: nextTurnId })
      .where(eq(schema.worlds.id, id))
      .run();
    return NextResponse.json({ ok: true, nextTurnNumber: turn.turnNumber + 1 });
  }

  return new NextResponse("Turn is already closed.", { status: 400 });
}
