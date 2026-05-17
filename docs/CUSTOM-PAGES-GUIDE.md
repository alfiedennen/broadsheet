# Custom pages — author guide

broadsheet's custom-page builder lets you compose pages from your
own things, without writing code. Pages live at `/<slug>` and appear
in the kebab nav alongside the core pages (or stay hidden if you'd
rather they're internal).

This guide leads with the **things-first** editor (the default since
0.9.1), then covers the **advanced** editor (block-by-block — still
available, useful for the more exotic block types).

For a step-by-step walkthrough of building a tablet/kiosk wall
surface specifically, see [`WALL-BUILDER-GUIDE.md`](WALL-BUILDER-GUIDE.md).

---

## Quick start: things-first

1. Open **Settings → Pages → + New page**.
2. Give the page a label (e.g. "Living Room", "Bathroom").
   The slug auto-derives — edit if you'd prefer something else.
3. (Optional) Pick a **Wall device** preset from the dropdown if
   you're building for a specific tablet/kiosk surface. Adds
   `surface.width/height/label` to the page so the editor preview
   renders at the device's actual dimensions.
4. Tap **Create + edit**. You land in the editor with a starter
   Hero block on the canvas.

The editor has three panes:

```
┌──────────────┬─────────────────┬─────────────────┐
│   Things     │    Canvas       │    Preview      │
│  (browser)   │   (your page)   │   (live)        │
└──────────────┴─────────────────┴─────────────────┘
```

5. The **Things** pane on the left is grouped by room
   (Living Room / Kitchen / Bedroom / …) and then by sub-domain
   (Lights / TV / Heating / Locks / Cameras / Sensors). Search
   filters across everything — name, entity id, area, verb.
6. **Tap any row to add it** to your canvas, or **drag it** onto a
   specific seam between existing blocks. Watch the preview update
   on the right.
7. To remove a block, expand its row in the canvas and tap the
   ✕ button.
8. Save is automatic — the indicator strip near the top of the
   editor shows `editing… / saving… / ✓ saved`.

The page is live at `/<slug>/` the moment you've added anything.

---

## What's in the Things browser

Each row is a **recipe** — a named verb that produces one or more
blocks when added. Two shapes:

- **`▸`** marks **composed recipes** — one tap drops a whole panel
  or one-tap macro. *"All Living Room lights — off"* drops a macro
  tile that turns off every light in the area when tapped.
  *"Living Room lights — panel"* drops one panel block that renders
  every light tile inline.
- **`·`** marks **atomic recipes** — single entity, single block.
  *"Library Floor Lamp"* drops one toggle tile.

Atomic recipes sit below the composed ones in the same sub-group, so
power users keep fine-grained control without losing the verb
shortcuts.

### Per-area recipes (what you'll see most)

For each room you have, broadsheet surfaces the relevant verbs:

| Sub-group | When you'll see it | Recipes |
|---|---|---|
| **Lights** | Area has any lights | `<area> lights — panel` (single composite block), `… — off` (one-tap macro), `… — toggle`, then one row per individual bulb |
| **TV** | Area has a TV | `<area> media — panel` (composite, shown only when ≥ 2 media devices OR mixed TV+speaker), `<area> TV — full remote`, `— power toggle`, `— turn on`, `— turn off` |
| **Speakers** | Area has non-TV media players | `<speaker> — full control` / `— play / pause` / `— turn on` / `— turn off` per device |
| **Heating** | Area has TRVs | `<area> heating — panel`, `… — boost to 21°`, `… — off (5°)`, then one row per TRV |
| **Switches** | Area has non-lighting switches | One row per switch |
| **Locks** | Area has any lock | `<lock> — unlock` (1-tap macro), `<lock> — status tile` (read-only state) |
| **Cameras** | Area has any camera | One row per camera (snapshot tile, tap-expand for live feed) |
| **Sensors** | Area has ambient sensors | *"Show <sensor>"* — read-only value pill |

### Cross-area recipes (at the bottom of the browser)

These pool across every area:

- **Scenes** — *"Activate Cinema"*, *"Activate Warm Evening"*, …
- **Scripts** — *"Run Bedtime"*, …
- **Automations** — *"Trigger Evening Routine"*, …
- **Status sensors** — *"Show <sensor>"* for sensors that are
  read-only / house-wide
- **Other** — input_select / input_number / person
- **Components** *(lazy)* — plugin-contributed recipes that don't
  fit elsewhere

### Plugin-contributed recipes

Plugins can add their own recipes to the browser. For example,
when **`@broadsheet/tmdb-tv`** is enabled, every area with a TV
gets an extra recipe under the TV sub-group:

> *"Living Room TV — TMDB show & movie rows"*

Tap it to drop the TMDB poster rows inline on your wall page, right
next to the TV remote. Reads the same API key as `/tv`.

Other plugins (`@broadsheet/emanations`, `@broadsheet/ghost-cloud`)
can contribute blocks the same way; check `Settings → Plugins` for
what's enabled.

---

## Working with the canvas

### Add things

- **Tap** any row in the browser → recipe appends to the end of
  the canvas.
- **Drag** any row → drop on a seam between two existing blocks
  (or above the first / below the last) to insert at that exact
  position. Drop seams highlight while a drag is over them.
- Recipes that produce multiple blocks (`▸`) land atomically —
  one undo undoes the whole panel.

### Edit things

Click a block's title row to expand its inline editor. Each block
type has its own editor:

- **Thing** — Label override, Icon override (`mdi:*`), Widget
  picker (Auto by default; override only if you want something
  unusual — e.g. show a sensor as a tile instead of a pill).
- **Macro** — Read-only summary + an "Edit macro…" button that
  re-opens the Macro Composer modal.
- **Area panel** (`area-lights-panel` / `area-climate-panel` /
  `area-media-panel`) — Area picker dropdown (only areas with the
  right entities are listed) + label override.
- **Section divider** — Just the label text.
- **Other block types** (action-grid, sparkline, entity-list, etc.)
  — Show a "switch to advanced to edit" hint. They still render
  correctly in the preview; flip the editor mode in page meta to
  edit them.

### Reorder

- **Drag the `⋮⋮` handle** on any block to move it. Other blocks
  shift to make room.
- Per-row **↑ / ↓** buttons for tap-only environments.

### Add a section divider

Tap **+ Section divider** at the bottom of the canvas. Drops an
outline label ("Section") — click it to rename.

### Add a custom macro

Tap **+ Macro** at the bottom of the canvas. Opens the Macro
Composer modal:

1. Give the macro a label (e.g. "Cinema").
2. Optionally an `mdi:*` icon for the tile.
3. Tap **+ Add step** to pick a thing → pick an action ("Turn off",
   "Activate", "Set temperature", etc.). The composer never asks
   you to type a service domain.
4. Repeat as many steps as you like, reorder with ↑ / ↓.
5. Tap **Create macro** — a tile lands on the canvas. Tap it later
   to edit.

Tap the rendered macro tile on your wall to fire every step in
order.

---

## Wall surfaces

If you're building for a tablet / kiosk / Cast display, pick the
device's preset from the **Wall device** dropdown in page meta.
This:

1. Stores `surface.width/height/label` on the page.
2. Sizes the editor's preview pane to the device's native CSS
   dimensions (e.g. 1280×800 for Fire HD 10), scaled to fit your
   editor screen.
3. Surfaces a **"Point a wall here"** panel below page meta with
   the kiosk URL ready to copy + Fully Kiosk Browser hints.

The kiosk URL is just your page URL with `?kiosk=true` appended.
That suppresses the kebab nav, the install banner, and the
connection indicator — the page becomes the whole screen.

Full step-by-step in [`WALL-BUILDER-GUIDE.md`](WALL-BUILDER-GUIDE.md).

---

## Advanced editor (block-by-block)

Flip **Editor → Advanced (block-by-block)** in page meta to get the
legacy editor. You'd want this when:

- You want to add a Markdown / Hero / Explainer block (none of those
  have things-first recipes — they're typography blocks).
- You want a Sparkline with a specific entity_id + hour window.
- You want an `action-grid` with state-bound tiles (the macro
  composer doesn't do state-binding yet).
- You want an `entity-list` (Lovelace-importer landing zone) for
  pages imported from Lovelace.
- You want full control over per-block config.

Each page remembers its `editorMode` independently. Flipping back to
things-first leaves all your existing blocks in place — they just
render through the things-first canvas (with "switch to advanced"
hints on the ones it can't inline-edit).

### All 18 block types

| Block | Use for |
|---|---|
| **Hero** | Page-opening composition: eyebrow + italic headline + sub-headline |
| **Markdown** | Prose paragraphs with `{{entity_id}}` live-state interpolation. Supports `**bold**`, `*italic*`, `` `code` ``, [links](/), images, and Jinja (`{{ states('…') }}`, `{% if %}`) |
| **Explainer** | Italic-muted footer paragraph with cross-page links |
| **Outline** | Caps-and-rule section divider (also the "+ Section divider" recipe in things-first) |
| **Macro grid** | Three big tiles: All lights off · Boost heat · TVs off (auto-discovers targets) |
| **Room toggle grid** | One tile per discovered lighting area (a whole-house overview block; per-area panels are usually more useful) |
| **Scene row** | Pill row of every discovered scene |
| **Boost row** | Per-climate-area "boost to N°" tile |
| **Action grid** | Configurable grid of action tiles with optional state-binding |
| **Entity list** | Vertical list of entities (Lovelace-importer landing zone) |
| **Sparkline** | Inline SVG line chart of one entity's recent history |
| **Thing** *(0.9.1)* | One HA entity wrapped — widget auto-picked from the entity's domain |
| **Macro** *(0.9.1)* | Composed action tile built via the Macro Composer |
| **Lights panel** *(0.9.3)* | Per-area composite — one toggle per light, grows with discovery |
| **Heating panel** *(0.9.3)* | Per-area composite — one climate tile per TRV |
| **Media panel** *(0.9.3)* | Per-area composite — TV remote(s) + speaker(s) together |
| **Row** *(0.9.4)* | Horizontal flex container — places children side-by-side, stacks on narrow viewports |
| **Grid** *(0.9.4)* | CSS-grid container with N columns; child `colSpan` spans multiple columns. Responsive collapse. Lovelace `sections` views land here |
| **Tabs** *(0.9.4.1)* | Chip-bar at the top + active-tab content below. URL-bound (`?tab=<id>`) so refresh + back + deep-links work. Multi-view Lovelace dashboards land here |

Plus any **plugin-contributed blocks** active on your install
(`tmdb-tv:rows` for example, when `@broadsheet/tmdb-tv` is enabled).

---

## Block-by-block reference

### Hero

- **Headline** — required, italic display line, page-opening.
- **Eyebrow** + **Number** — small mono caps line above
  ("№ 03 · LIGHTS"). Number renders zero-padded.
- **Dek** — muted body sub-headline below the headline.
- **Size** — md (default) / lg / xl.

### Markdown

- Inline syntax: `**bold**`, `*italic*`, `` `code` ``,
  `[link](/path)`, `![alt](url)`.
- `{{entity_id}}` — broadsheet's live-state shorthand. Pass-through
  if the entity doesn't exist (typos visible).
- Jinja subset for richer templates: `{{ states('sensor.x') }}`,
  `{{ state_attr('sensor.x', 'unit') }}`, `{% set var = … %}`,
  `{% if cond %}…{% elif … %}…{% else %}…{% endif %}`. Operators
  + filters supported; `{% for %}` is NOT (deferred).
- Relative links get the SvelteKit `base` prefix automatically —
  works under HA Ingress.
- Paragraphs are blank-line separated.

### Explainer

Same inline syntax as Markdown but rendered as a single italic-
muted footer paragraph with accent-bordered links. Use as the last
block on a page to link to siblings.

### Outline

Just a section label string. Use as a divider above content blocks
that don't have their own section header.

### Macro grid / Room toggle grid / Scene row / Boost row

Discovery-aware blocks — auto-populate from
`discovery.areasForPage(…)`. Give them an optional inline label
(renders an Outline above the grid). Skip the label for an
unlabelled section.

- Boost row's **Target temperature** is the temp the tap sets each
  climate to (default 21°C).
- Scene row's **Max scenes** caps how many show (default 8 — keeps
  the row under one tablet line).

### Action grid

The flexible action-button grid. Three tile sizes:

- **Small** — chip-pill row, 120px min-width per tile
- **Medium** — default tile, 110px min-height, 180px min-width
- **Large** — chunky tile (180px min-height) for primary macros

Each action has:

- **Label** — what the tile says (required)
- **Detail** — optional sub-label like "→ 21°" or "playing"
- **Icon** — optional `mdi:*` (chip-rendered, no SVG)
- **Service call** — domain + service + target entity_id
- **State binding** — optional entity whose state highlights the
  tile when in `on` / `playing` / `home` / `open` / `unlocked`

### Entity list

Vertical list of entities with friendly name + live state + optional
icon column. One entity_id per line. Missing entities render dimmed
with a `—` placeholder.

### Sparkline

Inline SVG line chart of one entity's recent history (1-168 hours,
default 24). Pulled lazily from HA's history API on mount. Live
current value sits next to the chart. Numeric sensors only.

### Thing *(0.9.1)*

Wraps one HA entity. **Widget** picker:

| Widget | Default for |
|---|---|
| Auto | broadsheet picks based on the entity's domain (recommended) |
| Toggle | on / off button — light, switch, input_boolean |
| Tap to fire | one-shot trigger — scene, script, automation |
| Climate | current + setpoint + tap-expand slider |
| Lock | state + unlock-on-tap |
| Cover | open / close |
| TV | media_player with TV class — full remote |
| Speaker | media_player non-TV — play/pause + source |
| Camera | snapshot tile, tap to expand |
| State pill | read-only state (binary_sensor) |
| Value pill | read-only value (sensor) |
| Pick-list | input_select / select cycle |

Override only when you want a tile that's NOT the obvious widget
(e.g. a light shown as a one-shot tap-to-on rather than a toggle).

### Macro *(0.9.1)*

Composed action tile. Build via the Macro Composer modal. Tap
**Edit macro…** on the row to re-open.

### Area panels *(0.9.3)*

`area-lights-panel` / `area-climate-panel` / `area-media-panel`.
Single block, single config (`areaId` + optional label override),
renders inline grid of one widget per entity in the area at
render-time. Grows + shrinks with HA discovery — add a 5th light
to the area in HA, the panel grows automatically. Tablets / kiosks
are filtered from the media panel by default
([0.9.3.1](../CHANGELOG.md#0931--kiosktablet-filter-on-media-surfaces-2026-05-17)).

### Tabs *(0.9.4.1)*

Chip-bar at the top + the active tab's content below. Two
distinguishing properties:

- **URL-bound active tab** — `?tab=<tab-id>` in the page URL.
  Refresh keeps you on the right tab, deep-links work, browser-
  back swaps tabs the way users expect. Important for cast
  displays + wall tablets that may reload periodically.
- **Per-tab content** — each tab has its own ordered list of
  blocks. Composable as a block (not page-level), so a page can
  have a hero above + an explainer below, with tabs in the
  middle.

Multi-view Lovelace dashboards (a dashboard with > 1 view in HA)
default to landing as ONE broadsheet page with a tabs block at
the top, one tab per source view. The chip-bar navigation that
authors typically hand-author at the top of each view (mushroom-
chips-card / horizontal-stack of nav chips) is auto-detected +
dropped on import — the tabs block IS that nav, no point doing it
twice. Mixed chip-bars (where some chips navigate elsewhere) are
preserved as content.

In the things-first canvas, tapping a tabs block opens an inline
editor: per-tab label override + id editor + add / remove /
reorder tabs. Editing the BLOCKS inside each tab routes to
advanced mode (same as row/grid).

### Row + Grid *(0.9.4)*

The 0.9.4 layout container primitives. Two-up tiles, multi-column
arrangements, sections-style layouts — all become possible once
you can put blocks INSIDE other blocks.

**Row** — horizontal flex container. Drop two or more blocks
side-by-side; each takes equal flex by default. Setting a child's
`colSpan: N` weights its flex-grow so wider tiles take
proportionally more space. Stacks back to a column on narrow
viewports (<640px). Editor controls: optional section label + gap.

**Grid** — CSS-grid container with `columns: N` (default 12,
matching Lovelace's sections-layout convention). Each child takes
1 column by default; child `colSpan: N` spans N columns. Responsive
collapse: at narrower viewports the column count drops at standard
breakpoints (12 → 6 → 3 → 1 below 1024 / 640 / 480 px). Each child's
`colSpan` is clamped to the current column count so nothing
overflows.

Editor controls: optional section label, columns (1-24), gap.

**Editing children inside row/grid**: the things-first canvas
treats containers as atomic — drag, drop, remove, reorder
top-level, but children-editing routes to **advanced mode**. Flip
the editor mode in page meta to nest-edit (add/remove/reorder
children, set per-child `colSpan`). This is a known limitation;
inline children-editing is a 0.9.x follow-up.

**Most rows + grids land via the Lovelace importer** — manually
authoring them is supported but less common than receiving them
from a translated dashboard.

---

## Slug rules

The slug is the page's URL segment (`/your-slug/`):

- Lowercase letters, digits, hyphens only
- Cannot collide with core routes (`lights`, `heat`, `door`, `tv`,
  `body`, `wall`, `settings`, `setup`), active plugin pages, or
  another custom page
- The Rename form re-validates on every keystroke

When you rename, the editor URL redirects to the new slug. The OLD
URL will 404 — broadsheet doesn't keep aliases. Update any
references you've shared.

## Hide from nav

Toggle **Hide from nav** in page meta to keep the route live but
drop it from the kebab list. Useful for:

- Staging pages you're working on
- Cast targets you don't want cluttering the nav
- Internal pages reachable only via cross-links

## Page width

| Width | Use for |
|---|---|
| Narrow | Focused reading (`/long-take`-style) |
| Default | Most pages — balanced for desktop + phone |
| Wide | Tablet portrait / dense action grids |

---

## Importing instead of authoring

Got an existing Lovelace dashboard? **Settings → Pages → ⇣ Import
from Lovelace** translates Lovelace cards into broadsheet
primitives. See [`IMPORTER-GUIDE.md`](IMPORTER-GUIDE.md) for the
per-card translator status.

**0.9.4 — imports respect layout.** The translator now honours
Lovelace's layout signals:

- `horizontal-stack` → row block
- `vertical-stack` → flat sequence (page is already vertical)
- `type: 'grid'` card → grid block with same column count
- `type: 'sections'` view → one grid block per section, 12-column
  scale + section title as an outline above
- `type: 'panel'` view → translate the single card without a
  wrapper
- Default / masonry view → tiered heuristic: 3-col when >12 cards,
  2-col when 6-12, single-column when <6 (and only when ≥ 1 small
  card type is present, so all-tall dashboards don't get bunched
  side-by-side)

A new **`partial-layout` coverage status** flags cards whose data
translated cleanly but whose layout was approximated by the
masonry heuristic — so you see "I rendered the data but laid it
out flatly" distinct from "I dropped fields".

**Imported pages land as drafts** in the things-first canvas with
a clear banner above the editor: *"Draft from Lovelace import.
Review the canvas, rearrange anything you'd like, then commit so
it appears in your nav."* Two escape hatches:

- **Pre-import**: check "Skip review, save directly" on the import
  review step — the page is created with `draft: false` and lands
  in the regular editor.
- **Post-import**: tap "Save as-is" in the draft banner — flips
  the page out of draft state and into the nav, no further edits
  needed.

Drafts default to `hiddenFromNav: true` so half-reviewed imports
don't clutter the kebab. Committing flips both flags off.

---

## Tips from experience

- **Use the panels for rooms.** "Living Room lights — panel" reads
  as a Living Room widget; four individual tiles read as a wiring
  diagram. The composite blocks shape the room; the atomic recipes
  are for fine-grained customisation.
- **Pair a remote with TMDB rows.** *"Living Room TV — full remote"*
  + *"Living Room TV — TMDB show & movie rows"* + a couple of
  scenes = a working "tonight's TV" wall surface in four taps.
- **Macros over many-tile action grids.** Three taps to compose a
  macro that fires 5 service calls reads as one tile; trying to
  build the same thing as 5 action-grid tiles bloats the page.
- **Section dividers earn their place.** Don't drop an outline
  between every block — only when a real visual break helps. The
  panel blocks already render their own header.
- **State-bind your custom action tiles.** A toggle tile that
  doesn't reflect the current state is half a control.
- **Live preview is the source of truth.** If you're not sure how a
  block will look, drop it + see. The 400ms debounce makes editing
  feel snappy.

## Limits

- v0.1 stores custom pages in broadsheet's curation file (a single
  JSON blob). Fine for tens of large pages; hundreds would need a
  different storage shape.
- No conditional / responsive blocks yet — pages render the same
  block list on every viewport.
- No drag-to-reorder for actions inside an action-grid (use the
  up/down buttons).
- No deep undo / version history — but the curation file rides
  your HA backups via the addon's `addon_config:rw` mount.
- HTML5 drag-and-drop works on desktop only. On tablets / phones,
  use tap-to-add — the canvas's per-row ↑ / ↓ controls handle
  reorder.
- Inline editing of `row` / `grid` children inside the things-first
  canvas is a 0.9.x follow-up; today, container children are
  editable from **advanced mode** in the page meta.
