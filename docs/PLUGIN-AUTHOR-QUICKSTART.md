# Writing a broadsheet plugin

The frozen `BroadsheetPlugin` contract lets you ship a SvelteKit
package that adds pages, renderers, settings panels, and discovery
contributors to broadsheet, with the same editorial register as
the core surfaces.

This guide gets you from zero to a working plugin in ~30 minutes.

## What you can ship

A plugin is a TypeScript module that exports `plugin: BroadsheetPlugin`.
The contract has five surfaces, all optional:

| Surface | What it adds |
|---|---|
| `pages` | New pages in broadsheet's catch-all route + kebab nav |
| `renderers` | Lazy-loaded components other pages can opt into via `useRenderer(id)` |
| `settingsPanel` | Configuration UI at `/settings/plugins/<id>/config` |
| `staticAssets` | A `static/` directory bundled at `/plugin-assets/<id>/*` |
| `discoveryContributors` | Async hooks that augment the discovery snapshot |

The same contract powers the bundled `@broadsheet/emanations` plugin
— see `packages/emanations/` for a complete real-world example
exercising every surface.

## Hello-plugin walkthrough

### 1. Package layout

```
my-plugin/
├── package.json
├── src/
│   ├── index.ts                    # Plugin definition
│   ├── pages/
│   │   └── HelloPage.svelte        # Page component
│   ├── settings/
│   │   └── HelloSettings.svelte    # Settings panel
│   └── renderers/
│       └── HelloRenderer.svelte    # Optional renderer for other pages
└── static/                         # Optional static assets
    └── icon.svg
```

`package.json` minimum:

```json
{
  "name": "@my-org/my-plugin",
  "version": "0.1.0",
  "type": "module",
  "peerDependencies": {
    "@broadsheet/core": "*",
    "svelte": "^5.0.0"
  }
}
```

### 2. Plugin definition

`src/index.ts`:

```ts
import type { BroadsheetPlugin } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
  id: 'my-plugin',          // unique across all plugins; used in URLs
  version: '0.1.0',
  displayName: 'My Plugin',
  description: 'Does something specific.',

  pages: [
    {
      slug: 'hello',          // becomes /hello in the SPA
      label: 'Hello',
      icon: 'mdi:hand-wave',
      navOrder: 100,          // 0-40 reserved for core, 50-99 for other plugins
      visibleWhen: (discovery) =>
        discovery.persons.length > 0,    // only show when there's someone to greet
      hiddenFromNav: false,             // route stays live but doesn't earn a nav entry
      component: () => import('./pages/HelloPage.svelte')
    }
  ],

  renderers: {
    'hello-greeting': () => import('./renderers/HelloRenderer.svelte')
  },

  settingsPanel: {
    label: 'Hello',
    icon: 'mdi:cog',
    component: () => import('./settings/HelloSettings.svelte')
  },

  staticAssets: 'static/',     // auto-mounted at /plugin-assets/my-plugin/

  discoveryContributors: []
};
```

### 3. Hard rules

Two non-negotiable rules at module-eval time:

1. **No side effects.** The module exports a plain object literal —
   no top-level `useEffect`, no auto-running tasks, no console.log
   on import.
2. **`import type` from `@broadsheet/core` only.** Runtime imports
   from core would bloat your plugin's main chunk. Heavy components
   stay behind the lazy thunks (`component: () => import('…')`);
   those chunks may freely runtime-import core.

The plugin loader rejects plugins that violate either rule with a
`load-error` status visible at `/settings/plugins`.

### 4. Page component (recommended shape)

`src/pages/HelloPage.svelte`:

```svelte
<script lang="ts">
  import {
    PageShell,
    Hero,
    Eyebrow,
    Explainer,
    discovery
  } from '@broadsheet/core';

  // discovery is the live, reactive Layer-2 projection.
  // Read it directly — no boilerplate connection setup needed.
  const persons = $derived(discovery.persons);
</script>

<svelte:head>
  <title>Hello · broadsheet</title>
</svelte:head>

<PageShell width="default">
  <Hero size="md">
    {#snippet eyebrow()}
      <Eyebrow section="Hello" />
    {/snippet}
    {#snippet headline()}
      Hello{persons.length > 0 ? `, ${persons[0].name.split(' ')[0]}` : ''}.
    {/snippet}
    {#snippet dek()}
      A page from your first plugin.
    {/snippet}
  </Hero>

  <Explainer>
    Compose pages from the same primitives core uses. See the
    <a href="/long-take">long take</a> for a more substantial example.
  </Explainer>
</PageShell>
```

The PageShell + Hero + Eyebrow + Explainer (+ OutLine, +
PresenceCards) primitives are exported from `@broadsheet/core`.
Plugins compose pages with the same shell as core pages and
inherit the editorial register for free.

### 5. Settings panel (optional)

`src/settings/HelloSettings.svelte`:

```svelte
<script lang="ts">
  import { OutLine, useCurationField } from '@broadsheet/core';

  // useCurationField binds a typed reactive view onto
  // curation.plugins.<id>.config.<path>. Writes persist + propagate.
  const greeting = useCurationField<string>('plugins.my-plugin.config.greeting');
</script>

<OutLine label="Greeting" />
<label class="field">
  <span class="field-label">Greeting word</span>
  <input
    type="text"
    value={greeting.value ?? 'Hello'}
    oninput={(e) =>
      (greeting.value = (e.target as HTMLInputElement).value)}
  />
</label>
```

### 6. Renderer (optional, for other pages to opt into)

If your plugin provides a visual component that other pages — core
or plugin — should be able to use, expose it via `renderers`:

```ts
renderers: {
  'hello-greeting': () => import('./renderers/HelloRenderer.svelte')
}
```

A core page can then opportunistically upgrade its visual via:

```svelte
<script>
  import { useRenderer } from '@broadsheet/core';
  const greeting = useRenderer('hello-greeting');
</script>

{#if greeting.current}
  {@const Renderer = greeting.current}
  <Renderer ...props />
{:else}
  <FallbackComponent />
{/if}
```

Renderers receive whatever props the calling page passes — there's
no fixed prop schema. This is by design: a renderer's contract is
specific to the call sites it serves.

### 7. Discovery contributors (optional)

For augmenting broadsheet's discovery snapshot — e.g. fetching a
plugin-specific manifest, joining external API data, adding
plugin-flagged metadata to areas/entities/persons:

```ts
import type { DiscoveryContributor } from '@broadsheet/core';

const myContributor: DiscoveryContributor = {
  id: 'my-plugin:greeting-data',
  async run(snapshot) {
    // snapshot is a read-only view; return a patch
    return {
      plugins: {
        'my-plugin': {
          greetingData: { /* … */ }
        }
      }
    };
  }
};

export const plugin: BroadsheetPlugin = {
  // …
  discoveryContributors: [myContributor]
};
```

Contributors run on every discovery tick (debounced). Errors are
caught + logged + surfaced at `/settings/plugins`; one bad
contributor doesn't take down discovery.

### 8. Static assets

A `static/` directory in your plugin gets auto-mounted at
`/plugin-assets/<plugin-id>/*` by the addon's nginx + the dev
server's static handler. Resolve paths in your code via the
`pluginAssetUrl` helper:

```ts
import { pluginAssetUrl } from '@broadsheet/core';

const iconUrl = pluginAssetUrl('my-plugin', 'icon.svg');
// → /plugin-assets/my-plugin/icon.svg (or ingress-prefixed in addon mode)
```

For user-uploaded plugin data (vs static assets), use `pluginDataUrl`
+ `listPluginData` / `uploadPluginData` / `deletePluginData` against
the sidecar's `/api/broadsheet/plugin-data/<id>` endpoints.

## Registering your plugin

For v0.1: plugins are statically imported by core's plugin registry
at `packages/core/src/lib/plugins/registry.ts`. Add your import
there, ship core + plugin together as a build artefact.

A dynamic plugin loading mechanism (drop a built plugin into the
addon's `/data/plugins/` and have it picked up at boot) is on the
v0.3 roadmap — not yet shipped.

## Page structure conventions

Plugin pages should follow the same shape conventions as core
pages so users get a coherent feel across the SPA:

1. `<PageShell width="default|wide">` outermost
2. `<Hero>` with `Eyebrow`, `headline`, optional `dek` snippets
3. `<OutLine label="…" />` between content sections
4. Content blocks (lists, grids, custom components)
5. `<Explainer>` at the bottom — italic-muted footer with
   cross-page links to siblings

You can also compose a plugin page from the typed block primitives
via `RenderedPage` — useful when you want the page itself to be
edit-friendly through the builder UI.

## Testing locally

In the broadsheet monorepo:

```bash
pnpm --filter @broadsheet/my-plugin build
pnpm --filter @broadsheet/core dev
```

The dev server picks up the plugin via the same registry it uses
for the bundled set. Visit `/settings/plugins` to confirm yours is
loaded + active; `/<your-slug>/` for the page; `/settings/plugins/<your-id>/config`
for the settings panel.

## Reference plugins

- `packages/emanations/` — the proof plugin, exercises every surface
- `packages/ghost-cloud/` — historical-data renderer
- `packages/tmdb-tv/` — external API integration

The emanations plugin is the smallest end-to-end example;
read its `src/index.ts` first then walk through one of each surface
type.

## Brittleness firewall (read this)

The plugin contract sits on top of broadsheet's brittleness firewall:
plugins consume only stable HA WS + curation + theme contracts. NO
plugin should:

- Read from HA's rendered DOM (frontend is unstable across versions)
- Hard-code HA frontend chunk URLs
- Depend on HA's CSS class names
- Rely on supervisor sidecar internals beyond the documented endpoints

If your plugin needs something that's only available via HA's
frontend internals, surface the gap upstream — broadsheet should add
a stable boundary, not have plugins reach across the firewall. We've
held this line through 27 Lovelace card translators + a Jinja
evaluator + a sparkline renderer; it's a contract worth protecting.
