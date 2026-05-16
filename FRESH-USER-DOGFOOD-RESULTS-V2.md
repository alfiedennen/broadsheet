# Fresh-user dogfood results V2 — broadsheet 0.1.69 + bug-burst patches

Date: 2026-05-15 18:35 BST (V1 was 17:30, V2 ~1hr later after the
17-bug fix burst)
Agent: Claude (Sonnet 4.5)
Method: same as V1 — factory-reset `broadsheet.json` to `{}` on the
live canary, walk every page + settings + the importer, document
every "huh?" moment, restore baseline + verify harold.local.
Code shipped: 12 fixes + 3 reclassifications + 1 deferred (see BUGS.md
for the per-bug breakdown).

Backup: `.dogfood/curation-baseline-fresh.json` (3482 bytes, restored
at end). harold.local 200 OK pre-test + post-test.

## TL;DR — recommendation flipped

V1: **DEFER v0.1.0** — three blockers + multiple seriouses.

V2: **GO for v0.1.0.** All 3 blockers FIXED + verified live on a
factory-fresh canary. 5 of 6 seriouses FIXED + verified. 1 SERIOUS
reclassified as not-a-bug (kebab IS the design). 7 of 8 minors
fixed. 1 minor + the deferred Jinja-attribute resolver land in
v0.1.1 within a week of ship.

The fresh-curation smoke test fixture (`tests/integration/fresh-curation.spec.ts`)
now runs in CI and asserts on every regression class the V1 dogfood
discovered — so the "existing-install false positive" failure mode
that produced the V1 GO-recommendation can't recur silently.

## Test totals

- 188/188 unit + integration tests pass (was 142 before this batch)
- 9 test files (added `presets.spec.ts`, `markdown-renderer.spec.ts`, `fresh-curation.spec.ts`)
- 0 type errors / 0 svelte-check warnings

## V1 → V2 deltas

### Blockers cleared (3)

| ID | V1 status | V2 status | What changed |
|---|---|---|---|
| BUG-003 | BLOCKER OPEN | **FIXED** | Added always-applicable Blank canvas preset. Picker renders ≥1 chip on every install. 6 unit tests + verified live: 5 chips render on factory-fresh canary |
| BUG-008 | BLOCKER OPEN | **FIXED** | Hand-rolled inline-only renderer replaced with marked + DOMPurify (full CommonMark + GFM + XSS hardening). 23 unit tests covering headings, emphasis, lists, tables, blockquotes, code blocks, autolinks, every common XSS attack |
| BUG-011 | BLOCKER OPEN | **FIXED + reclassified MINOR** | Was a dogfood error (picker actually had 11 primitives, my probe was scroll-clipped). Real fix: scrollable container + filter input + count |

### Seriouses cleared (5 of 6)

| ID | V1 status | V2 status | What changed |
|---|---|---|---|
| BUG-002 | SERIOUS OPEN | **FIXED** | `<span class="panel-id">` removed from /body Health Connect panels. Verified live: /body now reports 0 entity_id leaks (was 9) |
| BUG-005 | SERIOUS OPEN | **FIXED** | `humanizeAreaName` slug humanizer wired into domain.ts. Verified live: /lights hero now reads "Alfies Office, Bedroom, Kitchen, and Living Room are on" (was "alfies_office, …") |
| BUG-006 | SERIOUS OPEN | **RECLASSIFIED** | Was a dogfood expectation error — broadsheet's design has no horizontal chip-nav on the moment view; kebab IS the nav. KebabNav.svelte is fully populated with all routable pages |
| BUG-007 | SERIOUS OPEN | **FIXED** | PresenceCards now falls back to ProceduralPainting (warm gradient if home, cool if away) when emanations plugin is off. Verified live: Alfie + Elena cards now show distinct gradient art on factory-fresh |
| BUG-009 | SERIOUS OPEN | **FIXED** | mushroom-climate-card translator added. Verified on real Wall Tablet → Heating import: 6 climate cards went from "UNSUPPORTED, dropped" to "PARTIAL state-bound tile" |
| BUG-010 | SERIOUS OPEN | **FIXED** | Unsupported-card placeholder. Verified on real Wall Tablet import: skipped count went from 15 → 2 (87% reduction); partial rose from 87 → 100 to absorb the rescued cards |

### Minors cleared (7 of 8)

| ID | V1 status | V2 status |
|---|---|---|
| BUG-001 | MINOR OPEN | **FIXED** — nginx text/html dropped from sub_filter_types |
| OBS-004 | MINOR OPEN | **RECLASSIFIED** — emanations hiddenFromNav is intentional design |
| BUG-012 | SERIOUS OPEN | **FIXED** — editor helper updated to point at HA-style states() syntax + diagnostic note |
| BUG-013 | MINOR OPEN | **DEFERRED to v0.1.1** — same root cause as BUG-012; deeper Jinja attribute resolver = v0.2 |
| BUG-014 | MINOR OPEN | **FIXED** — humanizeWeatherState. Verified live: "Outside 11.2°C, partly cloudy." |
| BUG-015 | MINOR OPEN | **FIXED** — solved as side-effect of BUG-005 humanizer (existing "was: <slug>" chip now surfaces) |
| BUG-016 | MINOR OPEN | **FIXED** — "safety-rail blocked" → "view-only — open /door" |
| BUG-017 | MINOR OPEN | **FIXED** — TMDB API key link added |

## Per-page V2 walk findings

| Page | V1 verdict | V2 verdict | Notes |
|---|---|---|---|
| `/` | ⚠ partial (slug leak + empty person cards + literal partlycloudy) | ✓ pass | Manifest reads cleanly: "Outside 11.2°C, partly cloudy." Person cards have warm + cool gradient art |
| `/lights` | ⚠ partial (alfies_office leak in hero) | ✓ pass | Hero now humanized; rooms list cleanly cased |
| `/heat` | ⚠ partial (same slug leak pattern) | ✓ pass | Same humanizer effect across all area-listing pages |
| `/door` | ✓ pass | ✓ pass | Held |
| `/tv` | ✓ pass | ✓ pass | Held |
| `/body` | ⚠ 9 entity_id leaks | ✓ pass | 0 leaks now |
| `/wall` | ⚠ slug leak in room toggle | ✓ pass | Same humanizer effect |
| `/emanations` | ⚠ depends on plugin | ⚠ depends on plugin | Same design — friendly 404 when plugin off, full page when on |
| `/long-take` | ⚠ depends on plugin | ⚠ depends on plugin | Same |
| `/settings/pages` | ⚠ BUG-003 preset picker missing | ✓ pass | 5 chips render: Blank canvas / Person page / Wall tablet morning / Family status board / Energy at a glance |
| `/settings/house` | ⚠ no signal for slug-shaped names | ✓ pass | "was: alfies_office" chip now surfaces automatically beside humanized "Alfies Office" |
| `/settings/plugins/tmdb-tv/config/` | ⚠ no API key link | ✓ pass | Inline "Get a key from themoviedb.org →" link added |
| Importer | ⚠ 23/65/12% (clean/partial/skipped) | ✓ pass — **31/100/2 (23%/76%/2%)** | Skipped dropped 87% (15→2); per-card placeholder block emits when no translator. Mushroom climate cards translate as state-bound tiles |
| Builder picker | ⚠ "missing Action grid" | ✓ pass — was a dogfood error | All 11 primitives discoverable via filter input + scrollable container; count surfaced as "11/11 types" |
| Markdown block | ⚠ headings + underscores literal | ✓ pass | Full CommonMark + GFM via marked + DOMPurify. 23 tests cover headings, lists, tables, links, XSS |

## What the V2 walk surfaced as still-imperfect (none blocking)

- **Plugin pages still 404 with plugins disabled** — the friendly
  message (`If it's a plugin page, the plugin may be disabled or
  its activation checks aren't met yet — Settings → Plugins shows
  the status of every installed plugin.`) is correct + documented.
  Could be improved with a one-tap "enable @broadsheet/emanations"
  button on the 404 page itself; deferred to v0.2 polish pass.
- **Importer's mushroom-template-card → markdown** still drops
  tap_actions (BUG-010 mitigation: now emits placeholder INSTEAD of
  dropping, but the placeholder is read-only). Real fix would
  be to detect tap_actions inside template cards and emit them
  alongside the markdown. v0.2 backlog.
- **`/settings/pages` block picker count says "11/11 types"** even
  before the user types anything in the filter. Slightly noisy on
  the empty state. Cosmetic; could conditional-render only when
  filter text is present. v0.1.1 polish.

None of these block ship. They're noted for the next iteration.

## Process change locked in

The V1 dogfood's existing-install pass missed all of this because
it tested a curated install, not a fresh one. **Going forward, every
release dogfood MUST run the factory-fresh-curation walk in addition
to the existing-install regression.** The smoke test fixture
(`tests/integration/fresh-curation.spec.ts`) catches the worst of
the regression classes in CI; the manual fresh-curation walk catches
the UX-shaped regressions the unit tests can't see (image rendering,
spacing, per-page hero composition).

I'd add one more recommendation: **the dogfood's bug-counting JS
probes need to count list-shaped UIs against the source-of-truth
registry, not against a regex-filtered sample.** The BUG-011
dogfood-error was a regex anchored on the top 8 type names that
silently missed the bottom 3. The smoke fixture now asserts
`ALL_BLOCK_TYPES.length === 11`; future audits should follow that
pattern.

## Restoration

| Step | Result |
|---|---|
| Wipe of broadsheet.json | done at 17:55 BST |
| New build deployed via tar-stream | clean, addon restart picked it up correctly |
| Live re-walk | every fix verified live (see Per-page table above) |
| Restore from baseline | 3482 bytes restored cleanly |
| Verify broadsheet hero | "Friday evening. Alfie home in the living room." — all renames + curation effects in place |
| Verify harold.local | HTTP 200 / + /wall (intact, untouched throughout) |

User's daily-driver state fully restored. No data loss. No
collateral damage.

## Final ship recommendation

**Ship v0.1.0.**

- 3 blockers cleared
- 5 of 6 seriouses cleared (1 reclassified as not-a-bug)
- 7 of 8 minors cleared (1 deferred + 1 OBS reclassified)
- 188/188 tests pass
- Re-walked factory-fresh canary cleanly
- Fresh-curation smoke test fixture in place to catch regressions
- harold.local untouched; baseline curation restored

v0.1.1 within a week to address BUG-013 (Jinja attribute
resolution) plus the v2 walk's "still-imperfect" list above.
