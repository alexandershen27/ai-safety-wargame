import { NextRequest, NextResponse } from "next/server";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
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
    return new NextResponse("Only Reality can start.", { status: 403 });
  if (world.status !== "lobby") return NextResponse.json({ ok: true });

  await db
    .update(schema.worlds)
    .set({ status: "active" })
    .where(eq(schema.worlds.id, id))
    .run();

  const existing = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.worldId, id))
    .all();
  if (existing.length === 0) {
    await db
      .insert(schema.turns)
      .values({
        id: newId(),
        worldId: id,
        turnNumber: 1,
        phase: "DISCUSSION",
        dateAtTurn: world.currentDate,
        worldStateSnapshot: world.worldState,
      })
      .run();
  }
  return NextResponse.json({ ok: true });
}
