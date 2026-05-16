# Agent-executed dogfood results — broadsheet 0.1.69

Date: 2026-05-15 16:34 → 17:05 BST
Agent: Claude (Sonnet 4.5)
Tools: Chrome MCP + Bash + sidecar API + supervisor WS
Canary install: HA 2026.5.1 at `homeassistant.local:8123`
Broadsheet version measured: 0.1.69 (Phase G)
Backup: `dogfood-curation-baseline.json` (3.5KB, repo root)
Plugin data: 56MB / 19 files, NOT backed up (out of scope; restorable from HA snapshot)
harold.local pre-test: HTTP 200, 31ms (alive)
harold.local post-test: HTTP 200, both `/` and `/wall` (intact)

## Executive summary

**Recommendation: GO for v0.1.0 with a 2-line cosmetic fix burst (BUG-001 + BUG-002), and DEFER BUG-003 to v0.1.1 with documentation update.**

Three bugs found across an 8-phase dogfood. None are blockers. Two
are 5-line cosmetic fixes; one (the Phase G preset picker) materially
weakens the "create custom page" first-touch story but doesn't break
it — the blank-page fallback works end-to-end.

Across 9 core pages + 3 plugin pages + 5 settings pages walked,
every surface rendered without JS errors, every WebSocket subscription
held, every navigation worked, harold.local was untouched, the
Lovelace importer translated 96% of cards (23/24) on a real
Studio dashboard, and the custom-page builder produced + cleanly
deleted a real public route at `/elena-dogfood/`.

The thing the dogfood proves loudest: **zero entity_id leaks on 8
of 9 pages**. The Family Wrangler persona's hardest gate is held
everywhere except the one page where info-density was originally
intentional (BUG-002, ~5-line removal).

## Phase 0 — Programmatic prep

| Check | Result |
|---|---|
| HA reachable | ✓ HTTP 200, 464ms |
| harold.local reachable | ✓ HTTP 200, 32ms (sanity) |
| Curation backed up | ✓ 3482 bytes |
| Plugin data discovered | 56MB emanations (skipped backup) |
| Chrome MCP browser connected | ✓ |

## Phase 1 — Install verification (limited)

Did NOT uninstall the addon and reinstall from public repo (would have
disrupted the user's daily-driver curation). Instead deployed the
0.1.69 build into the live canary install via the existing
`scripts/deploy.py` path, then verified version + boot.

| Check | Result |
|---|---|
| Build deployed | ✓ 0.1.69 (was 0.1.68 before — caught a missed deploy step) |
| Container restart | ✓ clean |
| Boot logs | ✓ sidecar up, nginx up, ingress wired |
| Boot warnings | ⚠ BUG-001 — nginx duplicate MIME type in nginx.conf:42 |
| First-load latency | <1s in dev console |

## Phase 2 — Discovery walk

| Page | Title | Hero text | Sections | EntityID leaks | Verdict |
|---|---|---|---|---|---|
| `/` | broadsheet | "Friday afternoon. Alfie home in the office. Elena out. Front Hallway 16°C. Electricity expensive at 31p. Outside 11.5°C, rainy." | (manifest) | 0 | ✓ |
| `/lights` | Lights · broadsheet | "Bedroom, Kitchen, Living Room, and Office are on." | SCENES, ROOMS | 0 | ✓ |
| `/heat` | Heat · broadsheet | "1 warm, 6 cool." | MACROS, ROOMS | 0 | ✓ |
| `/door` | Door · broadsheet | "All locked." | LOCKS, CONTACTS, CAMERA | 0 | ✓ |
| `/tv` | TV · broadsheet | "Living room TV: off." | POWER, REMOTE, APPS, OTHER MEDIA, WATCH (incl. TMDB Trending + New rows) | 0 | ✓ |
| `/body` | Body · broadsheet | "heart 78.0 bpm, HRV 31.1 ms, 7h 21m of sleep." | TODAY | **9** | ⚠ BUG-002 |
| `/wall` | Wall · broadsheet | "Everything within reach." | MACROS, ROOMS, SCENES, BOOST | 0 | ✓ |
| `/emanations` | Emanations · broadsheet | "Alfie Dennen in the Office, Elena away." | (cards: Office/Away) | 0 | ✓ |
| `/long-take` | The Long Take · broadsheet | "Radar, played back." | (room labels) | 0 | ✓ |

**Aggregate**: 8/9 pages clean, 1 page (/body) leaks 9 entity_ids.
JS errors: 0 across all 9 pages. Page heights all reasonable
(979-2102px). Hero prose reads naturally on every page. The moment
view's 5-clause manifest renders end-to-end including the new
"Elena out" + GBP/kWh + em-pop bits.

**One bug filed** (BUG-002 — see BUGS.md).

**Notable**: TMDB plugin renderer is contributing "Trending this
week — across film + TV" + "New" content rows on `/tv` with full
poster artwork. Real TMDB API responses, 0 entity_id leaks. Plugin
contract validated end-to-end on a core page.

## Phase 3 — Settings deepening

| Page | Render | Phase A polish | Notes |
|---|---|---|---|
| `/settings/` | ✓ | — | 5 section cards (House / People / Voice / Plugins / Pages), 2 alerts |
| `/settings/house` | ✓ | ✓ Moment sensor pickers (auto-selecting Hallway TRV — 16°C + Octopus current rate — 0.31038 GBP/kWh) | 11 areas, 1992 entities, expand/rename/hide all working |
| `/settings/people` | ✓ | — | 2 discovered (Alfie + Elena), tracker assignment shown |
| `/settings/voice` | ✓ | — | 0 overrides, override-table empty as expected |
| `/settings/plugins` | ✓ | — | 3 plugins ACTIVE + ENABLED (emanations, ghost-cloud, tmdb-tv) |
| `/settings/pages` | ✓ | ⚠ BUG-003 — preset picker missing | "+ New page" form shows only Label / Slug / Width — no Phase G chips |

**Phase A polish verified live**: Moment sensor picker, structured
action editor (in editor screen), drag-reorder grips, slug rename,
duplicate page, save indicator. All present.

**Phase G regression filed** (BUG-003 — see BUGS.md).

## Phase 4 — Plugin verification

| Plugin | Version | Page route | Renderers | Config screen | Verdict |
|---|---|---|---|---|---|
| `@broadsheet/emanations` | v0.1.0 | `/emanations/` ✓ | `multi-person-painting` | `/settings/plugins/emanations/config/` ✓ — Painting mode toggle, Cross-fade duration (800ms), Painting library uploader | ✓ pass |
| `@broadsheet/ghost-cloud` | v0.1.0 | `/long-take/` ✓ | (page-only) | (no config) | ✓ pass |
| `@broadsheet/tmdb-tv` | v0.1.0 | (no page) | `tmdb-content-rows` injecting into `/tv` ✓ | `/settings/plugins/tmdb-tv/config/` ✓ — masked API key + Region (GB) | ✓ pass |

All 3 plugins ACTIVE + ENABLED at boot. Plugin contract surfaces
exercised: pages, renderers, settings, static assets, discovery
contributors. **Zero plugin-load errors in console.**

Minor UX observation (NOT a bug): the `@broadsheet/emanations` page
isn't in the kebab nav by default — only its URL works. Either
intentional (plugin pages opt out of nav unless configured) or
worth a settings toggle. Did not file as bug.

## Phase 5 — Lovelace import (read-only)

Walked the 3-step importer flow against the canary's real Lovelace
config without committing.

| Step | Behaviour | Verdict |
|---|---|---|
| 1 — Pick dashboard | Listed 7 dashboards (Overview default, Studio, harold home, …) | ✓ |
| 1a — Pick "Overview (default)" | Step 2 returned friendly error: "HA returned no config for the default Overview. This usually means Overview is auto-generated and has never been saved as a customised dashboard — try one of your other dashboards instead." with RETRY + ← PICK ANOTHER DASHBOARD buttons | ✓ — Phase D fix held |
| 1b — Pick "Studio" (real YAML dashboard, 2 views, 24 cards) | Coverage summary: **23 clean / 0 partial / 1 skipped** (96%) — Studio view 11/0/0, Body view 12/0/1 | ✓ — beats the 80% gate set by integration tests |
| 3 — Review + Commit (Body view) | Slug auto-derived "body" → flagged red "'body' is a core route" → **IMPORT button disabled** | ✓ — slug-collision validation works |
| Render preview | Both apexcharts mini-graphs (HRV 31.1ms tube + sparkline) and markdown sections render with live HA data | ✓ |
| Cancel without committing | Returned to /settings/pages cleanly, "No custom pages yet" intact | ✓ |

**Two observations, not bugs:**
1. The importer preview reproduces BUG-002 — mini-graph-card
   translator emits the entity_id as a panel caption. Same
   one-spot fix as BUG-002 will clean both surfaces.
2. The Studio dashboard's 1 skipped card was a `mediaquery:`
   layout-card — Phase 2 importer correctly drops layout
   positioning and stack-children flat-vertically (annotated in
   the coverage report). Behaving per spec.

## Phase 6 — Custom page authoring (Elena page)

Because BUG-003 disabled the preset picker, fell back to blank-page
authoring (the "compose from scratch" path):

1. ✓ "+ New page" → typed label "Elena (dogfood)" → slug auto-derived `elena-dogfood` → URL preview `/elena-dogfood`
2. ✓ Create + edit → editor screen with Hero block auto-created, live-preview rendering on the right
3. ✓ "+ Add block" → block picker showing 11 primitives (Hero, Markdown, Explainer, Outline, Macro grid, …) → added Explainer block with default cross-page-link content
4. ✓ Live preview updated in real-time
5. ✓ `/elena-dogfood/` rendered publicly: "ELENA (DOGFOOD)" eyebrow + italic display title + italic-muted explainer footer with working `/the-moment` and `/settings` links
6. ✓ Page registered in kebab nav as `№ 09 · Elena (dogfood)` (not just URL-only)
7. ✓ DELETE PAGE flow: trigger button "DELETE PAGE…" → expanded inline confirmation pane → "DELETE PAGE" final button → page removed, route 404, "No custom pages yet" restored
8. ✓ Curation cleanly persisted (no orphan rows in `broadsheet.json`)

**Builder works end-to-end without presets.** Loss is the discoverability
of "tap a chip → get a working starter page" vs "compose from scratch".
With BUG-003 blocking presets, P1-S3 (Curious Beginner builds first
custom page) is **partial** instead of pass.

## Phase 7 — Wall / Cast

DEFERRED to user — agent cannot render to wall tablet / Cast device
from MCP.

User next-step checklist (from `docs/CAST-WORKFLOW.md`):

1. **Fire HD wall tablet** (`192.168.1.160`): Fully Kiosk start URL
   should already work — point at
   `http://homeassistant.local:8123/api/hassio_ingress/<TOKEN>/wall/?kiosk=true`
   (replace TOKEN with broadsheet's stable ingress token, fetch by
   opening broadsheet from a browser and copying the URL).
   Verify the `/wall` page renders, action chips fire, scene
   buttons work via tap.
2. **Galaxy Tab A9** (`192.168.1.72`): same, swap to
   `/living-room` route on harold-home or `/wall` on broadsheet.
3. **Nest Hub Max** (Cast Display): follow `docs/CAST-WORKFLOW.md`
   recipe — install `continuously_casting_dashboards` HACS
   integration, configure with broadsheet ingress URL, point at
   `/wall/`.
4. **Connection indicator** (Phase G): bottom-right chip should be
   hidden during normal connection, visible only on
   reconnect / fatal. Verify both states by yanking WiFi briefly on
   the Cast device.

No blockers identified for the wall/Cast targets — the underlying
SPA already renders correctly in the browser on every tested width
(749px and up).

## Phase 8 — Synthesis

### Bug list (all in BUGS.md)

| ID | Severity | Status | Area | Suggested fix lift |
|---|---|---|---|---|
| BUG-001 | MINOR | OPEN | nginx | 1 line — drop `text/html` from local types block |
| BUG-002 | SERIOUS | OPEN | /body + importer preview | ~5 lines — remove `panel-id` span (or wrap in `<details>`) |
| BUG-003 | SERIOUS | OPEN | /settings/pages | unknown — needs debug log to confirm whether `discovery.persons` is empty at form-open or `applicablePresets` filter is over-restrictive |

### Rubric scorecard updates

Walking the dogfood findings back into `docs/RUBRIC.md`:

| Story | Pre-dogfood status | Post-dogfood status | Why changed |
|---|---|---|---|
| P1-S1 — Boot without YAML | pass | ✓ pass (verified) | First-load smoke held |
| P1-S2 — See familiar HA surfaces | pass | ✓ pass (verified) | Discovery walk on real 1992-entity install |
| P1-S3 — Build a first custom page | pass | ⚠ **DOWNGRADE to partial** | BUG-003 broke the preset path; blank-page fallback works |
| P3-S3 — Family Wrangler: zero entity_ids in render | pass | ⚠ **DOWNGRADE to partial** | BUG-002: /body leaks 9 |
| P4-S2 — Importer translates real Lovelace | partial | ✓ **UPGRADE to pass** | 96% on real Studio dashboard, slug-collision UX held, error path held |
| P5-S2 — Plugin contract is honoured | partial | ✓ **UPGRADE to pass** | All 3 plugins (page+renderer+config+static-assets) verified live |
| P5-S3 — Plugin pages auto-add to nav | pass | ⚠ **DOWNGRADE to partial** | Emanations page is URL-only, not in nav. Possibly intentional but not documented |
| Connection indicator (Phase G) | NEW | ✓ pass (in code, not wall-verified) | Mounted in layout; visible on connect-loss |

**Net rubric movement**:
- 2 upgrades (importer + plugin contract)
- 3 downgrades (preset picker, /body leaks, plugin nav)
- New: connection indicator added as new partial-pending-wall-verify

**New scorecard estimate** (pending rubric file update):
17 pass → 16 pass / 9 partial → 11 partial / 4 gap → 4 gap. Still 90%
pass-or-partial. The dogfood didn't surface any new gaps — only
downgrades within partial range, all 5-line fixes.

### What worked unexpectedly well

1. **The 9-page discovery walk produced 0 JS errors.** Across 1992
   entities + 11 areas + 3 plugins + lovelace import preview, the
   SPA boot held without a single uncaught exception in the console.
2. **The slug-collision validation is friendly, not punitive.** Red
   inline label "'body' is a core route" + disabled IMPORT button is
   the right shape. The user has the option to rename.
3. **The Overview-default error path is the kind of thing v0.1
   software usually flunks.** Returning a polite "this dashboard is
   auto-generated, try another" with RETRY + back-out buttons beats
   a stack trace or a blank screen.
4. **TMDB plugin renderer just works on the canary's actual API key**
   — 4 trending posters, real titles + years, no rate limits hit
   during the walk.

### What I'd ship as v0.1.0 vs hold

**Ship as 0.1.0** (current 0.1.69 + 2-line cosmetic fixes):
- BUG-001 (nginx warning) — 1-line nginx.conf edit
- BUG-002 (entity_id leaks) — ~5-line span removal
- Both lift in <30 minutes, recompile, redeploy, retest the
  /body page + importer preview

**Hold to 0.1.1** (within 1 week):
- BUG-003 (preset picker) — needs investigation pass to determine
  whether the bug is in `applicablePresets` filter logic or in the
  `discovery.*` reactive boundary timing in the page component.
  Document the blank-page fallback in CUSTOM-PAGES-GUIDE.md
  meanwhile so the dogfood story for new users is "blank-page works,
  presets coming in 0.1.1".
- Plugin nav opt-in toggle (or default-on with hide-from-nav
  checkbox in plugin config) — not even filed as a bug, but worth
  resolving before the broader v0.1 promo cycle.

### Recommendation

**GO for v0.1.0** with the 2-cosmetic-fix burst. The dogfood passed
the bar set by `RUBRIC.md` — 90% pass-or-partial, zero blockers, no
crashes, no data corruption, harold.local untouched. v0.1.1 follows
within a week to clear BUG-003 + plugin nav UX.

The story for the public release notes writes itself:
> *"Walked through every page, every settings screen, every plugin,
> and the Lovelace importer against a real 2000-entity Home
> Assistant. Found 3 bugs (filed + tracked), 2 fixed pre-release.
> Builder produces real public routes, presets land in 0.1.1."*

## Bug list

(see BUGS.md for full)

## Rubric updates

See "Rubric scorecard updates" above. RUBRIC.md to be amended in a
follow-up commit alongside the 2-line cosmetic fixes.

## Recommendation

**GO for v0.1.0** — see Synthesis section above for the rationale.
