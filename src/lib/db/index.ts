// libSQL + Drizzle. Same client works for local file dev AND Turso in prod.
//   - Locally: DATABASE_URL unset -> writes to ./wargame.db
//   - Turso:   DATABASE_URL=libsql://<db>.turso.io  + DATABASE_AUTH_TOKEN=<token>
import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __libsqlClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __libsqlBootstrapped: boolean | undefined;
}

const url =
  process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "wargame.db")}`;
const authToken = process.env.DATABASE_AUTH_TOKEN;

const client =
  global.__libsqlClient ?? createClient({ url, authToken });
if (!global.__libsqlClient) global.__libsqlClient = client;

export const db = drizzle(client, { schema });
export { schema };

/**
 * Idempotent CREATE TABLE IF NOT EXISTS. Called once at module load via the
 * `await ensureSchema()` import barrier in any handler that touches the DB.
 * libSQL is async-only, so we can't run this synchronously at import time.
 */
let bootstrapPromise: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (global.__libsqlBootstrapped) return Promise.resolve();
  if (!bootstrapPromise) bootstrapPromise = bootstrap();
  return bootstrapPromise;
}

async function bootstrap() {
  // Idempotent ALTER TABLE adds for columns introduced after the initial schema.
  // libSQL/SQLite doesn't have IF NOT EXISTS for ALTER COLUMN, so we swallow
  // "duplicate column" errors. Order matters: CREATE TABLE runs first below,
  // then we layer on the additions.
  const additiveColumns: { table: string; column: string; ddl: string }[] = [
    { table: "worlds", column: "current_turn_id", ddl: "ALTER TABLE worlds ADD COLUMN current_turn_id TEXT" },
  ];

  const stmts = [
    `CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      cookie_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS players_cookie_idx ON players(cookie_token)`,
    `CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      join_code TEXT NOT NULL,
      reality_player_id TEXT NOT NULL REFERENCES players(id),
      start_date TEXT NOT NULL,
      current_date TEXT NOT NULL,
      timestep_unit TEXT NOT NULL DEFAULT 'month',
      timestep_amount INTEGER NOT NULL DEFAULT 1,
      phase_durations TEXT NOT NULL DEFAULT '{}',
      world_state TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'lobby',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS worlds_join_code_idx ON worlds(join_code)`,
    `CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      brief TEXT,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS seats_unique_idx ON seats(world_id, role_id, player_id)`,
    `CREATE INDEX IF NOT EXISTS seats_world_idx ON seats(world_id)`,
    `CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      parent_turn_id TEXT,
      turn_number INTEGER NOT NULL,
      phase TEXT NOT NULL,
      phase_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      phase_ends_at TEXT,
      date_at_turn TEXT NOT NULL,
      world_state_snapshot TEXT NOT NULL DEFAULT '{}',
      closed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS turns_world_idx ON turns(world_id, turn_number)`,
    `CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id),
      author_player_id TEXT NOT NULL REFERENCES players(id),
      slot INTEGER NOT NULL DEFAULT 1,
      is_forced INTEGER NOT NULL DEFAULT 0,
      forced_by_action_id TEXT,
      draft_text TEXT NOT NULL DEFAULT '',
      submitted_text TEXT,
      deltas TEXT NOT NULL DEFAULT '[]',
      resolved_text TEXT,
      resolved_outcome TEXT,
      resolution_order INTEGER,
      visibility TEXT NOT NULL DEFAULT 'public',
      submitted_at TEXT,
      resolved_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
      voter_player_id TEXT NOT NULL REFERENCES players(id),
      voter_role_id TEXT NOT NULL REFERENCES roles(id),
      likelihood INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      objection TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS votes_unique_idx ON votes(action_id, voter_player_id)`,
  ];
  for (const s of stmts) await client.execute(s);

  for (const add of additiveColumns) {
    try {
      await client.execute(add.ddl);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      // SQLite emits "duplicate column name: X" when the column is already there.
      if (!msg.toLowerCase().includes("duplicate column")) throw e;
    }
  }

  global.__libsqlBootstrapped = true;
}
