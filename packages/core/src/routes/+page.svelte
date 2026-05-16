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
	import { callService, callToggle, getHardBannedDomains } from '$lib/ha/actions';
	import { pluginDataUrl } from '$lib/plugins/assets';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import Explainer from '$lib/components/Explainer.svelte';
	import PresenceCards from '$lib/components/PresenceCards.svelte';
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

	const NOT_PRESENT = new Set(['', 'unknown', 'unavailable', 'not_home', 'away', 'none']);

	function personSlug(p: DomainPerson): string {
		return p.id.replace(/^person\./, '');
	}
	function effectiveSensorFor(p: DomainPerson): string | null {
		const overrideId = personOverrides[p.id];
		return overrideId === null ? null : overrideId ?? p.suggestedPresenceSensor ?? null;
	}

	type PresenceSlot = { kind: 'in-room'; area: DomainArea } | { kind: 'away' };

	function presenceFor(p: DomainPerson): PresenceSlot {
		const sensorId = effectiveSensorFor(p);
		if (!sensorId) return { kind: 'away' };
		// V3.2 dogfood split-brain bug: `discovery.byEntityId(sensorId)`
		// reads from the entity-registry projection. Template sensors
		// like `sensor.alfie_committed_room` (defined via `template:` in
		// configuration.yaml) live in HA's state machine but aren't
		// always registered in the entity registry — so byEntityId
		// returns null, this function falls through to 'away', and the
		// person tile shows AWAY while the moment-text manifest
		// (which reads directly from `discoveryStore.states`) shows
		// the correct room. Fix: prefer the registry entity when
		// available, but fall back to the raw state-machine record.
		const fromRegistry = discovery.byEntityId(sensorId)?.state?.state;
		const fromStates = discoveryStore.states[sensorId]?.state;
		const stateValue = (fromRegistry ?? fromStates ?? '').toString().trim();
		if (!stateValue || NOT_PRESENT.has(stateValue.toLowerCase())) return { kind: 'away' };
		// V3 manual dogfood (BUG B-6): templated presence sensors like
		// sensor.alfie_committed_room can report EITHER the area's display
		// name ("Office") OR its slug ("alfies_office") depending on how the
		// HA-side template was written. Matching only on area.name would
		// silently fall through to 'away' for any sensor that reports slugs
		// — which then bypasses the user's uploaded room painting AND
		// renders "AWAY" on the person tile even though the user is
		// demonstrably home. Match either form, case-insensitive, with the
		// slug-normalised version of the display name too as a fallback
		// (covers sensors that report 'living_room' against an area whose
		// display name is 'Living Room').
		const needle = stateValue.toLowerCase();
		const slugNeedle = needle.replace(/\s+/g, '_');
		// Strategy 1: exact match on name / id / slugged-name. Catches
		// the common case where the HA area is friendly-named (e.g.
		// "Living Room") and the sensor reports the same string.
		const exact = discovery.areas.find((a) => {
			if (a.id === '__unsorted__') return false;
			if (a.name.toLowerCase() === needle) return true;
			if (a.id.toLowerCase() === slugNeedle) return true;
			if (a.name.toLowerCase().replace(/\s+/g, '_') === slugNeedle) return true;
			return false;
		});
		if (exact) return { kind: 'in-room', area: exact };

		// Strategy 2: suffix match on area_id. Catches the case where
		// the HA area is slug-named ("alfies_office") and the sensor
		// reports just the room part ("Office"). Multiple areas can
		// match (alfies_office + elenas_office both endWith "_office")
		// — prefer the one whose id starts with the person's first
		// name (or its possessive form). Example: needle="office",
		// candidates=[alfies_office, elenas_office], person Alfie →
		// prefer alfies_office because "alfies" startsWith "alfie".
		const suffix = `_${slugNeedle}`;
		const suffixMatches = discovery.areas.filter(
			(a) => a.id !== '__unsorted__' && a.id.toLowerCase().endsWith(suffix)
		);
		if (suffixMatches.length === 0) return { kind: 'away' };
		if (suffixMatches.length === 1) {
			return { kind: 'in-room', area: suffixMatches[0] };
		}
		// Disambiguate by person-affiliation
		const firstName = p.name.split(' ')[0].toLowerCase();
		const affiliated = suffixMatches.find(
			(a) =>
				a.id.toLowerCase().startsWith(firstName + '_') ||
				a.id.toLowerCase().startsWith(firstName + 's_')
		);
		return { kind: 'in-room', area: affiliated ?? suffixMatches[0] };
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
			return {
				person: p,
				paintingUrl: paintingsEnabled ? paintingForPerson(p, slot) : null,
				locationLabel: slot.kind === 'in-room' ? slot.area.name : 'Away',
				away: slot.kind === 'away'
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
		// Lock writes are intentionally banned in v0.1 — see /door for the
		// full message. We keep the tile visible for shape but make the
		// disabled state read like a deliberate choice, not a broken button.
		if (lockBanned) return 'view-only — open /door';
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
				<!-- highlightValues HTML-escapes input then wraps numeric
				     values + rate-band descriptors in <em>; safe to {@html}. -->
				{#each manifestClauses as line, i (i)}<!--
					-->{@html highlightValues(line)}{#if i < manifestClauses.length - 1}
						<br />
					{/if}{/each}
			{/if}
		{/snippet}
	</Hero>

	{#if discovery.booted}
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
		Who's home shapes <a href="{base}/long-take">the long take</a> and
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
