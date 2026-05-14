/**
 * @broadsheet/tmdb-tv — TMDB-driven content rows for `/tv`.
 *
 * The third first-class plugin, and the leanest contract-surface
 * combination so far: a RENDERER + a SETTINGS PANEL, nothing else —
 * no pages, no static assets, no discovery contributors.
 *
 * It registers the `tmdb-content-rows` renderer; core's `/tv` page
 * slots it into its content slot via `useRenderer`, passing the
 * TMDB API key + region from `curation.integrations.tmdb`. The
 * renderer fetches TMDB directly (TMDB's API supports browser CORS),
 * caches in localStorage, and shows "Trending this week" + "New".
 *
 * Without a key the renderer shows a "configure it" CTA — so the
 * plugin can be enabled before a key exists, and the settings panel
 * is where the key goes in.
 *
 * Contract rules: no side effects at module-eval time; `import type`
 * from @broadsheet/core only. The renderer + settings panel are
 * LazyComponent thunks — code-split, fetched only when used.
 */

import type { BroadsheetPlugin } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
	id: 'tmdb-tv',
	version: '0.1.0',
	displayName: 'TMDB Content',
	description:
		'Trending + New content rows on the /tv page, from TMDB. Needs a free TMDB API key.',

	// The renderer core's /tv page opts into via
	// useRenderer('tmdb-content-rows'). No `pages` — tmdb-tv adds no
	// route of its own; it lives inside an existing core page.
	renderers: {
		'tmdb-content-rows': () => import('./renderers/ContentRows.svelte')
	},

	// Where the user's TMDB API key + region go in. Binds
	// integrations.tmdb.* — the same curation fields /tv reads.
	settingsPanel: {
		label: 'TMDB Content',
		icon: 'mdi:television-classic',
		component: () => import('./settings/TmdbTvSettings.svelte')
	}
};
