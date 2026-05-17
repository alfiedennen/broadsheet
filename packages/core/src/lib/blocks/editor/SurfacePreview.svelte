<script lang="ts">
	/**
	 * 0.9.1 — surface-aware preview pane for the things-first editor.
	 *
	 * When the page has a wall surface (customPage.surface set via the
	 * meta picker), the preview renders at the target device's native
	 * CSS dimensions and is scaled to fit the editor pane. The user
	 * sees what the wall will actually show — not a phone-sized
	 * representation that's misleading on a 1280×800 Fire HD.
	 *
	 * When no surface is set, the pane just renders the natural
	 * RenderedPage flow at the editor's available width (same as
	 * the legacy preview).
	 *
	 * Implementation: clientWidth-bound wrap → derived scale from
	 * (available width ÷ target width). The inner frame is sized at
	 * target dimensions then CSS-transformed. The outer wrap holds
	 * the post-scale dimensions so layout doesn't overflow.
	 *
	 * Spec: docs/plans/plan-9.1-wall-builder-things-first.md.
	 */

	import RenderedPage from '$lib/blocks/RenderedPage.svelte';
	import type { BlockDef } from '$lib/blocks/types';

	interface Props {
		blocks: BlockDef[];
		/** Target wall surface dimensions; when undefined → natural flow. */
		surface?: { width: number; height: number; label?: string };
	}

	let { blocks, surface }: Props = $props();

	let containerWidth = $state(0);

	/**
	 * Fit-to-pane scale: never larger than 1 (we don't blow tiny
	 * dimensions up — keeps text legible). Falls back to 1 when no
	 * surface or before the container has measured.
	 */
	const scale = $derived.by(() => {
		if (!surface || containerWidth === 0) return 1;
		const s = containerWidth / surface.width;
		return Math.min(1, s);
	});

	const scaledHeight = $derived(surface ? surface.height * scale : 0);
	const scaledWidth = $derived(surface ? surface.width * scale : containerWidth);
</script>

<div class="surface-preview">
	<header class="preview-head">
		<span class="preview-label">Preview</span>
		{#if surface}
			<span class="preview-surface" title="Target wall surface">
				{surface.label ?? 'Custom'} · {surface.width}×{surface.height}
				{#if scale < 1}
					<span class="preview-scale">@ {Math.round(scale * 100)}%</span>
				{/if}
			</span>
		{/if}
	</header>

	<div class="preview-container" bind:clientWidth={containerWidth}>
		{#if surface}
			<div
				class="surface-wrap"
				style="width: {scaledWidth}px; height: {scaledHeight}px;"
			>
				<div
					class="surface-frame"
					style="width: {surface.width}px; height: {surface.height}px;
					       transform: scale({scale}); transform-origin: top left;"
				>
					<RenderedPage {blocks} />
				</div>
			</div>
		{:else}
			<div class="natural-frame">
				<RenderedPage {blocks} />
			</div>
		{/if}
	</div>
</div>

<style>
	.surface-preview {
		display: flex;
		flex-direction: column;
		min-height: 0;
		font-family: var(--font-body);
	}

	.preview-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border, #2a261e);
		border-bottom: none;
		border-radius: 4px 4px 0 0;
	}
	.preview-label {
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-muted);
	}
	.preview-surface {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--accent);
		font-feature-settings: 'tnum';
	}
	.preview-scale {
		color: var(--fg-muted);
		margin-left: 0.4rem;
	}

	.preview-container {
		border: 1px solid var(--border, #2a261e);
		border-radius: 0 0 4px 4px;
		background: var(--bg-elevated, var(--bg));
		padding: 1rem;
		overflow: auto;
	}

	.surface-wrap {
		position: relative;
		margin: 0 auto;
		overflow: hidden;
		border: 1px dashed var(--border, #2a261e);
		background: var(--bg);
	}
	.surface-frame {
		position: absolute;
		top: 0;
		left: 0;
		overflow: hidden;
		background: var(--bg);
	}

	/* .natural-frame intentionally has no styling — when no surface
	   is set, the preview just lets RenderedPage fill the container
	   width as the legacy preview did. */
</style>
