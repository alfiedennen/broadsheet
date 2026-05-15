<script lang="ts">
	/**
	 * HeroBlockRenderer — wraps the existing core Hero in the
	 * block-renderer interface. Same component, same register; just a
	 * thin adapter that maps a HeroBlockConfig onto Hero's snippets.
	 *
	 * Why a separate renderer file rather than just re-exporting Hero:
	 * the BlockDef contract sends `{ config }` props; Hero takes
	 * `eyebrow / headline / dek` as snippets. The adapter exists to
	 * reconcile those two shapes without changing Hero (which other
	 * pages use directly). Same pattern for every primitive block —
	 * adapter renderer in lib/blocks/renderers/, original component
	 * stays in lib/components/.
	 */
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import type { HeroBlockConfig } from '../types';

	let { config }: { config: HeroBlockConfig } = $props();

	const size = $derived(config.size ?? 'md');
</script>

<!--
	Snippets are passed as props to Hero. Compose them conditionally
	in the script and pass via prop spread to keep this template
	tight + avoid the Svelte-5 "children prop" warning that appears
	when you mix {#snippet} with conditional whitespace inside a
	component tag.
-->
{#snippet eyebrowSnippet()}
	<Eyebrow section={config.eyebrow ?? ''} number={config.number ?? undefined} />
{/snippet}
{#snippet headlineSnippet()}{config.headline}{/snippet}
{#snippet dekSnippet()}{config.dek}{/snippet}

<Hero
	{size}
	eyebrow={config.eyebrow ? eyebrowSnippet : undefined}
	headline={headlineSnippet}
	dek={config.dek ? dekSnippet : undefined}
/>
