# Plan: BUG-011 — Block picker discoverability

**Severity**: ~~BLOCKER~~ → reclassified to **MINOR** (was a dogfood
error, see below)
**Surface**: + Add block picker in `/settings/pages/<slug>/`

## What I claimed in the fresh-user dogfood

> "The block picker has NO generic 'Action grid' or 'Action tile'
> primitive."

## What's actually true

The picker offers **all 11 primitives**, including the three I
missed: **Action grid**, **Entity list**, **Sparkline**. Verified
live on the canary by counting picker rows directly:

```
["Hero", "Markdown", "Explainer", "Outline", "Macro grid",
 "Room toggle grid", "Scene row", "Boost row",
 "Entity list", "Action grid", "Sparkline"]
```

- `packages/core/src/lib/blocks/types.ts:255` — `BlockDef` union has all 11 types
- `packages/core/src/lib/blocks/registry.ts:63` — `ALL_BLOCK_TYPES` = `Object.keys(REGISTRY)` (no filter)
- `packages/core/src/routes/settings/pages/[slug]/+page.svelte:634` — `{#each ALL_BLOCK_TYPES as t (t)}` (no filter)
- The Phase A polish editor (lines 962-989+) already has the structured per-action editor for `action-grid` blocks

## What went wrong in the dogfood

My JS probe ran `document.querySelectorAll('button')` filtered to
known-name regex, but at the moment of probe the picker scroll
container had clipped Action grid / Entity list / Sparkline below
the visible viewport. The `<button>` elements existed in the DOM
but my screenshot-based eyeball-scan and the regex filter both
missed the lower 3 because they weren't visible AND I'd anchored
the regex on the top 8.

## The (real, smaller) bug

The picker *is* discoverable, but *barely*. The dogfood walked
right past it. A naive user could reasonably do the same — the
container has overflow but no obvious scroll-affordance:

- No `↓ scroll for more` hint
- No fade-out at the bottom edge
- No count "11 block types" header

## Fix plan

### Step 1 — pick the smallest improvement

Three options, ordered by effort:

**Option α (~5 lines)** — Add a count + scroll hint to the picker
header:
```svelte
<header class="picker-header">
  <h3>Pick a block</h3>
  <span class="picker-count">{ALL_BLOCK_TYPES.length} types · scroll for more</span>
</header>
```
With CSS so the hint only shows if the container actually overflows
(`overflow: auto` + JS check — or just always show, fine).

**Option β (~15 lines)** — Group the 11 types into 3 sections:
- *Composition* — Hero, Markdown, Explainer, Outline
- *Discovery-driven actions* — Macro grid, Room toggle grid, Scene row, Boost row
- *Custom* — Action grid, Entity list, Sparkline
With section dividers + brief group headers in the picker. Same
list, better information architecture.

**Option γ (~30 lines)** — Add a search/filter input at the top of
the picker. Type-ahead reduces 11 → matching subset. Aligned with
HA's own card-picker UX.

### Step 2 — pick (my recommendation: Option β)

Option β groups by purpose and surfaces the meta-distinction the
picker currently obscures: "I want to compose something" vs "I
want auto-discovered actions" vs "I want bespoke tiles". It also
moves Action grid + Sparkline to a section called "Custom" which
flags them as the power-user options without the 1-of-11 visual
weight. Cheap to do, helps every user not just the ones who
scroll.

### Step 3 — also extend the F2 dogfood probe

The F2 fresh-user walk needs an asserting check that ALL 11 picker
options are reachable, not just the first 8. Add to the
fresh-curation smoke fixture:
```ts
test('block picker exposes all 11 primitive types', async () => {
  // mount editor, click + Add block, count buttons in the picker
  expect(buttonsWithBlockTypeName.length).toBe(11);
});
```

## Files touched

- `packages/core/src/routes/settings/pages/[slug]/+page.svelte` — add 3-section grouping in the `{#each ALL_BLOCK_TYPES}` block
- `packages/core/src/lib/blocks/registry.ts` — add `category: 'compose' | 'discovery' | 'custom'` field to BLOCK_META
- `packages/core/tests/integration/preset-picker-fresh.spec.ts` — assert 11 types present (combine with BUG-003 test fixture)

Estimated total: **15-25 min** for Option β + tests.

## Lessons for the dogfood process

1. **Count, don't eyeball.** Future dogfoods must explicitly count
   list-shaped UIs (picker, dashboard list, area list) and assert
   against the source-of-truth (here `ALL_BLOCK_TYPES.length`).
2. **Scroll inside containers.** A page-level scroll-to-bottom
   doesn't reveal items inside an `overflow: auto` container.
3. **Trust source over screenshots.** When I had access to the type
   registry, I should have checked `Object.keys(REGISTRY)` first
   before claiming primitives were missing. The agent that
   investigated did exactly this and caught the error in one read.

## Open questions for you

1. Option α / β / γ? (My vote: β — best clarity-for-effort.)
2. Should "Action grid" + "Entity list" + "Sparkline" stay
   visually grouped as "Custom" or get their own labels? E.g.
   *"Custom · power-user"* with a subtle italic.
3. OK to fold this into the same release cycle as BUG-003 + BUG-008
   given it's now MINOR not BLOCKER?
