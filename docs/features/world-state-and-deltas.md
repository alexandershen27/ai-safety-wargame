# World state & delta pills

> **Status:** Schema exists (`worlds.world_state`, `actions.deltas`). UI and
> aggregation logic missing. **High priority for v0.2.**

## What it is

Two related ideas:

1. **Delta pills on actions.** Typed mini-tags attached to a submitted action,
   like `usg-approval ▼` or `ai-capability ▲▲`. They make the *intent* of an
   action legible without reading the prose. Author picks them when drafting;
   they show up on the action card during vote and resolve.

2. **World metric strip.** A horizontal sparkline strip above the world view
   showing 4–8 metrics (USG Approval, AI Capability, Treaty Index, etc.) with
   current value + delta from last turn + a 10-point sparkline. This is the
   "always-visible state of the world" the original wireframe called for.

The two connect: when Reality resolves an action, the deltas attached to that
action get folded into the world state, which propagates to the metric strip
on the next turn.

## Why it matters

Without these, a 10-turn game produces 60–80 paragraphs of resolution text and
zero structured summary. Players can't *see* whether the AI Safety lobby is
winning or losing. The metric strip turns a wargame into a system-dynamics
sandbox.

## The freedom problem

The wireframe assumed a fixed set of metrics (USG Approval, AI Capability,
etc.). For a *general* sandbox, metrics have to be per-world. Two designs:

### Design A: Reality declares metrics upfront

Add a step to world creation: "What metrics should this world track?"
Reality enters a list of `{name, initial value, min, max}`. Stored as JSON in
`worlds.world_state`:

```json
{
  "metrics": [
    {"key": "usg-approval", "label": "USG Approval", "value": 44, "min": 0, "max": 100, "history": [50, 49, 48, ...]},
    {"key": "ai-capability", "label": "AI Capability", "value": 68, "min": 0, "max": 100, "history": [55, 57, ...]}
  ]
}
```

Action deltas reference metric keys: `[{"metric": "usg-approval", "direction": "dn", "magnitude": 2}]`.

Pros: structured, sparkline-ready, comparable across turns.
Cons: forces Reality to predict the metrics they'll need.

### Design B: Free-form deltas, post-hoc clustering

Authors just write free strings: `"usg approval down"`, `"frontier revenue up"`.
The app shows them as pills but doesn't aggregate. World state stays empty.

Pros: zero friction, captures whatever language emerges.
Cons: no sparkline, no readable summary.

### Recommendation

**Hybrid.** Default to Design A with a template. World creation has a "Metrics"
section with sensible defaults for AI-safety worlds, removable + extensible.
Reality can also add new metrics mid-game (it's just inserting into a JSON
array). Templates ([`world-templates.md`](world-templates.md)) seed this.

## The fold function

The deterministic kernel that produces world state from a sequence of resolved
actions. Lives in `src/lib/world/fold.ts` (to be created):

```ts
export function fold(
  prev: WorldState,
  resolvedActions: ResolvedAction[],
): WorldState
```

v1 implementation: for each action, for each delta, add `±magnitude` to the
referenced metric, clamp to `[min, max]`, append to history.

This function **must be pure**. It's the most testable piece in the codebase
and the single biggest source of "what just happened" truth. Table-driven
unit tests are mandatory before merging.

Wire into `src/app/api/worlds/[id]/advance/route.ts` inside the `CLOSED` branch:
1. Read the closing turn's resolved actions.
2. `next = fold(world.worldState, resolvedActions)`.
3. Write `worlds.world_state = JSON.stringify(next)`.
4. Snapshot it onto the *new* turn's `world_state_snapshot`.

## UI

### Action card (Discussion)
Below the textarea, a "deltas" row. Click "+ delta" → pick a metric from the
world's metrics list → pick direction (up / down / neutral) → optional
magnitude (1–3 ticks). Pills appear on the card.

### Action card (Vote)
Same pills, read-only. Voters factor deltas into their likelihood rating.

### Action card (Resolve)
Reality sees the proposed deltas. Reality can **edit** them — the resolved
deltas are what actually fold, not what the author proposed. (This is
important: Reality narrating "the law passed but enforcement was lax" might
change the deltas.)

### Metric strip
Above the Ribbon, below the Topbar. One mini-card per metric: label, current
value, delta from last turn (green/red), 10-point sparkline. Already designed
in the wireframe — see `src/lib/world/state.ts` for how to read.

## Open design questions

- Should magnitude be 1–3 ticks (simple) or numeric (1–100)? Recommend ticks.
- Should the fold be linear (sum deltas) or have interactions ("if AI
  Capability > 80, USG Approval drops every turn")? Linear v1; interactions
  later.
- Do we expose the fold function to Reality as editable rules? Probably not
  — keep it pure code, evolve via PRs.
