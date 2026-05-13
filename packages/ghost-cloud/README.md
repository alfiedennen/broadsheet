# @broadsheet/ghost-cloud

24-hour radar event playback rendered as a translucent water-membrane
time-tube.

**Status: stub at M0.** Implementation deferred until after v0.1.0
ships. Source for harold-home's working v22 renderer lives at
`harold-home/static/exposure/` for porting.

When implemented, this plugin will:
- Add per-room `/long-take` views (Office / Library / Living Room /
  Kitchen) that iframe a Three.js + WebGL2 + GLSL renderer
- Pull radar (LD2450) data from a 24h sliding window
- Encode body presence + speed at each 30s bin as circumferential
  bulges along a horizontal time-axis tube
- Sync pentatonic A-minor water-drop synth to bin-centre crossings
- Per-room AudioContext + visibility-aware mute via Page Visibility
  API
- Requires HA-side precompute (`exposure_precompute.py` in
  `precompute/`)
