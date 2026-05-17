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

import type { BroadsheetPlugin, PluginRecipeSuggestion } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
	id: 'tmdb-tv',
	version: '0.2.0',
	displayName: 'TMDB Content',
	description:
		'Trending + New content rows from TMDB. Lives on /tv by default; can also be dropped on any wall surface as a block (0.9.3). Needs a free TMDB API key.',

	// The renderer core's /tv page opts into via
	// useRenderer('tmdb-content-rows'). Continues to power /tv.
	renderers: {
		'tmdb-content-rows': () => import('./renderers/ContentRows.svelte')
	},

	// 0.9.3: TMDB rows as a droppable block on any wall surface. The
	// things-first browser surfaces ONE recipe per area that has TVs
	// — "<area> TV — TMDB show & movie rows" — slotted into that
	// area's `tvs` sub-group right next to the per-TV recipes.
	extraBlocks: [
		{
			type: 'tmdb-tv:rows',
			label: 'TMDB rows',
			description:
				'Trending + new shows / movies from TMDB. Reads the same API key as /tv. Drop alongside a TV remote for "browse + play" together.',
			defaultConfig: {
				// Empty = use the curation.integrations.tmdb defaults
				// (matches the /tv page behaviour). Authors can override
				// per placement via the block editor.
				trendingWindows: [],
				newReleasesWindowDays: []
			},
			renderer: () => import('./renderers/RowsBlock.svelte'),
			suggestRecipes: (discovery) => {
				const out: PluginRecipeSuggestion[] = [];
				for (const area of discovery.areas) {
					if (area.tvs.length === 0) continue;
					out.push({
						id: `tmdb-tv:rows:${area.id}`,
						title: `${area.name} TV — TMDB show & movie rows`,
						description: 'Trending + new releases inline; same source as /tv',
						icon: 'mdi:movie-open-star',
						placement: { kind: 'area', areaId: area.id, subGroup: 'tvs' },
						config: { trendingWindows: [], newReleasesWindowDays: [] },
						referencedEntityIds: area.tvs.map((tv) => tv.id)
					});
				}
				return out;
			}
		}
	],

	// Where the user's TMDB API key + region go in. Binds
	// integrations.tmdb.* — the same curation fields /tv reads.
	settingsPanel: {
		label: 'TMDB Content',
		icon: 'mdi:television-classic',
		component: () => import('./settings/TmdbTvSettings.svelte')
	}
};
