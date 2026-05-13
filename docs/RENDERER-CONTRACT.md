# broadsheet â€” renderer / plugin contract

Sketch of the plugin API. Lighter than the other contract docs because
plugins aren't in v0.1's IN list â€” they ship *alongside* v0.1 as
demos that prove the contract works, but the system core ships
plugin-free by default.

This document is forward-looking enough to make sure we don't paint
ourselves into a corner now that we'd regret in v0.2.

Read alongside:
- `ARCHITECTURE.md` (plugin system overview)
- `PREMORTEM-DIFF.md` (the Lovelace-strategy reusability hint)

---

## What plugins are for

Plugins extend broadsheet with:
1. **New pages** â€” a whole new route (`/long-take`, `/emanations`)
2. **New renderers** â€” components a page can use (multi-person painting
   on `/`, TMDB content rows on `/tv`)
3. **New Settings panels** â€” plugin-specific config UI
4. **New discovery contributors** â€” read additional HA data the core
   doesn't (e.g. ghost-cloud reads radar event JSON)

Plugins should NOT:
- Modify Layer 1 or Layer 2 of the core
- Replace core pages
- Inject styles globally
- Make service calls outside the read-only / audit-log envelope

---

## Three first-class plugins (extracted from harold-home)

| Plugin | What it does | Activates when |
|---|---|---|
| `@broadsheet/emanations` | Multi-person presence painting renderer + `/emanations` page | â‰¥2 `sensor.*_committed_room` entities detected AND user has paintings in `/data/paintings/` |
| `@broadsheet/ghost-cloud` | 24-hour radar event playback as translucent water-membrane time-tube + `/long-take` page | `@broadsheet/ghost-cloud` add-on installed AND radar-precompute JSON files present at `/local/exposure/data/<room>.json` |
| `@broadsheet/tmdb-tv` | TMDB-driven content rows on `/tv` | `integrations.tmdb.apiKey` set in curation |

Each ships as a separate npm package + is enabled/disabled per
`broadsheet.json â†’ plugins.<id>.enabled`.

---

## Plugin shape

```ts
// @broadsheet/emanations/src/index.ts

import type { BroadsheetPlugin } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
  id: 'emanations',
  version: '0.1.0',
  displayName: 'Emanations',
  description: 'Multi-person presence painting',

  // Pages this plugin adds (optional)
  pages: [
    {
      slug: 'emanations',
      label: 'Emanations',
      icon: 'mdi:map-marker-radius',
      navOrder: 50,
      // Visibility check: when does this page show in nav?
      visibleWhen: (discovery) =>
        discovery.persons.filter(p => p.presenceSensorId).length >= 2,
      // Lazy-loaded component
      component: () => import('./pages/EmanationsPage.svelte'),
    },
  ],

  // Renderers this plugin exposes for use by other pages (optional)
  renderers: {
    'multi-person-painting': () => import('./renderers/MultiPersonPainting.svelte'),
  },

  // Settings panel (optional)
  settingsPanel: {
    label: 'Emanations',
    icon: 'mdi:image',
    component: () => import('./settings/EmanationsSettings.svelte'),
  },

  // Static asset paths to expose via nginx (optional)
  // Files at <package>/static/* will be served at /local/<plugin-id>/*
  staticAssets: 'static/',

  // Discovery contributors (optional, advanced)
  // Plugins can register additional discovery readers that augment
  // the core domain model. Used by ghost-cloud to read radar JSON.
  discoveryContributors: [
    () => import('./discovery/radarRooms.ts').then(m => m.default),
  ],

  // Lifecycle hooks (optional)
  onActivate: async (context) => {
    // Called when plugin is enabled (or on boot if already enabled)
    // context provides discovery state, curation, callService wrapper
  },
  onDeactivate: async () => {
    // Called when plugin is disabled
  },
};
```

---

## Page contract

Pages registered by plugins use the same `PageShell` / `Hero` / etc.
primitives as core pages:

```svelte
<!-- @broadsheet/emanations/src/pages/EmanationsPage.svelte -->
<script lang="ts">
  import { discovery, PageShell, Hero, Eyebrow } from '@broadsheet/core';
  import MultiPersonPainting from '../renderers/MultiPersonPainting.svelte';

  const persons = $derived(discovery.persons.filter(p => p.presenceState === 'home'));
</script>

<PageShell width="bleed">
  <Hero>
    {#snippet eyebrow()}<Eyebrow section="emanations" />{/snippet}
    {#snippet headline()}<h1>Where everyone is.</h1>{/snippet}
  </Hero>

  <MultiPersonPainting {persons} />
</PageShell>
```

The page never imports core internals (`discoveryStore`,
`connection`). Only the public `discovery.*` + UI primitives surface.

---

## Renderer contract

A renderer is a Svelte component a plugin exposes for use by other
code (its own pages, or core pages, or other plugins).

```ts
// @broadsheet/emanations/src/renderers/MultiPersonPainting.svelte
<script lang="ts">
  import type { DomainPerson } from '@broadsheet/core';

  // Renderers declare their inputs as props
  let { persons }: { persons: DomainPerson[] } = $props();

  // Renderers are pure components â€” no side effects on mount
  // beyond what the input props imply
</script>
```

Naming: renderer IDs in `plugin.renderers` should be kebab-case +
descriptive (`multi-person-painting`, `radar-time-tube`,
`tmdb-content-row`). Pages reference them by ID:

```svelte
<!-- core /+page.svelte -->
<script lang="ts">
  import { useRenderer } from '@broadsheet/core';

  // Returns the registered renderer component if its plugin is
  // active, null otherwise
  const Painting = useRenderer('multi-person-painting');
</script>

{#if Painting}
  <Painting persons={discovery.persons} />
{:else}
  <ProceduralPainting />  <!-- core fallback -->
{/if}
```

This pattern lets core pages opportunistically use plugin-provided
upgrades without hard-depending on them.

---

## Activation contract

A plugin is activated when:
1. The npm package is bundled into the add-on image (or installed at
   runtime â€” v0.2)
2. `broadsheet.json â†’ plugins.<id>.enabled === true`
3. AND the plugin's own `visibleWhen` (per-page) or `onActivate`
   (overall) checks pass

If `enabled === true` but the activation checks fail, the plugin
shows up in `/settings/plugins` with a warning ("emanations: needs
â‰¥2 people with presence sensors picked"). This is the honesty
escape hatch â€” broadsheet tells the user why their plugin isn't
working rather than silently doing nothing.

---

## Discovery contributor contract

Some plugins need to read HA data the core doesn't (ghost-cloud reads
radar JSON files; a hypothetical calendar plugin reads `calendar.*`
states differently). They register *contributors*:

```ts
// @broadsheet/ghost-cloud/src/discovery/radarRooms.ts

import type { DiscoveryContributor, RadarRoom } from '@broadsheet/core';

const contributor: DiscoveryContributor = {
  id: 'ghost-cloud-radar-rooms',

  // Called at boot + on registry updates
  async contribute(context) {
    // context provides core discovery state + a wrapped HTTP fetch
    const rooms: RadarRoom[] = [];
    const persons = context.discovery.areas;
    for (const area of persons) {
      try {
        const res = await context.fetch(`/local/exposure/data/${area.id}.json`);
        if (res.ok) {
          rooms.push({
            areaId: area.id,
            data: await res.json(),
            lastUpdated: new Date(res.headers.get('last-modified')!),
          });
        }
      } catch (err) {
        // Silent â€” plugin handles missing data gracefully
      }
    }
    return { radarRooms: rooms };
  },
};

export default contributor;
```

Contributor outputs are merged into `discovery.plugins.<plugin-id>`:

```ts
// In a ghost-cloud page:
const radarRooms = $derived(discovery.plugins['ghost-cloud']?.radarRooms ?? []);
```

Contributors are sandboxed:
- They get a wrapped `fetch` that's same-origin only (can't exfiltrate)
- They can't access the WebSocket connection directly
- They can't write to the curation store

---

## Settings panel contract

Plugins that need configuration register a panel:

```svelte
<!-- @broadsheet/emanations/src/settings/EmanationsSettings.svelte -->
<script lang="ts">
  import { useCurationField, SettingsRow } from '@broadsheet/core';

  // Bind to a curation field, get reactive read + writer
  const fadeMs = useCurationField('plugins.emanations.config.fadeMs');
</script>

<SettingsRow label="Cross-fade duration">
  <input type="number" bind:value={fadeMs.value} min={100} max={5000} />
  <span>ms</span>
</SettingsRow>
```

Settings panels appear in `/settings/plugins/<plugin-id>/config` when
the plugin is enabled.

---

## Static asset shipping

Plugins can ship static assets (paintings, JS modules, JSON, fonts).
These are bundled into the add-on image at build time:

```
@broadsheet/ghost-cloud/
â”œâ”€â”€ package.json
â”œâ”€â”€ src/
â””â”€â”€ static/
    â”œâ”€â”€ ghost-cloud.js          â†’ /local/ghost-cloud/ghost-cloud.js
    â”œâ”€â”€ shaders/
    â”‚   â”œâ”€â”€ water.frag          â†’ /local/ghost-cloud/shaders/water.frag
    â”‚   â””â”€â”€ normal.frag         â†’ /local/ghost-cloud/shaders/normal.frag
    â””â”€â”€ data/
        â””â”€â”€ pentatonic.json     â†’ /local/ghost-cloud/data/pentatonic.json
```

Plugins reference their own assets via the `pluginAssetUrl` helper:

```ts
import { pluginAssetUrl } from '@broadsheet/core';
const fragShaderUrl = pluginAssetUrl('ghost-cloud', 'shaders/water.frag');
```

This wraps the path resolution so it works under HA Ingress AND
direct serving without the plugin code knowing about ingress prefixes.

---

## Version compatibility

Each plugin declares its compatible broadsheet core version range:

```json
// @broadsheet/emanations/package.json
{
  "name": "@broadsheet/emanations",
  "version": "0.1.0",
  "peerDependencies": {
    "@broadsheet/core": "^0.1.0"
  }
}
```

The plugin loader checks `peerDependencies` at boot. If a plugin
requires a newer core version than installed, it's not loaded and
shows up in `/settings/plugins` as "needs broadsheet >= X.Y.Z" with
an "Update broadsheet" link.

The plugin contract itself is versioned via the core's exports. We
follow semver:
- Patch (`0.1.x`): bug fixes only, plugins always work
- Minor (`0.x.0`): backwards-compatible additions to plugin contract
- Major (`x.0.0`): breaking changes to plugin contract, plugins need
  updates

For v0.1 we pin the contract â€” no breaking changes until v1.0.
That's the discipline.

---

## Forward compatibility â€” Lovelace strategies (v0.2+)

The plugin contract is designed so the same package can be reused as
a Lovelace strategy when we ship that channel in v0.2. The renderer
contract specifically â€” props-in/render-out, no side effects, no core
internal access â€” maps cleanly to Lovelace's strategy interface.

We don't build the Lovelace adapter in v0.1. We just don't make
choices that would block it.

What this rules out for v0.1:
- Plugin renderers reaching into `discovery.*` directly (would tie
  them to broadsheet's runtime). They get props in.
- Plugin renderers calling `useRenderer` recursively without bounds
  (would create import cycles in the Lovelace context).
- Plugin renderers mutating any shared state.

What it allows:
- Plugins shipping pure presentational components that broadsheet OR
  HA's Lovelace can render with appropriate data injected.
- Plugins shipping their own data-fetching logic that broadsheet runs
  via discoveryContributors + Lovelace runs via its own pattern.

---

## Plugin author guide (sketch)

For when we have plugin authors (not v0.1):

1. Scaffold from `@broadsheet/create-plugin` (a CLI we'd ship)
2. Implement `plugin.id`, `plugin.version`, at least one of `pages`
   / `renderers` / `discoveryContributors`
3. Test in a dev broadsheet with the plugin linked via `pnpm link`
4. Publish to npm under `@broadsheet/<your-plugin-id>` (community
   plugins use any npm scope; we maintain a registry of known-good
   ones at `broadsheet.dev/plugins`)
5. Users install via add-on update with the plugin added to the
   image's bundled deps (v0.1 model) OR via runtime install (v0.2 â€” when
   we add UI plugin install, behind a signed-allowlist)

---

## Plugin error handling

If a plugin's render crashes:
- The crash is caught at the page level via Svelte error boundary
- The page shows a "degraded chip" in place of the failed renderer:
  "Emanations renderer failed: <error>. [Disable plugin] [Report]"
- Other parts of the page keep working
- The error is logged to the audit log

If a plugin's `discoveryContributor` errors:
- The contribution silently returns empty
- A warning surfaces in `/settings/plugins/<plugin-id>` and the
  plugin's overall status becomes "errored"
- Page renderers depending on that data get the empty state

If a plugin fails to import (npm package missing or syntax error):
- Logged to console + audit log
- Plugin shows up in `/settings/plugins` as "load error"
- Other plugins keep working

The principle: **one plugin's failure cannot take down the rest of
broadsheet.** Validated in M3-M4 of the build plan.

---

## What we commit to with this contract

By shipping the plugin contract in v0.1.0, we commit to:
- Maintaining `BroadsheetPlugin` interface compatibility within
  semver-minor releases
- Documenting any breaking changes in CHANGELOG before v1.0
- Not adding new required fields to `BroadsheetPlugin` after v0.1.0
  (only optional fields)
- Keeping the three first-class plugins (`@broadsheet/emanations`,
  `@broadsheet/ghost-cloud`, `@broadsheet/tmdb-tv`) functional and
  updated in lockstep with core

Things we don't yet commit to:
- A community plugin registry (deferred until plugin contract is
  battle-tested by us across â‰¥1 release cycle)
- Runtime plugin install (v0.2+ behind allowlist)
- Lovelace strategy adapter (v0.2+)
- Plugin permissions model beyond the sandbox above (probably v1.0+)
