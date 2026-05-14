// Reality advances the active turn's phase. The state machine is intentionally
// asymmetric:
//
//   DISCUSSION -> RESOLVE  if every seat has submitted (skip VOTE entirely;
//                          voting was already happening inline)
//   DISCUSSION -> VOTE     if there are stragglers (forces them out of drafting;
//                          everyone else keeps voting on what's submitted)
//   VOTE       -> RESOLVE  always (with soft warning for unfinished voters,
//                          enforced client-side; the server lets it through)
//   RESOLVE    -> CLOSED   only if every submitted action has a resolution
//
// Skipping VOTE when everyone naturally submits matches the intended flow:
// players move into voting as soon as they personally finish; Reality only
// touches the advance button when it's time to resolve.
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

  const turn = await db
    .select()
    .from(schema.turns)
    .where(and(eq(schema.turns.worldId, id), isNull(schema.turns.closedAt)))
    .get();
  if (!turn) return new NextResponse("No open turn.", { status: 400 });

  // DISCUSSION: branch based on whether every seat has submitted.
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
    // Guard: every submitted action must be resolved before close.
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
    const newDate = advanceDate(
      world.currentDate,
      world.timestepUnit as TimestepUnit,
      world.timestepAmount,
    );
    await db
      .update(schema.worlds)
      .set({ currentDate: newDate })
      .where(eq(schema.worlds.id, id))
      .run();
    await db
      .insert(schema.turns)
      .values({
        id: newId(),
        worldId: id,
        parentTurnId: turn.id,
        turnNumber: turn.turnNumber + 1,
        phase: "DISCUSSION",
        dateAtTurn: newDate,
        worldStateSnapshot: world.worldState,
      })
      .run();
    return NextResponse.json({ ok: true, nextTurnNumber: turn.turnNumber + 1 });
  }

  return new NextResponse("Turn is already closed.", { status: 400 });
}
