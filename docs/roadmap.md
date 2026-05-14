# Roadmap

Priority order for the planned features. Each item links to a more detailed
spec in [`features/`](features/). **Most of this is on my own list** — if you
want to contribute, open an issue first so we don't both build the same thing.

## v0.2 — Game-feel essentials

These are features that materially change how the game plays. The current loop
works but feels thin without them.

1. **Forced-response tagging.** The mechanic that makes deliberation
   consequential — you can compel other roles to respond to your action next
   turn. [`features/forced-response.md`](features/forced-response.md)
2. **Delta pills + world state.** Typed `usg-approval ▼` / `ai-cap ▲` markers
   on each action; a sparkline strip at the top of the world view. Without
   this, the game produces no readable summary of "what happened over 10
   turns." [`features/world-state-and-deltas.md`](features/world-state-and-deltas.md)
3. **Phase timers + auto-advance** (or at least visible countdown). Right now
   Reality has to remember to click the advance button. A timer keeps pace.

## v0.3 — Reality quality of life

Once the game runs reliably, the GM screen needs to actually be a cockpit.

4. **GM cockpit upgrades.** Drag-reorder actions during Resolve, kick players
   from seats, edit roles mid-game, adjust phase durations live.
   [`features/gm-cockpit.md`](features/gm-cockpit.md)
5. **Multi-file markdown notebook + sources list per player.** Replaces the
   plain textarea. [`features/notebook-and-sources.md`](features/notebook-and-sources.md)
6. **World templates.** "Start with AI 2027" preset that inserts a curated set
   of roles, an initial world state, and a brief.
   [`features/world-templates.md`](features/world-templates.md)

## v0.4 — Game-design depth

Bigger mechanic experiments. Each of these is a real design decision, not just
a UI build.

7. **Branching / rollback.** Schema is ready; UI is a graph view.
   [`features/branching-and-rollback.md`](features/branching-and-rollback.md)
8. **Secrets between roles.** Per-action visibility — "only USG sees this."
   Changes the whole information model. [`features/secrets-and-visibility.md`](features/secrets-and-visibility.md)
9. **Multi-player-per-role coordination.** Schema allows it; UI needs to handle
   draft-locking or merging. [`features/multi-player-per-role.md`](features/multi-player-per-role.md)

## v1.0 — Hardening

10. **Google OAuth / proper accounts.** Cookies → real identity. Cross-device,
    portable, recoverable.
11. **Phase + role audit log.** Who did what when. Necessary for any "ranked"
    play or post-game review.
12. **Realtime sync via SSE.** Replace 2s polling. Only worth it after a real
    UX complaint.

## What we're not going to build

These have been considered and ruled out for design reasons, not just scope.

- **Auto-extract deltas from prose.** Cool but unreliable; Reality should be
  the one to summarize a turn.
- **Voice clips / video.** The whole point is *not* speeches.
- **Public world directory.** This is a tool for groups who know each other.
  Private join codes are the right shape.
- **Per-role private chat.** If you want secret channels, use Signal. The app
  models *the game*, not the social layer.
