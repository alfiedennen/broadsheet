# Plan — 0.9.3: composite area-panels + inline plugin blocks

**Status**: IMPLEMENTED 2026-05-17 (same-day after 0.9.2 dogfood).
svelte-check clean (517 files, 0 errors, 0 warnings), 306 tests
pass (+14 new across `things-browser.spec.ts` + `blocks.spec.ts`),
production build clean. Files shipped:

- **Plugin contract** (`packages/core/src/lib/plugins/types.ts`):
  added `extraBlocks?: PluginBlockContribution[]` (optional —
  FROZEN-at-v0.1 contract preserved) + `PluginBlockContribution`
  + `PluginRecipeSuggestion` + `PluginRecipePlacement` +
  `PluginBlockHostContext` + the stable string key
  `PLUGIN_BLOCK_HOST_CONTEXT_KEY = 'broadsheet:plugin-block-host'`
  so plugin block renderers can read curation + discovery via
  Svelte's `getContext` without a runtime import of core. Public
  re-exports from `@broadsheet/core` updated.
- **Plugin loader** (`loader.svelte.ts`): `activePluginBlocks` $derived
  flattens `extraBlocks` from every active plugin; `pluginBlockByType(t)`
  resolves a single contribution by type id. Both are reactive on
  the registry — enable/disable a plugin and downstream `$derived`
  consumers re-fire.
- **Block registry** (`registry.ts`): renamed REGISTRY → CORE_REGISTRY;
  `blockRenderer(type)` now consults core first, falls through to
  `pluginLoader.pluginBlockByType(type)`. Plugin block types are
  colon-prefixed (`tmdb-tv:rows`) so collisions are impossible.
  `BLOCK_META` extended with the three new core types.
- **Three new core block types** (`types.ts`):
  `AreaLightsPanelBlockConfig`, `AreaClimatePanelBlockConfig`,
  `AreaMediaPanelBlockConfig`. Each is just `{ areaId, label? }`.
  Added to `BlockDef` union + `defaultBlockConfig` factory.
- **Three new renderers** in `packages/core/src/lib/blocks/renderers/`:
  `AreaLightsPanelBlockRenderer.svelte`,
  `AreaClimatePanelBlockRenderer.svelte`,
  `AreaMediaPanelBlockRenderer.svelte`. Each reads
  `discovery.byAreaId(config.areaId)` reactively, renders one
  `ThingBlockRenderer` per entity in the relevant bucket; grows +
  shrinks with discovery; renders a friendly "area not found" /
  "no entities" placeholder when the area is missing or empty.
- **Things-browser recipe refactor** (`things-browser.ts`):
  "panel" recipes now emit ONE composite block instead of
  `outline + N thing blocks`. Added `<area> heating — panel` (new)
  + `<area> media — panel` (new). New `slotPluginRecipe` engine +
  `liftPluginSuggestion` lifter; `buildBrowserTree(areas, pluginBlocks?)`
  walks every contribution's `suggestRecipes` (cheap snapshot
  built locally; full snapshot threading via Svelte context for
  the renderer) and slots returned suggestions into the right
  per-area sub-group or cross-area bucket. The `components`
  bucket is lazy-created the first time a plugin lands there. A
  misbehaving plugin (`suggestRecipes` throws) is caught with a
  console.warn — never crashes the browser.
- **`ThingsBrowser.svelte`** wires `pluginLoader.activePluginBlocks`
  into the tree builder; reactive on plugin enable/disable.
- **`RenderedPage.svelte`** publishes the `PluginBlockHostContext`
  via `setContext(PLUGIN_BLOCK_HOST_CONTEXT_KEY, ...)` — every
  block descendant (core OR plugin-contributed) can read curation +
  discovery via `getContext`. The host object is GETTER-shaped so
  Svelte 5 reactivity flows through.
- **`@broadsheet/tmdb-tv`** (proof contribution): version bumped to
  0.2.0; declares one `extraBlocks` entry (`tmdb-tv:rows`) with
  `suggestRecipes` that returns one recipe per area with TVs.
  New `RowsBlock.svelte` wraps the existing `ContentRows.svelte`
  renderer, reads `curation.integrations.tmdb` via the host context
  (no runtime core import — types only).

Tests added (+14, total now 306 across 16 files):
- `things-browser.spec.ts`: panel-routing-to-composite, climate
  panel, mixed-media panel, single-TV no-panel guard, plugin
  recipe slotting into named sub-group, lazy `components` bucket
  creation, missing-placement-target graceful drop, throwing-
  `suggestRecipes` graceful catch, omitted-`suggestRecipes`-OK.
- `blocks.spec.ts`: the three new area-panel types in
  `ALL_BLOCK_TYPES`, in the `defaultBlockConfig` enumeration loop,
  with per-block invariant tests (empty `areaId` is the deliberate
  default).
- `fresh-curation.spec.ts`: block-type-count bumped 13 → 16.

Plugin contract is FROZEN-at-v0.1 still preserved: every existing
field unchanged, only new OPTIONAL fields added.

Deferred to 0.9.4 (`docs/plans/plan-9.4-lovelace-import-layout.md`):
`row` + `grid` primitives + Lovelace import landing in things-first
canvas with masonry + coverage report.

---

**Status (pre-impl)**: LOCKED 2026-05-17 after dogfood of 0.9.2.

User feedback:

> Really good, the only thing missing would be to add any components
> already built. For example I don't really want an on button for the
> tv, I want the remote. If I want the remote, I might also want to
> add the TMDB component. If I want to add all lights in a room, I
> want a component if it exists, not a bunch of single bulbs, etc.

Two related misses 0.9.2 left on the table:

1. **"Panel" recipes drop atoms welded by the editor, not a single
   component.** Today "Living Room lights — panel" drops
   `outline + N thing blocks`. The user has to delete N tiles to
   remove the panel, and the panel doesn't grow when they add a 5th
   light to the area. A panel should be ONE block that internally
   enumerates the entities at render-time.
2. **Plugin renderers are page-bound.** TMDB rows live at `/tv`,
   Emanations paintings at `/emanations/here`, Ghost Cloud at
   `/emanations/<room>`. There's no way to drop the TMDB rows on the
   same wall surface as a TV remote, even though every piece needed
   already exists.

**Sequence**: 0.9.3 = this work. The previously-planned 0.9.3
(row + grid primitives + Lovelace import landing) is reslotted to
**0.9.4** (`docs/plans/plan-9.4-lovelace-import-layout.md`).

---

## Two changes that compose

### A. Composite area-panel blocks (core)

Three new core block types, each takes an `areaId` and renders an
inline grid of one widget per entity in that area at render-time.
ONE block, atomic drop, atomic remove, grows + shrinks with discovery:

| Block type | Renders | Recipe verb |
|---|---|---|
| `area-lights-panel` | One toggle per light in the area | `<area> lights — panel` |
| `area-climate-panel` | One climate tile per TRV in the area | `<area> heating — panel` |
| `area-media-panel` | TV remote(s) + speaker(s), each with the right widget | `<area> media — panel` |

Each block reads `discovery.byAreaId(config.areaId)` at render time;
no enumeration is baked into the block config (just the `areaId`).
This means:
- Adding a new light → it appears in the panel automatically
- Hiding a light via curation → it disappears
- Removing the panel = one canvas operation, one undo

The 0.9.2 "panel" recipes refactor to emit ONE composite block
instead of `outline + N thing blocks`. The atomic recipes (one row
per individual entity) stay below — for users who want fine-grained
per-tile placement.

### B. Plugin block contributions (contract extension)

Add ONE optional field to the FROZEN plugin contract:

```ts
export interface BroadsheetPlugin {
  // …all existing fields unchanged…

  /**
   * Block types this plugin contributes. Each gets merged into the
   * block registry at runtime + (optionally) surfaced as recipes in
   * the things-first browser via `suggestRecipes`.
   */
  extraBlocks?: PluginBlockContribution[];
}
```

Each `PluginBlockContribution` declares a block type id (plugin-id-
prefixed: `tmdb-tv:rows`, `emanations:painting`), a lazy renderer
thunk, a default config, and an optional `suggestRecipes(discovery)`
that places the block as a recipe in specific sub-groups.

The block registry's `blockRenderer(type)` now consults the static
core REGISTRY first, then falls through to `pluginLoader.
activePluginBlocks` for plugin-contributed types. The things-browser
walks every active plugin's `suggestRecipes` and slots returned
recipes into the right per-area or cross-area buckets.

**`@broadsheet/tmdb-tv`** is the proof case for v0.1 of the contract:
declares one block (`tmdb-tv:rows`) that wraps the existing
`ContentRows.svelte` renderer (reads `curation.integrations.tmdb`
the same way the `/tv` page does). `suggestRecipes` returns one
recipe per area that has TVs, placed under that area's `tvs` sub-
group as `"<area> TV — TMDB show & movie rows"`.

Emanations + Ghost Cloud are good candidates for follow-up
contributions; not required for 0.9.3 to ship, but the contract is
ready when they want to.

---

## Recipe shape after 0.9.3

Living Room sub-tree (example install with 3 lights + 1 TV + 1 TRV):

```
▼ Living Room
   ┌─ Lights ─────────────────────────────────
   │  ▸ Living Room lights — panel        ← 1× area-lights-panel block
   │  ▸ Living Room lights — off          ← 1× macro
   │  ▸ Living Room lights — toggle       ← 1× macro
   │  · Living Room Pendant
   │  · Library Floor Lamp
   │  · Library Table Lamp
   ├─ TV ─────────────────────────────────────
   │  ▸ Living Room TV — full remote      ← 1× thing (widget=media-tv)
   │  ▸ Living Room TV — TMDB rows        ← 1× tmdb-tv:rows  ← NEW (plugin)
   │  ▸ Living Room TV — power toggle
   │  ▸ Living Room TV — turn on
   │  ▸ Living Room TV — turn off
   ├─ Climate ────────────────────────────────
   │  ▸ Living Room heating — panel       ← 1× area-climate-panel  ← NEW
   │  · Living Room TRV
```

A user building a wall surface for the living-room sofa:

1. Tap **TV — full remote** → remote tile lands
2. Tap **TV — TMDB rows** → poster rows land beneath
3. Tap **lights — panel** → all-lights tile lands
4. Tap **heating — panel** → all-TRVs tile lands

Four taps. Four blocks. The wall renders the remote + browse rows +
inline light controls + inline heat controls. No section dividers
to drag, no atom-by-atom assembly, no "wait, where do I add TMDB?"

---

## Sequenced implementation

1. **Plugin contract extension** (`packages/core/src/lib/plugins/types.ts`):
   `extraBlocks?: PluginBlockContribution[]` + `PluginBlockContribution`
   + `PluginRecipeSuggestion` + `PluginRecipePlacement` types. All
   additive + optional — the FROZEN contract stays intact.
2. **Plugin loader exposes `activePluginBlocks`**
   (`packages/core/src/lib/plugins/loader.svelte.ts`): a `$derived`
   array that flattens `extraBlocks` from every active plugin. The
   block registry consults it on lookup.
3. **Block registry dynamic lookup** (`packages/core/src/lib/blocks/registry.ts`):
   `blockRenderer(type)` checks core REGISTRY first, then plugin
   blocks via the loader. `ALL_BLOCK_TYPES` becomes a `$derived`
   that includes plugin block types.
4. **Three new core block types** in `packages/core/src/lib/blocks/types.ts`:
   `AreaLightsPanelBlockConfig`, `AreaClimatePanelBlockConfig`,
   `AreaMediaPanelBlockConfig` (all just `{ areaId, label? }`) +
   union members + `defaultBlockConfig` cases.
5. **Three new renderers** in `packages/core/src/lib/blocks/renderers/`:
   `AreaLightsPanelBlockRenderer.svelte`,
   `AreaClimatePanelBlockRenderer.svelte`,
   `AreaMediaPanelBlockRenderer.svelte`. Each reads
   `discovery.byAreaId(config.areaId)` and renders a grid of
   `ThingBlockRenderer` instances per entity.
6. **Refactor things-browser recipes**: the "panel" recipes now
   emit ONE composite block instead of `outline + N thing blocks`.
   Add new `<area> heating — panel` and `<area> media — panel`
   recipes (didn't exist in 0.9.2). The atomic per-entity recipes
   stay.
7. **Things-browser plugin walk**: after building per-area sub-
   groups, iterate `activePluginBlocks` and call each contribution's
   `suggestRecipes(discoverySnapshot)`; slot returned recipes into
   the right sub-groups by `placement`.
8. **`@broadsheet/tmdb-tv` block contribution**: add `extraBlocks: [{
   type: 'tmdb-tv:rows', … suggestRecipes: discovery =>
   areas.filter(a => a.tvs.length).map(area => recipe) }]`. New
   renderer `RowsBlock.svelte` that wraps `ContentRows.svelte` with
   curation-fed props.
9. **Tests**:
   - extend `tests/unit/things-browser.spec.ts` with panel-routing
     + plugin-recipe-walker tests
   - new `tests/unit/blocks.spec.ts` cases for the area-panel
     block defaults
   - ship gates: svelte-check + vitest + production build, all clean
10. **Deploy**: commit SPA + bump addon `config.yaml` 0.9.2 → 0.9.3
    + push both + `ha store reload && ha addons update`.
