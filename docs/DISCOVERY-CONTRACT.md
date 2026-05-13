# broadsheet â€” discovery contract (Layer 1)

The most load-bearing spec in the architecture. Layer 1 is the source
of truth for everything Layer 2 derives and everything Layer 3
overrides. If this contract is wrong, every page is wrong.

This document defines:
- Which HA WebSocket commands we send at boot
- Which subscriptions we keep open continuously
- The TypeScript types for what we expose to Layer 2
- The connection lifecycle and error handling
- Safety: how reads stay isolated from writes

Read alongside:
- `ARCHITECTURE.md` (the three-layer overview)
- `PREMORTEM-DIFF.md` (research findings on subscribe_entities,
  Floors, Labels)

---

## Library choice: `home-assistant-js-websocket`

We do **not** roll our own WebSocket client. We use the canonical
`home-assistant-js-websocket` library (the same one HA's own frontend
uses â€” MIT, ~30KB gzipped).

Why:
- Implements `subscribe_entities` (compressed delta protocol) correctly,
  including cache replay on reconnect
- Reconnect logic with exponential backoff is the canonical version
- Auth flow (LLAT + OAuth) for free
- Massively less code in our repo to maintain

What we wrap around it:
- Heartbeat layer (30s ping / 10s pong-timeout / force-close on
  zombie) â€” the library's reconnect handles network drops, but TCP
  zombies (HA processes alive but unresponsive) need our application-
  level liveness check. We learned this in harold-home.
- Audit log wrapper for all `call_service` invocations
- Read-only mode wrapper for dev environments (see
  DEV-ENVIRONMENTS)
- Reactive store layer using Svelte 5 runes (`$state`, `$derived`)

---

## Boot sequence

In strict order, on every connect (initial + reconnect):

```ts
// src/lib/discovery/registries.ts

async function bootDiscovery(connection: Connection) {
  // 1. Auth handshake â€” handled by library based on env (Supervisor
  //    token in add-on, LLAT in dev/Docker).

  // 2. Pull all six registries in parallel â€” these are stable
  //    snapshots, not subscriptions.
  const [
    floors,
    areas,
    devices,
    entities,
    labels,
    categories,
  ] = await Promise.all([
    connection.sendMessagePromise<Floor[]>({ type: 'config/floor_registry/list' }),
    connection.sendMessagePromise<Area[]>({ type: 'config/area_registry/list' }),
    connection.sendMessagePromise<Device[]>({ type: 'config/device_registry/list' }),
    // Use list_for_display first (lighter, faster cold-boot paint)
    connection.sendMessagePromise<EntityForDisplay[]>({ type: 'config/entity_registry/list_for_display' }),
    connection.sendMessagePromise<Label[]>({ type: 'config/label_registry/list' }),
    connection.sendMessagePromise<Category[]>({ type: 'config/category_registry/list' }),
  ]);

  // 3. Open the entity-state subscription (compressed deltas).
  //    Library handles cache + replay-on-reconnect.
  const unsubEntities = await subscribeEntities(connection, (entities) => {
    discoveryStore.states = entities;
  });

  // 4. Open registry-update subscriptions. These fire when HA's
  //    registries change (new area added, entity renamed, etc.).
  const unsubAreaUpdates = connection.subscribeEvents(
    () => refreshRegistry('area'),
    'area_registry_updated'
  );
  // ...same for device, entity, floor, label, category, person

  // 5. Lazy: full entity_registry/list (heavier but has all fields).
  //    Fire after first paint; merge into store when it lands.
  setTimeout(async () => {
    const fullEntities = await connection.sendMessagePromise<Entity[]>({
      type: 'config/entity_registry/list',
    });
    discoveryStore.entitiesFull = fullEntities;
  }, 0);
}
```

### What we're explicitly NOT doing

- **Not** using `get_states` + `state_changed` events. The compressed
  delta protocol is more efficient and the library handles it.
- **Not** subscribing to `state_changed` separately. `subscribe_entities`
  covers state changes.
- **Not** calling `config/entity_registry/list` synchronously on first
  paint. `list_for_display` is faster; the full list arrives async.
- **Not** subscribing to `service_registered` / `service_removed`. We
  don't need to know about HA's available services dynamically â€” we
  call known services and handle errors when they 404.

---

## TypeScript types

The shape Layer 2 consumes. These should mirror HA's own types where
possible â€” copy from
`home-assistant/frontend/src/data/{area,floor,label,entity,device}_registry.ts`
into `packages/core/src/lib/ha/types.ts` directly.

### Layer 1 raw types (mirror HA exactly)

```ts
// src/lib/ha/types.ts

export interface Floor {
  floor_id: string;
  name: string;
  level: number | null;
  icon: string | null;
  aliases: string[];
}

export interface Area {
  area_id: string;
  name: string;
  floor_id: string | null;     // FK to Floor
  icon: string | null;
  picture: string | null;       // path to /local/...
  aliases: string[];
  labels: string[];             // FKs to Label.label_id
}

export interface Device {
  id: string;                   // device_id
  name: string | null;          // user-set
  name_by_user: string | null;  // user override
  model: string | null;
  manufacturer: string | null;
  area_id: string | null;       // FK to Area
  config_entries: string[];
  connections: [string, string][];
  identifiers: [string, string][];
  via_device_id: string | null;
  disabled_by: 'user' | 'integration' | 'config_entry' | null;
  hidden_by: 'user' | 'integration' | null;
  entry_type: 'service' | null;
  labels: string[];
}

export interface Entity {
  entity_id: string;
  device_id: string | null;     // FK to Device
  area_id: string | null;       // FK to Area (overrides device.area_id)
  name: string | null;          // composed name suffix when has_entity_name=true
  has_entity_name: boolean;     // see name composition rules below
  original_name: string | null; // integration-set, before user override
  icon: string | null;
  original_icon: string | null;
  device_class: string | null;
  unit_of_measurement: string | null;
  platform: string;             // integration name (e.g. 'mqtt', 'zha')
  hidden_by: 'user' | 'integration' | null;
  disabled_by: 'user' | 'integration' | 'config_entry' | 'device' | null;
  entity_category: 'config' | 'diagnostic' | null;
  translation_key: string | null;
  options: Record<string, any>;
  labels: string[];
  categories: Record<string, string>;  // categoryId â†’ entity classification
}

export interface Label {
  label_id: string;
  name: string;
  icon: string | null;
  color: string | null;        // hex
  description: string | null;
}

export interface Category {
  category_id: string;
  scope: string;               // e.g. 'automation', 'script'
  name: string;
  icon: string | null;
}

export interface State {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;        // ISO
  last_updated: string;        // ISO
  context: { id: string; parent_id: string | null; user_id: string | null };
}

export interface Person {
  entity_id: string;           // person.X
  name: string;
  user_id: string | null;
  device_trackers: string[];   // FKs to device_tracker entities
  picture: string | null;
}
```

### Layer 1 store shape

```ts
// src/lib/discovery/store.svelte.ts
import { $state } from 'svelte';

class DiscoveryStore {
  // Connection
  status     = $state<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'fatal'>('idle');
  lastError  = $state<string | null>(null);
  lastConnectAt = $state<Date | null>(null);

  // Registries (snapshots, refreshed on *_registry_updated events)
  floors     = $state<Floor[]>([]);
  areas      = $state<Area[]>([]);
  devices    = $state<Device[]>([]);
  entities   = $state<Entity[]>([]);   // starts as list_for_display, replaced with full list
  labels     = $state<Label[]>([]);
  categories = $state<Category[]>([]);
  persons    = $state<Person[]>([]);

  // Live state (driven by subscribe_entities deltas)
  states     = $state<Record<string, State>>({});
}
```

The store is exported as a singleton. Consumers (Layer 2 derived
projections, page components) subscribe via `$derived` and re-run
automatically when any field changes.

### Layer 2 projected types

```ts
// src/lib/discovery/domain.ts

export interface DomainFloor {
  id: string;
  name: string;
  level: number | null;
  icon: string | null;
  areas: DomainArea[];      // populated areas only
}

export interface DomainArea {
  id: string;
  name: string;             // post-curation: rename overrides apply here
  icon: string | null;
  picture: string | null;
  floor: DomainFloor | null;
  labels: Label[];          // hydrated from area.labels FKs

  // Entities pre-grouped by intended page
  lights:    DomainEntity[];
  switches:  DomainEntity[];   // filtered to lighting via heuristic
  climates:  DomainEntity[];
  locks:     DomainEntity[];
  contacts:  DomainEntity[];   // binary_sensor.*_door / *_window
  cameras:   DomainEntity[];
  media:     DomainEntity[];
  remotes:   DomainEntity[];
  sensors:   DomainEntity[];   // misc â€” temperature, humidity, lux

  // Computed flags (drive page filtering)
  hasLighting:   boolean;
  hasClimate:    boolean;
  hasMedia:      boolean;
  hasLockOrDoor: boolean;
  hasCamera:     boolean;
}

export interface DomainEntity {
  id: string;                  // entity_id
  name: string;                // composed (see naming rules below)
  domain: string;              // light, climate, lock, ...
  state: State | null;         // current state from states map; null if unavailable
  area: DomainArea | null;     // resolved via entity.area_id || device.area_id
  device: Device | null;
  labels: Label[];
  hidden: boolean;             // computed: hidden_by !== null OR curation override
  warningLabel: string | null; // from Layer 3 curation
  disabled: boolean;           // entity.disabled_by !== null
  entityCategory: 'config' | 'diagnostic' | null;
}

export interface DomainPerson {
  id: string;                  // person entity_id
  name: string;
  presenceSensorId: string | null;  // user-chosen via curation
  presenceState: 'home' | 'away' | 'unknown';
  presenceArea: DomainArea | null;  // current room if known
  deviceClass: 'android' | 'ios' | 'unknown';
  warnings: string[];          // e.g. "iOS Companion App may suspend GPS"
}
```

### Discovery results exposed to pages

```ts
// src/lib/discovery/index.ts

export const discovery = {
  // Layer 2 outputs
  floors:     $derived(projectFloors(store)),
  areas:      $derived(projectAreas(store, curation)),
  persons:    $derived(projectPersons(store, curation)),

  // Helpers pages use
  unsortedFor:  (kind: 'lighting' | 'climate' | ...) => DomainEntity[],
  pinnedTo:     (page: string) => DomainEntity[],
  byEntityId:   (id: string) => DomainEntity | null,
  byAreaId:     (id: string) => DomainArea | null,

  // Connection state passthrough
  status:    $derived(store.status),
  lastError: $derived(store.lastError),
};
```

---

## Naming composition rules

Entity friendly names compose differently based on `has_entity_name`.
The projection in Layer 2 must apply these correctly â€” `state.attributes.friendly_name`
is **untrustworthy** for layout decisions because it's translation-swapped.

```ts
function composeEntityName(entity: Entity, device: Device | null): string {
  // Layer 3 user override wins
  if (curation.entities[entity.entity_id]?.rename) {
    return curation.entities[entity.entity_id].rename!;
  }

  if (entity.has_entity_name) {
    if (entity.name === null) {
      // Entity IS the device's main feature â†’ friendly = device name
      return device?.name_by_user ?? device?.name ?? entity.entity_id;
    } else {
      // Composed: "<Device> <Entity.name>"
      const deviceName = device?.name_by_user ?? device?.name ?? '';
      return deviceName ? `${deviceName} ${entity.name}` : entity.name;
    }
  }

  // Legacy: friendly_name from integration, with state.attributes
  // fallback (best effort â€” translations may swap this)
  return (
    entity.name
    ?? state.attributes?.friendly_name
    ?? prettifyEntityId(entity.entity_id)
  );
}
```

The `prettifyEntityId` fallback turns `light.0xa4c138b33a932eb2` into
`Light 0xa4c138...` (truncated, code-mono in the UI). The Settings UI
then prompts the user to rename.

---

## Entity â†’ Area resolution

Two-path fallback: entity's own `area_id` overrides device's `area_id`,
but if entity's is null, fall back to device's. Many integrations
don't set entity area, so device area is the common case.

```ts
function resolveArea(entity: Entity, devices: Device[], areas: Area[]): Area | null {
  // Path 1: entity has explicit area_id
  if (entity.area_id) {
    return areas.find(a => a.area_id === entity.area_id) ?? null;
  }

  // Path 2: fall back to device's area_id
  if (entity.device_id) {
    const device = devices.find(d => d.id === entity.device_id);
    if (device?.area_id) {
      return areas.find(a => a.area_id === device.area_id) ?? null;
    }
  }

  // Unsorted bucket
  return null;
}
```

---

## Filtering rules

What gets shown vs hidden vs unsorted:

```ts
function shouldShowEntity(entity: Entity, curation: Curation): 'show' | 'hidden' | 'skipped' {
  // SKIP entirely (not even in Unsorted): disabled or system-internal
  if (entity.disabled_by !== null) return 'skipped';
  if (entity.entity_category === 'config') return 'skipped';
  if (entity.entity_category === 'diagnostic') return 'skipped';

  // HIDDEN by HA's hidden_by (default-hide, curation can un-hide)
  if (entity.hidden_by !== null) {
    const override = curation.entities[entity.entity_id]?.unhide;
    return override ? 'show' : 'hidden';
  }

  // HIDDEN by user curation
  if (curation.entities[entity.entity_id]?.hidden) return 'hidden';

  // SHOW
  return 'show';
}
```

`/settings/house` lets the user view everything in three buckets:
visible / hidden / skipped. The user can move things between visible
and hidden; skipped entities show a "(disabled in HA)" or "(system
entity)" tag and require enabling in HA itself.

---

## Heuristics

Where automatic decisions happen. All heuristics produce overridable
suggestions â€” the user can pin / hide / move via Settings.

### Lighting-switch detection

Some `switch.*` entities are physically lights (smart plugs powering
lamps). Heuristic for inclusion in the `/lights` page:

```ts
function isLightingSwitch(entity: Entity, device: Device | null, area: Area | null): boolean {
  // Strong signal: device class
  if (entity.device_class === 'outlet' && entity.entity_id.includes('lamp')) return true;

  // Name-based: "lamp", "light", "lights"
  const name = composeEntityName(entity, device).toLowerCase();
  if (/\b(lamp|light|lights)\b/.test(name)) return true;

  // User curation override
  if (curation.pagePins[entity.entity_id] === 'lights') return true;

  return false;
}
```

User curation can pin or unpin via `/settings/house â†’ entity â†’ page`.

### Presence sensor picking

Per person, rank candidates and recommend the best. Algorithm:

```ts
function rankPresenceSensors(person: Person, allEntities: Entity[]): RankedSensor[] {
  const candidates: RankedSensor[] = [];

  // Tier 1: server-side committed_room sensor (most reliable, post-fusion)
  const committed = allEntities.find(e =>
    e.entity_id === `sensor.${person.name.toLowerCase()}_committed_room`
  );
  if (committed) candidates.push({ entity: committed, tier: 1, badge: 'â˜… best', reason: 'server-side fusion' });

  // Tier 2: BLE device trackers (more reliable than GPS for in-house)
  for (const trackerId of person.device_trackers) {
    if (trackerId.endsWith('_ble') || trackerId.endsWith('_private_ble')) {
      candidates.push({ entity: allEntities.find(e => e.entity_id === trackerId)!, tier: 2, badge: 'ble', reason: 'BLE in-house' });
    }
  }

  // Tier 3: GPS device trackers (least reliable)
  for (const trackerId of person.device_trackers) {
    if (!trackerId.endsWith('_ble')) {
      const e = allEntities.find(e => e.entity_id === trackerId);
      if (e) {
        const isIos = e.platform === 'mobile_app' && /iphone|ipad/i.test(e.entity_id);
        candidates.push({
          entity: e,
          tier: 3,
          badge: 'gps',
          reason: isIos ? 'iOS â€” Companion App may suspend GPS' : 'Android GPS',
          warning: isIos,
        });
      }
    }
  }

  // Tier 4 (worst): person aggregation (can lie if any underlying tracker stuck)
  const personEntity = allEntities.find(e => e.entity_id === person.entity_id);
  if (personEntity) {
    candidates.push({
      entity: personEntity,
      tier: 4,
      badge: 'aggregate',
      reason: 'aggregates all trackers â€” can lie if any stuck',
      warning: true,
    });
  }

  return candidates.sort((a, b) => a.tier - b.tier);
}
```

The Settings UI shows the ranked list with reasons; the top non-warning
candidate gets the `â˜… best` badge. User picks; their pick is
persisted in curation.

### TV detection

```ts
function isTV(entity: Entity, state: State | null): boolean {
  if (entity.entity_id.startsWith('media_player.')) {
    if (state?.attributes?.device_class === 'tv') return true;
    if (/tv|television/i.test(composeEntityName(entity, null))) return true;
  }
  return false;
}
```

### Health-Connect sensor pattern

Pattern-match Pixel/Health-Connect sensors for `/body`:

```ts
const HEALTH_CONNECT_PATTERNS = [
  /^sensor\.pixel_.*_(sleep|heart|hrv|oxygen|body_temperature|respiratory)/,
  // future: Apple Health bridge patterns
];

function isHealthConnect(entity: Entity): boolean {
  return HEALTH_CONNECT_PATTERNS.some(p => p.test(entity.entity_id));
}
```

---

## Connection lifecycle

States and transitions:

```
idle â†’ connecting â†’ connected
                       â†“ (network drop or pong timeout)
                   reconnecting â†’ connected (loop)
                       â†“ (5+ failed reconnects in 60s)
                   fatal (user must intervene)
```

```ts
// src/lib/ha/client.ts

class HAClient {
  private heartbeatInterval: number | null = null;
  private pongTimeout: number | null = null;
  private reconnectAttempts = 0;
  private connection: Connection | null = null;

  async connect(auth: Auth): Promise<void> {
    discoveryStore.status = 'connecting';
    try {
      this.connection = await createConnection({ auth });
      this.connection.addEventListener('disconnected', () => this.onDisconnect());
      this.connection.addEventListener('reconnect-error', (err) => {
        discoveryStore.lastError = `reconnect failed: ${err}`;
      });
      await bootDiscovery(this.connection);
      this.startHeartbeat();
      discoveryStore.status = 'connected';
      discoveryStore.lastConnectAt = new Date();
      discoveryStore.lastError = null;
      this.reconnectAttempts = 0;
    } catch (err) {
      discoveryStore.status = 'fatal';
      discoveryStore.lastError = String(err);
      throw err;
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => this.sendPing(), 30_000);
  }

  private sendPing() {
    if (!this.connection) return;
    this.pongTimeout = setTimeout(() => {
      console.warn('[broadsheet] zombie WS detected â€” force-closing');
      this.connection?.close();  // triggers onDisconnect â†’ reconnect
    }, 10_000);
    this.connection.ping().then(() => {
      if (this.pongTimeout) clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    });
  }

  private onDisconnect() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.heartbeatInterval = null;
    this.pongTimeout = null;
    discoveryStore.status = 'reconnecting';
    this.reconnectAttempts++;
    if (this.reconnectAttempts > 5) {
      discoveryStore.status = 'fatal';
      discoveryStore.lastError = 'too many reconnect failures';
    }
    // Library handles actual reconnect via createConnection's setupRetry
  }
}
```

### What surfaces to the user

- **idle**: setup screen
- **connecting**: small "connectingâ€¦" indicator in the chrome
- **connected**: nothing â€” the UI just works
- **reconnecting**: "Reconnecting to the house" banner. Non-blocking,
  pages still render with stale state.
- **fatal**: full-screen error with diagnose button (runs the
  connection diagnostic from `/settings/about`)

---

## Refresh patterns

Different data has different freshness needs:

| Data | Trigger | Refresh action |
|---|---|---|
| Entity states | `subscribe_entities` delta | Apply delta to `states` map |
| Area registry | `area_registry_updated` event | Re-pull `config/area_registry/list` |
| Device registry | `device_registry_updated` event | Re-pull `config/device_registry/list` |
| Entity registry | `entity_registry_updated` event | Re-pull `config/entity_registry/list` (NOT `_for_display`) |
| Floor registry | `floor_registry_updated` event | Re-pull `config/floor_registry/list` |
| Label registry | `label_registry_updated` event | Re-pull `config/label_registry/list` |
| Category registry | `category_registry_updated` event | Re-pull `config/category_registry/list` |
| Person entities | `person.X` state change OR registry update | Re-pull persons via `config/person/list` |

All registry refreshes debounce with a 500ms trailing edge so a flurry
of events (e.g. user mass-renaming entities) doesn't trigger N+1
re-pulls.

---

## Error handling

### Service call failures

```ts
async function callService(...): Promise<{ success: boolean; error?: string }> {
  // ...readonly + audit checks...
  try {
    await connection.sendMessagePromise({ type: 'call_service', ... });
    return { success: true };
  } catch (err) {
    auditLog('call-service-error', { ..., error: String(err) });
    showToast(`Couldn't ${service.replace('_', ' ')}: ${err}`, 'error');
    return { success: false, error: String(err) };
  }
}
```

### WS message parse errors

The library handles this. We log via `connection.addEventListener('reconnect-error', ...)`.

### Registry pull failures

If a single registry pull fails at boot, log + retry once. If it
fails twice, mark `discoveryStore.status = 'fatal'` with a specific
error. Better to fail loud than render half a house.

### Subscribe replay drift

After reconnect, `subscribe_entities` replays the cache. There's a
window where our `states` map has stale data until the replay completes.
The library handles this â€” we trust it. If we observe drift in
practice, log + investigate.

---

## What we publish to Layer 2

Layer 2 only depends on `discovery.*` from `src/lib/discovery/index.ts`.
The internal store (`discoveryStore`) is implementation detail. Layer 2
never directly touches the WebSocket client, the library types, or
the connection lifecycle.

This is the contract:

```ts
// What Layer 2 imports
import { discovery } from '$lib/discovery';

// Available:
discovery.areas        // DomainArea[]
discovery.floors       // DomainFloor[]
discovery.persons      // DomainPerson[]
discovery.unsortedFor(kind)
discovery.pinnedTo(page)
discovery.byEntityId(id)
discovery.byAreaId(id)
discovery.status       // 'idle' | 'connecting' | ...
discovery.lastError

// Forbidden:
import { discoveryStore } from '$lib/discovery/store';   // âŒ internal
import { connection } from '$lib/ha/client';              // âŒ internal
```

This separation lets us swap the underlying client (`home-assistant-js-websocket`
â†’ something else, hypothetically) without touching any page code.

---

## Test surface

Things the discovery contract MUST handle correctly. These become test
cases in M2.

1. **Empty HA**: zero areas, zero entities. `discovery.areas == []`,
   `discovery.floors == []`. No crash. Pages show graceful empty states.
2. **HA with entities but no areas**: all entities in `Unsorted`.
3. **HA with areas but no floors**: all areas under "Unassigned floor"
   bucket OR floor-grouping collapsed if `floor_count == 1`.
4. **Entity with `area_id == null` but `device.area_id != null`**:
   resolves to device's area (fallback path).
5. **Entity with `area_id != null` overriding `device.area_id`**:
   wins over device.
6. **Entity with `hidden_by: integration` and curation
   `entities.X.unhide: true`**: shows up.
7. **Entity with `disabled_by != null`**: doesn't appear anywhere.
8. **Entity with `entity_category: 'diagnostic'`**: hidden from primary
   pages, available in `/settings/house` view-all.
9. **Entity with `has_entity_name: true` and `name: 'Pendant'`**:
   composed name = `<Device> Pendant`.
10. **Entity with `has_entity_name: true` and `name: null`**: composed
    name = `<Device>`.
11. **Entity with `has_entity_name: false`**: legacy name from
    integration.
12. **HA renames an area**: discovery picks it up within 5s, all pages
    update headers.
13. **HA adds a new area**: appears in discovery within 5s, populates
    on relevant pages.
14. **HA removes an area**: disappears from discovery within 5s, no
    crash on pages that were rendering it.
15. **WebSocket disconnect**: heartbeat detects within 40s, status
    flips to `reconnecting`, pages keep rendering with stale state,
    auto-reconnects when HA returns.
16. **Service call fails (entity unavailable)**: error toast, audit
    logged, no crash.
17. **`subscribe_entities` cache replay after reconnect**: states map
    converges to current truth without manual intervention.
