# Plan: BUG-003 — Phase G preset picker missing

**Severity**: BLOCKER (always-broken since Phase G shipped)
**Surface**: `/settings/pages/` + New page form
**Symptom**: `presets.length === 0` at the `{#if presets.length > 0}`
gate; `.preset-picker` container never enters the DOM. Confirmed
both with empty and full curation on the canary install (11 areas, 2
persons, 8 climates — all 4 `applicableWhen` predicates SHOULD pass).

## What we know

- File: `packages/core/src/routes/settings/pages/+page.svelte`
  - L51-53: `const presets = $derived(applicablePresets({ persons: discovery.persons, areas: discovery.areas }));`
  - L206-232: `{#if presets.length > 0}` → preset-picker block
- Discovery singleton: `packages/core/src/lib/discovery/index.svelte.ts:151`
  - `discovery.persons = $derived(this.#projection.persons)` (correct chain)
  - `discovery.areas = $derived(this.#projection.areas)` (correct chain)
  - `#projection = $derived.by(() => projectDomain({ ... discoveryStore.* ... }))` (correct chain)
  - All backed by `$state` in `store.svelte.ts`
- Predicates in `packages/core/src/lib/presets/index.ts`:
  - personPage L71: `(ctx) => ctx.persons.length > 0` — should pass (2 persons)
  - wallMorning L135: `(ctx) => ctx.areas.length >= 3` — should pass (11 areas)
  - familyStatus L178: `(ctx) => ctx.persons.length > 0` — should pass (2 persons)
  - energyGlance L222: `(ctx) => ctx.areas.some((a) => a.climates.length > 0)` — should pass (8 climate entities across 7 areas)
- Live diagnostic: tried importing the discovery chunk dynamically
  to read `disc.persons.length` / `disc.areas.length` from console —
  CSP/module-resolution blocked it. Cannot confirm runtime values
  without instrumented code.

## Most likely root cause (rank-ordered)

1. **Reactive boundary break** — the `+page.svelte` `$derived` was
   evaluated once at first paint when discovery was empty (`[]` + `[]`
   → all predicates fail → `presets = []`), and Svelte 5's runes
   tracking missed the subsequent boot mutation so it never
   recomputed. This is a known Svelte 5 trap when consuming
   `$derived` properties on a class instance: if the consumer's
   `$derived` is created in the wrong template lifecycle, dependency
   tracking can fail.
2. **Predicates rejecting valid data** — `discovery.persons` may
   technically have entries but `ctx.persons` shape mismatches what
   the predicate expects (e.g. predicate uses `.length` but
   `ctx.persons` is a Map, or person entries lack a property the
   builder needs further down).
3. **`applicablePresets` throws on a malformed predicate** and a
   `try/catch` somewhere returns `[]` on error.

## Fix plan

### Step 1 — instrument (15 min, don't ship)

Add a temporary `$effect` to `+page.svelte` that logs:
```ts
$effect(() => {
  console.warn('[BUG-003 probe]', {
    booted: discovery.booted,
    personsLen: discovery.persons.length,
    areasLen: discovery.areas.length,
    areasWithClimates: discovery.areas.filter(a => a.climates.length > 0).length,
    presetsLen: presets.length,
    perPredicate: PRESETS.map(p => ({
      slug: p.meta.slug,
      pass: !p.meta.applicableWhen || p.meta.applicableWhen({
        persons: discovery.persons,
        areas: discovery.areas
      })
    }))
  });
});
```

Also add a window-side hook for runtime poke:
```ts
if (typeof window !== 'undefined') (window as any).__bs_debug_presets = () => ({...same...});
```

Build, deploy to canary, navigate to `/settings/pages/`, click + New
page, watch console + run `__bs_debug_presets()`. Three possible
results dictate the next step:

| Console says | Root cause | Step 2 |
|---|---|---|
| `personsLen: 0, areasLen: 0` (after boot) | Reactive break — singleton not updating from page scope | 2A |
| `personsLen: 2, areasLen: 11, presetsLen: 0` | Predicates rejecting valid data — debug per-predicate | 2B |
| `personsLen: 2, areasLen: 11, presetsLen: 4` (but `.preset-picker` still missing in DOM) | Template/CSS bug not data | 2C |

### Step 2A — fix reactive break

Two known patterns work:
- **Pattern α (cheapest)**: replace the class-instance `$derived`
  consumption with a function call: change presets to
  `$derived.by(() => applicablePresets({ persons: discovery.persons, areas: discovery.areas }))`.
  `$derived.by` re-tracks dependencies every run; classic
  `$derived(...)` may freeze the dependency graph.
- **Pattern β**: pass discovery via a `useDiscovery()` hook from
  `+layout.svelte` so the form's `$derived` is created in a
  reactive root that's known-good.

### Step 2B — fix predicates

Diff what the predicate sees vs what we know is real. Likely
candidates:
- Predicate uses `ctx.areas` but `discovery.areas` excludes the
  `__unsorted__` synthetic — areas could be 10 not 11. Still passes
  `>= 3` though.
- `a.climates` may be `undefined` not `[]` for areas without
  climates — `.length` throws. Wrap in `.length ?? 0`.

### Step 2C — fix template

Inspect the `.preset-picker` block's containing `{#if}` chain. Maybe
nested in a `{#if discovery.booted}` that never flips.

### Step 3 — add a "Blank" preset

**Regardless of root cause**, ship a `blank` preset with no
`applicableWhen` predicate (or one that returns `true` always). This
guarantees `presets.length >= 1` for every install. The "Blank
canvas — start from scratch" chip becomes the always-available
fallback. This alone would have made BUG-003 a degraded-UX rather
than a blocker — even if the other 4 predicates fail, the picker
still renders SOMETHING.

```ts
const blank: PresetBuilder = {
  meta: {
    slug: 'blank',
    label: 'Blank canvas',
    description: 'A starter Hero block, ready to compose.',
    // no applicableWhen → always applicable
  },
  build: (ctx, opts) => ({
    label: opts.label,
    blocks: [{ type: 'hero', config: { eyebrow: opts.label.toUpperCase(), headline: opts.label, dek: '' } }]
  })
};
```

Add as `PRESETS[0]` so it's always the first chip.

### Step 4 — remove instrumentation, verify on factory-fresh

Strip the `$effect` probe. Re-run the fresh-curation dogfood to
confirm presets render with empty curation.

## Test fixture (for fresh-curation smoke)

```ts
// packages/core/tests/integration/preset-picker-fresh.spec.ts
test('preset picker renders with empty curation + populated discovery', () => {
  // mock discovery with 2 persons + 11 areas + 1 climate
  // assert applicablePresets returns >= 1
  // assert it returns >= 2 with persons populated
});
test('preset picker has a Blank fallback even with empty discovery', () => {
  // mock discovery with 0 persons + 0 areas
  // assert applicablePresets returns >= 1 (the Blank preset)
});
```

## Files touched

- `packages/core/src/routes/settings/pages/+page.svelte` — possibly switch `$derived` → `$derived.by`, OR no change if root cause is in presets/discovery
- `packages/core/src/lib/presets/index.ts` — ADD blank preset
- `packages/core/tests/integration/preset-picker-fresh.spec.ts` — NEW

Estimated total: **15-25 min instrumented diagnostic + 15-30 min
fix + 30 min test fixture + 10 min dogfood verify = ~90 min**.

## Open questions for you

1. OK to ship the temporary `$effect` probe to canary (will log
   noisy `[BUG-003 probe]` warnings to console)? Faster than running
   the fresh-curation walk locally.
2. Add the Blank preset regardless of root cause finding? (My
   recommendation: yes — it's a defensive default and it's what a
   user wants when presets fail.)
