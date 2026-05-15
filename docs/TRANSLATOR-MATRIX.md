# Lovelace translator matrix

Reference: every Lovelace card type broadsheet translates, what it
becomes, and what fidelity to expect. Source of truth is
`packages/core/src/lib/lovelace/translate.ts`.

## Coverage classes

| Class | What it means |
|---|---|
| **clean** | Direct 1:1 translation. Nothing material lost. |
| **partial** | Translates but loses something specific (chrome, history, layout, gating, sub-controls). The note column says what. Live data + content still flow through. |
| **unsupported** | No translator yet. Card is reported in the coverage report so authors know it was skipped, but emits zero blocks. |

## Built-in HA cards

| Lovelace card | Becomes | Class | Notes |
|---|---|---|---|
| `markdown` | markdown block | clean | Jinja templates evaluate at render time via the broadsheet Jinja-subset evaluator. |
| `entity` | markdown line | clean | `**Name**: \`{{entity_id}}\`` — live state interpolation. |
| `entities` | entity-list | clean (or partial if non-entity rows present) | Per-row `name` overrides preserved. Divider / section / sub-card rows are dropped with a note. |
| `glance` | entity-list | partial | Grid layout flattened to a vertical list. |
| `gauge` | markdown line | partial | Gauge dial visual dropped, value surfaced live. |
| `sensor` | markdown line | partial | Chart history dropped, value surfaced live. |
| `weather-forecast` | markdown line | partial | 5-day forecast dropped, current condition surfaced live. |
| `picture` | markdown image | clean (or partial if `tap_action`) | `tap_action` dropped — picture is read-only. |
| `picture-glance` | markdown image + entity-list | partial | Overlay flattened: image then entity list. |
| `picture-entity` | markdown image + markdown state line | partial | `tap_action` overlay dropped. |
| `button` | action-grid (1 tile) | clean | Discovers service from `tap_action` or domain default (light/switch/fan → toggle, scene/script → turn_on, lock → unlock). |
| `light` | action-grid (1 tile) | partial | Toggle only — brightness slider + colour controls dropped. |
| `tile` | action-grid (1 tile) | partial | Tile features (sliders, buttons) dropped — single state-bound action only. |
| `media-control` | action-grid (3 tiles) | partial | ⏮ / ⏯ / ⏭ playback only — browse-media + volume slider dropped. |
| `iframe` | markdown link | partial | Broadsheet doesn't embed external URLs; surfaces as a clickable link. |
| `heading` | outline | clean | Direct 1:1 — section divider. |
| `vertical-stack` | (recurses into children) | clean | Children translate individually; this wrapper emits no block of its own. |
| `horizontal-stack` | (recurses into children) | clean | Same as vertical-stack but with a note that horizontal layout flattens to vertical. |
| `conditional` | (recurses into wrapped card) | partial | Condition gate dropped — the wrapped card always renders. |

## HACS / custom cards

| Lovelace card | Becomes | Class | Notes |
|---|---|---|---|
| `custom:mushroom-template-card` | markdown OR action-grid | partial | Three shapes handled: (a) text-only → markdown with primary/secondary; (b) icon-only with `tap_action` → action-grid tile; (c) decorative empty → recognised + empty (partial, no blocks). Jinja evaluates at render time. |
| `custom:mushroom-chips-card` | action-grid (small) + markdown | clean (or partial if mixed) | Action-bound chips become small action tiles; non-action chips (template, weather, conditional) become a markdown summary line. |
| `custom:mushroom-light-card` | action-grid (1 tile) | partial | Mushroom card chrome dropped — kept as a state-bound action tile. |
| `custom:mushroom-entity-card` | action-grid (1 tile) | partial | Same as mushroom-light-card. |
| `custom:layout-card` | (recurses into children) | clean | Grid / masonry layout config dropped — children render flat-vertically. |
| `custom:stack-in-card` | (recurses into children) | clean | Same as layout-card but for stack-in-card's wrapper-style. |
| `custom:button-card` | action-grid (1 tile) | partial | Custom layout + per-state styling dropped — single state-bound action tile. |
| `custom:calendar-card-pro` | markdown stub | partial | Agenda view dropped — surfaces a stub naming the calendar entity/entities. |
| `custom:mini-graph-card` | sparkline (one per entity) | clean (1 entity) / partial (2+ entities) | Single-entity charts translate cleanly. Multi-entity overlays split into stacked sparklines. |

## Tap-action resolution

The `tapActionToServiceCall` helper (used by every action-grid-emitting
translator) maps Lovelace `tap_action` shapes to broadsheet's
`ServiceCall` spec:

- `{ action: 'call-service', service: 'light.turn_on', target: { entity_id: '…' }, data?: {…} }` → direct mapping.
- Anything else (`toggle`, `more-info`, `navigate`, …) → falls through
  to the entity-domain default.

Domain defaults when no usable `tap_action`:

| Domain | Default service |
|---|---|
| `light`, `switch`, `fan`, `input_boolean` | `toggle` |
| `scene`, `script` | `turn_on` |
| `lock` | `unlock` |
| (other) | unsupported (translator returns null) |

## Adding a translator

Per `packages/core/src/lib/lovelace/translate.ts`:

1. Write a function `translateXxx(card: LovelaceCard) → { blocks, coverage, note? }`.
2. Add the card type to the `TRANSLATORS` allow-table.
3. Add it to the dispatch in `translateView`'s `singleCardTranslators` map (or the recursive-wrapper branch if it has children).
4. Update this matrix.

Translators receive the raw Lovelace card object (typed permissively
as `Record<string, unknown>` via `LovelaceCard`). Return zero or more
`BlockDef`s + a coverage class. The framework handles report
aggregation, the importer UI handles display.

## Coverage measurement (real-world install)

On a heavily-customised dashboard with 88 cards across 7 views
(mix of HA built-ins, Mushroom, layout-card, mini-graph-card,
calendar-card-pro):

| Stat | Count | % |
|---|---|---|
| Clean | 27 | 31% |
| Partial | 57 | 64% |
| Skipped | 4 | 5% |
| **Rendered (clean + partial)** | **84** | **95%** |

The 4 skipped on the canary install are decorative empty
mushroom-template-cards (no text, no tap_action) — recognised as
visual spacers in remote-control layouts and emit no block by
design, classified `partial` since 0.1.67.

## Known limitations

- **No chart history overlay.** Multi-entity mini-graph-cards
  translate to stacked sparklines, not a single overlaid chart. By
  design — the editorial register prefers a vertical sequence of
  small charts to a busy multi-line one.
- **No `{% for %}` loop in Jinja.** The minimal evaluator supports
  `{% set %}` and `{% if %}` but no iteration. Templates that walk
  arrays with for-loops fall through as raw text.
- **No conditional-block primitive.** `conditional` cards always
  render their wrapped card; the gate is dropped with a note.
- **No iframe embed.** `iframe` cards become a markdown link to the
  external URL — broadsheet doesn't proxy or embed external content.
- **Custom card types not in this matrix** are reported as
  `unsupported` with note "No translator for this card type yet".
  Authors can either pin to a different card in HA, or hand-edit
  the imported page after import to swap in a hand-built block.
