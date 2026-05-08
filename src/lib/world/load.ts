// Read helpers used by the lobby page. Async; uses libSQL.
import "server-only";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq, asc, inArray } from "drizzle-orm";

export async function loadWorld(worldId: string) {
  await ensureSchema();
  const world = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId))
    .get();
  if (!world) return null;

  const roles = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.worldId, worldId))
    .orderBy(asc(schema.roles.position))
    .all();

  const seats = await db
    .select()
    .from(schema.seats)
    .where(eq(schema.seats.worldId, worldId))
    .all();

  const allTurns = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.worldId, worldId))
    .orderBy(asc(schema.turns.turnNumber))
    .all();

  const currentTurn =
    allTurns.find((t) => t.closedAt === null) ?? allTurns[allTurns.length - 1] ?? null;

  return { world, roles, seats, allTurns, currentTurn };
}

export async function loadPlayersForSeats(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  return await db
    .select()
    .from(schema.players)
    .where(inArray(schema.players.id, playerIds))
    .all();
}

export function seatsByRole(
  seats: { roleId: string; playerId: string }[],
  players: { id: string; displayName: string }[],
) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const map = new Map<string, { id: string; displayName: string }[]>();
  for (const s of seats) {
    const arr = map.get(s.roleId) ?? [];
    const p = byId.get(s.playerId);
    if (p) arr.push(p);
    map.set(s.roleId, arr);
  }
  return map;
}
