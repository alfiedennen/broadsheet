# @broadsheet/emanations

Multi-person presence painting plugin for broadsheet.

**Status: stub at M0.** Implementation deferred until after v0.1.0
ships. The contract this plugin will implement is in
[`../../docs/RENDERER-CONTRACT.md`](../../docs/RENDERER-CONTRACT.md).

When implemented, this plugin will:
- Add an `/emanations` page (Where everyone is — full-screen
  axonometric paintings)
- Expose a `multi-person-painting` renderer for use on the landing page
- Read per-person `_committed_room` sensors to track who's where
- Render `<area>.png` / `<area>-<person>.png` / `<area>-both.png`
  variants based on presence state
- Cross-fade between states with 800ms transitions
