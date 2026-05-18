// Worlds the current player has any relationship with: either Reality of, or
// holds a seat in. Used by the landing page so people don't lose their worlds
// after a refresh.
//
// Reality aggregation runs through the player's account (cross-device). Seat
// aggregation stays cookie-bound — anonymous participants don't have
// accounts, and a signed-in participant's seats are always on the player row
// that owns this device (the consolidation flow keeps one player per
// account at a time).
import "server-only";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";

export type RecentWorld = {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  isReality: boolean;
  createdAt: string;
};

export async function getRecentWorldsForPlayer(player: {
  id: string;
  accountId: string | null;
}): Promise<RecentWorld[]> {
  await ensureSchema();

  // Worlds where I'm Reality — by account, not player. An anonymous player
  // (no account) is Reality of nothing.
  const asReality = player.accountId
    ? await db
        .select()
        .from(schema.worlds)
        .where(eq(schema.worlds.realityAccountId, player.accountId))
        .all()
    : [];

  // Worlds where I hold a seat. Bound to this player row (this device).
  const mySeats = await db
    .select({ worldId: schema.seats.worldId })
    .from(schema.seats)
    .where(eq(schema.seats.playerId, player.id))
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
