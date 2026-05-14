# GM cockpit (Reality View extensions)

> **Status:** Reality has a Start button and the Resolve screen. Nothing else.

## What it is

A set of Reality-only powers to keep the game flowing. Most of these are tiny
individually; together they're what makes the difference between "the app
runs" and "the app is GM-able."

## The list

1. **Drag-reorder during Resolve.** Currently actions appear in submission
   order. Reality should be able to drag them to whatever narrative order
   makes sense. `actions.resolution_order` column already exists.

2. **Edit phase durations live.** Reality is in the middle of voting and
   realizes 5 minutes is too short. They should be able to bump the timer
   from 5 → 10 minutes without restarting. This requires
   [`features/world-state-and-deltas.md`](world-state-and-deltas.md)'s
   companion piece — visible phase timers (currently not built).

3. **Add a role mid-game.** Halfway through, a new mechanic emerges that needs
   its own actor (say, "the AI" awakens). Reality clicks "Add role" in the
   GM cockpit → fills name + color → the role appears in the lobby for
   players to seat. Existing seats unchanged.

4. **Edit a role's name/color/brief mid-game.** Just renaming, etc. Already
   trivial — just expose the editor.

5. **Kick a player from a seat.** Sometimes someone has to leave. Reality
   removes them; the seat opens up.

6. **Override a resolution.** Reality realized they were wrong about how
   something resolved. Edit the `resolved_text` of a closed action in the
   timeline. Audit-log the edit so players can see "Reality changed this on
   <date>." (Audit log is a separate v1.0 feature; for now, just edit.)

7. **Manually advance turn date.** "Skip 6 months." Edit
   `worlds.current_date` directly. Useful for scenarios with long gaps.

8. **Pause / unpause.** Set `worlds.status = 'paused'`. UI shows a banner;
   phase advance is blocked.

9. **NPC actions on behalf of a role.** Reality drafts and submits an action
   *for* an unseated role. Author is the Reality player; role is the NPC
   role. (Cheap to add — just allow Reality to bypass the seat check on
   action draft/submit.)

## Implementation notes

- Most of these are *new endpoints* on existing tables. No schema migrations
  for items 1, 2, 4, 5, 6, 7, 8, 9.
- Adding a role mid-game (item 3) is `INSERT INTO roles` — already works.
  Just expose a UI on the world page.
- Drag-reorder uses the `resolution_order` column on `actions`. Save order on
  drag-stop.

## Why we built none of it for v0.1

Each item is small but they add up to a sizable UI. The v0.1 cut is "everything
in the game loop works, even if Reality has to be a little patient." A demo
with 4–6 players in a 60-min slot doesn't need most of these.

## UI shape

A right-side "GM panel" on every world page, collapsible, visible only to
Reality. Sections:

- **Phase controls** — advance, pause, override timer
- **Roles** — add, edit, reorder
- **Players** — list with kick buttons
- **NPC** — quick "act as X" composer

Goes in `src/app/world/[id]/GmPanel.tsx` (to be created), embedded in
`WorldShell.tsx` when `view.isReality`.
