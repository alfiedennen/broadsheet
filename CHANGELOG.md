# Changelog

All notable changes to broadsheet. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [0.9.4.6] — embed: hide HA chrome + strip /embed/ prefix (2026-05-18)

### Fixed
- **HA sidebar + header no longer show inside the embed.** 0.9.4.5
  bypassed the OAuth login but the iframe still rendered HA's full
  chrome (sidebar with every dashboard listed, top header, view-
  tabs bar) because Overview was loading instead of the requested
  dashboard (URL prefix collision — see next item) and Overview
  doesn't have the kiosk-mode HACS plugin configured. 0.9.4.6
  injects a `<style>` block into HA's `<head>` that hides chrome
  host elements (`ha-sidebar`, `app-header`, etc.) unconditionally
  — works whether or not the source dashboard opted into kiosk
  mode.
- **The correct dashboard now renders.** HA's frontend was reading
  `window.location.pathname` as `/embed/wall-tablet`, trying to
  resolve "embed" as a dashboard slug, failing, falling back to
  Overview. 0.9.4.6 injects a synchronous `<script>` at the top of
  `<head>` that runs `history.replaceState` to strip the `/embed/`
  prefix from the URL BEFORE HA's frontend's router boots. HA then
  reads the URL as `/wall-tablet?kiosk=true` and resolves the
  right dashboard.

### Added (addon-side)
- nginx `sub_filter` on the `/embed/` location, scoped to
  `text/html` responses, `once`, injecting both the URL-strip
  script and the chrome-hide stylesheet into HA's `<head>`.
- `proxy_set_header Accept-Encoding ""` on the `/embed/` proxy to
  force HA to return uncompressed HTML (sub_filter operates on
  plain text bodies).

### Changed
- Removed `proxy_buffering off` from the `/embed/` proxy. sub_filter
  requires buffered responses to rewrite the body. HA's index.html
  is small enough that the default buffer pool comfortably handles
  it.
- `TROUBLESHOOTING.md` updated with new "HA chrome still shows
  inside embed" + "Embed shows broadsheet homepage after I tap a
  view tab" sections covering the chrome-hide expectations and the
  in-iframe-refresh limitation.

### Known limit (documented)
- **Refreshing inside the iframe after in-iframe navigation breaks**.
  When HA frontend pushState's a new view URL via tab clicks, the
  URL becomes `/wall-tablet/<view>` (no `/embed/` prefix because
  HA wrote it). Refreshing the iframe then sends the browser to
  `/wall-tablet/<view>` directly — broadsheet's nginx has no
  `^~ /wall-tablet/` route, the catch-all SPA fallback returns
  broadsheet's `index.html`, the iframe shows broadsheet's
  homepage. Users navigate at the broadsheet parent-page level
  instead of within the iframe.

## [0.9.4.5] — embed auth injection + asset fallback proxy (2026-05-18)

### Fixed
- **Lovelace embed no longer shows the OAuth login screen.** 0.9.4.4's
  proxy bypassed `X-Frame-Options` but the iframe still landed on
  HA's login because `:8124` is a new OAuth client to HA's auth
  state and `/auth/token` 400s on code exchange (the addon's origin
  isn't a registered client). 0.9.4.5 pre-populates the iframe's
  `localStorage["hassTokens"]` with a synthesised entry built from
  `window.__BROADSHEET_ENV__.supervisorToken` on every renderer
  mount. HA's frontend reads it on boot, treats the session as
  already authenticated, never opens the login screen. Re-injects
  on URL changes so Supervisor token rotation is handled cleanly.
- **HACS-installed plugin assets now load.** Two complementary
  routes: (a) explicit `/hacsfiles/` proxy to HA Core for
  HACS-installed Lovelace plugins; (b) a regex catch-all for any
  path with a file extension (`/[^/]+/.+\.(js|css|png|...)`) that
  tries broadsheet's own filesystem first via `try_files`, falls
  back to the HA proxy. Catches arbitrary HACS-integration static
  paths broadsheet can't enumerate (e.g.
  `/room_presence/room-presence-card.js`).
- **`/local/` files now resolve.** 0.9.4.4's proxy upstream was
  `supervisor/core/local/` — the REST API listing endpoint, not
  the static-file serving. Flipped to `homeassistant:8123/local/`
  (HA Core's frontend serving from `/config/www/`). No Bearer auth —
  HA serves `/local/` to authenticated sessions, and the auth
  injection provides that.

### Added (addon-side)
- `^~` priority modifier on all of broadsheet's own asset routes
  (`/_app/immutable/`, `/_app/`, `/plugin-assets/`, `/plugin-data/`,
  `/api/broadsheet/`, `/api/harold-preset/`, `/api/websocket`,
  `/api/`, `/static/`, `/frontend_latest/`, `/auth/`, `/local/`,
  `/hacsfiles/`). Without it, the new asset-extension regex would
  cannibalise them — nginx gives regex priority over prefix
  matches unless `^~` is set.

### Changed
- `TROUBLESHOOTING.md` "One-time login per broadsheet origin"
  section — flipped from "log in once, token persists" to
  "0.9.4.5+ auto-authenticates via Supervisor token injection".
  The `trusted_networks` recipe stays as the user-side fallback
  for installs that disable the injection or run into edge cases.

### Honest caveat
- Auth injection grants admin-level visibility (the Supervisor
  token's level). Fine for single-user wall-tablet installs;
  worth knowing for multi-user setups where different users
  should see different dashboards. Per-user OAuth is out of
  scope until requested.
- If HA's auth module changes the `hassTokens` shape in a future
  release, the injection fails open to the OAuth login screen —
  no regression vs 0.9.4.4. Documented as a known fragility.

## [0.9.4.4] — embed proxy upstream fix (2026-05-18)

### Fixed
- 0.9.4.3's proxy upstream `http://supervisor/core/<path>` returned
  403 Forbidden for non-API paths — the Supervisor `/core/` route
  only serves REST API, not arbitrary frontend paths like
  `/wall-tablet`. 0.9.4.4 switches the upstream to
  `http://homeassistant:8123/<path>` (Supervisor's well-known DNS
  name for HA Core's frontend port). Frontend pages don't require
  Bearer auth — HA returns them; auth happens via browser cookie/
  localStorage at iframe-render time. The existing `/api/` +
  `/api/websocket` routes still inject the Supervisor token for
  the REST + WS calls the embedded Lovelace makes after page load.

### Known limit (documented)
- The embedded HA Lovelace requires a **one-time login per
  broadsheet origin**. broadsheet runs at `:8124`; the iframe loads
  HA's frontend through the proxy, but HA treats `:8124` as a new
  OAuth client → standard login screen renders inside the iframe
  on first use. Log in once → token stored in localStorage at
  `:8124` → subsequent embed loads use it automatically. For
  always-on wall tablets, this is a one-time setup step.

## [0.9.4.3] — embed proxy strips X-Frame-Options (2026-05-18)

### Fixed
- **Lovelace embed now works out of the box.** 0.9.4.2's embed
  block iframed HA Lovelace URLs directly, but HA serves
  `X-Frame-Options: SAMEORIGIN` which blocks the cross-origin
  frame (broadsheet at port 8124, HA at port 8123). 0.9.4.3 adds
  a same-origin proxy inside broadsheet's nginx that fetches HA
  content via the Supervisor + strips X-Frame-Options on the
  response → iframe renders.
- The embed block's renderer auto-rewrites HA URLs to the
  same-origin proxy path (`/embed/<dashboard>/<view>`).
  Both bare paths (`/wall-tablet/home`) and absolute HA URLs
  (`http://homeassistant.local:8123/wall-tablet/home`) are
  recognised. Cross-host embeds (broadsheet on host A iframing HA
  on host B) still need user-side HA framing config.
- The import flow's "Embed (don't translate)" actions now compose
  same-origin proxy URLs directly. Pages saved via 0.9.4.2's
  cross-origin format keep working because the renderer rewrites
  on render.

### Added (addon-side)
- New nginx routes proxying HA Core paths through the addon:
  `/embed/<path>` (with X-Frame-Options + CSP stripped), plus
  auxiliary HA-asset routes the embedded Lovelace needs at the
  root level — `/static/`, `/frontend_latest/`, `/auth/`,
  `/manifest.json`, `/service_worker.js`. All authenticate via
  the Supervisor token (admin-level view; documented).

### Changed
- `TROUBLESHOOTING.md` "Lovelace embed shows blank" section flips
  from "you need to configure HA to allow framing" to "0.9.4.3+
  handles this automatically; here's what to do if you saved a
  pre-0.9.4.3 embed."

### Honest caveat
- The proxy authenticates as the addon's Supervisor user (admin).
  Embedded Lovelace renders with full admin visibility — fine for
  wall-tablet use, worth knowing for multi-user installs.

## [0.9.4.2] — lovelace-embed escape hatch + honest import scoping (2026-05-18)

### Added
- **`lovelace-embed` block** — thin iframe wrapping an HA Lovelace
  URL. Perfect fidelity to the source dashboard; zero translation
  gaps. The honest escape hatch for dashboards built with card-mod /
  mushroom / custom HACS components broadsheet's translator can't
  reproduce. Config: `{ url, height, label? }`. Renderer surfaces
  a "no URL configured" placeholder when blank + a "if blank, see
  X-Frame-Options docs" hint after a 5s no-load timeout.
- **Import flow gains "Embed (don't translate)" options**:
  - **"Embed the whole dashboard"** tile at the top of the
    pick-view step (when dashboard has any views). Creates one
    broadsheet page with a single lovelace-embed block pointing
    at the dashboard's URL.
  - **Per-view "Embed instead" button** next to each view in the
    pick-view list. Creates one page with one lovelace-embed
    pointing at that view's URL.
- **"+ Lovelace embed" footer button** on the things-first canvas
  for users who want to drop an embed into a hand-authored page
  (e.g. one tab is broadsheet-native, another embeds a complex HA
  Lovelace view).
- **Inline editor for lovelace-embed** in the things-first canvas:
  URL field + height + section label, with a link out to the
  TROUBLESHOOTING X-Frame-Options recipe.

### Changed
- `CUSTOM-PAGES-GUIDE.md` gains a clear **"When translation works
  well vs when to embed"** section, with explicit per-card-type
  notes for the known gaps (mushroom-*, card-mod, custom HACS,
  layout-card grid-template-areas).
- `TROUBLESHOOTING.md` gains two new sections:
  - **"Imported page is mostly markdown / dead labels"** — what
    the symptom means + the embed escape hatch as the answer
  - **"Lovelace embed shows blank"** — the HA-side
    `X-Frame-Options: DENY` / `use_x_forwarded_for` config recipe
- The import flow's intro changes from "translates Lovelace cards
  into broadsheet primitives" to be honest about scope:
  best-effort for HA-native primitives; embed for the complex
  ones.

### Why
After 0.9.4.1's multi-view import shipped, a dogfood pass against
a real card-mod-heavy wall-tablet dashboard (8 views, ~130 cards)
made the translator's structural ceiling clear: 0/8 tabs were
usable as control surfaces. The honest gap is that mushroom-card /
card-mod / custom HACS components are not card TYPES that can be
translated — they're an entire rendering language. The
previously-planned 0.9.4.2 translator fixes (chip coalescing /
grid-layout / mushroom state-pill / type:template) would tidy
specific symptoms but not bridge that gap.

The lovelace-embed block accepts the constraint honestly:
broadsheet's import is best-effort for dashboards built with HA's
native cards; for everything else, the embed preserves the
original intact under broadsheet's nav. Six versions of "almost"
doesn't beat one honest "here's the escape hatch + here's when to
use it."

### Deferred (likely skipped)
- Chip-row coalescing into a single action-grid
- `custom:layout-card` + `custom:grid-layout` → broadsheet grid
- Mushroom-template-card without tap_action → state-pill thing
- `type: template` Lovelace card translator

Real value for the people with simpler dashboards but the dogfood
evidence is they wouldn't have bridged the wall-tablet gap. Won't
ship absent a specific user request.

## [0.9.4.1] — tabs primitive + multi-view Lovelace import (2026-05-17)

### Added
- **`tabs` block** — chip-bar at the top + active-tab content
  below. URL-bound active tab (`?tab=<id>`) so refresh keeps you
  on the right tab, deep-links work, browser-back swaps tabs.
  Critical for cast displays + kiosk tablets that reload.
- **Multi-view Lovelace dashboard import → ONE broadsheet page
  with a tabs block**. Previously the importer was view-by-view
  only; you'd pick "wall tablet" and only get its Home view.
  Now multi-view dashboards default to "Import all N views as a
  tabbed page" — one tab per view, chip-bar nav at the top,
  matching the wall-tablet's mental model. Single-view dashboards
  translate unchanged (no tabs wrapper).
- **Chip-bar dedup on import**. The translator recognises the
  hand-authored navigation chip-bar at the top of each Lovelace
  view (mushroom-chips-card, or horizontal/vertical-stack of
  chips, whose tap_actions all `navigate` to sibling view paths)
  and drops it — the tabs block IS that nav, no point rendering
  both. Mixed chip-bars (where some chips go elsewhere) are
  preserved as content.
- **Inline editor for tabs in the things-first canvas** — tab
  list with per-tab label + id + block count + reorder + remove
  + add. Children-editing routes to advanced mode (same pattern
  as row + grid).

### Why
After the 0.9.4 ship, a real wall-tablet dashboard import (8
views, ~130 cards) made the gap obvious: the user picks "wall
tablet" because it IS one wall surface in their mental model, but
the importer could only ingest one view at a time. Splitting
into 8 separate broadsheet pages defeats the purpose entirely —
the chip-bar navigation IS the wall-tablet's identity. The fix
is a real `tabs` primitive that preserves that navigation in
one cohesive page.

## [0.9.4] — row + grid + Lovelace import that respects layout (2026-05-17)

### Added
- **`row` block** — horizontal flex container. Drop two or more
  blocks side-by-side; each child gets equal flex by default,
  override per-child with `colSpan`. Stacks back to a column on
  narrow viewports (<640px). Editor → things-first or advanced.
- **`grid` block** — CSS-grid container with `columns` (default 12,
  matching Lovelace's sections-layout convention). Each child takes
  1 column by default; child `colSpan: N` spans N columns. Responsive
  collapse at 1024/640/480px so a 12-col desktop layout reads on
  phone portrait.
- **`colSpan` on every block** — optional top-level field, honoured
  by the `grid` renderer (`grid-column: span N`) and `row` renderer
  (flex-grow weight). Ignored outside containers.
- **Lovelace import** now honours layout signals:
  - `horizontal-stack` → row block wrapping children
  - `vertical-stack` → flat sequence (page is already vertical)
  - `type: 'grid'` card → grid block with same column count + per-
    child `colSpan` from `grid_options.columns`
  - `type: 'sections'` view → one grid block per section with 12-col
    scale + section title preserved as an outline above
  - `type: 'panel'` view → translate the single card without any
    wrapper
  - Default / masonry view → tiered heuristic: 3-col grid when >12
    cards, 2-col when 6-12, single-column when <6. Requires ≥1
    small card type (chip/glance/sensor/tile/button) — all-tall
    dashboards stay single-column to avoid bunching graphs.
- **`partial-layout` coverage status** — new classification for
  cards whose data translated cleanly but whose layout was
  approximated by the masonry heuristic. Distinguishes "I rendered
  the data but laid it out flatly" from "I dropped fields".
- **Imported pages land as drafts** in the things-first canvas with
  a clear banner ("Draft from Lovelace import. Review the canvas,
  rearrange anything you'd like, then commit so it appears in your
  nav.") + two escape hatches:
  - **Pre-import**: "Skip review, save directly" checkbox on the
    review step
  - **Post-import**: "Save as-is" button in the draft banner
- Drafts default to `hiddenFromNav: true` so half-reviewed imports
  don't clutter the kebab; committing flips both flags off.
- Inline editors for row + grid in the things-first canvas (label
  override + gap + grid columns). Children-editing routes to
  advanced mode for now.

### Changed
- The legacy "horizontal-stack flattened to vertical" coverage note
  is gone — horizontal layout is now actually preserved.

### Architecture (developer-facing)
- New `BlockSlot.svelte` factors out the resolver+renderer dance
  RenderedPage uses; Row and Grid use it to recursively render
  their children with grid/flex wrappers.
- The plugin block contract is unchanged — plugin blocks can be
  placed inside rows and grids transparently because the plugin-
  block host context (set by RenderedPage via `setContext`)
  propagates to every descendant.

## [0.9.3.3] — user-facing documentation overhaul (2026-05-17)

### Added
- `docs/WALL-BUILDER-GUIDE.md` (new) — 5-minute step-by-step
  walkthrough for building a tablet/kiosk wall surface, including
  device-preset picker + battery-management per device class +
  common variants (TV wall / hallway / kitchen).
- `docs/TROUBLESHOOTING.md` (new) — operational gotchas. Top of the
  file is the supervisor-cache fix (`ha store reload`); also covers
  tablets-in-media, unknown-block placeholders, "settings don't
  reach the tablet" reload strategies, "Pardon?" voice misfires,
  and where logs live.

### Changed
- `docs/CUSTOM-PAGES-GUIDE.md` — comprehensive rewrite leading with
  the things-first editor; advanced editor preserved as the
  alternative. Block-type reference grew from 11 to 16.
- `README.md` — new "Custom pages + the wall builder" section under
  "Adapt to your house".
- `CHANGELOG.md` — full 0.9.x release notes back through 0.9.0.

## [0.9.3.2] — area-panel inline editor (2026-05-17)

### Fixed
- Tapping an area-panel block (Lights / Heating / Media) in the
  things-first canvas now opens a proper inline editor — area
  picker + label override — instead of an empty body. Authors no
  longer need to flip to advanced mode to change which area a
  panel points at.

## [0.9.3.1] — kiosk/tablet filter on media surfaces (2026-05-17)

### Fixed
- Tablets, kiosks, phones (Galaxy Tab, Fire HD, iPad, "wall pixel"
  hostnames, Fully Kiosk Browser, etc.) no longer appear in media
  panels or in the things-first browser's Speakers sub-group.
  HA classifies them as `media_player` because they receive cast
  streams, but they're surfaces (often running broadsheet itself),
  not media sources. The heuristic that has filtered them out of
  `/tv` since 0.8.7 is now applied across the things-first browser
  + the area-media-panel renderer.

## [0.9.3] — composite area-panels + inline plugin blocks (2026-05-17)

### Added
- **Three composite area-panel block types**: `area-lights-panel`,
  `area-climate-panel`, `area-media-panel`. Each takes just an
  `areaId` and renders one widget per entity in that area at
  render-time. Adds a 5th light to the area in HA later? The panel
  grows automatically. Remove the panel from your wall = one undo.
- **New recipes** in the things-first browser:
  `<area> heating — panel`, `<area> media — panel`.
- **Plugin block contributions**: plugins can now declare
  `extraBlocks` on their manifest — droppable blocks the user can
  place on any wall surface, surfaced as recipes in the things-
  first browser. Plugin block types are colon-prefixed
  (`tmdb-tv:rows`) so collisions are impossible.
- **`@broadsheet/tmdb-tv`** (bumped to 0.2.0) contributes a
  `tmdb-tv:rows` block. The recipe appears in every area's TV
  sub-group as *"<area> TV — TMDB show & movie rows"*. Drop it
  next to the full-remote recipe to get the remote + TMDB browse
  rows together on the same wall page — same content the `/tv`
  page renders, now embeddable anywhere.

### Changed
- The 0.9.2 "<area> lights — panel" recipe used to drop a section
  divider + N atomic thing blocks; it now drops ONE
  `area-lights-panel` block.

### Architecture (developer-facing)
- Plugin contract gains one new OPTIONAL field, `extraBlocks` —
  the FROZEN-at-v0.1 commitment is preserved.
- Plugin block renderers read curation + discovery via Svelte
  `getContext` at the stable string key
  `PLUGIN_BLOCK_HOST_CONTEXT_KEY = 'broadsheet:plugin-block-host'`,
  so the no-runtime-import-of-core rule still holds (types only).

## [0.9.2] — browser as accomplishments, not atoms (2026-05-17)

### Changed
- **The things browser shows verbs, not entities.** What used to be
  a flat list of HA entity names (`Living Room TV`, `Living Room
  Pendant`) is now an accomplishment-led tree: *"Turn on Living
  Room TV"*, *"All Living Room lights — off"*, *"Activate Cinema
  scene"*. Each row is a recipe that produces one or more blocks
  when tapped or dragged. The `▸` glyph marks composed recipes
  (multi-block, single tap drops a whole panel); `·` marks atomic
  ones (single entity, single block). Atomic entries still appear
  below the composed verbs in every sub-group, so power users keep
  fine-grained control.
- Each per-area group now splits into sub-groups (Lights / TV /
  Climate / Locks / Cameras / Sensors) for navigability.

## [0.9.1] — things-first wall builder (2026-05-17)

### Added
- **Things-first editor surface** replaces the typed-block-picker
  on `/settings/pages/[slug]/`. Two-pane layout: a browser of
  controllable HA entities on the left, a canvas on the right.
  Tap or drag a thing onto the canvas to add it; broadsheet picks
  the right widget for the entity's domain automatically (light
  → toggle, scene → tap-to-fire, climate → temp + slider, lock
  → unlock, TV → full remote, etc.).
- **Surface-aware preview pane**: when the page has a wall device
  set, the preview renders at the device's native CSS dimensions
  (1280×800 Fire HD, 1340×800 Galaxy Tab A9, etc.) scaled to fit
  the editor pane. The wall surface looks like what users will see.
- **`thing` block** — single-entity wrapper, widget auto-picked.
- **`macro` block** — composed action tile built in-editor via the
  Macro Composer modal: name → pick-thing → pick-action → repeat
  → save. No service-domain typing.
- **Editor-mode toggle** in page meta — new pages default to
  things-first; legacy pages keep the advanced editor unless
  flipped. Both surfaces edit the same underlying block list,
  so you can flip at any time without losing work.

## [0.9.0] — wall builder substrate (2026-05-17)

### Added
- **Wall device preset picker** in page meta — Fire HD 10,
  Galaxy Tab A9 / A9+, iPad, Pixel Tablet, plus generic phone +
  7" sizes.
- **Kiosk URL** with copy button + Fully Kiosk Browser
  one-liner hint, on every custom page editor.
- **`?kiosk=true` query param** suppresses kebab nav, banner, and
  connection indicator — ready to point a tablet at.

## [0.1.0] — first public release

The first release. An editorial front-end for Home Assistant, shipped
as an HA add-on — pages not screens, prose not specs, and a render that
adapts to whatever your HA already has.

### Core

- **Eight surfaces** — `/` (the moment), `/lights`, `/heat`, `/door`,
  `/tv`, `/body`, `/wall`, `/settings` — each shaped for its job, not a
  uniform tile grid.
- **Three-layer discovery** — HA's registries → a domain model → your
  curation overrides. New rooms/devices in HA appear on the right pages
  with no editing.
- **In-app curation** (`/settings`) — House (rename / hide / move-to-
  area, with entities following their device), People (per-person
  presence-sensor picker with a ★-best heuristic), Voice (editorial
  string overrides), Plugins.
- **Single persistent WebSocket** per device with an application-level
  heartbeat — survives HA restarts cleanly.
- **Safety rails** — a read-only / audit-log envelope on every service
  call; `lock.*` writes are hard-banned regardless of settings.
- `/tv` ships a remote plus an always-present **Apps launcher** —
  three-tier sourcing (the TV's live `source_list`, a per-TV
  localStorage cache, a sensible default set) so the streamer buttons
  are there even when the TV is off; tapping one wakes the set first.

### HA add-on

- One-install-path packaging — the add-on auto-authenticates via the
  Supervisor token; no credentials to handle.
- HA Ingress, sidebar panel, an opt-in **broadsheet HA theme** that
  restyles HA's own chrome into the editorial register.
- Multi-arch CI → GHCR. **amd64 is the tested/supported target;
  aarch64 is built + published but not yet hardware-verified
  (experimental for v0.1).**

### Plugin system

- A **frozen `BroadsheetPlugin` contract** — plugins register pages,
  renderers, settings panels, static assets, and discovery
  contributors. `/settings/plugins` is the honesty escape hatch:
  enable/disable, and each plugin states its live status.
- The three first-class plugins **ship in the box, off by default**:
  - **`@broadsheet/emanations`** — multi-person presence painting on
    `/` and `/emanations`. Procedural by default, painting-capable.
  - **`@broadsheet/ghost-cloud`** (*The Long Take*) — 24-hour radar
    event playback as a translucent water-membrane time-tube. Ships
    with demo data.
  - **`@broadsheet/tmdb-tv`** — Trending / New content rows on `/tv`
    from TMDB (free API key, entered in the plugin's settings panel).

### Known limitations

- `aarch64` untested on real ARM hardware (see above).
- One editorial theme register ships; multiple registers planned.
- Plugin follow-ons deferred past v0.1: emanations' painting-set
  authoring, ghost-cloud's live-radar pull (v0.1 ships demo data).
- English only; HA Container / Core not supported (no Supervisor).

[0.1.0]: https://github.com/alfiedennen/broadsheet/releases/tag/v0.1.0
