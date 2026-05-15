<script lang="ts">
	/**
	 * MultiPersonPainting — emanations' renderer.
	 *
	 * A pure component: props in, render out, no side effects on
	 * mount, no reaching into `discovery.*` (that keeps it reusable as
	 * a Lovelace strategy in v0.2). It's exposed via `useRenderer` so
	 * core's `/` page can opportunistically upgrade to it.
	 *
	 * Two modes, decided by props:
	 *  - PROCEDURAL (default) — a present, saturated field with one
	 *    soft hue-spread orb per person. Works for everyone, no assets.
	 *    This is what core's `/` gets (it passes only `persons`).
	 *  - PAINTING — when `paintings` (already-resolved asset URLs) is
	 *    non-empty, the first painting is the full-bleed backdrop with
	 *    the person orbs layered over a scrim. emanations' own page
	 *    passes this, sourced from its discoveryContributor.
	 *
	 * The page that owns the painting set resolves the URLs (via
	 * pluginAssetUrl) and passes them in — the renderer never resolves
	 * assets or reads curation itself.
	 */
	import type { DomainPerson } from '@broadsheet/core';

	let {
		persons = [],
		paintings = []
	}: {
		persons?: DomainPerson[];
		/** Already-resolved painting asset URLs. Empty → procedural. */
		paintings?: string[];
	} = $props();

	const paintingMode = $derived(paintings.length > 0);

	function hueFor(i: number): number {
		return (28 + i * 67) % 360;
	}
	function personX(i: number, n: number): number {
		if (n <= 1) return 50;
		return 30 + (i * 40) / (n - 1);
	}
</script>

<div class="emanation" class:painting-mode={paintingMode} aria-hidden="true">
	{#if paintingMode}
		<img class="backdrop" src={paintings[0]} alt="" />
		<div class="scrim"></div>
	{:else}
		<div class="field"></div>
	{/if}

	{#each persons as person, i (person.id)}
		<div
			class="person"
			style="--hue: {hueFor(i)}; --x: {personX(i, persons.length)}%; --delay: {i * 1.7}s;"
		>
			<div class="orb"></div>
		</div>
	{/each}
</div>

<style>
	.emanation {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: linear-gradient(160deg, hsl(248 28% 16%), hsl(218 32% 11%) 60%, hsl(266 26% 13%));
	}

	/* ── painting mode ── */
	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.scrim {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, 0.5) 92%);
		pointer-events: none;
	}

	/* ── procedural mode ── */
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

	/* ── person orbs (both modes) ── */
	.person {
		position: absolute;
		top: 50%;
		left: var(--x);
		width: 40vmin;
		height: 40vmin;
		transform: translate(-50%, -50%);
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

	.orb {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			hsl(var(--hue) 58% 52% / 0.62),
			hsl(var(--hue) 52% 32% / 0.28) 45%,
			transparent 70%
		);
		filter: blur(10px);
	}

	/* painting mode: tighten the orbs so the painting reads through */
	.painting-mode .orb {
		background: radial-gradient(
			circle,
			hsl(var(--hue) 60% 56% / 0.5),
			hsl(var(--hue) 54% 34% / 0.18) 42%,
			transparent 66%
		);
		filter: blur(14px);
	}

	@media (prefers-reduced-motion: reduce) {
		.field,
		.person {
			animation: none;
		}
	}

</style>
