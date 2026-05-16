<script lang="ts">
	/**
	 * /settings/integrations — broadsheet-native view of HA's installed
	 * integrations.
	 *
	 * Reads from config_entries/get on mount + subscribes to
	 * config_entry_updated so the list stays live. Groups by status
	 * (errors / working / disabled). Per-row affordances: reload,
	 * configure (deep-link to HA's config flow), disable/enable,
	 * remove (with double-confirm).
	 *
	 * Add new integration drops out to HA's UI via HaFallbackLink —
	 * the config-flow wizard is HA's own stepper, not something
	 * broadsheet re-implements.
	 *
	 * Rubric: P7-S4.
	 */

	import { onMount } from 'svelte';
	import SettingsSurface from '$lib/components/settings/SettingsSurface.svelte';
	import StatusGrouped, {
		type StatusGroup
	} from '$lib/components/settings/StatusGrouped.svelte';
	import EditorialRow from '$lib/components/settings/EditorialRow.svelte';
	import HaFallbackLink from '$lib/components/settings/HaFallbackLink.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import {
		listConfigEntries,
		reloadEntry,
		disableEntry,
		enableEntry,
		removeEntry,
		subscribeEntries,
		groupEntries,
		type ConfigEntry
	} from '$lib/ha/admin/integrations';

	let entries = $state<ConfigEntry[]>([]);
	let loading = $state(true);
	let pendingRemove = $state<string | null>(null); // entry_id awaiting confirm
	let busyEntry = $state<string | null>(null);

	const grouped = $derived(groupEntries(entries));
	const groups = $derived<StatusGroup<ConfigEntry>[]>([
		{
			label: `Errors (${grouped.errors.length})`,
			items: grouped.errors,
			tone: 'alert',
			emptyText: 'Nothing is broken.'
		},
		{
			label: `Working (${grouped.working.length})`,
			items: grouped.working,
			tone: 'positive',
			emptyText: 'No working integrations yet.'
		},
		{
			label: `Disabled (${grouped.disabled.length})`,
			items: grouped.disabled,
			tone: 'muted',
			emptyText: 'Nothing disabled.'
		}
	]);

	const summary = $derived(composeSummary(grouped));

	function composeSummary(g: ReturnType<typeof groupEntries>): string {
		const total = g.errors.length + g.working.length + g.disabled.length;
		if (total === 0) return 'No integrations installed yet.';
		const parts = [`You have ${total} integration${total === 1 ? '' : 's'}.`];
		if (g.errors.length > 0) {
			parts.push(
				`${g.errors.length} ${g.errors.length === 1 ? 'is' : 'are'} reporting errors.`
			);
		} else if (g.disabled.length > 0 && g.working.length > 0) {
			parts.push(`${g.working.length} working, ${g.disabled.length} disabled.`);
		} else {
			parts.push(g.disabled.length === 0 ? 'All quiet.' : 'All disabled.');
		}
		return parts.join(' ');
	}

	async function refresh() {
		entries = await listConfigEntries();
		loading = false;
	}

	async function onReload(e: ConfigEntry) {
		busyEntry = e.entry_id;
		const r = await reloadEntry(e);
		busyEntry = null;
		showToast(r.success ? `Reloaded ${e.title}` : `Reload failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}

	async function onDisable(e: ConfigEntry) {
		busyEntry = e.entry_id;
		const r = await disableEntry(e);
		busyEntry = null;
		showToast(r.success ? `Disabled ${e.title}` : `Disable failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}

	async function onEnable(e: ConfigEntry) {
		busyEntry = e.entry_id;
		const r = await enableEntry(e);
		busyEntry = null;
		showToast(r.success ? `Enabled ${e.title}` : `Enable failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}

	async function onRemove(e: ConfigEntry) {
		if (pendingRemove !== e.entry_id) {
			pendingRemove = e.entry_id;
			return;
		}
		busyEntry = e.entry_id;
		const r = await removeEntry(e);
		busyEntry = null;
		pendingRemove = null;
		showToast(r.success ? `Removed ${e.title}` : `Remove failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}

	let unsub: (() => void) | null = null;

	onMount(() => {
		void (async () => {
			await refresh();
			unsub = await subscribeEntries(() => void refresh());
		})();
		return () => {
			unsub?.();
		};
	});
</script>

<svelte:head>
	<title>Integrations · Settings · broadsheet</title>
</svelte:head>

<SettingsSurface
	section="Settings · Integrations"
	headline="Your integrations."
	dek="Every integration HA has installed. Tap an integration to see its config flow, restart it if it's misbehaving, or take it offline."
	haPath="/config/integrations"
	haLabel="Add new integration in HA →"
>
	{#if loading}
		<p class="loading">Reading config entries from HA…</p>
	{:else}
		<StatusGrouped {summary} {groups}>
			{#snippet row(item)}
				{@const e = item as ConfigEntry}
				{@const isErr =
					e.state === 'setup_error' ||
					e.state === 'setup_retry' ||
					e.state === 'failed_unload'}
				<EditorialRow
					tone={isErr ? 'alert' : e.disabled_by ? 'muted' : 'default'}
					startExpanded={false}
				>
					{#snippet label()}
						{e.title}
					{/snippet}
					{#snippet status()}
						{e.domain}
						{#if isErr}— {e.state}{/if}
						{#if e.disabled_by}— disabled by {e.disabled_by}{/if}
					{/snippet}
					{#snippet actions()}
						{#if !e.disabled_by}
							<button
								type="button"
								disabled={busyEntry === e.entry_id}
								onclick={() => onReload(e)}
							>
								Reload
							</button>
						{/if}
						<a
							href={`/config/integrations/integration/${e.domain}`}
							target="_top"
							rel="noopener"
						>
							Open in HA
						</a>
						{#if e.disabled_by === 'user'}
							<button
								type="button"
								disabled={busyEntry === e.entry_id}
								onclick={() => onEnable(e)}
							>
								Enable
							</button>
						{:else if !e.disabled_by}
							<button
								type="button"
								disabled={busyEntry === e.entry_id}
								onclick={() => onDisable(e)}
							>
								Disable
							</button>
						{/if}
						<button
							type="button"
							class="destructive"
							disabled={busyEntry === e.entry_id}
							onclick={() => onRemove(e)}
						>
							{pendingRemove === e.entry_id ? 'Confirm remove' : 'Remove'}
						</button>
					{/snippet}
					{#snippet details()}
						<dl class="entry-details">
							<dt>Entry ID</dt>
							<dd><code>{e.entry_id}</code></dd>
							<dt>Source</dt>
							<dd>{e.source}</dd>
							<dt>State</dt>
							<dd>{e.state}</dd>
							{#if e.reason}
								<dt>Last reason</dt>
								<dd>{e.reason}</dd>
							{/if}
						</dl>
					{/snippet}
				</EditorialRow>
			{/snippet}
		</StatusGrouped>
	{/if}
</SettingsSurface>

<style>
	.loading {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		text-align: center;
		padding: var(--space-6);
	}

	.entry-details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}

	.entry-details dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.entry-details dd {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.entry-details code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--fg-muted);
	}
</style>
