<script lang="ts">
	/**
	 * @broadsheet/tmdb-tv — 0.9.3 block contribution.
	 *
	 * Thin wrapper exposing the existing ContentRows renderer as a
	 * core block type (`tmdb-tv:rows`) so it can be dropped on any
	 * wall surface — next to a TV remote, inside a media panel, etc.
	 * — not just on the dedicated /tv page.
	 *
	 * Reads `curation.integrations.tmdb` (same shape /tv reads) via
	 * Svelte context published by core's `RenderedPage` —
	 * `getContext(PLUGIN_BLOCK_HOST_CONTEXT_KEY)`. No runtime import
	 * of `@broadsheet/core`; only TYPE imports (compile-time only,
	 * erased at runtime, no execution cycle).
	 *
	 * Spec: docs/plans/plan-9.3-composites-and-plugin-blocks.md.
	 */
	import { getContext } from 'svelte';
	import ContentRows from './ContentRows.svelte';
	import {
		PLUGIN_BLOCK_HOST_CONTEXT_KEY,
		type PluginBlockHostContext
	} from '@broadsheet/core';

	interface Props {
		config: {
			trendingWindows?: ('day' | 'week')[];
			newReleasesWindowDays?: number[];
		};
	}

	let { config }: Props = $props();

	// Reactive host context — core publishes curation + discovery.
	// Re-reading host.curation on every render flows through Svelte 5's
	// reactivity; the block re-renders when the user updates the TMDB
	// API key in settings.
	const host = getContext<PluginBlockHostContext>(PLUGIN_BLOCK_HOST_CONTEXT_KEY);

	const tmdb = $derived(
		((host?.curation as Record<string, unknown> | undefined)?.integrations as
			| Record<string, unknown>
			| undefined)?.tmdb as Record<string, unknown> | undefined
	);

	// Stable array references to keep ContentRows' internal $effect
	// from looping on fresh literals — same lesson as the 0.8.7 /tv
	// fix. Per-render $derived.by returns the same reference when
	// inputs are unchanged.
	const trendingWindowsArr = $derived.by((): ('day' | 'week')[] => {
		if (Array.isArray(config.trendingWindows) && config.trendingWindows.length > 0) {
			return config.trendingWindows;
		}
		const v = tmdb?.trendingWindows;
		if (Array.isArray(v)) return v as ('day' | 'week')[];
		if (v === 'day' || v === 'week') return [v];
		return ['week'];
	});
	const newWindowsArr = $derived.by((): number[] => {
		if (Array.isArray(config.newReleasesWindowDays) && config.newReleasesWindowDays.length > 0) {
			return config.newReleasesWindowDays;
		}
		const v = tmdb?.newReleasesWindowDays;
		if (Array.isArray(v)) return v as number[];
		if (typeof v === 'number') return [v];
		return [45];
	});
	const providersArr = $derived.by((): number[] => {
		const v = tmdb?.providers;
		if (Array.isArray(v)) return v as number[];
		return [];
	});

	const apiKey = $derived((tmdb?.apiKey ?? null) as string | null);
	const region = $derived((tmdb?.region ?? 'GB') as string);
</script>

<div class="tmdb-rows-block">
	<ContentRows
		{apiKey}
		{region}
		providers={providersArr}
		trendingWindows={trendingWindowsArr}
		newReleasesWindowDays={newWindowsArr}
	/>
</div>

<style>
	/* No extra chrome — the block IS the rows. Outer-page block gap
	   handles spacing from surrounding blocks. */
</style>
