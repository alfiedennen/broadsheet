<script lang="ts">
	/**
	 * 0.9.4.1 — Tabs block: chip-bar at the top + active tab's
	 * content below.
	 *
	 * URL-bound active tab via `?<paramName>=<tabId>` (default
	 * paramName is `tab`). Refresh stays on the right tab,
	 * deep-links work, the browser's back button swaps tabs the way
	 * a user would expect. Important for cast displays + kiosk
	 * tablets that reload periodically — losing the active tab
	 * on every reload would be infuriating.
	 *
	 * Renders BlockSlot for every block in the active tab, so
	 * tabbed pages can contain any other block type (including
	 * nested rows / grids / things / plugin blocks). The
	 * plugin-block host context propagates via setContext on the
	 * top-level RenderedPage so descendants here receive it
	 * automatically.
	 *
	 * Spec: docs/plans/plan-9.4.1-tabs-and-multiview.md.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BlockSlot from '../BlockSlot.svelte';
	import type { TabsBlockConfig } from '../types';

	let { config }: { config: TabsBlockConfig } = $props();

	const paramName = $derived(config.paramName ?? 'tab');

	/**
	 * Active tab id — derived from the URL's query param. Falls back
	 * to the first tab when the param is missing or doesn't match a
	 * known tab id. This way deep-links to deleted tabs degrade
	 * gracefully (you see tab 0, not a broken empty content area).
	 */
	const activeTabId = $derived.by(() => {
		const fromUrl = page.url.searchParams.get(paramName);
		if (fromUrl && config.tabs.some((t) => t.id === fromUrl)) return fromUrl;
		return config.tabs[0]?.id ?? '';
	});

	const activeTab = $derived(config.tabs.find((t) => t.id === activeTabId) ?? config.tabs[0]);

	/**
	 * Switch tab — pushes the new ?tab= value via SvelteKit's goto.
	 * `replaceState: false` (default) means each tab switch pushes
	 * a new history entry, so browser-back swaps tabs as expected.
	 * `keepFocus: true` keeps the chip-bar focused for keyboard nav.
	 */
	async function switchTo(tabId: string) {
		if (tabId === activeTabId) return;
		const next = new URL(page.url);
		next.searchParams.set(paramName, tabId);
		await goto(next.pathname + next.search, {
			keepFocus: true,
			noScroll: true
		});
	}

	function chipIconChip(icon: string | null | undefined): string {
		if (!icon) return '';
		return icon.replace(/^mdi:/, '').slice(0, 3);
	}
</script>

{#if config.tabs.length > 0}
	<section class="tabs-block">
		<nav class="chip-bar" aria-label="Tab navigation">
			{#each config.tabs as tab (tab.id)}
				{@const active = tab.id === activeTabId}
				<button
					class="chip"
					class:active
					type="button"
					aria-pressed={active}
					onclick={() => switchTo(tab.id)}
				>
					{#if tab.icon}
						<span class="chip-icon" aria-hidden="true">{chipIconChip(tab.icon)}</span>
					{/if}
					<span class="chip-label">{tab.label}</span>
				</button>
			{/each}
		</nav>

		<div class="tab-content">
			{#if activeTab}
				{#each activeTab.blocks as block, i (i)}
					<BlockSlot {block} />
				{/each}
			{/if}
		</div>
	</section>
{/if}

<style>
	.tabs-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.chip-bar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--rule, var(--border, #2a261e));
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.4rem 0.85rem;
		background: var(--bg-card, var(--bg));
		color: var(--fg);
		border: 1px solid var(--rule, var(--border, #2a261e));
		border-radius: 999px;
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.82rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		cursor: pointer;
		transition: border-color 0.12s ease, color 0.12s ease;
		min-height: 36px;
	}
	.chip:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.chip.active {
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
		border-color: var(--accent);
		color: var(--accent);
	}

	.chip-icon {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		opacity: 0.7;
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
