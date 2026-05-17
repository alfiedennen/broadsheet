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
	 *   2. Power + Remote pad — D-pad + volume for the primary TV
	 *   3. Apps — one launch button per entry in the TV's source_list
	 *      (media_player.select_source). General: whatever apps/inputs
	 *      the TV exposes, no hardcoded streamer list.
	 *   4. Content slot — the @broadsheet/tmdb-tv plugin's rows
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
	import Explainer from '$lib/components/Explainer.svelte';

	// Content slot — the @broadsheet/tmdb-tv plugin's renderer fills it
	// when enabled. core never hard-depends on it: `content.current` is
	// null when the plugin's off, and the slot's built-in CTA covers it.
	const content = useRenderer('tmdb-content-rows');
	const tmdb = $derived(curationStore.current.integrations.tmdb ?? {});

	// 0.8.7 fix — stable array references for ContentRows props.
	// The 0.8.5 version computed these inline in {@const} blocks each
	// render, producing a fresh array literal on every reactive tick
	// when the underlying curation value was undefined. That fresh ref
	// fed into ContentRows' $effect deps and triggered a recursive
	// reactivity loop (effect_update_depth_exceeded) which jammed
	// EVERYTHING on /tv — kebab couldn't open, TV state stayed stale
	// after On/Off, TMDB fetches never fired, no posters rendered.
	// $derived.by gives a stable reference when inputs don't change.
	const trendingWindowsArr = $derived.by((): ('day' | 'week')[] => {
		const v = tmdb.trendingWindows;
		if (Array.isArray(v)) return v;
		if (v === 'day' || v === 'week') return [v];
		return ['week'];
	});
	const newWindowsArr = $derived.by((): number[] => {
		const v = tmdb.newReleasesWindowDays;
		if (Array.isArray(v)) return v;
		if (typeof v === 'number') return [v];
		return [45];
	});

	const tvAreas = $derived(discovery.areasForPage('tv'));
	const allTVs = $derived(tvAreas.flatMap((a) => a.tvs));
	const allRemotes = $derived(tvAreas.flatMap((a) => a.remotes));
	// 0.8.7 fix — filter tablets / kiosks / phones out of /tv's
	// "Other media" list. HA classes them as media_player but they're
	// surfaces, not media SOURCES. Heuristic: rough name + device-class
	// match. Speakers/receivers (real audio outputs) stay.
	function looksLikeKioskOrTablet(name: string, deviceModel: string | null): boolean {
		const s = (name + ' ' + (deviceModel ?? '')).toLowerCase();
		return (
			/\b(tablet|fully kiosk|fire ?(hd|tablet)|galaxy ?tab|kindle|nexus|pixel ?\d|ipad|iphone|chromebook|chrome ?os|browser|kiosk)\b/.test(
				s
			)
		);
	}
	const allMedia = $derived(
		tvAreas
			.flatMap((a) => a.media)
			.filter((e) => !looksLikeKioskOrTablet(e.name, e.device?.model ?? null))
	);

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

	// 0.8.6 polish: parity with harold-home /tv. Separate On / Off
	// (state-aware: disabled when already in the target state) rather
	// than a single toggle — clearer affordance for the user, and the
	// state survives the round-trip latency that a toggle would hide.
	async function powerOn() {
		if (!primaryTv) return;
		await callOn(primaryTv.id);
	}

	async function powerOff() {
		if (!primaryTv) return;
		await callOff(primaryTv.id);
	}

	// Mobile tab toggle (≤720px). Above 720px the 2-column layout
	// shows controls + apps side-by-side and the tab bar hides.
	let mobileTab = $state<'remote' | 'apps'>('remote');

	// Apps / sources. A media_player only exposes `source_list` (its
	// installed apps + inputs) while it's ON — so we cache the
	// last-seen list per TV in localStorage. The launch buttons then
	// stay put when the TV is off, and tapping one wakes the set
	// before switching source. Still general — whatever the TV
	// reports, no hardcoded streamer list.
	const SOURCE_CACHE_PREFIX = 'broadsheet:tv-sources:';

	function cachedSources(entityId: string): string[] {
		if (typeof localStorage === 'undefined') return [];
		try {
			const raw = localStorage.getItem(SOURCE_CACHE_PREFIX + entityId);
			return raw ? (JSON.parse(raw) as string[]) : [];
		} catch {
			return [];
		}
	}

	const liveSources = $derived(
		(primaryTv?.state?.attributes?.source_list as string[] | undefined) ?? []
	);
	const currentSource = $derived(primaryTv?.state?.attributes?.source as string | undefined);
	const tvOn = $derived(
		!!primaryTv &&
			['on', 'playing', 'paused', 'idle'].includes(primaryTv.state?.state ?? '')
	);

	// Persist the live list whenever the TV reports one, so the
	// buttons survive the TV going off.
	$effect(() => {
		if (!primaryTv || liveSources.length === 0 || typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(SOURCE_CACHE_PREFIX + primaryTv.id, JSON.stringify(liveSources));
		} catch {
			/* quota — ignore */
		}
	});

	// A small set of near-universal streamer apps — the tier-3
	// fallback shown before the TV has ever been seen on, so the
	// section ships with buttons out of the box rather than an empty
	// note. The moment the TV reports its real source_list, that
	// replaces this (and caches). Names that don't match the TV's own
	// won't switch — but once it's on once, reality takes over.
	const DEFAULT_SOURCES = ['Netflix', 'Disney+', 'Prime Video', 'YouTube', 'Apple TV'];

	// Three tiers: the live list when the TV's on; the cached list
	// when it's off but has been seen on; the default set otherwise.
	const sourceMode = $derived.by(() => {
		if (liveSources.length > 0) return { sources: liveSources, mode: 'live' as const };
		const cached = primaryTv ? cachedSources(primaryTv.id) : [];
		if (cached.length > 0) return { sources: cached, mode: 'cached' as const };
		return { sources: DEFAULT_SOURCES, mode: 'default' as const };
	});
	const tvSources = $derived(sourceMode.sources);

	async function launchSource(source: string) {
		if (!primaryTv) return;
		// select_source on a cold set is a no-op — wake it first, then
		// give it a beat before switching.
		if (!tvOn) {
			await callOn(primaryTv.id);
			await new Promise((r) => setTimeout(r, 2500));
		}
		await callService('media_player', 'select_source', { entity_id: primaryTv.id }, { source });
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

<PageShell width="wide">
	<Hero size="sm">
		{#snippet eyebrow()}
			<Eyebrow section="TV" number={5} />
		{/snippet}
		{#snippet headline()}
			{proseState}
		{/snippet}
	</Hero>

	<!-- 0.8.6 polish: parity with harold-home /tv. Two-column board
	     (controls left, apps right) on desktop; mobile tab toggle below
	     720px switches which column shows. Power gets its own dedicated
	     row above the board (always visible regardless of tab). -->
	{#if primaryTv}
		<div class="power-cluster">
			<header class="cluster-eyebrow">power</header>
			<div class="power-row">
				<button
					type="button"
					class="power-btn"
					class:active={tvOn}
					onclick={powerOn}
					disabled={tvOn}
				>
					On
				</button>
				<button
					type="button"
					class="power-btn off"
					class:active={!tvOn && primaryTv.state?.state !== 'unavailable'}
					onclick={powerOff}
					disabled={!tvOn}
				>
					Off
				</button>
			</div>
		</div>
	{/if}

	{#if primaryRemote || primaryTv}
		<!-- Mobile-only tab bar to toggle between Remote + Apps. -->
		<nav class="board-tabs" aria-label="Switch between remote and apps">
			<button
				type="button"
				class="board-tab"
				class:active={mobileTab === 'remote'}
				onclick={() => (mobileTab = 'remote')}
				aria-pressed={mobileTab === 'remote'}
			>
				Remote
			</button>
			<button
				type="button"
				class="board-tab"
				class:active={mobileTab === 'apps'}
				onclick={() => (mobileTab = 'apps')}
				aria-pressed={mobileTab === 'apps'}
			>
				Apps
			</button>
		</nav>

		<div class="board" class:show-remote={mobileTab === 'remote'} class:show-apps={mobileTab === 'apps'}>
			{#if primaryRemote}
				<section class="col col-remote" aria-label="Remote">
					<header class="cluster-eyebrow">remote</header>
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
						</div>
						<div class="vol">
							<button class="aux-key" type="button" onclick={() => sendKey('VOLUME_DOWN')}>Vol −</button>
							<button class="aux-key" type="button" onclick={() => sendKey('MUTE')}>Mute</button>
							<button class="aux-key" type="button" onclick={() => sendKey('VOLUME_UP')}>Vol +</button>
						</div>
					</div>
				</section>
			{/if}

			{#if primaryTv}
				<section class="col col-apps" aria-label="Apps">
					<header class="cluster-eyebrow">apps</header>
					<div class="app-list">
						{#each tvSources as source (source)}
							<button
								class="app-row"
								class:active={tvOn && source === currentSource}
								type="button"
								onclick={() => launchSource(source)}
							>
								<span class="app-name">{source}</span>
								<span class="app-cta">→</span>
							</button>
						{/each}
					</div>
					{#if sourceMode.mode === 'default'}
						<p class="sources-note">
							<em>Common apps — your TV's own list loads the first time it's on.</em>
						</p>
					{:else if !tvOn}
						<p class="sources-note"><em>TV is off — tapping an app wakes it first.</em></p>
					{/if}
				</section>
			{/if}
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
		<ContentRows
			apiKey={tmdb.apiKey ?? null}
			region={tmdb.region ?? 'GB'}
			providers={tmdb.providers ?? []}
			trendingWindows={trendingWindowsArr}
			newReleasesWindowDays={newWindowsArr}
		/>
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

	<Explainer>
		Around the screen: <a href="{base}/lights">light</a> and
		<a href="{base}/heat">heat</a>, both of which follow the cinema scene.
	</Explainer>
</PageShell>

<style>
	/* 0.8.6 polish — parity with harold-home /tv. */

	.cluster-eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin-bottom: var(--space-2);
	}

	.power-cluster {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.power-cluster .cluster-eyebrow {
		align-self: stretch;
		text-align: center;
	}

	.power-row {
		display: flex;
		gap: var(--space-3);
		justify-content: center;
	}

	.power-btn {
		flex: 1;
		max-width: 180px;
		padding: var(--space-3) var(--space-6);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 56px;
		cursor: pointer;
		transition: border-color var(--ease-quick), color var(--ease-quick), background var(--ease-quick);
	}

	.power-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.power-btn.active {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	.power-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}

	/* Mobile tab bar — visible only ≤720px viewport. */
	.board-tabs {
		display: none;
		gap: var(--space-2);
	}

	.board-tab {
		flex: 1;
		padding: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.board-tab.active {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	/* Board layout — 2-column desktop, single-column-tabbed mobile. */
	.board {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-6);
		align-items: flex-start;
	}

	@media (max-width: 720px) {
		.board-tabs {
			display: flex;
		}
		.board {
			grid-template-columns: 1fr;
		}
		.board > .col {
			display: none;
		}
		.board.show-remote > .col-remote,
		.board.show-apps > .col-apps {
			display: flex;
		}
	}

	.col {
		display: flex;
		flex-direction: column;
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

	.aux,
	.vol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: center;
		margin-top: var(--space-3);
	}

	.aux-key {
		padding: var(--space-2) var(--space-4);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		min-height: 44px;
		cursor: pointer;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.aux-key:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* App list — list-style rows on desktop, harold-home pattern. */
	.app-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.app-row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		font-family: var(--font-mono);
		font-size: var(--text-body);
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--fg);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 56px;
		cursor: pointer;
		text-align: left;
		transition: border-color var(--ease-quick), color var(--ease-quick), background var(--ease-quick);
	}

	.app-row:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.app-row.active {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	.app-row .app-cta {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--fg-muted);
		text-transform: none;
		transition: color var(--ease-quick), transform var(--ease-quick);
	}

	.app-row:hover .app-cta {
		color: var(--accent);
		transform: translateX(2px);
	}

	.sources-note {
		margin: 0;
		font-size: var(--text-caption);
		color: var(--fg-muted);
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
