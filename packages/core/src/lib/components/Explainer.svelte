<script lang="ts">
	/**
	 * Explainer — the italic, muted paragraph that threads pages together.
	 *
	 * Each page closes with one of these. The paragraph names *what this
	 * page is to the others* in the broadsheet — using prose, with inline
	 * cross-page links as the navigational mesh. Lifted from harold-home's
	 * explainer pattern and generalised.
	 *
	 * Authoring rule: every link inside an Explainer should resolve to
	 * another broadsheet route. Use `${base}/<route>` so the ingress prefix
	 * is included; bare `/route` would resolve against HA's frontend root
	 * and 404.
	 */
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<p class="explainer">{@render children()}</p>

<style>
	/* 0.8.x polish: this is effectively the page-to-page nav mesh,
	 * sized like a navigation row rather than a footnote. Was
	 * text-caption (~0.85rem) with a 64ch cap — fell below the fold
	 * + broke onto 2 awkward lines on wide viewports. Now sized at
	 * 1.05rem and the cap matches the editorial column so it lays
	 * out on 1 line at default+ viewports. */
	.explainer {
		font-family: var(--font-body);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: var(--space-4) 0 0;
		max-width: 100ch;
	}

	.explainer :global(a) {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in oklab, var(--accent), transparent 60%);
		transition: border-color var(--ease-quick);
	}

	.explainer :global(a:hover) {
		border-bottom-color: var(--accent);
	}
</style>
