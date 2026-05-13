# broadsheet â€” architecture plan

The transition from `harold-home` (curated, opinionated about the specific
13-room shape we have) to `broadsheet` (generic, adapts to whatever HA
tells it). Written as a planning document, not aspirational marketing â€”
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
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  LAYER 3 â€” User curation (broadsheet.json)                   â”‚
â”‚  Hide / pin / rename / reorder / page-pin overrides.         â”‚
â”‚  Persisted to localStorage (PWA) or data volume (Docker).    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â–² overrides
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  LAYER 2 â€” Domain model (`derived from layer 1`)             â”‚
â”‚  Areas â†’ entities-grouped-by-domain. People, scenes, scripts.â”‚
â”‚  Pure functions of registries + state. Reactive via Svelte. â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â–² derives
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  LAYER 1 â€” HA discovery (raw)                                â”‚
â”‚  area_registry, device_registry, entity_registry, states.    â”‚
â”‚  Pulled at boot via WS, kept fresh via state_changed events. â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Each layer is **pure** with respect to the one below: layer 2 is a
deterministic projection of layer 1; layer 3 is a deterministic
override of layer 2. Replay-safe, testable, no hidden state.

---

## Layer 1 â€” HA discovery

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

Same `$state` runes pattern as harold-home's existing store â€” additive,
not a rewrite.

---

## Layer 2 â€” Domain model

A **pure** projection of layer 1 into the shapes the pages need. Not
stored â€” derived via `$derived`. Re-runs automatically when layer 1
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
  sensors:   Entity[];   // misc â€” temperature, humidity, lux, etc.
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
raw entity registry  â”€â”
raw device registry  â”€â”¼â†’  groupByArea()  â†’  Area[]
raw area registry    â”€â”˜
                          â†“
                      domain-filter â†’ Area with .lights / .climates / etc populated
                          â†“
                      apply user curation (layer 3) â†’ final Area[] for rendering
```

### The "Unsorted" bucket

Entities with **no `area_id`** that broadsheet would otherwise show
(e.g. a light in HA that the user never assigned to a room) collect into
a synthetic `Area { id: '__unsorted__', name: 'Unsorted', ... }`. The
relevant page (`/lights`, `/heat`, etc.) renders this section last, with
inline "assign to area" affordance via the Settings UI.

This is the discovery system's **honesty escape hatch** â€” instead of
silently dropping unassignable entities, we show them and prompt.

---

## Layer 3 â€” User curation

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
      "warningLabel": "desk compute â€” DO NOT toggle"
    },
    "light.0xa4c1381f9e9c73b2": {
      "rename": "Hallway Spot 1"  // override HA's hex friendly name
    }
  },
  "pagePins": {
    // entity-id â†’ page-slug, force an entity onto a non-default page
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

- **In-app Settings UI** (kebab nav â†’ Settings) â€” visual editor that
  reads + writes the same JSON
- **File** â€” the JSON is exposed in the data volume; advanced users
  edit directly
- **No YAML** â€” JSON throughout for in-app round-tripping

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

  // Discovery filter â€” which areas does this page render?
  const lightingAreas = $derived(
    discovery.areas.filter((a) => a.hasLighting)
  );
  // Plus pinned entities + unsorted bucket
  const pinned = $derived(discovery.pinnedTo('lights'));
  const unsorted = $derived(discovery.unsortedFor('lighting'));

  // Prose state â€” rolls up which areas are on
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

The page **never knows about specific room IDs**. Add an area to HA â†’
appears here. Remove an area â†’ disappears. No code change.

### Domain â†’ page map (the routing table)

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

Plugins are NPM packages that **register pages, renderers, or
integrations** at boot. The default broadsheet ships with NO plugins â€”
slim, fast, works for everyone. Plugins activate when both:

1. The package is installed (or auto-detected via a registry)
2. The user's HA has the data the plugin expects

### Plugin shape

```ts
// example: @broadsheet/emanations
export const plugin: BroadsheetPlugin = {
  id: 'emanations',
  pages: [
    {
      slug: 'emanations',
      label: 'Emanations',
      requiresEntity: (e) => e.entity_id.startsWith('sensor.') && e.entity_id.endsWith('_committed_room'),
      // Page renders when at least 2 _committed_room sensors found (multi-person)
      visibleWhen: (discovery) => discovery.entities.filter(/* ... */).length >= 2,
      // The component to render
      component: () => import('./EmanationsPage.svelte')
    }
  ],
  // Optional: register a renderer the user can reference from /
  renderers: {
    'multi-person-painting': () => import('./MultiPersonPainting.svelte')
  }
};
```

### Plugin loader

```ts
// src/lib/plugins.ts
const plugins: BroadsheetPlugin[] = await Promise.all([
  // Lazy import â€” only fetched if the user's broadsheet.json enables them
  ...config.plugins.enabled.map((id) => import(`@broadsheet/${id}`).then(m => m.plugin))
]);
```

### Three first-class plugins (extracted from harold-home)

- **`@broadsheet/emanations`** â€” multi-person presence painting. Ships
  the `room.html` + `room.js` + `stage.js` renderers, the painting-set
  convention (`<slug>.png`, `<slug>-elena.png`, `<slug>-both.png`), the
  away-pane CSS treatment.
- **`@broadsheet/ghost-cloud`** â€” 24-hour radar event playback.
  Three.js + Web Audio. Ships the `ghost-cloud.js` renderer + a
  precompute script for HA-side data preparation.
- **`@broadsheet/tmdb-tv`** â€” the TMDB-driven content rows on `/tv`.
  Pull out into a plugin so people who don't have a TV (or don't want
  the TMDB dependency) ship lighter.

---

## File structure

```
broadsheet/
â”œâ”€â”€ README.md                          â† public-facing, marketing-ish
â”œâ”€â”€ package.json                       â† @broadsheet/core
â”œâ”€â”€ apps/
â”‚   â””â”€â”€ addon/                         â† HA add-on packaging (v0.1)
â”‚       â”œâ”€â”€ Dockerfile
â”‚       â”œâ”€â”€ config.yaml                â† HA add-on manifest
â”‚       â”œâ”€â”€ run.sh                     â† entrypoint: read supervisor token, start nginx
â”‚       â”œâ”€â”€ nginx.conf.tpl             â† templated reverse-proxy config
â”‚       â””â”€â”€ sidecar.py                 â† tiny aiohttp service for curation reads/writes
â”‚   #  â””â”€â”€ docker/                     â† v0.2+ â€” deferred until demand justifies it
â”‚
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ core/                          â† the SPA itself (most of harold-home/src)
â”‚   â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”‚   â”œâ”€â”€ app.css                â† design tokens (the four-font system)
â”‚   â”‚   â”‚   â”œâ”€â”€ app.html
â”‚   â”‚   â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ ha/
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ client.ts      â† WebSocket + heartbeat (kept verbatim)
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ store.svelte.ts
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ actions.ts
â”‚   â”‚   â”‚   â”‚   â”‚   â””â”€â”€ types.ts
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ discovery/
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ registries.ts    â† layer 1: pull + subscribe to registries
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ domain.ts        â† layer 2: project to Area / Person / etc
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ curation.ts      â† layer 3: apply broadsheet.json overrides
â”‚   â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page-map.ts      â† domain â†’ page routing table
â”‚   â”‚   â”‚   â”‚   â”‚   â””â”€â”€ heuristics.ts    â† presence-sensor picking, lighting-switch detection
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ plugins.ts           â† plugin loader
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ components/
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ PageShell.svelte â† width modes (default / narrow / bleed)
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ Hero.svelte      â† magazine-spread on wide
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ Eyebrow.svelte
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ OutLine.svelte
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ KebabNav.svelte
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ RoomReveal.svelte    â† per-area light/climate reveal
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ PinnedSection.svelte â† user-pinned entities
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ UnsortedSection.svelte
â”‚   â”‚   â”‚   â”‚       â””â”€â”€ Settings/        â† in-app curation UI
â”‚   â”‚   â”‚   â”‚           â”œâ”€â”€ HousePanel.svelte
â”‚   â”‚   â”‚   â”‚           â”œâ”€â”€ PeoplePanel.svelte
â”‚   â”‚   â”‚   â”‚           â”œâ”€â”€ VoicePanel.svelte
â”‚   â”‚   â”‚   â”‚           â””â”€â”€ PluginsPanel.svelte
â”‚   â”‚   â”‚   â””â”€â”€ routes/
â”‚   â”‚   â”‚       â”œâ”€â”€ +layout.svelte
â”‚   â”‚   â”‚       â”œâ”€â”€ +page.svelte        â† landing
â”‚   â”‚   â”‚       â”œâ”€â”€ lights/+page.svelte
â”‚   â”‚   â”‚       â”œâ”€â”€ heat/+page.svelte
â”‚   â”‚   â”‚       â”œâ”€â”€ door/+page.svelte
â”‚   â”‚   â”‚       â”œâ”€â”€ tv/+page.svelte
â”‚   â”‚   â”‚       â”œâ”€â”€ body/+page.svelte
â”‚   â”‚   â”‚       â””â”€â”€ settings/+page.svelte
â”‚   â”‚   â”œâ”€â”€ svelte.config.js
â”‚   â”‚   â””â”€â”€ vite.config.ts
â”‚   â”‚
â”‚   â”œâ”€â”€ emanations/                    â† @broadsheet/emanations plugin
â”‚   â”‚   â”œâ”€â”€ package.json
â”‚   â”‚   â”œâ”€â”€ src/index.ts               â† plugin definition
â”‚   â”‚   â”œâ”€â”€ src/EmanationsPage.svelte
â”‚   â”‚   â”œâ”€â”€ src/MultiPersonPainting.svelte
â”‚   â”‚   â””â”€â”€ static/                    â† renderer files (room.html / room.js / stage.js)
â”‚   â”‚
â”‚   â”œâ”€â”€ ghost-cloud/                   â† @broadsheet/ghost-cloud plugin
â”‚   â”‚   â”œâ”€â”€ package.json
â”‚   â”‚   â”œâ”€â”€ src/index.ts
â”‚   â”‚   â”œâ”€â”€ src/LongTakePage.svelte
â”‚   â”‚   â”œâ”€â”€ static/                    â† office.html / ghost-cloud.js
â”‚   â”‚   â””â”€â”€ precompute/                â† Python script for HA-side data prep
â”‚   â”‚
â”‚   â””â”€â”€ tmdb-tv/                       â† @broadsheet/tmdb-tv plugin
â”‚       â”œâ”€â”€ package.json
â”‚       â”œâ”€â”€ src/index.ts
â”‚       â””â”€â”€ src/TvContentSection.svelte
â”‚
â”œâ”€â”€ examples/
â”‚   â””â”€â”€ broadsheet.json.example        â† reference curation file, fully commented
â”‚   #  nginx / caddy / traefik examples deferred to v0.2 (Docker path)
â”‚
â””â”€â”€ docs/
    â”œâ”€â”€ ARCHITECTURE.md                â† this document, generalised
    â”œâ”€â”€ PLUGINS.md                     â† write-your-own
    â”œâ”€â”€ DEPLOYMENT.md
    â””â”€â”€ DESIGN-LANGUAGE.md             â† the four-font / register / token system
```

Workspace via `pnpm` (or npm workspaces) â€” `@broadsheet/core` consumes
plugins as optional peer-deps; the Docker image bakes in the trio above
by default.

---

## Migration path: harold-home â†’ broadsheet

Not "rewrite from scratch." Most of harold-home's code is already
shape; the curation lives mostly in `house.json` + a few
hard-coded entity references. Concrete extraction order:

### Stage 1 â€” Build the discovery layer (in-place in harold-home)

1. Add `src/lib/discovery/` directory, all four files
2. Wire `DiscoveryStore` alongside the existing `entityStore` (don't
   replace, run in parallel for safety)
3. Build `Area` + `Person` projection
4. Verify against our actual house: every harold-home page should be
   able to render from the discovery model with identical output to
   the house.json-driven render.

**Outcome of stage 1**: harold-home works exactly as today, but
internally the discovery layer is proven against our real install.

### Stage 2 â€” Convert pages to discovery-first

Page by page, swap `lightingRooms()` (house.json filter) for
`discovery.areas.filter(a => a.hasLighting)`. The harold-home
`house.json` continues to provide the curation overrides via the new
layer 3.

Edit `house.json` â†’ produce a `broadsheet.json` from it via a one-time
migration script. They become the same shape.

### Stage 3 â€” Extract plugins

Move `static/immaterials/` â†’ `packages/emanations/`.
Move `static/exposure/` â†’ `packages/ghost-cloud/`.
Move `src/lib/tmdb.ts` + the `/tv` content section â†’ `packages/tmdb-tv/`.

Each plugin gets its own `package.json` + index.ts that registers via
the plugin contract.

`@broadsheet/core` no longer depends on these directly â€” the
harold-home install adds them as workspace deps.

### Stage 4 â€” Build Settings UI

The visual editor over `broadsheet.json`. Replace the file-only flow
with in-app management. The file remains the persistence layer.

### Stage 5 â€” Strip Harold Road specifics

The voice strings, the painting set, the address references, the
Harold-Road-only entity IDs â†’ all becomes example data, none ships in
core.

### Stage 6 â€” Build the HA add-on

A Dockerfile that bundles `@broadsheet/core` + nginx + the tiny
sidecar service. nginx proxies `/api/*` and `/local/*` to
`http://supervisor/core/` with `Authorization: Bearer ${SUPERVISOR_TOKEN}`
injected as a request header â€” the SPA never sees a token, never
pastes one. Full mock at `ADDON-MOCK.md`.

### Stage 7 â€” First public release

`v0.1.0` of `broadsheet`, shipped as an HA add-on via custom Supervisor
repository. README is the doc we drafted (with v0.1's add-on-only
positioning). GitHub repo + GHCR-hosted multi-arch images +
`addon` repository for users to add. GitHub Discussions for
community feedback. Docker / standalone path deferred to v0.2 gated on
issue-volume demand signal.

harold-home itself becomes a "thin downstream" of broadsheet â€” just
the personal `broadsheet.json` + paintings + custom Eyebrow voice.

---

## What this commits us to

- **A monorepo** (pnpm workspaces or similar) â€” bigger build matrix
- **Maintained release cadence** â€” at least one substantive update per
  quarter, more if PRs land
- **Public Discord or Discussions** â€” the ha-fusion experience shows the
  audience expects responsiveness; if we go silent for 12 months,
  someone forks us
- **Versioned plugin contract** â€” once plugins are a thing, breaking
  the API hurts users; semver discipline matters
- **CI** â€” lint + build + headless test against a known-shape mock HA
- **One-line install** â€” the HA add-on path has to actually work end-to-end
  on a clean HA install, not just on our box

This is a real project, not a weekend dump. The audience exists; the
slot is open; the editorial register is genuinely uncovered. Worth
doing if we're committed to maintaining it.

---

## Estimated effort

- Stage 1 (discovery layer): **2â€“3 days** focused
- Stage 2 (page conversion): **1â€“2 days** per page Ã— 6 pages = **~1 week**
- Stage 3 (plugin extraction): **2â€“3 days** per plugin Ã— 3 = **~1 week**
- Stage 4 (Settings UI): **1 week**
- Stage 5 (strip personal): **2 days**
- Stage 6 (HA add-on): **2â€“3 days**
- Stage 7 (release prep, README polish, screenshots, docs): **3 days**

**Total: ~5â€“6 weeks of focused work** to a credible v0.1.0.

Phased over evenings + weekends: realistically **3 months** elapsed.
