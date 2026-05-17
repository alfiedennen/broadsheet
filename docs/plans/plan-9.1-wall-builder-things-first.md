# Plan — 0.9.1: rethink the wall builder, things-first

**Status**: IMPLEMENTED 2026-05-17. svelte-check clean (512 files,
0 errors, 0 warnings), 270 tests pass, production build clean.
Surface defaulted ON for all new + preset-built pages; legacy
pages stay on the advanced editor via the
`editorMode ?? 'advanced'` fallback. Files shipped:

- `packages/core/src/lib/blocks/types.ts` — `ThingWidget`,
  `ThingBlockConfig`, `MacroBlockConfig`, `MacroStep`; `editorMode`
  field on `CustomPageDef`; `defaultBlockConfig('thing'|'macro')`.
- `packages/core/src/lib/blocks/thing-mapping.ts` —
  `pickWidget` / `resolveWidget` (domain → widget), `WIDGET_LABELS`,
  `DOMAIN_LABELS`, `defaultActionsFor` (for macro composer).
- `packages/core/src/lib/blocks/things-browser.ts` —
  `buildBrowserTree(areas)` + `filterBrowserTree(tree, query)`.
- `packages/core/src/lib/blocks/renderers/{Thing,Macro}BlockRenderer.svelte`.
- `packages/core/src/lib/blocks/editor/ThingsBrowser.svelte`
  (tap + drag, per-area + cross-area buckets, search, ✓ placed badge).
- `packages/core/src/lib/blocks/editor/ThingsCanvas.svelte`
  (drop seams between rows, drag-to-reorder, inline thing/macro/outline
  editors, "switch to advanced" hint for non-native blocks).
- `packages/core/src/lib/blocks/editor/MacroComposer.svelte` (modal,
  pick-thing → pick-action flow, no service.domain typing).
- `packages/core/src/lib/blocks/editor/SurfacePreview.svelte`
  (renders at customPage.surface.{width,height}, scaled to fit).
- `packages/core/src/routes/settings/pages/[slug]/+page.svelte` —
  editor-mode toggle in page meta, conditional things-first branch
  (browser+canvas+composer) vs advanced branch (legacy block list);
  preview pane swaps to `SurfacePreview` in things-first.
- `packages/core/src/routes/settings/pages/+page.svelte` —
  new + preset pages now default `editorMode: 'things-first'`.

Tests added:
- `blocks.spec.ts` — `thing` + `macro` round through
  `defaultBlockConfig` + appear in `ALL_BLOCK_TYPES` (count → 13).
- `fresh-curation.spec.ts` — registry includes both primitives.

Deferred (per the locked plan): `row` + `grid` primitives (for two-
up tiles and grid arrangements), Lovelace import landing in things-
first canvas with masonry/coverage report. Originally scheduled as
0.9.2 — reslotted to **0.9.3** after dogfood of 0.9.1 surfaced a
more urgent UX miss: the browser was showing atomic entities when
the user thinks in accomplishments. That browser rethink became
0.9.2 (`docs/plans/plan-9.2-browser-accomplishments.md`). Layout
work follows in `docs/plans/plan-9.3-lovelace-import-layout.md`.

---

**Status (pre-impl)**: LOCKED 2026-05-17 after decision-set sign-off
(deltas from drafted defaults: #3 chose B — tap AND drag from day
one, not tap-only-MVP; all other decisions confirmed as the
recommended defaults). Drafted same day after 0.9.0 ship. User
feedback:
> The pick a block section isn't actually what's needed, people want to
> add a thing, drag and drop a functional thing. They don't care/want to
> bother with how that thing renders per se, that's our job. They need
> to have the things which are controllable in their homes surfaced for
> them, have a drag and drop interface for those.

**Sequence**: 0.9.1 follows the 0.9.0 wall-builder ship. Replaces the
typed-block-picker UX on `/settings/pages/[slug]/` with a
things-first surface; keeps the block primitives + the kiosk URL +
the surface-size field underneath unchanged.

---

## Why the current shape is wrong

`/settings/pages/[slug]/` today asks the user to:

1. Pick a **block type** from a list of typed primitives (Hero,
   Markdown, ActionGrid, MacroGrid, RoomToggleGrid, SceneRow,
   BoostRow, EntityList, Sparkline, OutLine, Explainer)
2. For action-grid: configure each tile by typing **domain / service /
   target entity_id** strings into form fields
3. Hit save, hope the right thing renders

This is broadsheet's INTERNAL mental model:
- "What container do you want?" (block type)
- "What service-call should fire?" (domain.service)
- "Against which entity?" (entity_id, typed by hand)

The user's mental model is:
- "I have an Edifier speaker in the living room — put a button on the wall for it"
- "I have hallway lights — give me a way to switch them"
- "I have a cinema scene — put it on the wall as a tile"

The mismatch shows up in three concrete ways:

1. **MacroGrid renders 3 fixed tiles** ("All lights off / Boost heat /
   TVs off") with no way to customise. The user can't add their own
   macro. The block name implies "configurable grid of macros" but the
   block itself is hardcoded.
2. **RoomToggleGrid auto-renders per-area light tiles**. No way to
   exclude a room, no way to add a room that has NO lights but you
   wanted there anyway, no way to reorder.
3. **The user has to learn HA's service-call protocol** to wire up
   anything custom. Knowing that "turn off the office lights" maps to
   `domain: light, service: turn_off, target.entity_id: light.office_*`
   is reasonable for an HA power-user but not for the
   non-tech-comfortable household member who's setting up the wall.

The action-grid primitive is actually flexible enough to do anything —
it's the EDITOR UX wrapping it that's wrong.

---

## The mental model we want

A **wall** is a canvas of **controllable things** the user has placed.
Each thing knows what kind of control it is (a light → on/off + brightness;
a scene → tap-to-fire; a thermostat → temp + slider; a lock → state +
unlock action) AND broadsheet picks the right visual representation
automatically.

The user's flow is:

> "I want a button for my hallway lights"
> → Open page editor
> → Browse my house's lights
> → Tap or drag "Hallway Lights" onto the canvas
> → broadsheet renders a light-shaped tile

OR

> "I want a slider for the bedroom heat"
> → Browse my house's TRVs
> → Tap "Bedroom TRV"
> → broadsheet renders a TRV-shaped tile (current temp + slider)

The user never names a block type. The user never types a service
domain. The user picks **a thing they recognise** and broadsheet
handles the rendering.

---

## Decisions to lock

| Decision | Choice | Rationale |
|---|---|---|
| Primary editor shape | Two-pane: LEFT = things browser, RIGHT = canvas | Standard "drag/tap from palette to canvas" pattern users understand from PowerPoint / Figma / Mr Robot dashboards |
| Things browser organization | By area (default) → by domain (toggle) | Area is the user's primary mental index ("my hallway things"); domain is the power-user override ("show me every script") |
| Drop UX | Tap AND drag from day one — tap appends to end of canvas, drag drops at position | User picked B over the tap-only-MVP default. Drag uses HTML5 DnD with a defensive shape (item is the source, canvas areas are drop targets); falls back gracefully to tap on touch devices that misbehave |
| Auto-widget mapping | Domain → widget table baked into core; user can override per-thing | Sensible defaults for 95% of households; per-thing override for the 5% who want a light as a "tap to scene-trigger" instead of toggle |
| Macros | Per-page custom macros (NOT the current hardcoded MacroGrid) | User defines their own house-wide actions — "All lights off" + "Cinema mode" + "Goodnight". Could be sourced from existing HA scripts/scenes OR composed by picking multiple things + an action |
| Sections / grouping | Optional H2-style dividers between things | Lets users organise without forcing it; pages without dividers just flow as a single grid |
| Preview | Live render in a right-side iframe AT THE TARGET SURFACE DIMENSIONS | If the user declared "Fire HD 10 / 1280×800", the preview shows the wall at that resolution scale. Tells them whether things fit before deploying |
| Block primitives | Stay underneath as the storage format | The things-first editor writes typed BlockDef arrays (action-grid + scene-row + entity-list etc.) — Lovelace-importer + advanced "Edit raw" mode both still work |

---

## The things browser

A vertical scrollable palette on the left of the editor. Sections:

### "Your things, by area"

For each discovered area (kitchen, hallway, library, etc.), an
expandable group with the controllable things in that area:

```
▼ Kitchen
   ○ Kitchen Lights         [light group]
   ○ Kitchen TRV            [climate]
   ○ Kitchen Display        [media_player]
   ○ Kitchen Camera         [camera]

▼ Hallway
   ○ Hallway Spots          [light]
   ○ Hallway Pendants       [light group]
   ○ Front Door             [lock]
   ○ Front Porch Camera     [camera]
```

Each row:
- Domain icon (filled circle for lights, thermometer for climate,
  film reel for media, etc.)
- Friendly name (from HA `friendly_name` or curation override)
- Type tag (right-aligned, small caps, muted — "light" / "climate"
  / "scene" / "script")
- Tap → adds to canvas
- Drag handle (desktop) → drop on canvas at position

### "Your scenes" (collapsed by default)

Every `scene.*` discovered, area-agnostic. Tap-to-add → renders as a
scene tile (tap-to-fire).

### "Your scripts" (collapsed by default)

Every `script.*` discovered. Same: tap-to-add → renders as a tile that
runs the script. **This is where the Edifier source toggle lives.**

### "Other media + system" (collapsed)

The long tail — `automation.*` triggers, `input_boolean.*`,
`input_select.*`. Power-user surface; hidden by default.

### Search at the top of the palette

> Type a name, see filtered things. Mirrors VS Code's command palette
> ergonomics. Critical for households with 200+ entities.

---

## Auto-widget mapping

When the user adds a thing, broadsheet picks the widget that makes
sense for it:

| Domain | Default widget | Why |
|---|---|---|
| `light.*` (single) | Toggle tile + tap-expand brightness slider | Most light interactions are on/off; brightness is a one-tap-deeper concern |
| `light.*` (group) | Toggle tile labeled with the group | Group-level on/off is what users want — per-bulb is `/lights` |
| `switch.*` | Toggle tile | Same shape as light, no brightness |
| `scene.*` | Tap-to-fire tile (italic display font, accent border) | Scenes are one-shot — no state to reflect |
| `script.*` | Tap-to-fire tile (mono font, "→" affordance) | Same one-shot shape but visually distinct from scenes (scenes are about ambience, scripts are about action) |
| `climate.*` | Temp tile (current + setpoint + tap-expand slider) | TRV mental model |
| `lock.*` | State + unlock-on-tap tile | Lock is one-direction (lock writes are async + Yale-specific) |
| `cover.*` | Open/close tile | Garage doors, blinds |
| `media_player.*` (TV) | Power + source tile | Like `/tv` but compact |
| `media_player.*` (speaker) | Play/pause + source-toggle tile | Edifier-style |
| `camera.*` / `image.*` | Snapshot tile (tap to expand to live feed) | Mirrors `/door` |
| `binary_sensor.*` | Read-only state pill | Door contact, motion, etc. |
| `sensor.*` | Read-only value pill | Temperature, humidity, electricity rate |
| `input_select.*` | Pick-list tile | For Edifier-style audio routing |
| `input_boolean.*` | Toggle tile | Same shape as switch |
| Anything unknown | Generic name + state pill | Defensive fallback — never blank-screen on a new HA domain |

Plus a per-thing "Override widget" option for the user who wants a
light-as-scene-trigger (rare but supported).

---

## The canvas

Right pane of the editor. Vertically scrollable. Shows the page in
ITS REAL VISUAL FORM (the widgets that will render on the wall), at
the declared surface dimensions if set.

Each placed thing:
- Renders as its picked widget
- Has a small ✕ in the corner to remove
- Has a drag handle to reorder
- Has a ⚙ to override widget type / label / icon

Between placed things, the user can insert:
- **Section divider** with a label ("Lights" / "Heat" / "Cinema")
- **Spacer** (visual breathing room)

The canvas wraps the things into a grid that respects the surface
width. On Fire HD 10 landscape (1280px), 4 medium tiles per row; on
phone landscape (800px), 2 per row. Auto-wraps.

---

## How macros work (replacing MacroGrid)

The hardcoded MacroGrid disappears from the things browser. Replaced
by:

### "Custom macros" — a section in the things browser

The user composes macros INSIDE the page editor:

> + New macro
> Label: "Cinema mode"
> When tapped: [add actions...]
>   - Turn off  · Hallway Lights
>   - Set scene · Movie
>   - Set climate · Living Room TRV to 21°
> Done

Each step is added via the same things browser ("pick a thing, pick
what to do with it"). Saved as part of the page def. Renders as a
single tile labeled "Cinema mode" on the canvas.

This generalises the current hardcoded "All lights off" macro: the
user can compose their own house-wide actions without writing a YAML
HA script.

### Existing HA scripts still surface

If the user already wrote `script.cinema_mode` in HA, it appears in
"Your scripts" and they can tap-add it as a tile. Same rendering.
The custom-macros system is for **users who don't have scripts in HA
already** — gives them a no-YAML composer.

---

## Preview pane at target dimensions

If the user has picked a Wall device (Fire HD 10 / Galaxy Tab A9 /
etc.), the canvas right pane shows the page rendering inside a
device-frame at the actual surface resolution (scaled to fit on the
editor screen).

> "Will this fit on my Fire HD 10 without scrolling?"
> Yes — visible right there as you arrange.

Toggle "Show device frame" on/off; turn off for a full-bleed editor view.

---

## Implementation shape (storage-stable)

The user's things-first editor writes to the same `CustomPageDef`
+ `BlockDef[]` storage. Each placed thing compiles to a block of the
appropriate type:

- `light.*` (single) → `action-grid` with one tile
- `scene.*` → `action-grid` with one tile, italic-display variant
- `climate.*` → currently no climate-specific block — would need
  a new `climate-tile` block primitive (or reuse part of `/heat`)
- `lock.*` → same — would need a `lock-tile` block primitive

Or — and this is the cleaner architecture — introduce a single
**`thing` block primitive** that takes `{ entityId, widgetOverride? }`
and the renderer picks the right widget at render time based on the
entity's domain. Then the things-first editor writes `thing` blocks
exclusively; macros write `macro` blocks (a new primitive); section
dividers write `outline` blocks. Three primitive types covers
~95% of wall layouts.

**Storage migration**: existing custom pages with action-grid /
room-toggle-grid / etc. still render correctly via their existing
renderers. The things-first editor authors NEW pages with the new
primitives. Old pages stay editable in an "Advanced" view that
exposes the legacy block picker. Two editor modes; same storage; no
data migration needed.

---

## Out of scope for 0.9.1

- **Lovelace import upgrade** — separate ship (0.9.2). The importer
  still produces typed BlockDef arrays; users can edit imported
  pages in the things-first canvas once 0.9.2 lands.
- **Cast to Nest Hub** — out of scope (different protocol; HA's own
  cast tooling is the pragmatic answer for now).
- **Per-thing styling** (colour, custom icons) — deferred polish.

---

## Ship signal for 0.9.1

1. `/settings/pages/[slug]/` defaults to "Things-first" editor mode.
   "Advanced (block-by-block)" toggle in the page meta exposes the
   legacy editor for users who want it.
2. Things browser left pane:
   - "By area" section (default expanded)
   - "By domain" section (collapsed)
   - Search bar
3. Canvas right pane:
   - Tap-to-add from palette
   - ✕ remove + drag-to-reorder per thing
   - Section divider + spacer inserts
4. New block primitives:
   - `thing` block (entity ref + optional widget override)
   - `macro` block (composed actions list)
5. Widget auto-mapper (domain → renderer):
   - Light / switch / scene / script / climate / lock / cover /
     media_player / camera / image / binary_sensor / sensor / input_*
   - Defensive fallback for unknown domains
6. Macro composer flow: name → pick actions via things browser →
   save → appears as a custom macro in the palette
7. Preview pane at declared surface dimensions
8. Manual dogfood: a non-technical household member can build a
   functional wall surface for their own room without seeing the word
   "service_call" or "entity_id" once.
