<script lang="ts">
	/**
	 * SettingsRow — a label + optional hint on the left, a control
	 * snippet on the right. The layout primitive plugin settings
	 * panels compose with (re-exported from `@broadsheet/core`), so a
	 * plugin's config UI inherits the editorial register for free.
	 */
	import type { Snippet } from 'svelte';

	let {
		label,
		hint,
		children
	}: {
		label: string;
		hint?: string;
		children: Snippet;
	} = $props();
</script>

<div class="settings-row">
	<div class="settings-row-label">
		<span class="label">{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</div>
	<div class="settings-row-control">
		{@render children()}
	</div>
</div>

<style>
	/* Grid layout, not flex.
	 *
	 * V3.2 dogfood found the flex version crushed the label column to
	 * per-character width when the control side was wide (e.g.
	 * password input + "Get a key" link side-by-side). Labels like
	 * "TMDB API key" rendered as "TM / API / key" stacked vertically,
	 * and the hint text below stacked the same way.
	 *
	 * Grid gives predictable column widths: label gets a min 10rem /
	 * max 18rem column that can grow with content, control takes the
	 * rest. Both columns can wrap their internal text naturally.
	 */
	.settings-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-2);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--rule);
	}

	@media (min-width: 540px) {
		.settings-row {
			grid-template-columns: minmax(10rem, 18rem) 1fr;
			gap: var(--space-6);
			align-items: baseline;
		}
	}

	.settings-row:last-child {
		border-bottom: none;
	}

	.settings-row-label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.label {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.hint {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}

	.settings-row-control {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex-wrap: wrap;
	}
</style>
