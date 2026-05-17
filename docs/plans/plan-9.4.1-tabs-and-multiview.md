# Plan — 0.9.4.1: tabs primitive + multi-view Lovelace import

**Status**: IMPLEMENTED 2026-05-17 (same-day after 0.9.4 dogfood).
svelte-check clean (522 files, 0 errors, 0 warnings), 341 tests
pass (+8 new across blocks/translate/fresh-curation), production
build clean. Files shipped:

- `packages/core/src/lib/blocks/types.ts` — new `TabDef` +
  `TabsBlockConfig` types; `tabs` added to `BlockDef` union;
  `defaultBlockConfig('tabs')` returns 2 empty tabs.
- `packages/core/src/lib/blocks/registry.ts` — tabs in
  CORE_REGISTRY + BLOCK_META.
- `packages/core/src/lib/blocks/renderers/TabsBlockRenderer.svelte`
  (NEW) — chip-bar at the top + active-tab content via BlockSlot.
  URL-bound active tab via `?tab=<id>` (default paramName is
  `tab`). Falls back to first tab when param is missing or matches
  no tab. `goto` keeps history so browser-back swaps tabs.
- `packages/core/src/lib/lovelace/translate.ts` — new
  `translateDashboardAsTabs(config, dashboardUrlPath)` that wraps
  all views in a single `tabs` block, one TabDef per view, with
  chip-bar nav stripped. Helper functions: `siblingViewPaths`,
  `getNavTargetPath`, `isNavigateChipCard`, `isViewNavChipBar`,
  `stripViewNavChipBars`, `translateViewWithSiblings`. The
  detection is conservative — only top-level removal, only when
  EVERY child of the candidate chip-bar navigates to a sibling
  view path.
- `packages/core/src/routes/settings/pages/import/+page.svelte` —
  multi-view dashboards default to "Import all views as tabbed
  page" (new `tabbedMode` state + `pickTabbed()` action). New
  recommend-tile at the top of the pick-view step shows the
  tab labels + lets the user accept the default with one tap.
  "Pick a single view" is preserved as the override.
- `packages/core/src/lib/blocks/editor/ThingsCanvas.svelte` —
  inline editor for the tabs block: per-tab label override +
  id editor + per-tab block count + reorder + remove + add.
  Children-editing routes to advanced (same pattern as row/grid).

Tests:
- `blocks.spec.ts` (+1): tabs in `ALL_BLOCK_TYPES`; default-config
  factory exercised.
- `fresh-curation.spec.ts`: block-type count bumped 18 → 19.
- `translate.spec.ts` (+7): `translateDashboardAsTabs` shape +
  per-tab content + report aggregation; chip-bar dedup for
  horizontal-stack of nav chips + mushroom-chips-card with nav
  chips; mixed (some-non-sibling) chip-bars are kept; single-view
  imports never strip anything.

Deferred to 0.9.4.2 (per the locked plan):
- Coalesce chip rows into a single action-grid
- `custom:layout-card` + `custom:grid-layout` → broadsheet grid block
- Mushroom-template-card without tap_action → state-pill thing
- `type: template` Lovelace card → dedicated translator

---

**Status (pre-impl)**: LOCKED 2026-05-17 (post-0.9.4 dogfood). User feedback
after first real Lovelace import (wall-tablet dashboard, 8 views,
~130 cards):

> I picked wall tablet, which has home, heating, door, lights,
> remote, nearness, immaterials and presence history. I can only
> import one view? […] Take a look [the imported page is mostly
> markdown + single-action action-grids in a vertical strip].

And, when offered "split each view into a separate broadsheet page":

> Absolutely no to multi page creation from one lovelace page
> import, that defeats the entire purpose. Lets think this through
> from the users pov before proceeding.

The user is right. Splitting an 8-view dashboard into 8 pages
throws away the user's mental model: the wall-tablet IS one wall
surface with tab-navigation between sections. Each Lovelace view
is HA's implementation of "tab", not "page". The chip-bar at the
top of every view IS the tab-bar; the user designed it as one
cohesive interface.

broadsheet has no `tabs` primitive yet — that's the actual gap.

---

## What 0.9.4.1 ships

1. **`tabs` block primitive**: new BlockDef variant with
   `config: { tabs: TabDef[] }`. Each `TabDef` carries an `id`,
   `label`, optional `icon`, and `blocks: BlockDef[]` for that
   tab's content. Composable as a block (not page-level) so a
   page can have a hero above, tabs in the middle, explainer
   below — same authoring metaphor as every other block.

2. **TabsBlockRenderer**: chip-bar at the top + active tab's
   content below. **URL-bound** active tab — `?tab=<id>` in the
   page URL. Refresh stays on the right tab; deep-linkable; back
   button works. Important for cast displays / kiosks that may
   reload.

3. **Multi-view Lovelace import → ONE page with a tabs block**.
   When the user picks a dashboard with > 1 view, the importer
   defaults to "import as tabbed page": creates a single
   broadsheet page whose first block is a `tabs` block, one tab
   per view. The "pick a single view" option stays as an
   override for users who genuinely want just one view.

4. **Chip-bar dedup**: the translator recognises the common
   pattern where a multi-view Lovelace dashboard has a hand-
   authored chip-bar at the top of every view (mushroom-chips-
   card, or a horizontal-stack of chip-shaped cards, whose
   `tap_action: { action: navigate, path: /<other-view> }` points
   at a sibling view). When all the navigate targets are sibling
   view paths, the chip-bar is RECOGNISED AS the tab-bar and
   DROPPED from the per-view content — otherwise the imported
   page renders the tabs block AND a redundant chip-bar both
   doing the same job.

5. **Inline editor for tabs in the things-first canvas**: shows
   the tab list, lets the user rename / reorder / add / remove
   tabs. Children-editing routes to advanced mode (same pattern
   as row + grid in 0.9.4).

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Tabs as a block or page-level | **Block** | Composable. Page can have hero / explainer / etc. around the tabs. One authoring metaphor across primitives. |
| Tab state binding | **URL-bound** (`?tab=<id>`) | Refresh-survives; deep-linkable; back works. Critical for cast + kiosk. |
| Chip-bar dedup | **Detect + drop** the redundant chip-bar | Avoids two navs doing the same job after import. Pattern detection: card emits tap_action.navigate to a path matching a sibling view. |
| Import default for multi-view | **Tabbed page** | The wall-tablet experience comes across whole. Single-view dashboards translate unchanged (no tabs wrapper). |
| Sub-page splitting | **Removed** | Multi-page split defeats the unifying "this is one wall surface" model. Not exposed. |

---

## Out of scope for 0.9.4.1 (→ 0.9.4.2)

- Coalesce chip rows into a single action-grid (today: N single-
  action grids inside a row)
- `custom:layout-card` + `custom:grid-layout` → real grid block
- Mushroom-template-card without tap_action → state-pill (today:
  raw Jinja in markdown)
- `type: template` Lovelace card → dedicated translator

These four translator-coverage improvements are orthogonal to the
tabs work. Shipping tabs + multi-view + chip-bar dedup gets the
user-facing model right; the coverage improvements then fill in
the body of each tab.
