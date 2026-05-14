/**
 * @broadsheet/emanations — multi-person presence painting.
 *
 * This module is statically imported by core's plugin registry, so it
 * obeys the two hard rules from RENDERER-CONTRACT.md:
 *   1. No side effects at module-eval time — it exports a plain object.
 *   2. `import type` from @broadsheet/core ONLY — never a runtime
 *      import. The heavy page component is behind a LazyComponent
 *      thunk; it may freely runtime-import core (it's a separate,
 *      lazily-fetched chunk, so there's no static cycle).
 *
 * Status: P1 — the plugin object + a stub page that proves the
 * contract end-to-end (separate package, bundled, lazy-chunked,
 * curation-gated, routed, nav-listed). The real multi-person painting
 * renderer lands in P4.
 */

import type { BroadsheetPlugin } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
	id: 'emanations',
	version: '0.1.0',
	displayName: 'Emanations',
	description: 'Multi-person presence painting — where everyone is, as living imagery.',

	pages: [
		{
			slug: 'emanations',
			label: 'Emanations',
			icon: 'mdi:map-marker-radius',
			navOrder: 50,
			// Multi-person painting only makes sense with ≥2 people who
			// have a presence sensor. Below that the page is registered
			// but hidden + 404s — /settings/plugins explains why.
			visibleWhen: (discovery) =>
				discovery.persons.filter((p) => p.suggestedPresenceSensor !== null).length >= 2,
			component: () => import('./pages/EmanationsPage.svelte')
		}
	],

	// A renderer core pages can opt into via useRenderer(). core's `/`
	// upgrades its ProceduralPainting fallback to this when emanations
	// is active. P2 stub; P4 ports the real axonometric painting.
	renderers: {
		'multi-person-painting': () => import('./renderers/MultiPersonPainting.svelte')
	},

	// Static assets shipped with the plugin. The add-on build stages
	// this directory into the image at www/plugin-assets/emanations/;
	// nginx serves it at /plugin-assets/emanations/*. Plugin code
	// references it via pluginAssetUrl('emanations', '<path>'). P3
	// ships a placeholder mark.svg; P4 ships the real painting set.
	staticAssets: 'static/'
};
