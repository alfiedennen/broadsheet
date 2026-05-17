<script lang="ts">
	/**
	 * RenderedPage — composes a custom page from its blocks.
	 *
	 * Takes a `CustomPageDef` (or just its `blocks` array if the
	 * caller is already inside a PageShell) and dispatches each block
	 * to its registered renderer via the lazy registry.
	 *
	 * Lazy-load story:
	 *   - The block-renderer thunks come from $lib/blocks/registry,
	 *     which dynamic-imports the renderer modules. Each block type
	 *     gets ONE chunk shared across every page that uses it.
	 *   - We resolve the renderer per block at component init via
	 *     $effect (runs after props settle), then render each block
	 *     once its renderer has resolved. A "loading" placeholder
	 *     shows briefly on cold loads — usually invisible.
	 *
	 * Errors:
	 *   - Unknown `type` discriminator → renders a small error chip
	 *     (registry returns null), surfaces in /settings/pages.
	 *     Same shape as plugin-load errors so the UI is consistent.
	 *   - Renderer throws on mount → Svelte error boundary catches it;
	 *     the rest of the page still renders.
	 */
	import { onMount, setContext } from 'svelte';
	import { blockRenderer } from './registry';
	import type { BlockDef, CustomPageDef } from './types';
	import type { Component } from 'svelte';
	import { curationStore } from '$lib/curation/store.svelte';
	import { discovery } from '$lib/discovery';
	import {
		PLUGIN_BLOCK_HOST_CONTEXT_KEY,
		type PluginBlockHostContext
	} from '$lib/plugins/types';

	/*
	 * 0.9.3 — plugin-block host context.
	 *
	 * Plugin-contributed block renderers can't runtime-import core
	 * (the plugin contract forbids it). They get curation + discovery
	 * via Svelte context — core publishes here, plugin reads via
	 * `getContext(PLUGIN_BLOCK_HOST_CONTEXT_KEY)`.
	 *
	 * The host object is GETTER-shaped: every access re-reads the
	 * underlying $state, so the plugin block re-renders when curation
	 * or discovery updates.
	 */
	const hostContext: PluginBlockHostContext = {
		get curation() {
			return curationStore.current as unknown as Record<string, unknown>;
		},
		get discovery() {
			return {
				floors: discovery.floors,
				areas: discovery.areas,
				persons: discovery.persons
			};
		}
	};
	setContext(PLUGIN_BLOCK_HOST_CONTEXT_KEY, hostContext);

	let {
		blocks,
		page
	}: {
		/** Array of blocks to render. Mutually exclusive with `page`. */
		blocks?: BlockDef[];
		/** Full page def — convenience shortcut for `blocks={page.blocks}`. */
		page?: CustomPageDef;
	} = $props();

	const blockArr = $derived(blocks ?? page?.blocks ?? []);

	// Resolve renderer components for every block type used on this
	// page. Cache by type so repeated use of the same block type only
	// loads the chunk once. Cleared by Svelte when the component
	// unmounts.
	let resolved = $state<Record<string, Component<{ config: never }> | null>>({});

	async function resolveRendererFor(type: string) {
		if (resolved[type] !== undefined) return;
		try {
			const mod = await blockRenderer(type as BlockDef['type'])();
			resolved = { ...resolved, [type]: mod.default };
		} catch (err) {
			console.error(`block renderer load failed for "${type}":`, err);
			resolved = { ...resolved, [type]: null };
		}
	}

	onMount(() => {
		for (const b of blockArr) resolveRendererFor(b.type);
	});

	// Reactive: when a custom page edits add new block types after
	// initial mount, kick off a fresh resolve for the new types.
	$effect(() => {
		for (const b of blockArr) {
			if (resolved[b.type] === undefined) resolveRendererFor(b.type);
		}
	});
</script>

{#each blockArr as block, i (i)}
	{#if resolved[block.type] === undefined}
		<!-- Renderer chunk still loading — keep layout reservation -->
		<div class="block-loading" aria-hidden="true"></div>
	{:else if resolved[block.type] === null}
		<div class="block-error">
			<strong>Unknown block type:</strong>
			<code>{block.type}</code>
		</div>
	{:else}
		{@const Renderer = resolved[block.type] as Component<{ config: BlockDef['config'] }>}
		<Renderer config={block.config} />
	{/if}
{/each}

<style>
	.block-loading {
		min-height: 80px;
	}

	.block-error {
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--state-alert);
		border-radius: var(--radius-card);
		color: var(--state-alert);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		margin-bottom: var(--space-4);
	}

	.block-error code {
		color: var(--fg);
	}
</style>
