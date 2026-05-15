<script lang="ts">
	/**
	 * ActionGridBlockRenderer — variable-length grid of action tiles.
	 *
	 * Each tile carries a typed service-call spec; tap fires
	 * callService through the standard action pipeline. Optional
	 * stateBinding makes the tile reflect a live entity's state —
	 * highlights when the entity is in `activeStates` (default
	 * ['on', 'playing', 'home']).
	 *
	 * Three sizes: small (chip pill row), medium (default 110px tile),
	 * large (chunky 180px tile, mirrors macro-grid). Layout is auto-
	 * fill grid so tiles wrap on narrow viewports.
	 *
	 * Editorial register: italic display label, mono detail, hover =
	 * accent border. Active state = accent fill + bold border.
	 */
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { callService } from '$lib/ha/actions';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { ActionGridBlockConfig, ActionGridItem } from '../types';

	let { config }: { config: ActionGridBlockConfig } = $props();

	const size = $derived(config.size ?? 'medium');

	const DEFAULT_ACTIVE_STATES = ['on', 'playing', 'home', 'open', 'unlocked'];

	let busy = $state<number | null>(null);

	function isActive(item: ActionGridItem): boolean {
		const b = item.stateBinding;
		if (!b) return false;
		const s = discoveryStore.states[b.entityId]?.state;
		if (!s) return false;
		const active = b.activeStates ?? DEFAULT_ACTIVE_STATES;
		return active.includes(s);
	}

	async function fire(item: ActionGridItem, idx: number) {
		busy = idx;
		try {
			const { domain, service, data, target } = item.service;
			await callService(domain, service, target ?? {}, data ?? {});
		} finally {
			setTimeout(() => (busy = null), 600);
		}
	}
</script>

{#if config.label && config.actions.length > 0}
	<OutLine label={config.label} />
{/if}

{#if config.actions.length > 0}
	<div class="action-grid" data-size={size}>
		{#each config.actions as item, i (i)}
			<button
				type="button"
				class="action-tile"
				class:busy={busy === i}
				class:active={isActive(item)}
				onclick={() => fire(item, i)}
			>
				{#if item.icon}
					<span class="tile-icon" aria-hidden="true">
						{item.icon.replace(/^mdi:/, '')}
					</span>
				{/if}
				<span class="tile-label">{item.label}</span>
				{#if item.detail}
					<span class="tile-detail">{item.detail}</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.action-grid {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}

	.action-grid[data-size='small'] {
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	}
	.action-grid[data-size='medium'] {
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}
	.action-grid[data-size='large'] {
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}
	@media (min-width: 540px) {
		.action-grid[data-size='large'] {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		}
	}

	.action-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		min-height: 56px;
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		transition: border-color var(--ease-quick), background var(--ease-quick),
			color var(--ease-quick);
	}

	.action-grid[data-size='medium'] .action-tile {
		min-height: 110px;
	}
	.action-grid[data-size='large'] .action-tile {
		min-height: 180px;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-4);
	}

	.action-tile:hover {
		border-color: var(--accent);
	}

	.action-tile.active {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.action-tile.busy {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}

	.tile-icon {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
	}

	.action-grid[data-size='large'] .tile-icon {
		font-size: 1.2rem;
		color: var(--accent);
	}

	.tile-label {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
	}

	.action-grid[data-size='small'] .tile-label {
		font-size: 1rem;
	}
	.action-grid[data-size='medium'] .tile-label {
		font-size: 1.2rem;
	}
	.action-grid[data-size='large'] .tile-label {
		font-size: 1.6rem;
	}

	.action-tile.busy .tile-label,
	.action-tile.busy .tile-detail,
	.action-tile.busy .tile-icon {
		color: var(--bg);
	}

	.tile-detail {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.action-tile.active .tile-detail {
		color: var(--accent);
	}
</style>
