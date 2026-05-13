<script lang="ts">
	/**
	 * RoomReveal — per-area expansion with the entities that page cares
	 * about. Collapsed view shows the area name + a one-line state
	 * summary; expanded view reveals the controls.
	 *
	 * Pages pass entity selection via a `pick` snippet — RoomReveal
	 * doesn't know whether you're rendering lights, climate, etc.
	 *
	 * Pattern from harold-home: prose summary first, controls
	 * progressively disclosed. "library is on (3 lamps, 60%)" — you
	 * don't need to see sliders unless you want to change them.
	 */

	import type { Snippet } from 'svelte';
	import type { DomainArea } from '$lib/discovery';

	let {
		area,
		summary,
		controls
	}: {
		area: DomainArea;
		summary: Snippet<[DomainArea]>;
		controls: Snippet<[DomainArea]>;
	} = $props();

	// All rooms start closed — user expands the ones they want to act on.
	// Discoverable via the chevron + hover affordance on the head row.
	let open = $state(false);

	function toggle() {
		open = !open;
	}
</script>

<section class="reveal" class:open data-area-id={area.id}>
	<button class="reveal-head" type="button" aria-expanded={open} onclick={toggle}>
		<div class="head-left">
			<h3 class="area-name">{area.name}</h3>
			<p class="area-summary">{@render summary(area)}</p>
		</div>
		<span class="chev" aria-hidden="true">{open ? '−' : '+'}</span>
	</button>

	{#if open}
		<div class="reveal-body">
			{@render controls(area)}
		</div>
	{/if}
</section>

<style>
	.reveal {
		border-bottom: 1px solid var(--rule);
	}

	.reveal:last-child {
		border-bottom: none;
	}

	.reveal-head {
		width: 100%;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-2);
		text-align: left;
		color: var(--fg);
		transition: color var(--ease-quick);
	}

	.reveal-head:hover {
		color: var(--accent);
	}

	.head-left {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.area-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		font-weight: 400;
		line-height: 1.2;
		color: inherit;
	}

	.area-summary {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: 0;
	}

	.reveal.open .area-name {
		color: var(--accent);
	}

	.chev {
		font-family: var(--font-mono);
		font-size: 1.4rem;
		color: var(--fg-muted);
		flex: 0 0 auto;
		line-height: 1;
		padding-top: 0.3rem;
	}

	.reveal-body {
		padding: var(--space-2) var(--space-2) var(--space-6);
		animation: revealOpen 200ms ease-out;
	}

	@keyframes revealOpen {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
