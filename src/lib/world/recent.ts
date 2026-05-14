// Worlds the current player has any relationship with: either Reality of, or
// holds a seat in. Used by the landing page so people don't lose their worlds
// after a refresh.
import "server-only";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq, inArray, or, desc } from "drizzle-orm";

export type RecentWorld = {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  isReality: boolean;
  createdAt: string;
};

export async function getRecentWorldsForPlayer(
  playerId: string,
): Promise<RecentWorld[]> {
  await ensureSchema();

  // Worlds where I'm Reality.
  const asReality = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.realityPlayerId, playerId))
    .all();

  // Worlds where I hold a seat.
  const mySeats = await db
    .select({ worldId: schema.seats.worldId })
    .from(schema.seats)
    .where(eq(schema.seats.playerId, playerId))
    .all();
  const seatedWorldIds = Array.from(new Set(mySeats.map((s) => s.worldId)));
  const asPlayer = seatedWorldIds.length
    ? await db
        .select()
        .from(schema.worlds)
        .where(inArray(schema.worlds.id, seatedWorldIds))
        .all()
    : [];

  const byId = new Map<string, RecentWorld>();
  for (const w of asReality) {
    byId.set(w.id, {
      id: w.id,
      name: w.name,
      joinCode: w.joinCode,
      status: w.status,
      isReality: true,
      createdAt: w.createdAt,
    });
  }
  for (const w of asPlayer) {
    if (!byId.has(w.id)) {
      byId.set(w.id, {
        id: w.id,
        name: w.name,
        joinCode: w.joinCode,
        status: w.status,
        isReality: false,
        createdAt: w.createdAt,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
