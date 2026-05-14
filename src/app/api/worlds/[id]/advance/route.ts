// Reality advances the current turn's phase. DISCUSSION -> VOTE -> RESOLVE -> CLOSED -> next.
// Reads/writes the active branch through worlds.current_turn_id; falls back to
// the legacy "find an open turn" lookup so old worlds keep working.
import { NextRequest, NextResponse } from "next/server";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { NEXT_PHASE, type Phase } from "@/lib/phases";
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

  const next = NEXT_PHASE[turn.phase as Phase];
  if (!next) return new NextResponse("Already at terminal phase.", { status: 400 });

  if (next === "CLOSED") {
    const submittedActions = await db
      .select()
      .from(schema.actions)
      .where(and(eq(schema.actions.turnId, turn.id), isNotNull(schema.actions.submittedAt)))
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

  await db
    .update(schema.turns)
    .set({ phase: next, phaseStartedAt: new Date().toISOString() })
    .where(eq(schema.turns.id, turn.id))
    .run();
  return NextResponse.json({ ok: true, phase: next });
}
