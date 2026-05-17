<script lang="ts">
	/**
	 * 0.9.4 — Row block: horizontal flex layout container.
	 *
	 * Renders `config.children` side-by-side. Children take an equal
	 * flex share by default; setting `colSpan` on a child weights its
	 * `flex-grow` so wider tiles take proportionally more space.
	 *
	 * Below the small-tablet breakpoint (~640px) the row stacks back
	 * to a single column — keeps wall surfaces on phone-portrait
	 * readable.
	 *
	 * Spec: docs/plans/plan-9.4-lovelace-import-layout.md.
	 */
	import OutLine from '$lib/components/OutLine.svelte';
	import BlockSlot from '../BlockSlot.svelte';
	import type { RowBlockConfig } from '../types';

	let { config }: { config: RowBlockConfig } = $props();

	const gap = $derived(config.gap ?? 3);
</script>

{#if config.label}
	<OutLine label={config.label} />
{/if}

<div class="row-container" style="gap: var(--space-{gap});">
	{#each config.children as child, i (i)}
		<BlockSlot block={child} flexGrow={child.colSpan ?? 1} />
	{/each}
</div>

<style>
	.row-container {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		flex-wrap: wrap;
	}

	@media (max-width: 640px) {
		.row-container {
			flex-direction: column;
		}
	}
</style>
