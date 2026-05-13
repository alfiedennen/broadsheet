<script lang="ts">
	/**
	 * /settings/house — areas + entities curation, restructured for M4.x.
	 *
	 * Headline changes from the M4 v0:
	 *  1. Group entities by device within each area (so the FRONT DOOR
	 *     cluster shows as one row, not 6)
	 *  2. Show domain badge (LOCK / CONTACT / BUTTON / SENSOR) + current
	 *     state inline so the user can see "is this the live one?"
	 *  3. Auto-hidden entities (duplicates, system noise) collapsed
	 *     under "N hidden — show" toggle per area, with the hide reason
	 *     surfaced as a chip
	 *  4. Per-entity unhide button (uses curation `unhide` flag)
	 */

	import { discovery } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import {
		curationStore,
		hideArea,
		renameArea,
		hideEntity,
		renameEntity,
		unhideEntity
	} from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { updateEntityArea } from '$lib/ha/registry';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const sortedAreas = $derived.by(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		const all = [...discovery.areas];
		return all.sort((a, b) => {
			if (a.id === '__unsorted__') return 1;
			if (b.id === '__unsorted__') return -1;
			return a.name.localeCompare(b.name);
		});
	});

	let expandedAreaId = $state<string | null>(null);
	let showHiddenInAreaId = $state<string | null>(null);
	let renameBuffer = $state<Record<string, string>>({});
	let entityRenameBuffer = $state<Record<string, string>>({});
	/** Entity IDs whose Move-to-area picker is currently visible. */
	let movePickerOpen = $state<Set<string>>(new Set());

	/**
	 * Real (non-synthetic, non-hidden) areas users can move entities to.
	 * Sorted by name for the dropdown.
	 */
	const movableAreas = $derived.by(() => {
		// Reactive: re-read when curation changes (in case the user just hid an area)
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		return discoveryStore.areas
			.filter((a) => !curationStore.current.areas[a.area_id]?.hidden)
			.map((a) => ({
				id: a.area_id,
				// Use curation rename if set, else raw HA name
				name: curationStore.current.areas[a.area_id]?.rename || a.name
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	function toggleExpand(id: string) {
		expandedAreaId = expandedAreaId === id ? null : id;
		// Reset show-hidden when collapsing
		if (expandedAreaId !== id) showHiddenInAreaId = null;
	}

	function toggleShowHidden(id: string) {
		showHiddenInAreaId = showHiddenInAreaId === id ? null : id;
	}

	function startRenameArea(area: DomainArea) {
		const raw = discoveryStore.areas.find((a) => a.area_id === area.id);
		renameBuffer[area.id] = curationStore.current.areas[area.id]?.rename ?? raw?.name ?? area.name;
	}

	async function commitRenameArea(areaId: string) {
		const value = (renameBuffer[areaId] ?? '').trim();
		const ok = await renameArea(areaId, value || null);
		showToast(ok ? (value ? `Renamed to "${value}"` : 'Rename cleared') : 'Save failed', ok ? 'success' : 'error');
		delete renameBuffer[areaId];
	}

	function cancelRenameArea(areaId: string) {
		delete renameBuffer[areaId];
	}

	async function toggleAreaHidden(area: DomainArea) {
		const next = !curationStore.current.areas[area.id]?.hidden;
		const ok = await hideArea(area.id, next);
		showToast(ok ? (next ? `${area.name} hidden` : `${area.name} visible`) : 'Save failed', ok ? 'success' : 'error');
	}

	function startRenameEntity(entity: DomainEntity) {
		entityRenameBuffer[entity.id] = curationStore.current.entities[entity.id]?.rename ?? entity.name;
	}

	async function commitRenameEntity(entityId: string) {
		const value = (entityRenameBuffer[entityId] ?? '').trim();
		const ok = await renameEntity(entityId, value || null);
		showToast(ok ? (value ? `Renamed to "${value}"` : 'Rename cleared') : 'Save failed', ok ? 'success' : 'error');
		delete entityRenameBuffer[entityId];
	}

	function cancelRenameEntity(entityId: string) {
		delete entityRenameBuffer[entityId];
	}

	async function toggleEntityHidden(entity: DomainEntity) {
		const next = !curationStore.current.entities[entity.id]?.hidden;
		const ok = await hideEntity(entity.id, next);
		showToast(ok ? (next ? `${entity.name} hidden` : `${entity.name} visible`) : 'Save failed', ok ? 'success' : 'error');
	}

	async function showThisAnyway(entity: DomainEntity) {
		const ok = await unhideEntity(entity.id, true);
		showToast(ok ? `${entity.name} forced visible` : 'Save failed', ok ? 'success' : 'error');
	}

	async function clearUnhide(entity: DomainEntity) {
		const ok = await unhideEntity(entity.id, false);
		showToast(ok ? `${entity.name} back to default` : 'Save failed', ok ? 'success' : 'error');
	}

	function toggleMovePicker(entityId: string) {
		const next = new Set(movePickerOpen);
		if (next.has(entityId)) next.delete(entityId);
		else next.add(entityId);
		movePickerOpen = next;
	}

	async function moveEntity(entity: DomainEntity, targetAreaId: string | null) {
		// Don't fire if it's already in the target area (no-op + would close picker)
		if (entity.areaId === targetAreaId) {
			toggleMovePicker(entity.id);
			return;
		}
		const targetName =
			targetAreaId === null
				? '(no area)'
				: (movableAreas.find((a) => a.id === targetAreaId)?.name ?? targetAreaId);
		const result = await updateEntityArea(entity.id, targetAreaId);
		if (result.success) {
			showToast(`Moved ${entity.name} → ${targetName}`, 'success');
			// Close the picker
			const next = new Set(movePickerOpen);
			next.delete(entity.id);
			movePickerOpen = next;
		} else {
			showToast(`Move failed: ${result.error ?? result.reason}`, 'error');
		}
	}

	/* ─────────────── helpers ─────────────── */

	function rawNameFor(areaId: string): string | null {
		return discoveryStore.areas.find((a) => a.area_id === areaId)?.name ?? null;
	}

	function entityCountSummary(area: DomainArea): string {
		const visible = visibleEntitiesIn(area).length;
		const hidden = area.hiddenEntities.length;
		const parts: string[] = [];
		if (visible > 0) parts.push(`${visible} visible`);
		if (hidden > 0) parts.push(`${hidden} hidden`);
		return parts.length === 0 ? 'no entities' : parts.join(' · ');
	}

	function isHidden(area: DomainArea): boolean {
		return !!curationStore.current.areas[area.id]?.hidden;
	}

	function isEntityHidden(entity: DomainEntity): boolean {
		return !!curationStore.current.entities[entity.id]?.hidden;
	}

	function isUnhideForced(entity: DomainEntity): boolean {
		return !!curationStore.current.entities[entity.id]?.unhide;
	}

	function visibleEntitiesIn(area: DomainArea): DomainEntity[] {
		return [
			...area.lights,
			...area.switches,
			...area.climates,
			...area.locks,
			...area.contacts,
			...area.cameras,
			...area.tvs,
			...area.media,
			...area.remotes,
			...area.sensors,
			...area.scenes,
			...area.otherEntities
		];
	}

	/**
	 * Group entities by device_id. Entities without a device_id form
	 * their own pseudo-group (id = `__no-device__:${entity.id}` so
	 * each becomes its own row).
	 */
	interface DeviceGroup {
		key: string;
		device: DomainEntity['device'] | null;
		entities: DomainEntity[];
	}

	function groupByDevice(entities: DomainEntity[]): DeviceGroup[] {
		const map = new Map<string, DeviceGroup>();
		for (const e of entities) {
			const key = e.deviceId ?? `__no-device__:${e.id}`;
			if (!map.has(key)) {
				map.set(key, { key, device: e.device, entities: [] });
			}
			map.get(key)!.entities.push(e);
		}
		// Sort: groups with device first, by device name; then no-device groups by entity name
		const groups = Array.from(map.values());
		return groups.sort((a, b) => {
			const aHas = !!a.device;
			const bHas = !!b.device;
			if (aHas && !bHas) return -1;
			if (!aHas && bHas) return 1;
			const an = a.device?.name ?? a.entities[0]?.name ?? '';
			const bn = b.device?.name ?? b.entities[0]?.name ?? '';
			return an.localeCompare(bn);
		});
	}

	function domainBadge(entity: DomainEntity): string {
		const dom = entity.domain;
		// Friendly labels per domain — mirror /lights, /heat, /door classifications
		switch (dom) {
			case 'light':
				return 'LIGHT';
			case 'switch':
				return 'SWITCH';
			case 'climate':
				return 'TRV';
			case 'lock':
				return 'LOCK';
			case 'binary_sensor': {
				const dc = (entity.state?.attributes?.device_class as string | undefined) ?? entity.deviceClass;
				if (dc === 'door' || dc === 'window' || dc === 'opening') return 'CONTACT';
				if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') return 'PRESENCE';
				return 'BSENSOR';
			}
			case 'sensor':
				return 'SENSOR';
			case 'camera':
				return 'CAMERA';
			case 'media_player':
				return 'MEDIA';
			case 'remote':
				return 'REMOTE';
			case 'scene':
				return 'SCENE';
			case 'button':
				return 'BUTTON';
			case 'select':
				return 'SELECT';
			case 'number':
				return 'NUMBER';
			case 'update':
				return 'UPDATE';
			default:
				return dom.toUpperCase().slice(0, 7);
		}
	}

	function stateLine(entity: DomainEntity): string | null {
		const s = entity.state?.state;
		if (s === undefined || s === null || s === 'unavailable' || s === 'unknown') {
			// Surface specifically that this is the dead one
			return s === 'unavailable' ? 'unavailable' : '—';
		}
		const unit = entity.state?.attributes?.unit_of_measurement as string | undefined;
		const formatted = unit ? `${s} ${unit}` : s;
		// Limit length so it doesn't blow out the row
		return formatted.length > 32 ? formatted.slice(0, 30) + '…' : formatted;
	}

	function lastChangedLine(entity: DomainEntity): string | null {
		if (!entity.state?.last_changed) return null;
		const ms = Date.now() - new Date(entity.state.last_changed).getTime();
		const mins = Math.round(ms / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.round(hrs / 24);
		return `${days}d ago`;
	}

	function hideReasonChip(entity: DomainEntity): { label: string; tooltip: string } | null {
		switch (entity.autoHideReason) {
			case 'duplicate':
				return {
					label: 'duplicate',
					tooltip:
						'Another entity with the same device + domain is visible. This is likely an orphan from a re-pair — fix in HA Settings → Devices.'
				};
			case 'system':
				return {
					label: 'system',
					tooltip:
						'Looks like integration plumbing (battery, signal strength, wake button, operator status, etc). Hidden by default.'
				};
			case 'integration':
				return {
					label: 'integration',
					tooltip: 'The integration that created this entity asked HA to hide it.'
				};
			default:
				return null;
		}
	}
</script>

<svelte:head>
	<title>House · Settings · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · House" />
		{/snippet}
		{#snippet headline()}
			Your areas + entities.
		{/snippet}
		{#snippet dek()}
			Tap a row to expand. Renames + hides save immediately. Entities are
			grouped by device — the row that says "Front Door" is the Yale lock with
			its sub-entities folded inside. Auto-hidden entities (duplicates, system
			noise) are tucked under "N hidden — show".
		{/snippet}
	</Hero>

	<OutLine label="Areas" />

	<!--
		The snippet + the ul wrap together in a div so the snippet
		isn't at PageShell-root (root-level snippets get exported as
		component props in Svelte 5).
	-->
	<div class="house-area-block">
	{#snippet entityRow(entity: DomainEntity)}
		{@const eRenaming = entityRenameBuffer[entity.id] !== undefined}
		{@const eHidden = isEntityHidden(entity)}
		{@const eUnhide = isUnhideForced(entity)}
		{@const reason = hideReasonChip(entity)}
		{@const isUnsorted = entity.areaId === null}
		{@const moveOpen = movePickerOpen.has(entity.id) || isUnsorted}
		<div class="entity-shell" class:hidden={eHidden}>
			<div class="entity-row">
				<div class="entity-info">
					<div class="entity-line-1">
						<span class="domain-badge">{domainBadge(entity)}</span>
						{#if eRenaming}
							<input
								type="text"
								class="entity-rename-input"
								bind:value={entityRenameBuffer[entity.id]}
								onkeydown={(e) => {
									if (e.key === 'Enter') commitRenameEntity(entity.id);
									if (e.key === 'Escape') cancelRenameEntity(entity.id);
								}}
							/>
						{:else}
							<span class="entity-name">{entity.name}</span>
						{/if}
						{#if reason}
							<span class="reason-chip" title={reason.tooltip}>{reason.label}</span>
						{/if}
						{#if eUnhide}
							<span class="reason-chip override" title="You forced this visible. Click Default to clear.">forced visible</span>
						{/if}
					</div>
					<div class="entity-line-2">
						<code class="entity-id">{entity.id}</code>
						{#if stateLine(entity)}
							<span class="state-sep" aria-hidden="true">·</span>
							<span class="entity-state" data-state={entity.state?.state ?? 'unknown'}>
								{stateLine(entity)}
							</span>
						{/if}
						{#if lastChangedLine(entity)}
							<span class="state-sep" aria-hidden="true">·</span>
							<span class="entity-age">{lastChangedLine(entity)}</span>
						{/if}
					</div>
				</div>
				<div class="entity-actions">
					{#if eRenaming}
						<button class="mini confirm" type="button" onclick={() => commitRenameEntity(entity.id)}>
							Save
						</button>
						<button class="mini" type="button" onclick={() => cancelRenameEntity(entity.id)}>
							Cancel
						</button>
					{:else}
						{#if !isUnsorted}
							<button class="mini" type="button" onclick={() => toggleMovePicker(entity.id)}>
								{moveOpen ? 'Close move' : 'Move…'}
							</button>
						{/if}
						<button class="mini" type="button" onclick={() => startRenameEntity(entity)}>
							Rename
						</button>
						{#if eUnhide}
							<button class="mini" type="button" onclick={() => clearUnhide(entity)}>
								Default
							</button>
						{:else}
							<button class="mini" type="button" onclick={() => toggleEntityHidden(entity)}>
								{eHidden ? 'Show' : 'Hide'}
							</button>
						{/if}
					{/if}
				</div>
			</div>

			{#if moveOpen && !eRenaming}
				<!--
					Move-to-area picker. Always shown for entities currently in
					Unsorted (so the "place" job is one click away). For entities
					already in a room, only shown after clicking Move… (so it
					doesn't clutter the list).

					Writes to HA's entity_registry directly (lib/ha/registry.ts).
					Discovery picks the change up via the
					entity_registry_updated subscription within ~500ms.
				-->
				<div class="move-picker">
					<span class="move-label">
						{#if isUnsorted}
							Place in
						{:else}
							Move to
						{/if}
					</span>
					<div class="move-options">
						{#each movableAreas as area (area.id)}
							<button
								type="button"
								class="move-option"
								class:current={entity.areaId === area.id}
								onclick={() => moveEntity(entity, area.id)}
							>
								{area.name}
							</button>
						{/each}
						{#if !isUnsorted}
							<button
								type="button"
								class="move-option clear"
								onclick={() => moveEntity(entity, null)}
							>
								(no area)
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	<ul class="area-list">
		{#each sortedAreas as area (area.id)}
			{@const expanded = expandedAreaId === area.id}
			{@const renaming = renameBuffer[area.id] !== undefined}
			{@const hidden = isHidden(area)}
			{@const raw = rawNameFor(area.id)}
			{@const isUnsorted = area.id === '__unsorted__'}
			{@const visibleGroups = groupByDevice(visibleEntitiesIn(area))}
			{@const hiddenGroups = groupByDevice(area.hiddenEntities)}
			{@const showingHidden = showHiddenInAreaId === area.id}
			<li class="area-row" class:expanded class:hidden class:unsorted={isUnsorted}>
				<header class="area-head">
					{#if renaming}
						<div class="title-block rename-mode">
							<input
								type="text"
								class="rename-input"
								bind:value={renameBuffer[area.id]}
								onkeydown={(e) => {
									if (e.key === 'Enter') commitRenameArea(area.id);
									if (e.key === 'Escape') cancelRenameArea(area.id);
								}}
								placeholder={raw ?? area.name}
							/>
							<span class="area-count">{entityCountSummary(area)}</span>
						</div>
					{:else}
						<button
							class="expand"
							type="button"
							onclick={() => toggleExpand(area.id)}
							aria-expanded={expanded}
						>
							<span class="chev">{expanded ? '−' : '+'}</span>
							<div class="title-block">
								<span class="area-name">{area.name}</span>
								{#if raw && raw !== area.name && !isUnsorted}
									<span class="raw-name">was: {raw}</span>
								{/if}
								<span class="area-count">{entityCountSummary(area)}</span>
							</div>
						</button>
					{/if}

					<div class="actions" role="group">
						{#if renaming}
							<button class="action confirm" type="button" onclick={() => commitRenameArea(area.id)}>
								Save
							</button>
							<button class="action" type="button" onclick={() => cancelRenameArea(area.id)}>
								Cancel
							</button>
						{:else if !isUnsorted}
							<button class="action" type="button" onclick={() => startRenameArea(area)}>
								Rename
							</button>
							<button class="action" type="button" onclick={() => toggleAreaHidden(area)}>
								{hidden ? 'Show' : 'Hide'}
							</button>
						{:else}
							<span class="hint">Cannot rename Unsorted</span>
						{/if}
					</div>
				</header>

				{#if expanded}
					<div class="entities">
						{#if visibleGroups.length === 0}
							<p class="empty">No visible entities in this area.</p>
						{/if}

						{#each visibleGroups as group (group.key)}
							{#if group.device && group.entities.length > 1}
								<!-- Multi-entity device — render as a group with header -->
								<div class="device-group">
									<div class="device-head">
										<span class="device-icon" aria-hidden="true">▣</span>
										<div class="device-meta">
											<span class="device-name">{group.device.name ?? 'Unnamed device'}</span>
											{#if group.device.manufacturer || group.device.model}
												<span class="device-detail">
													{[group.device.manufacturer, group.device.model].filter(Boolean).join(' · ')}
												</span>
											{/if}
										</div>
										<span class="device-count">{group.entities.length} entities</span>
									</div>
									<div class="device-entities">
										{#each group.entities as entity (entity.id)}
											{@render entityRow(entity)}
										{/each}
									</div>
								</div>
							{:else}
								<!-- Single-entity device or no-device — render as standalone row -->
								{#each group.entities as entity (entity.id)}
									{@render entityRow(entity)}
								{/each}
							{/if}
						{/each}

						{#if hiddenGroups.length > 0}
							<button
								class="hidden-toggle"
								type="button"
								onclick={() => toggleShowHidden(area.id)}
							>
								{showingHidden ? '−' : '+'}
								{area.hiddenEntities.length} hidden
								<span class="hidden-detail">
									({[
										area.hiddenEntities.filter((e) => e.autoHideReason === 'duplicate').length &&
											`${area.hiddenEntities.filter((e) => e.autoHideReason === 'duplicate').length} duplicate`,
										area.hiddenEntities.filter((e) => e.autoHideReason === 'system').length &&
											`${area.hiddenEntities.filter((e) => e.autoHideReason === 'system').length} system`,
										area.hiddenEntities.filter((e) => e.autoHideReason === 'integration').length &&
											`${area.hiddenEntities.filter((e) => e.autoHideReason === 'integration').length} integration`
									]
										.filter(Boolean)
										.join(' · ')})
								</span>
							</button>

							{#if showingHidden}
								<div class="hidden-block">
									{#each hiddenGroups as group (group.key)}
										{@const isDeviceGroup = group.device && group.entities.length > 1}
										{#if isDeviceGroup}
											<div class="device-group hidden-device">
												<div class="device-head">
													<span class="device-icon" aria-hidden="true">▣</span>
													<div class="device-meta">
														<span class="device-name">{group.device?.name ?? 'Unnamed device'}</span>
														{#if group.device?.manufacturer || group.device?.model}
															<span class="device-detail">
																{[group.device.manufacturer, group.device.model].filter(Boolean).join(' · ')}
															</span>
														{/if}
													</div>
													<span class="device-count">{group.entities.length} hidden</span>
												</div>
												<div class="device-entities">
													{#each group.entities as entity (entity.id)}
														{@render entityRow(entity)}
													{/each}
												</div>
											</div>
										{:else}
											{#each group.entities as entity (entity.id)}
												{@render entityRow(entity)}
											{/each}
										{/if}
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	</div>
</PageShell>

<style>
	.area-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.area-row {
		border-bottom: 1px solid var(--rule);
	}

	.area-row.hidden .area-name {
		color: var(--fg-dim);
		text-decoration: line-through;
	}

	.area-row.unsorted .area-name {
		color: var(--accent);
		font-style: italic;
	}

	.area-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-2);
	}

	.expand {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		text-align: left;
		color: var(--fg);
		min-width: 0;
	}

	.chev {
		font-family: var(--font-mono);
		font-size: 1.2rem;
		color: var(--fg-muted);
		flex: 0 0 1.2rem;
		text-align: center;
	}

	.title-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.area-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--fg);
		line-height: 1.2;
	}

	.raw-name {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-dim);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
	}

	.area-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		flex: 0 0 auto;
	}

	.action {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.action:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.action.confirm {
		color: var(--accent);
		border-color: var(--accent);
	}

	.hint {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
		font-style: italic;
		align-self: center;
	}

	.rename-input {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-input);
		width: 100%;
	}

	.entities {
		padding: var(--space-3) var(--space-3) var(--space-4) calc(var(--space-3) + 1.2rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		border-top: 1px solid var(--rule);
		background: var(--bg-card);
	}

	.device-group {
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: rgba(255, 255, 255, 0.01);
		overflow: hidden;
	}

	.device-group.hidden-device {
		opacity: 0.7;
	}

	.device-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: rgba(255, 255, 255, 0.015);
		border-bottom: 1px solid var(--rule);
	}

	.device-icon {
		color: var(--fg-muted);
		font-size: 1rem;
		flex: 0 0 auto;
	}

	.device-meta {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.device-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--fg);
	}

	.device-detail {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: var(--track-caption);
		color: var(--fg-dim);
		text-transform: uppercase;
	}

	.device-count {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		flex: 0 0 auto;
	}

	.device-entities {
		display: flex;
		flex-direction: column;
	}

	.entity-shell {
		border-bottom: 1px solid var(--rule);
	}

	.entity-shell:last-child {
		border-bottom: none;
	}

	.entity-shell.hidden .entity-name {
		color: var(--fg-dim);
		text-decoration: line-through;
	}

	.entity-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
	}

	.move-picker {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3) var(--space-3);
		background: rgba(192, 138, 74, 0.05);
		border-top: 1px dashed var(--rule);
	}

	.move-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		flex: 0 0 auto;
		padding-top: var(--space-1);
	}

	.move-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		flex: 1;
	}

	.move-option {
		font-family: var(--font-caption);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg);
		background: var(--bg-card);
		min-height: 32px;
		transition: border-color var(--ease-quick), background var(--ease-quick), color var(--ease-quick);
	}

	.move-option:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.move-option.current {
		border-color: var(--accent);
		background: var(--accent-glow);
		color: var(--accent);
		opacity: 0.7;
		cursor: default;
	}

	.move-option.clear {
		font-style: italic;
		color: var(--fg-muted);
		border-style: dashed;
	}

	.move-option.clear:hover {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	.entity-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.entity-line-1 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.entity-line-2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.domain-badge {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 500;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		background: rgba(192, 138, 74, 0.1);
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		flex: 0 0 auto;
		font-variant-numeric: tabular-nums;
	}

	.entity-name {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.entity-id {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
	}

	.entity-state {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.entity-state[data-state='on'],
	.entity-state[data-state='unlocked'],
	.entity-state[data-state='open'] {
		color: var(--state-on);
	}

	.entity-state[data-state='unavailable'] {
		color: var(--state-alert);
	}

	.entity-age {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
	}

	.state-sep {
		color: var(--fg-dim);
	}

	.reason-chip {
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		border: 1px solid var(--rule);
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		flex: 0 0 auto;
		cursor: help;
	}

	.reason-chip.override {
		color: var(--accent);
		border-color: var(--accent);
	}

	.entity-rename-input {
		font-family: var(--font-body);
		font-size: var(--text-body);
		padding: 2px var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-input);
		flex: 1;
		min-width: 0;
	}

	.entity-actions {
		display: flex;
		gap: var(--space-1);
		flex: 0 0 auto;
	}

	.mini {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-caption);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 32px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.mini:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.mini.confirm {
		color: var(--accent);
		border-color: var(--accent);
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
		font-size: var(--text-caption);
	}

	.hidden-toggle {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.hidden-toggle:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.hidden-detail {
		font-size: 0.65rem;
		color: var(--fg-dim);
		text-transform: lowercase;
		letter-spacing: 0;
	}

	.hidden-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		opacity: 0.85;
	}
</style>
