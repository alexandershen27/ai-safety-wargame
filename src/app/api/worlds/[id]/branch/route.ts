// Reality forks a closed turn. Creates a SIBLING (same parent_turn_id, same
// turn_number, same date) in RESOLVE phase, with the source turn's actions and
// votes copied in. Reality re-resolves; the new branch becomes active.
//
// This is the "Race vs Slowdown" mechanic: keep the original turn intact in the
// graph, and run a parallel resolution from the same starting point.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { newId } from "@/lib/ids";

const Body = z.object({ fromTurnId: z.string() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id: worldId } = await params;
  const player = await ensurePlayer();

  const world = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId))
    .get();
  if (!world) return new NextResponse("World not found.", { status: 404 });
  if (world.realityPlayerId !== player.id)
    return new NextResponse("Only Reality can branch.", { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const source = await db
    .select()
    .from(schema.turns)
    .where(and(eq(schema.turns.id, parsed.data.fromTurnId), eq(schema.turns.worldId, worldId)))
    .get();
  if (!source) return new NextResponse("Source turn not found.", { status: 404 });
  if (!source.closedAt)
    return new NextResponse("Can only branch from a closed turn.", { status: 400 });

  // Create sibling turn in RESOLVE phase. Same parent, same turn number,
  // same date as the source — this turn is "the same point in time, resolved
  // differently."
  const newTurnId = newId();
  await db
    .insert(schema.turns)
    .values({
      id: newTurnId,
      worldId,
      parentTurnId: source.parentTurnId,
      turnNumber: source.turnNumber,
      phase: "RESOLVE",
      dateAtTurn: source.dateAtTurn,
      worldStateSnapshot: source.worldStateSnapshot,
      // Real wall-clock time — sibling order in the graph depends on this.
      createdAt: new Date().toISOString(),
    })
    .run();

  // Copy actions from source to the new branch. Each new action is "submitted"
  // (preserving the original submittedText/Time) but NOT resolved yet —
  // Reality writes fresh resolutions.
  const sourceActions = await db
    .select()
    .from(schema.actions)
    .where(eq(schema.actions.turnId, source.id))
    .all();
  const actionIdMap = new Map<string, string>();
  for (const a of sourceActions) {
    const newActionId = newId();
    actionIdMap.set(a.id, newActionId);
    await db
      .insert(schema.actions)
      .values({
        id: newActionId,
        turnId: newTurnId,
        roleId: a.roleId,
        authorPlayerId: a.authorPlayerId,
        slot: a.slot,
        isForced: a.isForced,
        forcedByActionId: null,
        draftText: a.draftText,
        submittedText: a.submittedText,
        deltas: a.deltas,
        resolvedText: null,
        resolvedOutcome: null,
        resolutionOrder: a.resolutionOrder,
        visibility: a.visibility,
        submittedAt: a.submittedAt,
        resolvedAt: null,
      })
      .run();
  }

  // Copy votes too so Reality sees the same advisory signal during re-resolve.
  if (sourceActions.length > 0) {
    const sourceVotes = await db
      .select()
      .from(schema.votes)
      .where(inArray(schema.votes.actionId, sourceActions.map((a) => a.id)))
      .all();
    for (const v of sourceVotes) {
      const newActionId = actionIdMap.get(v.actionId);
      if (!newActionId) continue;
      await db
        .insert(schema.votes)
        .values({
          id: newId(),
          actionId: newActionId,
          voterPlayerId: v.voterPlayerId,
          voterRoleId: v.voterRoleId,
          likelihood: v.likelihood,
          tags: v.tags,
          objection: v.objection,
        })
        .run();
    }
  }

  // Point the world at the new branch tip + reset the calendar to the fork
  // point so subsequent close-turn advances the date from here.
  await db
    .update(schema.worlds)
    .set({ currentTurnId: newTurnId, currentDate: source.dateAtTurn })
    .where(eq(schema.worlds.id, worldId))
    .run();

  return NextResponse.json({ ok: true, turnId: newTurnId });
}
