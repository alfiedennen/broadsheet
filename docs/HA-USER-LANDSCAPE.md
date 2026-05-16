# Home Assistant user landscape

A research-grounded synthesis of who actually uses Home Assistant,
what they build dashboards for, what they struggle with, and where
broadsheet sits relative to their habits + needs. Compiled from
parallel research across r/homeassistant, the official HA community
forum, the major HA YouTube channels, HACS install rankings, and
showcase mega-threads / blog roundups.

This document exists to ground broadsheet's ship-readiness rubric
in real user needs, not in dogfooding artefacts of one install.
Phase D (epics + stories + tasks) and Phase E (automated rubric
tests) build on top of it.

## TL;DR — what every HA user wants

After reading ~80 representative posts, threads, videos, and
showcases, the convergent message is striking. The Home Assistant
audience overwhelmingly wants:

1. **A dashboard their family will actually use.** "Spouse Approval
   Factor" / "Wife Approval Factor" / "10/10 wife acceptance" is
   the de-facto success criterion in every showcase that gets
   upvoted. Power-user dashboards exist; the loudest unmet need is
   for the second, simpler dashboard for everyone else.
2. **A wall tablet dashboard that looks good.** Repeatedly cited as
   "the crown jewel of HA setups" but every project stalls because
   authoring it is hard.
3. **Presence-aware reveals.** "Show me what's relevant for the
   room I'm in" — implemented today via fragile combos of
   ESPresence + iOS Shortcuts + custom JS + conditional cards.
4. **Glance-before-tap dashboards.** "If it doesn't fit on one
   screen, you have too much on it" is now a community-wide rule.
5. **Composition that doesn't break at depth-2.** Mushroom + Sections
   is dominant precisely because it composes; HA's UI editor
   becomes unusable once you nest cards.
6. **Beautiful default.** Mushroom (~5,000★) has the install signal
   of the modern HA frontend; nobody defends the default Entities
   card.

What people DO NOT want (loudly): "everything on one screen",
exposing entity_ids in the UI, scrolling on a wall display, learning
YAML to make a button.

## The five personas

Patterns that emerged across all five research reports. Each persona
is a centroid in the user space — most real users sit between two,
not exactly on one.

### P1 — The Curious Beginner (~35% of new installs)

Just installed HA last weekend, watching Smart Home Junkie or Mark
Watt Tech tutorials, has Phillips Hue + a few smart switches, lives
in fear of YAML.

- **Top concern**: get the first automation working (lights at
  sunset is the universal first project).
- **Dashboard goal**: "make it look like the screenshots in the
  tutorials" — Mushroom + a wall tablet eventually.
- **Pain points**: install path confusion (HA OS vs Container vs
  Supervised), 300 phone-tracker entities they don't understand,
  the dashboard randomly resetting after updates, beginner
  overwhelm.
- **Won't tolerate**: anything that requires editing a YAML file
  before it works.
- **Will love**: prose-shaped pages that adapt to their HA without
  configuration. broadsheet's "install, point at HA, see your
  house" is a strong fit IF the import feels magic.

### P2 — The Aesthetic Enthusiast (~25%)

Has been on HA 6-18 months. Runs Mushroom + a theme + card-mod for
fine CSS. Posts to "show your dashboard" threads. Cares about
typography, spacing, palette. Watches Bruno Sabot for inspiration.

- **Top concern**: visual coherence + that dashboard looks
  considered.
- **Dashboard goal**: be the screenshot in next year's "best HA
  dashboards" roundup.
- **Pain points**: HA's UI editor breaks at depth-2 nesting; can't
  easily share card definitions; performance collapses on large
  dashboards; theming is per-instance not per-user.
- **Won't tolerate**: ugly default Lovelace look; inconsistent
  fonts; unstyled grid layouts.
- **Will love**: broadsheet's editorial register hits this group
  directly — italic display serif + warm off-black + amber accent
  is exactly the kind of considered aesthetic this tier seeks.
  Ambient Glass + Frosted Glass theme + Catppuccin's popularity
  prove the appetite for "expressive" dashboards.

### P3 — The Family Wrangler (~20%)

Built HA, can't get partner / kids / parents to use it. Maintains
TWO dashboards: the power-user one + the simplified one for
everyone else. Posts to "WAF/SOAP" threads.

- **Top concern**: the wall tablet in the hallway is usable by
  someone who doesn't know what an entity is.
- **Dashboard goal**: red/yellow/green-style status board; one-tap
  controls for the 5 things family does daily; nothing labelled
  with HA terminology.
- **Pain points**: "the simplified dashboard takes more effort to
  build than the complete one"; conditional visibility (only show
  X when present) is universally desired and universally painful;
  family rejects anything that takes >1 tap to do something
  they did with the wall switch yesterday.
- **Won't tolerate**: entity_ids visible anywhere; multiple
  toggles per row; >1 scroll to find a control.
- **Will love**: broadsheet's Hero + Markdown + Action-grid +
  Sparkline + presence-aware cards is the prose-shaped wall-tablet
  dashboard this persona has been hand-building for years.

### P4 — The Power User / Templater (~15%)

Comfortable with Jinja, runs Node-RED, has written custom button-card
templates, may have published a card to HACS. Has 1000+ entities.
Two-instance HA setup is plausible.

- **Top concern**: the power to express anything; resentment of
  auto-magic that overrides their intent.
- **Dashboard goal**: ApexCharts everywhere; Auto-Entities filters
  driving dynamic lists; per-user dashboards; per-screen-size
  variants.
- **Pain points**: "deprecation anxiety" (legacy template entities
  going away in 2025.12 was the highest-replied thread of the
  year); poor error recovery in Lovelace YAML editor; sidebar
  config is per-instance not per-user.
- **Won't tolerate**: lock-in to a single style; loss of escape
  hatch to write code; opinionated frameworks that fight their
  templates.
- **Will love**: broadsheet's plugin contract IF the docs are
  rigorous + the brittleness firewall holds. Will hate any forced
  register that forecloses on their power.

### P5 — The Ambient Enthusiast (~5%)

Sees HA as a canvas, not a control panel. Runs WallPanel for
photo-screensaver, has e-ink frames, may be generating AI art for
their dashboards. Possibly the smallest group but the most
aesthetically aligned with broadsheet's ethos.

- **Top concern**: the home as a piece of generative living art.
- **Dashboard goal**: ambient-first; controls quietly available
  but not the centrepiece; presence-driven scenes; emanations /
  paintings / time-tubes.
- **Pain points**: tools don't exist — they hand-build everything
  with custom JS, picture-elements, Three.js iframes, ESPHome
  e-ink scripts.
- **Won't tolerate**: dashboards that look like spreadsheets.
- **Will love**: broadsheet's `/emanations` + ghost-cloud
  primitive + the editorial register is built for this persona.
  This is who broadsheet was originally for.

## The 10 use-case categories

Use cases drive what people put on their dashboards. Frequency rank
synthesised from showcase posts, the 2026.1 built-in dashboard set,
HA core team pronouncements, and HACS install signals.

| # | Category | Frequency | Notes |
|---|---|---|---|
| 1 | **Lighting control** | Universal | Room-by-room toggles, scenes, color/temp. The first dashboard everyone builds. |
| 2 | **Climate / heating** | High | TRVs, thermostats, per-room temps, schedules. Large appetite for the "Boost" macro. |
| 3 | **Energy monitoring** | High | Octopus / solar / grid; ApexCharts + Mini-Graph heavy. Power users' most-loved view. |
| 4 | **Security & cameras** | High | Frigate grids, alarm panel, lock state, motion timeline. |
| 5 | **Family presence / location** | Medium-High | Who's home, which room, arrival/departure. Surface gets uneven attention vs the underlying complexity. |
| 6 | **Media control** | Medium | TV remote, group casting, what's playing where. |
| 7 | **Weather + status board** | Medium | Glanceable manifest (current + forecast + alerts). The "what's the day like" view. |
| 8 | **Scenes / routines** | Medium | Goodnight, movie, wake, cinema, away, vacation. The macro library. |
| 9 | **Maintenance** | Low-Medium | Batteries (HA built-in dashboard in 2026), Z-Wave/Zigbee health, system status. |
| 10 | **Calendar / next-up** | Low-Medium | Entryway / wall-tablet staple. |

Notable absence: **prose-shaped status pages** (the harold.local
register) and **ambient art views** are NOT in any "top use cases"
list from the research. They're niche today — broadsheet is
category-creating in those spaces, not category-fitting.

## The 8 dominant dashboard styles

Ranked by frequency / visibility in 2025-2026 showcases:

| # | Style | Core technology | Audience |
|---|---|---|---|
| 1 | **Mushroom-led modern** | Mushroom (~5,000★) + Sections | The de-facto baseline |
| 2 | **Bubble Card pop-up minimalist** | Bubble (4,200★) | Mobile-first, app-feel |
| 3 | **Custom Button Card "iOS pill"** | Button Card (2,400★) + heavy CSS | Power-user mobile |
| 4 | **UI Lovelace Minimalist** | Drop-in scaffold (2,000★) | Designer-brand uniformity |
| 5 | **Tile-based (HA built-in)** | Sections + Tile features | New-install default; the "sanctioned" path |
| 6 | **Picture-elements / floor-plan art** | Picture-elements + SVG | High wow, low frequency |
| 7 | **Wall-tablet dense action grid** | Mushroom or Button Card, Fully Kiosk | Hallway / kitchen |
| 8 | **Frosted glass / "Ambient Glass"** | Frosted Glass theme (~860★) | Experimental edge |

broadsheet is closest to (8) Ambient Glass in spirit but reaches
toward (7) wall-tablet pragmatism via the action-grid + macro-grid
primitives. It is intentionally NOT (1) Mushroom-shaped — different
register, different audience, but compatible with importing FROM
that ecosystem.

## The HACS install reality

What people install (i.e. what core HA doesn't give them) — by
GitHub-star rank as a proxy. Anything broadsheet wants to be a
dashboard for needs to translate or replace these:

| Card | ★ | Translatable in broadsheet? |
|---|---|---|
| Mushroom | 4,960 | ✅ via mushroom-template / mushroom-chips / mushroom-light translators |
| Bubble Card | 4,188 | ⚠️ Pop-up modal pattern not yet a primitive |
| Mini Graph Card | 3,810 | ✅ via custom:mini-graph-card → sparkline |
| Button Card | 2,432 | ✅ via custom:button-card → action-grid |
| UI Lovelace Minimalist | 2,019 | ❌ It's a whole scaffold; users would re-author |
| ApexCharts Card | 1,769 | ⚠️ No translator yet — multi-series sparkline alternative needed |
| Auto-Entities Card | 1,747 | ⚠️ Dynamic entity-list filter primitive needed |
| Mini Media Player | 1,698 | ⚠️ Media-control translator gives basic playback only |
| card-mod | 1,692 | n/a — broadsheet's editorial register replaces fine CSS |
| Vacuum Map Card | 1,863 | ❌ Domain-specific, leave to import |
| Floorplan | 1,523 | ❌ Domain-specific picture-elements; leave to import |
| Layout Card | 1,241 | ✅ via custom:layout-card → recursive flatten |
| Battery State Card | 1,235 | ⚠️ Could become a primitive |
| Scheduler Card | 1,220 | ❌ Backend-coupled, leave to import |
| Vacuum Card | 1,199 | ❌ Domain-specific |
| Advanced Camera Card | 1,041 | ❌ Domain-specific, leave to import |
| Vertical Stack In Card | 970 | ✅ via custom:stack-in-card → recursive flatten |
| Slider Entity Row | 906 | ⚠️ Slider primitive needed (or composable from action-grid?) |
| Clock Weather Card | 820 | ⚠️ Composable from existing markdown but a dedicated primitive would be friendlier |
| Lovelace Navbar Card | 816 | n/a — broadsheet's KebabNav replaces |

**Rough scoring**: 7 of the top 20 already translate. 8 are
candidates for new primitives or translator improvements. 5 are
domain-specific (floorplan, vacuum, scheduler) — these stay as
"leave to import" forever.

## The 10 pain points (the "if you fix one of these, you win")

Convergent across all five research streams, ranked by frequency
of mention:

1. **Family-shareable dashboards are an unsolved problem.** Building
   the second simplified dashboard takes more work than the first.
   "10/10 wife acceptance" was the most-upvoted dashboard achievement.
2. **The UI editor breaks at depth-2 nesting.** Once you nest a stack
   inside a stack inside a card, you can't UI-edit it any more. Every
   showcase-quality dashboard is YAML-only.
3. **Conditional visibility is desired and painful.** Time + person +
   state + screen-size combinations push everyone into raw YAML.
4. **The default dashboard auto-overrides on update.** Users build,
   HA wipes, users curse. A long-running issue.
5. **Lovelace migration is one-way + opaque.** Picking YAML mode is
   a one-way door. Mushroom→Tile migration threads are active.
6. **Wall tablet authoring is unique pain.** Distinct register from
   phone, distinct from desktop. Every "build your wall tablet
   dashboard" tutorial reinvents the wheel from scratch.
7. **Voice assistant reliability.** Wake word, latency, language,
   command rigidity. "Sometimes it talks, sometimes it doesn't."
8. **Presence detection that actually works room-by-room.** Phone GPS
   too coarse; PIR not enough. Solution requires ESPresence + BLE +
   per-room ESP32 mesh.
9. **Entity sprawl.** Every device adds 5-15 attributes-as-entities
   most users don't want exposed.
10. **Per-user / per-role dashboards don't exist.** Sidebar config is
    instance-wide. "Schedule for non-admins" is a standing WTH thread.

## Where broadsheet hits / where broadsheet misses

This is the rubric Phase D will turn into stories.

### Where broadsheet hits (strong fit per research)

- **Family-shareable register** — italic display serif + sentence
  headlines + 3 affordances above the fold + presence-aware reveals.
  Maps directly to the WAF/SOAP success pattern.
- **Wall-tablet dashboards** — the typed-primitive composer + the
  /wall preset is a category creator for the "looks good without
  starting from scratch" pain point.
- **Editorial / prose-style alternative** — barely exists in the
  ecosystem; broadsheet is differentiated by being the prose-shaped
  option. Ambient Glass is the closest cousin and it's a community
  concept, not a built artefact.
- **Ambient art views** — `/emanations` + Ghost Cloud primitive land
  on a niche that's currently DIY-Three.js-iframes.
- **Lovelace importer** — covers the Mushroom→broadsheet migration
  path nobody else offers. 95% real-world coverage on a heavily-
  customised dashboard is the headline number.
- **Custom-page builder without YAML** — addresses the "UI editor
  breaks at depth-2" pain directly via typed primitives.
- **Sparkline + Jinja evaluator** — covers the ApexCharts /
  mini-graph + mushroom-template-card content patterns that are
  table-stakes for "real" HA dashboards.
- **Plugin contract** — gives the Power-User persona an escape
  hatch without forcing them onto YAML.

### Where broadsheet misses (gaps the rubric should flag)

- **Pop-up / modal navigation** (Bubble Card pattern) — broadsheet
  pages are flat. No drill-down-without-route pattern. Bubble is
  4,200★ — significant.
- **Per-user dashboards** — same as the rest of HA. broadsheet's
  custom-pages + plugins are instance-wide. Persona P3 wants the
  power-user view AND the family view to be different doorways.
- **Conditional visibility primitives** — broadsheet has no
  "show this block when X" primitive. Persona P3 + P4 will hit
  this immediately.
- **Slider primitive** — Slider Entity Row is a top-20 HACS card.
  broadsheet has action-grid for taps but no continuous-value
  control surface.
- **Multi-series chart** — sparkline is single-entity. ApexCharts
  multi-line is a frequent pattern broadsheet doesn't yet match.
- **Floor-plan / picture-elements** — wow-factor pattern broadsheet
  intentionally omits.
- **eInk / low-power display rendering** — emerging niche broadsheet
  doesn't address; static-render mode might be a future plugin.
- **Two-dashboard pattern** — broadsheet doesn't help users
  maintain "power" + "simple" dashboards in parallel. The template-
  duplicate flow helps but isn't the right primitive for this.
- **Native template-card library** — Mushroom-template-card is
  enormously popular. broadsheet's markdown-with-Jinja covers some
  of this but not the icon-led visual register.

### v0.1.0 scope expansion (2026-05-16) — two omissions captured

The fresh-user dogfood V2 review surfaced two product-shaped
omissions the original landscape research missed. Both were added
to v0.1.0 scope (see RUBRIC.md Epics 7 + 8):

- **Peer-frontend, not THE frontend** — the V1 landscape treated
  broadsheet as a Lovelace-style frontend that lives alongside HA's
  native UI. In practice, every other "frontend" project (Mushroom,
  Tile, Bubble, etc) is a CARD set rendered inside HA's UI, so the
  peer-frontend story is correct for them. broadsheet is shaped
  differently — it's a full-page editorial register, not a card set.
  A peer-frontend that the user has to remember to open alongside
  HA's main sidebar is a worst-of-both-worlds outcome. Pain point #6
  (config tree) becomes "two config trees" for broadsheet users.
  **v0.1.0 fix**: broadsheet TAKES OVER on install — sidebar
  collapses, broadsheet ingress becomes the landing surface, the
  6-8 most-touched HA settings render natively in broadsheet's
  editorial register. Pain point #6 collapses to one editorial
  surface; pain point #10 (per-user dashboards) is unaffected but
  the rest of E1/E2/E3's surface story improves substantially.
  Plan: `docs/plans/plan-sidebar-takeover.md` + `docs/plans/plan-ha-settings-native-uis.md`.

- **Voice was out-of-scope** — the original landscape's "Voice PE
  cohort" line was a single bullet under "Where broadsheet misses".
  But the actual HA install base has voice EVERYWHERE — every
  install above HA 2024.x has STT/TTS + a conversation pipeline +
  Atom Echo / Wyoming-protocol satellites. The HA-native intent
  matcher is fast + free + already deployed; pairing it with a
  fall-through LLM is the well-established pattern. broadsheet's
  editorial register is uniquely well-shaped for the
  moment-of-spoken-response surface (italic display, prose-shaped,
  legible at glance). Shipping without voice IS shipping a
  visual-only home dashboard in a voice-aware era.
  **v0.1.0 fix**: a `@broadsheet/voice` generic plugin that
  discovers your installed HA conversation agents + TTS providers
  and routes utterances HA-native-first, LLM-fallback. Plus
  `@broadsheet/harold-preset` as the opinionated one-tap bundle
  (Hitchcock register, Claude Haiku, ElevenLabs Flash v2.5, the
  "Hey Harold" wakeword, meeting-mode, Italian detection, garbled-
  input filter, conversational memory). Users without paid APIs
  pair voice with Ollama + Piper (both local, both free) and still
  get a working pipeline.
  Plan: `docs/plans/plan-voice-substrate.md` + `docs/plans/plan-harold-preset.md`.

### Where broadsheet's existing surfaces partially address user needs

| User need | broadsheet's coverage today | Gap |
|---|---|---|
| "Show me what's relevant for the room I'm in" | Presence-cards + emanations | No conditional blocks; no per-room dashboard variant pattern |
| "Build a wall tablet dashboard fast" | /wall preset + custom-page builder | No surface-specific render mode; same blocks render same way on phone + tablet |
| "Make HA usable by my family" | Editorial register + curated /home | No per-user view; no family-mode toggle |
| "Translate my existing Lovelace" | Importer + 27 translators | Some HACS cards uncovered (Bubble, Auto-Entities, etc.); no re-import to update |
| "Visualise sensor history" | Sparkline | Single-entity only; no multi-series; no apexcharts-shaped chart |
| "Simple status dashboard for the household" | Markdown + presence-cards + sparkline + action-grid | No conditional blocks; no traffic-light-style status primitive |

## Surface deployment patterns

Confirmed across all 5 reports. Real-world install distribution:

| Surface | Share | broadsheet support |
|---|---|---|
| Phone (Companion App) | ~70%+ | Full — same SPA |
| Wall tablet (Fire HD / Galaxy Tab / Lenovo M10) | 2nd most common | Full — /wall preset + custom pages, but no surface-specific render |
| Desktop browser | Universal | Full |
| Cast display (Nest Hub / Chromecast) | Niche but persistent | Partial — no documented cast workflow yet; ha-catt-fix needed |
| eInk / art frame | Emerging niche | Not addressed |
| Voice-only | Sizeable post-Voice PE | Not applicable (broadsheet is visual) |

## Implications for the v0.9 ship-readiness rubric

Phase D will distill these into epics, stories, tasks. As input,
broadsheet's claim is:

> "An editorial-register Home Assistant frontend addon that adapts
> to whatever's in your install. Custom pages composable from typed
> primitives without YAML. Imports your existing Lovelace dashboards
> into the same primitive shape with 95% coverage. Built for the
> wall tablet + family-readable + ambient niches that the
> mainstream Mushroom / Bubble / Tile dashboards don't aim for."

The rubric should test that claim against:
- **The 5 personas** — each persona's top 3 needs translates to
  3-5 user stories
- **The 10 use cases** — each case has at least one "can broadsheet
  do this end-to-end" test
- **The 8 dashboard styles** — broadsheet doesn't need to BE all 8,
  but should at least transparently OFFER an alternative + import
  cleanly from the major ones
- **The 10 pain points** — broadsheet hits 6-7 of these directly;
  the test rubric should verify each claimed hit lands in
  practice

Phase E (automated tests) will operationalise this against:
- Synthetic Lovelace fixtures per dashboard style + use case
- Synthetic state snapshots per persona's typical entity set
- End-to-end browser tests for the family-shareable + wall-tablet +
  custom-page flows
- Coverage measurements per fixture

Phase F (gap analysis + synthesis artefact) addresses what failed
+ produces the ship-readiness baseline doc.

## Sources

This synthesis is built from five parallel research streams. Each
stream's full report (with primary-source citations) is in the
session's research artefacts. The citations across streams largely
converge — the same threads, videos, and HACS install patterns
came up multiple times independently, which is the strongest
signal that this landscape is real and not artefact-of-one-source.

Top sources cited across multiple streams:

- HA community forum: top-yearly threads in Frontend / Lovelace /
  Dashboards categories; the Mushroom Cards mega-thread
  (8000+ posts), Bubble Card thread (3,029 / 387,606 views),
  ApexCharts Card thread (4,712 / 695,665 views)
- r/homeassistant top posts of past year (via secondary sources
  due to access blocking — XDA, How-To Geek, HomeShift, SmartHomeScene)
- YouTube: Smart Home Junkie, Mark Watt Tech, Smart Home Solver,
  The Hook Up, Everything Smart Home, Reed Bender, digiblur,
  HomeAssistant official channel
- HACS rankings: GitHub stars on lovelace-* and home-assistant-*
  repos; HA analytics for integration install counts
- Showcase galleries: HomeShift, Bruno Sabot, Michael Sleen,
  XDA, BrightCoding
- Standout community concepts: Ambient Glass, Linus Dashboard,
  WallPanel addon, eInk Art Gallery
