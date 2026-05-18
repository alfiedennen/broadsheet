# @broadsheet/tmdb-tv

TMDB-driven content rows for broadsheet's `/tv` page — Trending
and New lenses, region-aware streaming-provider filtering.

**Status: shipped, v0.2.0.** Renderer + settings panel +
droppable block. Leanest contract surface of the three first-
party plugins (no pages, no static assets, no discovery
contributors).

## What it contributes

- **`tmdb-content-rows` renderer** — core's `/tv` page slots it
  into its content slot via `useRenderer`, passing the API key
  + region from `curation.integrations.tmdb`.
- **`tmdb-tv:rows` droppable block** (0.9.3+) — surfaces as a
  recipe per area that has a TV. Drop it alongside a TV remote
  for "browse + play" together on any wall surface.
- **Settings panel** at `/settings/plugins/tmdb-tv/config` for
  the API key + region (same fields `/tv` reads).

## Requires

- A free TMDB v4 API key
  ([apply here](https://www.themoviedb.org/settings/api)).
  Without one, the renderer shows a "configure it" CTA — the
  plugin can be enabled before a key exists.
- Region auto-detects from the browser locale. Override in the
  settings panel.

## Notes

- TMDB's API supports browser CORS, so the renderer fetches
  directly client-side — no broadsheet-side proxy.
- Results cached in localStorage for fast re-renders; cache
  invalidates after 6h.
