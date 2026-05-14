<script lang="ts">
	/**
	 * MultiPersonPainting — emanations' renderer, P2 stub.
	 *
	 * A renderer is a component a plugin exposes for OTHER pages to
	 * use. Core's `/` page does `useRenderer('multi-person-painting')`
	 * and swaps this in when emanations is active, falling back to
	 * core's ProceduralPainting otherwise.
	 *
	 * Per the contract: a renderer is a pure component — props in,
	 * render out, no side effects on mount. It takes `persons` rather
	 * than reaching into `discovery.*` directly (that keeps it
	 * reusable as a Lovelace strategy in v0.2).
	 *
	 * P2 stub: deliberately VISIBLE — a present, saturated field with
	 * each person rendered as a soft "emanation" orb, so toggling
	 * emanations on/off in /settings/plugins produces an unmistakable
	 * change on `/`. It also actually consumes the `persons` prop, so
	 * it reads as "the multi-person renderer", not just a gradient.
	 * P4 replaces this with the real axonometric multi-person painting
	 * ported from harold-home.
	 */
	import type { DomainPerson } from '@broadsheet/core';

	// `DomainPerson` carries identity + presence-sensor metadata, not
	// live home/away state — that's resolved against the states map,
	// which a pure renderer doesn't get. The P4 renderer will take
	// resolved presence as a prop; the P2 stub just lays out who's
	// tracked, which is enough to prove the swap.
	let { persons = [] }: { persons?: DomainPerson[] } = $props();

	// A warm hue per person, spread around the wheel — deterministic
	// from index so the layout is stable.
	function hueFor(i: number): number {
		return (28 + i * 67) % 360;
	}
</script>

<div class="emanation" aria-hidden="true">
	<div class="field"></div>
	{#each persons as person, i (person.id)}
		{@const hue = hueFor(i)}
		{@const x = persons.length === 1 ? 50 : 22 + (i * 56) / Math.max(1, persons.length - 1)}
		<div
			class="orb"
			style="--hue: {hue}; --x: {x}%; --delay: {i * 1.7}s;"
		>
			<span class="orb-name">{person.name}</span>
		</div>
	{/each}
</div>
<p class="marker">
	emanations · {persons.length}
	{persons.length === 1 ? 'person' : 'people'}
</p>

<style>
	.emanation {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: linear-gradient(160deg, hsl(248 28% 16%), hsl(218 32% 11%) 60%, hsl(266 26% 13%));
	}

	/* A broad moving sheen so the field reads as alive, not flat. */
	.field {
		position: absolute;
		inset: -20%;
		background: radial-gradient(circle at 50% 38%, hsl(210 40% 32% / 0.55), transparent 62%);
		filter: blur(40px);
		animation: sheen 34s ease-in-out infinite alternate;
	}

	@keyframes sheen {
		from {
			transform: translate(-6%, -4%) scale(1);
		}
		to {
			transform: translate(7%, 6%) scale(1.18);
		}
	}

	/* One soft orb per person — clearly visible, hue-spread. */
	.orb {
		position: absolute;
		top: 50%;
		left: var(--x);
		width: 46vmin;
		height: 46vmin;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(
			circle,
			hsl(var(--hue) 58% 52% / 0.62),
			hsl(var(--hue) 52% 32% / 0.28) 45%,
			transparent 70%
		);
		filter: blur(8px);
		display: grid;
		place-items: center;
		animation: float 16s ease-in-out infinite alternate;
		animation-delay: var(--delay);
	}

	@keyframes float {
		from {
			transform: translate(-50%, -54%) scale(0.96);
		}
		to {
			transform: translate(-50%, -46%) scale(1.06);
		}
	}

	.orb-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: hsl(0 0% 100% / 0.7);
		text-shadow: 0 2px 14px hsl(0 0% 0% / 0.55);
	}

	@media (prefers-reduced-motion: reduce) {
		.field,
		.orb {
			animation: none;
		}
	}

	.marker {
		position: absolute;
		left: var(--space-4);
		bottom: var(--space-4);
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		opacity: 0.7;
		z-index: 1;
	}
</style>
