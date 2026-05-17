<script lang="ts">
	/**
	 * MacroGridBlockRenderer — three big house-wide macros.
	 *
	 * All lights off · Boost heat (every climate to 21°) · TVs off.
	 * Discovery-aware: targets every entity that matches the macro
	 * (every light across every area, every climate across every
	 * lighting/heat area, every TV across every area). Disabled state
	 * shown when no targets exist (e.g. no climate entities → Boost
	 * heat is dimmed + click is no-op).
	 *
	 * Lifted from /wall's existing inline implementation. /wall's
	 * refactored composition will use this primitive in place of the
	 * inline `<div class="primary-tiles">` block.
	 */
	import { discovery } from '$lib/discovery';
	import { callOff, callService } from '$lib/ha/actions';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { MacroGridBlockConfig } from '../types';

	let { config }: { config: MacroGridBlockConfig } = $props();

	const lightingAreas = $derived(discovery.areasForPage('lights'));
	const climateAreas = $derived(discovery.areasForPage('heat'));
	const tvAreas = $derived(discovery.areasForPage('tv'));
	const allTVs = $derived(tvAreas.flatMap((a) => a.tvs));
	const anyLights = $derived(lightingAreas.some((a) => a.lights.length > 0));
	const anyClimate = $derived(climateAreas.some((a) => a.climates.length > 0));

	async function allLightsOff() {
		for (const a of lightingAreas) for (const l of a.lights) await callOff(l.id);
	}
	async function allTvsOff() {
		for (const t of allTVs) await callOff(t.id);
	}
	async function boostAllHeat() {
		for (const a of climateAreas) {
			for (const c of a.climates) {
				await callService(
					'climate',
					'set_temperature',
					{ entity_id: c.id },
					{ temperature: 21 }
				);
			}
		}
	}
</script>

<section class="block macro-block">
	{#if config.label}
		<OutLine label={config.label} />
	{/if}
	<div class="primary-tiles">
		<button
			class="primary-tile"
			type="button"
			onclick={allLightsOff}
			disabled={!anyLights}
		>
			<span class="primary-icon" aria-hidden="true">○</span>
			<span class="primary-label">All lights off</span>
		</button>
		<button
			class="primary-tile"
			type="button"
			onclick={boostAllHeat}
			disabled={!anyClimate}
		>
			<span class="primary-icon" aria-hidden="true">◐</span>
			<span class="primary-label">Boost heat</span>
		</button>
		<button
			class="primary-tile"
			type="button"
			onclick={allTvsOff}
			disabled={allTVs.length === 0}
		>
			<span class="primary-icon" aria-hidden="true">▢</span>
			<span class="primary-label">TVs off</span>
		</button>
	</div>
</section>

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* Lifted verbatim from /wall — keeps the visual register identical.
	 * Margin-bottom removed; PageShell.gap handles inter-block spacing. */
	.primary-tiles {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}

	@media (min-width: 540px) {
		.primary-tiles {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	.primary-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-4);
		min-height: 180px;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.primary-tile:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.primary-tile:disabled {
		opacity: 0.4;
	}

	.primary-icon {
		font-size: 3rem;
		line-height: 1;
		color: var(--accent);
	}

	.primary-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		color: var(--accent);
	}
</style>
