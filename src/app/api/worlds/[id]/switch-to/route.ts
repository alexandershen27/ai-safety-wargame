// Reality switches the active branch pointer to an existing turn. Used to "jump
// back" to a previously-abandoned branch without creating a new sibling.
//
// Behavior:
//   - Target turn is OPEN  -> just move the pointer there.
//   - Target turn is CLOSED with no children -> open a new child under it
//     (continues that branch forward; effectively normal play resumed).
//   - Target turn is CLOSED with children    -> just move the pointer; Reality
//     can navigate from there. (If they want a fork instead, they use /branch.)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { advanceDate, type TimestepUnit } from "@/lib/timestep";
import { newId } from "@/lib/ids";

const Body = z.object({ toTurnId: z.string() });

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
    return new NextResponse("Only Reality can switch branches.", { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const target = await db
    .select()
    .from(schema.turns)
    .where(and(eq(schema.turns.id, parsed.data.toTurnId), eq(schema.turns.worldId, worldId)))
    .get();
  if (!target) return new NextResponse("Target turn not found.", { status: 404 });

  // If target is open, just point at it.
  if (!target.closedAt) {
    await db
      .update(schema.worlds)
      .set({ currentTurnId: target.id, currentDate: target.dateAtTurn })
      .where(eq(schema.worlds.id, worldId))
      .run();
    return NextResponse.json({ ok: true, turnId: target.id });
  }

  // Target is closed. Look for an existing direct child of this turn (continuing
  // its chain forward). If one exists, point at it. Otherwise open a new child.
  const child = await db
    .select()
    .from(schema.turns)
    .where(
      and(eq(schema.turns.parentTurnId, target.id), eq(schema.turns.worldId, worldId)),
    )
    .get();
  if (child) {
    await db
      .update(schema.worlds)
      .set({ currentTurnId: child.id, currentDate: child.dateAtTurn })
      .where(eq(schema.worlds.id, worldId))
      .run();
    return NextResponse.json({ ok: true, turnId: child.id });
  }

  // Leaf: open a new child to continue this branch.
  const newDate = advanceDate(
    target.dateAtTurn,
    world.timestepUnit as TimestepUnit,
    world.timestepAmount,
  );
  const nextTurnId = newId();
  await db
    .insert(schema.turns)
    .values({
      id: nextTurnId,
      worldId,
      parentTurnId: target.id,
      turnNumber: target.turnNumber + 1,
      phase: "DISCUSSION",
      dateAtTurn: newDate,
      worldStateSnapshot: world.worldState,
    })
    .run();
  await db
    .update(schema.worlds)
    .set({ currentTurnId: nextTurnId, currentDate: newDate })
    .where(eq(schema.worlds.id, worldId))
    .run();
  return NextResponse.json({ ok: true, turnId: nextTurnId });
}
