# @broadsheet/ghost-cloud

The Long Take — 24-hour radar event playback rendered as a
translucent water-membrane time-tube. Three.js + WebGL2 + custom
GLSL; pentatonic water-drop synth on bin-centre crossings.

**Status: shipped, v0.1.0.** Renderer is harold-home's proven
lock-state-v22 piece, ported verbatim and bundled as plugin
static assets (vendored Three.js r169 alongside the renderer JS).

## What it contributes

- **`/long-take` page** — per-room playback views, iframed.
- **Bundled demo data** for one captured day per room, so the
  plugin works for any user with zero hardware or HA-side
  setup. Live-radar pull (querying HA recorder history for
  LD2450 sensors) is a deferred follow-on.
- **Room discovery** — fetches the room manifest and merges
  it into discovery so the page knows which rooms have
  playback data.

## Requires

- A WebGL2-capable browser (recent Chromium/Firefox/Safari).
- The iframe runs at full opacity; for ambient use, drop the
  iframe brightness via your kiosk app's per-tab settings.

## Future (deferred)

- Live LD2450 radar pull via HA recorder history (replace
  demo data with the user's own captured days).
- Per-room audio mute persistence across sessions.
