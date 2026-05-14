# broadsheet — renderer / plugin contract

The plugin API. **As of P0 (the plugin-system build track) this is a
spec, not a sketch** — the `BroadsheetPlugin` interface in
`packages/core/src/lib/plugins/types.ts` is the machine-readable
source of truth; this document is the prose around it.

The contract is **frozen at v0.1**: within semver-minor releases of
`@broadsheet/core`, no field is removed and no new *required* field is
added. New capability arrives only as new *optional* fields. See
"Version compatibility" below.

Read alongside:
- `packages/core/src/lib/plugins/types.ts` (the interface itself)
- `ARCHITECTURE.md` (plugin system in the three-layer model)
- `PREMORTEM-DIFF.md` (the Lovelace-strategy reusability hint)

---

## What plugins are for

Plugins extend broadsheet with:
1. **New pages** — a whole new top-level route (`/emanations`,
   `/long-take`)
2. **New renderers** — components a page can use opportunistically
   (multi-person painting on `/`, TMDB content rows on `/tv`)
3. **New Settings panels** — plugin-specific config UI
4. **New discovery contributors** — read additional HA data the core
   doesn't (e.g. ghost-cloud reads radar event JSON)

Plugins must NOT:
- Modify Layer 1 or Layer 2 of the core
- Replace core pages
- Inject styles globally
- Make service calls outside the read-only / audit-log envelope

---

## Three first-class plugins (extracted from harold-home)

| Plugin | Delivers | Activates when |
|---|---|---|
| `@broadsheet/emanations` | Multi-person presence painting renderer + `/emanations` page | ≥2 people with a presence sensor picked |
| `@broadsheet/ghost-cloud` | 24-hour radar event playback (water-membrane time-tube) + `/long-take` page | radar-precompute JSON present at `/local/exposure/data/<room>.json` |
| `@broadsheet/tmdb-tv` | TMDB-driven content rows on `/tv` | `integrations.tmdb.apiKey` set in curation |

Each is a separate workspace package, enabled per
`broadsheet.json → plugins.<id>.enabled`.

---

## Bundling model

> **This revises a BUILD-PLAN principle.** BUILD-PLAN.md states the
> three plugins ship "not bundled into core". That wording assumed a
> runtime ESM loader — which is explicitly v0.2 scope. For the v0.1
> add-on, which is a single `adapter-static` SPA build with no runtime
> module loading, the honest model is:

The three first-class plugins are **`workspace:*` dependencies of
`@broadsheet/core`**. `core/src/lib/plugins/registry.ts` statically
imports each plugin's `index.ts` (a plain, side-effect-free object).
`pnpm --filter @broadsheet/core build` therefore builds them
transitively.

Every heavy component sits behind a `LazyComponent` thunk
(`() => import('./pages/Foo.svelte')`), so Vite **code-splits it into
its own chunk** — downloaded by the browser only when the plugin is
actually active. The `enabled` curation flag gates **registration, not
bundling**: a disabled plugin's chunks are present in the image but
never fetched.

The v0.2 story — runtime plugin install behind a signed allowlist —
remains "not bundled". v0.1 is "bundled, lazy-chunked, curation-gated".

### v0.1 → v0.2 evolution — one seam

`core/src/lib/plugins/registry.ts` is the **only** bundling-aware
module. It produces a `BroadsheetPlugin[]`; everything downstream —
the loader, the `[pluginSlug]` route, KebabNav, `useRenderer`,
`/settings/plugins` — consumes that array and has no idea where a
plugin came from.

v0.2 extends `registry.ts` with a *second* code path: fetch +
dynamic-`import()` of third-party plugin bundles behind a signed
allowlist, merged into the same array. Nothing else changes. The
first-class trio stays statically bundled; third-party plugins are
runtime-installed and **never** bundled — so "only our core plugins
ship in the bundle" stays true by construction. The contract
(`BroadsheetPlugin`) is bundling-agnostic, so a plugin written for
v0.1 runs unchanged in v0.2. `pluginAssetUrl` already abstracts asset
URLs; the `enabled` curation flag works identically; v0.2 adds only
*optional additive* curation fields (`source`, `installUrl`).

**The whole v0.1 → v0.2 evolution is: extend `registry.ts`, touch
nothing else.**

---

## Routing model

Plugin pages get **top-level routes**: `/emanations`, `/long-take`.
This matches the contract's intent and harold-home's existing URLs.

SvelteKit routes are file-based and a plugin package can't write into
`core/src/routes/`. So core ships one **catch-all dynamic route** —
`src/routes/[pluginSlug]/+page.svelte` — whose logic:

1. Looks `pluginSlug` up in the active-plugin page registry.
2. If found + the page's `visibleWhen` passes → renders the plugin's
   lazy `component` inside an error boundary.
3. Otherwise → `error(404)`.

SvelteKit route specificity guarantees static core routes
(`/lights`, `/settings`, …) always win over `[pluginSlug]`. A plugin
page slug that collides with `RESERVED_ROUTE_SLUGS` is rejected by the
loader (`load-error` status) — it would be unreachable anyway.

**One slug = one page.** A plugin with internal sub-views (ghost-cloud
has per-room views) does its own sub-navigation inside its page
component via query params (`/long-take?r=office`) — exactly as
harold-home already does. The routing contract stays flat.

nginx needs no change for plugin routes — `/emanations` already
SPA-falls-back to `index.html`, the client router resolves
`[pluginSlug]`. (nginx *does* change for plugin **static assets** —
see "Static asset shipping".)

---

## Plugin shape

A plugin package's `src/index.ts` exports `const plugin:
BroadsheetPlugin`. The full interface is in
`packages/core/src/lib/plugins/types.ts`; abbreviated:

```ts
import type { BroadsheetPlugin } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
  id: 'emanations',
  version: '0.1.0',
  displayName: 'Emanations',
  description: 'Multi-person presence painting',

  pages: [
    {
      slug: 'emanations',
      label: 'Emanations',
      icon: 'mdi:map-marker-radius',
      navOrder: 50,
      visibleWhen: (discovery) =>
        discovery.persons.filter((p) => p.suggestedPresenceSensor).length >= 2,
      component: () => import('./pages/EmanationsPage.svelte')
    }
  ],

  renderers: {
    'multi-person-painting': () => import('./renderers/MultiPersonPainting.svelte')
  },

  settingsPanel: {
    label: 'Emanations',
    icon: 'mdi:image',
    component: () => import('./settings/EmanationsSettings.svelte')
  },

  staticAssets: 'static/',

  discoveryContributors: [/* … */],

  onActivate: async (ctx) => { /* ctx.discovery, ctx.config */ },
  onDeactivate: async () => {}
};
```

### Two hard rules on `index.ts`

1. **No side effects at module-eval time.** It exports a plain
   object. All heavy code is behind `LazyComponent` thunks.
2. **`import type` from `@broadsheet/core` only — never a runtime
   import.** core imports the plugin (via `registry.ts`); a runtime
   back-import would create an execution cycle. Type imports are
   erased at compile, so `import type` is safe and is how a plugin
   references `BroadsheetPlugin`, `DomainPerson`, etc.

---

## `@broadsheet/core` export surface

Plugins import everything from the package root. The surface is built
out across the plugin-system phases:

| Available from | Exports |
|---|---|
| **P0** — contract freeze | `BroadsheetPlugin` + all contract types, the discovery domain types (`DomainArea`, `DomainEntity`, `DomainFloor`, `DomainPerson`, `PageSlug`), `State`, `RESERVED_ROUTE_SLUGS`, `VERSION` |
| **P1** — loader + routing | `discovery` singleton, UI primitives `PageShell` / `Hero` / `Eyebrow` / `OutLine` |
| **P2** — settings/plugins + renderers | `useRenderer` |
| **P3** — contributors + assets | `pluginAssetUrl` |
| **P4** — settings panels | `useCurationField`, `SettingsRow` |

---

## Page contract

Plugin pages use the same `PageShell` / `Hero` / `Eyebrow` primitives
as core pages:

```svelte
<!-- @broadsheet/emanations/src/pages/EmanationsPage.svelte -->
<script lang="ts">
  import { discovery, PageShell, Hero, Eyebrow } from '@broadsheet/core';
  import MultiPersonPainting from '../renderers/MultiPersonPainting.svelte';

  const persons = $derived(discovery.persons);
</script>

<PageShell width="bleed">
  <Hero>
    {#snippet eyebrow()}<Eyebrow section="emanations" />{/snippet}
    {#snippet headline()}Where everyone is.{/snippet}
  </Hero>
  <MultiPersonPainting {persons} />
</PageShell>
```

The page imports the public `discovery.*` façade + UI primitives —
never core internals (`discoveryStore`, `connection`, the curation
store).

---

## Renderer contract

A renderer is a Svelte component a plugin exposes for use by other
code — its own pages, core pages, or other plugins.

```svelte
<!-- @broadsheet/emanations/src/renderers/MultiPersonPainting.svelte -->
<script lang="ts">
  import type { DomainPerson } from '@broadsheet/core';

  // Renderers declare their inputs as props. They are pure
  // components — no side effects on mount beyond what props imply,
  // no mutation of shared state.
  let { persons }: { persons: DomainPerson[] } = $props();
</script>
```

Renderer IDs are kebab-case + descriptive (`multi-person-painting`,
`radar-time-tube`, `tmdb-content-row`). Pages reference them by ID via
`useRenderer` (available P2):

```svelte
<!-- core /+page.svelte -->
<script lang="ts">
  import { useRenderer } from '@broadsheet/core';
  // `.current` is the plugin's renderer when its plugin is active,
  // null otherwise. A getter, not a bare value — a Svelte 5 function
  // can't return a reactive primitive.
  const painting = useRenderer('multi-person-painting');
</script>

{#if painting.current}
  {@const Painting = painting.current}
  <Painting persons={discovery.persons} />
{:else}
  <ProceduralPainting />  <!-- core fallback -->
{/if}
```

This lets core pages opportunistically use plugin upgrades without
hard-depending on them.

---

## Activation contract

A plugin's runtime `PluginStatus` (surfaced in `/settings/plugins`):

| Status | Meaning |
|---|---|
| `active` | Enabled, activation checks pass, loaded OK |
| `enabled-inactive` | Enabled, but `visibleWhen` / activation checks don't pass yet |
| `disabled` | `plugins.<id>.enabled === false` |
| `errored` | A `discoveryContributor` threw — plugin runs, data degraded |
| `load-error` | Import threw, or the exported object failed contract validation (bad shape, reserved slug, duplicate id) |

A plugin is `active` when **all** hold:
1. The package is bundled into the add-on image.
2. `broadsheet.json → plugins.<id>.enabled === true`.
3. The plugin loaded without error AND its per-page `visibleWhen`
   (where present) returns true.

`enabled-inactive` is the **honesty escape hatch**: if a plugin is
enabled but its checks fail, `/settings/plugins` says *why*
("emanations: needs ≥2 people with presence sensors picked") rather
than the plugin silently doing nothing.

---

## Discovery contributor contract

Some plugins read HA data the core doesn't (ghost-cloud reads radar
JSON). They register `discoveryContributors`:

```ts
import type { DiscoveryContributor } from '@broadsheet/core';

const radarRooms: DiscoveryContributor = {
  id: 'ghost-cloud-radar-rooms',
  async contribute(ctx) {
    const rooms = [];
    for (const area of ctx.discovery.areas) {
      try {
        const res = await ctx.fetch(`/local/exposure/data/${area.id}.json`);
        if (res.ok) rooms.push({ areaId: area.id, data: await res.json() });
      } catch {
        // silent — plugin handles missing data gracefully
      }
    }
    return { radarRooms: rooms };
  }
};
```

Contributors run at boot + on registry updates. Their return value is
merged into `discovery.plugins[<plugin-id>]`:

```ts
const radarRooms = $derived(discovery.plugins['ghost-cloud']?.radarRooms ?? []);
```

Contributors are **sandboxed**:
- `ctx.fetch` is **same-origin only** (resolved against broadsheet's
  own origin, so ingress-prefixed correctly) — cross-origin requests
  reject. A contributor cannot exfiltrate.
- They cannot access the WebSocket connection directly.
- They cannot write the curation store.

A contributor that throws yields an empty contribution and flags the
plugin `errored` — it never crashes core.

---

## Settings panel contract

Plugins needing config register a `settingsPanel`. Its component is
shown at `/settings/plugins/<plugin-id>/config` when the plugin is
enabled, and binds to curation via `useCurationField` (P4 — landing
with the proof plugin's real config):

```svelte
<script lang="ts">
  import { useCurationField, SettingsRow } from '@broadsheet/core';
  const fadeMs = useCurationField('plugins.emanations.config.fadeMs');
</script>

<SettingsRow label="Cross-fade duration">
  <input type="number" bind:value={fadeMs.value} min={100} max={5000} />
  <span>ms</span>
</SettingsRow>
```

---

## Static asset shipping

A plugin ships static assets (paintings, JS modules, shaders, JSON,
fonts) by setting `staticAssets` to a directory relative to its
package root. The add-on build stages those directories into the
image and nginx serves them at `/local/<plugin-id>/*`:

```
@broadsheet/ghost-cloud/
├── package.json
├── src/
└── static/                       →  /local/ghost-cloud/*
    ├── ghost-cloud.js             →  /local/ghost-cloud/ghost-cloud.js
    └── shaders/water.frag         →  /local/ghost-cloud/shaders/water.frag
```

Plugin code references its own assets via `pluginAssetUrl` (P3),
which wraps path resolution so it works under HA Ingress AND direct
serving without the plugin knowing about ingress prefixes:

```ts
import { pluginAssetUrl } from '@broadsheet/core';
const fragShaderUrl = pluginAssetUrl('ghost-cloud', 'shaders/water.frag');
```

---

## Plugin error handling

The principle: **one plugin's failure cannot take down the rest of
broadsheet.**

- A plugin **render crash** is caught by a Svelte error boundary at
  the page / renderer-slot level. The slot shows a degraded chip
  ("Emanations renderer failed: <error>. [Disable plugin]") while the
  rest of the page keeps working. Logged to the audit log.
- A **`discoveryContributor` error** → that contribution silently
  returns empty, the plugin's status becomes `errored` in
  `/settings/plugins`, dependent renderers get the empty state.
- A **failed import** (package missing / syntax error / bad contract
  shape) → logged to console + audit log, plugin shows as
  `load-error` in `/settings/plugins`, other plugins keep working.

---

## Version compatibility

Each plugin declares its compatible core range via
`peerDependencies`:

```json
{
  "name": "@broadsheet/emanations",
  "version": "0.1.0",
  "peerDependencies": { "@broadsheet/core": "^0.1.0" }
}
```

In the v0.1 bundled model the plugins are built in lockstep with core,
so the range is satisfied by construction. The check becomes
load-bearing in v0.2 when runtime install arrives — a plugin needing a
newer core than installed shows as `load-error` with "needs
broadsheet ≥ X.Y.Z".

Semver discipline on the contract itself:
- **Patch (`0.1.x`)** — bug fixes only, plugins always work.
- **Minor (`0.x.0`)** — backwards-compatible *additions* to the
  contract (new optional fields), plugins always work.
- **Major (`x.0.0`)** — breaking changes; plugins need updates;
  CHANGELOG entry required.

For v0.1 the contract is pinned — no breaking changes until v1.0.

---

## Forward compatibility — Lovelace strategies (v0.2+)

The renderer contract — props-in / render-out, no side effects, no
core-internal access — maps cleanly onto Lovelace's strategy
interface. We don't build the Lovelace adapter in v0.1; we just don't
make choices that block it.

What that rules out for v0.1:
- Plugin renderers reaching into `discovery.*` directly (ties them to
  broadsheet's runtime) — they get props in.
- Plugin renderers calling `useRenderer` recursively without bounds.
- Plugin renderers mutating shared state.

---

## What shipping this contract commits us to

By shipping the contract in v0.1.0 we commit to:
- Maintaining `BroadsheetPlugin` compatibility within semver-minor
  releases.
- Documenting any breaking change in CHANGELOG before v1.0.
- Not adding new *required* fields to `BroadsheetPlugin` after v0.1.0
  (only optional fields).
- Keeping the three first-class plugins functional and updated in
  lockstep with core.

Things we don't yet commit to:
- A community plugin registry (deferred until the contract is
  battle-tested by us across ≥1 release cycle).
- Runtime plugin install (v0.2+ behind a signed allowlist).
- A Lovelace strategy adapter (v0.2+).
- A plugin permissions model beyond the sandbox above (v1.0+).
