// Single read path for the world view. Server-side; called from page SSR + polling endpoint.
//
// In DISCUSSION phase, this function HIDES other players' actions from a player
// who hasn't submitted any of their own actions yet. The gate is one-way: as
// soon as you submit one action, you see everyone's submitted actions. Reality
// always sees everything (they're the GM).
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
  /** Lightweight per-turn info for the Ribbon. */
  allTurns: {
    id: string;
    turnNumber: number;
    dateAtTurn: string;
    phase: string;
    closedAt: string | null;
  }[];
  isReality: boolean;
  myRoleIds: string[];
  /** True if action visibility is being gated (DISCUSSION + not-Reality + nothing submitted). */
  actionsHidden: boolean;
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

  const allTurnsRaw = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.worldId, worldId))
    .orderBy(asc(schema.turns.turnNumber))
    .all();
  const currentTurn =
    allTurnsRaw.find((t) => t.closedAt === null) ??
    allTurnsRaw[allTurnsRaw.length - 1] ??
    null;

  const rawActions = currentTurn
    ? await db
        .select()
        .from(schema.actions)
        .where(eq(schema.actions.turnId, currentTurn.id))
        .all()
    : [];

  const isReality = world.realityPlayerId === currentPlayerId;
  const myActionsThisTurn = rawActions.filter(
    (a) => a.authorPlayerId === currentPlayerId,
  );
  const haveSubmittedAny = myActionsThisTurn.some((a) => a.submittedAt !== null);
  const inDiscussion = currentTurn?.phase === "DISCUSSION";
  // Hide other players' actions from non-Reality, non-submitted players during DISCUSSION.
  const actionsHidden = inDiscussion && !isReality && !haveSubmittedAny;
  const actions = actionsHidden ? myActionsThisTurn : rawActions;

  const visibleActionIds = new Set(actions.map((a) => a.id));
  const allVotes = visibleActionIds.size
    ? await db
        .select()
        .from(schema.votes)
        .where(inArray(schema.votes.actionId, Array.from(visibleActionIds)))
        .all()
    : [];

  return {
    world,
    roles,
    seats,
    currentTurn,
    actions,
    votes: allVotes,
    allTurns: allTurnsRaw.map((t) => ({
      id: t.id,
      turnNumber: t.turnNumber,
      dateAtTurn: t.dateAtTurn,
      phase: t.phase,
      closedAt: t.closedAt,
    })),
    isReality,
    myRoleIds: rawSeats
      .filter((s) => s.playerId === currentPlayerId)
      .map((s) => s.roleId),
    actionsHidden,
  };
}
