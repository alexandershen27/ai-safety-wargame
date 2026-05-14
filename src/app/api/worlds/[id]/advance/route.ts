// Reality advances the active turn's phase. The state machine is minimal:
// DISCUSSION -> RESOLVE -> CLOSED. Voting happens inline during DISCUSSION
// once a player's strict submit gate lifts; there's no separate VOTE phase.
// Legacy VOTE turns (if any pre-dated this change) advance to RESOLVE too.
//
// Stragglers don't block advance. If Reality moves on while seats haven't
// submitted, those seats simply have no action this turn (the UI surfaces a
// warning on the button label, but the server lets it through).
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

  // DISCUSSION (and legacy VOTE) -> RESOLVE. No straggler check.
  if (turn.phase === "DISCUSSION" || turn.phase === "VOTE") {
    await db
      .update(schema.turns)
      .set({ phase: "RESOLVE", phaseStartedAt: new Date().toISOString() })
      .where(eq(schema.turns.id, turn.id))
      .run();
    return NextResponse.json({ ok: true, phase: "RESOLVE" });
  }

  if (turn.phase === "RESOLVE") {
    // Guard: every submitted-with-text action must be resolved before close.
    // Skipped actions (submittedAt set, submittedText empty) don't need a
    // resolution.
    const submittedActions = await db
      .select()
      .from(schema.actions)
      .where(
        and(
          eq(schema.actions.turnId, turn.id),
          isNotNull(schema.actions.submittedAt),
        ),
      )
      .all();
    const needsResolve = submittedActions.filter(
      (a) => (a.submittedText ?? "").trim().length > 0 && !a.resolvedText,
    );
    if (needsResolve.length > 0) {
      return new NextResponse(
        `Resolve ${needsResolve.length} more action${needsResolve.length === 1 ? "" : "s"} first.`,
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
