<script lang="ts">
	/**
	 * PresenceCards — one card per discovered person, painting + label.
	 *
	 * Both `/` (the moment) and the @broadsheet/emanations plugin's
	 * /emanations page render the same card grid. This is the shared
	 * implementation; pages just compose the data and pass it in.
	 *
	 * Render decisions kept inside the component:
	 *  - 1 / 2 / 3+ column responsive grid (data-count attribute)
	 *  - The `<MultiPersonPainting>` renderer slot (resolved via
	 *    useRenderer so the plugin owns the actual painting logic;
	 *    if no plugin provides it, the card-band renders empty)
	 *  - Person name + dot + location label below each band
	 *
	 * Data the page must supply (one Card per person):
	 *  - person       — DomainPerson
	 *  - paintingUrl  — string | null (resolved from the curation
	 *                   schema by the page; null → procedural fallback
	 *                   inside the renderer)
	 *  - locationLabel — string ("Office" / "Away" / "Library")
	 *  - away         — boolean (toggles the .away faded style)
	 *
	 * Why "page resolves, component renders": presence resolution is
	 * a curation concern (which sensor for which person, which room
	 * counts as which area, etc) — pages own that. The component just
	 * consumes already-resolved Cards. Keeps the component dumb +
	 * reusable for surfaces that resolve cards differently (a future
	 * /lockscreen view might choose its OWN painting set, etc).
	 */

	import { useRenderer } from '$lib/plugins/renderers.svelte';
	import ProceduralPainting from './ProceduralPainting.svelte';
	import type { PresenceCard } from './PresenceCards.types';

	let { cards }: { cards: PresenceCard[] } = $props();

	// Opportunistic upgrade: when @broadsheet/emanations is active, its
	// renderer (MultiPersonPainting) fills each card's band with the
	// proper axonometric painting + multi-person orbs. When the plugin
	// is OFF (fresh-install default), we fall back to the in-core
	// ProceduralPainting — a hash-seeded warm gradient — so the band
	// reads as intentional ambient art, not as a missing image. See
	// BUG-007: previously the band rendered as an empty box on fresh
	// installs.
	const painting = useRenderer('multi-person-painting');
</script>

{#if cards.length > 0}
	<div class="cards" data-count={cards.length}>
		{#each cards as card (card.person.id)}
			<article class="card" class:away={card.away}>
				<div class="card-band">
					{#if painting.current}
						{@const Painting = painting.current}
						<Painting
							persons={[card.person]}
							paintings={card.paintingUrl ? [card.paintingUrl] : []}
						/>
					{:else}
						<ProceduralPainting
							seed={card.person.id}
							mood={card.away ? 'cool' : 'warm'}
						/>
					{/if}
				</div>
				<header class="card-meta">
					<h3 class="card-name">{card.person.name}</h3>
					<p class="card-loc">
						<span class="dot" data-state={card.away ? 'away' : 'in-room'}></span>
						{card.locationLabel}
					</p>
				</header>
			</article>
		{/each}
	</div>
{/if}

<style>
	.cards {
		display: grid;
		gap: var(--space-4);
		margin: var(--space-2) 0 var(--space-6);
	}

	/* 1 → full width; 2 → split 50/50; 3+ → grid wrap */
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
</style>
