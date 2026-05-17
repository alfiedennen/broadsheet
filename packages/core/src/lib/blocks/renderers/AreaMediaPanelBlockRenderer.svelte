<script lang="ts">
	/**
	 * 0.9.3 — per-area media panel.
	 *
	 * Renders the area's TVs (full media-tv widget: power + source +
	 * transport) above its speakers (media-speaker widget: play/pause
	 * + source toggle). Single block, atomic placement.
	 *
	 * Adapts to the device mix:
	 *  - TV only        → just remote(s) in a top row
	 *  - speakers only  → just speaker grid
	 *  - both           → TVs on top, speakers below (TVs are louder
	 *                     priorities; user sees them first)
	 *
	 * Spec: docs/plans/plan-9.3-composites-and-plugin-blocks.md.
	 */
	import { discovery } from '$lib/discovery';
	import { isRealMediaSource } from '$lib/discovery/heuristics';
	import OutLine from '$lib/components/OutLine.svelte';
	import ThingBlockRenderer from './ThingBlockRenderer.svelte';
	import type { AreaMediaPanelBlockConfig } from '../types';

	let { config }: { config: AreaMediaPanelBlockConfig } = $props();

	const area = $derived(config.areaId ? discovery.byAreaId(config.areaId) : null);
	// 0.9.3.1 — filter out kiosks / tablets / phones. HA classes
	// them as media_player but they're surfaces (broadsheet itself
	// often runs on them), not media SOURCES. Same heuristic /tv
	// and the things-browser use.
	const tvs = $derived((area?.tvs ?? []).filter(isRealMediaSource));
	const speakers = $derived((area?.media ?? []).filter(isRealMediaSource));
	const isEmpty = $derived(tvs.length === 0 && speakers.length === 0);
	const headerLabel = $derived(config.label ?? (area ? `${area.name} media` : 'Media'));
</script>

{#if !area}
	<section class="block panel-empty">
		<p class="panel-empty-text">
			Media panel — area
			<code>{config.areaId || '(unset)'}</code>
			not found.
		</p>
	</section>
{:else if isEmpty}
	<section class="block panel-empty">
		<OutLine label={headerLabel} />
		<p class="panel-empty-text">
			No media players in <strong>{area.name}</strong>.
		</p>
	</section>
{:else}
	<section class="block media-panel">
		<OutLine label={headerLabel} />
		{#if tvs.length > 0}
			<div class="media-grid tvs">
				{#each tvs as tv (tv.id)}
					<ThingBlockRenderer
						config={{ entityId: tv.id, widget: 'media-tv' }}
					/>
				{/each}
			</div>
		{/if}
		{#if speakers.length > 0}
			<div class="media-grid speakers">
				{#each speakers as sp (sp.id)}
					<ThingBlockRenderer
						config={{ entityId: sp.id, widget: 'media-speaker' }}
					/>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.media-grid {
		display: grid;
		gap: var(--space-3);
	}
	.media-grid.tvs {
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	}
	.media-grid.speakers {
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}
	.panel-empty-text {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.panel-empty-text code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
