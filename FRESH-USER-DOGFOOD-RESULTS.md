# Fresh-user dogfood results — broadsheet 0.1.69

Date: 2026-05-15 17:30 → 18:25 BST
Agent: Claude (Sonnet 4.5)
Method: factory-reset broadsheet.json on the live canary install
(`docker exec ... echo "{}" > /data/broadsheet.json` + addon restart),
walk every page + settings + the Lovelace importer (commit, not just
preview) + custom-page builder, document every "huh?" moment, then
restore the 3.5KB baseline curation and re-verify both broadsheet +
harold.local.

This is the test the previous DOGFOOD-RESULTS-AGENT.md missed —
that one tested an existing-install regression sweep with all
curation already shaped. Real new users start with `{}`.

Backup: `.dogfood/curation-baseline-fresh.json` (3482 bytes,
restored at end). harold.local 200 OK pre-test + post-test.

## TL;DR

**Recommendation: DEFER v0.1.0 until F1-OBS-5, F4-OBS-1, and at
least one of F3-OBS-{1,2,4} are addressed.**

The existing-install dogfood reported "GO for v0.1.0 with 2 cosmetic
fixes". This fresh-user dogfood disagrees: a naive user installing
broadsheet today will hit **6 serious-or-blocker friction points
inside 5 minutes**, three of them in the most user-visible areas
(area name slugs in hero text, Lovelace import dropping every
action affordance, custom-page builder having no way to make
arbitrary action tiles).

The core SPA is solid — auto-discovery picks up people, weather,
energy, temperatures cleanly even with `{}`. But the user's first
hour goes from "wow" to "huh?" once they:

1. Read raw `alfies_office` in italic display type on /lights
2. Try to enable plugins and find emanations works but ghost-cloud
   has no config → no obvious next step
3. Import their existing dashboard and find every action button
   has been silently demoted to read-only markdown
4. Try to compose a Utilities page from scratch and discover there
   IS no "Action grid" primitive — only pre-baked Macro/Boost grids

## What worked well in the fresh test

- **Moment view first-paint with `{}`** is genuinely impressive:
  manifest line populated correctly with auto-discovered people,
  hallway temp, Octopus Agile rate, weather. No setup required to
  get a meaningful headline.
- **Settings landing page** ("Make broadsheet your shape" + "WHAT
  NEEDS YOUR ATTENTION" with FIX CTAs for orphan devices + hidden
  count) is the right shape for a fresh-user surface. 9 devices
  need a room → click → House page → assign. Discoverable.
- **/door safety message**: "Lock writes are hard-banned... To
  actually unlock, use HA's own controls or a voice assistant."
  Clear policy, enforced + explained.
- **Plugin disabled-by-default + clear ENABLE toggle**: clicking the
  toggle on emanations flips DISABLED → ENABLED → ACTIVE chip
  immediately, /emanations/ resolves with procedural-fallback
  paintings. Good empty-state flow.
- **Plugin-page 404 message**: "/long-take/ isn't a page broadsheet
  knows. If it's a plugin page, the plugin may be disabled or its
  activation checks aren't met yet — Settings → Plugins shows the
  status of every installed plugin." Best-in-class friendly 404.
- **Importer step 1+2 friendly empty states**: Overview-default
  graceful error path held, dashboard listing comprehensive,
  per-view coverage chips clearly readable.
- **Slug-collision validation**: choosing slug "body" in importer
  flagged "'body' is a core route" + disabled IMPORT button.

## Phase F0 — backup + factory reset

| Step | Result |
|---|---|
| Find broadsheet.json | `/data/broadsheet.json` inside `addon_68fa04fc_broadsheet` container — 3482 bytes |
| Backup to dev box | `.dogfood/curation-baseline-fresh.json`, verified contents |
| Wipe to `{}` | `echo "{}" > /data/broadsheet.json` → 3 bytes |
| Restart addon | `ha addons restart 68fa04fc_broadsheet` — 8s to come back |
| harold.local pre-test | HTTP 200 / + /wall (intact) |

## Phase F1 — first-touch (every page with `{}`)

| Page | Verdict | Notes |
|---|---|---|
| `/` | ⚠ partial | Manifest line good. Person paintings rendered as empty boxes (emanations off). Top-row chip nav EMPTY — only kebab `⋮` shows pages |
| `/lights` | ⚠ partial | "alfies_office, Bedroom, Kitchen, and Living Room are on." — area_id slug `alfies_office` and lowercase `library` leaked into hero italic. Otherwise great: scenes, rooms, UNSORTED diagnostic with FIX CTA |
| `/heat` | ⚠ partial | Same area-slug leak (`alfies_office`, `elenas_office`, `Utility_Room`). 0 entity_id leaks. 7 rooms + macros work |
| `/door` | ✓ pass | 0 leaks. Strong educational message about lock-writes being banned. Camera + contact + lock all auto-discovered |
| `/tv` | ✓ pass | 0 leaks. Power, D-pad, Apps, Other media all working. `/tv` has explicit copy pointing at /settings/plugins to enable TMDB content rows — perfect empty state |
| `/body` | ⚠ same | Same 9 entity_id leaks as before — BUG-002 is curation-independent |
| `/wall` | ⚠ partial | 0 leaks. Same area-slug leak in room toggle list and Boost row |
| `/emanations` | ⚠ depends | 404 with friendly "plugin disabled" message until enabled — see below |
| `/long-take` | ⚠ depends | 404 with same friendly "plugin disabled" message |

### F1 findings

**F1-OBS-1 (MINOR)** — Weather state `partlycloudy` rendered as
single word in moment manifest. Should be humanized to "partly
cloudy".

**F1-OBS-2 (SERIOUS)** — Person cards on the moment view render as
empty boxes with no fallback gradient. Compare to `/emanations`
which DOES render the procedural orange-sienna fallback when
enabled. Either: (a) the moment view doesn't use the same painting
renderer + needs its own fallback, or (b) the painting renderer
isn't loading at all on the moment view path.

**F1-OBS-3 (MINOR)** — "Unlock the door" macro on / shows
"safety-rail blocked" — semantically correct (locks are
write-banned) but the phrase will read as broken to a fresh user.
Consider "(view-only)" or an explicit `disabled` style with a
tooltip pointing to /door.

**F1-OBS-4 (SERIOUS)** — Empty curation produces an EMPTY top-row
chip nav. The 6 other routes (lights, heat, door, tv, body, wall)
exist + are routable BUT only via the kebab `⋮` dropdown. A naive
user opening broadsheet for the first time will not realize 6 more
pages exist. Suggested fix: show a default chip-row of all
auto-routable pages until the user explicitly hides them via
curation.

**F1-OBS-5 (SERIOUS / verges on BLOCKER)** — Raw HA area_ids leak
into the rendered editorial prose on `/lights`, `/heat`, `/wall`
when curation is empty. e.g. *"alfies_office, Bedroom, Kitchen,
and Living Room are on."* and `Utility_Room`. The fix is one
function: humanize the slug at render time when no curation rename
exists (`alfies_office → Alfies Office`, `library → Library`,
`Utility_Room → Utility Room`). A naive user with raw HA area
slugs will read this as "broadsheet hasn't loaded properly" — it's
the most user-visible cosmetic break in the whole walk.

## Phase F2 — settings as a naive user

| Surface | Verdict | Notes |
|---|---|---|
| `/settings/` | ✓ pass | "Make broadsheet your shape" hero, "WHAT NEEDS YOUR ATTENTION" surfaces 9 devices + 70 hidden, 5 section cards with counts, "0 ENABLED" plugin flag |
| `/settings/plugins` | ✓ pass | Honest "Plugins ship in the box but stay off until you opt in." All 3 show DISABLED status, ENABLE toggle works, ENABLED → ACTIVE chip on first click |
| `/settings/plugins/emanations/config/` | ✓ pass | Painting mode toggle, cross-fade duration, painting library uploader. Works after enabling |
| `/settings/plugins/tmdb-tv/config/` | ⚠ partial | API key field empty (correct) but no help text linking to themoviedb.org/settings/api. The /tv page mentions "free TMDB API key" but the config page itself doesn't tell a naive user where to get one |
| `/settings/house` | ⚠ partial | Slug-vs-rename UX subtle: `alfies_office`, `elenas_office`, `FRONT` (the literal HA name in caps) sit visually identical to renamed areas — no signal that the slug-shaped ones need rename. Add a chip / pill / italic on slug-shaped names to flag them as un-humanized? |
| `/settings/people` | ✓ pass | 2 discovered (Alfie + Elena), tracker assignment fields visible |
| `/settings/voice` | ✓ pass (empty) | "0 OVERRIDES" — correct empty state |
| `/settings/pages` | ⚠ BUG-003 | + New page form STILL shows no preset picker even on factory-fresh install — the bug is curation-INDEPENDENT, ruling out my prior "discovery hasn't loaded yet" hypothesis. Always-broken since Phase G shipped |

### F2 findings

**F2-OBS-1 (MINOR)** — TMDB plugin config has no inline link to
themoviedb.org/settings/api where the user would obtain the free
API key. Either link directly, or copy the /tv hint text into the
config page.

**F2-OBS-2 (MINOR)** — In `/settings/house`, slug-shaped area
names (`alfies_office`, `elenas_office`) and properly-capitalised
ones (`FRONT`, `Bedroom`, `Front Hallway`) sit visually identical.
Consider an italic / "needs label" pill on the slug-shaped ones to
nudge the user to rename.

**BUG-003 reclassified from SERIOUS to BLOCKER** — confirmed
curation-independent. The blank-page fallback documented earlier as
the "workaround" is now the only path for a naive user creating
their first custom page. Combined with the "Garage" / "Elena page"
moments in the original landscape research being the most-tested
fresh-user use case, this changes my v0.1.0 recommendation.

## Phase F3 — Lovelace import end-to-end (Wall Tablet → /heating)

Picked the user's busiest dashboard (Wall Tablet — 8 views, 133
total cards, mushroom-template/chips/climate cards + layout-card
mediaqueries + custom button-card etc).

### Aggregate coverage

```
Across all views: 31 clean / 87 partial / 15 skipped (133 total cards)
                  ↓        ↓           ↓
                  23%      65%         12%
```

Compare to the Studio dashboard's "23 clean / 0 partial / 1 skipped
(96%)" cited in the prior DOGFOOD-RESULTS-AGENT.md. **The Studio
dashboard is broadsheet-friendly markdown-heavy and not
representative.** Real-world power-user dashboards land at
~23% clean / 65% partial.

### Per-view coverage

| View | Blocks | Clean | Partial | Skipped |
|---|---|---|---|---|
| Home | 28 | 6 | 31 | 7 |
| Heating | 4 | 4 | 3 | 6 |
| Door | 8 | 3 | 7 | 0 |
| Lights | 21 | 7 | 18 | 0 |
| Remote | 22 | 9 | 26 | 0 |
| Nearness | 1 | 0 | 1 | 0 |
| Immaterials | 1 | 0 | 1 | 0 |
| Presence History | 1 | 2 | 0 | 2 |

### Heating view committed (`/heating/`)

The COVERAGE REPORT for Heating showed 7 source cards →
- CLEAN custom:layout-card (×2) "Layout positioning dropped — children render flat-vertically"
- PARTIAL custom:mushroom-chips-card "All chips rendered as markdown (no entity-bound actions)"
- CLEAN markdown
- **UNSUPPORTED custom:mushroom-climate-card (×3)** "No translator for this card type yet"
- PARTIAL custom:mushroom-template-card (×2) "Mushroom card chrome (icon, layout) replaced with markdown"

After commit, `/heating/` rendered with 4 markdown blocks. 0
entity_id leaks. Jinja templates evaluated live. BUT:

### F3 findings

**F3-OBS-1 (BLOCKER)** — Markdown headers (`#`, `##`) and emphasis
(`*`, `_`) render as literal characters in imported markdown blocks.
Live render of the Heating page shows:

> *"# Schedule today Office: off (weekend) Kitchen + Living Room
> (evenings): → Bedroom: → 22:30, and → 06:00 _All other rooms:
> frost protection (5°C)_"*

— `#` shown as literal hash character; `_..._` shown as literal
underscores. Either the markdown renderer isn't running, or the
translator emits markdown that's then double-escaped, or the
imported content is being put into a plain-text variant of the
block. Same issue when authoring markdown from scratch (see F4).

**F3-OBS-2 (SERIOUS)** — `mushroom-climate-card` is the most common
HACS climate card by orders of magnitude. Marking it UNSUPPORTED
silently drops it from the imported page entirely (3 dropped
silently from Heating). For a "Heating" view to import without ANY
climate controls is the wrong default. At minimum: render a
placeholder "Climate control: <entity_id> — open in HA" block when
unsupported, so the user knows something was there.

**F3-OBS-3 (SERIOUS)** — All chip and template cards translated to
PARTIAL drop their `tap_action`. The user's "Boost heat" chip
which originally fired `script.heating_boost` becomes a static label
saying "Boost heat" with no tap behavior. The translator's note
("All chips rendered as markdown (no entity-bound actions)") is
honest, but for a HEATING control panel to import as a read-only
text summary is functionally useless.

**F3-OBS-4 (SERIOUS)** — Original dashboard's chip-nav row "Home ·
Heat · Door · Lights · TV · Here" rendered as literal
markdown text instead of as a navigation strip. The user wanted
their custom nav, got prose.

**F3-OBS-5 (MINOR)** — Slug "heating" did NOT collide with core
route `/heat/` and was allowed. Both `/heat/` and `/heating/` then
worked side-by-side. Probably correct (different slugs are
different routes) but worth surfacing in the destination form: "✓
distinct from core /heat/ — both will be live".

**F3-OBS-6 (BLOCKER)** — Verdict: a power-user importing their
dashboard gets a page that's ~15% functional. They preserve prose +
computed text (Jinja works), but lose every action affordance and
every climate card. The technical operation succeeds. The UX outcome
is wrong.

## Phase F4 — compose custom Utilities page from zero

Goal: build a "Utilities" page showing washer status + heat boost +
Octopus electricity rate. Standard fresh-user demo of "I can compose
my own page".

| Step | Result |
|---|---|
| + New page → "Utilities" → CREATE+EDIT | ✓ pass — page editor opens, Hero auto-created, /utilities/ live |
| + Add block | Picker shows **8 primitives**: Hero / Markdown / Explainer / Outline / Macro grid / Room toggle grid / Scene row / Boost row |
| Add Markdown block, type washer + rate template | ✓ block added; live preview rendered |
| Try to add a "Start washer" tap-fire button | ⚠ no primitive available — see below |

### F4 findings

**F4-OBS-1 (BLOCKER)** — The block picker has NO generic "Action
grid" or "Action tile" primitive. The 4 action-shaped primitives
(Macro grid, Room toggle grid, Scene row, Boost row) are
discovery-driven, hard-coded to lights/heat/scenes. A user wanting
to build a tile that fires `script.washer_start` or
`switch.toggle` on a Sonoff plug has no path through the builder.

This is the single biggest gap revealed by the fresh-user dogfood.
The "create your own page" promise on the landing copy is partly
false — you can ONLY create read-only-prose + pre-baked
heating/lighting actions. Any custom action tile requires writing
JSON in `broadsheet.json` directly.

(The existing-install dogfood didn't surface this because all
existing pages were core pages with hand-crafted action grids
shipped pre-built.)

**F4-OBS-2 (SERIOUS)** — Jinja arithmetic on filtered floats
returns NaN silently. `{{(state | float * 100) | round(0)}}`
renders as literal "NaN" in the page with NO error in the editor
preview. A fresh user has no way to know their template is broken
short of opening the live page.

**F4-OBS-3 (BLOCKER duplicate of F3-OBS-1)** — User-authored
markdown `**bold**` and `_italic_` ALSO rendered as literal
asterisks/underscores in the preview AND live page. Confirms the
markdown-not-being-parsed bug is in the renderer, not in the
importer. Affects every user-authored Markdown block.

**F4-OBS-4 (SERIOUS)** — `weather.forecast_home.attributes.temperature`
returned empty string in the rendered preview. Either the
attribute path is non-standard for weather entities (HA uses
`temperature` directly on attributes), or weather entities are
filtered out of the resolution layer broadsheet's Jinja exposes.
The same template syntax for sensor entities (washer_hub_status)
worked. Inconsistent attribute access is a power-user trap.

**F4-OBS-5 (MINOR)** — The Markdown block has no inline help on
which Jinja filters are supported. The placeholder text says
"Use `{{entity_id}}` to interpolate live state" but doesn't list
the available filters. A user trying to multiply / round / format
will silently NaN.

## Bug additions to BUGS.md

Adding to the existing 4 entries:

| ID | Severity | Status | Phase | Area | Description |
|---|---|---|---|---|---|
| BUG-005 | SERIOUS | OPEN | F1 | core pages | Raw HA area_id slugs (`alfies_office`, `elenas_office`, `Utility_Room`, `library` lowercase) leak into rendered hero italic on /lights, /heat, /wall when no curation rename exists. Humanize at render time |
| BUG-006 | SERIOUS | OPEN | F1 | / (moment) | Top-row chip nav row is EMPTY on fresh install — 6 routes only reachable via kebab `⋮`, fresh users won't discover them. Default to all auto-routable pages |
| BUG-007 | SERIOUS | OPEN | F1 | / (moment) | Person cards on moment view render as empty boxes with no painting/fallback when emanations is off. /emanations renders the procedural fallback correctly when enabled — moment view should match |
| BUG-008 | BLOCKER | OPEN | F3+F4 | renderer | Markdown headers (#) and emphasis (* _) render as literal characters in EVERY Markdown block — both imported and user-authored. Renderer not parsing markdown OR importer/editor double-escaping |
| BUG-009 | SERIOUS | OPEN | F3 | importer | `mushroom-climate-card` UNSUPPORTED — silently dropped from imported pages. Most popular HACS climate card. Render placeholder ("Climate control: <entity_id> — open in HA") instead of dropping silently |
| BUG-010 | SERIOUS | OPEN | F3 | importer | All chip + template cards lose their `tap_action` when translated PARTIAL. Heating control panel imports as read-only text. At minimum: emit a placeholder action with friendly disabled-state message |
| BUG-011 | BLOCKER | OPEN | F4 | builder | Block picker has 4 pre-baked action primitives (Macro grid / Room toggles / Scene row / Boost row) but NO generic "Action grid" or "Action tile". Users cannot build custom tap-fire-script tiles via the builder |
| BUG-012 | SERIOUS | OPEN | F4 | renderer | Jinja arithmetic on filter-piped floats returns NaN silently. `(state \| float * 100) \| round(0)` produces literal "NaN" with no editor error |
| BUG-013 | MINOR | OPEN | F4 | renderer | `weather.<entity>.attributes.temperature` returns empty in markdown blocks while sensor attribute access works. Inconsistent |
| BUG-014 | MINOR | OPEN | F1 | moment | Weather state `partlycloudy` not humanized (should be "partly cloudy") in manifest line |
| BUG-015 | MINOR | OPEN | F2 | settings/house | No visual signal that slug-shaped area names need renaming. Treat any lowercase-with-underscores or all-caps name as needs-attention |
| BUG-016 | MINOR | OPEN | F1 | moment | "Unlock the door" macro on / says "safety-rail blocked" — confusing wording. Suggest "(view-only)" or styled-disabled with tooltip |
| BUG-017 | MINOR | OPEN | F2 | tmdb-tv config | No inline link / instructions on where to obtain a free TMDB API key |

BUG-003 reclassified: SERIOUS → **BLOCKER** (curation-independent
on factory-fresh; was assumed regression, is in fact always-broken
since Phase G shipped).

## Rubric scorecard updates

| Story | Pre-fresh-test | Post-fresh-test | Why |
|---|---|---|---|
| P1-S1 — Boot without YAML | pass | ✓ pass | Held |
| P1-S2 — See familiar HA surfaces | pass | ⚠ DOWNGRADE to **gap** | Surfaces visible BUT raw slug names = experience break |
| P1-S3 — Build a first custom page | partial | **gap** | F4-OBS-1 — no path to custom action tiles |
| P1-S4 — Fix what's wrong without YAML | pass | ⚠ DOWNGRADE to partial | F2-OBS-2 — slug-shaped names invisible to "needs attention" |
| P3-S3 — Family Wrangler: zero entity_ids in render | partial | partial | Same /body issue (BUG-002) |
| P4-S2 — Importer translates real Lovelace | pass (claimed 96%) | ⚠ DOWNGRADE to **gap** | Real-world 23% clean / 65% partial; loses every action affordance |
| P5-S2 — Plugin contract is honoured | pass | partial | Plugins enable cleanly, but ghost-cloud has no config screen |

**Net rubric**: 4 downgrades, 0 upgrades. The fresh-user dogfood
revealed gaps the existing-install sweep was structurally blind to.

## Updated recommendation

**DEFER v0.1.0.** The dogfood revealed the existing-install test
was a false negative. Three blockers + multiple seriouses need to
clear before v0.1.0 ships:

### Must-fix before v0.1.0

| Bug | Fix lift |
|---|---|
| BUG-005 — area-slug humanizer | ~10 lines (slug → title-case helper, used in all hero composers) |
| BUG-006 — default chip-nav row | ~5 lines (default to all routable pages until curation overrides) |
| BUG-008 — markdown parsing | unknown — may be ~5 lines (set markdown renderer to actually run) or more (if double-escape needed) |
| BUG-011 — Action grid primitive | new block primitive, ~150 lines (pattern matches existing Macro grid) |
| BUG-003 — preset picker | unknown investigation lift, but ALWAYS-broken so must clear |

### Should-fix before v0.1.0

| Bug | Why |
|---|---|
| BUG-002 (existing) — /body entity_id leaks | Pre-existing, 5-line fix, blocks Family Wrangler rubric |
| BUG-009 — climate-card placeholder | Importer silently dropping cards is wrong default |
| BUG-010 — chip tap_action preservation | At minimum: friendly disabled-state for actions |
| BUG-007 — moment-view person painting fallback | First-paint quality issue |

### Can-defer to v0.1.1

| Bug | Why |
|---|---|
| BUG-001 (existing) — nginx warning | Cosmetic |
| BUG-012, BUG-013, BUG-014, BUG-015, BUG-016, BUG-017 | All polish, not blockers for ship |

### Process change

Going forward, every release dogfood MUST include a
factory-fresh-curation walk in addition to the existing-install
regression. The previous DOGFOOD-RESULTS-AGENT.md confidently
recommended ship based on a test that couldn't see any of the
findings above. Curation is the variable that moves "looks great"
to "looks broken" — so it has to be part of the test matrix.

## Restoration

| Step | Result |
|---|---|
| Wipe of broadsheet.json | done at 17:32 BST, addon restarted, fresh tests run |
| Restore from baseline | `cat curation-baseline-fresh.json \| docker exec -i ... cat > /data/broadsheet.json` → 3482 bytes restored |
| Addon restart post-restore | `ha addons restart` succeeded |
| Verify broadsheet hero | "Friday afternoon. Alfie home in the office. Elena out." — area renames in effect, no raw slug |
| Verify Alfie card | "OFFICE" not "alfies_office" — curation rendering correctly |
| Verify harold.local | HTTP 200 / + /wall (intact, untouched) |

User's daily-driver state fully restored. No data loss. No
collateral damage.
