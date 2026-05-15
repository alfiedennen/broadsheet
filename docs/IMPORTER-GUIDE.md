# Lovelace importer — user guide

The importer reads your existing Home Assistant Lovelace dashboards
and translates them into broadsheet custom pages. Cards become
broadsheet's typed primitives, retaining live data; layout-heavy
features (grids, overlays, conditional gates) flatten to broadsheet's
vertical sequence with a coverage report so you know what was lost.

## When to use it

- **Migrating a heavily-customised dashboard** — quick way to get a
  vertical-prose version of a Lovelace page in the broadsheet
  register without rebuilding from scratch.
- **Turning a control panel into prose** — Lovelace cards become
  markdown lines / state-bound action tiles / sparklines, which read
  more like a newspaper than a dashboard.
- **Validating coverage** — see the per-card report before committing,
  understand which Mushroom / HACS cards translate cleanly vs which
  fall through.

## Three-step flow

**Settings → Pages → ⇣ Import from Lovelace**.

### 1. Pick a dashboard

Lists every Lovelace dashboard in your HA install plus a synthetic
"Overview (default)" entry at the top. Each entry shows the
dashboard's URL slug + storage mode (`storage` / `yaml`).

If "Overview (default)" fails to load, that's normal — it usually
means you've never customised it (HA generates the default on the
fly). Pick a different dashboard you've actually customised.

### 2. Pick a view

Each Lovelace dashboard has one or more views (the tabs across the
top). Each view becomes its OWN broadsheet custom page — you can't
flatten multiple views into one page.

You see a per-view summary line:

> **Calendar** · 3 BLOCKS · 1 CLEAN / 3 PARTIAL / 0 SKIPPED

Translation reading:

- **N blocks** — how many broadsheet blocks this view will produce
  (recursive wrappers count as zero blocks themselves; their child
  cards become the blocks)
- **clean** — translated 1:1, nothing material lost
- **partial** — translated with a caveat (chrome dropped, history
  dropped, layout flattened, etc.)
- **skipped** — no translator yet for this card type

There's also a top-line totals row across all views.

### 3. Review + commit

Pick a view to land in step 3. You see:

**Destination** — the label + slug for the new custom page. Auto-
derives from the view title; edit either if you want.

**Coverage report** — one row per card in the source view, with a
badge (clean/partial/unsupported) + the card type + a note
explaining what was lost. Read this carefully — it tells you
exactly what you're losing in the import.

**Preview** — the actual `RenderedPage` running on the translated
blocks. WYSIWYG.

**Import as custom page** — commits, lands you in the editor for
further hand-tuning. The new page is at `/<slug>/` and in the
kebab nav immediately.

## Reading coverage notes

Examples of notes you'll see:

| Note | What it means |
|---|---|
| `Jinja templates evaluate at render time.` | Mushroom-template-card with `{{ }}` / `{% %}` syntax — the broadsheet Jinja evaluator handles it, output is real live state. |
| `Card chrome (icon, layout) replaced with markdown.` | Mushroom-style card without Jinja — content surfaces as markdown but the icon + grid layout are gone. |
| `Horizontal layout flattened to vertical (no horizontal primitive yet).` | `horizontal-stack` cards stack vertically in broadsheet. |
| `Condition dropped — wrapped card always renders.` | `conditional` cards always render their wrapped card; the gating is gone. |
| `Glance overlay flattened — image then entity list.` | `picture-glance` becomes image block + entity-list block instead of overlay. |
| `Tile features (sliders, buttons) dropped — single state-bound action only.` | The newer `tile` card → action-grid tile; sliders + buttons gone. |
| `Browse-media + volume slider dropped — playback controls only.` | `media-control` → 3-tile prev/play-pause/next action-grid. |
| `Chart history dropped — current values surfaced as a list.` | A chart card whose history doesn't have a primitive landing zone — values surface as a markdown list. |
| `iframe replaced with a link — broadsheet does not embed external URLs.` | iframe cards become a clickable link to the URL. |
| `No translator for this card type yet.` | Card type isn't recognised. Reported but emits no block. Skip + hand-edit, or open an issue with the card type. |

Full translator-by-translator reference: `TRANSLATOR-MATRIX.md`.

## What survives, what doesn't

**Always survives:**

- Live entity data (state, attributes, friendly_name)
- Card type recognition + per-card report
- Markdown / template content
- Tap actions for action-shaped cards (mapped to service calls)
- Recursive wrapper traversal (vertical-stack, layout-card, etc.)

**Flattens or drops:**

- Visual chrome — icons, badges, custom layouts (mushroom card grid,
  picture-glance overlay)
- Horizontal layout (becomes vertical stack)
- Conditional gating (cards always render)
- Sliders / multi-action controls (kept as a single state-bound action)
- Chart visuals where the corresponding primitive doesn't exist yet
  (sparkline covers single-entity mini-graph; multi-entity overlays
  become stacked sparklines; apexcharts hasn't got a translator yet)
- Tap-action types beyond `call-service` and `toggle`
  (`navigate`, `more-info` modals, custom JS — dropped)

**Definitely doesn't yet:**

- Picture-elements card (positions elements on an image — too custom
  to translate cleanly)
- Energy distribution card
- Custom apexcharts-card with non-trivial config
- iframe-rendered embedded pages

## After import

The imported page lands in the editor automatically. From there:

- Edit any block to refine — the structured editors are friendlier
  than fixing things in the source Lovelace YAML.
- Drop blocks you don't want (visual padding, redundant info).
- Add Hero + Explainer if the source view didn't have them — most
  Lovelace views don't, but most broadsheet pages benefit from
  them.
- Reorder via the ⋮⋮ drag handle if the imported order doesn't
  flow well as prose.

## Tips

- **Imports are starting points, not finished pages.** A 100%-coverage
  import might still be worth restructuring — Lovelace card order
  often reflects "where I had room on the screen" not "what I want
  to read first".
- **Re-import isn't supported yet.** If the source Lovelace dashboard
  changes after import, your custom page won't pick up the changes.
  Either delete + re-import, or hand-edit the diffs in the broadsheet
  builder.
- **Pages with low coverage may not be worth importing.** If most of
  the source uses card types broadsheet doesn't translate yet, hand-
  building from primitives is often faster than fixing import gaps.

## Reporting unsupported cards

If you hit a card type that's marked "No translator for this card
type yet" and you'd like coverage:

- Open an issue with the card's `type` field + a representative
  example of the card's config (sanitised — don't include sensitive
  entity IDs unless you're ok with them being public)
- The translator-add path is documented in `TRANSLATOR-MATRIX.md`
  ("Adding a translator")
- Contributions welcome
