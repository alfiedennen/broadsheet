# @broadsheet/emanations

Multi-person presence painting plugin for broadsheet. Renders
*who's where in the house* as a full-screen axonometric painting
that shifts as people move between rooms.

**Status: shipped, v0.1.0.** First-class proof plugin —
exercises every surface of the frozen `BroadsheetPlugin`
contract (`pages`, `renderers`, `settingsPanel`, `staticAssets`,
`discoveryContributors`). See
[`../../docs/RENDERER-CONTRACT.md`](../../docs/RENDERER-CONTRACT.md).

## What it contributes

- **`multi-person-painting` renderer** — core's `/` (the moment)
  opts into it via `useRenderer`. Without emanations enabled,
  `/` falls back to a procedural painting.
- **`/emanations` page** — full-imagery surface for upload +
  mapping flows. Hidden from nav as of 0.1.52; per-person
  painting cards on `/` are the primary view. Page stays live
  for permalinks.
- **Settings panel** at `/settings/plugins/emanations/config`
  for choosing the painting set, mapping areas to images, etc.
- **Painting-set discovery** — fetches the painting manifest
  and merges it into discovery so cards know which images exist.

## Requires

- At least **two people** in HA's person registry, each with a
  per-person presence sensor (`sensor.<name>_committed_room` or
  similar — config in the settings panel).
- A painting set. Ships with a default; you can supply your own
  via the settings panel.
