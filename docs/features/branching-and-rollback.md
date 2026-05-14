# Branching & rollback

> **Status:** Schema ready (`turns.parent_turn_id`). No UI.

## What it is

Two related capabilities:

- **Rollback** — Reality says "undo turn 4, we're going back to the start of
  turn 4 and replaying it." This is *destructive intent* — the existing turn
  4 stays in the DB but is no longer the "current" branch.
- **Branching** — Reality says "let's see what happens if turn 4 went
  differently, but keep the original around to compare." Same operation, less
  destructive framing.

Both operations are identical at the data layer: **insert a new turn whose
`parent_turn_id` points to an older turn instead of the latest one.** The
distinction is just whether the UI marks the old branch as "abandoned" or
"alternative."

## Why it's free now

We made `parent_turn_id` a column on day one and we never enforce "the new
turn must come from the most recent closed turn." So the DB is already
branching-ready. What's missing is:

1. UI for "rewind to turn N"
2. A notion of "current branch" so the world view doesn't get confused
3. A graph visualization (the wireframes had one — `screens-meta.jsx`'s
   timeline-as-graph variant)

## Implementation

### Step 1: current-branch pointer

Right now we treat "the open turn" (no `closed_at`) as the current turn. With
branching, there can be multiple open turns in a world's history — one per
branch. We need a way to know which branch is "active."

Option A: add `worlds.current_turn_id` referencing `turns(id)`. The active
branch is the chain ending at this turn. Mutations only affect this branch.

Option B: add a `turns.branch_id` column; each branch has its own ID and the
world knows which branch is current.

**Recommend A.** Simpler, and the "branch" is implicit in the parent chain
from `current_turn_id`.

### Step 2: rewind endpoint

`POST /api/worlds/[id]/rewind { toTurnId }` (Reality only):
1. Find the closed turn at `toTurnId`.
2. Insert a new turn with `parent_turn_id = toTurnId`, `phase = 'DISCUSSION'`,
   `world_state_snapshot = <that turn's snapshot>`.
3. Set `worlds.current_turn_id` to the new turn.
4. Reset `worlds.current_date` to that turn's `date_at_turn` + timestep
   advancement.

### Step 3: graph UI

A new route, `/world/[id]/branches`, renders the parent-pointer DAG. Each node
is a turn; edges follow `parent_turn_id`. Reality can click any node to
rewind there.

For v1 of branching, a vertical text-tree (à la `git log --graph`) is fine.
The full SVG graph in the wireframe is v3.

## Open design questions

- **Vote & action history**: when you rewind, do the actions/votes from the
  abandoned branch stick around in the DB? Yes — they're attached to that
  branch's turn rows. They're just not visible in the current-branch view.
- **Can players see abandoned branches?** Probably no by default; Reality can
  toggle visibility. ("What did we do in the alternate timeline?")
- **Can you rewind to an open turn?** No — only closed turns are stable
  enough to fork from. If you want to abandon an in-progress turn, the
  cleaner gesture is "close it immediately with no actions" then rewind.
