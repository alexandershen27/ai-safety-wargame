// Single read path for the world view. Server-side; called from page SSR + polling endpoint.
import "server-only";
import { db, schema, ensureSchema } from "@/lib/db";
import { asc, eq, inArray } from "drizzle-orm";

export type WorldView = {
  world: typeof schema.worlds.$inferSelect;
  roles: (typeof schema.roles.$inferSelect)[];
  seats: { roleId: string; playerId: string; displayName: string }[];
  currentTurn: typeof schema.turns.$inferSelect | null;
  actions: (typeof schema.actions.$inferSelect)[];
  votes: (typeof schema.votes.$inferSelect)[];
  totalTurns: number;
  isReality: boolean;
  myRoleIds: string[];
};

export async function getWorldView(
  worldId: string,
  currentPlayerId: string,
): Promise<WorldView | null> {
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

  const rawSeats = await db
    .select()
    .from(schema.seats)
    .where(eq(schema.seats.worldId, worldId))
    .all();
  const playerIds = Array.from(new Set(rawSeats.map((s) => s.playerId)));
  const seatPlayers = playerIds.length
    ? await db
        .select({ id: schema.players.id, displayName: schema.players.displayName })
        .from(schema.players)
        .where(inArray(schema.players.id, playerIds))
        .all()
    : [];
  const nameById = new Map(seatPlayers.map((p) => [p.id, p.displayName]));
  const seats = rawSeats.map((s) => ({
    roleId: s.roleId,
    playerId: s.playerId,
    displayName: nameById.get(s.playerId) ?? "?",
  }));

  const allTurns = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.worldId, worldId))
    .orderBy(asc(schema.turns.turnNumber))
    .all();
  const currentTurn =
    allTurns.find((t) => t.closedAt === null) ?? allTurns[allTurns.length - 1] ?? null;

  const actions = currentTurn
    ? await db
        .select()
        .from(schema.actions)
        .where(eq(schema.actions.turnId, currentTurn.id))
        .all()
    : [];
  const votes = actions.length
    ? await db
        .select()
        .from(schema.votes)
        .where(
          inArray(
            schema.votes.actionId,
            actions.map((a) => a.id),
          ),
        )
        .all()
    : [];

  return {
    world,
    roles,
    seats,
    currentTurn,
    actions,
    votes,
    totalTurns: allTurns.length,
    isReality: world.realityPlayerId === currentPlayerId,
    myRoleIds: rawSeats
      .filter((s) => s.playerId === currentPlayerId)
      .map((s) => s.roleId),
  };
}
