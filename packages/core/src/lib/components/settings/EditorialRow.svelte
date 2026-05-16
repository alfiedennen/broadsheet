<script lang="ts">
	/**
	 * EditorialRow — primary label + optional secondary status + CTA
	 * chips, plus an optional tap-to-expand `details` snippet.
	 *
	 * The row shape every native HA-settings surface composes for
	 * its list items (one integration, one device, one addon, one
	 * log entry). Keeps every row visually consistent without each
	 * surface re-deciding spacing + typography.
	 *
	 * Pattern:
	 *   <EditorialRow>
	 *     {#snippet label()}Sonos{/snippet}
	 *     {#snippet status()}reporting errors since Tuesday{/snippet}
	 *     {#snippet actions()}
	 *       <button onclick={reload}>Reload</button>
	 *       <button onclick={remove}>Remove</button>
	 *     {/snippet}
	 *     {#snippet details()}
	 *       <p>WebSocket connection refused — last seen 2 hr ago</p>
	 *     {/snippet}
	 *   </EditorialRow>
	 *
	 * Spec: docs/plans/plan-ha-settings-native-uis.md.
	 */

	import type { Snippet } from 'svelte';

	let {
		label,
		status,
		actions,
		details,
		tone = 'default',
		startExpanded = false
	}: {
		/** Italic display title (e.g. integration name, device name) */
		label: Snippet;
		/** Optional secondary line — status, last-seen, etc */
		status?: Snippet;
		/** Optional inline CTA chips (Reload / Remove / Configure / etc) */
		actions?: Snippet;
		/** Optional tap-to-expand body — error stack, sub-entities, etc */
		details?: Snippet;
		/** Tonal accent on the label (alert highlights errors red) */
		tone?: 'default' | 'alert' | 'positive' | 'muted';
		/** Default expanded state for the details reveal */
		startExpanded?: boolean;
	} = $props();

	// $state initializer captures the initial value only — that's
	// exactly what we want here: the prop seeds the open/closed state
	// once on mount, then user toggles take over. Suppress Svelte's
	// closure-reference warning since this is intentional.
	// svelte-ignore state_referenced_locally
	let expanded = $state(startExpanded);

	function toggle() {
		if (details) expanded = !expanded;
	}
</script>

<article class="editorial-row" data-tone={tone} data-has-details={details ? 'true' : 'false'}>
	<button
		type="button"
		class="row-head"
		onclick={toggle}
		aria-expanded={expanded}
		disabled={!details}
	>
		<div class="row-label-stack">
			<span class="row-label">{@render label()}</span>
			{#if status}
				<span class="row-status">{@render status()}</span>
			{/if}
		</div>
		{#if details}
			<span class="row-chev" aria-hidden="true">{expanded ? '−' : '+'}</span>
		{/if}
	</button>

	{#if actions}
		<div class="row-actions">
			{@render actions()}
		</div>
	{/if}

	{#if details && expanded}
		<div class="row-details">
			{@render details()}
		</div>
	{/if}
</article>

<style>
	.editorial-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		transition: border-color var(--ease-quick);
	}

	.editorial-row:hover {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--rule));
	}

	.editorial-row[data-tone='alert'] {
		border-left: 3px solid var(--state-alert, #bf3a30);
	}
	.editorial-row[data-tone='positive'] {
		border-left: 3px solid var(--state-positive, #6a8a4d);
	}
	.editorial-row[data-tone='muted'] {
		opacity: 0.6;
	}

	.row-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		background: transparent;
		text-align: left;
		padding: 0;
	}

	.row-head[disabled] {
		cursor: default;
	}

	.row-head:not([disabled]):hover .row-chev {
		color: var(--accent);
	}

	.row-label-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1;
		min-width: 0;
	}

	.row-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		color: var(--accent);
		line-height: 1.2;
	}

	.row-status {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.row-chev {
		font-family: var(--font-mono);
		font-size: 1.2rem;
		color: var(--fg-muted);
		width: 24px;
		text-align: center;
		transition: color var(--ease-quick);
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--rule);
	}

	.row-actions :global(button),
	.row-actions :global(a) {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
		text-decoration: none;
		transition:
			border-color var(--ease-quick),
			color var(--ease-quick);
	}

	.row-actions :global(button:hover),
	.row-actions :global(a:hover) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.row-actions :global(button.destructive) {
		color: var(--state-alert, #bf3a30);
	}

	.row-details {
		padding-top: var(--space-2);
		border-top: 1px solid var(--rule);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
		line-height: var(--leading-snug);
	}
</style>
