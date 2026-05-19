# @broadsheet/ghost-cloud

The Long Take — 24-hour radar event playback rendered as a
translucent water-membrane time-tube. Three.js + WebGL2 + custom
GLSL; pentatonic water-drop synth on bin-centre crossings.

**Status: shipped, v0.2.0.** Renderer is harold-home's proven
lock-state-v22 piece, ported verbatim and bundled as plugin
static assets (vendored Three.js r169 alongside the renderer JS).

## What it contributes

- **`/long-take` page** — per-room playback views, iframed.
- **Bundled demo data** for one captured day per room, so the
  plugin works for any user with zero hardware or HA-side setup.
- **Live-data opt-in** via the `dataUrlPattern` config (see below).
- **Room discovery** — fetches the room manifest and merges it
  into discovery so the page knows which rooms have playback data.

## Wiring a live source (optional, v0.2.0+)

If you already have an HA-side pipeline producing per-room radar
JSON (e.g. harold-home's
[`exposure_precompute.py`](https://github.com/alfiedennen/harold-agent),
or your own equivalent), point the plugin at it via curation:

```yaml
plugins:
  ghost-cloud:
    enabled: true
    config:
      dataUrlPattern: "/local/exposure/data/{room}.json"
```

- `{room}` is substituted with the selected room slug at render
  time
- Any URL the iframe can fetch works — `/local/...` (HA's static
  file path), absolute URLs, etc.
- Refreshes every 5 minutes (configurable in source; defaults to
  the precompute cadence harold-home uses)
- Empty/unset → bundled demo data is used; fully backwards-
  compatible

The page's "Source" fact panel surfaces the active URL so you can
see at a glance whether you're on live data or the bundled
capture.

## Requires

- A WebGL2-capable browser (recent Chromium/Firefox/Safari).
- The iframe runs at full opacity; for ambient use, drop the
  iframe brightness via your kiosk app's per-tab settings.
- For live data (optional): an HA-side precompute pipeline
  writing the expected JSON shape. See harold-home's
  `exposure_precompute.py` for a reference implementation.

## Future (deferred)

- Settings panel UI for `dataUrlPattern` (currently set via
  curation JSON only — adequate for the kind of user who'd wire
  live LD2450 radar, but a clickable UI would lower the bar).
- Per-room audio mute persistence across sessions.
- Schema documentation for the JSON the renderer expects (so
  third-party precompute pipelines can be written without
  reading the source).
