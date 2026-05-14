<script lang="ts">
	/**
	 * Emanations page — P1 stub.
	 *
	 * This is a LazyComponent (core only fetches this chunk when the
	 * plugin is active + the route is hit), so it may freely
	 * runtime-import @broadsheet/core's primitives — no static cycle.
	 *
	 * P4 replaces this body with the real multi-person painting
	 * renderer ported from harold-home. For now it exists to prove the
	 * whole contract path: bundled separate package → registry →
	 * loader → [pluginSlug] route → rendered inside an error boundary.
	 */
	import { PageShell, Hero, Eyebrow, OutLine, discovery, pluginAssetUrl } from '@broadsheet/core';

	const peopleWithSensor = $derived(
		discovery.persons.filter((p) => p.suggestedPresenceSensor !== null)
	);

	// Proves the P3 static-asset pipeline end to end: this SVG ships
	// in packages/emanations/static/, is staged into the add-on image
	// at www/plugin-assets/emanations/, served by nginx, and resolved
	// here through pluginAssetUrl — ingress-prefix-correct.
	const markUrl = pluginAssetUrl('emanations', 'mark.svg');
</script>

<svelte:head>
	<title>Emanations · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Emanations" />
		{/snippet}
		{#snippet headline()}
			Where everyone is.
		{/snippet}
		{#snippet dek()}
			A plugin page, served from a separate package. The multi-person painting renderer lands in
			P4 — this stub proves the contract path end to end.
		{/snippet}
	</Hero>

	<OutLine label="Plugin contract" />
	<div class="contract">
		<img class="mark" src={markUrl} alt="" width="120" height="120" />
		<dl class="facts">
			<dt>Package</dt>
			<dd><code>@broadsheet/emanations</code></dd>
			<dt>Delivery</dt>
			<dd>bundled · lazy-chunked · curation-gated</dd>
			<dt>Static asset</dt>
			<dd><code>{markUrl}</code></dd>
			<dt>People with a presence sensor</dt>
			<dd>{peopleWithSensor.length}</dd>
		</dl>
	</div>
</PageShell>

<style>
	.contract {
		display: flex;
		align-items: flex-start;
		gap: var(--space-6);
		flex-wrap: wrap;
	}

	.mark {
		flex: 0 0 auto;
		display: block;
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-6);
		margin: 0;
		flex: 1;
		min-width: 16rem;
	}

	.facts dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.facts dd {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.facts code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--accent);
	}
</style>
