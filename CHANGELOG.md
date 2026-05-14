# Changelog

All notable changes to broadsheet. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

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
