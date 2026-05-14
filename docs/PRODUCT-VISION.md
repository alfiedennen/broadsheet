# broadsheet — product vision

The north star. Everything in `BUILD-PLAN.md`, `ARCHITECTURE.md`, and
`REPLACEMENT-VISION.md` serves this. When a scope question is
genuinely ambiguous, it's answered here.

---

## The thesis

**broadsheet makes Home Assistant disappear.**

Not "a nicer dashboard for HA" — a *replacement*. HA Core keeps doing
everything it does (discovery, state, the integration runtime, service
calls, automations). But the user never has to look at HA's UI to
reach any of it. broadsheet is the surface; HA is the engine.

Three commitments fall out of that:

1. **All of HA's capability stays reachable.** Replacement, not
   reduction. If HA can do it, broadsheet can get you to it.

2. **The dashboard paradigm is gone.** No grid of cards you assemble.
   Instead: a **navigable space defined by you** — rooms, people,
   moments — that you move through, not configure.

3. **Meaningless entity nodes never surface unless you need them.**
   A real HA install is ~2,000 entities, most of them per-device
   plumbing. broadsheet's job is to make that noise *invisible by
   default* and *reachable on demand* — never a tax the user pays to
   get to what matters. (See `ARCHITECTURE.md` Layer 1→2→3 and the
   `/settings/house` curation surface.)

---

## Core modules — *the product*

These ship in the box, on by default where it makes sense, and they
*are* broadsheet. They're the things common to most smart homes:

- **Who is where** — presence, rendered as a living thing. Where each
  person is, brought to life with imagery, not a list of
  `device_tracker` states.
- **Living-room mode** — lights + TV control in one place, alongside
  *what's worth watching* — region-aware content via TMDB.
- **Mature, reliable presence** — IRK-BLE trilateration plus any
  combination of sensors (FP300 mmWave/PIR, etc.), *easily
  configurable* to the user's actual home. Presence that works is a
  product feature, not a research project the user has to run.
- **Out-of-the-box-yet-customisable views** — sensible defaults for
  tablets and phones that the user can then shape.
- **The navigable space itself** — room/people/moment navigation,
  the curation model (place a thing in a room → its entities follow),
  the editorial register.

If a household uses broadsheet, these are what they use. Building the
core *well* is the whole job.

---

## Opt-in modules — *ship with, off by default*

These ship *with* broadsheet (in the box, discoverable) but stay
**off** until the user opts in. Clean separation — they're packaged
plugins, not core surfaces:

- **emanations** — multi-person ambient imagery / paintings driven by
  the presence mesh.
- **The Long Take** — mmWave-radar event playback. For the advanced
  user with the hardware.
- **Body** — health data (Health Connect / Pixel; Apple Health later).

The line: **core is what most homes want; opt-in is what some homes
want.** Opt-in modules can be as deep and advanced as they like
*because* they're opt-in — they never complicate the default product.

---

## What this means for "parity" and for M7

When this work started, "configuration parity with harold-home" was
framed as hand-tuning a personal `broadsheet.json`. **That framing was
wrong.** The right framing:

> The core modules *are* what the maintainer's household uses.
> Building the core properly **is** personal parity — and it's a
> shippable product, not a config file.

So:

- **"Parity" → "core completeness."** The punch-list isn't "curate
  Alfie's JSON" — it's "make who-is-where, living-room, presence-config
  and the tablet/phone views actually good."
- **harold-home's house-specific pages** (`/long-take`, `/emanations`,
  `/living-room`, `/gallery`) are not parity gaps — `/long-take` and
  `/emanations` are *opt-in modules*; `/living-room` is *living-room
  mode* (core); `/gallery` is a candidate to fold into core or drop.
- **harold-home's `house.json`** stops being a thing to port. It was
  an allowlist hand-built for one house. broadsheet replaces the
  *need* for it: discovery + a curation model good enough that the
  noise disappears without an allowlist.
- **M7 (public release prep)** ships *core*. Opt-in modules can lag —
  they're additive and don't gate the release.

---

## The test

A household installs the add-on. With no config file and minimal
fiddling:

- they see **who is where**, and it's alive, not a list;
- **living-room mode** gives them lights + TV + something worth
  watching tonight;
- their **tablets and phones** have views that already make sense;
- the **2,000 entities of noise are simply not there** — but anything
  they go looking for, they can find;
- and at no point do they think *"this is Home Assistant."*

When that's true, broadsheet is the product.

---

*Cross-references: `BUILD-PLAN.md` (scope), `ARCHITECTURE.md` (the
three layers), `REPLACEMENT-VISION.md` (the specific "HA chrome
disappears" facet — v0.1 themes it, v0.2 inverts the iframe).*
