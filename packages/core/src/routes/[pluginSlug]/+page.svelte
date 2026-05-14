<script lang="ts">
	/**
	 * [pluginSlug] — the plugin page catch-all.
	 *
	 * SvelteKit route specificity guarantees the static core routes
	 * (/lights, /door, /settings, …) always win over this dynamic
	 * segment, so this only ever resolves slugs the core doesn't own.
	 *
	 * It looks the slug up in `pluginLoader.activePluginPages` — the
	 * list of pages that are both routable AND nav-visible. A miss
	 * (disabled plugin, failed visibleWhen, or just unknown) is the
	 * honest 404. A hit renders the plugin's lazy component inside an
	 * error boundary, so a plugin crash degrades to a chip rather
	 * than taking down the SPA.
	 */
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';

	const slug = $derived(page.params.pluginSlug ?? '');
	const activePage = $derived(pluginLoader.pageBySlug(slug));

	// The lazy-component thunk, pulled into its own $derived.
	//
	// `activePage` is rebuilt on EVERY discovery tick — the loader's
	// derived chain (#snapshot → activePluginPages → pageBySlug)
	// produces fresh wrapper objects whenever HA pushes a state delta,
	// which is constantly. But `.component` is a stable function
	// reference from the plugin's module-level page definition, so
	// this $derived dedupes on === and stays stable across ticks.
	//
	// Awaiting `activePage.component()` directly would hand {#await} a
	// brand-new promise every tick — it would restart the import
	// forever and never settle ("Loading…" with no error). Awaiting
	// the stable thunk's call settles once.
	const componentThunk = $derived(activePage?.component ?? null);
</script>

<svelte:head>
	<title>{activePage ? `${activePage.label} · broadsheet` : 'Not found · broadsheet'}</title>
</svelte:head>

{#if activePage && componentThunk}
	{#key activePage.slug}
		<svelte:boundary>
			{#await componentThunk()}
				<div class="plugin-loading">Loading {activePage.label}…</div>
			{:then mod}
				{@const PluginPage = mod.default}
				<PluginPage />
			{/await}

			{#snippet failed(error, reset)}
				<div class="plugin-error" role="alert">
					<p class="plugin-error-title">{activePage.label} failed to render.</p>
					<p class="plugin-error-detail">
						{error instanceof Error ? error.message : String(error)}
					</p>
					<div class="plugin-error-actions">
						<button type="button" onclick={reset}>Retry</button>
						<a href="{base}/settings/">Settings</a>
					</div>
				</div>
			{/snippet}
		</svelte:boundary>
	{/key}
{:else}
	<!--
		Slug isn't an active plugin page: a disabled plugin, a plugin
		whose visibleWhen doesn't pass, or just an unknown path.
	-->
	<PageShell width="default">
		<Hero size="md">
			{#snippet eyebrow()}
				<Eyebrow section="Not found" />
			{/snippet}
			{#snippet headline()}
				No page here.
			{/snippet}
			{#snippet dek()}
				<code>/{slug}/</code> isn't a page broadsheet knows. If it's a plugin page, the plugin
				may be disabled or its activation checks aren't met yet — Settings → Plugins shows the
				status of every installed plugin.
			{/snippet}
		</Hero>
	</PageShell>
{/if}

<style>
	.plugin-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
	}

	.plugin-error {
		margin: var(--space-12) auto;
		max-width: 48ch;
		padding: var(--space-6);
		border: 1px solid var(--state-alert);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.plugin-error-title {
		margin: 0 0 var(--space-2);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--state-alert);
	}

	.plugin-error-detail {
		margin: 0 0 var(--space-4);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		word-break: break-word;
	}

	.plugin-error-actions {
		display: flex;
		gap: var(--space-4);
		align-items: center;
	}

	.plugin-error-actions button,
	.plugin-error-actions a {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		text-decoration: none;
	}

	.plugin-error-actions button:hover,
	.plugin-error-actions a:hover {
		text-decoration: underline;
	}
</style>
