# Wargame

A general-purpose **scenario-modeling sandbox**. One person ("Reality") creates
a world with custom roles and a timestep; the rest join with a code. Each turn
cycles through **Discussion → Resolve → Close**, the date advances, and the
next turn begins. The data model is generic — AI safety is one scenario among
many.

## What works

- **Create / join a world.** Reality sets roles (name + color), start date,
  and timestep (day/week/month/year × N). Everyone else joins with a 6-char
  code. Cookie-based identity, no login.
- **Phases.** `DISCUSSION → RESOLVE → CLOSED`. Drafting and voting both
  happen in DISCUSSION; once you've submitted every action you owe, you see
  others' submissions and can vote on them. Reality writes resolutions and
  picks success / partial / fail per action in RESOLVE. Close advances the
  date by one timestep and opens the next turn.
- **Skip an action.** Submitting an empty draft commits it as "no action this
  turn" — no resolution required.
- **Co-seats.** Multiple players can sit at the same role; first to submit
  locks the role for the turn.
- **Manage roles mid-game.** A `⋯ Roles` menu in the shellbar lets anyone
  join or leave any role at any time. Leaving your last seat drops you to
  spectator.
- **Branch graph.** Every closed turn can be forked with "Resolve
  Differently" — creates a sibling turn with the original resolutions
  pre-filled. Branches are visible on a horizontal SVG graph; Reality can
  jump between leaves with "Switch here" or discard a provisional fork with
  "Cancel branch."
- **T0 boot turn.** Worlds start with a closed T0 at `start_date`; the first
  playable turn is T1, one timestep later. T0 acts as the shared parent so
  forks of T1 render under a real root.
- **Delete worlds.** Reality only. Cascades through everything.

The sync model is 2s polling, with push-style refresh after every local
mutation and an abort-on-mutation guard so in-flight stale polls can't
flicker old state back over a click.

## Roadmap

Roughly in priority order. None of this is committed.

- **Delta pills + world-state strip.** Typed `usg-approval ▼` /
  `ai-cap ▲` markers on each action; a sparkline strip across the top so a
  10-turn run leaves a readable summary.
- **Forced-response tagging.** Tag another role on your action → they get a
  required extra slot next turn (or write "no response"). Schema columns
  exist; no UI yet.
- **Phase timers + auto-advance.** Reality currently has to remember to
  click the advance button.
- **Per-player notebook + sources panel.** Multi-file markdown scratchpad
  with a sources list. Replaces the textarea-as-scratch model.
- **World templates.** "Start with AI 2027" presets that seed roles +
  initial world state + a brief.
- **Secrets between roles.** Per-action visibility — "only USG sees this."
  Changes the information model.
- **Real accounts.** Cookie identity → OAuth, cross-device.

## Not building

- Auto-extracting deltas from prose. Reality summarizes; that's the job.
- Voice / video.
- Public world directory. Private join codes are the right shape.
- Per-role private chat. Use a separate messenger; the app models the game,
  not the social layer.
