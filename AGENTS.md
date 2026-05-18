<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

Next.js 16 with breaking changes from earlier versions. Read the relevant
guide in `node_modules/next/dist/docs/` before writing code. Notable
specifics:

- Middleware was renamed to **proxy**. The cookie-issuing file is
  `src/proxy.ts`, not `middleware.ts`. The export is `proxy()`.
- Cookie mutation in RSCs is forbidden. The proxy is the only place that
  writes the player cookie.
<!-- END:nextjs-agent-rules -->

# Codebase orientation

A scenario-modeling sandbox. Most of what you need to know to land a change:

- **Phase machine.** `DISCUSSION → RESOLVE → CLOSED`. The `VOTE` phase
  string exists in the types for legacy DB rows but is never produced —
  voting happens inline in DISCUSSION once a player's submit gate lifts.
- **Server-authoritative phases + close.** Clients never write `phase`,
  `closed_at`, or `current_date`. They hit `POST /api/worlds/[id]/advance`,
  `/branch`, `/switch-to`, or `/cancel-branch`. All four enforce
  Reality-only.
- **Identity.** Two layers:
  - **Cookie** — every visitor gets a `wg_player` cookie from `src/proxy.ts`
    and a lazy `players` row keyed on it (`src/lib/auth.ts:ensurePlayer`).
  - **Account** (optional, magic-link email) — `players.account_id`. Reality
    MUST have one to create a world. The Reality gate uses
    `isRealityOf(player, world)` from `src/lib/auth-account.ts`, which
    compares `player.accountId === world.realityAccountId`. There is no
    cookie-id fallback — that was wiped during rollout.
  - Sign-in flow lives in `src/lib/auth-account.ts`. The
    `bindPlayerToAccount` helper enforces "one live player row per account
    at a time" by rewriting the existing account-bound player's cookie to
    the incoming cookie and deleting the duplicate. This keeps existing
    `authorPlayerId === me` filters working across devices without any
    account-aware code.
- **Email driver** — `src/lib/email.ts`. `EMAIL_DRIVER=console` (default in
  dev) prints magic-link URLs to stdout; `EMAIL_DRIVER=resend` calls
  Resend's REST API. Env vars: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.
  No SDK — just `fetch`.
- **DB.** libSQL via Drizzle (`src/lib/db/`). Same client targets a local
  file in dev and Turso in prod. Schema bootstrap is idempotent
  `CREATE TABLE IF NOT EXISTS` + additive `ALTER` in `src/lib/db/index.ts`;
  no migration tool wired up. Schema changes during dev = delete
  `wargame.db` and restart.
- **State sync (read this before touching any mutation).** 2s polling, with
  push-style refresh. Every client mutation MUST call `markMutationStart()`
  before the POST and `requestRefresh()` after — or use the `mutate()`
  wrapper from `src/lib/refresh.ts`. The WorldShell aborts in-flight polls
  on `markMutationStart` and drops responses whose `startedAt` precedes the
  latest mutation. Skipping this brings back the stale-poll flicker.
- **Validation.** Zod at every API boundary. SQLite won't enforce JSON
  shapes (`deltas`, `phase_durations`, `world_state`, `tags`) so the Zod
  schemas are the only thing keeping data clean.

## Where things live

```
src/
├── proxy.ts                          Cookie issuance (Next 16 "middleware")
├── lib/
│   ├── db/                           Drizzle schema + libSQL client + bootstrap
│   ├── auth.ts                       ensurePlayer() — cookie → player row
│   ├── auth-account.ts               Magic-link helpers + isRealityOf()
│   ├── email.ts                      sendMagicLink(); console + resend drivers
│   ├── refresh.ts                    markMutationStart / requestRefresh / mutate
│   ├── phases.ts                     Phase enum + NEXT_PHASE table
│   ├── timestep.ts                   Pure date math
│   └── world/
│       ├── state.ts                  Single read path — assembles the WorldView
│       └── load.ts, recent.ts        Smaller server-side readers
├── app/
│   ├── page.tsx                      Landing + recent worlds list
│   ├── sign-in/                      Magic-link request form
│   ├── world/new/                    Reality: create world (account-gated)
│   ├── join/                         Player: enter code + name
│   ├── world/[id]/
│   │   ├── lobby/                    Pre-start seat picker
│   │   ├── page.tsx                  Phase router
│   │   ├── WorldShell.tsx            Polling shell + topbar + advance buttons
│   │   ├── RoleMenu.tsx              Mid-game join/leave roles
│   │   ├── phases/                   DiscussionView, ResolveView, VoteList
│   │   └── timeline/                 Branch graph + history
│   └── api/
│       ├── auth/                     magic-link, verify, sign-out
│       └── ...                       All other POST/GET endpoints, Zod-validated
```
