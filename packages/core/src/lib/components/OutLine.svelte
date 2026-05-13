<script lang="ts">
	/**
	 * OutLine — a ruled section divider with optional centred label.
	 *
	 * Used to break a long page into editorial sections (Scenes /
	 * Rooms / Pinned). The label sits inline with the rule so the
	 * page reads like a magazine spread rather than a control panel.
	 */

	let {
		label = null,
		spacing = 'normal' as 'tight' | 'normal' | 'loose'
	}: {
		label?: string | null;
		spacing?: 'tight' | 'normal' | 'loose';
	} = $props();
</script>

<div class="outline" data-spacing={spacing}>
	<span class="rule" aria-hidden="true"></span>
	{#if label}
		<span class="label">{label}</span>
		<span class="rule" aria-hidden="true"></span>
	{/if}
</div>

<style>
	.outline {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.outline[data-spacing='tight'] {
		margin: var(--space-3) 0;
	}
	.outline[data-spacing='normal'] {
		margin: var(--space-6) 0;
	}
	.outline[data-spacing='loose'] {
		margin: var(--space-12) 0;
	}

	.rule {
		flex: 1;
		height: 1px;
		background: var(--rule);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		white-space: nowrap;
	}
</style>
