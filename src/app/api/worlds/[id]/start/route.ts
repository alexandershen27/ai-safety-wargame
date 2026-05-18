// Starting a world creates TWO turns:
//   T0 — closed "boot" turn at the world's start date. No actions; just a
//        graph anchor so siblings of T1 have a shared parent to render under.
//        Without it, "Resolve Differently" on T1 produces two root nodes with
//        no visible fork point.
//   T1 — the first playable turn (DISCUSSION). Parent is T0; date is
//        startDate + one timestep.
import { NextRequest, NextResponse } from "next/server";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { isRealityOf } from "@/lib/auth-account";
import { newId } from "@/lib/ids";
import { advanceDate, type TimestepUnit } from "@/lib/timestep";

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
  if (!isRealityOf(player, world))
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
    const now = new Date().toISOString();
    // T0: closed boot turn at the configured start date. Acts as the shared
    // parent for T1 + any future siblings of T1.
    const t0Id = newId();
    await db
      .insert(schema.turns)
      .values({
        id: t0Id,
        worldId: id,
        turnNumber: 0,
        phase: "CLOSED",
        dateAtTurn: world.startDate,
        worldStateSnapshot: world.worldState,
        closedAt: now,
        createdAt: now,
      })
      .run();
    // T1: first playable turn, one timestep after T0. Update worlds.currentDate
    // to match so subsequent close-turn advances are consistent.
    const t1Date = advanceDate(
      world.startDate,
      world.timestepUnit as TimestepUnit,
      world.timestepAmount,
    );
    const t1Id = newId();
    await db
      .insert(schema.turns)
      .values({
        id: t1Id,
        worldId: id,
        parentTurnId: t0Id,
        turnNumber: 1,
        phase: "DISCUSSION",
        dateAtTurn: t1Date,
        worldStateSnapshot: world.worldState,
        createdAt: now,
      })
      .run();
    await db
      .update(schema.worlds)
      .set({ currentTurnId: t1Id, currentDate: t1Date })
      .where(eq(schema.worlds.id, id))
      .run();
  }
  return NextResponse.json({ ok: true });
}
