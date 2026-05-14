/**
 * @broadsheet/emanations — multi-person presence painting.
 *
 * The first-class proof plugin. As of P4 it exercises EVERY surface
 * of the frozen BroadsheetPlugin contract:
 *   - `pages`       — /emanations (the catch-all route renders it)
 *   - `renderers`   — multi-person-painting (core's `/` opts into it)
 *   - `settingsPanel` — config UI at /settings/plugins/emanations/config
 *   - `staticAssets`  — the painting set under static/
 *   - `discoveryContributors` — discovers which painting sets exist
 *
 * This module is statically imported by core's plugin registry, so it
 * obeys the two hard rules from RENDERER-CONTRACT.md:
 *   1. No side effects at module-eval time — it exports a plain object.
 *   2. `import type` from @broadsheet/core ONLY. (Importing the
 *      plugin's OWN modules at runtime is fine — `paintingSets` is a
 *      side-effect-free object the contributor runner needs at boot,
 *      so it can't be lazy.) Heavy components stay behind LazyComponent
 *      thunks; those chunks may freely runtime-import core.
 */

import type { BroadsheetPlugin } from '@broadsheet/core';
import { paintingSetsContributor } from './discovery/paintingSets';

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
	// is active (procedural mode — core passes no painting set).
	renderers: {
		'multi-person-painting': () => import('./renderers/MultiPersonPainting.svelte')
	},

	// Plugin config UI — shown at /settings/plugins/emanations/config.
	// Binds plugins.emanations.config.* via useCurationField.
	settingsPanel: {
		label: 'Emanations',
		icon: 'mdi:image-multiple-outline',
		component: () => import('./settings/EmanationsSettings.svelte')
	},

	// Static assets shipped with the plugin. The add-on build stages
	// static/ into the image at www/plugin-assets/emanations/; nginx
	// serves it at /plugin-assets/emanations/*. Plugin code resolves
	// paths via pluginAssetUrl('emanations', '<path>'). Ships the
	// painting set (paintings/) + a mark.svg.
	staticAssets: 'static/',

	// Discovers which painting sets are available — fetches the
	// painting manifest and merges it into discovery.plugins.emanations.
	discoveryContributors: [paintingSetsContributor]
};
