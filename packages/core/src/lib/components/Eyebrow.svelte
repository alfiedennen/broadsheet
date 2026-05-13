<script lang="ts">
	/**
	 * Eyebrow — the small mono caps line that sits above headlines.
	 *
	 *   № 03 · LIGHTS
	 *
	 * Pattern from harold-home: each page has a section number + name.
	 * Numbers are deliberately editorial — they imply the rest of an
	 * implicit publication, even if you only see one section at a time.
	 */

	let {
		section,
		number = null,
		ornament = '·'
	}: {
		section: string;
		number?: number | string | null;
		ornament?: string;
	} = $props();

	const formatted = $derived(typeof number === 'number' ? `№ ${String(number).padStart(2, '0')}` : number);
</script>

<p class="eyebrow" data-role="eyebrow">
	{#if formatted}
		<span class="num">{formatted}</span>
		<span class="ornament" aria-hidden="true">{ornament}</span>
	{/if}
	<span class="section">{section}</span>
</p>

<style>
	.eyebrow {
		display: flex;
		align-items: baseline;
		gap: 0.6em;
		margin: 0;
	}

	.num {
		color: var(--accent);
	}

	.ornament {
		color: var(--fg-dim);
	}

	.section {
		color: var(--accent);
	}
</style>
