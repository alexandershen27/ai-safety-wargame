# World templates

> **Status:** Not built. Schema is fully ready (everything is already row-based).

## What it is

Presets that seed a new world with a curated set of roles, initial world
state, metric definitions, and a starting brief. Reality picks a template at
world creation instead of building it from scratch.

Examples:
- **AI 2027** — starts January 2027, matches the AI 2027 forecast's roles +
  capability timeline as starting conditions.
- **Climate 2050** — international climate diplomacy. UNFCCC parties, major
  emitters, NGOs.
- **Pandemic Tabletop** — WHO, national CDCs, pharma, public-facing media.
- **Blank** — exactly what we have today.

## Why it's cheap to build

Because the architecture rule from day one was "everything dynamic is a row,
not a constant," a template is *literally* a JSON file that gets inserted as
rows when Reality picks it. No code paths need to know "this is the AI 2027
world." It's just data.

## Implementation

### Template format

```ts
// src/lib/templates/types.ts
export type WorldTemplate = {
  id: string;                    // 'ai-2027'
  name: string;                  // 'AI 2027'
  description: string;           // markdown blurb shown in the picker
  defaults: {
    startDate: string;           // '2027-01-01'
    timestepUnit: 'month' | 'week' | 'year' | 'day';
    timestepAmount: number;
    phaseDurations: { discussion: number | null; vote: number; resolve: number | null };
  };
  roles: Array<{
    name: string;
    color: string;
    brief: string;               // markdown — visible to seated players
  }>;
  metrics: Array<{
    key: string;
    label: string;
    value: number;
    min: number;
    max: number;
  }>;
};
```

### Files

```
src/lib/templates/
├── types.ts
├── index.ts              # exports `TEMPLATES: WorldTemplate[]`
├── blank.ts
├── ai-2027.ts
├── climate-2050.ts
└── pandemic.ts
```

### Wiring

1. **World creation form** (`src/app/world/new/CreateWorldForm.tsx`): add a
   template picker at the top. Picking one prefills the form with the
   template's defaults. User can then edit anything before submitting.
2. **API** (`src/app/api/worlds/route.ts`): no change needed if the template
   just becomes part of the payload. Optionally accept a `templateId` and
   resolve server-side so prefilled defaults can't be tampered with — but
   honestly, this is Reality, they can do what they want.
3. **Metrics seeding**: insert the template's metrics into
   `worlds.world_state.metrics` at creation. Once
   [`world-state-and-deltas.md`](world-state-and-deltas.md) is built, this
   gives every template a working metric strip.

## Open questions

- **Briefs**: should role briefs be visible to *all* players, or only the
  player seated in that role? Default: visible to seated players + Reality.
  Spectators see nothing.
- **Capabilities timeline** (AI 2027 specific): the source forecast has a
  notion of "by turn N, model size is X, capability score is Y." We can model
  this as an auto-applied delta sequence on each turn close. Worth a
  conversation before building.
- **Community templates**: at some point, users will want to share templates.
  v1: JSON paste-in. v2: a small public registry. Out of scope for the initial
  implementation.
