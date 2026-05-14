# Secrets between roles

> **Status:** `actions.visibility` column exists (always `'public'` for now). No UI.

## What it is

Some actions should only be visible to specific roles. Examples:

- Frontier Cos. quietly start training a new frontier model. Only the USG
  knows (the USG has classified intel).
- CCP funds a research effort. Only the CCP and Chinese AI Cos. see it.
- A safety lab publishes a finding. Everyone sees it. (Default.)

The current `actions.visibility` column is a single string. The minimal v1 is:

```
visibility = 'public'           -- everyone sees
visibility = 'role:<roleId>,<roleId>'  -- only these roles
visibility = 'reality-only'     -- only Reality sees it (e.g. NPC actions)
```

A cleaner model:

```sql
-- New table:
action_visibility:
  action_id   TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE
  role_id     TEXT NOT NULL REFERENCES roles(id)
  PRIMARY KEY (action_id, role_id)

-- And drop the `visibility` column or repurpose it as a default:
actions.visibility = 'public' | 'private'
```

Where `private` means "look in `action_visibility` for who can see it"; the
author's own role is automatically added; Reality always sees everything.

## Why it matters

Secrets transform the game from "everyone discusses everything" into "you need
to model what other players know." That's the actual texture of geopolitics
and the missing piece in a lot of casual scenario games.

## Implementation

### Schema change

Add `action_visibility` table as above. Migration script needed (we don't
have one yet — see [`../architecture.md`](../architecture.md) on Drizzle migrations).

### UI — Action draft (Discussion)
Add a "Visibility" row: `Public` / `Private` toggle. If `Private`, show role
chips to multi-select. Author's own role auto-checked and disabled.

### UI — Vote & Resolve
A vote on an action is itself sensitive: if Frontier votes on a secret CCP
action, that exposure to the voter could leak. Two policies:

- **Policy A (strict):** only roles in the visibility set can vote. Cleanest.
- **Policy B (loose):** anyone can vote but the vote is itself only visible
  to people who can see the action.

**Recommend A.** Simpler model, fewer leak vectors.

### Server-side filter

Every read endpoint that returns actions has to filter by visibility.
Currently `src/lib/world/state.ts` returns all actions in the current turn.
That function becomes:

```ts
const actions = await db.select()...where(
  or(
    eq(actions.visibility, 'public'),
    inArray(actions.id, /* select action_ids visible to currentPlayerId */),
    eq(world.realityPlayerId, currentPlayerId),
  )
);
```

There must be a single source of truth for "what can this player see," and
every endpoint must call it. **This is a load-bearing security boundary** —
not a UI nicety. Don't decide visibility client-side.

## The "history" question

When a turn closes, secret actions go into the history (timeline view). Do
they stay secret forever, or do they become public after N turns? Two
options:

- **Permanent secrecy** — they only appear in the timeline for players who
  could see them at the time.
- **Eventual reveal** — after the game ends or after N turns, the timeline
  shows them to everyone (debriefing model).

**Recommend permanent.** "Eventual reveal" can be a Reality-controlled action
("declassify" button in the timeline view).

## Open design questions

- Can Reality reveal a secret mid-game? (Yes, with a "declassify" button —
  changes visibility from `private` to `public`.)
- Do votes get the same visibility model? Yes — vote rows inherit the
  visibility of the action they're attached to.
- What about secret *deltas*? If a frontier company secretly raises AI
  capability, the world-state metric should change for everyone, but the
  *cause* might be hidden. → Apply deltas always; surface the action only
  to authorized roles. Players see the metric move and have to infer why.
