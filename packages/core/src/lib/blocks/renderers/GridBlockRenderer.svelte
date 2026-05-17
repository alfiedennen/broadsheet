<script lang="ts">
	/**
	 * 0.9.4 — Grid block: CSS-grid container with explicit columns.
	 *
	 * Renders `config.children` in a CSS grid with `config.columns`
	 * columns at the widest viewport. Each child takes 1 column by
	 * default; setting `colSpan` on a child makes it span N columns
	 * (clamped to the current column count).
	 *
	 * Default 12 columns matches Lovelace's sections-layout
	 * convention so an imported sections view translates 1:1
	 * (`grid_options.columns: 6` → broadsheet `colSpan: 6`).
	 *
	 * Responsive collapse — at narrow viewports the column count
	 * drops to keep children readable:
	 *
	 *   widest viewport  → config.columns (e.g. 12)
	 *   below 1024px     → max(1, ⌊columns/2⌋)    e.g. 6
	 *   below 640px      → max(1, ⌊columns/4⌋)    e.g. 3
	 *   below 480px      → 1
	 *
	 * The BlockSlot wrapper clamps each child's colSpan to the
	 * effective column count, so a colSpan-6 child in a 3-column
	 * collapsed view spans all 3 instead of overflowing.
	 *
	 * Spec: docs/plans/plan-9.4-lovelace-import-layout.md.
	 */
	import OutLine from '$lib/components/OutLine.svelte';
	import BlockSlot from '../BlockSlot.svelte';
	import type { GridBlockConfig } from '../types';

	let { config }: { config: GridBlockConfig } = $props();

	const columns = $derived(Math.max(1, config.columns ?? 12));
	const gap = $derived(config.gap ?? 3);

	// Reactive viewport tracking — Svelte 5's $state + window resize
	// listener. Keeps the colSpan clamp accurate as the editor
	// preview resizes or the user rotates a tablet.
	let viewportWidth = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const onResize = () => (viewportWidth = window.innerWidth);
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	const effectiveColumns = $derived.by(() => {
		if (viewportWidth < 480) return 1;
		if (viewportWidth < 640) return Math.max(1, Math.floor(columns / 4));
		if (viewportWidth < 1024) return Math.max(1, Math.floor(columns / 2));
		return columns;
	});
</script>

{#if config.label}
	<OutLine label={config.label} />
{/if}

<div
	class="grid-container"
	style="grid-template-columns: repeat({effectiveColumns}, minmax(0, 1fr)); gap: var(--space-{gap});"
>
	{#each config.children as child, i (i)}
		<BlockSlot block={child} gridColumns={effectiveColumns} />
	{/each}
</div>

<style>
	.grid-container {
		display: grid;
		align-items: stretch;
	}
</style>
