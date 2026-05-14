# Wargame

A general-purpose **scenario-modeling sandbox**. One person ("Reality") creates a
world with custom roles and a timestep; the rest join with a code. Each turn
cycles through **Discussion → Vote → Resolve → Close**, the date advances, and
the next turn begins. Designed for AI-safety scenarios first but the data model
is fully generic — you can model anything that fits the
roles-acting-in-rounds-with-resolution shape.

> **Status:** v0.1, vertical slice. The full loop works end-to-end. Many planned
> mechanics are intentionally not built yet — see [`docs/roadmap.md`](docs/roadmap.md)
> before opening a PR.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Local dev writes to `./wargame.db` (SQLite via libSQL). Delete the file to reset
all state. Production runs on Vercel against a [Turso](https://turso.tech) DB —
see [Deployment](#deployment).

## What works today (v0.1)

- **Create a world** as Reality: name, start date, timestep (day/week/month/year × N),
  user-defined role list (name + color, add/remove rows).
- **Join with a 6-char code** as a player. Cookie-based identity, no email/OAuth.
- **Lobby** with seat picker. Multiple players can sit at the same role
  (schema allows it; UI lists co-occupants). Players who don't sit are spectators.
- **Reality starts the world** → Turn 1 opens in DISCUSSION.
- **Discussion phase:** each seated player drafts an action per role they occupy
  (auto-saved textarea). Submit locks the action; submitted actions become
  visible to everyone.
- **Vote phase:** for every submitted action, voters set a 0–100 likelihood
  slider, toggle tag chips (`unrealistic`, `needs source`, `2nd-order`, `strong`),
  and can leave a free-form objection. Vote count and average shown.
- **Resolve phase (Reality only):** for each action, Reality sees the vote
  summary and writes the resolved-as-fact text plus an outcome category
  (success-high / success-med / partial / fail-low / fail-hard). Players see a
  read-only feed of resolutions.
- **Close turn → next:** Reality clicks once, world date advances by the
  configured timestep, Turn N+1 opens in DISCUSSION. Closed turns are immutable.
- **Timeline** view: flat read-only history of every turn with each action's
  draft / submitted / resolved text and outcome.
- **2s polling** for real-time-ish state sync. No WebSocket dependency.

## What's planned (and why it's not here yet)

These features have intentional design space and partial schema support already.
Read the per-feature docs in [`docs/features/`](docs/features/) before you build
any of them — there are real architectural decisions baked in.

| Feature | Status | Spec |
|---|---|---|
| Forced-response tagging (action tags another role → that role gets a mandatory extra action next turn) | Schema columns exist (`actions.is_forced`, `actions.forced_by_action_id`), no UI or close-turn logic | [`docs/features/forced-response.md`](docs/features/forced-response.md) |
| Delta pills on actions (typed `usg-approval ▼` / `ai-cap ▲` impact markers) | `actions.deltas` JSONB exists, unused | [`docs/features/world-state-and-deltas.md`](docs/features/world-state-and-deltas.md) |
| World metric strip (always-visible sparklines for world state) | `worlds.world_state` JSONB exists, unused | [`docs/features/world-state-and-deltas.md`](docs/features/world-state-and-deltas.md) |
| Multi-file markdown notebook + sources list per player | Not built | [`docs/features/notebook-and-sources.md`](docs/features/notebook-and-sources.md) |
| World templates (preset "AI 2027", etc. that seed roles + capabilities + dates) | Not built | [`docs/features/world-templates.md`](docs/features/world-templates.md) |
| Branching / rollback to a past turn | `turns.parent_turn_id` exists, no UI | [`docs/features/branching-and-rollback.md`](docs/features/branching-and-rollback.md) |
| Secrets between roles (action visible to only some roles) | `actions.visibility` exists, only `'public'` written | [`docs/features/secrets-and-visibility.md`](docs/features/secrets-and-visibility.md) |
| Multi-player-per-role coordination UI (locking, merged drafts) | `seats` is many-to-many; UI just lists co-occupants | [`docs/features/multi-player-per-role.md`](docs/features/multi-player-per-role.md) |
| GM cockpit / Reality View extensions (drag-reorder resolve, kick-from-seat, etc.) | Not built | [`docs/features/gm-cockpit.md`](docs/features/gm-cockpit.md) |
| Phase timers + auto-advance | `turns.phase_ends_at` exists, unused | (deferred — not yet specced) |
| Google OAuth | Cookies only for now | (deferred — not yet specced) |

> **Note for contributors:** most of this list is on my own roadmap. Please open
> an issue before starting a feature — I may already have an architectural
> direction I want to preserve. See [`docs/architecture.md`](docs/architecture.md)
> for the core technical bets.

## Architecture in one screen

- **Next.js 16 (App Router, TypeScript)** + **Tailwind v4** + **Drizzle ORM**.
- **libSQL** (SQLite-compatible) via [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts).
  Local: file on disk. Production: Turso.
- **Cookie-based anonymous identity.** Token issued in `src/proxy.ts` (Next 16's
  renamed middleware), `players` row lazily created on first read. No email,
  no OAuth.
- **Server-authoritative phase transitions.** Clients never write `phase` or
  `world_state` — they hit `/api/worlds/[id]/advance` and the server enforces the
  state machine in `src/lib/phases.ts`.
- **Immutable turns.** A turn's `closed_at` is set once and the row is never
  updated after. Rollback / branching is "insert a new turn with an older
  `parent_turn_id`" — already supported by the schema, not yet in the UI.
- **Polling-based sync** (2s). No WebSocket / SSE / Supabase Realtime. Adding
  push later is local to `WorldShell.tsx`.
- **Zod at every API boundary.** JSONB columns get strict shapes per call site.

For the full set of decisions and the rationale behind them, see
[`docs/architecture.md`](docs/architecture.md).

## Repo layout

```
src/
├── app/
│   ├── page.tsx                  # Landing (Create / Join + recent worlds)
│   ├── world/new/                # Reality: world creation form
│   ├── join/                     # Player: enter code → name → seat
│   ├── world/[id]/
│   │   ├── lobby/                # Pre-start: seat picker + Start
│   │   ├── page.tsx              # Phase router (DISCUSSION/VOTE/RESOLVE)
│   │   ├── WorldShell.tsx        # Topbar+Ribbon+polling shell
│   │   ├── phases/               # DiscussionView / VoteView / ResolveView
│   │   └── timeline/             # Flat history feed
│   └── api/                      # All POST/GET endpoints (Zod-validated)
├── components/                   # Topbar, Ribbon, RoleChip
├── lib/
│   ├── db/                       # Drizzle schema + libSQL client + bootstrap
│   ├── world/                    # Read helpers + view assembly
│   ├── phases.ts                 # Phase state machine
│   ├── timestep.ts               # Date math (pure, unit-testable)
│   ├── auth.ts                   # Cookie player resolver
│   └── ids.ts                    # UUIDs + join codes
└── proxy.ts                      # Issues anonymous cookie token
docs/
├── architecture.md               # Technical bets, what to NOT change casually
├── roadmap.md                    # Priority order for the planned features
└── features/                     # One file per planned mechanic, with intent + design notes
```

## Deployment

Vercel + Turso. Two env vars:

```
DATABASE_URL=libsql://<your-db>.turso.io
DATABASE_AUTH_TOKEN=<jwt from `turso db tokens create`>
```

Push to `main` → Vercel auto-deploys. Schema bootstrap is idempotent
(`CREATE TABLE IF NOT EXISTS`) and runs on first request after a cold start.

## Demo notes

For an in-person demo, the most reliable shape is:

1. Reality opens the deployed URL on their laptop, **Create a world** with 3 roles,
   short names, 1-month timestep.
2. Read the join code aloud (or project the lobby).
3. Each player opens the URL on their phone, taps **Join with a code**, enters
   the code + their name, takes a seat.
4. Reality clicks **Start world**.
5. Walk through a turn together — discussion (~60 sec drafting), vote (~60 sec),
   resolve (~90 sec, Reality narrates).
6. Close turn, repeat once more so people see the date advance.

If you need a clean slate mid-demo: locally, stop the server and `rm wargame.db`.
On Turso, `turso db shell <name>` and `DELETE FROM worlds;` (cascades).
