# broadsheet — architecture plan

The transition from `harold-home` (curated, opinionated about the specific
13-room shape we have) to `broadsheet` (generic, adapts to whatever HA
tells it). Written as a planning document, not aspirational marketing —
this is what the actual extraction work will be.

> **Distribution decision (committed 2026-05-13)**: v0.1 ships as a
> Home Assistant add-on **only**. No Docker / standalone path in v0.1.
> See `BUILD-PLAN.md` for scope justification and
> `PREMORTEM-DIFF.md` for the trade-off analysis. References
> to "Docker" or "PWA install" below describe the longer-term v0.2+
> shape; v0.1 builds against the add-on path exclusively.

---

## Core principle: discovery-first, curation-second

Three layers, in order of authority:

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — User curation (broadsheet.json)                   │
│  Hide / pin / rename / reorder / page-pin overrides.         │
│  Persisted to localStorage (PWA) or data volume (Docker).    │
└──────────────────────────────────────────────────────────────┘
                            ▲ overrides
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2 — Domain model (`derived from layer 1`)             │
│  Areas → entities-grouped-by-domain. People, scenes, scripts.│
│  Pure functions of registries + state. Reactive via Svelte. │
└──────────────────────────────────────────────────────────────┘
                            ▲ derives
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 — HA discovery (raw)                                │
│  area_registry, device_registry, entity_registry, states.    │
│  Pulled at boot via WS, kept fresh via state_changed events. │
└──────────────────────────────────────────────────────────────┘
```

Each layer is **pure** with respect to the one below: layer 2 is a
deterministic projection of layer 1; layer 3 is a deterministic
override of layer 2. Replay-safe, testable, no hidden state.

---

## Layer 1 — HA discovery

### What we pull

Three registry calls at boot, all over WS:

```ts
// src/lib/ha/discovery.ts
const [areas, devices, entities] = await Promise.all([
  client.send({ type: 'config/area_registry/list' }),
  client.send({ type: 'config/device_registry/list' }),
  client.send({ type: 'config/entity_registry/list' })
]);
```

Plus the existing `get_states` + `subscribe_events` for live state.

Plus three further subscriptions for registry changes:

```ts
// Catch new rooms / new devices / new entities added to HA after we connected
client.send({ type: 'subscribe_events', event_type: 'area_registry_updated' });
client.send({ type: 'subscribe_events', event_type: 'device_registry_updated' });
client.send({ type: 'subscribe_events', event_type: 'entity_registry_updated' });
```

When any of those fire, we re-pull the affected registry and recompute
layer 2. Same reactive model as state changes.

### What we keep in the store

```ts
class DiscoveryStore {
  states     = $state<Record<string, HAState>>({});      // live
  areas      = $state<AreaRegistryEntry[]>([]);
  devices    = $state<DeviceRegistryEntry[]>([]);
  entities   = $state<EntityRegistryEntry[]>([]);
  status     = $state<ConnectionStatus>('idle');
  lastError  = $state<string | null>(null);
}
```

Same `$state` runes pattern as harold-home's existing store — additive,
not a rewrite.

---

## Layer 2 — Domain model

A **pure** projection of layer 1 into the shapes the pages need. Not
stored — derived via `$derived`. Re-runs automatically when layer 1
changes.

### The `Area` shape

```ts
interface Area {
  id: string;            // HA's area_id
  name: string;          // HA's area display name
  icon?: string;         // HA's mdi: icon, if set
  // Entities within the area, pre-filtered by domain
  lights:    Entity[];   // domain=light
  switches:  Entity[];   // domain=switch (filtered to lighting via heuristic)
  climates:  Entity[];   // domain=climate
  locks:     Entity[];   // domain=lock
  contacts:  Entity[];   // binary_sensor.*_door / *_window
  cameras:   Entity[];   // domain=camera
  media:     Entity[];   // domain=media_player
  remotes:   Entity[];   // domain=remote
  sensors:   Entity[];   // misc — temperature, humidity, lux, etc.
  // Computed
  hasLighting:   boolean;
  hasClimate:    boolean;
  hasMedia:      boolean;
  hasLockOrDoor: boolean;
}
```

### The `Person` shape

```ts
interface Person {
  id: string;            // HA's person.X entity_id
  name: string;
  // The user's chosen presence_sensor (defaulted on first-load via heuristic).
  // Asymmetry-aware: see `pickPresenceSensor()`.
  presenceSensorId: string | null;
  // Detected device class (informs the sensor-picking heuristic + warnings)
  deviceClass: 'android' | 'ios' | 'unknown';
}
```

### The grouping pipeline

```
raw entity registry  ─┐
raw device registry  ─┼→  groupByArea()  →  Area[]
raw area registry    ─┘
                          ↓
                      domain-filter → Area with .lights / .climates / etc populated
                          ↓
                      apply user curation (layer 3) → final Area[] for rendering
```

### The "Unsorted" bucket

Entities with **no `area_id`** that broadsheet would otherwise show
(e.g. a light in HA that the user never assigned to a room) collect into
a synthetic `Area { id: '__unsorted__', name: 'Unsorted', ... }`. The
relevant page (`/lights`, `/heat`, etc.) renders this section last, with
inline "assign to area" affordance via the Settings UI.

This is the discovery system's **honesty escape hatch** — instead of
silently dropping unassignable entities, we show them and prompt.

---

## Layer 3 — User curation

### Schema

```ts
// broadsheet.json
{
  "version": 1,
  "people": [
    {
      "personId": "person.alfie_dennen",
      "presenceSensorId": "sensor.alfie_committed_room",
      "deviceClass": "android"
    }
  ],
  "areas": {
    // overrides per area (keyed by HA area_id)
    "office": {
      "rename": "Studio",        // optional; otherwise HA's area name wins
      "iconOverride": "mdi:pencil",
      "hidden": false,
      "pageOrder": 1             // explicit ordering within pages
    }
  },
  "entities": {
    // overrides per entity (keyed by HA entity_id)
    "switch.office_plug": {
      "hidden": true,             // protect from accidental tap
      "warningLabel": "desk compute — DO NOT toggle"
    },
    "light.0xa4c1381f9e9c73b2": {
      "rename": "Hallway Spot 1"  // override HA's hex friendly name
    }
  },
  "pagePins": {
    // entity-id → page-slug, force an entity onto a non-default page
    "switch.living_room_floor_lamp": "lights"
  },
  "voice": {
    // editorial string overrides
    "manifest.empty": "The house is empty.",
    "manifest.bothHome": "{a} and {b} are both home."
  },
  "plugins": {
    "ghost-cloud": { "enabled": false },
    "emanations": { "enabled": false, "paintingsPath": "/local/broadsheet/paintings" }
  }
}
```

### Storage

**v0.1 (add-on only)**: written to `/data/broadsheet.json` inside the
add-on container, persisted across container restarts via HA's
`addon_config` map (so it's also in HA snapshots). All devices viewing
the SPA read the same canonical curation file via the sidecar API.

**v0.2+ (when Docker / PWA paths arrive)**:
- **PWA-first install** (no Docker volume): localStorage. Per-device
  curation, simplest path.
- **Docker install**: written to a mounted volume; user is responsible
  for backing it up.
- **Sync** (later): one device tagged "primary" syncs its curation to
  others via an HA `input_text` helper. Optional, opt-in.

### Editing

- **In-app Settings UI** (kebab nav → Settings) — visual editor that
  reads + writes the same JSON
- **File** — the JSON is exposed in the data volume; advanced users
  edit directly
- **No YAML** — JSON throughout for in-app round-tripping

---

## Page templates

Each page is a Svelte component that:
1. Imports a **discovery filter** (which Areas / Entities are relevant)
2. Imports the **layout shape** (Hero spread / panel grid / row list)
3. Imports the **interaction module** (actions specific to this domain)

### Example: `/lights`

```svelte
<script lang="ts">
  import { discovery } from '$lib/discovery';
  import { actions } from '$lib/ha/actions';
  import PageShell from '$lib/components/PageShell.svelte';
  import Hero from '$lib/components/Hero.svelte';
  import RoomReveal from '$lib/components/RoomReveal.svelte';

  // Discovery filter — which areas does this page render?
  const lightingAreas = $derived(
    discovery.areas.filter((a) => a.hasLighting)
  );
  // Plus pinned entities + unsorted bucket
  const pinned = $derived(discovery.pinnedTo('lights'));
  const unsorted = $derived(discovery.unsortedFor('lighting'));

  // Prose state — rolls up which areas are on
  const proseState = $derived.by(() => /* ... */);
</script>

<PageShell>
  <Hero>
    {#snippet eyebrow()}<Eyebrow section="lights" />{/snippet}
    {#snippet headline()}<h1>{proseState}</h1>{/snippet}
  </Hero>

  <SceneChips />  <!-- discovers `scene.*` automatically -->

  {#each lightingAreas as area (area.id)}
    <RoomReveal {area} />
  {/each}

  {#if pinned.length}
    <PinnedSection entities={pinned} />
  {/if}

  {#if unsorted.length}
    <UnsortedSection entities={unsorted} kind="lighting" />
  {/if}
</PageShell>
```

The page **never knows about specific room IDs**. Add an area to HA →
appears here. Remove an area → disappears. No code change.

### Domain → page map (the routing table)

```ts
// src/lib/discovery/page-map.ts
export const PAGES = {
  lights:     { domains: ['light'], switchHints: ['lighting'] },
  heat:       { domains: ['climate'] },
  door:       { domains: ['lock'], pairWith: ['binary_sensor'] /* doors/windows */ },
  tv:         { domains: ['media_player'], deviceClasses: ['tv'], pairWith: ['remote'] },
  body:       { domains: ['sensor'], categories: ['health-connect'] }
};
```

User curation can add to this map (pin a custom-domain entity to a page).

---

## Plugin system

> **Built + shipped in v0.1** via the P0–P4 plugin-system track.
> `RENDERER-CONTRACT.md` is the authoritative spec; the
> `BroadsheetPlugin` interface in `packages/core/src/lib/plugins/`
> is the machine-readable source of truth. This section is the
> overview — read the contract doc for detail.

Plugins **register pages, renderers, settings panels, and discovery
contributors**. The default broadsheet ships with the plugin *system*
but every plugin **disabled** — slim, fast, works for everyone.

A plugin is **active** when all hold:
1. it's bundled into the image (the first-class trio is) — or
   runtime-installed (v0.2);
2. `broadsheet.json → plugins.<id>.enabled === true` (toggled in
   `/settings/plugins`);
3. its loader checks pass (contract-shape valid, no slug collision)
   and — per page — its `visibleWhen(discovery)` returns true.

### Bundling model (v0.1)

The three first-class plugins are **`workspace:*` dependencies of
`@broadsheet/core`**. `core/src/lib/plugins/registry.ts` statically
imports them — it is the *only* bundling-aware module; everything
downstream (loader, `[pluginSlug]` route, KebabNav, `useRenderer`,
`/settings/plugins`) consumes a bundling-agnostic `BroadsheetPlugin[]`.
Heavy code sits behind `() => import(...)` thunks so Vite code-splits
it; a disabled plugin's chunks are present in the image but never
fetched. **`enabled` gates registration, not bundling.**

v0.2 extends `registry.ts` (and only `registry.ts`) with a runtime
code path for third-party plugins. The first-class trio stays bundled.

### Plugin shape

See `RENDERER-CONTRACT.md` § "Plugin shape" for the full, frozen
`BroadsheetPlugin` interface — `pages`, `renderers`, `settingsPanel`,
`staticAssets`, `discoveryContributors`, lifecycle hooks. Two hard
rules on a plugin's `index.ts`: no side effects at module-eval time,
and `import type` from `@broadsheet/core` only (never a runtime
import — `registry.ts` imports the plugin, so a back-import cycles).

### Three first-class plugins (extracted from harold-home)

- **`@broadsheet/emanations`** — multi-person presence painting.
  **Ported in full in v0.1 as the proof plugin** — page, renderer
  (procedural default + painting-capable), settings panel, painting-
  set discoveryContributor, static painting assets.
- **`@broadsheet/ghost-cloud`** — 24-hour radar event playback.
  Three.js + Web Audio. Contract-ready stub; renderer + precompute
  port is post-v0.1.
- **`@broadsheet/tmdb-tv`** — TMDB-driven content rows on `/tv`.
  Contract-ready stub; renderer port is post-v0.1.

---

## File structure

```
broadsheet/
├── README.md                          ← public-facing, marketing-ish
├── package.json                       ← @broadsheet/core
├── apps/
│   └── addon/                         ← HA add-on packaging (v0.1)
│       ├── Dockerfile
│       ├── config.yaml                ← HA add-on manifest
│       ├── run.sh                     ← entrypoint: read supervisor token, start nginx
│       ├── nginx.conf.tpl             ← templated reverse-proxy config
│       └── sidecar.py                 ← tiny aiohttp service for curation reads/writes
│   #  └── docker/                     ← v0.2+ — deferred until demand justifies it
│
├── packages/
│   ├── core/                          ← the SPA itself (most of harold-home/src)
│   │   ├── src/
│   │   │   ├── app.css                ← design tokens (the four-font system)
│   │   │   ├── app.html
│   │   │   ├── lib/
│   │   │   │   ├── ha/
│   │   │   │   │   ├── client.ts      ← WebSocket + heartbeat (kept verbatim)
│   │   │   │   │   ├── store.svelte.ts
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── discovery/
│   │   │   │   │   ├── registries.ts    ← layer 1: pull + subscribe to registries
│   │   │   │   │   ├── domain.ts        ← layer 2: project to Area / Person / etc
│   │   │   │   │   ├── curation.ts      ← layer 3: apply broadsheet.json overrides
│   │   │   │   │   ├── page-map.ts      ← domain → page routing table
│   │   │   │   │   └── heuristics.ts    ← presence-sensor picking, lighting-switch detection
│   │   │   │   ├── plugins.ts           ← plugin loader
│   │   │   │   └── components/
│   │   │   │       ├── PageShell.svelte ← width modes (default / narrow / bleed)
│   │   │   │       ├── Hero.svelte      ← magazine-spread on wide
│   │   │   │       ├── Eyebrow.svelte
│   │   │   │       ├── OutLine.svelte
│   │   │   │       ├── KebabNav.svelte
│   │   │   │       ├── RoomReveal.svelte    ← per-area light/climate reveal
│   │   │   │       ├── PinnedSection.svelte ← user-pinned entities
│   │   │   │       ├── UnsortedSection.svelte
│   │   │   │       └── Settings/        ← in-app curation UI
│   │   │   │           ├── HousePanel.svelte
│   │   │   │           ├── PeoplePanel.svelte
│   │   │   │           ├── VoicePanel.svelte
│   │   │   │           └── PluginsPanel.svelte
│   │   │   └── routes/
│   │   │       ├── +layout.svelte
│   │   │       ├── +page.svelte        ← landing
│   │   │       ├── lights/+page.svelte
│   │   │       ├── heat/+page.svelte
│   │   │       ├── door/+page.svelte
│   │   │       ├── tv/+page.svelte
│   │   │       ├── body/+page.svelte
│   │   │       └── settings/+page.svelte
│   │   ├── svelte.config.js
│   │   └── vite.config.ts
│   │
│   ├── emanations/                    ← @broadsheet/emanations plugin
│   │   ├── package.json
│   │   ├── src/index.ts               ← plugin definition
│   │   ├── src/EmanationsPage.svelte
│   │   ├── src/MultiPersonPainting.svelte
│   │   └── static/                    ← renderer files (room.html / room.js / stage.js)
│   │
│   ├── ghost-cloud/                   ← @broadsheet/ghost-cloud plugin
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   ├── src/LongTakePage.svelte
│   │   ├── static/                    ← office.html / ghost-cloud.js
│   │   └── precompute/                ← Python script for HA-side data prep
│   │
│   └── tmdb-tv/                       ← @broadsheet/tmdb-tv plugin
│       ├── package.json
│       ├── src/index.ts
│       └── src/TvContentSection.svelte
│
├── examples/
│   └── broadsheet.json.example        ← reference curation file, fully commented
│   #  nginx / caddy / traefik examples deferred to v0.2 (Docker path)
│
└── docs/
    ├── ARCHITECTURE.md                ← this document, generalised
    ├── PLUGINS.md                     ← write-your-own
    ├── DEPLOYMENT.md
    └── DESIGN-LANGUAGE.md             ← the four-font / register / token system
```

Workspace via `pnpm` (or npm workspaces) — `@broadsheet/core` consumes
plugins as optional peer-deps; the Docker image bakes in the trio above
by default.

---

## Migration path: harold-home → broadsheet

Not "rewrite from scratch." Most of harold-home's code is already
shape; the curation lives mostly in `house.json` + a few
hard-coded entity references. Concrete extraction order:

### Stage 1 — Build the discovery layer (in-place in harold-home)

1. Add `src/lib/discovery/` directory, all four files
2. Wire `DiscoveryStore` alongside the existing `entityStore` (don't
   replace, run in parallel for safety)
3. Build `Area` + `Person` projection
4. Verify against our actual house: every harold-home page should be
   able to render from the discovery model with identical output to
   the house.json-driven render.

**Outcome of stage 1**: harold-home works exactly as today, but
internally the discovery layer is proven against our real install.

### Stage 2 — Convert pages to discovery-first

Page by page, swap `lightingRooms()` (house.json filter) for
`discovery.areas.filter(a => a.hasLighting)`. The harold-home
`house.json` continues to provide the curation overrides via the new
layer 3.

Edit `house.json` → produce a `broadsheet.json` from it via a one-time
migration script. They become the same shape.

### Stage 3 — Extract plugins

Move `static/immaterials/` → `packages/emanations/`.
Move `static/exposure/` → `packages/ghost-cloud/`.
Move `src/lib/tmdb.ts` + the `/tv` content section → `packages/tmdb-tv/`.

Each plugin gets its own `package.json` + index.ts that registers via
the plugin contract.

`@broadsheet/core` no longer depends on these directly — the
harold-home install adds them as workspace deps.

### Stage 4 — Build Settings UI

The visual editor over `broadsheet.json`. Replace the file-only flow
with in-app management. The file remains the persistence layer.

### Stage 5 — Strip Harold Road specifics

The voice strings, the painting set, the address references, the
Harold-Road-only entity IDs → all becomes example data, none ships in
core.

### Stage 6 — Build the HA add-on

A Dockerfile that bundles `@broadsheet/core` + nginx + the tiny
sidecar service. nginx proxies `/api/*` and `/local/*` to
`http://supervisor/core/` with `Authorization: Bearer ${SUPERVISOR_TOKEN}`
injected as a request header — the SPA never sees a token, never
pastes one. Full mock at `ADDON-MOCK.md`.

### Stage 7 — First public release

`v0.1.0` of `broadsheet`, shipped as an HA add-on via custom Supervisor
repository. README is the doc we drafted (with v0.1's add-on-only
positioning). GitHub repo + GHCR-hosted multi-arch images +
`addon` repository for users to add. GitHub Discussions for
community feedback. Docker / standalone path deferred to v0.2 gated on
issue-volume demand signal.

harold-home itself becomes a "thin downstream" of broadsheet — just
the personal `broadsheet.json` + paintings + custom Eyebrow voice.

---

## What this commits us to

- **A monorepo** (pnpm workspaces or similar) — bigger build matrix
- **Maintained release cadence** — at least one substantive update per
  quarter, more if PRs land
- **Public Discord or Discussions** — the ha-fusion experience shows the
  audience expects responsiveness; if we go silent for 12 months,
  someone forks us
- **Versioned plugin contract** — once plugins are a thing, breaking
  the API hurts users; semver discipline matters
- **CI** — lint + build + headless test against a known-shape mock HA
- **One-line install** — the HA add-on path has to actually work end-to-end
  on a clean HA install, not just on our box

This is a real project, not a weekend dump. The audience exists; the
slot is open; the editorial register is genuinely uncovered. Worth
doing if we're committed to maintaining it.

---

## Estimated effort

- Stage 1 (discovery layer): **2–3 days** focused
- Stage 2 (page conversion): **1–2 days** per page × 6 pages = **~1 week**
- Stage 3 (plugin extraction): **2–3 days** per plugin × 3 = **~1 week**
- Stage 4 (Settings UI): **1 week**
- Stage 5 (strip personal): **2 days**
- Stage 6 (HA add-on): **2–3 days**
- Stage 7 (release prep, README polish, screenshots, docs): **3 days**

**Total: ~5–6 weeks of focused work** to a credible v0.1.0.

Phased over evenings + weekends: realistically **3 months** elapsed.
