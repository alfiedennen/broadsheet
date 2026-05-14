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
	 * P2 stub: a full-bleed cool-toned field, deliberately distinct
	 * from ProceduralPainting's warm gradient so the swap is visible,
	 * plus a corner marker. P4 replaces this with the real axonometric
	 * multi-person painting ported from harold-home.
	 */
	import type { DomainPerson } from '@broadsheet/core';

	// `DomainPerson` carries identity + presence-sensor metadata, not
	// live home/away state — that's resolved against the states map,
	// which a pure renderer doesn't get. The P4 renderer will take
	// resolved presence as a prop; the P2 stub just counts who's
	// tracked, which is enough to prove the swap.
	let { persons = [] }: { persons?: DomainPerson[] } = $props();
</script>

<div class="emanation" aria-hidden="true">
	<div class="layer layer-1"></div>
	<div class="layer layer-2"></div>
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
		background: hsl(220 14% 9%);
	}

	.layer {
		position: absolute;
		inset: -10%;
		background-repeat: no-repeat;
		background-size: 65% 65%;
		filter: blur(55px);
		opacity: 0.75;
	}

	.layer-1 {
		background-image: radial-gradient(circle at 35% 45%, hsl(205 22% 22%), transparent 70%);
		animation: drift-a 48s ease-in-out infinite alternate;
	}

	.layer-2 {
		background-image: radial-gradient(circle at 68% 58%, hsl(255 18% 20%), transparent 65%);
		animation: drift-b 61s ease-in-out infinite alternate;
	}

	@keyframes drift-a {
		from {
			transform: translate(-4%, -4%) scale(1);
		}
		to {
			transform: translate(7%, 5%) scale(1.18);
		}
	}
	@keyframes drift-b {
		from {
			transform: translate(5%, 4%) scale(1.1);
		}
		to {
			transform: translate(-7%, -3%) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.layer {
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
		opacity: 0.55;
		z-index: 1;
	}
</style>
