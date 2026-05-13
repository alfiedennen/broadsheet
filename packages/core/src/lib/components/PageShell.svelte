<script lang="ts">
	/**
	 * PageShell — the outer container every broadsheet page sits inside.
	 *
	 * Width modes:
	 *  - 'default' (60ch): typical editorial reading width, generous margins
	 *  - 'narrow' (44ch): single-column dense (setup form, settings rows)
	 *  - 'wide' (80ch): page that needs more horizontal real estate (door/tv)
	 *  - 'bleed': full-viewport-width (immersive painting, ghost-cloud, etc)
	 *
	 * Spec: docs/ARCHITECTURE.md
	 */

	type Width = 'narrow' | 'default' | 'wide' | 'bleed';

	let {
		width = 'default' as Width,
		children
	}: {
		width?: Width;
		children: import('svelte').Snippet;
	} = $props();
</script>

<main class="shell" data-width={width}>
	{@render children()}
</main>

<style>
	.shell {
		margin-inline: auto;
		padding: var(--space-12) var(--space-6);
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	@media (min-width: 640px) {
		.shell {
			padding: var(--space-16) var(--space-8);
		}
	}

	.shell[data-width='narrow'] {
		max-width: 44ch;
	}
	.shell[data-width='default'] {
		max-width: 64ch;
	}
	.shell[data-width='wide'] {
		max-width: 88ch;
	}
	.shell[data-width='bleed'] {
		max-width: none;
		padding: 0;
	}
</style>
