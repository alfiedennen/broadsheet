# Plan — 0.9.2: things browser as accomplishments, not atoms

**Status**: IMPLEMENTED 2026-05-17 (same-day after 0.9.1 dogfood).
svelte-check clean (513 files, 0 errors, 0 warnings), 292 tests pass
(+22 new in `things-browser.spec.ts`), production build clean. Files
shipped:

- `packages/core/src/lib/blocks/things-browser.ts` — full rewrite.
  `AccomplishmentRecipe` + `BrowserSubGroup` + `BrowserGroup` types;
  per-area recipe generators (lights / TV / speakers / climate /
  switches / locks / cameras / sensors); cross-area buckets (scenes /
  scripts / automations / status / other) dedup'd by entity_id;
  `buildBrowserTree(areas)`, `filterBrowserTree(tree, query)`,
  `countRecipes(tree)`. Plus a separate `EntityPickerItem` +
  `buildEntityPicker` / `filterEntityPicker` for the macro composer
  which needs atomic entities, not pre-composed recipes.
- `packages/core/src/lib/blocks/editor/ThingsBrowser.svelte` —
  rewrite. Renders groups → sub-groups → recipe rows. Tap →
  `onAddRecipe(recipe)`; HTML5 drag carries the full recipe payload
  in `application/x-broadsheet-recipe`. "✓ placed" badge fires when
  every `referencedEntityId` already has a `thing` block on the
  canvas. `▸` glyph marks composed recipes (multi-block), `·` marks
  atomic single-entity recipes.
- `packages/core/src/lib/blocks/editor/ThingsCanvas.svelte` —
  multi-block drop. `handleSeamDrop` parses the recipe payload and
  inserts every block at the drop position via a single atomic
  `onInsertBlocks(index, blocks)` call. Recognises 0.9.1's
  `application/x-broadsheet-entity` MIME as a fallback (graceful
  degradation for any in-flight legacy drag).
- `packages/core/src/lib/blocks/editor/MacroComposer.svelte` — picker
  switched from `buildBrowserTree` to `buildEntityPicker` (the
  composer's UX is atomic-entity-first by design; composing the
  macro IS what produces the composition).
- `packages/core/src/routes/settings/pages/[slug]/+page.svelte` —
  wire-up: `appendBlock`/`insertBlockAt` → `appendBlocks` /
  `insertBlocksAt` (atomic multi-block writes); `onAddRecipe(r)` →
  `appendBlocks(r.blocks)`. Placed-tracking unchanged (still entity-
  id set derived from `thing` blocks).
- `packages/core/tests/unit/things-browser.spec.ts` (new) — 22
  tests covering light/TV/climate/lock recipe generators,
  cross-area dedup, default-collapsed flags, filter behaviour,
  count, and entity-picker shape.

---

**Status (pre-impl)**: LOCKED 2026-05-17 after dogfood of 0.9.1.

User feedback after using 0.9.1 against the live HA install:

> When I look in the living room set, whilst I see tv, speaker, those
> mean nothing. What can I *do* with them? Can I add a 'TV on / OFF'
> button? Great, that's what I want. Can I add a quick 'all lights in
> this space with controls' panel? See what I mean? You are showing
> atomic units, we need "what can I accomplish" units.

The same shape of mistake as 0.9.0 → 0.9.1, one layer in. 0.9.1 fixed
"the editor asks me to pick a block primitive when I think in things";
0.9.2 fixes "the browser shows me HA entities when I think in
accomplishments".

**Sequence**: 0.9.2 lands between 0.9.1 (things-first editor) and the
previously-planned 0.9.2 work which is now reslotted to **0.9.3**
(`docs/plans/plan-9.3-lovelace-import-layout.md` — row + grid
primitives + Lovelace import landing in the canvas).

---

## Why the current shape is wrong

The 0.9.1 things browser shows entities grouped by area + cross-area
buckets. Each row is one HA `entity_id`. The user sees:

```
▼ Living Room
   ○ Living Room Pendant       light
   ○ Living Room TV            media_player
   ○ Living Room TRV           climate
   …
```

This is HA's mental model — atoms organised by where they live. But
the user's mental model is a list of jobs they want done on the wall:

- "Turn on / off the TV"
- "Toggle all the lights in here"
- "Open the cinema scene"
- "Boost the heating to 21°"
- "Show me the lights as a panel I can dim individually"

Tapping a single entity gives them ONE answer (a thing-block, auto-
widget). But "all lights" or "all heating" or "TV on" require
composition — and the user has no signpost that those are possible.
The browser is failing to surface broadsheet's most useful capability.

---

## The new shape: accomplishments first

Replace `BrowserThing` (one entity) with `AccomplishmentRecipe` (one
named verb that produces ≥1 blocks). Each recipe knows:

- `id` — stable identifier (for placed-tracking)
- `title` — verb phrase ("All Living Room lights — off")
- `description` — optional helper subtitle ("1-tap macro: turn off 3
  lights")
- `icon` — `mdi:*` for the row
- `blocks: BlockDef[]` — what lands on the canvas when the recipe is
  added (1 block for atomic recipes, N for compositions)
- `referencedEntityIds: string[]` — which entities this recipe touches
  (drives the "✓ placed" badge across all rows that reference the
  same underlying entity)

Each area's group splits into sub-groups (Lights / TV / Climate /
Locks / Cameras / Sensors / Other), each sub-group leads with the
composed accomplishments, then lists the individual atomic entities
below (per the user's "below the verbs, same group" decision).

Example tree:

```
▼ Living Room
   ┌─ Lights ─────────────────────────────────
   │  ▸ Living Room lights — panel             ← drops a section + 1 thing per light
   │  ▸ Living Room lights — off               ← drops a 1-tap macro tile
   │  ▸ Living Room lights — toggle            ← drops a 1-tap macro tile
   │  · Living Room Pendant                    ← individual thing
   │  · Library Floor Lamp
   │  · Library Table Lamp
   ├─ TV ─────────────────────────────────────
   │  ▸ Living Room TV — full remote           ← drops a thing (widget=media-tv)
   │  ▸ Living Room TV — power toggle          ← drops a thing (widget=toggle)
   │  ▸ Living Room TV — turn on               ← drops a 1-tap macro
   │  ▸ Living Room TV — turn off              ← drops a 1-tap macro
   ├─ Climate ────────────────────────────────
   │  ▸ Living Room heating — boost to 21°     ← drops a macro across all TRVs
   │  · Living Room TRV                        ← individual
   ▼ Scenes (cross-area)
   ┌─ Scenes ─────────────────────────────────
   │  ▸ Activate Cinema scene
   │  ▸ Activate Warm Evening scene
   │  …
```

The `▸` symbol marks composed recipes (verbs); `·` marks atomic
single-entity recipes (still recipes, just with one block).

---

## Recipe generators — full enumeration

Per-area recipes (only emitted when the relevant bucket is non-empty):

### Lights sub-group

- Composed (only when area has ≥ 2 lights):
  - **`<area> lights — panel`** → `outline` + N `thing` blocks (one per light)
  - **`<area> lights — off`** → 1 `macro` with N `light.turn_off` steps
  - **`<area> lights — toggle`** → 1 `macro` with N `light.toggle` steps
- Atomic (always, one per light):
  - **`<light name>`** → 1 `thing` block, widget=auto

### TV sub-group (`area.tvs`)

For each TV entity:
- **`<TV name> — full remote`** → 1 `thing`, widget=`media-tv`
- **`<TV name> — power toggle`** → 1 `thing`, widget=`toggle`
- **`<TV name> — turn on`** → 1 `macro` (1 step: `media_player.turn_on`)
- **`<TV name> — turn off`** → 1 `macro` (1 step: `media_player.turn_off`)

### Media sub-group (`area.media` — non-TV)

For each speaker / non-TV media entity:
- **`<speaker name> — full control`** → 1 `thing`, widget=`media-speaker`
- **`<speaker name> — play / pause`** → 1 `macro` (1 step)
- **`<speaker name> — turn on`** → 1 `macro`
- **`<speaker name> — turn off`** → 1 `macro`

### Climate sub-group (`area.climates`)

- Composed (only when area has ≥ 2 TRVs):
  - **`<area> heating — boost to 21°`** → 1 `macro` with N
    `climate.set_temperature` steps (target 21°)
  - **`<area> heating — off`** → 1 `macro` with N `set_temperature`
    steps at 5° (frost-safe setback)
- Atomic per TRV:
  - **`<TRV name>`** → 1 `thing`, widget=`climate`

### Switches sub-group (`area.switches` — non-lighting)

For each switch:
- **`<switch name>`** → 1 `thing`, widget=`toggle`

### Locks sub-group (`area.locks`)

For each lock:
- **`<lock name> — unlock`** → 1 `macro` (1 step: `lock.unlock`)
- **`<lock name> — status tile`** → 1 `thing`, widget=`lock`

### Covers sub-group (`area.covers` if available)

For each cover:
- **`<cover name> — open`** → 1 `macro`
- **`<cover name> — close`** → 1 `macro`
- **`<cover name> — tile`** → 1 `thing`, widget=`cover`

### Cameras sub-group (`area.cameras`)

For each camera:
- **`<camera name> — snapshot tile`** → 1 `thing`, widget=`camera`

### Sensors sub-group (`area.sensors`)

For each ambient sensor:
- **`Show <sensor name>`** → 1 `thing`, widget=`value-pill`
  (deliberately phrased as a verb — read-only is still an
  accomplishment, "show me this number on the wall")

### Cross-area buckets

The 0.9.1 cross-area buckets stay (scenes / scripts / automations /
status / other) but each row becomes a recipe:

- **Scenes**: `Activate <scene>` → 1 `thing`, widget=`fire`
- **Scripts**: `Run <script>` → 1 `thing`, widget=`fire`
- **Automations**: `Trigger <automation>` → 1 `thing`, widget=`fire`
- **Status sensors**: `Show <sensor>` → 1 `thing`, widget=`value-pill`
  or `state-pill`
- **Other** (input_select / input_number / person): `Pick <name>` → 1
  `thing`, widget=`pick`

---

## Component changes

### `things-browser.ts` — full rewrite of data model

```ts
export interface AccomplishmentRecipe {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  blocks: BlockDef[];
  referencedEntityIds: string[];
}

export interface BrowserSubGroup {
  id: string;          // `${groupId}/${slug}`
  label: string;       // 'Lights', 'TV', 'Climate', …
  recipes: AccomplishmentRecipe[];
}

export interface BrowserGroup {
  id: string;
  label: string;
  defaultCollapsed: boolean;
  subGroups: BrowserSubGroup[];
}
```

New top-level helpers:
- `buildBrowserTree(areas: DomainArea[]): BrowserGroup[]`
- `filterBrowserTree(tree: BrowserGroup[], query: string): BrowserGroup[]`
  — filter matches recipe title / description / referenced entity_ids /
  area name / sub-group label

### `ThingsBrowser.svelte` — render the new shape

Render groups → sub-groups → recipes. Sub-group headers when a group
has > 1 sub-group; otherwise recipes render flat under the group.

Tap → `onAddRecipe(recipe)`. Drag → DataTransfer carries
`application/x-broadsheet-recipe` with the recipe's id (canvas
re-resolves the recipe from the tree on drop — recipe payloads are
serialisable but small, so we serialise the whole recipe).

`placedIds: Set<string>` stays an entity-id set. A recipe shows the
"✓ placed" badge iff ALL its `referencedEntityIds` are already on
the canvas. For atomic recipes this is the same single-entity check
as 0.9.1.

### `ThingsCanvas.svelte` — accept multi-block drops

`handleSeamDrop` parses the recipe payload and inserts every block
in order at the drop position. Internally calls a new
`onInsertBlocks(index, blocks)` prop on the canvas (parent provides),
which does ONE `setCustomPageBlocks(slug, [...before, ...blocks, ...after])`
rather than N sequential mutations (atomic write + single re-render).

### `[slug]/+page.svelte` wire-up

- Replace `appendBlock(block)` with `appendBlocks(blocks: BlockDef[])`
- Replace `insertBlockAt(index, block)` with
  `insertBlocksAt(index, blocks: BlockDef[])`
- Add `onAddRecipe(recipe)` that calls `appendBlocks(recipe.blocks)`
- `placedThingIds` derivation unchanged (still entity-id set from
  every `thing` block on the canvas)

---

## Tests

- `tests/unit/things-browser.spec.ts` (new):
  - `buildBrowserTree` emits per-area groups + cross-area buckets
  - per-area group with 2+ lights emits the composed panel + off +
    toggle recipes
  - per-area group with 1 light does NOT emit the composed recipes
    (just the atom)
  - TV recipes generate full-remote + power-toggle + on + off
  - climate ≥ 2 emits boost-to-21
  - cross-area scenes / scripts each become individual recipes
  - filter matches recipe title + entity_id + area name
- `tests/unit/blocks.spec.ts` (extend):
  - placed-ids tracking via recipe.referencedEntityIds

---

## Sequenced implementation

1. **Data model** (`things-browser.ts` full rewrite): types +
   per-area recipe generators + cross-area + filter.
2. **`ThingsBrowser.svelte`**: render groups → sub-groups → recipes;
   new tap + drag handlers; placed-tracking by referencedEntityIds.
3. **`ThingsCanvas.svelte`**: multi-block drop handler.
4. **Settings page wire-up**: `appendBlocks` / `insertBlocksAt`
   helpers; `onAddRecipe` callback; placed-tracking unchanged
   (entity-id set from `thing` blocks on the canvas).
5. **Tests**: things-browser.spec.ts + extend blocks.spec.ts.
6. **Ship gates**: svelte-check 0 errors / 0 warnings, all tests
   pass, production build clean.
7. **Plan flip** to IMPLEMENTED + BUILD-LOG entry.
8. **Deploy**: commit SPA + bump addon 0.9.1 → 0.9.2 + push both +
   `ha store reload && ha addons update 68fa04fc_broadsheet`.
