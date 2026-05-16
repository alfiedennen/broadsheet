<script lang="ts">
	/**
	 * InlinePin — Theme H affordance primitive.
	 *
	 * Wraps an auto-inferred value with a small ✏️ pencil that
	 * appears on hover/focus. Tapping opens an inline popover picker
	 * (short lists, in-place edit) OR navigates somewhere with
	 * context (long lists, complex pickers).
	 *
	 * The pencil's job: communicate "this was auto-decided + here's
	 * how to override". Subtle by default, present on engagement.
	 *
	 * Three variants by prop:
	 *   <InlinePin value="Office" label="rename room"
	 *              {children}/>                    ← popover (children = picker)
	 *   <InlinePin value="Office" label="..." href="/settings/.../#area-id"/>
	 *                                              ← navigate-with-context
	 *   <InlinePin value="Office" label="..." onclick={fn}/>
	 *                                              ← arbitrary click handler
	 *
	 * Confidence indicator (subtle dotted underline) shows when the
	 * value was auto-picked + might be wrong. Set `confidence="low"`
	 * for low-trust auto-picks; default ('auto') no underline; use
	 * 'overridden' (solid underline) when the user has curated it.
	 *
	 * Spec: docs/plans/plan-theme-H-inline-overrides.md.
	 */
	import type { Snippet } from 'svelte';

	let {
		value,
		label,
		confidence = 'auto',
		children,
		onclick,
		href
	}: {
		/** The auto-inferred value to display. */
		value: string;
		/** a11y label for the pencil affordance. */
		label: string;
		/** Visual indicator of how trustworthy the auto-pick is. */
		confidence?: 'auto' | 'low' | 'overridden';
		/**
		 * Picker snippet for inline-popover variant.
		 * Receives a `close` callback the picker can invoke after a
		 * successful commit so the popover dismisses without an extra
		 * tap-outside.
		 */
		children?: Snippet<[() => void]>;
		/** Click handler for arbitrary-click variant. */
		onclick?: () => void;
		/** Href for navigate-with-context variant. */
		href?: string;
	} = $props();

	// Inline-popover state. <details> handles open/close natively but
	// we want to be able to close it programmatically when the picker
	// commits (so the user doesn't have to tap-pencil + tap-elsewhere).
	let popoverOpen = $state(false);
	function closePopover() {
		popoverOpen = false;
	}
</script>

<span class="inline-pin" data-confidence={confidence}>
	<span class="pin-value">{value}</span>
	{#if children}
		<details class="pin-popover" bind:open={popoverOpen}>
			<summary
				class="pin-affordance"
				aria-label={label}
				title={label}
			>✏️</summary>
			<div class="pin-popover-body">
				{@render children(closePopover)}
			</div>
		</details>
	{:else if href}
		<a class="pin-affordance" aria-label={label} title={label} {href}>✏️</a>
	{:else if onclick}
		<button
			type="button"
			class="pin-affordance"
			aria-label={label}
			title={label}
			{onclick}
		>✏️</button>
	{/if}
</span>

<style>
	.inline-pin {
		display: inline-flex;
		align-items: baseline;
		gap: 0.25em;
		position: relative;
	}

	/* .pin-value has no resting style — confidence-indicator rules
	 * below add text-decoration as needed. */
	.inline-pin[data-confidence='low'] .pin-value {
		text-decoration: underline dotted var(--fg-muted);
		text-underline-offset: 0.25em;
	}

	.inline-pin[data-confidence='overridden'] .pin-value {
		text-decoration: underline solid var(--accent-glow, var(--fg-muted));
		text-underline-offset: 0.25em;
	}

	.pin-affordance {
		opacity: 0;
		font-size: 0.7em;
		line-height: 1;
		padding: 0.15em 0.2em;
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: opacity var(--ease-quick), color var(--ease-quick);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}

	.inline-pin:hover .pin-affordance,
	.inline-pin:focus-within .pin-affordance {
		opacity: 0.6;
	}

	.pin-affordance:hover,
	.pin-affordance:focus {
		opacity: 1 !important;
		color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
		outline: none;
	}

	/* On touch devices there's no hover — keep affordance very faintly
	 * visible at rest so it's discoverable without hover-state. */
	@media (hover: none) {
		.pin-affordance {
			opacity: 0.3;
		}
	}

	/* Inline-popover styling — drops below the value, soft surface
	 * with the warm rule the rest of broadsheet uses. */
	.pin-popover {
		display: inline-block;
		position: relative;
	}

	.pin-popover > summary {
		list-style: none;
	}

	.pin-popover > summary::-webkit-details-marker {
		display: none;
	}

	.pin-popover-body {
		position: absolute;
		top: calc(100% + 0.5em);
		left: 0;
		min-width: 18rem;
		max-width: min(28rem, 90vw);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card, var(--bg));
		border: 1px solid var(--rule);
		border-radius: var(--radius-md, 4px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		z-index: 50;
		font-size: 1rem; /* reset from the smaller pencil */
	}
</style>
