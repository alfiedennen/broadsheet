<script lang="ts">
	/**
	 * /settings/addons — broadsheet-native view of installed HA add-ons.
	 *
	 * Reads via supervisor/api WS passthrough → /addons. Renders the
	 * routine actions: start, stop, restart, update. Uninstall stays
	 * a friction-gate deep-link into HA's UI (destructive,
	 * irreversible — per design decision Q4 of the v0.1 review).
	 *
	 * Falls back to a friendly empty state on HA Core / Container
	 * installs (no supervisor → empty addons list).
	 *
	 * Rubric: P7-S3 (addon variant).
	 */

	import { onMount } from 'svelte';
	import SettingsSurface from '$lib/components/settings/SettingsSurface.svelte';
	import StatusGrouped, {
		type StatusGroup
	} from '$lib/components/settings/StatusGrouped.svelte';
	import EditorialRow from '$lib/components/settings/EditorialRow.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import {
		listAddons,
		startAddon,
		stopAddon,
		restartAddon,
		updateAddon,
		groupAddons,
		type AddonInfo
	} from '$lib/ha/admin/addons';

	let addons = $state<AddonInfo[]>([]);
	let loading = $state(true);
	let busySlug = $state<string | null>(null);

	const grouped = $derived(groupAddons(addons));
	const groups = $derived<StatusGroup<AddonInfo>[]>([
		{
			label: `Errors (${grouped.errors.length})`,
			items: grouped.errors,
			tone: 'alert',
			emptyText: 'No errors.'
		},
		{
			label: `Updates available (${grouped.updates.length})`,
			items: grouped.updates,
			tone: 'positive',
			emptyText: 'Everything up to date.'
		},
		{
			label: `Running (${grouped.running.length})`,
			items: grouped.running,
			tone: 'default',
			emptyText: 'No add-ons running right now.'
		},
		{
			label: `Stopped (${grouped.stopped.length})`,
			items: grouped.stopped,
			tone: 'muted',
			emptyText: 'No stopped add-ons.'
		}
	]);

	const summary = $derived.by(() => {
		if (addons.length === 0) return 'No add-ons installed (or HA isn\'t running on Supervisor).';
		const parts = [`${addons.length} ${addons.length === 1 ? 'add-on' : 'add-ons'}.`];
		if (grouped.errors.length > 0) parts.push(`${grouped.errors.length} in error.`);
		if (grouped.updates.length > 0)
			parts.push(`${grouped.updates.length} ${grouped.updates.length === 1 ? 'has' : 'have'} updates available.`);
		if (grouped.errors.length === 0 && grouped.updates.length === 0)
			parts.push('Everything is fine.');
		return parts.join(' ');
	});

	async function refresh() {
		addons = await listAddons();
		loading = false;
	}

	async function onStart(a: AddonInfo) {
		busySlug = a.slug;
		const r = await startAddon(a.slug);
		busySlug = null;
		showToast(r.success ? `Started ${a.name}` : `Start failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}
	async function onStop(a: AddonInfo) {
		busySlug = a.slug;
		const r = await stopAddon(a.slug);
		busySlug = null;
		showToast(r.success ? `Stopped ${a.name}` : `Stop failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}
	async function onRestart(a: AddonInfo) {
		busySlug = a.slug;
		const r = await restartAddon(a.slug);
		busySlug = null;
		showToast(r.success ? `Restarted ${a.name}` : `Restart failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}
	async function onUpdate(a: AddonInfo) {
		busySlug = a.slug;
		showToast(`Updating ${a.name}… this may take a few minutes`, 'success');
		const r = await updateAddon(a.slug);
		busySlug = null;
		if (r.success) {
			showToast(`Updated ${a.name}`, 'success');
			await refresh();
		} else {
			showToast(`Update failed — ${r.error}`, 'error');
		}
	}

	onMount(() => {
		void refresh();
	});
</script>

<svelte:head>
	<title>Add-ons · Settings · broadsheet</title>
</svelte:head>

<SettingsSurface
	section="Settings · Add-ons"
	headline="Your add-ons."
	dek="Every add-on installed in HA. Start, stop, restart, or apply an update. Uninstall stays in HA's UI — it's a one-way door."
	haPath="/hassio/store"
	haLabel="Browse add-on store in HA →"
>
	{#if loading}
		<p class="loading">Reading the add-on list…</p>
	{:else}
		<StatusGrouped {summary} {groups} emptyAll="Either no add-ons are installed, or HA isn't on Supervisor.">
			{#snippet row(item)}
				{@const a = item as AddonInfo}
				{@const isErr = a.state === 'error'}
				{@const isRunning = a.state === 'started'}
				<EditorialRow
					tone={isErr ? 'alert' : isRunning ? 'positive' : 'muted'}
				>
					{#snippet label()}
						{a.name}
					{/snippet}
					{#snippet status()}
						v{a.version}
						{#if a.update_available} · update v{a.version_latest} available{/if}
						{#if a.state !== 'started' && a.state !== 'stopped'} · {a.state}{/if}
					{/snippet}
					{#snippet actions()}
						{#if isRunning}
							<button
								type="button"
								disabled={busySlug === a.slug}
								onclick={() => onStop(a)}
							>
								Stop
							</button>
							<button
								type="button"
								disabled={busySlug === a.slug}
								onclick={() => onRestart(a)}
							>
								Restart
							</button>
						{:else}
							<button
								type="button"
								disabled={busySlug === a.slug}
								onclick={() => onStart(a)}
							>
								Start
							</button>
						{/if}
						{#if a.update_available}
							<button
								type="button"
								disabled={busySlug === a.slug}
								onclick={() => onUpdate(a)}
							>
								Update
							</button>
						{/if}
						<a
							href={`/hassio/addon/${a.slug}/info`}
							target="_top"
							rel="noopener"
						>
							Open in HA
						</a>
					{/snippet}
					{#snippet details()}
						<p class="addon-desc">{a.description}</p>
						<dl class="addon-details">
							<dt>Slug</dt>
							<dd><code>{a.slug}</code></dd>
							<dt>Repository</dt>
							<dd><code>{a.repository}</code></dd>
							<dt>Stage</dt>
							<dd>{a.stage}</dd>
							{#if a.installed}
								<dt>Installed</dt>
								<dd>{new Date(a.installed).toLocaleString()}</dd>
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

	.addon-desc {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
		margin: 0 0 var(--space-2);
		line-height: var(--leading-snug);
	}

	.addon-details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}

	.addon-details dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.addon-details dd {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.addon-details code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
