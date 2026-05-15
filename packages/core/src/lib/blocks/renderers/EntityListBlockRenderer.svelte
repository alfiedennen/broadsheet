<script lang="ts">
	/**
	 * EntityListBlockRenderer — vertical list of entities + states.
	 *
	 * The Lovelace-importer landing zone for `entities` cards. Each
	 * row reads from discoveryStore.states at render time so values
	 * stay live. Entities that don't exist render with a "—" state +
	 * dim style so authors notice typos / decommissioned entities.
	 *
	 * Editorial register:
	 *   - Italic display name (matches the rest of broadsheet)
	 *   - Tabular-num state value (so digits align across rows)
	 *   - Hairline rule between rows (warm rule, same as other lists)
	 *   - Optional icon column (mdi:* from entity.icon attribute)
	 *
	 * Intentionally NOT a control — no buttons, no toggles. If the
	 * author wants taps, that's action-grid territory.
	 */
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { EntityListBlockConfig } from '../types';

	let { config }: { config: EntityListBlockConfig } = $props();

	const showIcon = $derived(config.showIcon !== false);

	function nameFor(id: string): string {
		const override = config.nameOverrides?.[id];
		if (override) return override;
		const fn = discoveryStore.states[id]?.attributes?.friendly_name;
		if (typeof fn === 'string' && fn) return fn;
		// Fall back to the id stem
		return id.split('.')[1]?.replace(/_/g, ' ') ?? id;
	}

	function stateFor(id: string): string {
		const s = discoveryStore.states[id];
		if (!s || s.state === 'unknown' || s.state === 'unavailable') return '—';
		const uom = s.attributes?.unit_of_measurement as string | undefined;
		return uom ? `${s.state} ${uom}` : s.state;
	}

	function iconFor(id: string): string | null {
		const ic = discoveryStore.states[id]?.attributes?.icon;
		return typeof ic === 'string' ? ic : null;
	}

	function isMissing(id: string): boolean {
		const s = discoveryStore.states[id];
		return !s || s.state === 'unknown' || s.state === 'unavailable';
	}
</script>

{#if config.label}
	<OutLine label={config.label} />
{/if}

<ul class="entity-list">
	{#each config.entities as id (id)}
		<li class="entity-row" class:missing={isMissing(id)}>
			{#if showIcon}
				<span class="entity-icon" aria-hidden="true">
					{#if iconFor(id)}
						<!-- mdi:* identifiers — render as small chip -->
						<span class="mdi-chip">{iconFor(id)?.replace(/^mdi:/, '')}</span>
					{:else}
						<span class="mdi-chip placeholder">·</span>
					{/if}
				</span>
			{/if}
			<span class="entity-name">{nameFor(id)}</span>
			<span class="entity-state">{stateFor(id)}</span>
		</li>
	{/each}
</ul>

<style>
	.entity-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		margin: 0 0 var(--space-6);
		padding: 0;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--bg-card);
	}

	.entity-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--rule);
	}

	.entity-row:last-child {
		border-bottom: none;
	}

	.entity-row.missing {
		opacity: 0.5;
	}

	.entity-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
	}

	.mdi-chip {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: lowercase;
		color: var(--fg-muted);
		max-width: 60px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mdi-chip.placeholder {
		color: var(--fg-dim);
		font-size: 0.9rem;
	}

	.entity-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--fg);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.entity-state {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-body);
		color: var(--accent);
		text-align: right;
	}

	.entity-row.missing .entity-state {
		color: var(--fg-dim);
	}
</style>
