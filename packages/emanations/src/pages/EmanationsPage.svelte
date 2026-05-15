<script lang="ts">
	/**
	 * /emanations — where everyone is, as living imagery (layer 3).
	 *
	 * Layer 3 wiring: the page consults THREE sources to decide what to
	 * render, in priority order:
	 *
	 *  1. **User mapping** (`plugins.emanations.config.paintingSets`) —
	 *     authored in the settings panel. Per-area + per-variant filename
	 *     pointers into uploaded /plugin-data/. If a current state has a
	 *     mapping, that wins.
	 *
	 *  2. **Bundled manifest** (`discovery.plugins.emanations.paintingSets`)
	 *     — the discoveryContributor's manifest of paintings shipped IN
	 *     the plugin's static/ dir. Used as fallback when the user hasn't
	 *     mapped the current state yet.
	 *
	 *  3. **Procedural** — the renderer's own field gradient. Fired when
	 *     paintings are turned off OR neither (1) nor (2) has anything
	 *     to show.
	 *
	 * Composition:
	 *  - Lead painting (full-bleed) for the LEAD AREA (the area with the
	 *    most present people; ties broken alphabetically).
	 *  - "Across the house" row of small per-area cards showing each
	 *    populated room's variant + thumbnail (so the user sees the whole
	 *    presence map, not just the lead).
	 *  - Source facts panel — fully transparent about which painting
	 *    came from where.
	 *
	 * Variants generalise: keys are sorted person-slugs joined by `+`,
	 * with `empty` for nobody-home. 2 persons → up to 4 variants per
	 * room; 3 persons → 8; matches the settings panel's enumeration.
	 *
	 * Presence resolution: each person's effective sensor (curation
	 * override OR the heuristic suggestedPresenceSensor) is read; its
	 * state value is matched case-insensitively against area names. A
	 * sensor returning `not_home` / `away` / `unknown` / `unavailable`
	 * means the person isn't present in any area.
	 */
	import {
		PageShell,
		Hero,
		Eyebrow,
		OutLine,
		discovery,
		pluginAssetUrl,
		pluginDataUrl,
		useCurationField,
		type DomainPerson,
		type DomainArea
	} from '@broadsheet/core';
	import MultiPersonPainting from '../renderers/MultiPersonPainting.svelte';
	import type { PaintingManifest } from '../discovery/paintingSets';

	const persons = $derived(discovery.persons);

	/* ── Settings + curation reads ────────────────────────────────── */
	const usePaintings = useCurationField<boolean>('plugins.emanations.config.usePaintings');
	const paintingsEnabled = $derived(usePaintings.value !== false);

	type AreaMapping = Record<string, string | null>; // variantKey -> filename
	type SetMapping = Record<string, AreaMapping>; // areaId -> AreaMapping
	type PaintingSetsConfig = { active: string; sets: Record<string, SetMapping> };
	const userPaintingSets = useCurationField<PaintingSetsConfig>(
		'plugins.emanations.config.paintingSets'
	);

	// Curation people overrides (so a user-picked sensor wins over the
	// heuristic suggestedPresenceSensor). Inline type — no need to import
	// PersonOverride from core; structural shape is enough.
	type PersonOverrideShape = { personId: string; presenceSensorId: string | null };
	const peopleOverrides = useCurationField<PersonOverrideShape[]>('people');

	function personSlug(p: DomainPerson): string {
		return p.id.replace(/^person\./, '');
	}

	function effectiveSensorFor(p: DomainPerson): string | null {
		const override = peopleOverrides.value?.find((x) => x.personId === p.id);
		return override?.presenceSensorId ?? p.suggestedPresenceSensor ?? null;
	}

	// Bundled manifest — what the discoveryContributor surfaced from
	// shipped /static/paintings/. Used as the fallback when the user
	// hasn't authored a mapping yet for the current (area, variant).
	const bundledManifest = $derived(
		discovery.plugins.emanations?.paintingSets as PaintingManifest | null | undefined
	);
	const bundledPaintingUrls = $derived.by(() => {
		if (!bundledManifest?.paintings) return [];
		return Object.values(bundledManifest.paintings).map((p) =>
			pluginAssetUrl('emanations', p)
		);
	});

	/* ── Presence: which person is in which area ──────────────────── */
	const NOT_PRESENT = new Set(['', 'unknown', 'unavailable', 'not_home', 'away', 'none']);

	/** areaId -> sorted list of person slugs currently in that area. */
	const presenceByArea = $derived.by(() => {
		const m = new Map<string, string[]>();
		for (const p of persons) {
			const sensorId = effectiveSensorFor(p);
			if (!sensorId) continue;
			const sensor = discovery.byEntityId(sensorId);
			const stateValue = (sensor?.state?.state ?? '').toString().trim();
			if (!stateValue || NOT_PRESENT.has(stateValue.toLowerCase())) continue;
			// stateValue is an area name — match case-insensitively against discovered areas
			const area = discovery.areas.find(
				(a) => a.id !== '__unsorted__' && a.name.toLowerCase() === stateValue.toLowerCase()
			);
			if (!area) continue;
			const arr = m.get(area.id) ?? [];
			arr.push(personSlug(p));
			m.set(area.id, arr);
		}
		// Sort each list so variant keys are deterministic
		for (const [k, v] of m) m.set(k, [...v].sort());
		return m;
	});

	function variantKeyForArea(areaId: string): string {
		const present = presenceByArea.get(areaId) ?? [];
		return present.length === 0 ? 'empty' : present.join('+');
	}

	/* ── Mapping resolution ───────────────────────────────────────── */
	function userMappedFilename(areaId: string, variantKey: string): string | null {
		const cfg = userPaintingSets.value;
		if (!cfg) return null;
		const setName = cfg.active ?? 'default';
		return cfg.sets?.[setName]?.[areaId]?.[variantKey] ?? null;
	}

	function userMappedUrl(areaId: string, variantKey: string): string | null {
		const fn = userMappedFilename(areaId, variantKey);
		return fn ? pluginDataUrl('emanations', fn) : null;
	}

	/* ── Lead area = the area with the most present people ────────── */
	const leadArea = $derived.by((): DomainArea | null => {
		let best: DomainArea | null = null;
		let bestCount = -1;
		for (const a of discovery.areas) {
			if (a.id === '__unsorted__') continue;
			const count = presenceByArea.get(a.id)?.length ?? 0;
			// Strict > so first-found alphabetically wins ties (areas are
			// already name-sorted by domain projection)
			if (count > bestCount) {
				bestCount = count;
				best = a;
			}
		}
		return best;
	});

	const leadVariant = $derived(leadArea ? variantKeyForArea(leadArea.id) : 'empty');
	const leadUserUrl = $derived(leadArea ? userMappedUrl(leadArea.id, leadVariant) : null);

	const slugSet = $derived(new Set(leadArea ? presenceByArea.get(leadArea.id) ?? [] : []));
	const leadPeople = $derived(persons.filter((p) => slugSet.has(personSlug(p))));

	/* ── What gets passed to the renderer + a source label ────────── */
	const renderedPaintings = $derived.by(() => {
		if (!paintingsEnabled) return [];
		if (leadUserUrl) return [leadUserUrl];
		// Fall through to bundled — keeps the v0.1 behaviour as a graceful
		// default when the user hasn't authored a mapping yet.
		return bundledPaintingUrls;
	});

	const paintingSource = $derived.by(() => {
		if (!paintingsEnabled) return 'procedural (paintings off)';
		if (leadUserUrl) return `user library — ${leadVariant}`;
		if (bundledPaintingUrls.length > 0) return 'bundled (no user mapping for this state)';
		return 'procedural (no paintings)';
	});

	/* ── Per-area row — the "where everyone is" map ──────────────── */
	type RoomTile = {
		area: DomainArea;
		slugs: string[];
		variantKey: string;
		userUrl: string | null;
	};
	const populatedRooms = $derived.by((): RoomTile[] => {
		const out: RoomTile[] = [];
		for (const a of discovery.areas) {
			if (a.id === '__unsorted__') continue;
			const slugs = presenceByArea.get(a.id) ?? [];
			if (slugs.length === 0) continue;
			const variantKey = slugs.join('+');
			out.push({ area: a, slugs, variantKey, userUrl: userMappedUrl(a.id, variantKey) });
		}
		return out;
	});

	/* ── Headline prose ──────────────────────────────────────────── */
	function slugLabel(slug: string): string {
		const p = persons.find((x) => personSlug(x) === slug);
		return p?.name ?? slug;
	}

	const headlineProse = $derived.by(() => {
		// Cross-house view: distinct people in distinct areas
		if (populatedRooms.length === 0) return 'Nobody home.';
		if (populatedRooms.length === 1) {
			const { area, slugs } = populatedRooms[0];
			if (slugs.length === 1) return `${slugLabel(slugs[0])} in the ${area.name}.`;
			if (slugs.length === 2) {
				return `${slugLabel(slugs[0])} and ${slugLabel(slugs[1])} in the ${area.name}.`;
			}
			return `Everyone in the ${area.name}.`;
		}
		// People scattered across multiple rooms — describe each room
		const parts = populatedRooms.map(({ area, slugs }) => {
			const names = slugs.map(slugLabel);
			const joined =
				names.length === 1
					? names[0]
					: names.length === 2
						? `${names[0]} and ${names[1]}`
						: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
			return `${joined} in the ${area.name}`;
		});
		return parts.join(', ') + '.';
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
		{#snippet headline()}{headlineProse}{/snippet}
		{#snippet dek()}
			Presence as living imagery — a painting per room when you have them, a procedural field
			when you don't. The lead painting follows whichever area has the most going on.
		{/snippet}
	</Hero>

	<div class="band">
		<MultiPersonPainting persons={leadPeople} paintings={renderedPaintings} />
	</div>

	{#if populatedRooms.length > 1}
		<OutLine label="Across the house" />
		<div class="rooms">
			{#each populatedRooms as room (room.area.id)}
				<article class="room" class:lead={leadArea?.id === room.area.id}>
					<div class="room-thumb-wrap">
						{#if room.userUrl}
							<img
								class="room-thumb"
								src={room.userUrl}
								alt="{room.area.name} — {room.slugs.join(', ')}"
								loading="lazy"
							/>
						{:else}
							<div class="room-thumb placeholder" aria-hidden="true">
								<span>no mapping</span>
							</div>
						{/if}
					</div>
					<div class="room-meta">
						<h3 class="room-name">{room.area.name}</h3>
						<p class="room-people">{room.slugs.map(slugLabel).join(' + ')}</p>
					</div>
				</article>
			{/each}
		</div>
	{/if}

	<OutLine label="Source" />
	<dl class="facts">
		<dt>Lead area</dt>
		<dd>{leadArea?.name ?? '—'}</dd>
		<dt>Variant</dt>
		<dd>
			<code>{leadVariant}</code>
			{#if leadUserUrl}<span class="facts-tag">mapped</span>{/if}
		</dd>
		<dt>Painting source</dt>
		<dd>{paintingSource}</dd>
		<dt>People discovered</dt>
		<dd>{persons.map((p) => p.name).join(', ') || '—'}</dd>
		<dt>People present</dt>
		<dd>
			{#if populatedRooms.length === 0}
				—
			{:else}
				{populatedRooms.reduce((acc, r) => acc + r.slugs.length, 0)} across {populatedRooms.length}
				{populatedRooms.length === 1 ? 'room' : 'rooms'}
			{/if}
		</dd>
		<dt>Painting mode</dt>
		<dd>{paintingsEnabled ? 'on' : 'off (Settings → Plugins → Emanations)'}</dd>
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

	.rooms {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
		margin: 0;
	}

	.room {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		transition: border-color var(--ease-quick);
	}

	.room.lead {
		border-color: var(--accent);
	}

	.room-thumb-wrap {
		aspect-ratio: 16 / 9;
		border-radius: calc(var(--radius-card) - 2px);
		overflow: hidden;
		background: #000;
	}

	.room-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.room-thumb.placeholder {
		display: grid;
		place-items: center;
		color: var(--fg-dim);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		background: var(--bg-raised);
	}

	.room-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.room-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--fg);
		margin: 0;
		font-weight: 400;
	}

	.room.lead .room-name {
		color: var(--accent);
	}

	.room-people {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0;
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
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.facts code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--fg);
	}

	.facts-tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		border: 1px solid var(--accent);
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
	}
</style>
