<script lang="ts">
	/**
	 * SettingsSurface — the editorial shell every native HA-settings
	 * page wears.
	 *
	 * Three-part composition: hero (eyebrow + headline + dek), body
	 * (the page's actual content via the {children} snippet), and an
	 * optional footer for the "Open HA settings →" deep-link affordance.
	 *
	 * Used by /settings/integrations, /settings/devices, /settings/addons,
	 * /settings/logs — every Plan 2 surface composes through this. The
	 * point is to keep settings reading like prose, not a config tree.
	 *
	 * Spec: docs/plans/plan-ha-settings-native-uis.md.
	 */

	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import HaFallbackLink from './HaFallbackLink.svelte';
	import type { Snippet } from 'svelte';

	let {
		section,
		headline,
		dek,
		haPath,
		haLabel,
		children
	}: {
		/** Eyebrow text — e.g. "Settings · Integrations" */
		section: string;
		/** Italic display title, sentence-cased prose */
		headline: string;
		/** Optional subtitle paragraph below the headline */
		dek?: string;
		/** If provided, renders the footer "Open in HA →" affordance */
		haPath?: string;
		/** Label for the HA fallback link (defaults to "Open in HA →") */
		haLabel?: string;
		children: Snippet;
	} = $props();
</script>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow {section} />
		{/snippet}
		{#snippet headline()}
			{headline}
		{/snippet}
		{#snippet dek()}
			{#if dek}{dek}{/if}
		{/snippet}
	</Hero>

	<div class="surface-body">
		{@render children()}
	</div>

	{#if haPath}
		<footer class="surface-footer">
			<HaFallbackLink path={haPath} label={haLabel} />
		</footer>
	{/if}
</PageShell>

<style>
	.surface-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		margin: var(--space-6) 0;
	}

	.surface-footer {
		margin-top: var(--space-8);
		padding-top: var(--space-4);
		border-top: 1px solid var(--rule);
		display: flex;
		justify-content: center;
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		font-size: var(--text-caption);
	}
</style>
