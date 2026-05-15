<script lang="ts">
	/**
	 * BoostRowBlockRenderer — per-climate-area "boost to N°" tile.
	 * Tap → climate.set_temperature on every climate entity in that
	 * area. config.temperature configures the target (default 21).
	 *
	 * Lifted from /wall.
	 */
	import { discovery } from '$lib/discovery';
	import type { DomainArea } from '$lib/discovery';
	import { callService } from '$lib/ha/actions';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { BoostRowBlockConfig } from '../types';

	let { config }: { config: BoostRowBlockConfig } = $props();

	const temperature = $derived(config.temperature ?? 21);
	const climateAreas = $derived(discovery.areasForPage('heat'));

	async function boostArea(a: DomainArea) {
		for (const c of a.climates) {
			await callService(
				'climate',
				'set_temperature',
				{ entity_id: c.id },
				{ temperature }
			);
		}
	}
</script>

{#if config.label && climateAreas.length > 0}
	<OutLine label={config.label} />
{/if}
{#if climateAreas.length > 0}
	<div class="boost-row">
		{#each climateAreas as a (a.id)}
			<button class="boost-tile" type="button" onclick={() => boostArea(a)}>
				<span class="boost-name">{a.name}</span>
				<span class="boost-detail">→ {temperature}°</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	.boost-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}

	.boost-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.boost-tile:hover {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.boost-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--fg);
	}

	.boost-detail {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
	}
</style>
