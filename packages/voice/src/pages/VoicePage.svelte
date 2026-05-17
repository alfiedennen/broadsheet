<script lang="ts">
	/**
	 * /voice — now a redirect to /settings/plugins/voice/config.
	 *
	 * 0.8.1 — the pipeline-walkthrough content this used to host has
	 * migrated to the unified Voice + Harold configurator at
	 * /settings/plugins/voice/config (per user feedback after the
	 * 0.8.0 walk: "voice needs to be a settings page, so that /voice
	 * and harold-preset can be aided with this sense making").
	 *
	 * The /voice URL still resolves (so bookmarks + hash-deeplinks
	 * don't 404), but the page itself is just a friendly redirect.
	 * The voice plugin's `pages` entry uses hiddenFromNav: true so
	 * /voice doesn't appear in the kebab anymore.
	 */

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { PageShell, Hero, Eyebrow } from '@broadsheet/core';

	const TARGET = '/settings/plugins/voice/config/';

	onMount(() => {
		// Defer the redirect by a tick so the user sees the brief
		// "moving to settings" frame rather than a flash of unstyled
		// content. Replace, not push, so the back button doesn't loop.
		setTimeout(() => {
			void goto(`${base}${TARGET}`, { replaceState: true });
		}, 50);
	});
</script>

<svelte:head>
	<title>Voice — moved · broadsheet</title>
	<meta http-equiv="refresh" content={`0; url=${base}${TARGET}`} />
</svelte:head>

<PageShell width="narrow">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Voice" />
		{/snippet}
		{#snippet headline()}
			Moving you to settings…
		{/snippet}
		{#snippet dek()}
			<em>/voice</em> is now part of the unified Voice + Harold configurator at
			<a href="{base}{TARGET}">{TARGET}</a>. If your browser doesn't follow
			automatically, tap the link.
		{/snippet}
	</Hero>
</PageShell>
