<script lang="ts">
	/**
	 * `/wall` — dense action grid for hallway / kitchen tablet.
	 *
	 * Optimised for tablet portrait (Fire HD 10 = 1200×1920) but works
	 * on phone too. The whole point: every common action is one tap
	 * away. No reveals, no scrolling for the hot ten things.
	 *
	 * Composition:
	 *   1. Three BIG primary tiles: All lights off / Boost heat / All TVs off
	 *   2. Per-room light toggles (every lighting area, single tap to flip)
	 *   3. Scenes row
	 *   4. Heat boost row per area (smaller than primary)
	 */

	import { discovery } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import { callService, callOff, callOn } from '$lib/ha/actions';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const lightingAreas = $derived(discovery.areasForPage('lights'));
	const climateAreas = $derived(discovery.areasForPage('heat'));
	const tvAreas = $derived(discovery.areasForPage('tv'));
	const allTVs = $derived(tvAreas.flatMap((a) => a.tvs));
	const allScenes = $derived(discovery.areas.flatMap((a) => a.scenes).slice(0, 8));

	function areaIsOn(a: DomainArea): boolean {
		return a.lights.some((l) => l.state?.state === 'on');
	}

	async function allLightsOff() {
		for (const a of lightingAreas) {
			for (const l of a.lights) {
				await callOff(l.id);
			}
		}
	}

	async function allTvsOff() {
		for (const t of allTVs) {
			await callOff(t.id);
		}
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

	async function toggleArea(a: DomainArea) {
		const allOn = a.lights.every((l) => l.state?.state === 'on');
		for (const l of a.lights) {
			if (allOn) await callOff(l.id);
			else await callOn(l.id);
		}
	}

	async function activateScene(s: DomainEntity) {
		await callOn(s.id);
	}

	async function boostArea(a: DomainArea) {
		for (const c of a.climates) {
			await callService(
				'climate',
				'set_temperature',
				{ entity_id: c.id },
				{ temperature: 21 }
			);
		}
	}
</script>

<svelte:head>
	<title>Wall · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Wall" number={7} />
		{/snippet}
		{#snippet headline()}
			Everything within reach.
		{/snippet}
	</Hero>

	<OutLine label="Macros" />
	<div class="primary-tiles">
		<button class="primary-tile lights" type="button" onclick={allLightsOff}>
			<span class="primary-icon" aria-hidden="true">○</span>
			<span class="primary-label">All lights off</span>
		</button>
		<button class="primary-tile heat" type="button" onclick={boostAllHeat}>
			<span class="primary-icon" aria-hidden="true">◐</span>
			<span class="primary-label">Boost heat</span>
		</button>
		<button class="primary-tile tv" type="button" onclick={allTvsOff} disabled={allTVs.length === 0}>
			<span class="primary-icon" aria-hidden="true">▢</span>
			<span class="primary-label">TVs off</span>
		</button>
	</div>

	{#if lightingAreas.length > 0}
		<OutLine label="Rooms" />
		<div class="room-grid">
			{#each lightingAreas as a (a.id)}
				<button
					class="room-tile"
					type="button"
					onclick={() => toggleArea(a)}
					data-on={areaIsOn(a) ? 'true' : 'false'}
				>
					<span class="dot" aria-hidden="true"></span>
					<span class="room-name">{a.name}</span>
					<span class="room-state">
						{#if areaIsOn(a)}
							{a.lights.filter((l) => l.state?.state === 'on').length} of {a.lights.length} on
						{:else}
							off
						{/if}
					</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if allScenes.length > 0}
		<OutLine label="Scenes" />
		<div class="scene-row">
			{#each allScenes as s (s.id)}
				<button class="scene-pill" type="button" onclick={() => activateScene(s)}>
					{s.name}
				</button>
			{/each}
		</div>
	{/if}

	{#if climateAreas.length > 0}
		<OutLine label="Boost" />
		<div class="boost-row">
			{#each climateAreas as a (a.id)}
				<button class="boost-tile" type="button" onclick={() => boostArea(a)}>
					<span class="boost-name">{a.name}</span>
					<span class="boost-detail">→ 21°</span>
				</button>
			{/each}
		</div>
	{/if}
</PageShell>

<style>
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

	.room-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}

	.room-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		min-height: 110px;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		text-align: left;
		transition: border-color var(--ease-quick), background var(--ease-quick);
		position: relative;
	}

	.room-tile:hover {
		border-color: var(--accent);
	}

	.room-tile[data-on='true'] {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--fg-dim);
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
	}

	.room-tile[data-on='true'] .dot {
		background: var(--state-on);
		box-shadow: 0 0 12px var(--state-on);
	}

	.room-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--fg);
	}

	.room-tile[data-on='true'] .room-name {
		color: var(--accent);
	}

	.room-state {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.scene-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.scene-pill {
		padding: var(--space-3) var(--space-5);
		font-family: var(--font-caption);
		font-size: var(--text-body);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		background: var(--bg-card);
		min-height: 44px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.scene-pill:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.boost-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-2);
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
