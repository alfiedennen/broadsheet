<script lang="ts">
	/**
	 * 0.9.3 — per-area lights panel.
	 *
	 * One block, takes an `areaId`, renders one toggle per light in
	 * that area at render-time. Adds a 5th light to the area later?
	 * The panel grows automatically because we read
	 * `discovery.byAreaId(areaId)` reactively on every render rather
	 * than enumerating into the block config.
	 *
	 * Spec: docs/plans/plan-9.3-composites-and-plugin-blocks.md.
	 */
	import { discovery } from '$lib/discovery';
	import OutLine from '$lib/components/OutLine.svelte';
	import ThingBlockRenderer from './ThingBlockRenderer.svelte';
	import type { AreaLightsPanelBlockConfig } from '../types';

	let { config }: { config: AreaLightsPanelBlockConfig } = $props();

	const area = $derived(config.areaId ? discovery.byAreaId(config.areaId) : null);
	const lights = $derived(area?.lights ?? []);
	const headerLabel = $derived(config.label ?? (area ? `${area.name} lights` : 'Lights'));
</script>

{#if !area}
	<section class="block panel-empty">
		<p class="panel-empty-text">
			Lights panel — area
			<code>{config.areaId || '(unset)'}</code>
			not found. Was the area renamed or removed?
		</p>
	</section>
{:else if lights.length === 0}
	<section class="block panel-empty">
		<OutLine label={headerLabel} />
		<p class="panel-empty-text">
			No visible lights in <strong>{area.name}</strong>. Hidden via
			<a href="settings/house">house settings</a>?
		</p>
	</section>
{:else}
	<section class="block lights-panel">
		<OutLine label={headerLabel} />
		<div class="lights-grid">
			{#each lights as light (light.id)}
				<ThingBlockRenderer
					config={{ entityId: light.id, widget: 'auto' }}
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

	.lights-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}

	.panel-empty-text {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.panel-empty-text a {
		color: var(--accent);
	}
	.panel-empty-text code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
