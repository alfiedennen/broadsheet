<script lang="ts">
	/**
	 * `/wall` — dense action grid for hallway / kitchen tablet.
	 *
	 * Refactored 2026-05-15 to use the v0.2 block primitives via
	 * RenderedPage. Same surface, same behaviour — composition is now
	 * declarative: an array of typed BlockDef instances dispatched to
	 * registered renderers. Proves the substrate against a real page.
	 *
	 * The block array below is what the Phase 2 builder UI will edit
	 * graphically AND what the Phase 3 Lovelace importer will emit
	 * for translated dashboards. /wall hardcodes the array to keep
	 * the existing surface unchanged; future refactors could move
	 * this into a "preset page" the user could clone + edit.
	 */

	import PageShell from '$lib/components/PageShell.svelte';
	import RenderedPage from '$lib/blocks/RenderedPage.svelte';
	import type { BlockDef } from '$lib/blocks/types';

	const blocks: BlockDef[] = [
		{
			type: 'hero',
			config: {
				eyebrow: 'Wall',
				number: 7,
				headline: 'Everything within reach.',
				size: 'sm'
			}
		},
		{ type: 'macro-grid', config: { label: 'Macros' } },
		{ type: 'room-toggle-grid', config: { label: 'Rooms' } },
		{ type: 'scene-row', config: { label: 'Scenes', maxScenes: 8 } },
		{ type: 'boost-row', config: { label: 'Boost', temperature: 21 } },
		{
			type: 'explainer',
			config: {
				body: "For the deeper views: [light](/lights), [heat](/heat), [door](/door), [tv](/tv), [body](/body), [the wall painting](/emanations), and [the long take](/long-take)."
			}
		}
	];
</script>

<svelte:head>
	<title>Wall · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<RenderedPage {blocks} />
</PageShell>
