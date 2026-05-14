<script lang="ts">
	/**
	 * `/tv` — media players + remotes + (v0.1.x) TMDB content slot.
	 *
	 * v0.1 ships an empty content slot — the @broadsheet/tmdb-tv plugin
	 * populates "New" / "Trending" rows when enabled. Without the plugin,
	 * the slot shows a "configure TMDB" CTA.
	 *
	 * Composition:
	 *   1. Hero — "Living Room TV: off" prose
	 *   2. Remote pad — D-pad + power + volume for the primary TV
	 *   3. App launcher — common app shortcuts (if remote supports it)
	 *   4. Content slot (empty in v0.1 core)
	 */

	import { base } from '$app/paths';
	import { discovery } from '$lib/discovery';
	import type { DomainEntity } from '$lib/discovery';
	import { callService, callOn, callOff } from '$lib/ha/actions';
	import { curationStore } from '$lib/curation/store.svelte';
	import { useRenderer } from '$lib/plugins/renderers.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	// Content slot — the @broadsheet/tmdb-tv plugin's renderer fills it
	// when enabled. core never hard-depends on it: `content.current` is
	// null when the plugin's off, and the slot's built-in CTA covers it.
	const content = useRenderer('tmdb-content-rows');
	const tmdb = $derived(curationStore.current.integrations.tmdb ?? {});

	const tvAreas = $derived(discovery.areasForPage('tv'));
	const allTVs = $derived(tvAreas.flatMap((a) => a.tvs));
	const allRemotes = $derived(tvAreas.flatMap((a) => a.remotes));
	const allMedia = $derived(tvAreas.flatMap((a) => a.media));

	// Primary TV = first TV. Multi-TV households can pin per area in M4.
	const primaryTv = $derived(allTVs[0] ?? null);
	const primaryRemote = $derived(allRemotes[0] ?? null);

	const proseState = $derived.by(() => {
		if (!primaryTv) return 'No TV discovered.';
		const s = primaryTv.state?.state;
		const source = primaryTv.state?.attributes?.source as string | undefined;
		const title = primaryTv.state?.attributes?.media_title as string | undefined;
		if (s === 'off' || s === 'standby' || s === 'unavailable') return `${primaryTv.name}: off.`;
		if (title) return `${primaryTv.name}: ${title}.`;
		if (source) return `${primaryTv.name}: ${source}.`;
		return `${primaryTv.name}: on.`;
	});

	type RemoteKey =
		| 'UP'
		| 'DOWN'
		| 'LEFT'
		| 'RIGHT'
		| 'OK'
		| 'BACK'
		| 'HOME'
		| 'VOLUME_UP'
		| 'VOLUME_DOWN'
		| 'MUTE';

	async function sendKey(key: RemoteKey) {
		if (!primaryRemote) return;
		await callService(
			'remote',
			'send_command',
			{ entity_id: primaryRemote.id },
			{ command: key }
		);
	}

	async function powerToggle() {
		if (!primaryTv) return;
		if (primaryTv.state?.state === 'on') await callOff(primaryTv.id);
		else await callOn(primaryTv.id);
	}

	const dpadKeys: { key: RemoteKey; label: string; pos: string }[] = [
		{ key: 'UP', label: '↑', pos: 'up' },
		{ key: 'LEFT', label: '←', pos: 'left' },
		{ key: 'OK', label: 'OK', pos: 'centre' },
		{ key: 'RIGHT', label: '→', pos: 'right' },
		{ key: 'DOWN', label: '↓', pos: 'down' }
	];
</script>

<svelte:head>
	<title>TV · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="TV" number={5} />
		{/snippet}
		{#snippet headline()}
			{proseState}
		{/snippet}
	</Hero>

	{#if primaryTv}
		<OutLine label="Power" />
		<div class="row power-row">
			<button class="power-btn" type="button" onclick={powerToggle}>
				{primaryTv.state?.state === 'on' ? 'Turn off' : 'Turn on'}
			</button>
		</div>
	{/if}

	{#if primaryRemote}
		<OutLine label="Remote" />
		<div class="remote">
			<div class="dpad">
				{#each dpadKeys as k (k.pos)}
					<button
						class="dpad-key dpad-{k.pos}"
						type="button"
						onclick={() => sendKey(k.key)}
						aria-label={k.key}
					>
						{k.label}
					</button>
				{/each}
			</div>
			<div class="aux">
				<button class="aux-key" type="button" onclick={() => sendKey('BACK')}>Back</button>
				<button class="aux-key" type="button" onclick={() => sendKey('HOME')}>Home</button>
				<button class="aux-key" type="button" onclick={() => sendKey('VOLUME_DOWN')}>Vol −</button>
				<button class="aux-key" type="button" onclick={() => sendKey('MUTE')}>Mute</button>
				<button class="aux-key" type="button" onclick={() => sendKey('VOLUME_UP')}>Vol +</button>
			</div>
		</div>
	{/if}

	{#if allMedia.length > 0}
		<OutLine label="Other media" />
		<ul class="media-list">
			{#each allMedia as m (m.id)}
				<li class="media-row">
					<span class="media-name">{m.name}</span>
					<span class="media-state">{m.state?.state ?? '—'}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<OutLine label="Watch" />
	{#if content.current}
		{@const ContentRows = content.current}
		<ContentRows apiKey={tmdb.apiKey ?? null} region={tmdb.region ?? 'GB'} />
	{:else}
		<div class="content-slot">
			<p class="slot-headline"><em>Content browser slot</em></p>
			<p class="slot-dek">
				TMDB-driven "New" and "Trending" rows arrive via the
				<code>@broadsheet/tmdb-tv</code> plugin. Enable it in
				<a href="{base}/settings/plugins/">Settings → Plugins</a>, then add your free
				TMDB API key.
			</p>
		</div>
	{/if}

	{#if !primaryTv && !primaryRemote}
		<p class="empty">No TV / remote entities discovered yet.</p>
	{/if}
</PageShell>

<style>
	.row {
		display: flex;
		gap: var(--space-2);
	}

	.power-btn {
		padding: var(--space-3) var(--space-6);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 44px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.power-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.remote {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		align-items: center;
	}

	.dpad {
		display: grid;
		grid-template-columns: 60px 60px 60px;
		grid-template-rows: 60px 60px 60px;
		gap: var(--space-1);
	}

	.dpad-key {
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-size: 1.2rem;
		color: var(--accent);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.dpad-key:hover {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.dpad-up {
		grid-column: 2;
		grid-row: 1;
		border-radius: 12px 12px 4px 4px;
	}
	.dpad-left {
		grid-column: 1;
		grid-row: 2;
		border-radius: 12px 4px 4px 12px;
	}
	.dpad-centre {
		grid-column: 2;
		grid-row: 2;
		border-radius: 50%;
		font-size: 0.9rem;
		font-weight: 500;
		border-color: var(--accent);
		color: var(--bg);
		background: var(--accent);
	}
	.dpad-centre:hover {
		background: var(--accent-soft);
		border-color: var(--accent-soft);
	}
	.dpad-right {
		grid-column: 3;
		grid-row: 2;
		border-radius: 4px 12px 12px 4px;
	}
	.dpad-down {
		grid-column: 2;
		grid-row: 3;
		border-radius: 4px 4px 12px 12px;
	}

	.aux {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: center;
	}

	.aux-key {
		padding: var(--space-2) var(--space-4);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-caption);
		color: var(--fg-muted);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		min-height: 44px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.aux-key:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.media-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.media-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--rule);
	}

	.media-row:last-child {
		border-bottom: none;
	}

	.media-name {
		font-family: var(--font-body);
		font-size: var(--text-body);
	}

	.media-state {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
	}

	.content-slot {
		padding: var(--space-6);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.slot-headline {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		color: var(--fg-muted);
		margin: 0;
	}

	.slot-dek {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}

	.slot-dek code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--fg);
	}

	.slot-dek a {
		color: var(--accent);
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}
</style>
