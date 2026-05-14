// Discard a provisional branch — a sibling turn Reality just forked but
// hasn't committed yet. We define "provisional" as:
//   - phase === 'RESOLVE'           (still being set up)
//   - has at least one sibling       (was created via /branch)
//   - has no children                (no follow-up turn opened yet)
//
// Cancellation deletes the turn (CASCADE wipes its actions + votes) and
// points worlds.current_turn_id at whichever sibling it forked from.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";

const Body = z.object({ turnId: z.string() });

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
    return new NextResponse("Only Reality can cancel a branch.", { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const target = await db
    .select()
    .from(schema.turns)
    .where(and(eq(schema.turns.id, parsed.data.turnId), eq(schema.turns.worldId, worldId)))
    .get();
  if (!target) return new NextResponse("Turn not found.", { status: 404 });
  if (target.phase !== "RESOLVE")
    return new NextResponse("Can only cancel a turn that's still in RESOLVE.", { status: 400 });

  // Must have a sibling (i.e., was forked from /branch) and no children
  // (hasn't been advanced yet).
  const allSameParent = await db
    .select()
    .from(schema.turns)
    .where(
      and(
        eq(schema.turns.worldId, worldId),
        eq(schema.turns.parentTurnId, target.parentTurnId ?? ""),
      ),
    )
    .all();
  if (allSameParent.length < 2)
    return new NextResponse("Not a fork — nothing to cancel.", { status: 400 });

  const children = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.parentTurnId, target.id))
    .all();
  if (children.length > 0)
    return new NextResponse("Already committed past this turn.", { status: 400 });

  // Pick a sibling to point at — the one that's NOT being deleted.
  const sibling = allSameParent.find((t) => t.id !== target.id);
  // Walk that sibling's chain forward to its tip so we don't park on a
  // closed historical turn.
  let pointerId = sibling?.id ?? target.parentTurnId ?? null;
  let cursor = pointerId;
  while (cursor) {
    const child = await db
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.parentTurnId, cursor))
      .get();
    if (!child) break;
    pointerId = child.id;
    cursor = child.id;
  }

  // Delete (actions + votes cascade via FK).
  await db.delete(schema.turns).where(eq(schema.turns.id, target.id)).run();

  // Re-point the world. Also reset current_date to the new pointer turn's date.
  if (pointerId) {
    const pointerTurn = await db
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.id, pointerId))
      .get();
    await db
      .update(schema.worlds)
      .set({
        currentTurnId: pointerId,
        currentDate: pointerTurn?.dateAtTurn ?? world.currentDate,
      })
      .where(eq(schema.worlds.id, worldId))
      .run();
  }

  return NextResponse.json({ ok: true, currentTurnId: pointerId });
}
