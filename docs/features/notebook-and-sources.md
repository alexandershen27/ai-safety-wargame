# Notebook & sources

> **Status:** Not built. Discussion phase uses a plain textarea.

## What it is

A per-player workspace during the Discussion phase, separate from the action
draft. Two parts:

1. **Notebook** — multi-file markdown editor. Players write thoughts, scratch
   strategies, draft long-form arguments, paste briefings from their role's
   reading. Files persist across turns.
2. **Sources** — a list of `{quote, url, note}` rows. The thing you point at
   when you say "look, here's why this would happen." Persists across turns.

Both are per-player (not per-role). The role brief from
[`world-templates.md`](world-templates.md) goes in a third pinned tab.

## Why we cut it from v0.1

The current single-textarea drafting works. The notebook is a UX
*amplifier* — it makes a 60-minute session feel less rushed because players
have a place to think — but it isn't load-bearing for the game loop.

## Schema

```sql
notebook_files:
  id           TEXT PRIMARY KEY
  world_id     TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE
  player_id    TEXT NOT NULL REFERENCES players(id)
  title        TEXT NOT NULL DEFAULT 'Untitled'
  body         TEXT NOT NULL DEFAULT ''
  position     INTEGER NOT NULL DEFAULT 0
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

sources:
  id           TEXT PRIMARY KEY
  world_id     TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE
  player_id    TEXT NOT NULL REFERENCES players(id)
  quote        TEXT NOT NULL
  url          TEXT
  note         TEXT
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
```

## UI

A left-side rail on the Discussion view, ~280px wide on desktop, collapsible.
Tabs at the top: **Notebook** / **Sources** / **Brief**.

- **Notebook**: file list at top, editor below. Click "+" to add file. Click
  title to rename. Body uses `marked` (already a dependency) for preview.
  Either render-on-the-fly markdown or a tab toggle between Edit / Preview.
- **Sources**: list of cards. "+ Add source" → form with quote + URL +
  optional note. Click a card to copy quote or open URL.
- **Brief**: read-only render of the role's `brief` field from
  `world-templates.md`.

## API

```
GET    /api/notebook?worldId=X            -> all files for this player in this world
POST   /api/notebook { worldId, title? }  -> create file
PATCH  /api/notebook/:id { title, body }  -> update
DELETE /api/notebook/:id                  -> delete (soft? probably not needed)

GET    /api/sources?worldId=X
POST   /api/sources { worldId, quote, url, note }
DELETE /api/sources/:id
```

Same Zod patterns as the rest of the API. Same cookie-player auth.

## Why markdown vs. WYSIWYG

The wireframe README explicitly said "no custom rich-text editor — plain
markdown." Stick with that. Use `marked` for render, a plain `<textarea>` for
edit. A togglable Edit/Preview tab is more than enough — anyone who's used
GitHub knows the model.

## Open design questions

- **Shared with co-occupants?** If three players are seated at USG, do they
  share a notebook? Probably no — keep notebooks per-player even within a
  shared role. A "shared scratchpad per role" could be a separate feature.
- **Carry across worlds?** A player creates a world, joins another — should
  their notebook from world A be visible in world B? No. Notebooks are
  per-world. The same player in two worlds has two separate notebooks.
- **Search?** Probably not v1. If notebooks get big, `LIKE '%query%'` is fine.
