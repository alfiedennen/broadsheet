/**
 * @broadsheet/ghost-cloud — The Long Take.
 *
 * 24-hour radar event playback rendered as a translucent
 * water-membrane time-tube. The renderer is harold-home's proven
 * Three.js piece (lock state v22), ported verbatim and shipped as
 * plugin static assets (`static/ghost-cloud.js` + `view.html` + a
 * vendored Three.js r169). The `/long-take` page iframes it.
 *
 * v0.1 ships bundled demo data — one captured day per room — so the
 * plugin works for any user with zero hardware or setup. The
 * live-radar-pull path (querying HA recorder history for LD2450
 * sensors) is a deferred follow-on; the discoveryContributor is
 * where it plugs in.
 *
 * Contract rules: no side effects at module-eval time; `import type`
 * from @broadsheet/core only. Importing the plugin's own
 * side-effect-free `./discovery/rooms` at runtime is fine — the
 * contributor object must exist at boot. The heavy renderer isn't a
 * LazyComponent at all here: it's a static-asset iframe, so it never
 * touches the JS bundle.
 */

import type { BroadsheetPlugin } from '@broadsheet/core';
import { roomsContributor } from './discovery/rooms';

export const plugin: BroadsheetPlugin = {
	id: 'ghost-cloud',
	version: '0.1.0',
	displayName: 'The Long Take',
	description:
		'24-hour radar event playback — a room’s presence rendered as a translucent water-membrane time-tube.',

	pages: [
		{
			slug: 'long-take',
			label: 'The Long Take',
			icon: 'mdi:radar',
			navOrder: 51,
			// No visibleWhen: v0.1 ships bundled demo data, so the page
			// always has something to show when the plugin is enabled.
			// (The "needs LD2450 radar" gate belongs to the future
			// live-data path, not the demo-data present.)
			component: () => import('./pages/LongTakePage.svelte')
		}
	],

	// static/ ships the ported renderer (ghost-cloud.js + view.html),
	// the vendored Three.js (three/), and the demo data (data/). CI
	// stages it into the image at www/plugin-assets/ghost-cloud/.
	staticAssets: 'static/',

	// Discovers which rooms have playback data — fetches the room
	// manifest and merges it into discovery.plugins['ghost-cloud'].
	discoveryContributors: [roomsContributor]
};
