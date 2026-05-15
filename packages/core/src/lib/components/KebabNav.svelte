<script lang="ts">
	/**
	 * KebabNav — top-right kebab (⋮) opens a sheet with the page list.
	 *
	 * Pages come from PAGES + NAV_ORDER in $lib/discovery/page-map.
	 * Plus active plugin pages (from the plugin loader), then the
	 * fixed entries: Settings, Forget token.
	 *
	 * Pattern from harold-home: minimal chrome on every page; only
	 * affordance to navigate is the kebab. Keeps the editorial
	 * register clean — no sidebar, no top tabs eating screen.
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { PAGES, NAV_ORDER, type PageSlug } from '$lib/discovery';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import { curationStore } from '$lib/curation/store.svelte';

	let open = $state(false);

	function close() {
		open = false;
	}

	function toggle() {
		open = !open;
	}

	onMount(() => {
		const handle = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('keydown', handle);
		return () => window.removeEventListener('keydown', handle);
	});

	const currentPath = $derived(page.url.pathname);

	// All hrefs are prefixed with SvelteKit's `base`. Under HA Ingress
	// the app is served from /api/hassio_ingress/<token>/, so a
	// root-absolute href like "/lights/" would point outside `base` —
	// SvelteKit wouldn't intercept the click, the browser would do a
	// full-page nav to origin-root /lights/, and HA would 404 it.
	// `base` is "" in dev/standalone, so this stays correct there too.
	const items = $derived([
		...NAV_ORDER.map((slug: PageSlug) => ({
			href: `${base}/${slug}/`,
			label: PAGES[slug].label,
			active: currentPath === `${base}/${slug}/`
		})),
		{ href: `${base}/wall/`, label: 'Wall', active: currentPath === `${base}/wall/` },
		// Active plugin pages slot in after the core domain pages,
		// before Settings. The loader returns ROUTABLE pages (visibility
		// gate already passed); we additionally drop `hiddenFromNav` —
		// those routes stay live for permalinks but don't earn a nav
		// entry (e.g. /emanations after the moment view absorbed it).
		...pluginLoader.activePluginPages
			.filter((p) => !p.hiddenFromNav)
			.map((p) => ({
				href: `${base}/${p.slug}/`,
				label: p.label,
				active: currentPath === `${base}/${p.slug}/`
			})),
		// Custom pages from curation (Phase 2 builder + Phase 3
		// Lovelace importer write here). Same `hiddenFromNav` opt-out
		// as plugin pages — keeps the route live for permalinks while
		// removing the nav clutter for staging or one-off pages.
		// navOrder lets authors slot a page anywhere in the kebab list;
		// undefined = sort to end.
		...(curationStore.current.customPages ?? [])
			.filter((p) => !p.hiddenFromNav)
			.slice()
			.sort((a, b) => (a.navOrder ?? Infinity) - (b.navOrder ?? Infinity))
			.map((p) => ({
				href: `${base}/${p.slug}/`,
				label: p.label,
				active: currentPath === `${base}/${p.slug}/`
			})),
		{
			href: `${base}/settings/`,
			label: 'Settings',
			active: currentPath.startsWith(`${base}/settings`)
		},
		{
			href: `${base}/setup/`,
			label: 'Forget token',
			active: false,
			kind: 'destructive' as const
		}
	]);
</script>

<button
	class="kebab"
	type="button"
	aria-label="Open navigation"
	aria-expanded={open}
	onclick={toggle}
>
	<span class="dots" aria-hidden="true">⋮</span>
</button>

{#if open}
	<div
		class="scrim"
		role="presentation"
		onclick={close}
		onkeydown={(e) => e.key === 'Escape' && close()}
	></div>

	<nav class="sheet" aria-label="Site navigation">
		<header class="sheet-header">
			<span class="sheet-title">broadsheet</span>
			<button class="sheet-close" type="button" aria-label="Close" onclick={close}>×</button>
		</header>

		<ul class="sheet-list">
			<li>
				<a href="{base}/" class:active={currentPath === `${base}/`} onclick={close}>
					<span class="num">№ 01</span>
					<span class="lbl">The moment</span>
				</a>
			</li>
			{#each items as item, i (item.href)}
				<li>
					<a
						href={item.href}
						class:active={item.active}
						class:destructive={'kind' in item && item.kind === 'destructive'}
						onclick={close}
					>
						<span class="num">№ {String(i + 2).padStart(2, '0')}</span>
						<span class="lbl">{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	.kebab {
		position: fixed;
		top: var(--space-4);
		right: var(--space-4);
		z-index: 100;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-pill);
		display: grid;
		place-items: center;
		color: var(--accent);
		background: rgba(26, 24, 20, 0.7);
		backdrop-filter: blur(8px);
		border: 1px solid var(--rule);
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.kebab:hover {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.dots {
		font-size: 1.4rem;
		line-height: 1;
		font-weight: 700;
	}

	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(4px);
		z-index: 200;
		animation: fadeIn var(--ease-normal);
	}

	.sheet {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(92vw, 380px);
		background: var(--bg);
		border-left: 1px solid var(--rule);
		z-index: 201;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		animation: slideIn var(--ease-normal);
	}

	.sheet-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.sheet-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		color: var(--accent);
	}

	.sheet-close {
		font-family: var(--font-mono);
		font-size: 1.6rem;
		color: var(--fg-muted);
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
	}

	.sheet-close:hover {
		color: var(--fg);
	}

	.sheet-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		flex: 1;
		overflow-y: auto;
	}

	.sheet-list a {
		display: grid;
		grid-template-columns: 4rem 1fr;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-3) var(--space-2);
		color: var(--fg);
		border-bottom: 1px solid var(--rule);
		transition: color var(--ease-quick);
		text-decoration: none;
	}

	.sheet-list a:hover {
		color: var(--accent);
	}

	.sheet-list a.active {
		color: var(--accent);
	}

	.sheet-list a.active .num,
	.sheet-list a.active .lbl {
		font-style: italic;
	}

	.sheet-list a.destructive {
		color: var(--state-alert);
	}

	.sheet-list .num {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
	}

	.sheet-list .lbl {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.5rem;
		line-height: 1.2;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}
</style>
