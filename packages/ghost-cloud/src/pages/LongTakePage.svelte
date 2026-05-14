<script lang="ts">
	/**
	 * /long-take — The Long Take.
	 *
	 * 24h of radar presence per room, played back as the v22
	 * water-membrane time-tube. The renderer is the proven
	 * harold-home Three.js piece, ported verbatim and served as a
	 * plugin static asset (static/ghost-cloud.js + view.html + the
	 * vendored Three.js); this page iframes it.
	 *
	 * One route, sub-views via the `?r=<room>` query param (the
	 * routing contract's model — see RENDERER-CONTRACT.md). The
	 * room list comes from the plugin's discoveryContributor
	 * (`discovery.plugins['ghost-cloud'].rooms`).
	 *
	 * v0.1 ships bundled demo data; the live-radar-pull path is a
	 * deferred follow-on.
	 */
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { PageShell, Hero, Eyebrow, OutLine, discovery, pluginAssetUrl } from '@broadsheet/core';
	import type { RoomManifest } from '../discovery/rooms';

	const manifest = $derived(
		discovery.plugins['ghost-cloud']?.rooms as RoomManifest | null | undefined
	);
	const roomEntries = $derived(manifest ? Object.entries(manifest.rooms) : []);

	// Selected room: the `?r=` query param, defaulting to the first
	// room the manifest offers.
	const selectedRoom = $derived(page.url.searchParams.get('r') ?? roomEntries[0]?.[0] ?? null);
	const selectedLabel = $derived(
		selectedRoom && manifest ? (manifest.rooms[selectedRoom]?.label ?? selectedRoom) : null
	);

	// The iframe src — the view.html harness + ?r=<room>. pluginAssetUrl
	// resolves it ingress-correct; view.html's own relative imports
	// (./ghost-cloud.js, ./three/…, ./data/<room>.json) then resolve
	// against /plugin-assets/ghost-cloud/.
	const iframeSrc = $derived(
		selectedRoom ? `${pluginAssetUrl('ghost-cloud', 'view.html')}?r=${selectedRoom}` : null
	);
</script>

<svelte:head>
	<title>The Long Take · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="The Long Take" />
		{/snippet}
		{#snippet headline()}
			Radar, played back.
		{/snippet}
		{#snippet dek()}
			Twenty-four hours of presence in a room, rendered as a translucent water-membrane
			time-tube. Drag to orbit, scroll to zoom, space to play.
		{/snippet}
	</Hero>

	{#if roomEntries.length === 0}
		<p class="empty">No rooms discovered yet — the manifest hasn't loaded.</p>
	{:else}
		<nav class="rooms" aria-label="Rooms">
			{#each roomEntries as [slug, room] (slug)}
				<a class="room" class:active={slug === selectedRoom} href="{base}/long-take/?r={slug}">
					{room.label}
				</a>
			{/each}
		</nav>

		{#key selectedRoom}
			<div class="stage">
				{#if iframeSrc}
					<iframe
						class="player"
						src={iframeSrc}
						title="The Long Take — {selectedLabel}"
						loading="lazy"
					></iframe>
				{/if}
			</div>
		{/key}

		<OutLine label="Source" />
		<dl class="facts">
			<dt>Room</dt>
			<dd>{selectedLabel}</dd>
			<dt>Window</dt>
			<dd>24 hours</dd>
			<dt>Data</dt>
			<dd>bundled demo capture — live radar-pull is a deferred follow-on</dd>
		</dl>
	{/if}
</PageShell>

<style>
	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}

	.rooms {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.room {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		text-decoration: none;
		transition: color var(--ease-quick), border-color var(--ease-quick), background var(--ease-quick);
	}

	.room:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.room.active {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.stage {
		position: relative;
		width: 100%;
		height: min(72vh, 720px);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: #14110d;
	}

	.player {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
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
