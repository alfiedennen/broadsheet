<script lang="ts">
	/**
	 * /settings/* layout — sub-nav strip + content area.
	 *
	 * Sub-nav lives at the top so deep-links to /settings/house etc.
	 * still let you jump sideways. Each sub-page is its own route +
	 * page component.
	 */

	import { page } from '$app/state';

	let { children } = $props();

	const tabs = [
		{ slug: '', label: 'Overview' },
		{ slug: 'house', label: 'House' },
		{ slug: 'people', label: 'People' },
		{ slug: 'voice', label: 'Voice' }
	];

	const currentSlug = $derived(
		(page.url.pathname.replace(/^\/settings\/?/, '').replace(/\/$/, '') || '').toLowerCase()
	);
</script>

<div class="settings-shell">
	<header class="settings-header">
		<a class="back" href="/">← Home</a>
		<nav class="tabs" aria-label="Settings sections">
			{#each tabs as tab (tab.slug)}
				<a
					class="tab"
					class:active={currentSlug === tab.slug}
					href={tab.slug ? `/settings/${tab.slug}/` : `/settings/`}
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</header>

	<div class="settings-body">
		{@render children()}
	</div>
</div>

<style>
	.settings-shell {
		min-height: 100vh;
		background: var(--bg);
	}

	.settings-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: rgba(26, 24, 20, 0.94);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--rule);
		padding: var(--space-4) var(--space-6);
		padding-right: 80px; /* leave room for the kebab in the corner */
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	@media (min-width: 768px) {
		.settings-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			padding: var(--space-4) var(--space-12);
			padding-right: 80px;
		}
	}

	.back {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--accent);
	}

	.tabs {
		display: flex;
		gap: var(--space-4);
		overflow-x: auto;
	}

	.tab {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-1) 0;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
		text-decoration: none;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.tab:hover {
		color: var(--accent);
	}

	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.settings-body {
		padding-bottom: var(--space-16);
	}
</style>
