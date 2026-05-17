<script lang="ts">
	/**
	 * /settings/devices — broadsheet-native view of HA's device
	 * registry.
	 *
	 * Reads via config/device_registry/list, groups by their owning
	 * integration. Each row exposes inline rename + area picker +
	 * disable/enable. Discovery's existing device_registry_updated
	 * subscription propagates writes into broadsheet's state.
	 *
	 * Rubric: P7-S3 write-side companion.
	 */

	import { onMount } from 'svelte';
	import SettingsSurface from '$lib/components/settings/SettingsSurface.svelte';
	import StatusGrouped, {
		type StatusGroup
	} from '$lib/components/settings/StatusGrouped.svelte';
	import EditorialRow from '$lib/components/settings/EditorialRow.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { discovery } from '$lib/discovery';
	import {
		listDevices,
		renameDevice,
		assignDeviceArea,
		setDeviceDisabled,
		deviceDisplayName,
		devicesByIntegration,
		type DeviceRecord
	} from '$lib/ha/admin/devices';
	import { listConfigEntries, type ConfigEntry } from '$lib/ha/admin/integrations';
	import { splitByTaxonomy } from '$lib/ha/admin/taxonomy';
	import { useCurationField } from '$lib/curation/store.svelte';

	let devices = $state<DeviceRecord[]>([]);
	let entries = $state<ConfigEntry[]>([]);
	let loading = $state(true);
	let busyDevice = $state<string | null>(null);
	let renameDraft = $state<Record<string, string>>({});

	// Theme D: persistent "show plumbing" toggle.
	// Default: false (hide plumbing — physical objects only).
	const showPlumbing = useCurationField<boolean>('view.showPlumbing');
	const showPlumbingValue = $derived(showPlumbing.value === true);

	const entriesById = $derived(new Map(entries.map((e) => [e.entry_id, e])));

	// Theme D: partition into user-facing vs plumbing once per render.
	// `visibleDevices` is the subset rendered in the grouped list;
	// counts feed the summary line below.
	const taxonomy = $derived(splitByTaxonomy(devices, entriesById));
	const visibleDevices = $derived(
		showPlumbingValue ? devices : taxonomy.userFacing
	);

	const grouped = $derived.by(() => {
		const byIntegration = devicesByIntegration(visibleDevices);
		const groups: StatusGroup<DeviceRecord>[] = [];
		for (const [entryId, items] of byIntegration) {
			const entry = entriesById.get(entryId);
			const label = entry ? `${entry.title} (${entry.domain})` : `Unknown integration (${entryId.slice(0, 8)}…)`;
			groups.push({
				label: `${label} · ${items.length} ${items.length === 1 ? 'device' : 'devices'}`,
				items,
				tone: 'default'
			});
		}
		groups.sort((a, b) => a.label.localeCompare(b.label));
		return groups;
	});

	const summary = $derived.by(() => {
		if (devices.length === 0) return 'No devices discovered yet.';
		const userCount = taxonomy.userFacing.length;
		const plumbingCount = taxonomy.plumbing.length;
		const integrationCount = new Set(
			visibleDevices.map((d) => d.config_entries[0] ?? '__unknown__')
		).size;
		const disabledCount = devices.filter((d) => d.disabled_by).length;
		const lead = showPlumbingValue
			? `${devices.length} ${devices.length === 1 ? 'device' : 'devices'} from ${integrationCount} ${integrationCount === 1 ? 'integration' : 'integrations'} (${plumbingCount} plumbing visible).`
			: `${userCount} physical ${userCount === 1 ? 'device' : 'devices'} from ${integrationCount} ${integrationCount === 1 ? 'integration' : 'integrations'}. ${plumbingCount} plumbing ${plumbingCount === 1 ? 'row' : 'rows'} hidden.`;
		return disabledCount > 0 ? `${lead} ${disabledCount} disabled.` : lead;
	});

	async function togglePlumbing() {
		showPlumbing.value = !showPlumbingValue;
	}

	async function refresh() {
		const [d, e] = await Promise.all([listDevices(), listConfigEntries()]);
		devices = d;
		entries = e;
		loading = false;
	}

	async function onRename(d: DeviceRecord) {
		const draft = renameDraft[d.id] ?? '';
		if (draft.trim() === (d.name_by_user ?? '').trim()) return; // no-op
		busyDevice = d.id;
		const r = await renameDevice(d.id, draft);
		busyDevice = null;
		showToast(r.success ? 'Renamed' : `Rename failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}

	async function onAssignArea(d: DeviceRecord, areaId: string | null) {
		busyDevice = d.id;
		const r = await assignDeviceArea(d.id, areaId);
		busyDevice = null;
		showToast(r.success ? 'Area updated' : `Failed — ${r.error}`, r.success ? 'success' : 'error');
		if (r.success) await refresh();
	}

	async function onToggleDisabled(d: DeviceRecord) {
		const next = !d.disabled_by;
		busyDevice = d.id;
		const r = await setDeviceDisabled(d.id, next);
		busyDevice = null;
		showToast(
			r.success ? `${next ? 'Disabled' : 'Enabled'} ${deviceDisplayName(d)}` : `Failed — ${r.error}`,
			r.success ? 'success' : 'error'
		);
		if (r.success) await refresh();
	}

	onMount(() => {
		void refresh();
	});
</script>

<svelte:head>
	<title>Devices · Settings · broadsheet</title>
</svelte:head>

<SettingsSurface
	section="Settings · Devices"
	headline="Your devices."
	dek="Every device HA knows about, grouped by the integration that owns it. Rename for clarity, reassign to a different room, or disable a device that's gone away."
	haPath="/config/devices/dashboard"
	haLabel="Open HA's device dashboard →"
>
	{#if loading}
		<p class="loading">Reading the device registry…</p>
	{:else}
		<!-- Theme D: plumbing toggle. Default-off filters HA's
		     long tail of HACS / energy / service-shaped integrations
		     out of the list so the page reflects PHYSICAL objects. -->
		<label class="plumbing-toggle">
			<input
				type="checkbox"
				checked={showPlumbingValue}
				onchange={togglePlumbing}
			/>
			<span class="plumbing-label">
				Show plumbing
				<span class="plumbing-hint">
					— HACS, HA-Core service integrations, weather + energy plumbing.
					Off by default; flick on when you need to debug an integration.
				</span>
			</span>
		</label>

		<StatusGrouped {summary} groups={grouped}>
			{#snippet row(item)}
				{@const d = item as DeviceRecord}
				<EditorialRow
					tone={d.disabled_by ? 'muted' : 'default'}
				>
					{#snippet label()}
						{deviceDisplayName(d)}
					{/snippet}
					{#snippet status()}
						{d.manufacturer ?? 'unknown maker'}
						{#if d.model} · {d.model}{/if}
						{#if d.disabled_by} · disabled{/if}
					{/snippet}
					{#snippet actions()}
						<input
							type="text"
							class="rename-input"
							placeholder={d.name ?? 'untitled'}
							value={renameDraft[d.id] ?? d.name_by_user ?? ''}
							oninput={(e) =>
								(renameDraft[d.id] = (e.target as HTMLInputElement).value)}
							onblur={() => onRename(d)}
							onkeydown={(e) => {
								if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
							}}
							disabled={busyDevice === d.id}
						/>
						<select
							class="area-select"
							value={d.area_id ?? ''}
							onchange={(e) =>
								onAssignArea(d, (e.target as HTMLSelectElement).value || null)}
							disabled={busyDevice === d.id}
						>
							<option value="">(no area)</option>
							{#each discovery.areas as a (a.id)}
								<option value={a.id}>{a.name}</option>
							{/each}
						</select>
						<button
							type="button"
							disabled={busyDevice === d.id}
							onclick={() => onToggleDisabled(d)}
						>
							{d.disabled_by ? 'Enable' : 'Disable'}
						</button>
					{/snippet}
					{#snippet details()}
						<dl class="device-details">
							<dt>Device ID</dt>
							<dd><code>{d.id}</code></dd>
							<dt>HA name</dt>
							<dd>{d.name ?? '—'}</dd>
							{#if d.sw_version}
								<dt>Software</dt>
								<dd>{d.sw_version}</dd>
							{/if}
							{#if d.hw_version}
								<dt>Hardware</dt>
								<dd>{d.hw_version}</dd>
							{/if}
							{#if d.identifiers && d.identifiers.length > 0}
								<dt>Identifiers</dt>
								<dd>
									{#each d.identifiers as [namespace, id] (namespace)}
										<code>{namespace}:{id}</code>{' '}
									{/each}
								</dd>
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

	/* Theme D — plumbing toggle row. Subtle, sits above the grouped
	 * list. Same register as other settings affordances. */
	.plumbing-toggle {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		margin-bottom: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		cursor: pointer;
		transition: border-color var(--ease-quick);
	}

	.plumbing-toggle:hover {
		border-color: var(--accent);
	}

	.plumbing-toggle input[type='checkbox'] {
		margin-top: 4px;
		cursor: pointer;
		accent-color: var(--accent);
	}

	.plumbing-label {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg);
	}

	.plumbing-hint {
		display: block;
		margin-top: var(--space-1);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--fg-muted);
		text-transform: none;
		letter-spacing: 0;
		line-height: var(--leading-snug);
	}

	.rename-input {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		color: var(--fg);
		min-width: 14ch;
	}

	.rename-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.area-select {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		color: var(--fg);
	}

	.device-details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}

	.device-details dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.device-details dd {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.device-details code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
