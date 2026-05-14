<script lang="ts">
	/**
	 * /settings/plugins — the honesty escape hatch.
	 *
	 * Lists every bundled plugin with its live `PluginStatus` and a
	 * working enable/disable toggle. The toggle writes
	 * `plugins.<id>.enabled` — the single flag the loader gates on —
	 * so flipping it here drives the whole gate: the plugin's pages
	 * appear in / disappear from nav and start / stop resolving on
	 * their routes within the tick.
	 *
	 * Status is the truth-teller: a plugin can be enabled yet
	 * `enabled-inactive` (its checks aren't met) or `load-error` (bad
	 * contract shape) — and the row says exactly why, rather than the
	 * plugin silently doing nothing.
	 */

	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import type { PluginStatus } from '$lib/plugins/types';
	import { curationStore, setPluginEnabled } from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const registry = $derived(pluginLoader.registry);

	const STATUS_LABEL: Record<PluginStatus, string> = {
		active: 'Active',
		'enabled-inactive': 'Enabled · inactive',
		disabled: 'Disabled',
		errored: 'Errored',
		'load-error': 'Load error'
	};

	function isEnabled(pluginId: string): boolean {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		return curationStore.current.plugins[pluginId]?.enabled === true;
	}

	async function toggle(pluginId: string, displayName: string) {
		const next = !isEnabled(pluginId);
		const ok = await setPluginEnabled(pluginId, next);
		if (ok) {
			showToast(`${displayName} ${next ? 'enabled' : 'disabled'}`, 'success');
		} else {
			showToast('Save failed — try again', 'error');
		}
	}
</script>

<svelte:head>
	<title>Plugins · Settings · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · Plugins" />
		{/snippet}
		{#snippet headline()}
			What broadsheet ships with.
		{/snippet}
		{#snippet dek()}
			Plugins ship in the box but stay off until you opt in. Each one says its
			status honestly — enabled, inactive, or why it can't load.
		{/snippet}
	</Hero>

	{#if registry.length === 0}
		<p class="empty">No plugins bundled in this build.</p>
	{/if}

	{#each registry as { plugin, status, statusReason } (plugin.id)}
		{@const enabled = isEnabled(plugin.id)}
		<OutLine label={plugin.displayName} />
		<section class="plugin-card" data-status={status}>
			<div class="plugin-head">
				<div class="plugin-id-row">
					<code class="plugin-id">@broadsheet/{plugin.id}</code>
					<span class="plugin-version">v{plugin.version}</span>
				</div>
				<span class="status-badge" data-status={status}>{STATUS_LABEL[status]}</span>
			</div>

			<p class="plugin-desc">{plugin.description}</p>

			{#if statusReason}
				<p class="status-reason">{statusReason}</p>
			{/if}

			{#if (plugin.pages?.length ?? 0) > 0 || plugin.renderers}
				<dl class="provides">
					{#if (plugin.pages?.length ?? 0) > 0}
						<dt>Pages</dt>
						<dd>
							{#each plugin.pages ?? [] as pg (pg.slug)}
								<code>/{pg.slug}/</code>
							{/each}
						</dd>
					{/if}
					{#if plugin.renderers}
						<dt>Renderers</dt>
						<dd>
							{#each Object.keys(plugin.renderers) as rid (rid)}
								<code>{rid}</code>
							{/each}
						</dd>
					{/if}
				</dl>
			{/if}

			<div class="plugin-actions">
				<button
					type="button"
					class="toggle"
					class:on={enabled}
					role="switch"
					aria-checked={enabled}
					onclick={() => toggle(plugin.id, plugin.displayName)}
				>
					<span class="toggle-track"><span class="toggle-thumb"></span></span>
					<span class="toggle-label">{enabled ? 'Enabled' : 'Disabled'}</span>
				</button>
			</div>
		</section>
	{/each}
</PageShell>

<style>
	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}

	.plugin-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.plugin-card[data-status='active'] {
		border-color: var(--accent);
	}

	.plugin-card[data-status='load-error'],
	.plugin-card[data-status='errored'] {
		border-color: var(--state-alert);
	}

	.plugin-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.plugin-id-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.plugin-id {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--accent);
	}

	.plugin-version {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
	}

	.status-badge {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		border: 1px solid var(--rule);
		color: var(--fg-muted);
		white-space: nowrap;
	}

	.status-badge[data-status='active'] {
		color: var(--state-on);
		border-color: var(--state-on);
	}

	.status-badge[data-status='enabled-inactive'] {
		color: var(--accent);
		border-color: var(--accent);
	}

	.status-badge[data-status='load-error'],
	.status-badge[data-status='errored'] {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	.plugin-desc {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
		line-height: var(--leading-snug);
	}

	.status-reason {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-3);
		border-left: 2px solid var(--rule);
	}

	.plugin-card[data-status='load-error'] .status-reason,
	.plugin-card[data-status='errored'] .status-reason {
		color: var(--state-alert);
		border-left-color: var(--state-alert);
	}

	.provides {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-1) var(--space-4);
		margin: 0;
	}

	.provides dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.provides dd {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.provides code {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.plugin-actions {
		display: flex;
		margin-top: var(--space-1);
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.toggle-track {
		width: 44px;
		height: 24px;
		border-radius: var(--radius-pill);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		display: flex;
		align-items: center;
		padding: 2px;
		transition: background var(--ease-quick), border-color var(--ease-quick);
	}

	.toggle.on .toggle-track {
		background: var(--accent-glow);
		border-color: var(--accent);
	}

	.toggle-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--fg-muted);
		transition: transform var(--ease-quick), background var(--ease-quick);
	}

	.toggle.on .toggle-thumb {
		transform: translateX(20px);
		background: var(--accent);
	}

	.toggle-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.toggle.on .toggle-label {
		color: var(--accent);
	}
</style>
