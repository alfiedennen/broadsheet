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
		size = 'lg' as 'md' | 'lg' | 'xl'
	}: {
		eyebrow?: Snippet;
		headline: Snippet;
		dek?: Snippet;
		size?: 'md' | 'lg' | 'xl';
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
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.hero-eyebrow {
		margin-bottom: var(--space-2);
	}

	.hero-headline {
		font-family: var(--font-display);
		font-style: italic;
		font-weight: 400;
		color: var(--accent);
		line-height: var(--leading-tight);
		letter-spacing: var(--track-tight);
		margin: 0;
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
		max-width: 36ch;
		margin: var(--space-2) 0 0;
	}
</style>
