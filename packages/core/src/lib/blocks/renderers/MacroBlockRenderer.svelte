<script lang="ts">
	/**
	 * 0.9.1 — composed macro tile.
	 *
	 * A single tile that fires N service calls in order when tapped.
	 * Composed by the user in the things-first editor's macro
	 * composer: name → pick actions via the things browser → save.
	 *
	 * Distinct from the existing `macro-grid` block (broadsheet's
	 * hardcoded 3-tile All-lights-off / Boost-heat / TVs-off set).
	 * Pages authored in things-first use one or more `macro` blocks
	 * per user-defined house-wide action.
	 *
	 * Tap-to-fire is synchronous + sequential — each step waits for
	 * the previous to return before firing. Long macros show a
	 * brief "firing… (N of N)" state. On the next render after
	 * completion the tile returns to its resting state.
	 *
	 * Errors mid-sequence stop the remaining steps + surface a toast
	 * naming the failing step. Partial-completion is the honest
	 * default — better than rolling back service calls that already
	 * affected the house.
	 */

	import { showToast } from '$lib/stores/toast.svelte';
	import { callService } from '$lib/ha/actions';
	import type { MacroBlockConfig } from '../types';

	let { config }: { config: MacroBlockConfig } = $props();

	let firing = $state<number | null>(null);

	async function fire() {
		if (firing !== null) return;
		const steps = config.steps;
		if (steps.length === 0) {
			showToast(`${config.label}: no steps`, 'error');
			return;
		}
		for (let i = 0; i < steps.length; i++) {
			firing = i;
			const step = steps[i];
			const result = await callService(
				step.service.domain,
				step.service.service,
				step.service.target,
				step.service.data
			);
			if (!result.success) {
				firing = null;
				showToast(
					`${config.label}: step ${i + 1} (${step.description}) failed — ${result.reason ?? 'unknown'}`,
					'error'
				);
				return;
			}
		}
		firing = null;
		showToast(`${config.label} fired`, 'success');
	}

	const status = $derived.by(() => {
		if (firing === null) return config.detail ?? `→ ${config.steps.length} action${config.steps.length === 1 ? '' : 's'}`;
		return `firing ${firing + 1} of ${config.steps.length}…`;
	});
</script>

<button
	class="macro-tile"
	type="button"
	onclick={fire}
	disabled={firing !== null || config.steps.length === 0}
	title={config.label}
>
	<span class="macro-icon" aria-hidden="true">{config.icon ?? '◆'}</span>
	<span class="macro-meta">
		<span class="macro-label">{config.label}</span>
		<span class="macro-detail">{status}</span>
	</span>
</button>

<style>
	.macro-tile {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: center;
		width: 100%;
		min-height: 96px;
		padding: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		cursor: pointer;
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.macro-tile:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}

	.macro-tile:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.macro-icon {
		font-family: var(--font-display);
		font-size: 1.8rem;
		color: var(--accent);
		line-height: 1;
	}

	.macro-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.macro-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		color: var(--accent);
	}

	.macro-detail {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}
</style>
