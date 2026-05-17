<script lang="ts">
	/**
	 * PageShell — the outer container every broadsheet page sits inside.
	 *
	 * 0.8 polish: widths re-derived from harold-home so big displays
	 * actually use the real-estate they have. The 0.7-era
	 * `default = 64ch (~640px)` was suffocating the magazine spread
	 * pattern — bunched everything in the centre and left ~70% of a
	 * 1920px viewport empty. Reference:
	 * harold-home/src/lib/components/PageShell.svelte.
	 *
	 * Width modes:
	 *  - 'narrow'  — 64ch text column. Prose-only pages (404, settings
	 *                micro-flows, the new /voice explainer).
	 *  - 'default' — 1120px below 1100vw, 1280px above. Editorial
	 *                pages where the Hero + secondary content need
	 *                horizontal room to breathe.
	 *  - 'wide'    — 1120px below 1100vw, 1280px above, 1480px above
	 *                1400vw. For pages with dense per-room grids
	 *                (/lights, /heat in expanded state).
	 *  - 'bleed'   — viewport-width, capped at 1800px so it doesn't
	 *                stretch absurdly on ultrawides.
	 *
	 * Vertical-responsive: at short viewports (< 800px high) we
	 * compress padding so editorial Heroes don't push the first
	 * secondary section below the fold on 13" laptops.
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
		max-width: 1120px;
	}

	@media (min-width: 640px) {
		.shell {
			padding: var(--space-16) var(--space-8);
		}
	}

	.shell[data-width='narrow'] {
		max-width: 64ch;
	}

	.shell[data-width='default'] {
		max-width: 1120px;
	}

	.shell[data-width='wide'] {
		max-width: 1120px;
	}

	.shell[data-width='bleed'] {
		max-width: none;
		padding: 0;
	}

	/* Above 1100vw — default + wide expand. default stops at 1280px
	 * (harold-home's col-page), wide goes further to 1480px for
	 * dense per-room grid pages. */
	@media (min-width: 1100px) {
		.shell[data-width='default'] {
			max-width: 1280px;
		}
		.shell[data-width='wide'] {
			max-width: 1280px;
		}
	}

	@media (min-width: 1400px) {
		.shell[data-width='wide'] {
			max-width: 1480px;
		}
	}

	@media (min-width: 1800px) {
		.shell[data-width='bleed'] {
			padding: 0 var(--space-8);
		}
	}

	/* ── Vertical responsiveness ──
	 * On short viewports compress padding so editorial Heroes don't
	 * push the first secondary section below the fold on 13" laptops
	 * (~720px tall after browser chrome). */
	@media (max-height: 800px) {
		.shell {
			padding-top: var(--space-8);
			padding-bottom: var(--space-8);
			gap: var(--space-6);
		}
	}

	@media (max-height: 650px) {
		.shell {
			padding-top: var(--space-6);
			padding-bottom: var(--space-6);
			gap: var(--space-4);
		}
	}

	@media (max-width: 640px) and (max-height: 650px) {
		.shell {
			padding: var(--space-4) var(--space-4);
			gap: var(--space-3);
		}
	}
</style>
