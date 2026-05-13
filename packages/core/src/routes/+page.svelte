<script lang="ts">
	/**
	 * `/` — the landing. The moment.
	 *
	 * Procedural ambient gradient as the visual centre. Single-line
	 * manifest sentence over the top. People row underneath with their
	 * presence rooms. KebabNav (rendered by layout) gets you anywhere.
	 *
	 * No control surfaces here on purpose — this page is for arrival,
	 * not action. Tap the kebab to navigate, or scroll for status.
	 */

	import { discovery } from '$lib/discovery';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { composeManifest, resolvePresence } from '$lib/manifest';
	import { connection } from '$lib/stores/connection.svelte';
	import { curationStore } from '$lib/curation/store.svelte';
	import ProceduralPainting from '$lib/components/ProceduralPainting.svelte';

	// Build the per-person override map from curation
	const personOverrides = $derived(
		Object.fromEntries(
			curationStore.current.people.map((p) => [p.personId, p.presenceSensorId])
		)
	);

	// Manifest sentence — recomputes whenever discovery, states, or curation tick
	const manifest = $derived(
		composeManifest({
			persons: discovery.persons,
			states: discoveryStore.states,
			personOverrides,
			voice: curationStore.current.voice
		})
	);

	// Presence per person — for the people row
	const presence = $derived(
		resolvePresence({
			persons: discovery.persons,
			states: discoveryStore.states,
			personOverrides
		})
	);

	// Painting seed — first home person's room, or "empty" / "loading"
	const paintingSeed = $derived.by(() => {
		if (!discovery.booted) return 'loading';
		const home = presence.find((s) => s.isHome);
		if (!home) return 'empty';
		return home.room ?? 'home';
	});

	// Time string for the dateline — refreshes every minute
	let now = $state(new Date());
	$effect(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 30_000);
		return () => clearInterval(interval);
	});

	const dateline = $derived(
		now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
	);
</script>

<svelte:head>
	<title>broadsheet</title>
</svelte:head>

<div class="moment">
	<ProceduralPainting seed={paintingSeed} mood="warm" />

	<div class="vignette" aria-hidden="true"></div>

	<article class="words">
		<p class="dateline">{dateline}</p>

		<h1 class="manifest">
			{#if !discovery.booted}
				<em>Reading the house…</em>
			{:else}
				<em>{manifest}</em>
			{/if}
		</h1>

		{#if discovery.persons.length > 0 && discovery.booted}
			<ul class="people">
				{#each presence as p (p.person.id)}
					<li class:home={p.isHome} class:away={!p.isHome}>
						<span class="dot" aria-hidden="true"></span>
						<span class="who">{p.person.name.split(' ')[0]}</span>
						<span class="where">
							{#if p.isHome}
								{p.room ?? 'home'}
							{:else}
								away
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</article>

	<footer class="colophon">
		<span class="brand">broadsheet</span>
		<span class="sep" aria-hidden="true">·</span>
		<span class="version">№ 01 · the moment</span>
		{#if connection.haVersion}
			<span class="sep" aria-hidden="true">·</span>
			<span class="ha">HA {connection.haVersion}</span>
		{/if}
	</footer>
</div>

<style>
	.moment {
		position: fixed;
		inset: 0;
		min-height: 100vh;
		min-height: 100dvh;
		overflow: hidden;
	}

	.vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 30%,
			rgba(0, 0, 0, 0.45) 90%
		);
		pointer-events: none;
	}

	.words {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		padding: var(--space-6) var(--space-8);
		max-width: 26ch;
		margin-inline: auto;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	@media (min-width: 640px) {
		.words {
			max-width: 32ch;
			padding: var(--space-12);
		}
	}

	.dateline {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		margin: 0;
	}

	.manifest {
		font-family: var(--font-display);
		font-style: italic;
		font-weight: 400;
		font-size: var(--text-headline-lg);
		line-height: 1.05;
		letter-spacing: var(--track-tight);
		color: var(--accent);
		margin: 0;
		text-shadow: 0 2px 30px rgba(0, 0, 0, 0.5);
	}

	.manifest em {
		font-style: italic;
	}

	.people {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		justify-content: center;
		margin: var(--space-6) 0 0;
		padding: 0;
		list-style: none;
	}

	.people li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-caption);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.people .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--state-on);
		box-shadow: 0 0 8px var(--state-on);
	}

	.people .away .dot {
		background: var(--fg-dim);
		box-shadow: none;
	}

	.people .who {
		color: var(--fg);
	}

	.people .where {
		color: var(--fg-muted);
		font-style: italic;
	}

	.people .away .where {
		color: var(--fg-dim);
	}

	.colophon {
		position: absolute;
		bottom: var(--space-4);
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
	}

	.colophon .brand {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.95rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--accent);
	}

	.colophon .sep {
		color: var(--fg-dim);
	}
</style>
