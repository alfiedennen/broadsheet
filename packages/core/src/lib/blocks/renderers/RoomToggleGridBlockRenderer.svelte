<script lang="ts">
	/**
	 * RoomToggleGridBlockRenderer — one tile per discovered lighting
	 * area, tap to toggle every light in that area.
	 *
	 * Lifted from /wall. The toggle action: if EVERY light in the area
	 * is on, turn them all off; otherwise turn them all on. Matches
	 * the 'tap = unify state' affordance users expect from a single
	 * room control.
	 */
	import { discovery } from '$lib/discovery';
	import type { DomainArea } from '$lib/discovery';
	import { callOff, callOn } from '$lib/ha/actions';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { RoomToggleGridBlockConfig } from '../types';

	let { config }: { config: RoomToggleGridBlockConfig } = $props();

	const lightingAreas = $derived(discovery.areasForPage('lights'));

	function areaIsOn(a: DomainArea): boolean {
		return a.lights.some((l) => l.state?.state === 'on');
	}

	async function toggleArea(a: DomainArea) {
		const allOn = a.lights.every((l) => l.state?.state === 'on');
		for (const l of a.lights) {
			if (allOn) await callOff(l.id);
			else await callOn(l.id);
		}
	}
</script>

{#if lightingAreas.length > 0}
	<section class="block room-block">
		{#if config.label}
			<OutLine label={config.label} />
		{/if}
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
	</section>
{/if}

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.room-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}

	/* 0.8.6 polish: justify-content: center so the name + state stack
	 * sits visually in the middle of the tile instead of pinned to the
	 * top (the dot is absolute-positioned so it isn't affected). */
	.room-tile {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-4);
		min-height: 110px;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		text-align: left;
		cursor: pointer;
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
</style>
