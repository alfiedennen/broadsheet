# Changelog

All notable changes to broadsheet. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

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
