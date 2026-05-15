# broadsheet

> *Home Assistant, rendered as a magazine.*

A front-end for Home Assistant shaped like a publication. Italic display
serif. Newsreader body. Pages, not screens. Prose, not specs.

Adapts to whatever you already have in HA — areas, lights, climates,
locks, media players, sensors. No `house.yaml` to write before it works.
Install, point at your HA, see your house.

[ screenshot — landing page, painting left, manifest text right, italic amber over warm off-black ]

One opinionated take on what a home dashboard could feel like, if you
wanted it to feel less like software.

---

## Install

broadsheet ships as a **Home Assistant add-on**. One install path,
zero credentials to handle.

### Requirements

- Home Assistant **OS** or **Supervised** install (the kinds that have
  the add-on store). Most people run HA OS — if you installed via the
  official HA image on a Pi, NUC, or a VM, you're set.
- HA 2024.4 or newer.

> **Running HA Container or HA Core?** v0.1 doesn't ship for those (no
> Supervisor = no add-on store). Docker support is on the roadmap —
> [open an issue](https://github.com/<TBD>/broadsheet/issues) if that's you.
> Volume of requests will tell us when to prioritise it.

### Install in two minutes

1. Add this repository to your HA add-on store:

   [![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2F<TBD>%2Faddon)

2. In **Settings → Add-ons → Add-on Store**, find **broadsheet**, click
   **Install**.
3. Click **Start**, then **Open Web UI**.

That's it. The add-on auto-authenticates against your HA via the
Supervisor token — no LLAT to paste, no `.env` to fill in. broadsheet
appears in your HA sidebar and stays there.

### From source (for contributors)

```sh
git clone https://github.com/<TBD>/broadsheet
cd broadsheet
pnpm install
pnpm dev               # localhost:5173 — paste HA URL + token in the setup form
pnpm build             # static output in build/
```

`adapter-static` produces a pure-static tree. The HA add-on bakes that
output into an nginx-fronted container. If you're running broadsheet
locally for development, the dev mode talks to your HA over WebSocket
with a long-lived token you generate in HA → Profile → Long-Lived
Access Tokens.

---

## What you get

Eight pages, each shaped for what it's actually for — not a uniform grid
of tiles. Every page **discovers what's relevant from your HA at boot**:
new room added in HA tonight? It's on the right pages tomorrow without
you editing anything.

| Page | Renders | Discovers from |
|---|---|---|
| **`/`** the moment | Live painting (or ambient gradient) of who's home + single-line manifest of the day | `person.*` + a presence sensor of your choosing per person |
| **`/lights`** | Prose state ("library and office are on"), scene chips, per-area reveal with sliders + per-bulb sub-reveal | Areas containing any `light.*` or lighting `switch.*` |
| **`/heat`** | Three macros (Boost / All warm / All frost), per-room TRV reveal with ±0.5° nudges | Areas containing any `climate.*` |
| **`/door`** | Lock state hero + one Unlock action. Camera image below. | `lock.*` entities + nearby door contact `binary_sensor.*` + paired `camera.*` if any |
| **`/tv`** | Remote on the left, streamer-app launcher on the right. Below: a content browser fed by TMDB ("New" / "Trending" lenses, regionalisable). | `media_player.*` with TV device class + `remote.*` |
| **`/body`** | Health-data panels with honest sub-labels ("once daily" / "measured during sleep") so empty panels explain themselves | Health Connect `sensor.*` pattern matching (Pixel) — Apple Health bridge planned |
| **`/long-take`** | *Plugin.* 24-hour radar event playback per room as a translucent water-membrane time tube | Activates if `@broadsheet/ghost-cloud` is installed + radar JSON is being precomputed on HA |
| **`/emanations`** | *Plugin.* Multi-person presence painting that swaps live as people move | Activates if `@broadsheet/emanations` is installed + you've supplied per-room paintings |

A ninth surface, **`/wall`**, is a deliberately dense action grid for a
hallway tablet — same app, surface-specific landing.

If your HA install has things broadsheet doesn't know how to render
(custom integrations, exotic device classes), they show up in an
**Unsorted** section on the relevant page with a one-click
"hide / pin / categorise" affordance. Out-of-the-box render coverage is
the goal; manual curation is the escape hatch.

---

## Make your own pages

Beyond the eight curated pages, broadsheet has a **typed
primitive system** for composing custom pages without writing code.

11 primitives — Hero, Markdown (with `{{entity_id}}` + Jinja
templates), Explainer, Outline, Macro grid, Room toggle grid,
Scene row, Boost row, Action grid, Entity list, **Sparkline** (an
inline SVG chart of any sensor's history pulled live from HA).

**Builder UI** at `/settings/pages`:

- + New page → name, slug, width
- Add blocks visually, edit each in a structured form (no JSON to
  write — every block has a typed editor: text inputs, dropdowns,
  per-action service-call fieldsets for action grids)
- Drag-to-reorder blocks
- Live preview pane updates as you type
- Page is live at `/<slug>/` immediately + appears in the kebab nav
- Slug rename + page duplicate with collision validation

**Lovelace importer** at `/settings/pages/import`:

- Reads your existing HA dashboards via the stable WS API
- Translates 27 card types — every built-in HA card type plus
  the most common HACS cards (Mushroom, layout-card, button-card,
  mini-graph-card, calendar-card-pro, …) — into broadsheet
  primitives
- Includes a **minimal Jinja-subset evaluator** so
  mushroom-template-card content with `{{ states('…') }}` /
  `{% if %}` / `{% set %}` evaluates at render time, not as
  literal text
- Per-card coverage report (clean / partial / unsupported) before
  you commit, so you know exactly what you're losing
- Imported page lands in the editor for hand-tuning

On real-world heavily-customised dashboards (the canary install
runs a Mushroom-and-HACS-heavy 88-card dashboard), the importer
renders **95% of cards** with at least partial fidelity.

See [`CUSTOM-PAGES-GUIDE.md`](./CUSTOM-PAGES-GUIDE.md),
[`IMPORTER-GUIDE.md`](./IMPORTER-GUIDE.md), and
[`TRANSLATOR-MATRIX.md`](./TRANSLATOR-MATRIX.md) for the user-facing
docs; [`PLUGIN-AUTHOR-QUICKSTART.md`](./PLUGIN-AUTHOR-QUICKSTART.md)
for the plugin-author path.

---

## Why this exists

The Home Assistant frontend ecosystem is rich. Mushroom, Bubble Card,
Tile, Tunet, the Lovelace strategy generators — there's a mature,
well-loved set of options for laying out tiles, sliders, and status
chips, and most of them are excellent at what they do.

broadsheet is a different shape — not because the others are wrong, but
because some people want a register the existing options don't aim for.
Italic display serif. Sentence headlines. Three deliberate tap-targets
above the fold instead of forty. A page where the live painting takes
the visual centre and the controls quietly sit beside it.

If you love your Mushroom config, keep your Mushroom config. broadsheet
isn't an upgrade — it's a stylistic alternative for the cohort that
opens HA's default dashboard and thinks *this is fine but it doesn't
quite feel like something I'd want on the wall in my hallway.*

---

## Adapt to your house

Out of the box, broadsheet uses what HA already knows: areas, devices,
entities, the relationships between them. If your HA install is
reasonably tidy (areas named, devices assigned), you'll see a sensible
broadsheet on first load with no configuration.

For when you want it to be more your-shape, **Settings** in the kebab
nav opens an in-app curation layer:

- **House** — every area + entity broadsheet found, with hide / pin /
  reorder / rename. Drag entities between pages if our auto-grouping
  guessed wrong. No YAML.
- **People** — broadsheet finds your `person.*` entities; for each, pick
  the presence sensor you actually trust. (Warning surfaced for iOS
  Companion-App GPS-suspension cases — long-running pain that bites
  Pixel/iPhone mixed households.)
- **Voice** — the editorial strings. Default copy ships in English; you
  override per-section. Want your manifest line to be a haiku? Up to you.
- **Paintings** — the visual centre of `/`. Defaults to a procedural
  ambient gradient per area. Optional: drop PNGs into the data volume
  per the `<area-slug>.png` convention to use your own art.
- **Integrations** — TMDB key for `/tv` content (free, regional UK/US/EU
  provider IDs auto-detect). Health Connect / Apple Health bridges for
  `/body`. Plugin renderers (`@broadsheet/ghost-cloud`,
  `@broadsheet/emanations`) install and self-register if your HA has
  the source data.

Curation is persisted to your data volume as `broadsheet.json`. You can
edit it directly if you prefer files to UIs — the Settings panel is a
thin wrapper.

---

## Architecture

For people who care:

- **SvelteKit 2 + Svelte 5 runes**, `adapter-static` — pure-static
  build, no server runtime
- **Single persistent WebSocket** per device, owned by the layout. Auto-
  reconnect with exponential backoff. Application-level heartbeat
  (30s ping / 10s pong-timeout / force-close on zombie) — survives HA
  restarts cleanly.
- **Reactive entity store** using Svelte 5 runes (`$state` / `$derived`)
- **Same-origin reverse proxy** so the SPA can fetch HA's `/api/*` and
  `/local/*` without CORS pain. The Docker image and the HA add-on
  both ship the proxy preconfigured.
- **PWA** — manifest, icons, iOS apple-touch-icon. Add to Home Screen
  on iPhone or Android and it opens borderless.
- **Three responsive axes** — width, height, and hover-vs-touch. Tap
  targets meet the 44pt floor on touch; hover effects are scoped to
  pointer-capable devices.
- **Optional `@broadsheet/renderers`** package wraps the Three.js
  renderers (Ghost Cloud, Emanations) so projects that want them get
  them as a dependency, projects that don't carry zero overhead.

Everything else lives in the [architecture deep-dive](./docs/ARCHITECTURE.md).

---

## Status

**Pre-1.0.** Used in production daily by the author at one address.
Three surfaces (phone, desktop, wall tablet) all working. Maintained.

What's stable:
- Core pages (`/`, `/lights`, `/heat`, `/door`, `/tv`, `/body`)
- Multi-person painting (`/emanations`)
- Mobile + desktop responsiveness
- WebSocket robustness across HA restarts

What's still raw:
- HA add-on auto-credential flow (working but not extensively tested)
- The in-app Settings UI (today most config is `house.json` + edit;
  the visual editor is on the roadmap)
- Theming hooks (one register ships; multiple registers planned)

What needs help:
- Translations beyond English
- Apple Health bridge for `/body` (currently Pixel/Health Connect only)
- Per-region TMDB provider ID dictionaries

---

## Contributing

Issues, PRs, and screenshots of your install very welcome. The codebase
is small and reasonably documented; `pnpm dev` should produce a working
local instance against your own HA in under 5 minutes.

If you want to use broadsheet's editorial language in a thing you're
selling, that's fine — MIT license, as long as the colophon credit
remains. If you want to fork and rebrand wholesale, also fine.

---

## Acknowledgments

The four-font studio register and editorial paradigm were originally
built for a single private house, alongside the public studio project
at [haroldathome.com](https://haroldathome.com). broadsheet is the
extracted, generalised version — same paradigm, none of the personal
specifics.

[ colophon screenshot ]
