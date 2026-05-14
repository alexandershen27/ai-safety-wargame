// Single read path for the world view. Server-side; called from page SSR + polling endpoint.
//
// Action visibility rule (STRICT):
//   In DISCUSSION, non-Reality players can only see other players' actions
//   once they themselves have submitted EVERY action they owe (one per role
//   they're seated at). Until then, they only see their own draft cards.
//   Reality always sees everything.
//
// In VOTE / RESOLVE, the gate is lifted — everyone sees all submitted actions.
//
// Two progress numbers are computed for Reality's advance button:
//   submitProgress: how many seats have submitted vs how many seats exist.
//                   Drives "End discussion → Resolve" vs "Force vote".
//   voteProgress:   how many seated players have voted on EVERY submitted
//                   action vs how many seated players exist total. Drives
//                   the "(2 still voting)" warning.
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
  /** Lightweight per-turn info for the Ribbon and the branch graph. */
  allTurns: {
    id: string;
    turnNumber: number;
    dateAtTurn: string;
    phase: string;
    closedAt: string | null;
    parentTurnId: string | null;
    createdAt: string;
  }[];
  isReality: boolean;
  myRoleIds: string[];
  /** True iff this player can't see other players' actions yet. */
  actionsHidden: boolean;
  /** True iff this player has submitted every action they owe this turn. */
  iHaveSubmittedAll: boolean;
  submitProgress: { submitted: number; expected: number };
  voteProgress: { finished: number; total: number };
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
  // Find the active turn via worlds.current_turn_id; fall back to the open
  // turn for legacy worlds that pre-date the pointer column.
  const currentTurn =
    (world.currentTurnId
      ? allTurnsRaw.find((t) => t.id === world.currentTurnId)
      : undefined) ??
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
  const inDiscussion = currentTurn?.phase === "DISCUSSION";

  // Strict gate: have I submitted an action for EVERY role I'm seated at?
  const myRoleIds = rawSeats
    .filter((s) => s.playerId === currentPlayerId)
    .map((s) => s.roleId);
  const iHaveSubmittedAll =
    myRoleIds.length > 0 &&
    myRoleIds.every((roleId) =>
      rawActions.some(
        (a) =>
          a.roleId === roleId &&
          a.authorPlayerId === currentPlayerId &&
          a.submittedAt !== null,
      ),
    );

  // Visibility rule:
  //   - Seated players (incl. Reality with seats) must submit every action
  //     they owe before they can see/vote on anyone else's. No peeking even
  //     for the GM if they're also playing roles.
  //   - Unseated Reality sees everything (they need it to advance phases).
  //   - Unseated non-Reality (spectators) see nothing during DISCUSSION.
  const hasSeats = myRoleIds.length > 0;
  const actionsHidden =
    inDiscussion &&
    (hasSeats ? !iHaveSubmittedAll : !isReality);
  const actions = actionsHidden
    ? rawActions.filter((a) => a.authorPlayerId === currentPlayerId)
    : rawActions;

  // Vote payload is filtered to whatever actions the caller can see.
  const visibleActionIds = new Set(actions.map((a) => a.id));
  const visibleVotes = visibleActionIds.size
    ? await db
        .select()
        .from(schema.votes)
        .where(inArray(schema.votes.actionId, Array.from(visibleActionIds)))
        .all()
    : [];

  // submitProgress: every seat is expected to submit one action this turn.
  // A seat counts as "submitted" if there's any action for (turn, role, player)
  // with submittedAt set.
  const submittedSeatCount = rawSeats.filter((s) =>
    rawActions.some(
      (a) =>
        a.roleId === s.roleId &&
        a.authorPlayerId === s.playerId &&
        a.submittedAt !== null,
    ),
  ).length;

  // voteProgress: count how many seated PLAYERS (not seats) have voted on
  // every currently-submitted action. Needs unfiltered votes since visibility
  // can hide things from the requesting player.
  // Only non-skipped submitted actions need votes. Skipped actions
  // (submittedAt set, submittedText empty) don't appear in the vote UI.
  const submittedActions = rawActions.filter(
    (a) =>
      a.submittedAt !== null && (a.submittedText ?? "").trim().length > 0,
  );
  const allVotes = submittedActions.length
    ? await db
        .select()
        .from(schema.votes)
        .where(
          inArray(
            schema.votes.actionId,
            submittedActions.map((a) => a.id),
          ),
        )
        .all()
    : [];
  const seatedPlayerIds = Array.from(new Set(rawSeats.map((s) => s.playerId)));
  const finishedVoterCount =
    submittedActions.length === 0
      ? seatedPlayerIds.length
      : seatedPlayerIds.filter((pid) =>
          submittedActions.every((a) =>
            allVotes.some(
              (v) => v.actionId === a.id && v.voterPlayerId === pid,
            ),
          ),
        ).length;

  return {
    world,
    roles,
    seats,
    currentTurn,
    actions,
    votes: visibleVotes,
    allTurns: allTurnsRaw.map((t) => ({
      id: t.id,
      turnNumber: t.turnNumber,
      dateAtTurn: t.dateAtTurn,
      phase: t.phase,
      closedAt: t.closedAt,
      parentTurnId: t.parentTurnId,
      createdAt: t.createdAt,
    })),
    isReality,
    myRoleIds,
    actionsHidden,
    iHaveSubmittedAll,
    submitProgress: {
      submitted: submittedSeatCount,
      expected: rawSeats.length,
    },
    voteProgress: {
      finished: finishedVoterCount,
      total: seatedPlayerIds.length,
    },
  };
}
