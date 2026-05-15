# Custom pages — author guide

broadsheet's custom-page builder lets you compose pages from typed
primitives without writing code. Pages live at `/<slug>` and appear
in the kebab nav alongside the core pages.

## What you can make

A custom page is an ordered list of "blocks" — each block is one of
broadsheet's editorial primitives. The 11 currently available:

| Block | Use for |
|---|---|
| **Hero** | Page-opening composition: eyebrow + italic headline + sub-headline |
| **Markdown** | Prose paragraphs with `{{entity_id}}` live-state interpolation. Supports **bold**, *italic*, `code`, [links](/), images, and Jinja templates (`{{ states('…') }}`, `{% if %}`) |
| **Explainer** | Italic-muted footer paragraph with cross-page links |
| **Outline** | Caps-and-rule section divider |
| **Macro grid** | Three big tiles: All lights off · Boost heat · TVs off (auto-discovers targets) |
| **Room toggle grid** | One tile per discovered lighting area, tap to toggle |
| **Scene row** | Pill row of every discovered scene |
| **Boost row** | Per-climate-area "boost to N°" tile |
| **Action grid** | Configurable grid of action tiles, each firing a service call (with optional state-binding) |
| **Entity list** | Vertical list of entities with name + live state + optional icon |
| **Sparkline** | Inline SVG line chart of one entity's recent history |

## Quick start: build your first page

1. Open **Settings → Pages**.
2. Tap **+ New page**, give it a label (e.g. "Garage").
3. Slug auto-derives from the label (e.g. `garage`); edit if you want.
4. Pick page width (Default for most pages; Wide for tablet / dense
   grids; Narrow for focused reading).
5. Tap **Create + edit** — you land in the editor with a starter Hero
   block.
6. Tap **+ Add block** to add more. Each new block opens its inline
   editor automatically so you can configure it immediately.
7. Edit + see live preview update on the right.
8. Page is live at `/<slug>/` immediately + appears in the kebab nav.

## The editor anatomy

Two columns on wide viewports:

**Left column — meta + blocks**

- **Page meta** — label, icon (`mdi:*`), width, hide-from-nav toggle.
- **Save status** strip (top of editor) — shows `editing… / saving… /
  ✓ saved / ⚠ save failed`. Edits debounce at ~400ms before
  persisting; the indicator tells you when your changes have landed.
- **Rename slug** + **Duplicate page** buttons next to the save
  status — both validate against the same slug rules as create.
- **Block list** — drag the ⋮⋮ grip to reorder, click a block's
  title to expand its inline editor, use the per-row up/down/Remove
  controls when drag isn't convenient.
- **+ Add block** menu — every registered block type with description.
- **Danger zone** — Delete page (with confirmation).

**Right column — live preview**

The same `RenderedPage` component the live route uses, rendering the
current block list. Updates synchronously as you type — what you see
IS what users see.

## Block-by-block tips

### Hero

- **Headline** is the page-opening italic display line. Required.
- **Eyebrow** + **Number** render the small mono caps line above
  ("№ 03 · LIGHTS"). Both optional. Number renders as `№ XX` (zero-padded).
- **Dek** is the muted body sub-headline below the headline. Optional.
- **Size** affects the headline scale: md (default) / lg / xl.

### Markdown

- Body supports the inline syntax: `**bold**`, `*italic*`, `` `code` ``,
  `[link](/path)`, `![alt](url)`.
- `{{entity_id}}` — broadsheet's shorthand. Looks up the entity's
  state value; pass-through if no such entity (so typos are
  visible).
- Full Jinja-subset for richer templates: `{{ states('sensor.x') }}`,
  `{{ state_attr('sensor.x', 'unit') }}`, `{% set var = … %}`,
  `{% if cond %}…{% elif … %}…{% else %}…{% endif %}`. Operators
  + filters supported; `{% for %}` is NOT (deferred).
- Relative links (`/path`) get the SvelteKit `base` prefix
  automatically — they work under HA Ingress.
- Paragraphs are blank-line separated.

### Explainer

Same inline syntax as Markdown but rendered as a single italic-muted
footer paragraph with accent-bordered links. Use as the last block
on a page to link to siblings.

### Outline

Just a section label string. Use as a divider above content blocks
that don't have their own section header.

### Macro grid / Room toggle grid / Scene row / Boost row

Discovery-aware blocks — they auto-populate from
`discovery.areasForPage(…)` etc. Just give them an optional inline
label that renders an Outline above the grid. (Skip the Outline if
you want the section unlabelled.)

- Boost row's **Target temperature** is the temp the tap sets each
  climate to (default 21°C).
- Scene row's **Max scenes** caps how many scenes show (default 8 —
  keeps the row under one tablet line).

### Action grid

The flexible action-button grid. Three tile sizes:

- **Small** — chip-pill row, 120px min-width per tile
- **Medium** — default tile, 110px min-height, 180px min-width
- **Large** — chunky tile (180px min-height) for primary macros

Each action is a card with:

- **Label** — what the tile says (required)
- **Detail** — optional sub-label like "→ 21°" or "playing"
- **Icon** — optional `mdi:*` (chip-rendered, no SVG dependency)
- **Service call** — domain (e.g. `light`) + service (`toggle`) + 
  target entity_id
- **State binding** — optional entity whose state highlights the
  tile when in `on` / `playing` / `home` / `open` / `unlocked`

Use the per-action up / down / Remove controls. + Add action appends
a sensible default (light.toggle, blank target).

### Entity list

Vertical list of entities with friendly name + live state + optional
icon column. Configure with one entity_id per line in the textarea.
Missing entities render dimmed with a `—` placeholder.

### Sparkline

Inline SVG line chart of one entity's recent history (1-168 hours,
default 24). Pulled lazily from HA's history API on mount; refetches
when the entity_id or hours change. Live current value sits next to
the chart so the register is "trend + now", not "chart". Numeric
sensors only — non-numeric entities show a "not numeric" notice.

## Slug rules

A slug is the page's URL segment (`/your-slug/`):

- Lowercase letters, digits, hyphens only
- Cannot collide with: core routes (`lights`, `heat`, …), active
  plugin pages, or another custom page
- The Rename slug form re-validates on every keystroke

When you rename, the editor URL redirects to the new slug. The OLD
URL will 404 — broadsheet doesn't keep aliases. If you've shared
the old URL anywhere (bookmarks, automations, links from other
pages), update those references.

## Hide from nav

Toggle "Hide from nav" in page meta to keep the route live but drop
it from the kebab list. Useful for:

- Staging pages you're working on
- Cast targets you don't want cluttering the nav
- Internal pages reachable only via cross-links

The page still renders at `/<slug>/`; just doesn't earn a nav entry.

## Page width

| Width | Use for |
|---|---|
| Narrow | Focused reading (`/long-take`-style) |
| Default | Most pages — balanced for desktop + phone |
| Wide | Tablet portrait / dense action grids |

## Importing instead of authoring

If you have an existing Lovelace dashboard you want to bring across,
**Settings → Pages → ⇣ Import from Lovelace** translates Lovelace
cards into broadsheet primitives. See `IMPORTER-GUIDE.md`.

## Tips from experience

- **Compose, don't replicate.** Custom pages shine when they say
  something with prose + sparingly chosen affordances. Resist the
  urge to surface every entity — the editorial register expects
  intentional pages, not entity dumps.
- **Hero + 2-3 content blocks + Explainer** is a good spine for
  most pages. More than 5-6 blocks usually means the page is doing
  too many jobs.
- **Markdown does more than you'd expect.** With `{{entity_id}}`
  shorthand + Jinja fallback, a markdown block can carry a
  surprising amount of live state without needing dedicated
  primitives.
- **State-bind your action tiles.** A toggle tile that doesn't
  reflect the current state is half a control. Set the
  state-binding entity_id even when it's the same as the action
  target.
- **Live preview is the source of truth.** If you're not sure how a
  block will look, add it + see. The 400ms debounce makes editing
  feel snappy.

## Limits

- v0.1 stores custom pages in broadsheet's curation file (a single
  JSON blob). For installs with many large pages this is fine; for
  hundreds of pages a different storage shape would be needed.
- No conditional / responsive blocks yet — pages render the same
  block list on every viewport.
- No drag-to-reorder for actions inside an action-grid (use the
  up/down buttons; drag-reorder lands in a follow-up).
- No deep undo / version history — but the curation file IS in your
  HA backups via the addon's `addon_config:rw` mount.
