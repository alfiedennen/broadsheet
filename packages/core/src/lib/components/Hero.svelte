<script lang="ts">
	/**
	 * Hero — the page-opening composition. Eyebrow + Headline + Dek
	 * (sub-headline). The headline is italic Instrument Serif, the dek
	 * is muted Newsreader.
	 *
	 * Snippets let pages compose their own eyebrow / headline / dek
	 * without us baking in a specific sentence shape.
	 *
	 * Layout: stacked on narrow viewports, magazine-spread on wide
	 * (eyebrow + dek on left, headline takes 60% on right).
	 */

	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		headline,
		dek,
		size = 'lg' as 'sm' | 'md' | 'lg' | 'xl'
	}: {
		eyebrow?: Snippet;
		headline: Snippet;
		dek?: Snippet;
		/**
		 * Headline scale. 'sm' added in 0.8.6 polish for dense pages
		 * (/lights, /heat, /wall, /tv) where the editorial Hero was
		 * pushing first-section content below the fold on 13"/laptop
		 * viewports. 'md' default for content pages; 'lg' / 'xl' reserved
		 * for hero pages like the moment landing.
		 */
		size?: 'sm' | 'md' | 'lg' | 'xl';
	} = $props();
</script>

<header class="hero" data-size={size}>
	{#if eyebrow}
		<div class="hero-eyebrow">{@render eyebrow()}</div>
	{/if}

	<div class="hero-headline" data-role="headline">{@render headline()}</div>

	{#if dek}
		<p class="hero-dek">{@render dek()}</p>
	{/if}
</header>

<style>
	/* 0.8.6 polish: tighter default margins. Was margin-bottom space-6
	 * + eyebrow margin-bottom space-2 = ~56px floor under the hero
	 * before any content even started. New: PageShell.gap (space-8 = 32px)
	 * is the inter-block spacer, hero doesn't add to it. */
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.hero-eyebrow {
		margin-bottom: var(--space-1);
	}

	.hero-headline {
		font-family: var(--font-display);
		font-style: italic;
		font-weight: 400;
		color: var(--accent);
		line-height: var(--leading-tight);
		letter-spacing: var(--track-tight);
		margin: 0;
		opacity: 0.92;
	}

	/* `<em>` inside the headline is the value-pop register — same italic-amber
	   as the surrounding text but at full opacity, so numerical values
	   ("17°C", "8p", "cheap") read as the spine of the manifest sentence.
	   :global because pages may emit `<em>` via {@html} from the moment-
	   manifest highlightValues helper. */
	.hero-headline :global(em) {
		opacity: 1;
		font-style: italic;
	}

	.hero[data-size='sm'] .hero-headline {
		font-size: var(--text-headline-sm);
	}
	.hero[data-size='md'] .hero-headline {
		font-size: var(--text-headline-md);
	}
	.hero[data-size='lg'] .hero-headline {
		font-size: var(--text-headline-lg);
	}
	.hero[data-size='xl'] .hero-headline {
		font-size: var(--text-headline-xl);
	}

	.hero-dek {
		color: var(--fg-muted);
		font-size: var(--text-body-lg);
		line-height: var(--leading-snug);
		max-width: 60ch;
		margin: var(--space-2) 0 0;
	}

	/* Short viewports — compress more aggressively so dense pages
	 * (lights, heat, wall) keep first-section content above the fold. */
	@media (max-height: 800px) {
		.hero {
			gap: var(--space-1);
		}
		.hero-eyebrow {
			margin-bottom: 0;
		}
		.hero-dek {
			margin-top: var(--space-1);
		}
	}
</style>
