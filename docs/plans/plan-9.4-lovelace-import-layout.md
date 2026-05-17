# Plan — 0.9.4: Lovelace import that respects layout + row/grid primitives

**Status**: IMPLEMENTED 2026-05-17 (same-day after 0.9.3.3 docs).
svelte-check clean (521 files, 0 errors, 0 warnings), 333 tests pass
(+27 new across blocks/translate/fresh-curation), production build
clean. Files shipped:

- `packages/core/src/lib/blocks/types.ts` — `RowBlockConfig` +
  `GridBlockConfig` types; row + grid added to the `BlockDef`
  discriminated union; optional top-level `colSpan?: number`
  intersected onto every union member (layout property, not
  per-config); `defaultBlockConfig` cases for row + grid; new
  optional `draft?: boolean` field on `CustomPageDef` for the
  import draft semantic.
- `packages/core/src/lib/blocks/registry.ts` — row + grid
  registered in CORE_REGISTRY + BLOCK_META.
- `packages/core/src/lib/blocks/BlockSlot.svelte` (NEW) — single-
  block resolver+renderer with optional grid/flex wrappers. The
  shared "look up renderer, lazy import, render with {config}"
  dance, factored out so Row + Grid can recursively render
  children without duplicating the logic.
- `packages/core/src/lib/blocks/renderers/RowBlockRenderer.svelte`
  (NEW) — horizontal flex layout; children get `flex-grow:
  child.colSpan ?? 1`; stacks to a column below 640px.
- `packages/core/src/lib/blocks/renderers/GridBlockRenderer.svelte`
  (NEW) — CSS grid with `config.columns` columns; child `colSpan`
  becomes `grid-column: span N`. Responsive collapse: 12 → 6 → 3
  → 1 at 1024/640/480px breakpoints; BlockSlot clamps colSpan to
  the effective column count so nothing overflows.
- `packages/core/src/lib/lovelace/translate.ts` — full translator
  upgrade per plan: `translateStack` emits a row block for
  `horizontal-stack` (was: flat-flattened with note); `translateGrid`
  emits a grid block for `type: 'grid'` cards (new); `translateView`
  dispatches on `view.type`: `sections` → one grid per section
  with 12-col scale + per-card colSpan from `grid_options.columns`,
  outline blocks for section titles, panel → translate single card
  without wrapper, default/masonry → tiered heuristic (3-col >12
  cards, 2-col 6-12, 1-col <6, requires ≥ 1 small card type). New
  `partial-layout` coverage status for masonry-heuristic-wrapped
  outputs (data through, layout approximated); `partialLayout`
  count added to the dashboard totals.
- `packages/core/src/routes/settings/pages/import/+page.svelte` —
  post-import draft flow per plan: imports default to `draft:
  true, hiddenFromNav: true, editorMode: 'things-first'`. New
  "Skip review, save directly" checkbox on the review step is
  the pre-import escape hatch. The commit button text + toast
  flip between "Import + save" (skip) and "Import as draft →
  review" (default). Coverage chip styling extended for the new
  `partial-layout` class.
- `packages/core/src/routes/settings/pages/[slug]/+page.svelte` —
  draft banner shown when `customPage.draft === true` with two
  affordances: "Save as-is" + "Commit as wall surface" (both call
  `commitDraft()` which flips `draft: false` + `hiddenFromNav:
  false`). "Discard" triggers the existing delete-confirmation
  flow.
- `packages/core/src/lib/blocks/editor/ThingsCanvas.svelte` —
  inline editors for row + grid (label override + gap + columns
  for grid). Children-editing remains "switch to advanced" for
  now — containers are atomic in things-first.

Tests:
- `tests/unit/blocks.spec.ts` (+5 tests) — row + grid in
  `ALL_BLOCK_TYPES`; default-config defaults exercised.
- `tests/unit/translate.spec.ts` (+19 tests) —
  horizontal-stack → row (instead of flat); vertical-stack
  stays flat; grid card; sections view + section titles + empty
  sections; panel view; masonry heuristic across all 4 tiers
  (no-wrap / 2-col / 3-col / no-wrap-when-all-tall).
- `tests/integration/fresh-curation.spec.ts` — block-type count
  bumped 16 → 18.
- 27 new tests, 333 total (was 306).

Deferred to follow-on patches:
- Editing children of a row/grid INSIDE the things-first canvas
  (today: "flip to advanced to nest-edit"). Real DnD between
  containers is a substantial UX problem and not blocking ship.
- Coverage report tightening per the plan's collapsible-footer
  vision — currently the report shows inline at review step;
  enhancement deferred to 0.9.4.1 or later.
- The plan's "coverage report at the FOOTER of the imported page
  editor" — current behaviour shows it on the import-review step
  only; moving to the editor footer is a smaller follow-up.

---

**Status (pre-impl)**: LOCKED 2026-05-17 after decision-set sign-off
(deltas from drafted defaults: #9 chose B — tiered 3-col/2-col/1-col
masonry heuristic; #11 chose B — footer report instead of prominent
banner; #10 stays A with two-layer escape hatches: pre-import "Skip
review" toggle + in-canvas "Save as-is" button). Drafted same day as
0.9.1. Companion to `plan-9.1-wall-builder-things-first.md`.

**Sequence note (post-renumbering)**: Originally planned as 0.9.2;
reslotted to 0.9.3, then to 0.9.4 as later dogfood feedback added
intermediate priorities (browser-as-accomplishments in 0.9.2,
composites + plugin blocks in 0.9.3). The plan itself stayed locked
across the renumbering — the work is identical. The `row` / `grid`
container primitives mentioned below as "0.9.1's" actually land in
this ship (0.9.4) — the original plan assumed they'd come earlier.

---

## What the user said

> We can technically import most things, but then when we create a
> page its just a huge vertical list of things which no thought given
> to arrangement on a page.

Correct. Today's translator (`$lib/lovelace/translate.ts`) iterates
over a Lovelace view's flat `cards: LovelaceCard[]` array and emits
`BlockDef[]` one-per-card. Multi-column source layouts collapse to
a single vertical column because **`BlockDef[]` itself is flat — no
nesting, no horizontal containers, no grid containers**. The header
comment on `translateStack` says it plainly:

> `vertical-stack` / `horizontal-stack` → recurse into child cards.
> Both translate identically for v0.2 — broadsheet pages are a flat
> vertical sequence of blocks, so the layout distinction is lost.
> Future: if a horizontal-block primitive lands, horizontal-stack
> could land as a horizontal layout container.

That "Future" is now.

Plus: Lovelace 2024.3+ introduced the **sections layout**, where
views have `sections: [{ type: 'grid', cards: [...] }]` and each
card carries `grid_options: { columns: N, rows: N }`. None of this
is translated today — the importer never even reads `sections`.

Result: importing a thoughtfully-arranged Lovelace dashboard produces
a vertical strip that bears no resemblance to the original.

---

## What Lovelace gives us to work with

Three eras of Lovelace layout, all still in use:

### 1. Default / masonry (every install since the beginning)

View has `cards: LovelaceCard[]`. Frontend pours them into N columns,
auto-balancing by height. The user gets a multi-column flow but
**no explicit per-card column index is stored** — the layout is
emergent from card heights at render time. Default for any view
without an explicit `type`.

Signals available: the card ORDER (cards user expected to read first
came first), card TYPE hints (small cards = chips, tall cards =
graphs), occasional `view_layout` overrides per-card (rare). Otherwise
the translator has to GUESS layout from card-type heuristics.

### 2. Explicit `vertical-stack` / `horizontal-stack` (heavily used)

View / parent card has `type: '(vertical|horizontal)-stack'` with
`cards: [...]`. The user explicitly said "lay these out side by side
(horizontal) or one above the other (vertical)". This is the
clearest layout signal Lovelace provides; we currently throw it away.

### 3. Sections layout (2024.3+, becoming the new default)

View has `type: 'sections'` and `sections: [{ type: 'grid', cards: [...] }]`.
Each card inside a grid section carries `grid_options: { columns:
N (1-12), rows: N | 'auto' }`. The grid is **12-column** by
convention. This is the most precise layout signal — exact column
spans + row spans per card — and the modern Lovelace authoring
experience is built around it.

### Plus a couple of edge cases

- **`type: 'grid'` card** (different from sections): a single grid
  card with N columns + child cards. Used inside masonry views to
  create local grids without converting the whole view.
- **`type: 'panel'` view**: one card fills the whole view. Maps cleanly
  to a broadsheet page with a single block.
- **Custom layouts** from HACS (layout-card, vertical-tabs-card,
  swipe-card, etc.): too many to enumerate; treat as black boxes,
  recurse if they have `cards`, flatten otherwise.

---

## Two complementary fixes

### Fix 1: Honour layout signals in the translator

Pre-req: the `row` / `grid` container primitives from 0.9.1 must
exist (one block whose `config.children: BlockDef[]` renders as a
horizontal row or N-column grid).

With those, the translator can:

| Lovelace shape | broadsheet emits |
|---|---|
| `horizontal-stack` | `row` block containing the translated children |
| `vertical-stack` | flat sequence (no wrapper needed — page is already vertical) |
| `type: 'grid'` card with columns N | `grid` block with `columns: N` containing the translated children |
| `type: 'sections'` view, each section `type: 'grid'` | one `grid` block per section, with 12-column scale; child cards' `grid_options.columns` controls per-tile span |
| `type: 'panel'` view | translate the single card; no wrapper |
| Default / masonry view | **heuristic two-column layout** when there are ≥6 cards and at least one short card type (chip / glance / sensor) — fall back to single column otherwise. Cheap heuristic, much better than today's "everything vertical" |

The translator's coverage report keeps the per-card status. New
status: `'partial-layout'` — translation worked but the layout
flattening lost something the user might want back (a sections-grid
with 8 cards across 12 columns is meaningfully different from a
6-block grid bucketed naively).

### Fix 2: Post-import canvas review (the bigger win)

Even with perfect layout translation, the imported page might not be
what the user wants on broadsheet's surface (the user's Lovelace
dashboard was designed for desktop HA; the broadsheet wall surface
might be a Fire HD 10 in portrait). The user needs to be able to
**rearrange after import without going back to YAML**.

This is where 0.9.1's things-first editor pays off:

1. User imports a Lovelace dashboard
2. broadsheet translates with the best-effort layout heuristics
3. **The import lands as a Draft in the things-first canvas** rather
   than directly creating a page
4. User reviews the canvas, sees the auto-laid-out widgets, can
   drag/drop/remove/group/add their own custom things
5. User taps "Save as wall surface" to commit

This makes the import flow a SEED, not the final product. The user
isn't punished by a one-shot bad translation — they're handed a
starting point + the right tools to polish.

Storage shape: the things-first canvas operates on the same
`BlockDef[]` (with the new `row`/`grid`/`thing`/`macro` primitives);
the import just gives the user a populated canvas to start from
instead of a blank one.

---

## Decisions to lock

| Decision | Choice | Rationale |
|---|---|---|
| Container primitives | New `row` + `grid` BlockDefs whose `children: BlockDef[]` render as horizontal row OR N-column grid | Minimum new primitive count for full layout expressiveness. `grid` covers everything `row` does + more, but `row` is cleaner for the horizontal-stack case |
| Default sections-grid scale | 12-column (matches Lovelace's native scale) | Translates `grid_options.columns: 6` → broadsheet `colSpan: 6 of 12`. Pixel-perfect to Lovelace |
| Masonry heuristic | Tiered: 3-col when >12 cards, 2-col when 6-12 cards, 1-col when <6. Each tier still requires ≥1 small card type (chip/glance/sensor) to avoid bunching tall graphs side-by-side | More accurate match for the breadth of real-world dashboards; users with sparse dashboards (3-5 cards) keep the simple stack |
| Per-card column-span override | Optional `colSpan?: number` field on every BlockDef (or all blocks inside a `grid`) | Lets the translator AND the things-first editor specify span without a new block per span value |
| Post-import review | Land in the things-first canvas as a draft by default, with two escape hatches: (1) "Skip review, save directly" checkbox on the import page, (2) "Save as-is" button at the top of the draft canvas | Treats import as "starting point" — user reviews + commits. Solves the "huge vertical list with no thought" complaint by handing the layout job back to the user with good tools. Escape hatches respect users who already know what they want |
| Coverage classification | Add `'partial-layout'` to the existing clean / partial / unsupported set | Distinguishes "I rendered the data but laid it out flatly" from "I dropped fields" |
| Coverage report placement | Collapsible footer at the bottom of the imported page editor (not a banner) | User saw the import worked; surface the gap quietly so the editor's primary surface stays the canvas |
| Custom Lovelace cards | Translate body where possible, drop layout extras | A custom mushroom-template-card with `card_mod` styling: translate the entity binding, drop the styling. Don't try to emulate every card-mod CSS trick |
| Sections name preservation | Emit a `outline` block before each grid with the section's title (if set) | Sections often have titles; preserving them as broadsheet OutLines keeps the user's mental landmarks |

---

## What 0.9.2 ships

1. **`row` block primitive** — `{ type: 'row', config: { children: BlockDef[] } }`.
   Renders a horizontal flex layout. Each child takes equal width by
   default; respects child's `colSpan` if set.

2. **`grid` block primitive** — `{ type: 'grid', config: { columns: number, children: BlockDef[] } }`.
   Renders a CSS grid with N columns. Each child takes 1 column by
   default; respects child's `colSpan` for multi-column tiles.

3. **`colSpan` on `BlockDef`** — optional `colSpan?: number` field
   that the grid renderer reads. Ignored outside grid contexts.

4. **Translator upgrades** (in `$lib/lovelace/translate.ts`):
   - `horizontal-stack` → emits a `row` block wrapping translated
     children (was: flat sequence, dropping the layout).
   - `grid` card → emits a `grid` block with the source's column
     count (new).
   - `sections` view → emits one `grid` block per section, with
     12-column scale + per-card `colSpan` from `grid_options.columns`
     (new).
   - Default / masonry view → heuristic two-column wrapper when ≥6
     cards (new).
   - Coverage status `partial-layout` for blocks where data
     translated but layout was lossy.

5. **Section title preservation** — sections with titles emit an
   `outline` block before their grid.

6. **Post-import canvas review** — `/settings/pages/import/` no
   longer creates pages directly; it lands the user in the
   things-first editor at `/settings/pages/<draft-slug>/?draft=true`
   with the imported blocks pre-populated. User reviews, edits, taps
   "Commit as wall surface" to make it permanent.

7. **Per-translator report tightening** — the existing translator
   report now distinguishes data-coverage from layout-coverage so
   users see "12 cards translated; 4 lost their multi-column layout"
   instead of just "12/12 translated".

---

## Worked example

User has a Lovelace dashboard "Living Room" with:

```yaml
title: Living Room
views:
  - title: Lights & Cinema
    type: sections
    sections:
      - type: grid
        title: Lights
        cards:
          - type: light
            entity: light.living_room_pendant
            grid_options: { columns: 6 }
          - type: light
            entity: light.library_lamps
            grid_options: { columns: 6 }
      - type: grid
        title: Cinema
        cards:
          - type: button
            tap_action:
              action: call-service
              service: scene.turn_on
              data: { entity_id: scene.movie }
            grid_options: { columns: 4 }
          - type: media-control
            entity: media_player.living_room_tv
            grid_options: { columns: 8 }
```

**Today's translator output** (broken):
```
hero · 'Lights & Cinema'
action-grid (light toggle: pendant)
action-grid (light toggle: lamps)
action-grid (button: scene.movie)
entity-list (media_player.living_room_tv)   ← stacked vertically, layout gone
```

**0.9.2 translator output**:
```
hero · 'Lights & Cinema'
outline · 'Lights'
grid (columns: 12, children: [
  action-grid (light pendant, colSpan: 6)
  action-grid (light lamps, colSpan: 6)
])
outline · 'Cinema'
grid (columns: 12, children: [
  action-grid (scene.movie button, colSpan: 4)
  entity-list (TV, colSpan: 8)
])
```

User then sees this in the things-first canvas → can tweak / add /
remove → commit.

---

## Risks + open questions

- **Custom HACS cards with their own layout**: layout-card from
  HACS uses arbitrary CSS grids. We can't translate the CSS; we'd
  recurse into its `cards` and lay them out per masonry heuristic.
  Coverage status `partial-layout` flags this clearly.
- **Responsive collapse**: a 12-column grid on a Fire HD 10 (1280px)
  might collapse to 6-column on a 7" tablet. Need to define when
  the grid wraps. Probably: 12 → 6 → 3 → 1 at breakpoints.
- **Sections without explicit `grid_options.columns`** — default to
  spanning the full row? Or auto-distribute? Lovelace defaults to
  full-width when omitted; we mirror that.
- **`horizontal-stack` nested inside `vertical-stack`** — recurses
  fine; the outer is flat (no wrapper), the inner becomes a `row`.
  Verified by composition.
- **Import volume**: a 50-card dashboard becomes ~50 blocks. The
  things-first canvas needs to render that quickly. Probably
  needs the same lazy-thunk dance the plugin loader uses.

---

## Ship signal for 0.9.2

1. `row` + `grid` block primitives shipped + renderers wired up.
2. `colSpan` field on BlockDef respected inside grid containers.
3. Translator handles: horizontal-stack → row, grid card → grid,
   sections view → grid per section, panel view → single block,
   masonry default → two-column when heuristic matches.
4. Section titles preserved as `outline` blocks.
5. Coverage reports distinguish data vs layout fidelity.
6. Import flow lands users in the things-first canvas as a draft,
   not directly as a saved page.
7. Manual dogfood: a real Lovelace dashboard imports as a recognisable
   facsimile of the original, AND the user can rearrange it without
   leaving broadsheet.
