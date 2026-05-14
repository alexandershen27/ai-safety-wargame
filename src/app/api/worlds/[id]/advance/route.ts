// Reality advances the active turn's phase. The state machine is intentionally
// minimal: DISCUSSION -> RESOLVE -> CLOSED. There is no separate VOTE phase —
// voting happens inline during DISCUSSION the moment a player has submitted
// every action they owe.
//
// Stragglers don't block advance. If Reality moves on while seats haven't
// submitted, those seats simply have no action this turn (the UI surfaces a
// warning on the advance button, but the server lets it through).
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
