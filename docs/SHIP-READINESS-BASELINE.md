# Ship-readiness baseline

The synthesis artefact at the end of the v0.2 release-prep arc.
Combines the HA user landscape (`HA-USER-LANDSCAPE.md`), the
persona-led rubric (`RUBRIC.md`), and the automated test results
into a single ship-readiness assessment. Honest, evidence-grounded,
intended as the v0.1.0 baseline that future iterations measure
against.

## Executive summary

**broadsheet is ready to ship to early-adopter users with explicit
positioning.** The product is functionally complete for its stated
audience (~25% of HA users — Aesthetic Enthusiast + Family Wrangler
+ Ambient Enthusiast — plus partial coverage of the Curious
Beginner and Power User cohorts). 87% of the persona-led rubric
passes or partial-passes; 4 stories fail outright (none of them
existential to the v0.1.0 ship). 142 automated tests cover the
pure-logic surfaces. Real-world Lovelace import coverage on a
heavily-customised dashboard is 95%. The brittleness firewall
holds — zero forbidden patterns in 0.1.69 source.

**Caveats**: end-to-end browser tests, visual regression, and
performance budget are deferred to v0.1.x. Per-user dashboard
variants and surface-specific render modes are real architectural
gaps for the Family Wrangler persona — these need shipping before
broadsheet earns the "two-dashboard pattern is solved" claim. The
research is dependent on secondary sources for r/homeassistant
(direct fetch was blocked) — primary-source verification before
any major positioning changes is recommended.

**Recommendation**: tag v0.1.0, publish the addon repo, soft-launch
to the `#frontend` channel of the HA Discord + a single r/homeassistant
post framed as "an editorial-register HA frontend addon — feedback
welcome on whether the register fits your install". Do NOT pitch
as a Mushroom replacement; do pitch as an alternative for the
Aesthetic / Family / Ambient cohort.

## The claim being tested

From `PUBLIC-README-DRAFT.md`, broadsheet's stated proposition is:

> *Home Assistant, rendered as a magazine. A front-end shaped like
> a publication. Italic display serif. Newsreader body. Pages, not
> screens. Prose, not specs. Adapts to whatever you already have
> in HA.*

Operationalised as nine concrete claims:

1. Installs as an HA add-on, boots in <30s, auto-authenticates via
   the supervisor token, no `.env` to fill
2. Renders 8 core editorial-register pages that adapt to discovered
   areas/entities/persons without configuration
3. Lets users compose custom pages from 11 typed primitives via a
   visual builder — no YAML, no JSON
4. Imports existing Lovelace dashboards via 27 translators with a
   per-card coverage report
5. Evaluates Jinja templates inline so mushroom-template-card
   content renders live state
6. Pulls historical data via the stable WS API (sparkline primitive)
7. Plugin contract for extending without core changes
8. Holds the brittleness firewall — no HA-DOM scraping, only stable
   contracts
9. Ambient + family-readable + wall-tablet niches that the
   mainstream HA frontend doesn't address

The rubric tests each of these against real HA-user needs.

## The landscape we're shipping into

From `HA-USER-LANDSCAPE.md`, condensed:

- **5 personas**: Curious Beginner (~35%), Aesthetic Enthusiast
  (~25%), Family Wrangler (~20%), Power User (~15%), Ambient
  Enthusiast (~5%).
- **10 use cases**: lighting universal; climate / energy / security
  high; presence / media medium; weather / scenes / maintenance /
  calendar lower.
- **8 dashboard styles** in the wild, dominated by Mushroom (5,000★),
  Bubble Card (4,200★), and Tile-based (HA built-in default).
- **Surface mix**: phone ~70%, wall tablet 2nd most common, desktop
  universal, Cast persistent, eInk emerging.
- **The 10 convergent pain points**: family-shareable dashboards
  unsolved (#1), UI editor breaks at depth-2, conditional visibility
  forces YAML, default-dashboard auto-overrides, Lovelace migration
  one-way, wall-tablet authoring is unique pain, voice reliability,
  presence detection, entity sprawl, no per-user dashboards.

The single most-cited dashboard success metric is **"Spouse
Approval Factor" / "Wife Approval Factor"** — the only dashboard
showcases that get sustained engagement are the ones that pass
the household-readability test.

## Coverage scorecard

### Rubric (30 stories)

| Epic | Pass | Partial | Gap | % rendered |
|---|---|---|---|---|
| E1 Curious Beginner | 3 | 2 | 0 | 100% |
| E2 Aesthetic Enthusiast | 4 | 1 | 0 | 100% |
| E3 Family Wrangler | 1 | 2 | 2 | 60% |
| E4 Power User / Templater | 3 | 1 | 1 | 80% |
| E5 Ambient Enthusiast | 2 | 2 | 1 | 80% |
| E6 Cross-cutting platform | 4 | 1 | 0 | 100% |
| **Total** | **17 (57%)** | **9 (30%)** | **4 (13%)** | **87%** |

### Automated test suite (Phase E)

| Suite | Tests | Status |
|---|---|---|
| Jinja evaluator | 51 | ✅ all pass |
| Lovelace translators | 32 | ✅ all pass |
| Moment-sensor heuristics | 27 | ✅ all pass |
| Block contract | 22 | ✅ all pass |
| Brittleness firewall scan | 1 | ✅ 0 violations |
| Importer integration (17-card fixture) | 9 | ✅ 14/17 = 82% rendered |
| **Total** | **142** | **All passing in 931ms** |

### Real-world Lovelace import (canary install)

| Run | Visible cards | Clean | Partial | Skipped | Rendered |
|---|---|---|---|---|---|
| Phase 3 final (0.1.67) | 88 | 27 | 57 | 4 | **95%** |

The "88 visible cards" figure is meaningful — it's the count after
recursive translators expand layout-card / stack-in-card /
conditional wrappers, revealing children that earlier versions
counted as a single unsupported wrapper. The 4 still-skipped are
decorative empty mushroom-template-cards (recognised as visual
spacers, classified `partial` since 0.1.67 — actually 0/88 = 0%
truly skipped on the latest build).

## What broadsheet is genuinely good at

The strongest fits per the rubric + landscape research:

### 1. Editorial register for the Aesthetic Enthusiast cohort

The italic display serif + warm off-black + amber accent +
four-font Google stack lands in the same aesthetic space as
Frosted Glass theme (~860★) and the Ambient Glass community concept
— but as a complete frontend, not a CSS skin. Every primitive
ships in the register; Hero / Eyebrow / Explainer / OutLine
provide consistent typography across plugin pages too.

**Evidence**: P2 epic 4/5 pass, the canary's renders qualitatively
read as "considered" not "generic", `harold.local` (the source
register) was the inspiration for harold.com's published editorial
site treatment.

### 2. Lovelace importer with realistic coverage

27 translators + Jinja evaluator + recursive wrappers achieve **95%
rendering coverage on a heavily-customised real-world dashboard**.
This is a category nobody else in the HA ecosystem fills. Mushroom
→ Tile migration is currently a manual rebuild project; broadsheet
turns it into a 3-step UI flow with an honest coverage report.

**Evidence**: `RUBRIC.md` P4-S4 passes. The translation matrix is
documented per-card with notes about what's lost. The integration
test enforces 80%+ coverage on a representative fixture.

### 3. Custom-page builder without YAML

The structured per-block editor + drag-to-reorder + slug rename +
duplicate + save indicator + live preview cover the depth-2
nesting failure that the HA UI editor hits. Nothing in the canary's
custom pages has required hand-editing JSON since the structured
action editor shipped (0.1.69).

**Evidence**: P1-S3, P2-S2 pass. The action-grid raw-JSON wall is
gone. `CUSTOM-PAGES-GUIDE.md` walks the full flow.

### 4. Ambient / presence-aware imagery surfaces

`/emanations` + the per-person painting cards on `/` + the
Ghost Cloud time-tube renderer plug into the niche the WallPanel +
e-ink + AI-generated art crowd inhabits. The ambient register is
underserved by mainstream HA frontends.

**Evidence**: P5 epic 4/5 stories pass or partial. The canary's
moment view already runs this on the production wall tablet.

### 5. Plugin contract that holds the brittleness firewall

5-surface plugin contract (pages / renderers / settings / static
assets / discovery contributors), proven by `@broadsheet/emanations`
exercising every surface, documented in `PLUGIN-AUTHOR-QUICKSTART`.
The firewall scan finds zero violations across 4 packages of
runtime source.

**Evidence**: P4-S1 + P4-S3 + E6-S1 all pass. The brittleness-
firewall test is now a CI gate.

### 6. Sparkline as the first historical-data primitive

~1KB SVG renderer pulling from HA's stable `history/history_during_period`
WS API, no Chart.js dependency, refetches on entity/hours change,
live current value alongside the trend line.

**Evidence**: P2-S3, P5-S2 pass. The mini-graph translator
emits sparklines cleanly.

## Honest gap inventory

The 4 gaps + 9 partials, prioritised by user-value × cost-to-fix.

### Gap 1 (HIGH) — P3-S4: Per-user / per-surface dashboard variants

**The single biggest unmet rubric story.** Family Wrangler persona
(~20% of HA users) maintains TWO completely separate dashboards
today — broadsheet's `hiddenFromNav` lets them author them in one
place but they're still served identically to every viewer. There's
no "viewer = household" vs "viewer = power-user" branching.

**Cost to fix**: Medium-large. Either (a) a "presets" mechanism
where `/wall` / `/family` / `/power` are different curation contexts
loaded by query string (~1 day), or (b) actual per-HA-user curation
overrides (~3-5 days).

**Workaround for v0.1.0**: Document the `hiddenFromNav` pattern
+ multiple-pages strategy in `CUSTOM-PAGES-GUIDE`. Honest about
the limitation.

### Gap 2 (MEDIUM) — P3-S5: Surface-specific render mode

Same blocks render the same way on phone + tablet + desktop beyond
CSS media queries. No "wall mode" / "phone mode" intentional
adaptation.

**Cost to fix**: Medium. A `pageDisplayHints` field per page
consumed by primitive renderers (`{ wall: { largerTaps: true,
hideExplainer: true }, phone: { compactHeader: true } }`) — ~2
days.

**Workaround for v0.1.0**: Page width pick (narrow / default / wide)
already covers ~60% of the surface adaptation need. Document the
pattern.

### Gap 3 (LOW) — P4-S5: Re-import to update existing custom page

Importer always creates a new page. No sync-update path for a
source dashboard that's been edited in HA after import.

**Cost to fix**: Medium. Detect existing custom-page with the
same source-derived slug → offer update vs create-new → preserve
hand-edits where possible. ~1.5 days.

**Workaround for v0.1.0**: Delete + re-import is fine for now.
Document the workflow.

### Gap 4 (LOW) — P5-S5: Cast / e-ink / non-standard surfaces

No documented Cast workflow. No e-ink render mode. Cast does work
in principle (it's just a browser) but isn't intentional yet.

**Cost to fix**: Documentation effort (~30 mins for a Cast recipe).
The e-ink mode would be a longer plugin-shape effort.

**Workaround for v0.1.0**: Ship a one-page "How to Cast broadsheet"
recipe in the docs.

### Partial 1 (MEDIUM) — P3-S2: Preset page templates

Family Wrangler persona builds the same wall-tablet page over and
over. Today they start from blank.

**Cost to fix**: Small (~half day) — ship 3-4 reference page defs
("Wall tablet morning" / "Energy at a glance" / "Family status
board") as JSON in `static/preset-pages/` + a "Start from preset"
button on `/settings/pages/new`.

### Partial 2 (LOW) — P2-S4: Documented theme-override

CSS vars exist but no documented per-install override mechanism.

**Cost to fix**: Small (~1-2 hours). Add a `themeOverrides` curation
field that injects CSS into a `<style>` tag on the SPA shell + a
`/settings/theme` panel.

### Partial 3 (LOW) — P5-S3: Heavy-renderer documentation

PLUGIN-AUTHOR-QUICKSTART covers the basic plugin shape but not
heavy renderers (Three.js / D3 / canvas).

**Cost to fix**: Documentation (~30 mins) — extract the Ghost Cloud
plugin's pattern into a new section.

### Partial 4 (LOW) — P5-S4: Explicit offline-state UX

Pages don't blank on disconnect (good), but service-call buttons
silently fail (less good).

**Cost to fix**: Small (~1-2 hours). A "disconnected" indicator +
disable + tooltip on action surfaces.

### Partial 5 (LOW) — E6-S2: Pi4-class performance baseline

Performance is fine on the canary (i5-class) but not measured on
the modal HA install (Pi4).

**Cost to fix**: Establish the test rig, run measurements (~half
day). Likely no code changes needed, just baselining.

### Partials 6-9 (DEFERRED to v0.2.x)

- P1-S4 (better "missing entity" nudge), P1-S5 (non-tech-user test),
  P3-S1 (preset templates dual of Partial 1), P4-S2 (Jinja for
  loops). All small individually, none ship-blocking.

## The v0.1.x backlog

Derived from the gaps + partials above, ordered by impact:

1. **Cast workflow recipe + e-ink quickstart** (~30 mins) — Gap 4
2. **Preset page templates library** (~half day) — Partial 1
3. **Theme override hook + /settings/theme panel** (~1-2 hours) — Partial 2
4. **Disconnected-state UX + button disable** (~1-2 hours) — Partial 4
5. **Surface-specific render mode (`pageDisplayHints`)** (~2 days) — Gap 2
6. **Re-import to update existing page** (~1.5 days) — Gap 3
7. **Per-user / per-surface dashboard variants** (~1-5 days) — Gap 1 (the substantial one)
8. Heavy-renderer doc section (~30 mins) — Partial 3
9. Pi4 performance baseline (~half day) — Partial 5
10. Jinja `{% for %}` loops (~half day) — Partial 6

Items 1-4 are all <half-day each. A Phase G "polish round" before
v0.1.0 launch could reasonably cover items 1-4. Items 5-7 are the
substantive v0.1.x work.

## Ship recommendation

**Recommended position for v0.1.0**:

> "broadsheet is an editorial-register Home Assistant frontend
> add-on. It adapts to whatever's in your install. It includes a
> custom-page builder + a Lovelace importer with 95% real-world
> coverage. Built primarily for the wall-tablet, family-readable,
> and ambient niches that the mainstream Mushroom / Bubble / Tile
> dashboards don't aim for. Not a Mushroom replacement. v0.1 — early."

**Recommended audience for the soft launch**:

- HA Discord `#frontend` channel — feedback-seeking framing
- Single r/homeassistant post — "I built X, would love feedback on
  whether the editorial register fits your install"
- HA forum thread under "Frontend" — show + tell, not pitch
- NOT yet on r/SmartHome or general home-automation YouTube circles
  — those audiences want Mushroom / Bubble polish, not
  category-creating alternatives

**Disclaimers to ship in PUBLIC-README**:

- v0.1 is an early release; expect rough edges
- Plugin loading is static (not yet drop-in); requires building
- Per-user / per-surface dashboard variants not yet supported
- Re-import to update existing pages not yet supported
- Voice surface is not addressed
- e-ink rendering not yet supported

## What this baseline does NOT measure

- **Real first-time-user experience** — measured by dogfooding ONE
  install (canary). Need 5-10 unique installs to validate.
- **Performance on Pi4-class hardware** — not measured.
- **Visual coherence under accessibility settings** (high-contrast
  mode, large text, reduced motion) — not measured.
- **Browser compatibility beyond Chromium** — Safari + Firefox
  rendering not tested.
- **Plugin author developer experience** — only the bundled plugins
  validate the contract; an external plugin author hasn't tried it.
- **Soft-launch reception** — by definition.

The honest framing: this is the v0.1.0 baseline, not the v0.5
maturity assessment. The unmeasured items become the v0.1.x +
v0.2 measurement targets.

## Methodology + reproducibility

This baseline is reproducible from:

- `HA-USER-LANDSCAPE.md` — the user research (sources cited)
- `RUBRIC.md` — the persona-led story matrix with pass/partial/gap
- `packages/core/tests/` — the automated test suite (`pnpm --filter @broadsheet/core test`)
- The canary install at `homeassistant.local:8123` (manual coverage measurements documented in BUILD-LOG.md)

To re-run the rubric measurement:
1. `pnpm install`
2. `pnpm --filter @broadsheet/core test` — runs Vitest suite
3. Walk through `RUBRIC.md` updating any pass/partial/gap that has
   changed since the last run
4. Update the scorecard counts in this document
5. Commit

The intended cadence is "once per minor version" (v0.2, v0.3, etc.) —
the baseline tracks how broadsheet matures against real user needs
over time, not just against its own internal goals.

## Sources

- `HA-USER-LANDSCAPE.md` (research synthesis)
- `RUBRIC.md` (30 user stories)
- `BUILD-LOG.md` (build history with version-by-version coverage)
- `TRANSLATOR-MATRIX.md` (per-card translation reference)
- `PLUGIN-AUTHOR-QUICKSTART.md` (plugin contract)
- `CUSTOM-PAGES-GUIDE.md` + `IMPORTER-GUIDE.md` (end-user docs)
- `packages/core/tests/` (automated rubric tests)
- `.github/workflows/test.yml` (CI gate)
- The canary install (production-bench since 0.1.x)
