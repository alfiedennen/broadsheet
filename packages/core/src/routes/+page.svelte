<script lang="ts">
	/**
	 * `/` — the moment.
	 *
	 * Mirrors harold-home's `/` shape (newspaper landing) rather than the
	 * full-bleed contemplative variant the earlier prototype shipped. The
	 * earlier shape was, as the user put it, "a recapitulation of
	 * /emanations" — same presence-as-imagery surface, same orbs. This
	 * shape differentiates by being action-shaped:
	 *
	 *   1. Hero    — multi-clause manifest sentence (time-of-day +
	 *                presence + outside weather)
	 *   2. Band    — the procedural painting OR the emanations renderer
	 *                if active, sized as a band, NOT full-bleed
	 *   3. Quick   — three earned-their-place daily actions: lights off,
	 *                TV toggle, unlock door. Each shows current state.
	 *   4. Explainer — the cross-page link mesh (the IA in prose)
	 *
	 * /emanations remains the dedicated presence-as-imagery surface;
	 * `/` is the moment-as-newspaper.
	 */
	import { base } from '$app/paths';
	import { discovery } from '$lib/discovery';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { composeManifest, resolvePresence } from '$lib/manifest';
	import { connection } from '$lib/stores/connection.svelte';
	import { curationStore } from '$lib/curation/store.svelte';
	import { callService, callToggle, getHardBannedDomains } from '$lib/ha/actions';
	import ProceduralPainting from '$lib/components/ProceduralPainting.svelte';
	import { useRenderer } from '$lib/plugins/renderers.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import Explainer from '$lib/components/Explainer.svelte';

	// Opportunistic upgrade: when @broadsheet/emanations is active, its
	// renderer takes the painting band; otherwise core's procedural
	// gradient holds.
	const painting = useRenderer('multi-person-painting');

	const personOverrides = $derived(
		Object.fromEntries(
			curationStore.current.people.map((p) => [p.personId, p.presenceSensorId])
		)
	);

	const presence = $derived(
		resolvePresence({
			persons: discovery.persons,
			states: discoveryStore.states,
			personOverrides
		})
	);

	const presenceClause = $derived(
		composeManifest({
			persons: discovery.persons,
			states: discoveryStore.states,
			personOverrides,
			voice: curationStore.current.voice
		})
	);

	/* ── Time-of-day clause (refreshes every 30s) ────────────────────── */
	let now = $state(new Date());
	$effect(() => {
		const t = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(t);
	});

	const todClause = $derived.by(() => {
		const h = now.getHours();
		const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
		const tod =
			h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'small hours';
		return `${day} ${tod}.`;
	});

	/* ── Weather discovery (first weather.* entity, prefer forecast_home) ──
	 * No curation override yet — v0.1 picks generically. Future
	 * /settings/integrations would add an explicit "primary weather"
	 * field for installs with multiple weather entities.
	 */
	const weatherEntityId = $derived.by(() => {
		const ids = discoveryStore.entities
			.filter((e) => e.entity_id.startsWith('weather.') && !e.disabled_by)
			.map((e) => e.entity_id);
		if (ids.includes('weather.forecast_home')) return 'weather.forecast_home';
		return ids[0] ?? null;
	});
	const weatherState = $derived(
		weatherEntityId ? discoveryStore.states[weatherEntityId]?.state : null
	);
	const outsideTemp = $derived.by(() => {
		if (!weatherEntityId) return null;
		const v = discoveryStore.states[weatherEntityId]?.attributes?.temperature;
		return typeof v === 'number' ? v : null;
	});
	const outsideClause = $derived.by(() => {
		if (outsideTemp == null) return null;
		const cond = (weatherState ?? '').replace(/_/g, '-');
		return cond ? `Outside ${outsideTemp}°C, ${cond}.` : `Outside ${outsideTemp}°C.`;
	});

	const manifestClauses = $derived(
		[todClause, presenceClause, outsideClause].filter(Boolean) as string[]
	);

	/* ── Painting seed for the procedural fallback ────────────────────── */
	const paintingSeed = $derived.by(() => {
		if (!discovery.booted) return 'loading';
		const home = presence.find((s) => s.isHome);
		if (!home) return 'empty';
		return home.room ?? 'home';
	});

	/* ── Quick reach actions ──────────────────────────────────────────── */
	// Discover the primary entities generically — first TV, first lock.
	const allTvs = $derived(discovery.areas.flatMap((a) => a.tvs));
	const allLocks = $derived(discovery.areas.flatMap((a) => a.locks));
	const primaryTv = $derived(allTvs[0] ?? null);
	const primaryLock = $derived(allLocks[0] ?? null);
	const hasLights = $derived(discovery.areas.some((a) => a.lights.length > 0));

	const tvOn = $derived.by(() => {
		const s = primaryTv?.state?.state ?? '';
		return ['on', 'playing', 'paused', 'idle'].includes(s);
	});
	const lockState = $derived(primaryLock?.state?.state ?? null);
	const isLocked = $derived(lockState === 'locked');
	const lockBanned = $derived(getHardBannedDomains().includes('lock'));

	let busy = $state<string | null>(null);
	async function withBusy(label: string, fn: () => Promise<unknown>) {
		busy = label;
		try {
			await fn();
		} finally {
			setTimeout(() => (busy = null), 800);
		}
	}

	const fireLightsOff = () =>
		withBusy('lights-off', () =>
			callService('light', 'turn_off', { entity_id: 'all' })
		);
	const fireTv = () =>
		withBusy('tv', () => (primaryTv ? callToggle(primaryTv.id) : Promise.resolve()));
	const fireUnlock = () =>
		withBusy('unlock', () =>
			primaryLock
				? callService('lock', 'unlock', { entity_id: primaryLock.id })
				: Promise.resolve()
		);

	function tvLabel(): string {
		if (!primaryTv) return 'TV — none';
		return tvOn ? 'TV off' : 'TV on';
	}
	function tvSubtitle(): string {
		if (!primaryTv) return 'no TV discovered';
		const s = primaryTv.state?.state;
		if (!s || s === 'unavailable') return 'not reporting';
		return tvOn ? 'on now' : s;
	}
	function unlockSubtitle(): string {
		if (!primaryLock) return 'no lock discovered';
		if (lockBanned) return 'safety-rail blocked';
		if (!lockState || lockState === 'unavailable') return 'not reporting';
		if (!isLocked) return `already ${lockState}`;
		return 'locked';
	}
</script>

<svelte:head>
	<title>broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="The moment" />
		{/snippet}
		{#snippet headline()}
			{#if !discovery.booted}
				Reading the house…
			{:else if manifestClauses.length === 0}
				Quiet.
			{:else}
				{#each manifestClauses as line, i (i)}{line}{#if i < manifestClauses.length - 1}
						<br />
					{/if}{/each}
			{/if}
		{/snippet}
	</Hero>

	<div class="painting-band">
		{#if painting.current}
			{@const Painting = painting.current}
			<Painting persons={discovery.persons} />
		{:else}
			<ProceduralPainting seed={paintingSeed} mood="warm" />
		{/if}
	</div>

	{#if discovery.booted && (hasLights || primaryTv || primaryLock)}
		<section class="quick-reach" aria-label="Quick reach">
			<header class="qr-eyebrow">quick reach</header>
			<div class="qr-row">
				{#if hasLights}
					<button
						type="button"
						class="qr-chip"
						class:busy={busy === 'lights-off'}
						onclick={fireLightsOff}
					>
						<span class="qr-label">All lights off</span>
						<span class="qr-state">whole house</span>
					</button>
				{/if}
				{#if primaryTv}
					<button
						type="button"
						class="qr-chip"
						class:busy={busy === 'tv'}
						onclick={fireTv}
					>
						<span class="qr-label">{tvLabel()}</span>
						<span class="qr-state">{tvSubtitle()}</span>
					</button>
				{/if}
				{#if primaryLock}
					<button
						type="button"
						class="qr-chip"
						class:busy={busy === 'unlock'}
						onclick={fireUnlock}
						disabled={lockBanned || !isLocked}
					>
						<span class="qr-label">Unlock the door</span>
						<span class="qr-state">{unlockSubtitle()}</span>
					</button>
				{/if}
			</div>
		</section>
	{/if}

	<Explainer>
		Who's home is the parent of <a href="{base}/long-take">the long take</a>,
		<a href="{base}/emanations">the paintings on the wall</a>, and
		<a href="{base}/body">the bodies behind it</a>. The day around them is described in
		<a href="{base}/lights">light</a>, <a href="{base}/heat">heat</a>,
		<a href="{base}/door">comings and goings</a>, and <a href="{base}/tv">tonight's screen</a>.
	</Explainer>

	<footer class="colophon">
		<span class="brand">broadsheet</span>
		<span class="sep" aria-hidden="true">·</span>
		<span>№ 01 · the moment</span>
		{#if connection.haVersion}
			<span class="sep" aria-hidden="true">·</span>
			<span>HA {connection.haVersion}</span>
		{/if}
	</footer>
</PageShell>

<style>
	.painting-band {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 7;
		margin: var(--space-2) 0 var(--space-6);
		border-radius: var(--radius-card);
		overflow: hidden;
		border: 1px solid var(--rule);
	}

	/* Quick-reach: editorial chip row, not a control panel */
	.quick-reach {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}

	.qr-eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: lowercase;
		color: var(--fg-dim);
		margin: 0;
	}

	.qr-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
	}

	.qr-chip {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		cursor: pointer;
		text-align: left;
		min-height: 64px;
		transition: border-color var(--ease-quick), background var(--ease-quick), color var(--ease-quick);
	}

	.qr-chip:hover:not(:disabled) {
		border-color: var(--accent);
	}

	.qr-chip:active:not(:disabled) {
		background: var(--bg-raised);
	}

	.qr-chip:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.qr-chip.busy {
		background: var(--accent);
		border-color: var(--accent);
	}

	.qr-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.15rem;
		color: var(--accent);
		line-height: 1;
	}

	.qr-chip.busy .qr-label {
		color: var(--bg);
	}

	.qr-state {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: lowercase;
		color: var(--fg-muted);
	}

	.qr-chip.busy .qr-state {
		color: var(--bg);
		opacity: 0.7;
	}

	.colophon {
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: var(--space-2);
		margin-top: var(--space-12);
		padding-top: var(--space-4);
		border-top: 1px solid var(--rule);
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
