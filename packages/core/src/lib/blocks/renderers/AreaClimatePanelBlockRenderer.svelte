<script lang="ts">
	/**
	 * 0.9.3 — per-area heating panel.
	 *
	 * One block, renders one climate tile per TRV in the area at
	 * render-time. Tap a tile to expand the setpoint slider (handled
	 * inside ThingBlockRenderer's climate widget). Grows + shrinks
	 * with the area's `climates` list.
	 *
	 * Spec: docs/plans/plan-9.3-composites-and-plugin-blocks.md.
	 */
	import { discovery } from '$lib/discovery';
	import OutLine from '$lib/components/OutLine.svelte';
	import ThingBlockRenderer from './ThingBlockRenderer.svelte';
	import type { AreaClimatePanelBlockConfig } from '../types';

	let { config }: { config: AreaClimatePanelBlockConfig } = $props();

	const area = $derived(config.areaId ? discovery.byAreaId(config.areaId) : null);
	const trvs = $derived(area?.climates ?? []);
	const headerLabel = $derived(config.label ?? (area ? `${area.name} heating` : 'Heating'));
</script>

{#if !area}
	<section class="block panel-empty">
		<p class="panel-empty-text">
			Heating panel — area
			<code>{config.areaId || '(unset)'}</code>
			not found.
		</p>
	</section>
{:else if trvs.length === 0}
	<section class="block panel-empty">
		<OutLine label={headerLabel} />
		<p class="panel-empty-text">
			No TRVs in <strong>{area.name}</strong>.
		</p>
	</section>
{:else}
	<section class="block climate-panel">
		<OutLine label={headerLabel} />
		<div class="climate-grid">
			{#each trvs as trv (trv.id)}
				<ThingBlockRenderer
					config={{ entityId: trv.id, widget: 'auto' }}
				/>
			{/each}
		</div>
	</section>
{/if}

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.climate-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-3);
	}
	.panel-empty-text {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.panel-empty-text code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
