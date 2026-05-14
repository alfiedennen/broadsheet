# broadsheet — the replacement vision

How broadsheet relates to Home Assistant's own UI, across v0.1 and v0.2.
Written as a scoping document — it constrains what "done" means, it is
not marketing.

> **Status (2026-05-14)**: v0.1 ships the *theme* half (restyle HA's
> chrome to broadsheet's register). The *structural* half — broadsheet
> as the shell, HA's chrome never seen — is committed to v0.2. This
> doc exists because M5 verification surfaced that the
> broadsheet↔HA-shell relationship had been decided as a *distribution
> slot* (`PREMORTEM-DIFF.md` point 4) but never as a *user experience*.
>
> **Refined (2026-05-14, evening)**: the v0.2 section now carries the
> governing *brittleness firewall* rule, the three-tier surface model,
> and a new *Extensibility* section (the custom-pages builder, the
> Lovelace importer + its v0.9 coverage gate, and why hosting
> third-party custom cards is ruled out). See `BUILD-LOG.md` 2026-05-14
> (evening) for the design conversation behind it.

---

## The user story

> As a user who wants to completely replace Home Assistant with a
> modern, refined web interface, I want all of the control and
> flexibility HA core gives me **without ever experiencing its
> chrome** — so that my experience is truly that of a *replacement*,
> not a skin over the top.

The load-bearing word is **replacement**. It is a higher bar than "a
nice dashboard":

- A *dashboard* is a view. It is fine for it to live inside HA's
  sidebar + header. The user knows they're "in Home Assistant."
- A *replacement* owns the whole surface. The user is "in broadsheet."
  HA core is still doing all the work — discovery, state, service
  calls, automations, the integration runtime — but the user never
  has to look at HA's UI to get at any of it.

broadsheet's editorial register (pages-not-screens, prose-not-specs,
the four-font system) is undermined the moment the user is reminded
they're inside someone else's app frame. The chrome is not cosmetic —
it is the difference between the two bars above.

---

## The tension this creates with v0.1's distribution slot

`PREMORTEM-DIFF.md` point 4 committed broadsheet to the **sidebar
panel + Ingress** slot, deliberately, for a good defensive reason: HA
was aggressively claiming the "home dashboard" slot through 2026.1–
2026.3, including overwriting user configs. "Sit alongside, don't
replace" was the safe call for v0.1.

But the *consequence* of that slot was never examined: an Ingress
panel renders broadsheet **inside an iframe, inside HA's panel
chrome.** HA's sidebar stays on the left, HA's header stays on top.
broadsheet is permanently boxed. broadsheet cannot reach out of its
own iframe to hide HA's chrome — that is HA frontend DOM it does not
own.

So the v0.1 slot and the replacement vision are in genuine tension.
v0.1 does not resolve it. v0.1 *mitigates* it (theme) and v0.2
*resolves* it (structure).

---

## v0.1 — mitigate: wear the same clothes everywhere

**Acceptance**: broadsheet ships a Home Assistant **theme** that
restyles HA's own chrome — sidebar, header, and the native config
pages broadsheet does not (and should not) rebuild: the automation
editor, integrations, add-on store, developer tools — into
broadsheet's editorial register.

The user is still technically "in HA's frame" when they drop into,
say, the automation editor. But it does not *feel* like a context
switch, because HA is wearing broadsheet's clothes. The seams are
still there; they're just not jarring.

### This is a solved problem

Harold Road already did exactly this — `homeassistant/config/themes/
harold-road.yaml`, the four-font editorial register applied across the
entire HA frontend, plus `studio-fonts.js` wired in via
`frontend.extra_module_url`. v0.1's job is to *generalise* that recipe
and ship it with the add-on, not to invent it.

### Delivery mechanism

An add-on does not auto-install an HA theme. The least-invasive option
that still respects PREMORTEM point 4's "don't mess with the user's
HA" spirit:

- The add-on drops `broadsheet.yaml` into `/config/themes/` on **first
  boot only** — never overwrites an existing file — via a
  `homeassistant_config:rw` map entry in `config.yaml`.
- `DOCS.md` instructs: *Settings → Profile → Theme → broadsheet*.
- broadsheet **offers** the theme; the user **opts in**; the action is
  one click and fully reversible (switch the theme back).

This keeps the add-on non-destructive. It writes one new file into a
directory whose entire purpose is holding theme files, and it touches
nothing the user already had.

### What v0.1 explicitly does NOT do

- It does not hide HA's sidebar or header. The chrome is still there;
  it is just consistent.
- It does not change which slot broadsheet occupies. Still an Ingress
  panel.
- It is not "kiosk mode." kiosk-mode (the HACS plugin) hides HA chrome
  but only on *Lovelace dashboards*, not Ingress-panel iframes — it
  does not apply here.

---

## v0.2 — resolve: invert the iframe relationship

The structural fix is to **flip which side owns the chrome.**

| | Who is the shell | Who is embedded | HA chrome |
|---|---|---|---|
| **v0.1** | Home Assistant | broadsheet (Ingress iframe) | always visible, around broadsheet |
| **v0.2** | **broadsheet** | HA's deep-config pages (iframed *into* broadsheet, themed) | never visible — broadsheet's chrome is the only chrome |

In v0.2, broadsheet is the outer shell. It owns the sidebar, the
header, the navigation. HA core still runs everything underneath —
broadsheet talks to it over the same WebSocket + REST it always has.
But the HA *frontend* is no longer the surface the user lives in.

The pages broadsheet does not rebuild — and should not, because
faithfully re-implementing HA's automation editor or integrations flow
is a fool's errand — get **embedded inside broadsheet's shell**, in an
iframe, wearing broadsheet's theme (the v0.1 theme work pays off
again here). The user needing HA's automation editor does not get
ejected back into HA's UI; the editor opens *within* broadsheet.

That is the literal definition of the user story: **all of HA's
control, none of HA's chrome.**

### The governing rule — the brittleness firewall

There is one rule that keeps v0.2 from *being* the brittle overlay this
whole doc exists to avoid:

> broadsheet only ever consumes the stable contract — the WS/REST API,
> the theme system, Ingress. It never reaches into HA's rendered DOM.

The WS API (states, services, registries, config, logbook, history,
energy) is versioned and stable. HA's frontend DOM — Lit components,
shadow DOM, panel internals — is not. Anything buildable on the API
gets a native broadsheet surface; anything that can't becomes a
**doorway** — a broadsheet-register index page that frames the handoff
(navigating the parent HA frame in panel mode, a link/tab when
standalone), never a wrap. A doorway is an honest seam, stable across
HA releases because it is just navigation.

### The three-tier surface model

"The pages broadsheet does not rebuild" is not one bucket — it is two,
and the split is *how stable the surface is, and whether it is read or
write*:

| Tier | What | How |
|---|---|---|
| **Native surfaces** | the 8 editorial pages | fully owned, read+write over the WS API |
| **Natively-rendered data** | logbook, history, energy, the device/entity/area registries, system health, backup list | broadsheet renders them in-register — not "recreating the wheel", just rendering the same stable API data it already consumes |
| **Doorways to editors** | the automation/script editor, integration config-flow wizards, the add-on store, Z2M/ZHA panels | broadsheet does *not* restyle these — their information architecture is the opposite of editorial. A broadsheet-register index page lists them; the edit action hands off to HA's own editor, themed but not wrapped |

Styling carries chrome + data. It cannot carry the genuine editors —
for those the choice is rebuild (a fool's errand, rejected) or doorway.
Dogfooding the 8 surfaces is what ranks the middle tier: which nooks
are actually reached for.

### Delivery surface

This is the **standalone / PWA path** already pencilled for v0.2
(`BUILD-PLAN.md`, `PREMORTEM-DIFF.md` — deferred "gated on demand
signal"). This doc gives that path a *product reason* beyond "Docker
users asked for it": the PWA/standalone build is not just an
alternative install method, it is *the surface on which broadsheet
becomes a replacement rather than a panel.*

When broadsheet is its own installed app pointed at HA, there is no HA
chrome to escape — broadsheet is the whole window from the first
paint.

### Retrievability

The user story says "all the control and flexibility" — which means
broadsheet must never trap the user. In v0.2:

- HA's deep-config pages are reachable *from within broadsheet* (the
  embedded-iframe pattern above), so nothing in HA is lost.
- A deliberate "open Home Assistant" escape hatch — a settings-menu
  item, not a prominent button — lets a user who *wants* raw HA get
  to it. Retrievable, but not in the way.

The principle mirrors the discovery system's "honest escape hatch"
(`ARCHITECTURE.md`): broadsheet is opinionated by default, but never
removes the user's ability to reach the underlying truth.

### Open design questions for v0.2 (not decided here)

- **Auth across the embed boundary.** broadsheet's shell authenticates
  to HA; the embedded HA config pages need their own session. LLAT vs
  OAuth vs a shared-session trick — to be worked out when v0.2 starts.
- **Which HA pages embed cleanly.** Some HA frontend routes assume
  they own the full viewport. An audit is needed of which config
  pages iframe gracefully and which need a full-window handoff.
- **The Strategies API channel** (`PREMORTEM-DIFF.md` point 5, HA
  2026.5+) may offer a cleaner embed for *some* surfaces than raw
  iframing. Evaluate when v0.2 scoping begins.

---

## Extensibility — user content in the broadsheet paradigm

The replacement vision includes a second user story: *users can add
whatever they want, and it is styled and accessible in the broadsheet
paradigm.* That resolves into three distinct mechanisms — not two:

1. **Custom-pages builder** — the user pins their own entities/areas
   into named pages that render in-register automatically. The curation
   model (Layer 3) generalised from "override the discovered pages" to
   "author new ones." Confirmed for v0.2; lands early, because the
   importer below needs it as a destination.
2. **Lovelace importer** — an on-ramp, not a separate channel: it
   parses an existing Lovelace view, maps each *built-in* card type to
   a broadsheet-register rendering, and emits a custom page that lands
   in (1). What doesn't map is dropped with an honest "N cards couldn't
   be imported" notice — the same honesty pattern `/settings` uses for
   ungrouped entities. A one-time import, not a live link: once
   imported, broadsheet curation is the source of truth.
3. **Plugin contract** — the supported path for anything needing custom
   code. A **rewrite** contract, not a wrap contract, by design
   (`RENDERER-CONTRACT.md`).

**Ruled out: hosting third-party custom cards** (the compiled JS web
components distributed via HACS). There is no transpile path from a
compiled web component to a broadsheet-register Svelte component, and
*running* one means impersonating HA's `hass` frontend contract — which
is the brittle overlay back through the side door: it breaks on every
HA frontend release and renders in the card's own style, not
broadsheet's. The plugin contract — a deliberate rewrite — is the
answer for bespoke rendering. There is no auto-conversion, and that is
correct.

### The v0.9 importer gate

The Lovelace importer carries a measurable acceptance criterion for the
**v0.9 production milestone**: *~80% of cards-in-the-wild render
in-register, frequency-weighted.* Measured by running the importer over
a corpus of real Lovelace configs (Harold Road's own, harold-home's old
dashboards, community examples) and counting covered vs dropped cards,
weighted by how often each card type appears in the corpus. The metric
is deliberately "render in register" — not "card types covered", not
"whole dashboards import clean" — because that is the one that reflects
actual user experience. Frequency-weighting also ranks *which* built-in
card types to map first.

v0.9 is read as the feature-complete pre-1.0 production milestone; the
importer gate is one of its acceptance criteria, not the only one.
v0.2–v0.8 are the incremental build-up.

---

## Summary

| Need | v0.1 | v0.2 |
|---|---|---|
| HA chrome is consistent with broadsheet | ✅ theme | ✅ (theme still applies to embedded pages) |
| HA chrome is never seen | ❌ | ✅ broadsheet is the shell |
| All HA control reachable | ✅ (via HA's own chrome) | ✅ (embedded in broadsheet) |
| User content rendered in-register | ❌ | ✅ builder + importer (~80%-coverage gate at v0.9) |
| True "replacement" experience | partial | ✅ |

v0.1 is honest about being a panel that makes HA tolerable to pass
through. v0.2 is the replacement. Shipping v0.1 without this doc would
have left the replacement vision as an unexamined assumption; shipping
it *with* this doc means v0.1's theme work is explicitly the first
half of a two-part plan, not a cosmetic afterthought.

---

*Cross-references: `PREMORTEM-DIFF.md` point 4 (distribution slot
decision), `BUILD-PLAN.md` (v0.1 scope lists), `ARCHITECTURE.md`
(honest escape hatch principle), `RENDERER-CONTRACT.md` (the plugin
rewrite contract), `BUILD-LOG.md` 2026-05-14 evening (the design
conversation the v0.2 refinements came from).*
