# Ship-readiness rubric

> **Status note (2026-05-18):** This doc was written during v0.1
> planning. Current shipped state is **0.9.4.6**, M0–M6 complete,
> add-on in **T2 friendly soak**. See [CHANGELOG.md](../CHANGELOG.md)
> and [BUILD-LOG.md](BUILD-LOG.md) for the actual ship history. The
> framing below describes planning-time thinking, not current
> reality — kept as a record of the path taken.

Persona-led user-story rubric for measuring whether broadsheet
meets the needs identified in `HA-USER-LANDSCAPE.md`.

Six epics — one per persona + one for cross-cutting platform
stories. ~30 stories total. Each story has:

- **Statement** in "Given persona X, when Y, broadsheet should Z" form
- **Acceptance criteria** — concrete, testable
- **Status** — `pass` (works today), `partial` (works partially / with caveats), `gap` (doesn't work)
- **Test fixture** — what Phase E should build to verify it
- **Notes** — where the implementation is / would be

## Summary

| Epic | Stories | Pass | Partial | Gap |
|---|---|---|---|---|
| E1 — Curious Beginner | 5 | 3 | 2 | 0 |
| E2 — Aesthetic Enthusiast | 5 | 4 | 1 | 0 |
| E3 — Family Wrangler | 5 | 1 | 2 | 2 |
| E4 — Power User / Templater | 5 | 3 | 1 | 1 |
| E5 — Ambient Enthusiast | 5 | 2 | 2 | 1 |
| E6 — Cross-cutting platform | 5 | 4 | 1 | 0 |
| **E7 — Frontend takeover (NEW v0.1)** | 5 | 0 | 0 | 5 |
| **E8 — Voice + Harold (NEW v0.1)** | 5 | 0 | 0 | 5 |
| **Total** | **40** | **17 (43%)** | **9 (23%)** | **14 (35%)** |

**v0.1 scope expansion 2026-05-16**: epics E7 and E8 added after the
fresh-user dogfood V2 review surfaced two product-shaped omissions —
broadsheet was a peer frontend living alongside HA's, and voice was
out-of-scope. Both will land in v0.1.0 ship (~2-3 weeks of further
work). All 10 stories below open as `gap` until the four design
plans (`docs/plans/plan-{sidebar-takeover,ha-settings-native-uis,voice-substrate,harold-preset}.md`)
are coded.

Of the 4 pre-existing gaps in E1-E6:
- 2 in E3 (per-user dashboard variants; conditional visibility)
- 1 in E4 (re-import to update an existing custom page)
- 1 in E5 (e-ink / low-power surface render mode)

The 9 partials are mostly surface-mode + presence-aware story
gaps where the foundation exists but needs targeted polish.

---

## Epic 1 — The Curious Beginner (P1, ~35% of installs)

Just installed HA last weekend. Watching tutorials. Has Hue +
some smart switches. Lives in fear of YAML.

### P1-S1 · Get broadsheet running without YAML

> *Given P1 has just installed broadsheet via the HA add-on store, when they open the Web UI for the first time, broadsheet should boot, authenticate against HA, and render the moment view with their actual house data — without P1 editing any file.*

**Acceptance:** Add-on installs from store. Boots in under 30s. SPA loads in HA Ingress. `connection.haVersion` populates. Discovery booted log line emits. Moment view renders within 1s of discovery boot. Zero `.env` / `secrets.yaml` / `configuration.yaml` edits required.

**Status:** ✅ pass — verified on the production canary.

**Test fixture:** `e2e/fresh-install.spec.ts` — install + first-load smoke test against a clean HA fixture.

**Notes:** Sidecar's run.sh handles the whole boot sequence; auth via `SUPERVISOR_TOKEN` injected at container start.

---

### P1-S2 · See familiar HA surfaces

> *Given P1 has lights, climates, and a TV in their HA, when they open broadsheet, they should see those entities organised by area on the corresponding pages without configuration.*

**Acceptance:** `/lights` shows their lighting areas. `/heat` shows their climates. `/tv` shows their media_player + TV apps. All discovered automatically from `area_registry` + `entity_registry`. Areas labelled with HA's labels.

**Status:** ✅ pass.

**Test fixture:** `e2e/page-discovery.spec.ts` against a synthetic HA snapshot with 5 areas (living room / kitchen / bedroom / hallway / office) and the typical entity mix per area.

**Notes:** Discovery layer 2 (`lib/discovery/domain.ts`) handles this; the `pageMatcher` per page selects which areas show up.

---

### P1-S3 · Build a first custom page

> *Given P1 has read about a "Garage" page, when they open `/settings/pages`, click + New page, type "Garage", and pick blocks visually, broadsheet should produce a working page at `/garage` they can show off to their family.*

**Acceptance:** + New page form opens, label/slug auto-derives, Create+edit redirects into editor with starter Hero. Adding blocks via + Add block menu works. Live preview updates as fields change. Page is live at `/garage/` immediately + appears in kebab nav. No JSON or YAML touched.

**Status:** ✅ pass — verified on canary in Phase 2.

**Test fixture:** `e2e/builder-create-page.spec.ts` — full create + add-2-blocks + view-live flow.

**Notes:** Phase 2 builder UI + Phase A polish (structured action editor, drag-reorder).

---

### P1-S4 · Understand why something isn't showing

> *Given P1 expects an entity to appear and it doesn't, when they look at `/settings/house`, broadsheet should explain why (auto-hidden as duplicate, system entity, integration-hidden, device-hidden) with a one-click unhide.*

**Acceptance:** `/settings/house` lists all entities. Hidden ones are collapsed under "N hidden — show". Each hidden entity has a `reason-chip` (duplicate / system / integration / via device hide). One-click unhide restores it. Alert at `/settings` summarises the count.

**Status:** ⚠ partial — the reason chips + one-click unhide exist, but the alert framing was rewritten in 0.1.39 and may need a polish pass against the rubric. Beginners may not naturally find `/settings/house`.

**Test fixture:** `e2e/settings-house-hidden.spec.ts` — verify reason-chips render + unhide flow + alert count match.

**Notes:** `lib/discovery/visibility.ts` + `routes/settings/house/+page.svelte`. Could surface a "missing entity?" prompt on the page where the entity SHOULD appear (e.g. /lights) to nudge users toward /settings/house.

---

### P1-S5 · Get family using it without explanation

> *Given P1 hands their phone to a partner who's never opened HA, when the partner opens broadsheet's moment view, they should be able to turn off all lights, see who's home, and find any other room without instruction.*

**Acceptance:** Moment view manifest reads as a sentence. Quick-reach chips visible above the fold (All lights off / TV / Unlock door). Per-person presence cards label who's where. Kebab nav visible without explanation. No entity_ids exposed anywhere on the moment view.

**Status:** ⚠ partial — moment view passes the visual test on the canary; needs an actual non-technical-user test pass to verify the "without instruction" claim. The `/wall` preset already serves this for wall tablets but moment view is the first thing P1's partner sees.

**Test fixture:** `e2e/family-first-look.spec.ts` — render moment view against a 2-person 4-area fixture, verify no entity_ids in DOM, all-lights-off chip + lock chip + kebab present.

**Notes:** Editorial register + per-person cards address this directly; the actual usability validation needs out-of-house user testing in Phase F.

---

## Epic 2 — The Aesthetic Enthusiast (P2, ~25%)

Has been on HA 6-18 months. Runs Mushroom + a theme + card-mod.
Posts to "show your dashboard". Cares about typography.

### P2-S1 · Coherent typography + spacing across pages

> *Given P2 navigates between every broadsheet page, the typography, spacing, accent colour, and editorial register should feel consistent — italic display serif headlines, mono eyebrows, JetBrains Mono captions, warm off-black background, amber accent.*

**Acceptance:** Hero / Eyebrow / Explainer / OutLine / PageShell components render identically across all pages. CSS variables (`--font-display`, `--font-body`, `--font-mono`, `--accent`, `--bg`, etc.) drive every visual decision. Theme is the SAME across phone / tablet / desktop — no surface-specific font choices.

**Status:** ✅ pass — verified during the harold.local register-drift fix (commit 67c159f) which lifted the Explainer pattern onto every core page.

**Test fixture:** `unit/theme-vars.spec.ts` — assert every page uses CSS vars not hardcoded colours/fonts. Snapshot test against a known viewport size.

**Notes:** Editorial register is foundational; the themes module + the four-font Google stack handle this end-to-end.

---

### P2-S2 · Compose pages without depth-2 nesting failure

> *Given P2 wants to build a complex page with 8+ blocks, when they add nested action grids inside layout-style sections, broadsheet should never refuse to UI-edit the result — every block remains editable through the structured editor.*

**Acceptance:** No nesting limit on the block list. Each block's per-type editor works regardless of position in the list. Drag-reorder works at any depth (currently flat-only). Save indicator stays accurate even with 20+ blocks.

**Status:** ✅ pass — broadsheet's blocks are flat by design, sidestepping the depth-2 nesting failure entirely. Action-grid contains its own actions but those are NOT nested blocks; they're tile config.

**Test fixture:** `e2e/builder-many-blocks.spec.ts` — create page with 15 blocks, edit each, verify all stay editable + save indicator tracks.

**Notes:** This is a structural advantage broadsheet has over Lovelace inherently. Documenting it explicitly in CUSTOM-PAGES-GUIDE would be a free win.

---

### P2-S3 · Sparklines + presence-cards make pages feel alive

> *Given P2 wants visual life on a page, when they add a sparkline of indoor temp + a presence-cards block, broadsheet should render the chart with current value + the per-person painting cards updating as state changes — without P2 configuring data refresh.*

**Acceptance:** Sparkline pulls history on mount + refetches on entity change. Live current value updates via the standard state subscription. Presence-cards re-render on person-state change. No polling configuration. No "how do I refresh" question.

**Status:** ✅ pass — sparkline shipped 0.1.68 + verified; presence-cards is the core component used on `/` + `/emanations`.

**Test fixture:** `e2e/sparkline-live-update.spec.ts` — render page with sparkline, mutate state on the test HA fixture, verify the displayed value changes within reasonable time.

**Notes:** This is one of broadsheet's strong differentiators — every primitive has live data baked in.

---

### P2-S4 · Theme broadsheet to match house aesthetic

> *Given P2 has a particular house aesthetic (warm wood + sage palette / cool industrial / etc.), when they want to retheme, broadsheet should expose all visual choices via CSS variables in a single theme file they can override.*

**Acceptance:** All colour, font, spacing decisions go through CSS variables. A theme override file (e.g. `/data/broadsheet.css` mounted at `/local/broadsheet.css`) loads after the base theme + can override any var. Documented in PUBLIC-README.

**Status:** ⚠ partial — CSS vars are used throughout but there's no documented theme-override path yet. Curation has no "theme" field. P2's current option is to fork the addon.

**Test fixture:** None yet — needs the override mechanism to exist first.

**Notes:** Adding a `themeOverrides` curation field that injects CSS into a `<style>` tag on the SPA shell would close this. Future v0.1.x candidate.

---

### P2-S5 · Be proud of it

> *Given P2 has built a custom-pages set + tweaked their primitives, when they screenshot for "Show your dashboard", broadsheet should produce visually-coherent output worth sharing — distinct enough that "is this Home Assistant?" is a fair question.*

**Acceptance:** Three screenshots from the canary — moment view + a custom page + the `/wall` preset — pass the "would this win an Aesthetic Enthusiast post" test. Editorial register reads as intentional, not generic.

**Status:** ✅ pass — the canary's renders qualitatively achieve this. PUBLIC-README's screenshots should validate it.

**Test fixture:** Visual regression suite — Playwright screenshots of the 3 reference views compared against a baseline.

**Notes:** Worth capturing baseline screenshots BEFORE Phase F so any regression introduced during further polish is caught.

---

## Epic 3 — The Family Wrangler (P3, ~20%)

Built HA, can't get partner / kids to use it. Maintains TWO
dashboards — power-user + simplified-for-everyone-else.

### P3-S1 · Wall-tablet dashboard partner can use

> *Given P3 mounts a Fire HD tablet by the front door, when they point it at broadsheet's `/wall` preset, the partner should be able to turn off all lights / boost heat / toggle TV / activate scenes / nudge a thermostat without scrolling and without entity_ids.*

**Acceptance:** `/wall` renders the macro-grid + room-toggle-grid + scene-row + boost-row + explainer. All affordances above the fold on a 1280×800 tablet portrait. No entity_ids visible. Targets are >44px tap-area. Editorial register intact.

**Status:** ✅ pass — verified on the canary's Fire HD 10 (1200×1920 portrait).

**Test fixture:** `e2e/wall-preset.spec.ts` — render at 1280×800, assert no entity_ids in DOM, every action tile has min-height 44px.

**Notes:** /wall is the strongest "Family Wrangler" surface broadsheet ships. PUBLIC-README should make this prominent.

---

### P3-S2 · One-tap controls for the daily 5 things

> *Given P3 has a wall tablet by the kitchen, when their partner walks past it in the morning, they should be able to: turn off bedroom lights, see the weather, see who else is home, see the next calendar item, see if the door is locked — all from a single page without taps to navigate.*

**Acceptance:** A custom page composable from broadsheet's primitives can show all 5 status items + 1-tap controls in one viewport. Hero (manifest) + presence-cards + outline + entity-list (calendar) + action-grid covers it.

**Status:** ⚠ partial — the building blocks exist but no preset page or template covers this exact "morning kitchen wall" use case. P3 has to compose it themselves via the builder.

**Test fixture:** A reference custom page def (JSON) + `e2e/morning-wall.spec.ts` that asserts the rendered page meets the spec.

**Notes:** A "preset templates" library on `/settings/pages/new` (alongside the blank-page option) would close this. Family Wrangler personas often want a starting point, not a blank canvas.

---

### P3-S3 · Hide entity_ids + technical labels from family-facing views

> *Given P3 wants the family-facing surfaces to be readable, broadsheet should never expose entity_ids, autohide-reasons, slug paths, or curation jargon on rendered pages — only on `/settings`.*

**Acceptance:** Search the entire rendered DOM of `/`, `/lights`, `/heat`, `/wall`, `/door`, `/tv`, `/body`, custom pages — find no `light.x` / `sensor.x` / `binary_sensor.x` patterns. Friendly names only. Same for any plugin pages.

**Status:** ✅ pass — verified manually on the canary. Friendly names + area names are used throughout the rendered surfaces; technical labels stay in `/settings/*`.

**Test fixture:** `e2e/no-entity-ids-in-render.spec.ts` — load each rendered page, scan DOM for entity-id-pattern strings, assert zero matches outside `/settings/*`.

**Notes:** Worth running this as CI gate to prevent regression. The existing renderer-marker filter (commit 4d48280) was a one-off; this story makes it a tested invariant.

---

### P3-S4 · Different views for power-user vs simple-user contexts

> *Given P3 has both a "everything view" power-user dashboard and a "simple view" for family, broadsheet should let P3 maintain BOTH within one broadsheet install — without per-user authentication infrastructure.*

**Acceptance:** Custom pages can be marked "hidden from nav" so power-user pages don't clutter the family-facing nav. Specific URL bookmarks (e.g. `/wall` for the family tablet, `/control-room` for power-user) point at different page sets. The builder supports duplicating a page as a starting point for a simplified version.

**Status:** ❌ gap — `hiddenFromNav` exists but per-user / per-surface dashboard variants are NOT supported. Same nav for everyone. Same data for everyone. Family doesn't have its own broadsheet "skin".

**Test fixture:** Would need to define what "user" means in broadsheet first — currently no auth concept beyond HA's session.

**Notes:** This is the rubric's biggest single gap. Two options to address: (a) a "presets" mechanism where `/wall` / `/family` / `/power` are different curation contexts loaded by query string; (b) actual per-HA-user curation overrides. Option A is simpler + ships in v0.1.x. Option B is a larger architectural addition.

---

### P3-S5 · Avoid maintaining two completely separate dashboard setups

> *Given P3 doesn't want the maintenance burden of two parallel dashboard projects, broadsheet should let them author once + present multiple ways — sharing primitives, sharing curation, but with surface-specific renderings.*

**Acceptance:** Page width is per-page (narrow / default / wide). Surface-specific rendering (e.g. tablet portrait gets larger tap targets) is opt-in not required. Shared primitives compose into both surfaces.

**Status:** ❌ gap — broadsheet renders the same blocks the same way regardless of viewport beyond the page width pick + media-query CSS. There's no "wall mode" / "phone mode" / "desktop mode" that adapts beyond CSS responsiveness.

**Test fixture:** Would need a surface-mode selector first.

**Notes:** Same gap family as P3-S4. A `pageDisplayHints` field per page (`{ wall: { largerTaps: true }, phone: { compactHeader: true } }`) consumed by primitive renderers would address this.

---

## Epic 4 — The Power User / Templater (P4, ~15%)

Comfortable with Jinja, runs Node-RED, has 1000+ entities, may
have published a card to HACS. Wants power, hates auto-magic.

### P4-S1 · Write a plugin without fighting the contract

> *Given P4 wants to ship a custom plugin (e.g. a per-room presence visualiser), when they follow PLUGIN-AUTHOR-QUICKSTART, broadsheet should accept their plugin via the frozen contract and surface it cleanly without modification to core.*

**Acceptance:** A new plugin authored by following the quickstart loads, validates, registers its pages + renderers + settings, appears in `/settings/plugins`. The two hard rules (no side-effects at module-eval, type-only imports from core) are enforceable. No core code change required.

**Status:** ✅ pass — `@broadsheet/emanations` is the proof; PLUGIN-AUTHOR-QUICKSTART documents the contract.

**Test fixture:** A reference second-plugin (`@broadsheet/test-plugin`) that exercises every contract surface, used as a CI smoke-test.

**Notes:** Currently plugins are statically imported by core. A dynamic plugin loader (drop a built plugin into `/data/plugins/`) is on the v0.3 roadmap.

---

### P4-S2 · Jinja-heavy markdown blocks evaluate live

> *Given P4 wants to write a markdown block with `{% if states('person.alice') == 'home' %}{{ state_attr('weather.home', 'temperature') }}°{% else %}—{% endif %}`, broadsheet should evaluate it at render time using HA's standard Jinja semantics — to the extent the minimal evaluator supports it.*

**Acceptance:** `{{ states(…) }}` / `{{ state_attr(…) }}` / `{{ is_state(…) }}` evaluate. `{% set %}` + `{% if %}` / `{% elif %}` / `{% else %}` evaluate. Filters: upper / lower / title / round / default / int / float / string / length / replace. Errors swallow back to raw template (don't crash page).

**Status:** ✅ pass — `lib/jinja/index.ts` (~470 lines), shipped 0.1.64, verified on Mushroom-template-card content. NOT supported: `{% for %}`, macros, blocks, includes.

**Test fixture:** `unit/jinja.spec.ts` with a battery of HA-style template strings + expected outputs against synthetic state snapshots.

**Notes:** P4 will hit the `{% for %}` limit eventually; the gap is documented + acceptable for v0.1.

---

### P4-S3 · Customise behaviour beyond typed primitives

> *Given P4 needs a UI behaviour that no built-in primitive offers (e.g. a custom radar visualiser), broadsheet should let them ship that as a renderer in a plugin, opt into it from a core or custom page via `useRenderer(id)`, and degrade cleanly if the plugin isn't loaded.*

**Acceptance:** `useRenderer('id')` returns the registered renderer when its plugin is active, null when not. Pages can branch on `null` to render a fallback. The plugin's renderer chunk loads lazily on first use.

**Status:** ✅ pass — the renderer registry pattern is shipped + dogfooded by emanations + ghost-cloud.

**Test fixture:** `e2e/renderer-degrade.spec.ts` — disable a plugin in curation, navigate to a page that uses its renderer, assert the page's fallback path renders.

**Notes:** The plugin contract makes this straightforward. The complementary registry for blocks (block primitives can also be plugin-provided in a future iteration) is not yet shipped.

---

### P4-S4 · Import their existing 50-card Mushroom dashboard cleanly

> *Given P4 has a heavily-customised Mushroom + HACS dashboard, when they import it via `/settings/pages/import`, broadsheet should translate at least 80% of cards with a coverage report so they know what to hand-fix.*

**Acceptance:** Importer loads dashboard, translates each card per `TRANSLATOR-MATRIX`, produces a coverage report (clean / partial / unsupported with notes), commits as a custom page. Real-world coverage on a heavily-customised 88-card dashboard is ≥ 80%.

**Status:** ✅ pass — verified on the canary's Harold Road dashboard at **95% rendered** (84/88 cards clean or partial).

**Test fixture:** `e2e/import-real-dashboard.spec.ts` — load a fixture Lovelace YAML representing the canary's dashboard, run import, assert coverage matches the documented threshold.

**Notes:** The 27-translator set + Jinja evaluator + recursive wrappers are the core deliverable. Phase F will measure against more fixtures (a vanilla install, a Bubble-Card-heavy install, a Tile-only install).

---

### P4-S5 · Re-import to update an existing custom page

> *Given P4's source Lovelace dashboard changes after import, when they re-run the import on the same dashboard, broadsheet should update the existing custom page in place — preserving any hand-edits where possible.*

**Acceptance:** Re-import detects existing custom page with the same source-derived slug, offers to update vs create-new. Update preserves user-added blocks (those not from the source). Diff view shows what's changing.

**Status:** ❌ gap — current importer always creates a new page. No re-import / sync-update path.

**Test fixture:** Would need the re-import flow to exist first.

**Notes:** This is a substantial v0.2 follow-up. v0.1.x can ship without it (users can delete + re-import as a workaround) but P4 will want it for any production setup.

---

## Epic 5 — The Ambient Enthusiast (P5, ~5%)

Sees HA as a canvas. Runs WallPanel, has e-ink frames, generates AI
art. Smallest persona but most aligned with broadsheet's ethos.

### P5-S1 · Build an ambient-first wall display

> *Given P5 wants their wall display to be ambient-first (paintings + sparse controls, not a control panel), broadsheet should let them compose a page where the imagery dominates and the actions are secondary.*

**Acceptance:** A custom page can put imagery (presence-cards / sparkline / picture-block) as the primary visual mass with action-grid + markdown sparingly placed. The editorial register supports this composition naturally without fighting it.

**Status:** ✅ pass — `/emanations` IS this story made manifest. The custom-pages builder lets P5 author similar compositions.

**Test fixture:** `e2e/ambient-page.spec.ts` — load `/emanations`, assert the visual mass is the painting band + per-person cards, not a controls grid.

**Notes:** The persona that broadsheet was originally for. The strongest fit in the entire rubric.

---

### P5-S2 · Per-room artwork that swaps with presence

> *Given P5 has uploaded per-room paintings + per-person away images, when presence state changes, the displayed painting should update within seconds.*

**Acceptance:** Painting URL resolves from `paintingSets.<active>.<area>.<person>` for in-room presence; from `personImages.<person>.away` for away. Updates on `presence_sensor.state` change. No polling configuration.

**Status:** ✅ pass — emanations plugin's full picture. Verified on canary.

**Test fixture:** `e2e/emanations-presence-swap.spec.ts` — mutate presence state, assert painting URL changes.

**Notes:** This is one of broadsheet's most distinctive features. PUBLIC-README screenshot worthy.

---

### P5-S3 · Render generative visuals (Three.js, SVG, animated)

> *Given P5 wants to ship a generative-art-as-presence visualiser, when they ship it as a plugin renderer, broadsheet should host it without sandbox / iframe / shadow-DOM workarounds.*

**Acceptance:** A plugin can ship a renderer that imports Three.js (or any heavy dep), gets bundled via the same SvelteKit pipeline, renders inside a normal page block. No CSP gymnastics.

**Status:** ⚠ partial — ghost-cloud plugin proves the concept (radar visualiser using Three.js + GLSL); the contract supports it. Documentation is light on heavy-dep best practices though.

**Test fixture:** `e2e/heavy-renderer.spec.ts` — load a page with the ghost-cloud renderer, assert it actually paints.

**Notes:** PLUGIN-AUTHOR-QUICKSTART could be expanded with a "heavy renderer" section walking through the ghost-cloud pattern.

---

### P5-S4 · Ambient display falls back gracefully when offline

> *Given P5's HA goes down or the network drops, when they look at the wall display, the ambient view should remain visually presentable — degraded but not broken.*

**Acceptance:** Disconnect handling at the WS layer doesn't blank the page. Last-known state continues to render. Service-call buttons gray out (can't action without connection). Reconnection auto-recovers.

**Status:** ⚠ partial — the WS client has reconnect logic + audit log entries (`connecting → disconnected → reconnect-error → connected`); pages don't blank on disconnect. But the visual treatment of "offline" state isn't intentional — service calls just silently fail.

**Test fixture:** `e2e/offline-graceful.spec.ts` — kill the WS connection, assert the ambient page stays rendered + service-calls show user feedback that they're disabled.

**Notes:** A "connection state" indicator + greying-out of disabled action surfaces would close this. Small UX improvement.

---

### P5-S5 · Use broadsheet on Cast / e-ink / non-standard surface

> *Given P5 has a non-standard display target (Nest Hub Max via Cast, an e-ink frame, a kiosk monitor), broadsheet should render acceptably on each.*

**Acceptance:** Cast Display path documented + working (avoids 10-min cast timeout via ha-catt-fix or similar). E-ink rendering mode (no animations, high-contrast variant) available. Kiosk/touchscreen modes documented.

**Status:** ❌ gap — no Cast workflow doc, no e-ink mode, no kiosk-mode opt-in. Cast does work in principle (it's just a browser) but isn't documented.

**Test fixture:** Manual — visual rendering on a Nest Hub Max + an Inkplate device.

**Notes:** Lowest persona share + most niche surfaces — this can be v0.2+ work. A documented "cast it like this" recipe would be a quick win.

---

## Epic 6 — Cross-cutting platform stories

System-wide invariants that touch every persona.

### E6-S1 · Brittleness firewall — only stable HA contracts

> *Given the HA frontend is updated frequently with breaking changes to its DOM / CSS / chunks, broadsheet should consume only stable HA WS API + REST API + theme + Ingress contracts — never the rendered DOM.*

**Acceptance:** Code review: no scraping of `<home-assistant>` shadow DOM, no hardcoded HA chunk URLs, no dependence on HA CSS class names or material-icon names. All data flows via documented WS messages.

**Status:** ✅ pass — held throughout the v0.2 build. Documented in PLUGIN-AUTHOR-QUICKSTART.

**Test fixture:** Static analysis CI step that greps for forbidden patterns.

**Notes:** This is the "broadsheet still works after HA 2027.x" story. Worth a CI gate.

---

### E6-S2 · Performance on large dashboards

> *Given P4 has 1000+ entities + a 30-block custom page, broadsheet should render initial paint within 1.5s on a Pi4-class HA instance.*

**Acceptance:** Discovery boot completes within target. RenderedPage dispatches blocks in parallel via the lazy registry. Sparkline history fetches don't block initial paint. Performance budget documented.

**Status:** ⚠ partial — performance is good on the canary (i5-class) but Pi4 numbers aren't measured. The lazy-block-renderer pattern + debounced curation writes are the foundation.

**Test fixture:** `perf/large-page-render.spec.ts` — render a 30-block page against a 1000-entity fixture, measure first contentful paint.

**Notes:** Phase F should establish a performance baseline + budget before public release.

---

### E6-S3 · Accessibility — keyboard nav + screen reader

> *Given users with motor or vision needs, broadsheet should be navigable by keyboard alone + announce content meaningfully via screen readers.*

**Acceptance:** All interactive elements reachable by Tab. Focus rings visible. ARIA labels on action tiles. Sparklines have text equivalents. Editor's drag-to-reorder has keyboard-equivalent up/down (already exists as buttons).

**Status:** ✅ pass — the foundation is there: every action button has type="button" + aria-labels where needed; the editor has both drag-handle + up/down buttons. Specific a11y audit hasn't been done.

**Test fixture:** `e2e/keyboard-nav.spec.ts` + axe-core audit pass on every page.

**Notes:** Worth running axe-core in CI to catch regressions.

---

### E6-S4 · Curation persistence + backup

> *Given any persona's authoring effort, broadsheet's state should persist across container restarts + be included in HA backups.*

**Acceptance:** `/data/broadsheet.json` (curation) + `/data/plugin-data/*` survive container upgrades. Both directories are inside the addon's `addon_config:rw` mount + therefore in HA snapshots.

**Status:** ✅ pass — verified through every addon update during the v0.2 build.

**Test fixture:** `e2e/curation-survives-restart.spec.ts` — write curation, restart container, assert it's still there.

**Notes:** Documented in DOCS.md. Backup story is HA-native — broadsheet inherits it.

---

### E6-S5 · Install path — addon store one-tap

> *Given any persona discovers broadsheet, when they want to install, the path should be: Add repository → Install → Start → Open Web UI. Total time: <2 minutes.*

**Acceptance:** Addon repository works in HA's store. Install completes in <60s on a typical install. First boot completes in <30s. No additional configuration needed before Open Web UI works.

**Status:** ✅ pass — verified by every update cycle through canary deploys.

**Test fixture:** Manual install on a fresh HA OS VM, timed.

**Notes:** PUBLIC-README's install instructions match the actual flow.

---

## Epic 7 — Frontend takeover (NEW v0.1 scope, 2026-05-16)

Added after the V2 fresh-user dogfood. The omission: broadsheet
shipped as a peer frontend alongside HA's native UI, leaving the user
to remember TWO frontends and bounce between them for settings,
integrations, and devices. The v0.1.0 ship needs to make broadsheet
THE frontend — HA's sidebar collapses, broadsheet becomes the landing
surface, and the routine settings broadsheet can render natively all
live inside broadsheet's editorial register rather than HA's
material-design config tree.

Spec: `docs/plans/plan-sidebar-takeover.md` + `docs/plans/plan-ha-settings-native-uis.md`.

### P7-S1 · Install collapses HA sidebar globally
> *Given a user installs broadsheet, when they first open HA, broadsheet's ingress IS the landing surface and HA's sidebar is collapsed/hidden across all dashboards.*

**Status:** gap (design plan in flight) · **Test fixture:** `e2e/takeover-install.spec.ts`

### P7-S2 · Roll back to peer-frontend mode with one toggle
> *Given the user wants HA's sidebar back, when they flip the addon's `sidebar_takeover: false` option, sidebar returns within a HA restart.*

**Status:** gap · **Test fixture:** addon-config integration test

### P7-S3 · Native /settings/people built on HA's `person.*` WS API
> *Given the user opens /settings/people, they see broadsheet's editorial UI over HA's actual person registry — create, rename, assign tracker, delete.*

**Status:** partial (read-side exists at /settings/people; write surfaces are gap)

### P7-S4 · Native /settings/integrations built on HA's `config_entries.*` WS API
> *Given the user wants to add or configure an integration, /settings/integrations lets them browse + add + reconfigure without dropping into HA's UI.*

**Status:** gap (biggest single new build) · **Test fixture:** `e2e/integrations-add.spec.ts`

### P7-S5 · "Open HA settings" affordance always one tap away
> *Given any unusual flow broadsheet doesn't render natively (debug snapshots, advanced YAML, exotic integration setup wizards), an "Open HA settings →" CTA in the kebab nav drops the user into HA's own UI.*

**Status:** gap · **Test fixture:** `e2e/ha-fallback-link.spec.ts`

---

## Epic 8 — Voice + Harold (NEW v0.1 scope, 2026-05-16)

Added in the same V2 review. The omission: broadsheet had no voice
story at all, even though every HA install above v2024.x has STT/TTS
+ a conversation pipeline + Atom Echo or Wyoming-protocol satellites
in the wild. Broadsheet's editorial register is uniquely well-shaped
to be a voice UI surface (italic display + concise prose = legible at
glance, perfect for a moment-of-spoken-response paragraph).

Spec: `docs/plans/plan-voice-substrate.md` (generic plugin) +
`docs/plans/plan-harold-preset.md` (opinionated bundle).

### P8-S1 · Voice plugin discovers + lists installed HA conversation agents + TTS providers
> *Given the user enables @broadsheet/voice, /settings/voice shows every HA conversation agent (HA native, Whisper, OpenAI, Anthropic, custom) and every TTS provider (HA Cloud, Piper, ElevenLabs, OpenAI) with provider status + last-used.*

**Status:** gap · **Test fixture:** `e2e/voice-discovery.spec.ts`

### P8-S2 · HA-native intent matcher gets first attempt on every utterance
> *Given a user says "turn on the kitchen lights", HA-native intent matches sub-200ms, fires the call, returns silent — no LLM round-trip, no cost. Only unmatched utterances fall through to the configured LLM.*

**Status:** gap · **Test fixture:** `e2e/voice-intent-routing.spec.ts`

### P8-S3 · Voice transcript pane visible inside broadsheet
> *Given the user has voice enabled, a slim transcript pane (call it /voice or a kebab affordance) shows the last N utterances + replies in editorial register — same surface as the moment view, not a chat-bot tile.*

**Status:** gap · **Test fixture:** `e2e/voice-transcript.spec.ts`

### P8-S4 · Harold preset installs the Hitchcock register + Claude + ElevenLabs in one tap
> *Given the user picks Harold on first-launch onboarding, @broadsheet/harold-preset installs the Hitchcock prompt suffix, the meeting-mode hard-mute, the Italian-when-spoken-Italian detection, the garbled-input filter, the "Hey Harold" wakeword model + Atom Echo config, and wires Claude Haiku + ElevenLabs Flash v2.5 with the user-supplied keys.*

**Status:** gap (preset depends on substrate landing first) · **Test fixture:** `e2e/harold-preset-install.spec.ts`

### P8-S5 · Voice survives without paid APIs
> *Given the user doesn't want Anthropic or ElevenLabs subscriptions, they can pair broadsheet's voice substrate with Ollama + Piper (both free, both run locally) and still get a working voice pipeline.*

**Status:** gap — explicitly designed-for so the open-source story isn't "you must pay Anthropic" · **Test fixture:** `e2e/voice-local-only.spec.ts`

---

## Phase E — what to build

Per the rubric above, Phase E should ship:

1. **`tests/fixtures/`** — synthetic HA snapshots per persona's typical install
   - `p1-curious-beginner.json` — 5 areas, 30 entities, 1 person
   - `p2-aesthetic-enthusiast.json` — 8 areas, 200 entities, 2 persons, Mushroom-style names
   - `p3-family-wrangler.json` — 6 areas, 150 entities, 4 persons
   - `p4-power-user.json` — 12 areas, 1000+ entities, 2 persons, custom integrations
   - `p5-ambient-enthusiast.json` — 5 areas, 50 entities, presence-rich
2. **`tests/lovelace-fixtures/`** — synthetic Lovelace dashboard YAMLs
   - `vanilla-install.yaml` — built-in cards only
   - `mushroom-heavy.yaml` — Mushroom + Sections + light card-mod
   - `bubble-card.yaml` — Bubble-led
   - `harold-road.yaml` — the canary's actual config (sanitised)
   - `ui-lovelace-minimalist.yaml`
3. **`tests/unit/`** — Jinja, translators, primitives, slug validation
4. **`tests/e2e/`** — story tests per the rubric above
5. **`tests/perf/`** — large-page-render budget
6. **`tests/visual/`** — baseline screenshots for regression
7. **`ci/`** — gates for: brittleness firewall (forbidden-pattern grep), axe-core a11y audit, performance budget

The rubric's pass/partial/gap classification feeds directly into
the test plan: every `pass` story gets a regression test, every
`partial` gets a story-test that documents what's tested + what's
deferred, every `gap` gets a no-op test marked `.skip` with a
reference to the story so it's tracked.

Phase F (gap analysis + synthesis artefact) runs the full suite,
measures pass rate, addresses the easy wins, produces the ship-
readiness baseline doc with the final coverage measurements.
