<script lang="ts">
	/**
	 * 0.9.4 — BlockSlot: render a single block, with optional layout
	 * styling for inclusion in a `row` or `grid` parent.
	 *
	 * RenderedPage uses one BlockSlot per top-level block; Row and
	 * Grid renderers use one BlockSlot per child. Centralises the
	 * "look up the renderer in the registry, lazy-import it, render
	 * with { config }" dance + the layout-wrapper styling.
	 *
	 * Wrapper styling:
	 *  - When inside a grid (gridColumns is set), wraps in a div
	 *    with `grid-column: span N` where N = clamp(block.colSpan ?? 1, 1, gridColumns)
	 *  - When inside a row (flexGrow is set), wraps with that flex-grow weight
	 *  - At the top level (neither set), renders the renderer directly
	 *
	 * Unknown block types render a "missing renderer" placeholder
	 * (same shape as the page-level error chip in RenderedPage). A
	 * plugin disabled after a page was authored doesn't crash the
	 * page — its blocks just show as known-missing.
	 */
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { blockRenderer } from './registry';
	import type { BlockDef } from './types';

	interface Props {
		block: BlockDef;
		/** When set, wrap with `grid-column: span <colSpan clamped to gridColumns>`. */
		gridColumns?: number;
		/** When set, wrap with `flex: <flexGrow>`. Default for row children is 1. */
		flexGrow?: number;
	}

	let { block, gridColumns, flexGrow }: Props = $props();

	// Per-instance resolved-renderer state. Vite's module cache
	// means the same type is only fetched once across the page even
	// when multiple BlockSlots resolve it independently.
	let resolved = $state<Component<{ config: BlockDef['config'] }> | null | undefined>(undefined);

	async function resolve() {
		try {
			const mod = await blockRenderer(block.type)();
			resolved = mod.default as Component<{ config: BlockDef['config'] }>;
		} catch (err) {
			console.error(`block renderer load failed for "${block.type}":`, err);
			resolved = null;
		}
	}

	onMount(resolve);

	// If the parent re-renders us with a DIFFERENT block type
	// (rare — blocks usually stay the same type for their lifetime,
	// but the editor's reorder can move a different type into our
	// slot), kick off a fresh resolve. The svelte-ignore acknowledges
	// the one-shot-init pattern — we intentionally capture the
	// initial block.type here and update it via the effect below.

	// svelte-ignore state_referenced_locally
	let lastType = $state(block.type);
	$effect(() => {
		if (block.type !== lastType) {
			lastType = block.type;
			resolved = undefined;
			resolve();
		}
	});

	const span = $derived.by(() => {
		if (!gridColumns) return undefined;
		const want = block.colSpan ?? 1;
		return Math.max(1, Math.min(want, gridColumns));
	});

	const wrapperStyle = $derived.by(() => {
		if (span) return `grid-column: span ${span};`;
		if (flexGrow !== undefined) return `flex: ${flexGrow} 1 0;`;
		return '';
	});

	const wrapped = $derived(span !== undefined || flexGrow !== undefined);
</script>

{#if resolved === undefined}
	{#if wrapped}
		<div class="slot-loading" style={wrapperStyle} aria-hidden="true"></div>
	{:else}
		<div class="slot-loading" aria-hidden="true"></div>
	{/if}
{:else if resolved === null}
	{#if wrapped}
		<div class="slot-error" style={wrapperStyle}>
			<strong>Unknown block type:</strong>
			<code>{block.type}</code>
		</div>
	{:else}
		<div class="slot-error">
			<strong>Unknown block type:</strong>
			<code>{block.type}</code>
		</div>
	{/if}
{:else if wrapped}
	{@const Renderer = resolved}
	<div class="slot-wrap" style={wrapperStyle}>
		<Renderer config={block.config} />
	</div>
{:else}
	{@const Renderer = resolved}
	<Renderer config={block.config} />
{/if}

<style>
	.slot-loading {
		min-height: 80px;
	}
	.slot-error {
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--state-alert);
		border-radius: var(--radius-card);
		color: var(--state-alert);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
	}
	.slot-error code {
		color: var(--fg);
	}
	.slot-wrap {
		min-width: 0; /* Lets the child shrink inside flex / grid cells */
	}
</style>
