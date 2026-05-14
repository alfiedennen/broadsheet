# broadsheet — pre-mortem diff

What deep HA surface research changes about our architecture, Settings
UI, and add-on plans. Read alongside:

- `ARCHITECTURE.md`
- `SETTINGS-UI.md`
- `ADDON-MOCK.md`

This document marks the assumptions in those that survived, the ones
that didn't, and the new commitments the research surfaced.

> **Superseded by 2026-05-13 distribution decision**: items below
> referencing "two distribution profiles", "Docker path OAuth in v0.1",
> or "ship LLAT as v0.1 fallback" are no longer in scope. v0.1 ships
> as an HA add-on **only** (Supervisor token auto-injection at the
> nginx layer — zero credentials handled by the user). The Docker /
> standalone path is deferred to v0.2 gated on issue-volume demand
> signal. Findings about ingress, `X-Ingress-Path`, `paths.base`,
> Floors, Labels, `subscribe_entities`, and the `home-assistant-js-websocket`
> library all still stand. See `BUILD-PLAN.md` for the
> committed v0.1 scope.

---

## TL;DR — five things change

1. **Use `subscribe_entities`, not `get_states` + `state_changed`.** The
   compressed delta protocol exists, the JS library implements it
   correctly, our hand-rolled subscription wastes ~80% bandwidth + has
   reconnect bugs we don't need. **Use the canonical
   `home-assistant-js-websocket` library or copy its `entities.ts`.**
2. **Floors + Labels are first-class layer-1 entities, not v2.** HA
   2024.4+ added them; voice flows depend on them; ignoring them now
   means a schema migration in months. Bake in from day 1, even if v1
   UI doesn't surface them.
3. **The HA Ingress base-path / `X-Ingress-Path` problem is real and
   non-trivial.** Plan for two distribution profiles from the start
   (add-on with relative URLs + ingress-aware, standalone with absolute
   URLs + LLAT/OAuth). Don't try to ship one build that's both.
4. **HA itself has been aggressively claiming the "home dashboard" slot
   in 2026.1-2026.3** — including overwriting user configs. **broadsheet
   should sit alongside HA's home dashboard, not replace it.** Sidebar
   panel + Ingress is the safe slot.
   > **Follow-up (2026-05-14)**: this decided the *distribution slot*
   > but not the *user experience*. The Ingress-panel slot means
   > broadsheet is permanently boxed inside HA's chrome — in tension
   > with the "true replacement" user need surfaced after M5
   > verification. Resolved into a two-part plan: v0.1 themes HA's
   > chrome to match broadsheet's register; v0.2 inverts the iframe so
   > broadsheet *is* the shell and HA's config pages embed inside it.
   > See `REPLACEMENT-VISION.md`.
5. **Strategies API (2026.5+) opens a third distribution channel** —
   broadsheet's renderers as Lovelace strategy + view, embeddable
   inside HA's own dashboards. **Defer to v0.2 but design for it now**
   (the renderer plugin contract should be reusable as both broadsheet
   pages AND Lovelace cards/views).

---

## Architecture diff — `ARCHITECTURE.md`

### Layer 1 (HA discovery) — significant additions

**What we drafted**: pull `area_registry`, `device_registry`,
`entity_registry`. Subscribe to `state_changed`, `*_registry_updated`.

**What we missed**:

- **`config/floor_registry/list`** + `floor_registry_updated` — HA 2024.4+,
  has `floor_id`, `level`, `aliases`. Areas group into floors.
- **`config/label_registry/list`** + `label_registry_updated` — orthogonal
  tags on areas / devices / entities / automations. Has color + icon.
  Voice depends on these.
- **`config/category_registry/list`** + `category_registry_updated` —
  table-specific groupings (HA 2024.4). Distinct from labels.
- **`config/entity_registry/list_for_display`** — lighter than the full
  list, designed for fast UI cold-boot. **Use this on first paint, the
  full list lazily after.**
- **`subscribe_entities`** instead of `get_states` + `state_changed`. The
  former returns compressed deltas (`{a: added, c: changed, r: removed}`
  with diffs in `+`/`-` keys, single-character compressed entity-state
  fields). The library handles cache + reconnect-resubscribe.
- **`extract_from_target`** — given a target spec (device/area/label/
  entity), returns the resolved entity_ids. Crucial when broadsheet's
  Settings UI lets users pin "everything labelled `christmas`" to a
  page — we don't have to compute the resolution ourselves.
- **`render_template`** — subscribe-style template eval. If broadsheet
  ever shows computed prose ("3 lights on, 2 in the living room"), use
  this instead of computing client-side over the entity store.

**Action**: replace the "What we pull" section in the architecture doc
with the full list above. Layer 1 store gets `floors`, `labels`,
`categories` as parallel reactive arrays alongside `areas`, `devices`,
`entities`.

### Layer 2 (Domain model) — Floor + Label as first-class

**What we drafted**: `Area` shape with entities pre-grouped by domain.

**What we missed**:

- **`Floor`** is the natural parent of `Area` for multi-storey houses.
  `Floor → Area → Entity` is the canonical hierarchy.
- **`Label`** is orthogonal to area. An entity can be in `area: Office`
  AND `labels: ['critical', 'work-time-only']`. Pages can filter by
  label as well as area.
- **Entity → Area resolution has TWO paths** — entity's own `area_id`
  overrides device's `area_id`, but if entity's is null, fall back to
  device's. Many integrations don't set entity area, so device area is
  the common case. **Our projection function must check both.**
- **Entity name composition with `has_entity_name`**:
  - `has_entity_name=True` AND `name="Pendant"`: friendly = `"<Device.name> Pendant"` (e.g. `"Office Light Pendant"`)
  - `has_entity_name=True` AND `name=None`: entity IS the device's main feature, friendly = `Device.name`
  - `has_entity_name=False`: legacy, friendly = whatever the integration set
  - **Don't trust `state.attributes.friendly_name` for layout decisions** — translations swap it. Compose from registry.

**Action**: revise the `Area` interface to include `floor: Floor | null`
and `labels: Label[]`. Add a parallel `Floor` interface with `areas:
Area[]`. Update the projection pipeline doc to walk `floor → area →
device → entity` with the area-fallback rule explicit.

### Layer 3 (Curation) — schema versioning matters

**What we drafted**: `broadsheet.json v1` with hide/pin/rename/etc.

**What we missed**:

- **HA renames are common.** User renames an area `office → studio` in
  HA — our `broadsheet.json` keys by `area_id` (stable, good) but our
  `pagePins` reference stale labels in voice strings. Surface a
  reconcile prompt.
- **`hidden_by` (HA-side) is information, not just state.** Three values:
  `INTEGRATION` (the integration thinks this is internal — good default
  to hide), `USER` (user explicitly hid in HA), `null` (visible).
  Layer 2 should default-hide `hidden_by != null`; Layer 3 can
  un-hide via `entities.<id>.unhide: true`.
- **`disabled_by` is harder** — disabled entities are NOT in
  `subscribe_entities`. We see them in registry but get no state. Skip
  them entirely.
- **`entity_category: 'config' | 'diagnostic' | null`** — primary surfaces
  default to `null` only. CONFIG/DIAGNOSTIC go on a `/diagnostics` page
  or behind a "show technical entities" toggle.

**Action**: schema-version the curation file from day 1 (`"version": 1`
already drafted, good). Add explicit handling for `hidden_by` /
`disabled_by` / `entity_category` to Layer 2 with corresponding Layer 3
overrides.

### Renderer plugin contract — future-proof for Lovelace strategies

**What we drafted**: plugins register pages + renderers in broadsheet.

**What we missed**: the same renderer (Ghost Cloud, Emanations) could
be useful as a **Lovelace card or view strategy** for HA users who
DON'T want to install the full broadsheet SPA. Strategies API in
2026.5+ supports custom strategy registration via `window.customStrategies`.

If we design the plugin contract correctly, the same NPM package can
ship:
- A broadsheet page (full editorial register, all of broadsheet's
  layout primitives available)
- A Lovelace card for use inside HA's own dashboards (Sections-grid-
  aware, sized via `grid_options`)
- A Lovelace view strategy (auto-generates a whole HA dashboard view)

**Action**: defer the implementation, but draft the plugin contract
shape so it can be extended to Lovelace surfaces in v0.2.

---

## Settings UI diff — `SETTINGS-UI.md`

### `/settings/house` — restructure around Floor → Area

**What we drafted**: flat list of Areas with entities grouped by domain.

**What changes**: top-level grouping by Floor when `floor_count > 1`.
Areas without a floor get an "Unassigned floor" bucket.

```
Floors (2)
  ⌜ Ground floor      6 areas
    ⌜ Office          13 entities
    ⌜ Living Room      9 entities
    ...
  ⌜ Upstairs          5 areas
    ⌜ Bedroom          3 entities
    ⌜ Bathroom         1 entity
    ...
  ⌜ Unassigned        1 area
    ⌜ Cellar           0 entities
```

When `floor_count == 1` (single-storey or houses without floor
configured), collapse the Floor wrapper and show Areas at top — same as
today's mockup.

### Add `/settings/labels` — new screen

**What we drafted**: nothing about Labels.

**What changes**: a new section under Settings for Label management.

- List all labels with their color/icon
- For each: show count of entities, areas with that label
- "Pin label X to page Y" — the equivalent of pin-by-area but pin-by-label
- "Hide all entities with label X by default"

This unlocks "all christmas lights off" / "show me only critical
sensors" kinds of UX without manual entity-by-entity curation.

### Inherit-HA-theme toggle in `/settings/voice` (or new `/settings/theme`)

**What we drafted**: nothing about HA theme inheritance.

**What changes**: add a toggle that overlays HA's theme CSS variables
on top of broadsheet's defaults. Off by default (broadsheet's editorial
register is the point); on if a user explicitly wants their HA
blue/orange/whatever to bleed through.

Read via `frontend/get_themes` WS command on boot. Apply as
CSS variables `--ha-primary-color`, etc. — broadsheet's components
fall back to HA vars when its own aren't set.

### Settings persistence path — split add-on vs Docker

**What we drafted**: PWA → localStorage; Docker / add-on → `/data/broadsheet.json`.

**What changes**: add-on's `/data/` is in HA's snapshot system
automatically. Confirmed correct. **Add a step**: also write paintings
to `/data/paintings/` so they're backed up. **Don't** use `/share/` —
that's cross-add-on visible.

For Docker (no Supervisor): we still write to a mounted volume but the
USER is responsible for backing it up. Document that in the Docker
section.

### Alert classes — add three more

**What we drafted**: 7 alert classes.

**What changes**: add three new alert classes from the research:

| New trigger | Alert |
|---|---|
| User just renamed an area in HA | "Area `<old>` was renamed to `<new>`. Reconcile your curation?" |
| ≥1 entity has `hidden_by: integration` AND user has explicitly un-hidden it | "X entities the integration hid are now showing — usually intentional, but verify." |
| HA's auto-Home dashboard installed by 2026.x — and broadsheet detects it | "HA installed its new Home dashboard. broadsheet still works alongside; you may want to set broadsheet as your default landing." |

---

## Add-on diff — `ADDON-MOCK.md`

### `config.yaml` corrections

**What we drafted**:
```yaml
ingress_port: 8099
```

**What changes**:
```yaml
ingress_port: 0      # let Supervisor allocate dynamically
```

Hard-coding the port can collide with another add-on. `0` lets
Supervisor pick. Confirmed already-set: `ingress_stream: true` is
**required** for WebSocket. Without it, WS frames buffer + you get
mysterious lag.

### `panel_admin: false` was wrong

**What we drafted**: `panel_admin: false` (any HA user).

**What changes**: `panel_admin: true` is what add-ons that need full
HA API access typically use. We need `homeassistant_api: true` (which
we have); the panel_admin restriction limits which HA users can OPEN
the broadsheet panel. Default to `true` (admin-only); broadsheet config
can lower it later.

### `paths.base` + `X-Ingress-Path` — the real risk

**What we drafted**: nothing about SvelteKit routing under the
ingress proxy.

**What changes**: ingress URL is `https://<ha-host>/api/hassio_ingress/<token>/...`
where `<token>` rotates per session. Both:

- **SvelteKit routing**: the `paths.base` in `svelte.config.js` must
  honour the ingress path, OR every navigation 404s. The standard
  pattern is to read `X-Ingress-Path` from the inbound request headers
  in the entrypoint (or set it via env var written by `run.sh`).
- **WebSocket URL**: when the SPA constructs `ws://<host>/api/websocket`,
  if it uses `location.host` it gets the HA host correctly, but the
  `<token>/...` ingress prefix WON'T be there (WS bypasses ingress —
  Supervisor routes it directly). Need to use the SUPERVISOR_TOKEN
  Bearer in nginx's proxy_pass for `/api/websocket` like our drafted
  config does. **Confirmed correct in our nginx.conf.tpl.**

**Action**: add a section to the add-on doc on `paths.base` strategy.
The cleanest: serve at relative paths from nginx's root, let HA's
ingress proxy prepend its token-path transparently, **never bake an
absolute base into SvelteKit's build.**

### Auth — multi-path planning

**What we drafted**: add-on path = Supervisor token magic, Docker path
= LLAT paste, OAuth as v0.2.

**What changes** (refinement):

- **Add-on path** is a clear win. Confirmed.
- **Docker / standalone path**: ship LLAT as v0.1 fallback, BUT also
  ship `getAuth()`-based OAuth flow from the start. The
  `home-assistant-js-websocket` library implements it; we use it
  directly. The OAuth dance redirects the user to HA, they accept the
  app, redirect back with a token. **Significantly better UX than
  paste-token, no extra distribution work.** Move OAuth from v0.2 to
  v0.1.

### Two-channel HACS reality

**What we drafted**: HACS "Frontend" vs HACS "Add-on".

**What changes**: **HACS doesn't have an "Add-on" category at all.**
Add-ons are distributed via custom Supervisor add-on repositories
(separate URL users add). HACS "Frontend" plugins load JS resources
into HA's own frontend (Mushroom, custom cards).

So the two channels are:
- **HACS Frontend**: as-Lovelace-strategy (v0.2 — the plugins
  could be JS modules registered with `window.customStrategies`)
- **Custom add-on repository**: as-add-on (v0.1 — Supervisor)

Update the README's install section to reflect this correctly.

---

## New commitments the research forces on us

Things we have to add to our plan:

1. **Use `home-assistant-js-websocket` as a dep, not roll our own.**
   Our current `client.ts` is OK but doesn't speak the compressed delta
   protocol. The library is the canonical implementation. Adopting it:
   - Means our `subscribe_entities` is correctly diff-based
   - Means our reconnect logic is the canonical version (cache replay,
     resubscribe, backoff)
   - Adds a small dep (~30KB gzipped) to broadsheet/core
   - **Direct effort**: ~half a day to swap in. Less code in our repo.

2. **`paths.base` strategy doc in the add-on path.** Right now SvelteKit
   has `paths.base = ''` and assumes serving from origin root. Under
   ingress that's wrong. Either:
   - Read `X-Ingress-Path` at runtime + use it as runtime base (requires
     a small server-side template before SvelteKit's hydration)
   - OR build a separate add-on bundle with `paths.base` baked from the
     env at startup (rebuild-on-change is fine for an add-on container)
   - OR serve everything at relative paths and trust nginx to prepend
     the prefix transparently (cleanest if it works — verify)

3. **Add-on update flow**: when broadsheet ships v0.2, what migration
   does the user's curation file need? Schema-version bumps need a
   forward-only migrator built in. Plan for it now.

4. **A `category_registry` story** even if minimal. Categories ARE in
   the registry; ignoring them entirely means UX gaps for users who
   organise their HA via categories.

5. **Inline alert UX** for HA's own home-dashboard collisions. HA users
   on 2026.2+ have a new auto-Home dashboard; broadsheet's existence
   alongside it needs a tasteful "we're still here, would you like to
   make us your default landing?" prompt.

---

## What we are NOT doing (research-confirmed wisdom)

1. **Not reimplementing the WS subscription protocol.** Library does it.
2. **Not replacing HA's home dashboard.** Sidebar-panel-via-ingress is the
   collision-free slot. README should say so.
3. **Not designing for multi-instance HA in v1.** Real but rare.
   Connection module designed as per-instance from day 1, but UI is
   single-instance.
4. **Not shipping our own theme inheritance from HA in v1.** The "is
   broadsheet's editorial register or HA's blue the truth" question is
   a v1 distraction. Default to broadsheet; toggle to inherit later.
5. **Not building OAuth for the add-on path** — Supervisor token
   handles it. Only the Docker path needs OAuth.

---

## Open questions deferred to user research

The research surfaced five questions that doc-reading can't answer.
Defer until we have at least 2 real users (us + 1 friend) trialling:

1. **Auto-add new HA areas to broadsheet pages, or queue for one-tap
   accept?** HA's "magical replacement" footgun in 2026.3.1 suggests
   users hate silent additions. Default likely: queue, with an alert.
2. **Curation = hide-list (default-show) or show-list (default-hide)?**
   Probably hide-list for new HA installs, show-list for power users
   with 500+ entities. Test both with two real users.
3. **Area rename in HA → silent migrate or reconcile prompt?** Probably
   prompt the first time, learn the user's preference.
4. **Floors as nav primary (`/upstairs/lights`) or area-as-primary
   (`/lights`)?** Auto-detect from `floor_count` and switch nav layout?
   Test with users in 1-floor and multi-floor houses.
5. **Plugin renderer crash → degraded chip or empty card?** Probably
   degraded chip, but validate before locking the plugin contract.

---

## Five reads, ranked, before any code

The research's most valuable concrete output. Before writing any
broadsheet code, read in this order:

1. **`home-assistant/frontend/src/panels/lovelace/strategies/areas/`** —
   working blueprint for "auto-discover from registries, project per-
   area, render". Particularly `areas-dashboard-strategy.ts` and
   `area-view-strategy.ts`. Steal heuristics directly.
2. **`home-assistant/home-assistant-js-websocket/lib/entities.ts` +
   `connection.ts` + `auth.ts`** — the canonical WS client. Decide:
   adopt or copy.
3. **`developers.home-assistant.io/docs/frontend/custom-ui/custom-strategy/`**
   — to design the v0.2 Lovelace-strategy facade now.
4. **`developers.home-assistant.io/docs/add-ons/presentation/`** + the
   Ingress section of the supervisor proxy docs — `X-Ingress-Path`
   truth. Read with a SvelteKit `paths.base` doc tab open.
5. **`home-assistant/frontend/src/data/{area,floor,label,entity,device}_registry.ts`**
   — TypeScript types straight from the source. Copy into broadsheet's
   `domain/types.ts`.

---

## Updated effort estimate

Original (in `ARCHITECTURE.md`): ~5-6 weeks focused, ~3 months
elapsed.

Diff additions:

| New work | Effort |
|---|---|
| Adopt `home-assistant-js-websocket` library + rewrite client.ts | -½ day (it's less code than we have) |
| Floor + Label registry pull + projection | +1 day |
| Floor-aware Settings UI restructure | +½ day |
| Ingress `paths.base` solution + verification | +1 day |
| OAuth in Docker path (using lib) | +½ day |
| Theme inheritance toggle (read HA theme on boot) | +½ day |
| Schema-version migrator for `broadsheet.json` | +½ day |
| Alert system for HA collisions + area renames | +1 day |

**Net: ~+4 days.** Doesn't change the overall estimate meaningfully —
~5-6 weeks focused stays right. Most of these are bounded refinements
to layers we already designed.

---

## Confidence after the diff

Higher than before. The research confirmed the **shape** is right
(3-layer, discovery-first, plugin contract, add-on as primary
distribution) and surfaced specific corrections rather than
fundamental rethinks. No "we'd have to throw it all out" moments.

The biggest single lift from the research isn't a feature — it's the
**`home-assistant/frontend/src/panels/lovelace/strategies/areas/`**
read. HA's own auto-area-dashboard strategy has solved many of the
heuristic problems we'd have hit (which entities go where, how to
handle hidden, how to bucket by domain). Reading it before coding
saves a week.

**Recommended next move**: spend a day on Read 1 (`areas/` strategy),
then revise the architecture doc with what we learn, then start the
Stage 1 build (discovery layer) against that updated plan.
