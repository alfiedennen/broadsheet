<script lang="ts">
	/**
	 * /emanations — every person, where they are right now.
	 *
	 * One card per discovered person, always visible. Each card's image
	 * is decided by the person's CURRENT state:
	 *
	 *   - In a room → the SOLO variant of that room
	 *     (`paintingSets.<active>.<areaId>.<personSlug>` = filename)
	 *   - Away      → the per-person AWAY image
	 *     (`paintingSets.personImages.<personSlug>.away` = filename)
	 *   - Otherwise → procedural fallback (the renderer's own gradient)
	 *
	 * Notes on the model:
	 *  - "Solo variant of their current room" is deliberate even when
	 *    multiple people are in the same room. Each person's card is
	 *    *them*, not "them and whoever else"; combo paintings (variant
	 *    `a+b`) aren't used here. They remain in the schema for future
	 *    surfaces (a household-view tile, a Lovelace strategy card, etc.).
	 *  - "Where each person is" is the prose; "where the action is" was
	 *    the previous lead-area model — the user's right reading was that
	 *    the ROOM-CENTRIC view was the wrong frame. People-centric is
	 *    simpler and surfaces the away case naturally.
	 */
	import {
		PageShell,
		Hero,
		Eyebrow,
		Explainer,
		discovery,
		pluginDataUrl,
		useCurationField,
		type DomainPerson,
		type DomainArea
	} from '@broadsheet/core';
	import { base } from '$app/paths';
	import MultiPersonPainting from '../renderers/MultiPersonPainting.svelte';

	const persons = $derived(discovery.persons);

	const usePaintings = useCurationField<boolean>('plugins.emanations.config.usePaintings');
	const paintingsEnabled = $derived(usePaintings.value !== false);

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

	type PersonOverrideShape = { personId: string; presenceSensorId: string | null };
	const peopleOverrides = useCurationField<PersonOverrideShape[]>('people');

	function personSlug(p: DomainPerson): string {
		return p.id.replace(/^person\./, '');
	}

	function effectiveSensorFor(p: DomainPerson): string | null {
		const override = peopleOverrides.value?.find((x) => x.personId === p.id);
		return override?.presenceSensorId ?? p.suggestedPresenceSensor ?? null;
	}

	const NOT_PRESENT = new Set(['', 'unknown', 'unavailable', 'not_home', 'away', 'none']);

	/* ── Per-person current location ─────────────────────────────── */
	type PresenceSlot =
		| { kind: 'in-room'; area: DomainArea }
		| { kind: 'away' };

	function presenceFor(p: DomainPerson): PresenceSlot {
		const sensorId = effectiveSensorFor(p);
		if (!sensorId) return { kind: 'away' };
		const sensor = discovery.byEntityId(sensorId);
		const stateValue = (sensor?.state?.state ?? '').toString().trim();
		if (!stateValue || NOT_PRESENT.has(stateValue.toLowerCase())) return { kind: 'away' };
		const area = discovery.areas.find(
			(a) => a.id !== '__unsorted__' && a.name.toLowerCase() === stateValue.toLowerCase()
		);
		return area ? { kind: 'in-room', area } : { kind: 'away' };
	}

	/* ── Painting URL resolution per person ──────────────────────── */
	function activeSetMap(): SetMapping {
		const cfg = paintingSets.value;
		const active = cfg?.active ?? 'default';
		return cfg?.sets?.[active] ?? {};
	}

	function paintingForPerson(p: DomainPerson, slot: PresenceSlot): string | null {
		const slug = personSlug(p);
		if (slot.kind === 'in-room') {
			const filename = activeSetMap()[slot.area.id]?.[slug];
			return filename ? pluginDataUrl('emanations', filename) : null;
		}
		// away
		const awayFn = paintingSets.value?.personImages?.[slug]?.away;
		return awayFn ? pluginDataUrl('emanations', awayFn) : null;
	}

	/* ── The cards: one per person, always ───────────────────────── */
	type Card = {
		person: DomainPerson;
		slot: PresenceSlot;
		paintingUrl: string | null;
		locationLabel: string;
	};

	const cards = $derived.by((): Card[] =>
		persons.map((p) => {
			const slot = presenceFor(p);
			return {
				person: p,
				slot,
				paintingUrl: paintingsEnabled ? paintingForPerson(p, slot) : null,
				locationLabel: slot.kind === 'in-room' ? slot.area.name : 'Away'
			};
		})
	);

	/* ── Headline prose — describe the whole household ───────────── */
	const headlineProse = $derived.by(() => {
		if (cards.length === 0) return 'No people discovered.';
		const phrase = (c: Card) =>
			c.slot.kind === 'in-room'
				? `${c.person.name} in the ${c.slot.area.name}`
				: `${c.person.name} away`;
		// Collapse "everyone in the same room" → "Both in the X."
		if (cards.length > 1 && cards.every((c) => c.slot.kind === 'in-room')) {
			const firstArea = (cards[0].slot as { kind: 'in-room'; area: DomainArea }).area;
			const allSame = cards.every(
				(c) => c.slot.kind === 'in-room' && c.slot.area.id === firstArea.id
			);
			if (allSame) {
				const word = cards.length === 2 ? 'Both' : 'Everyone';
				return `${word} in the ${firstArea.name}.`;
			}
		}
		// Collapse "everyone away" → "Nobody home."
		if (cards.every((c) => c.slot.kind === 'away')) return 'Nobody home.';
		// General — list each person + their place
		const parts = cards.map(phrase);
		if (parts.length === 1) return parts[0] + '.';
		if (parts.length === 2) return parts.join(', ') + '.';
		return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] + '.';
	});

	const paintingCount = $derived.by(() => cards.filter((c) => c.paintingUrl !== null).length);
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
			Each person, where they are right now — their painting if you've mapped one, a
			procedural field if not.
		{/snippet}
	</Hero>

	{#if cards.length > 0}
		<div class="cards" data-count={cards.length}>
			{#each cards as card (card.person.id)}
				<article class="card" class:away={card.slot.kind === 'away'}>
					<div class="card-band">
						<MultiPersonPainting
							persons={[card.person]}
							paintings={card.paintingUrl ? [card.paintingUrl] : []}
						/>
					</div>
					<header class="card-meta">
						<h3 class="card-name">{card.person.name}</h3>
						<p class="card-loc">
							<span class="dot" data-state={card.slot.kind}></span>
							{card.locationLabel}
						</p>
					</header>
				</article>
			{/each}
		</div>
	{:else}
		<p class="empty">No people discovered. Add a person in HA Settings → People.</p>
	{/if}

	<dl class="facts">
		<dt>People</dt>
		<dd>{cards.length}</dd>
		<dt>Paintings rendered</dt>
		<dd>
			{paintingCount} of {cards.length}
			{#if cards.length > 0 && paintingCount < cards.length}
				· {cards.length - paintingCount} on procedural fallback
			{/if}
		</dd>
		<dt>Painting mode</dt>
		<dd>{paintingsEnabled ? 'on' : 'off (Settings → Plugins → Emanations)'}</dd>
	</dl>

	<Explainer>
		The painting changes with <a href="{base}/">who's home</a>. For the deeper presence
		layer that drives the swap — body movement over time —
		<a href="{base}/long-take">the long take</a>.
	</Explainer>
</PageShell>

<style>
	.cards {
		display: grid;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	/* 2 people → split 50/50 horizontally; 1 → full width; 3+ → grid wrap */
	.cards[data-count='1'] {
		grid-template-columns: 1fr;
	}
	.cards[data-count='2'] {
		grid-template-columns: 1fr 1fr;
	}
	.cards:not([data-count='1']):not([data-count='2']) {
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--bg-card);
	}

	.card.away {
		opacity: 0.86;
	}

	.card-band {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
	}

	.card-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 0 var(--space-4) var(--space-3);
	}

	.card-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--accent);
		margin: 0;
		font-weight: 400;
	}

	.card-loc {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--state-on, #7aa37a);
		display: inline-block;
	}

	.dot[data-state='away'] {
		background: var(--fg-dim);
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-6);
		margin: var(--space-6) 0 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--rule);
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
