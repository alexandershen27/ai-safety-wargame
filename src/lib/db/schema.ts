// SQLite schema via Drizzle. Designed so swapping to Postgres later is just a driver change.
// Conventions:
//   - all PKs are random uuid-ish strings (crypto.randomUUID())
//   - all timestamps stored as ISO strings (text)
//   - "polymorphic / extensible" columns are JSON-stringified text (sqlite has no jsonb)
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

/** Anonymous player. Cookie token is the only credential. */
export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    cookieToken: text("cookie_token").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("players_cookie_idx").on(t.cookieToken)],
);

/** A world = one Reality's session. Roles, phase durations, timestep are all per-world. */
export const worlds = sqliteTable(
  "worlds",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    joinCode: text("join_code").notNull(),
    realityPlayerId: text("reality_player_id")
      .notNull()
      .references(() => players.id),
    startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
    currentDate: text("current_date").notNull(),
    timestepUnit: text("timestep_unit").notNull().default("month"),
    timestepAmount: integer("timestep_amount").notNull().default(1),
    /** JSON: { discussion: number|null, vote: number|null, resolve: number|null } seconds */
    phaseDurations: text("phase_durations").notNull().default("{}"),
    /** JSON: free-form metric bag. v1 keeps it loose. */
    worldState: text("world_state").notNull().default("{}"),
    /** 'lobby' | 'active' | 'closed' */
    status: text("status").notNull().default("lobby"),
    /** Tip of the active branch. Null in lobby; set as soon as turn 1 opens. */
    currentTurnId: text("current_turn_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("worlds_join_code_idx").on(t.joinCode)],
);

/** Roles are PER WORLD — Reality defines them when creating the world. */
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  worldId: text("world_id")
    .notNull()
    .references(() => worlds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  brief: text("brief"), // markdown, optional
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Many-to-many seats. Multi-occupant allowed (UI just lists them in v1). */
export const seats = sqliteTable(
  "seats",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("seats_unique_idx").on(t.worldId, t.roleId, t.playerId),
    index("seats_world_idx").on(t.worldId),
  ],
);

/** Turns. Immutable once closed. parent_turn_id reserved for future branching. */
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    parentTurnId: text("parent_turn_id"),
    turnNumber: integer("turn_number").notNull(),
    /** 'DISCUSSION' | 'VOTE' | 'RESOLVE' | 'CLOSED' */
    phase: text("phase").notNull(),
    phaseStartedAt: text("phase_started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    phaseEndsAt: text("phase_ends_at"),
    dateAtTurn: text("date_at_turn").notNull(),
    /** JSON snapshot of world.world_state at turn start */
    worldStateSnapshot: text("world_state_snapshot").notNull().default("{}"),
    closedAt: text("closed_at"),
  },
  (t) => [index("turns_world_idx").on(t.worldId, t.turnNumber)],
);

/** Actions: drafted in DISCUSSION, locked at submit, narrated by Reality in RESOLVE. */
export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  turnId: text("turn_id")
    .notNull()
    .references(() => turns.id, { onDelete: "cascade" }),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  authorPlayerId: text("author_player_id")
    .notNull()
    .references(() => players.id),
  slot: integer("slot").notNull().default(1),
  /** Reserved for the future "tagged-by-another-role" forced response slot. */
  isForced: integer("is_forced", { mode: "boolean" }).notNull().default(false),
  forcedByActionId: text("forced_by_action_id"),
  draftText: text("draft_text").notNull().default(""),
  submittedText: text("submitted_text"),
  /** JSON: [{label, dir: up|dn|neu}]. Free strings in v1. */
  deltas: text("deltas").notNull().default("[]"),
  resolvedText: text("resolved_text"),
  resolvedOutcome: text("resolved_outcome"),
  /** Reserved for resolve drag-reorder. v1 = submission order. */
  resolutionOrder: integer("resolution_order"),
  /** Reserved for future "secrets between roles". */
  visibility: text("visibility").notNull().default("public"),
  submittedAt: text("submitted_at"),
  resolvedAt: text("resolved_at"),
});

/** One vote per (action, voter player). */
export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    voterPlayerId: text("voter_player_id")
      .notNull()
      .references(() => players.id),
    voterRoleId: text("voter_role_id")
      .notNull()
      .references(() => roles.id),
    likelihood: integer("likelihood").notNull(), // 0-100
    /** JSON string array */
    tags: text("tags").notNull().default("[]"),
    objection: text("objection"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("votes_unique_idx").on(t.actionId, t.voterPlayerId)],
);

export type World = typeof worlds.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Seat = typeof seats.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Turn = typeof turns.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Vote = typeof votes.$inferSelect;
