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
	import {
		indoorTempClause,
		electricityRateClause,
		highlightValues
	} from '$lib/manifest/momentSensors';
	import { humanizeWeatherState } from '$lib/utils/humanize';
	import type { DomainArea, DomainPerson } from '$lib/discovery';
	import { connection } from '$lib/stores/connection.svelte';
	import { curationStore, useCurationField } from '$lib/curation/store.svelte';
	import { callService, callToggle } from '$lib/ha/actions';
	import { pluginDataUrl } from '$lib/plugins/assets';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import Explainer from '$lib/components/Explainer.svelte';
	import PresenceCards from '$lib/components/PresenceCards.svelte';
	import InlinePin from '$lib/components/InlinePin.svelte';
	import { resolvePersonPresence, buildPresenceContext } from '$lib/presence';
	import type { PresenceCard } from '$lib/components/PresenceCards.types';
	import { useRenderer } from '$lib/plugins/renderers.svelte';

	// Voice plugin's mic pill. Renders bottom-right when the user
	// has enabled @broadsheet/voice AND not opted out via the
	// pillOnMoment curation flag. The renderer self-gates on the
	// flag; if the plugin is off, .current is null and nothing
	// mounts. See packages/voice/src/renderers/VoicePillRenderer.svelte.
	const voicePill = useRenderer('voice-pill');

	const personOverrides = $derived(
		Object.fromEntries(
			curationStore.current.people.map((p) => [p.personId, p.presenceSensorId])
		)
	);

	const presence = $derived(
		resolvePresence({
			persons: discovery.persons,
			states: discoveryStore.states,
			personOverrides,
			areas: discovery.areas
		})
	);

	const presenceClause = $derived(
		composeManifest({
			persons: discovery.persons,
			states: discoveryStore.states,
			personOverrides,
			voice: curationStore.current.voice,
			areas: discovery.areas
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
		// HA weather states ship as run-together IDs (`partlycloudy`,
		// `clear-night`); humanize for editorial prose. See BUG-014.
		const cond = humanizeWeatherState(weatherState);
		return cond ? `Outside ${outsideTemp}°C, ${cond}.` : `Outside ${outsideTemp}°C.`;
	});

	/* ── Indoor temp clause ("Hallway 17°C.") ────────────────────────── */
	const curatedIndoorTempId = $derived(
		curationStore.current.momentSensors?.primaryIndoorTempSensorId ?? null
	);
	const areaNameOf = (entityId: string): string | null => {
		const e = discovery.byEntityId(entityId);
		if (!e?.areaId) return null;
		const area = discovery.areas.find((a) => a.id === e.areaId);
		return area?.name ?? null;
	};
	const indoorClause = $derived(
		indoorTempClause(discoveryStore.states, curatedIndoorTempId, areaNameOf)
	);

	/* ── Electricity rate clause ("Electricity cheap at 8p.") ────────── */
	const curatedRateId = $derived(
		curationStore.current.momentSensors?.primaryElectricityRateSensorId ?? null
	);
	const rateClause = $derived(electricityRateClause(discoveryStore.states, curatedRateId));

	const manifestClauses = $derived(
		[todClause, presenceClause, indoorClause, rateClause, outsideClause].filter(
			Boolean
		) as string[]
	);

	/* ── Per-person presence cards ────────────────────────────────────
	 * Mirrors /emanations: one card per discovered person, painting
	 * resolved by current state (in-room → solo variant; away → person
	 * away image). Lifted from EmanationsPage so `/` shows the same
	 * imagery — the moment view is the unified surface, /emanations
	 * remains accessible but is increasingly redundant.
	 */
	type AreaMapping = Record<string, string | null>;
	type SetMapping = Record<string, AreaMapping>;
	type PaintingSetsConfig = {
		active: string;
		sets: Record<string, SetMapping>;
		personImages?: Record<string, { away?: string | null }>;
	};
	const paintingSets = useCurationField<PaintingSetsConfig>(
		'plugins.emanations.config.paintingSets'
	);
	const usePaintings = useCurationField<boolean>('plugins.emanations.config.usePaintings');
	const paintingsEnabled = $derived(usePaintings.value !== false);

	// Theme F: presenceFor now wraps the single source of truth in
	// $lib/presence so the home tile + manifest line + future
	// presence-aware features (Theme C) never drift apart.
	function personSlug(p: DomainPerson): string {
		return p.id.replace(/^person\./, '');
	}

	type PresenceSlot = { kind: 'in-room'; area: DomainArea } | { kind: 'away' };
	function presenceFor(p: DomainPerson): PresenceSlot {
		const r = resolvePersonPresence(p, buildPresenceContext(personOverrides));
		// Home tile only renders 'in-room' when we have a specific
		// area — bare 'home' (HA's person state without a committed-
		// room sensor) reads as away for tile purposes since there's
		// no room to label.
		if (!r.home || !r.area) return { kind: 'away' };
		return { kind: 'in-room', area: r.area };
	}

	function paintingForPerson(p: DomainPerson, slot: PresenceSlot): string | null {
		const cfg = paintingSets.value;
		const slug = personSlug(p);
		if (slot.kind === 'in-room') {
			const active = cfg?.active ?? 'default';
			const fn = cfg?.sets?.[active]?.[slot.area.id]?.[slug];
			return fn ? pluginDataUrl('emanations', fn) : null;
		}
		const awayFn = cfg?.personImages?.[slug]?.away;
		return awayFn ? pluginDataUrl('emanations', awayFn) : null;
	}

	const cards = $derived.by((): PresenceCard[] =>
		discovery.persons.map((p) => {
			const slot = presenceFor(p);
			// Theme H: every person tile gets an InlinePin pointing at
			// /settings/people with the person's row pre-highlighted via
			// hash. The confidence indicator distinguishes:
			//   - 'overridden' → user has curated a specific sensor in
			//     curation.people for this person; ★ they own this
			//   - 'low' → person resolved to 'away' but discovery has a
			//     ranked sensor list available (suggests auto-pick was
			//     wrong or sensor reports a value we don't recognise)
			//   - 'auto' → auto-pick is working and resolved to a room
			const hasCuratedOverride = curationStore.current.people.some(
				(x) => x.personId === p.id && x.presenceSensorId !== undefined
			);
			const confidence: 'auto' | 'low' | 'overridden' = hasCuratedOverride
				? 'overridden'
				: slot.kind === 'away' && p.rankedPresenceSensors.length > 0
					? 'low'
					: 'auto';
			const resolvedPainting = paintingsEnabled ? paintingForPerson(p, slot) : null;
			// Theme H: when paintings are enabled, the person is
			// in-room, AND there's no painting mapped for this
			// (person, room) combo — surface a pin pointing at the
			// emanations config so the user can upload one.
			// (Out-of-room "away" image is a different upload path;
			// keep that to the emanations config flow for now.)
			const paintingPinHref =
				paintingsEnabled && slot.kind === 'in-room' && !resolvedPainting
					? `/settings/plugins/emanations/config/`
					: undefined;
			return {
				person: p,
				paintingUrl: resolvedPainting,
				locationLabel: slot.kind === 'in-room' ? slot.area.name : 'Away',
				away: slot.kind === 'away',
				locationPinHref: `/settings/people/#${encodeURIComponent(p.id)}`,
				locationConfidence: confidence,
				paintingPinHref
			};
		})
	);

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
				<!-- Theme H: render each clause individually so the
				     indoor-temp + electricity-rate clauses get their own
				     InlinePin → navigate to /settings/house at the
				     relevant ms-row. Other clauses (tod, presence,
				     outside) have no picker target so render bare.
				     highlightValues HTML-escapes input then wraps
				     numeric values + rate-band descriptors in <em>;
				     safe to {@html}. -->
				{#if todClause}{@html highlightValues(todClause)}<br />{/if}
				{#if presenceClause}{@html highlightValues(presenceClause)}<br />{/if}
				{#if indoorClause}{@html highlightValues(indoorClause)}<InlinePin
						label="Change indoor temp sensor"
						href="/settings/house/#moment-sensors-primaryIndoorTempSensorId"
					/><br />{/if}
				{#if rateClause}{@html highlightValues(rateClause)}<InlinePin
						label="Change electricity rate sensor"
						href="/settings/house/#moment-sensors-primaryElectricityRateSensorId"
					/><br />{/if}
				{#if outsideClause}{@html highlightValues(outsideClause)}{/if}
			{/if}
		{/snippet}
	</Hero>

	<!-- 0.8.x polish: the IA cross-link mesh moved ABOVE PresenceCards.
	     User feedback after 0.8.0 walk: "All falls below the fold,
	     point size is tiny given it is effectively a navigation item."
	     Placing it here puts the page-to-page links near the top of
	     the home tile (definitely above the fold on any sane viewport)
	     and the prose was tightened so it fits on one line at the
	     wider PageShell. The painting cards still get the "look at the
	     moment" beat below; the colophon stays at the bottom. -->
	{#if discovery.booted}
		<Explainer>
			Who's home shapes <a href="{base}/long-take">the long take</a> and
			<a href="{base}/body">the bodies</a>. Their day —
			<a href="{base}/lights">light</a>, <a href="{base}/heat">heat</a>,
			<a href="{base}/door">comings and goings</a>,
			<a href="{base}/tv">tonight's screen</a>.
		</Explainer>

		<PresenceCards {cards} />
	{/if}

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
						disabled={!isLocked}
					>
						<span class="qr-label">Unlock the door</span>
						<span class="qr-state">{unlockSubtitle()}</span>
					</button>
				{/if}
			</div>
		</section>
	{/if}

	<footer class="colophon">
		<span class="brand">broadsheet</span>
		<span class="sep" aria-hidden="true">·</span>
		<span>№ 01 · the moment</span>
		{#if connection.haVersion}
			<span class="sep" aria-hidden="true">·</span>
			<span>HA {connection.haVersion}</span>
		{/if}
	</footer>

	{#if voicePill.current}
		{@const Pill = voicePill.current}
		<Pill />
	{/if}
</PageShell>

<style>
	/* Per-person painting cards now live in PresenceCards (shared with
	   the @broadsheet/emanations plugin's /emanations page). */

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
