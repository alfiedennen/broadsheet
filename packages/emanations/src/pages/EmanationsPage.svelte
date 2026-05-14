<script lang="ts">
	/**
	 * /emanations — where everyone is, as living imagery.
	 *
	 * This page exercises the whole plugin contract end to end:
	 *  - it's a plugin PAGE (routed at /emanations via the catch-all)
	 *  - it renders the plugin's own RENDERER (multi-person-painting)
	 *  - the renderer's painting set comes from the plugin's
	 *    DISCOVERY CONTRIBUTOR (discovery.plugins.emanations.paintingSets)
	 *  - painting asset URLs resolve via pluginAssetUrl (STATIC ASSETS)
	 *  - painting mode is gated by a SETTINGS PANEL field
	 *
	 * As a LazyComponent it may freely runtime-import @broadsheet/core.
	 */
	import {
		PageShell,
		Hero,
		Eyebrow,
		OutLine,
		discovery,
		pluginAssetUrl,
		useCurationField
	} from '@broadsheet/core';
	import MultiPersonPainting from '../renderers/MultiPersonPainting.svelte';
	import type { PaintingManifest } from '../discovery/paintingSets';

	const persons = $derived(discovery.persons);

	// The discoveryContributor merged the painting manifest into
	// discovery.plugins.emanations.paintingSets at boot / on updates.
	const paintingSets = $derived(
		discovery.plugins.emanations?.paintingSets as PaintingManifest | null | undefined
	);
	const paintingCount = $derived(
		paintingSets?.paintings ? Object.keys(paintingSets.paintings).length : 0
	);

	// Settings-panel field: painting mode on/off (default on).
	const usePaintings = useCurationField<boolean>('plugins.emanations.config.usePaintings');
	const paintingsEnabled = $derived(usePaintings.value !== false);

	// Resolve manifest paths → ingress-correct asset URLs, gated by
	// the setting. Empty → the renderer falls back to procedural.
	const paintingUrls = $derived.by(() => {
		if (!paintingsEnabled || !paintingSets?.paintings) return [];
		return Object.values(paintingSets.paintings).map((p) => pluginAssetUrl('emanations', p));
	});
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
			Presence as living imagery — a painting per room when you have them, a procedural field
			when you don't.
		{/snippet}
	</Hero>

	<div class="band">
		<MultiPersonPainting {persons} paintings={paintingUrls} />
	</div>

	<OutLine label="Source" />
	<dl class="facts">
		<dt>Mode</dt>
		<dd>{paintingUrls.length > 0 ? 'Painting' : 'Procedural'}</dd>
		<dt>Painting set</dt>
		<dd>
			{#if paintingSets}
				{paintingCount} discovered via the plugin's discoveryContributor
			{:else}
				none discovered — procedural fallback
			{/if}
		</dd>
		<dt>Painting mode</dt>
		<dd>{paintingsEnabled ? 'on' : 'off (Settings → Plugins → Emanations)'}</dd>
		<dt>People</dt>
		<dd>{persons.map((p) => p.name).join(', ') || '—'}</dd>
	</dl>
</PageShell>

<style>
	.band {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: var(--radius-card);
		overflow: hidden;
		border: 1px solid var(--rule);
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-6);
		margin: 0;
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
</style>
