<script lang="ts">
	/**
	 * /settings/plugins/[pluginId]/config — a plugin's settings panel.
	 *
	 * Resolves the plugin from the reactive loader, and if it's
	 * enabled-and-loaded with a `settingsPanel`, renders that panel's
	 * lazy component inside an error boundary. Otherwise it says,
	 * honestly, why there's nothing to configure.
	 *
	 * Same stable-thunk discipline as the [pluginSlug] route: the
	 * loader rebuilds its derived objects every discovery tick, but
	 * `settingsPanel.component` is a stable module-level function ref,
	 * so pulling it into its own $derived lets Svelte's === dedup keep
	 * it stable — otherwise {#await} would restart the import forever.
	 */
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';

	const pluginId = $derived(page.params.pluginId ?? '');
	const registered = $derived(
		pluginLoader.registry.find((r) => r.plugin.id === pluginId) ?? null
	);
	const plugin = $derived(registered?.plugin ?? null);
	const status = $derived(registered?.status ?? null);

	// Stable thunk — see the header note.
	const panelThunk = $derived(plugin?.settingsPanel?.component ?? null);
	// A panel is reachable only when the plugin is enabled + loaded.
	const reachable = $derived(
		!!panelThunk && status !== null && status !== 'disabled' && status !== 'load-error'
	);
</script>

<svelte:head>
	<title>
		{plugin ? `${plugin.displayName} config` : 'Plugin config'} · Settings · broadsheet
	</title>
</svelte:head>

{#if reachable && panelThunk && plugin}
	<PageShell width="default">
		<Hero size="md">
			{#snippet eyebrow()}
				<Eyebrow section="Settings · Plugins" />
			{/snippet}
			{#snippet headline()}
				{plugin.settingsPanel?.label ?? plugin.displayName}
			{/snippet}
			{#snippet dek()}
				Configuration for <code>@broadsheet/{plugin.id}</code>. Changes save immediately.
			{/snippet}
		</Hero>

		{#key plugin.id}
			<svelte:boundary>
				{#await panelThunk()}
					<div class="panel-loading">Loading panel…</div>
				{:then mod}
					{@const Panel = mod.default}
					<Panel />
				{/await}

				{#snippet failed(error, reset)}
					<div class="panel-error" role="alert">
						<p class="panel-error-title">{plugin.displayName} settings panel failed.</p>
						<p class="panel-error-detail">
							{error instanceof Error ? error.message : String(error)}
						</p>
						<button type="button" onclick={reset}>Retry</button>
					</div>
				{/snippet}
			</svelte:boundary>
		{/key}
	</PageShell>
{:else}
	<PageShell width="default">
		<Hero size="md">
			{#snippet eyebrow()}
				<Eyebrow section="Settings · Plugins" />
			{/snippet}
			{#snippet headline()}
				Nothing to configure.
			{/snippet}
			{#snippet dek()}
				{#if !plugin}
					<code>{pluginId}</code> isn't a plugin broadsheet knows.
				{:else if status === 'disabled'}
					<strong>{plugin.displayName}</strong> is disabled — enable it first.
				{:else if status === 'load-error'}
					<strong>{plugin.displayName}</strong> failed to load, so its panel is unreachable.
				{:else}
					<strong>{plugin.displayName}</strong> doesn't expose a settings panel.
				{/if}
			{/snippet}
		</Hero>
		<p class="back-link"><a href="{base}/settings/plugins/">← All plugins</a></p>
	</PageShell>
{/if}

<style>
	.panel-loading {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
		padding: var(--space-6) 0;
	}

	.panel-error {
		padding: var(--space-6);
		border: 1px solid var(--state-alert);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.panel-error-title {
		margin: 0 0 var(--space-2);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.3rem;
		color: var(--state-alert);
	}

	.panel-error-detail {
		margin: 0 0 var(--space-4);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		word-break: break-word;
	}

	.panel-error button {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
	}

	.back-link a {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		text-decoration: none;
	}

	.back-link a:hover {
		text-decoration: underline;
	}
</style>
