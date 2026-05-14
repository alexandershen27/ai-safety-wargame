# Architecture

These are the load-bearing technical decisions. Most of them exist so the deferred
features in [`features/`](features/) can be added later **without a schema
migration or a rewrite**. Don't casually change anything in this file —
each bet is here because of a specific future feature it enables.

## The bets, in order of importance

### 1. Everything dynamic is a row, not a constant

The previous handoff README assumed a fixed 8-role / 10-turn AI-safety game.
That was wrong for the actual goal — a *general* scenario sandbox. So:

- **Roles** are per-world rows in `roles` (name, color, brief, position). No
  hardcoded `ROLES` constant.
- **Phase durations** live in `worlds.phase_durations` (JSON).
- **Timestep** is two columns on `worlds` (`timestep_unit`, `timestep_amount`).
- **World metrics** live in `worlds.world_state` (JSON bag, schema-less).

Adding "AI 2027" or "Climate 2050" or any other template = inserting a preset
bundle of these rows. **No code change.** See
[`features/world-templates.md`](features/world-templates.md).

### 2. Server-authoritative phase transitions

Clients never write `phase`, `closed_at`, `current_date`, or `world_state`.
They hit `POST /api/worlds/[id]/advance` and the server runs the state machine
defined in `src/lib/phases.ts`. Adding RESEARCH or splitting RESOLVE into
sub-phases later = editing the `NEXT_PHASE` table in one file.

Why this matters: it's the *only* place we get to enforce things like "you can't
vote once VOTE is over" or "Reality has to resolve every action before close."
If clients could write phase directly, every future mechanic would need its own
permission code.

### 3. Immutable turns

A turn's `closed_at` is set exactly once, after which the row is never updated.
Rollback and branching aren't special operations — they're "insert a new turn
with an older `parent_turn_id`." The schema already supports this; the UI just
doesn't render the graph yet. See
[`features/branching-and-rollback.md`](features/branching-and-rollback.md).

This also means **derived state must be computable from the turn chain**, not
patched in place. The `world_state` column is a cached snapshot; the source of
truth is the fold of `(parent_world_state, resolved actions) → world_state`.
When that fold function lands, it must be pure and unit-testable. See
[`features/world-state-and-deltas.md`](features/world-state-and-deltas.md).

### 4. Cookie identity, no OAuth (yet)

`src/proxy.ts` issues a random 32-byte token in the `wg_player` cookie on first
request. `src/lib/auth.ts` reads the token and lazily creates a `players` row
keyed to it. The token is the credential.

Trade-offs:
- ✅ Zero signup friction. Click → play.
- ✅ No OAuth verification dance, no email service.
- ❌ Not portable across browsers / incognito. Cookie loss = orphaned player.
- ❌ No real account recovery.

**Swap-in path to OAuth:** add `players.user_id text` (already nullable would be
fine — no migration needed if we add it as a column with default null). On
login, write `user_id` and look up the player by `user_id` first, fall back to
cookie. No data migration.

### 5. Polling instead of WebSockets

`WorldShell.tsx` polls `/api/worlds/[id]/state` every 2 seconds. State diffs
re-render via React state. This is good enough for an 8-player session.

We deliberately did *not* set up Supabase Realtime / SSE / WebSockets because:
- They're more involved to debug than HTTP.
- They don't survive Vercel cold starts cleanly.
- A 2s lag in a deliberation game is invisible.

**When to upgrade:** if we ever see >30 concurrent players in a world, or if
latency becomes a UX complaint, swap the polling effect in `WorldShell.tsx` for
a Server-Sent Events stream. The rest of the app doesn't change.

### 6. Drizzle + libSQL (SQLite shape)

- **Locally:** `wargame.db` file. Zero setup, easy to nuke.
- **Production:** Turso (managed libSQL). Free tier is plenty for a club demo.
- **Schema bootstrap** is idempotent `CREATE TABLE IF NOT EXISTS` in
  `src/lib/db/index.ts`. No migration tool wired up yet — when the schema
  stabilizes, switch to `drizzle-kit migrations`.

Drizzle picks: chosen because (a) the same client code targets local files and
Turso, (b) the types are shared between schema definition and queries, and (c)
swapping to Postgres later is a connection-string change, not a rewrite.

**Until migrations are wired up: schema changes during dev = `rm wargame.db` and
restart.** In production, schema changes need an explicit migration script run
against Turso.

### 7. Zod at every API boundary

Every POST handler validates with Zod before touching the DB. JSONB-like text
columns (`deltas`, `phase_durations`, `world_state`, `tags`) get strict shapes
at the call site because SQLite can't enforce them.

If you add a new endpoint or a new JSONB-shape, **add a Zod schema for it.** The
DB will let you write whatever you want; the only thing keeping the data clean
is the validator.

## The phase machine

Defined in `src/lib/phases.ts`:

```
DISCUSSION → VOTE → RESOLVE → CLOSED → (new turn) DISCUSSION
```

The `advance` endpoint walks `NEXT_PHASE`. When transitioning to `CLOSED`, it
also:
1. Sets `turns.closed_at = now()` on the old turn.
2. Advances `worlds.current_date` by the timestep.
3. Inserts a new turn with `phase = 'DISCUSSION'` and
   `parent_turn_id = <old turn id>`.

This is the *only* place that mutates world progression. If you add a feature
that needs to fire on close (e.g. apply deltas, generate forced-response slots,
notify players), wire it in `src/app/api/worlds/[id]/advance/route.ts` inside
the `CLOSED` branch.

## What's intentionally simple

- **No queue, no background jobs.** Everything is synchronous in the request
  cycle. The single Reality user is the heartbeat that advances state.
- **No optimistic UI.** Mutations wait for the server, then polling picks up
  the new state. Good enough for a 2s tick.
- **No drag-and-drop.** Resolve uses submission order. Drag-reorder is in
  [`features/gm-cockpit.md`](features/gm-cockpit.md).
- **No markdown rendering in user content.** Plain text in textareas. Adding
  markdown for action descriptions is fine; it's not load-bearing.
