# @broadsheet/tmdb-tv

TMDB-driven content rows for broadsheet's `/tv` page — "New" and
"Trending" lenses, region-aware streaming-provider filtering.

**Status: stub at M0.** Implementation deferred until after v0.1.0
ships.

When implemented, this plugin will:
- Render content rows in slots the `/tv` page exposes
- Pull from TMDB v4 API (user supplies free API key in Settings)
- Region-aware via `with_watch_providers` (UK/US/EU provider IDs
  auto-detect from locale)
- Two lenses: New (date-sorted) and Trending (popularity-sorted)
- Cached via service-worker for offline browsing
