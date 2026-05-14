# Multi-player-per-role

> **Status:** Schema allows it (`seats` is many-to-many). UI just lists co-occupants.

## What it is

Multiple players can occupy the same role. Example: three players seated at
"USG" collectively decide what USG does this turn. They share the role's
draft, vote together (or with one shared vote), and split / merge responsibilities.

## Why it matters

For a club demo or a class, you might have 12 students but only want 4 roles.
Putting 3 students per role lets everyone participate without bloating the
mechanic.

## What's already in place

- `seats` is a many-to-many table (`world_id, role_id, player_id`).
- Lobby UI lists all occupants of a role.
- Either of the two seated players can save the draft / submit / vote — the
  endpoints check seat membership, not exclusivity.

## What's missing

The current "any seated player can save the draft" rule is racy. Two players
typing in the same textarea overwrite each other every 600ms (the autosave
debounce). This is bad even for a one-shot demo.

### Fixes, in order of complexity

**Option 1: One drafter at a time.** A "claim the draft" button. While
claimed, only the claimant can edit; others see read-only. Easy, works,
preserves the schema.

```sql
-- Add to actions:
drafter_player_id   TEXT REFERENCES players(id)
drafter_claimed_at  TEXT
```

UI: "Claim drafting" / "Release" buttons. Auto-release after 60s of
inactivity.

**Option 2: Operational-transform style merge.** Each player edits freely;
the server merges. Heavy — needs Y.js or similar. Don't do this for v1.

**Option 3: Shared write, last-write-wins, explicit lock for submit.**
Drafting is freeform; submitting requires a momentary lock. Middling
complexity. The autosave race remains a problem.

**Recommend Option 1.** Adds two columns and a button. Solves the actual
problem.

### Voting

Three players seated at USG — does USG cast one vote or three?

- **Per-player votes** (current schema): three rows in `votes`, all with the
  same `voter_role_id = USG`. The vote aggregation averages them. This *is*
  more democratic but it muddles the "USG voted X" signal.
- **Per-role vote, last-write-wins**: only one row per (action, role) instead
  of (action, voter_player_id). Whoever votes last for USG sets USG's vote.

The schema currently does per-player. Switching to per-role is a `UNIQUE`
index change. **Default to per-role** once multi-player-per-role becomes a
common case — it's what players expect.

## Open design questions

- Do co-occupants get a private chat / scratchpad to coordinate? The notebook
  feature ([`notebook-and-sources.md`](notebook-and-sources.md)) is per-player;
  consider a per-role shared notebook variant.
- If a player leaves a multi-occupant role mid-game, do drafts they wrote
  persist? Yes — actions are tied to `author_player_id` but visible to all
  occupants. Leaving doesn't delete.
