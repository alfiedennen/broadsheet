# broadsheet

> *Home Assistant, rendered as a magazine.*

A front-end for Home Assistant shaped like a publication. Italic display
serif. Newsreader body. Pages, not screens. Prose, not specs.

Adapts to whatever you already have in HA — areas, lights, climates,
locks, media players, sensors. No `house.yaml` to write before it works.
Install, point at your HA, see your house.

<!-- TODO(screenshot): landing page — painting left, manifest text right, italic amber over warm off-black -->

One opinionated take on what a home dashboard could feel like, if you
wanted it to feel less like software.

---

> **🛠 Early-tester soak.** broadsheet is in a small private soak —
> a handful of trusted HA users running it on real installs while it
> bakes. If you're testing it, please read
> [docs/EARLY-TESTERS.md](docs/EARLY-TESTERS.md) — it covers what's
> stable vs fresh, what kind of feedback is most useful, and how to
> file what. Bug reports go to
> [Issues](https://github.com/alfiedennen/broadsheet/issues); everything
> else lives in
> [Discussions](https://github.com/alfiedennen/broadsheet/discussions).

---

## Install

broadsheet ships as a **Home Assistant add-on**. One install path, zero
credentials to handle.

### Requirements

- Home Assistant **OS** or **Supervised** install (the kinds that have
  the add-on store). Most people run HA OS — if you installed via the
  official HA image on a Pi, NUC, or a VM, you're set.
- HA 2024.4 or newer.
- **amd64 is the tested, supported architecture.** The `aarch64` image
  builds in CI and is published, but hasn't yet been verified on real
  ARM hardware — treat it as experimental for v0.1. (Pi users: it
  should work; reports welcome.)

> **Running HA Container or HA Core?** v0.1 doesn't ship for those (no
> Supervisor = no add-on store). Docker support is on the roadmap —
> [open an issue](https://github.com/alfiedennen/broadsheet/issues) if
> that's you. Volume of requests will tell us when to prioritise it.

### Install in two minutes

1. Add the add-on repository to your HA add-on store:

   [![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Falfiedennen%2Fbroadsheet-addon)

2. In **Settings → Add-ons → Add-on Store**, find **broadsheet**, click
   **Install**.
3. Click **Start**, then **Open Web UI**.

That's it. The add-on auto-authenticates against your HA via the
Supervisor token — no long-lived token to paste, no `.env` to fill in.
broadsheet appears in your HA sidebar and stays there.

By default broadsheet can control your house (lights, climate, etc.) —
you installed it as your dashboard, so that's the sane default. Set the
add-on's `read_only` option to `true` to make it a read-only viewer.
(`lock.*` writes are hard-banned regardless.)

For building from source, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## What you get

Eight surfaces, each shaped for what it's actually for — not a uniform
grid of tiles. Every page **discovers what's relevant from your HA at
boot**: a new room added in HA tonight is on the right pages tomorrow,
no editing.

| Page | Renders | Discovers from |
|---|---|---|
| **`/`** the moment | Live painting (or ambient gradient) of who's home + a single-line manifest of the day | `person.*` + a presence sensor of your choosing per person |
| **`/lights`** | Prose state ("library and office are on"), scene chips, per-area reveal with sliders + per-bulb sub-reveal | Areas with any `light.*` or lighting `switch.*` |
| **`/heat`** | Three macros (Boost / All warm / All frost), per-room TRV reveal with ±0.5° nudges | Areas with any `climate.*` |
| **`/door`** | Lock-state hero + one Unlock action, paired camera image below | `lock.*` + nearby door-contact `binary_sensor.*` + `camera.*` / `image.*` |
| **`/tv`** | Remote + a launch button per app the TV exposes (`source_list`). With the tmdb-tv plugin: Trending / New content rows | `media_player.*` with TV device class + `remote.*` |
| **`/body`** | Health-data panels with honest sub-labels ("once daily" / "measured during sleep") so empty panels explain themselves | Health Connect `sensor.*` pattern matching (Pixel) — Apple Health bridge planned |
| **`/wall`** | A deliberately dense action grid for a hallway tablet — same app, surface-specific landing | Areas with anything actionable |
| **`/settings`** | In-app curation: House, People, Voice, Plugins, **Integrations, Add-ons, Devices, Logs** — broadsheet-native UIs over HA's WS APIs, written in the editorial register | — |

### One frontend, not two

On install broadsheet **takes over the HA frontend** — the HA sidebar
collapses, the broadsheet ingress becomes your landing surface, and
the eight to ten settings broadsheet renders natively (People / Areas
/ Entities / Voice / Plugins / Integrations / Add-ons / Devices /
Logs) read like prose, not a config tree. A single "Open HA settings"
affordance in the kebab nav drops you into HA's own UI for the
unusual flows (initial integration setup wizards, debug snapshots,
advanced YAML). HA stays whole; broadsheet just stops being a peer
frontend you have to remember to visit.

Roll back: the addon's `sidebar_takeover` option is on by default but
flip it to `false` to keep HA's sidebar in place and run broadsheet
as a peer frontend instead.

### Voice — Harold, or your own

A built-in voice substrate (`@broadsheet/voice` plugin) wires a
WebSocket-streamed STT + LLM + TTS pipeline through HA's existing
conversation framework. Discovers your installed HA conversation
agents (HA-native intent matcher, Whisper, OpenAI Conversation,
Anthropic, etc) and your TTS providers (HA Cloud, Piper, ElevenLabs,
OpenAI). HA-native intent matching gets first attempt on every
utterance (lights, scenes, climate — sub-200ms response, zero LLM
spend); only unmatched intents fall through to your LLM of choice.

Ships with **Harold** as the opinionated preset
(`@broadsheet/harold-preset`) — Hitchcock-register British baritone,
Claude Haiku for the conversational layer, ElevenLabs Flash v2.5 for
TTS, the "Hey Harold" custom wake-word model + Atom Echo satellite
configuration, the meeting-mode hard-mute, the
Italian-when-spoken-Italian detection, the garbled-input filter, and
the conversational memory layer. Tap to install on first launch, or
ignore it and pair voice with whatever LLM/TTS you already pay for.

If your HA install has things broadsheet doesn't know how to render
(custom integrations, exotic device classes), they show up in an
**Unsorted** section with a one-click "hide / pin / categorise"
affordance. Out-of-the-box render coverage is the goal; manual curation
is the escape hatch.

### Plugins

broadsheet ships with three first-class plugins **in the box, off by
default**. Enable them in **Settings → Plugins** — each one says its
status honestly (active / enabled-but-checks-not-met / why it can't
load):

- **`@broadsheet/emanations`** — multi-person presence painting on `/`
  and a dedicated `/emanations` page. Procedural by default; uses your
  own room paintings when you provide them.
- **`@broadsheet/ghost-cloud`** — *The Long Take.* 24-hour radar event
  playback per room as a translucent water-membrane time-tube. Ships
  with demo data; for the advanced user with mmWave radar.
- **`@broadsheet/tmdb-tv`** — *Trending* and *New* content rows on
  `/tv`, from TMDB. Needs a free TMDB API key (entered in the plugin's
  settings panel).

The plugin contract is documented in
[`docs/RENDERER-CONTRACT.md`](docs/RENDERER-CONTRACT.md).

---

## Why this exists

The Home Assistant frontend ecosystem is rich. Mushroom, Bubble Card,
Tile, the Lovelace strategy generators — there's a mature, well-loved
set of options for laying out tiles, sliders, and status chips, and
most of them are excellent at what they do.

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

When you want it more your-shape, **Settings** in the kebab nav opens an
in-app curation layer — no YAML:

- **House** — every area + entity broadsheet found, with rename / hide /
  move-to-area. Place a device in a room and its entities follow.
- **People** — broadsheet finds your `person.*` entities; for each, pick
  the presence sensor you actually trust. (A warning is surfaced for the
  iOS Companion-App GPS-suspension case that bites Pixel/iPhone mixed
  households.)
- **Voice** — the editorial strings. Default copy ships in English; you
  override per section.
- **Plugins** — enable / disable the first-class plugins, see each one's
  live status, open its config panel.
- **Pages** — author custom pages from your own things (since 0.9.1).
  See below.

Curation is persisted to the add-on's data volume as `broadsheet.json`
(and so rides HA's snapshot/backup system). You can edit that file
directly if you prefer files to UIs — the Settings panel is a thin
wrapper over it.

### Custom pages + the wall builder (0.9.x)

Beyond the eight core pages, broadsheet ships with a **things-first
custom page editor**. You browse the controllable things in your house
(grouped by room, then by Lights / TV / Heating / Locks / …) and tap
or drag them onto a canvas. broadsheet picks the right widget for the
entity's domain automatically — a light becomes a toggle, a scene
becomes a fire-tile, a TV becomes a full remote.

Composed recipes do more in one tap: *"Living Room lights — panel"*
drops a single block that renders every light in the area inline +
grows as you add more lights in HA. *"Living Room media — panel"*
drops the TV remote + speakers together. *"All Living Room lights —
off"* drops a one-tap macro across N lights.

Plugins can contribute their own blocks to the browser. When
`@broadsheet/tmdb-tv` is enabled, every TV-having area gets an extra
recipe — *"<area> TV — TMDB show & movie rows"* — so the browse-and-
play poster grid lands on YOUR wall page right next to the remote.

For wall-mounted tablets, the page editor includes a **Wall device**
preset picker (Fire HD 10, Galaxy Tab A9, iPad, Pixel Tablet, etc.)
+ a Kiosk URL + Fully Kiosk Browser hints. The preview pane renders
at the device's native dimensions, scaled to fit your editor screen.

- **[`docs/WALL-BUILDER-GUIDE.md`](docs/WALL-BUILDER-GUIDE.md)** —
  step-by-step "build your first kiosk surface in 5 minutes".
- **[`docs/CUSTOM-PAGES-GUIDE.md`](docs/CUSTOM-PAGES-GUIDE.md)** —
  full reference for the things-first editor + every block type.
- **[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)** — the
  operational gotchas.
- **[`docs/IMPORTER-GUIDE.md`](docs/IMPORTER-GUIDE.md)** — bringing
  an existing Lovelace dashboard across.

---

## Architecture

For people who care:

- **SvelteKit 2 + Svelte 5 runes**, `adapter-static` — pure-static
  build, no server runtime.
- **Single persistent WebSocket** per device, owned by the layout.
  Auto-reconnect with exponential backoff. Application-level heartbeat
  (30s ping / 10s pong-timeout / force-close on zombie) — survives HA
  restarts cleanly.
- **Three discovery layers** — HA's registries (Layer 1) → a domain
  model (Layer 2) → your curation overrides (Layer 3). See
  [`docs/DISCOVERY-CONTRACT.md`](docs/DISCOVERY-CONTRACT.md).
- **A frozen plugin contract** — plugins register pages, renderers,
  settings panels, and discovery contributors. The three first-class
  plugins are bundled + lazy-chunked; a disabled plugin's code is in
  the image but never fetched. See
  [`docs/RENDERER-CONTRACT.md`](docs/RENDERER-CONTRACT.md).
- **Same-origin reverse proxy** — the add-on's nginx fronts the static
  SPA and proxies `/api/*` to HA's Core API with the Supervisor token
  injected, so the SPA never handles a credential.
- **Safety rails** — every service call passes a read-only / audit-log
  envelope; `lock.*` writes are hard-banned regardless of settings.

Everything else lives in the
[architecture deep-dive](docs/ARCHITECTURE.md).

---

## Status

**v0.1 — in production-canary, ship target ~3 weeks (2026-06-06).**
Running daily against the author's real HA across three surfaces
(phone, desktop, wall tablet). Scope expanded 2026-05-16 after the
V2 fresh-user dogfood surfaced two product-shaped omissions — the
"frontend takeover" and "voice + Harold" stories below. Both land
before ship.

What's done:
- The eight core surfaces (`/`, `/lights`, `/heat`, `/door`, `/tv`,
  `/body`, `/wall`, `/settings`).
- Discovery + the in-app curation layer (House / People / Voice /
  Plugins).
- The HA add-on packaging — auto-credential flow, ingress, the
  broadsheet HA theme.
- The plugin system + all three first-class plugins
  (emanations / ghost-cloud / tmdb-tv).
- Lovelace importer (27 translators, 98% real-world coverage).
- Full markdown renderer (CommonMark + GFM via marked + DOMPurify).

What's in flight (v0.1.0 ship blockers):
- **Frontend takeover** — broadsheet collapses HA's sidebar on
  install + becomes the landing surface, with broadsheet-native
  UIs for the 6-8 most-touched HA settings (People / Areas /
  Entities / Integrations / Add-ons / Devices / Logs / Voice). See
  `docs/plans/plan-sidebar-takeover.md` + `docs/plans/plan-ha-settings-native-uis.md`.
- **Voice substrate** — `@broadsheet/voice` plugin discovering HA's
  installed conversation agents + TTS providers; HA-native intent
  matcher first, LLM fall-through. See
  `docs/plans/plan-voice-substrate.md`.
- **Harold preset** — `@broadsheet/harold-preset` one-tap install
  of Hitchcock register + Claude Haiku + ElevenLabs Flash v2.5 +
  the "Hey Harold" wakeword + meeting-mode + Italian detection +
  conversational memory. See `docs/plans/plan-harold-preset.md`.

What's still raw:
- `aarch64` is built but not yet hardware-verified (see Requirements).
- Theming — one editorial register ships; multiple registers planned.
- The plugins' deeper modes — emanations' painting-set authoring,
  ghost-cloud's live-radar pull (v0.1 ships demo data) — are follow-ons.

What needs help:
- Translations beyond English.
- Apple Health bridge for `/body` (Pixel / Health Connect only today).
- ARM hardware testing.
- Local-only voice testing (Ollama + Piper combinations) — the
  voice plugin is designed to support this, real-world coverage is
  the open question.

---

## Contributing

Issues, PRs, and screenshots of your install are very welcome. The
codebase is small and well-documented — see [CONTRIBUTING.md](CONTRIBUTING.md)
for the dev setup, the workspace layout, and the doc reading order.
`pnpm dev` produces a working local instance against your own HA in
under five minutes.

MIT licensed — see [LICENSE](LICENSE). Use broadsheet's editorial
language in something you ship if you like; fork and rebrand wholesale
if you like.

---

## Acknowledgments

The four-font studio register and editorial paradigm were originally
built for a single private house, alongside the public studio project
at [haroldathome.com](https://haroldathome.com). broadsheet is the
extracted, generalised version — same paradigm, none of the personal
specifics.
