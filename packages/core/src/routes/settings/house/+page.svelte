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
		hideDevice,
		renameDevice,
		hideEntity,
		renameEntity,
		unhideEntity,
		setMomentSensor
	} from '$lib/curation/store.svelte';
	import {
		listIndoorTempCandidates,
		listElectricityRateCandidates,
		resolveIndoorTempSensor,
		resolveElectricityRateSensor
	} from '$lib/manifest/momentSensors';
	import { showToast } from '$lib/stores/toast.svelte';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { updateEntityArea, updateDeviceArea, createArea } from '$lib/ha/registry';
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
	/** Device-rename buffer keyed by device_id. Open while user types. */
	let deviceRenameBuffer = $state<Record<string, string>>({});
	/** Entity IDs whose Move-to-area picker is currently visible. */
	let movePickerOpen = $state<Set<string>>(new Set());
	/** Device group-keys whose Move-to-area picker is currently visible. */
	let deviceMovePickerOpen = $state<Set<string>>(new Set());
	/**
	 * Device group keys (deviceId) that are currently expanded.
	 * Multi-entity device groups default to collapsed — the header
	 * shows the count + manufacturer + model so the user can scan
	 * without having every device's 24 sub-entities revealed.
	 */
	let expandedDevices = $state<Set<string>>(new Set());

	function toggleDeviceExpanded(key: string) {
		const next = new Set(expandedDevices);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedDevices = next;
	}

	/* ─────────────── create-room ─────────────── */
	// "+ New room" — creates a REAL HA area via config/area_registry/create
	// (lib/ha/registry.ts → createArea). Discovery's area_registry_updated
	// subscription re-projects it into the list within the debounce window,
	// so there's no manual insert here: create, toast, the row appears.
	let creatingRoom = $state<boolean>(false);
	let newRoomName = $state<string>('');
	let newRoomFloor = $state<string | null>(null);
	let newRoomNameEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (creatingRoom && newRoomNameEl) newRoomNameEl.focus();
	});

	function openCreateRoom() {
		newRoomName = '';
		newRoomFloor = null;
		creatingRoom = true;
	}

	function cancelCreateRoom() {
		creatingRoom = false;
		newRoomName = '';
		newRoomFloor = null;
	}

	async function commitCreateRoom() {
		const name = newRoomName.trim();
		if (!name) {
			showToast('Give the room a name first', 'error');
			return;
		}
		const result = await createArea(name, newRoomFloor);
		if (result.success) {
			showToast(`Room "${name}" created`, 'success');
			cancelCreateRoom();
		} else {
			showToast(`Couldn't create room: ${result.error ?? result.reason}`, 'error');
		}
	}

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

	/* ─────────────── device-level handlers ─────────────── */

	function startRenameDevice(deviceId: string, currentName: string | null) {
		deviceRenameBuffer[deviceId] =
			curationStore.current.devices[deviceId]?.rename ?? currentName ?? '';
	}

	async function commitRenameDevice(deviceId: string) {
		const value = (deviceRenameBuffer[deviceId] ?? '').trim();
		const ok = await renameDevice(deviceId, value || null);
		showToast(
			ok ? (value ? `Device renamed to "${value}"` : 'Device rename cleared') : 'Save failed',
			ok ? 'success' : 'error'
		);
		delete deviceRenameBuffer[deviceId];
	}

	function cancelRenameDevice(deviceId: string) {
		delete deviceRenameBuffer[deviceId];
	}

	async function toggleDeviceHidden(deviceId: string, currentlyHidden: boolean, displayName: string) {
		const next = !currentlyHidden;
		const ok = await hideDevice(deviceId, next);
		showToast(
			ok ? (next ? `${displayName} (device) hidden` : `${displayName} (device) visible`) : 'Save failed',
			ok ? 'success' : 'error'
		);
	}

	function isDeviceHidden(deviceId: string | null): boolean {
		return !!(deviceId && curationStore.current.devices[deviceId]?.hidden);
	}

	function deviceDisplayName(deviceId: string | null, hadName: string | null | undefined): string {
		if (!deviceId) return hadName ?? 'Unnamed device';
		const override = curationStore.current.devices[deviceId]?.rename;
		return override || hadName || 'Unnamed device';
	}

	/* ─────────────── move-picker handlers ─────────────── */

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

	/* ─────────────── device move-picker ─────────────── */
	// "Place a thing in a room." Setting a DEVICE's area_id in HA's
	// registry makes every area-less entity under it inherit the area
	// natively — broadsheet's resolveAreaId already has the
	// entity→device area fallback, so the device's entities migrate as
	// one. device_registry_updated re-projects within the debounce
	// window. Keyed by the device-group key (not device id) so it
	// matches expandedDevices etc.

	function toggleDeviceMovePicker(groupKey: string) {
		const next = new Set(deviceMovePickerOpen);
		if (next.has(groupKey)) next.delete(groupKey);
		else next.add(groupKey);
		deviceMovePickerOpen = next;
	}

	async function moveDevice(
		deviceId: string,
		deviceName: string,
		groupKey: string,
		targetAreaId: string | null
	) {
		const targetName =
			targetAreaId === null
				? '(no area)'
				: (movableAreas.find((a) => a.id === targetAreaId)?.name ?? targetAreaId);
		const result = await updateDeviceArea(deviceId, targetAreaId);
		if (result.success) {
			showToast(`Moved ${deviceName} → ${targetName} (entities follow)`, 'success');
			const next = new Set(deviceMovePickerOpen);
			next.delete(groupKey);
			deviceMovePickerOpen = next;
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

	/**
	 * Split entities for the Unsorted area into two cohorts:
	 *  - withDevice: real physical/integration-backed things that HA
	 *    knows about but aren't area-assigned. The user CAN place these
	 *    in rooms via the picker — that's the action that matters.
	 *  - withoutDevice: helpers (input_*), automations, scripts, scenes,
	 *    template sensors, groups, statistics. These are LEGITIMATELY
	 *    place-less. broadsheet wasn't going to surface them on editorial
	 *    pages anyway. Surfacing them in their own collapsed sub-group
	 *    avoids the user thinking they need to "fix" 300+ helper entities.
	 */
	function splitUnsorted(entities: DomainEntity[]): {
		withDevice: DomainEntity[];
		withoutDevice: DomainEntity[];
	} {
		const withDevice: DomainEntity[] = [];
		const withoutDevice: DomainEntity[] = [];
		for (const e of entities) {
			if (e.deviceId) withDevice.push(e);
			else withoutDevice.push(e);
		}
		return { withDevice, withoutDevice };
	}

	/** Sub-group expanded state for Unsorted's "Helpers + system" cohort. */
	let unsortedHelpersExpanded = $state<boolean>(false);

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
			case 'device-hidden':
				return {
					label: 'via device hide',
					tooltip:
						'You hid the parent device. All its entities are auto-hidden. Show the device to bring this back.'
				};
			default:
				return null;
		}
	}

	/* ─────────────── moment-sensor pickers ──────────────────────────
	 * Two pickers that drive the moment-headline clauses on `/`. Each
	 * has three states stored in `curation.momentSensors.<key>`:
	 *
	 *   undefined / null → auto-discover (fallback heuristic in
	 *                      momentSensors.ts picks the first match)
	 *   ''               → explicitly off (no clause renders)
	 *   '<entity_id>'    → pinned
	 *
	 * UI sentinel uses 'auto' for the first state since <select> can't
	 * distinguish a value of `null` from `undefined`. The change handler
	 * maps 'auto' → undefined when calling setMomentSensor.
	 */
	const indoorTempCandidates = $derived(
		listIndoorTempCandidates(discoveryStore.states).slice().sort((a, b) => a.localeCompare(b))
	);
	const rateCandidates = $derived(
		listElectricityRateCandidates(discoveryStore.states).slice().sort((a, b) => a.localeCompare(b))
	);
	const autoIndoorTempPick = $derived(
		resolveIndoorTempSensor(discoveryStore.states, undefined)
	);
	const autoRatePick = $derived(
		resolveElectricityRateSensor(discoveryStore.states, undefined)
	);
	const indoorTempCurrent = $derived(
		curationStore.current.momentSensors?.primaryIndoorTempSensorId ?? 'auto'
	);
	const rateCurrent = $derived(
		curationStore.current.momentSensors?.primaryElectricityRateSensorId ?? 'auto'
	);

	/* Humanise an entity into an editorial label.
	 *
	 * V3.2 dogfood: the raw `${name} — ${value} ${uom}` shape produced
	 * dumps like "Current Rate Electricity (22M0332453 1900034316579) —
	 * 0.250215 GBP/kWh" or "Hallway TRV — 17 °C" — accurate but ugly.
	 *
	 * Transforms:
	 *   - Strip parenthetical noise from the friendly name
	 *     (meter point IDs, technical suffixes)
	 *   - Strip generic " TRV" / " Sensor" trailers (their reading IS
	 *     the temperature, no extra word needed)
	 *   - GBP/kWh values → "25p/kWh" (multiply by 100, round)
	 *   - Temperature → "17°C" with at most 1 dp, no spurious space
	 *   - Other numerics → trim trailing zeros to 3 sig figs
	 */
	function humanizeEntityName(raw: string): string {
		return raw
			.replace(/\s*\([^)]*\)\s*/g, '') // strip "(22M...)" segments
			.replace(/\s+(?:TRV|Sensor)$/i, '') // strip noise suffixes
			.trim();
	}
	function humanizeValue(value: unknown, uom: string): string {
		if (value === '—' || value === '' || value == null) return '—';
		const str = String(value);
		if (str === '—' || str === '') return '—';
		const num = Number(str);
		if (!isFinite(num)) return `${str}${uom ? ` ${uom}` : ''}`;
		// Currency-per-energy: convert GBP/kWh → p/kWh
		if (/^GBP\/k?Wh$/i.test(uom)) {
			const pence = num * 100;
			return `${pence.toFixed(pence < 10 ? 1 : 0)}p/kWh`;
		}
		// Temperature: tight format, 1 dp max
		if (uom === '°C' || uom === '°F' || uom === 'K') {
			const rounded = Number.isInteger(num) ? num : Number(num.toFixed(1));
			return `${rounded}${uom}`;
		}
		// Generic numeric: trim trailing zeros, max 3 sig figs
		const trimmed = num.toPrecision(3).replace(/\.?0+$/, '');
		return `${trimmed}${uom ? ` ${uom}` : ''}`;
	}
	function entityLabel(id: string): string {
		const e = discovery.byEntityId(id);
		const rawName = e?.name ?? id.replace(/^sensor\./, '').replace(/_/g, ' ');
		const name = humanizeEntityName(rawName);
		const stateRecord = discoveryStore.states[id];
		const value: unknown = stateRecord?.state ?? '—';
		const uom = String(stateRecord?.attributes?.unit_of_measurement ?? '');
		return `${name} · ${humanizeValue(value, uom)}`;
	}

	async function pickMomentSensor(
		key: 'primaryIndoorTempSensorId' | 'primaryElectricityRateSensorId',
		value: string
	) {
		// '' = explicitly off; 'auto' = clear override; else = pin
		if (value === 'auto') {
			const ok = await setMomentSensor(key, undefined);
			if (ok) showToast('Moment sensor set to auto');
		} else if (value === '') {
			const ok = await setMomentSensor(key, '');
			if (ok) showToast('Clause turned off');
		} else {
			const ok = await setMomentSensor(key, value);
			if (ok) showToast('Moment sensor pinned');
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

	<div class="new-room">
		{#if creatingRoom}
			<div class="new-room-form">
				<input
					type="text"
					class="new-room-input"
					placeholder="Room name — e.g. Conservatory"
					aria-label="New room name"
					bind:value={newRoomName}
					bind:this={newRoomNameEl}
					onkeydown={(e) => {
						if (e.key === 'Enter') commitCreateRoom();
						if (e.key === 'Escape') cancelCreateRoom();
					}}
				/>
				{#if discoveryStore.floors.length > 0}
					<select class="new-room-floor" bind:value={newRoomFloor} aria-label="Floor">
						<option value={null}>No floor</option>
						{#each discoveryStore.floors as f (f.floor_id)}
							<option value={f.floor_id}>{f.name}</option>
						{/each}
					</select>
				{/if}
				<button class="action confirm" type="button" onclick={commitCreateRoom}>Create</button>
				<button class="action" type="button" onclick={cancelCreateRoom}>Cancel</button>
			</div>
			<p class="new-room-hint">
				Creates a real Home Assistant area — it appears here, on every page, and
				in HA itself. Place entities into it with the “Place in” / “Move…”
				pickers below.
			</p>
		{:else}
			<button class="new-room-trigger" type="button" onclick={openCreateRoom}>
				+ New room
			</button>
		{/if}
	</div>

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
						{#if entity.platform}
							<span class="state-sep" aria-hidden="true">·</span>
							<span class="entity-platform" title="Integration source in HA">{entity.platform}</span>
						{/if}
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

	<!--
		Device move-picker — "place a thing in a room". Mirrors the
		entity move-picker, but one click moves the whole device:
		updateDeviceArea writes the device's area_id to HA's registry,
		HA cascades it to every area-less entity under the device, and
		broadsheet re-projects on device_registry_updated. `dev` is the
		device record; `groupKey` keys the open/close set.
	-->
	{#snippet deviceMovePicker(dev: NonNullable<DomainEntity['device']>, groupKey: string)}
		<div class="move-picker device-move-picker">
			<span class="move-label">Place device in</span>
			<div class="move-options">
				{#each movableAreas as area (area.id)}
					<button
						type="button"
						class="move-option"
						class:current={dev.areaId === area.id}
						onclick={() => moveDevice(dev.id, deviceDisplayName(dev.id, dev.name), groupKey, area.id)}
					>
						{area.name}
					</button>
				{/each}
				{#if dev.areaId}
					<button
						type="button"
						class="move-option clear"
						onclick={() => moveDevice(dev.id, deviceDisplayName(dev.id, dev.name), groupKey, null)}
					>
						(no area)
					</button>
				{/if}
			</div>
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

						{#if isUnsorted}
							{@const split = splitUnsorted(visibleEntitiesIn(area))}
							{@const withDeviceGroups = groupByDevice(split.withDevice)}
							{@const withoutDeviceGroups = groupByDevice(split.withoutDevice)}

							<div class="unsorted-cohort">
								<div class="cohort-head">
									<h4 class="cohort-title">Devices needing placement</h4>
									<p class="cohort-tag">
										{split.withDevice.length} entities — these are physical things HA knows
										about but you haven't told HA which room. Use the "Place in" picker on
										each row to assign one (writes to HA's registry, not just to broadsheet).
									</p>
								</div>
								{#if withDeviceGroups.length === 0}
									<p class="empty">Nothing here. Tidy install.</p>
								{:else}
									{#each withDeviceGroups as group (group.key)}
										{#if group.device && group.entities.length > 1}
											{@const dev = group.device}
											{@const deviceExpanded = expandedDevices.has(group.key)}
											{@const dRenaming = deviceRenameBuffer[dev.id] !== undefined}
											{@const dDisplayName = deviceDisplayName(dev.id, dev.name)}
											<div class="device-group" class:device-expanded={deviceExpanded}>
												<div class="device-head-wrap">
													{#if dRenaming}
														<div class="device-rename">
															<span class="device-icon" aria-hidden="true">▣</span>
															<input
																type="text"
																class="device-rename-input"
																bind:value={deviceRenameBuffer[dev.id]}
																placeholder={dev.name ?? 'Unnamed device'}
																onkeydown={(e) => {
																	if (e.key === 'Enter') commitRenameDevice(dev.id);
																	if (e.key === 'Escape') cancelRenameDevice(dev.id);
																}}
															/>
														</div>
													{:else}
														<button class="device-head" type="button" onclick={() => toggleDeviceExpanded(group.key)} aria-expanded={deviceExpanded}>
															<span class="device-chev" aria-hidden="true">{deviceExpanded ? '−' : '+'}</span>
															<span class="device-icon" aria-hidden="true">▣</span>
															<div class="device-meta">
																<span class="device-name">{dDisplayName}</span>
																{#if dev.manufacturer || dev.model}
																	<span class="device-detail">{[dev.manufacturer, dev.model].filter(Boolean).join(' · ')}</span>
																{/if}
															</div>
															<span class="device-count">{group.entities.length} entities</span>
														</button>
													{/if}
													<div class="device-actions" role="group">
														{#if dRenaming}
															<button class="mini confirm" type="button" onclick={() => commitRenameDevice(dev.id)}>Save</button>
															<button class="mini" type="button" onclick={() => cancelRenameDevice(dev.id)}>Cancel</button>
														{:else}
															<button class="mini" type="button" onclick={() => startRenameDevice(dev.id, dev.name)}>Rename device</button>
															<button class="mini" type="button" onclick={() => toggleDeviceMovePicker(group.key)}>{deviceMovePickerOpen.has(group.key) ? 'Close move' : 'Move…'}</button>
															<button class="mini" type="button" onclick={() => toggleDeviceHidden(dev.id, false, dDisplayName)}>Hide device</button>
														{/if}
													</div>
												</div>
												{#if deviceMovePickerOpen.has(group.key) && !dRenaming}
													{@render deviceMovePicker(dev, group.key)}
												{/if}
												{#if deviceExpanded && !dRenaming}
													<div class="device-entities">
														{#each group.entities as entity (entity.id)}
															{@render entityRow(entity)}
														{/each}
													</div>
												{/if}
											</div>
										{:else}
											{#each group.entities as entity (entity.id)}
												{@render entityRow(entity)}
											{/each}
										{/if}
									{/each}
								{/if}
							</div>

							{#if split.withoutDevice.length > 0}
								<button class="unsorted-cohort-toggle" type="button" onclick={() => (unsortedHelpersExpanded = !unsortedHelpersExpanded)}>
									{unsortedHelpersExpanded ? '−' : '+'}
									{split.withoutDevice.length} helpers, automations & system
									<span class="hidden-detail">(no physical place — broadsheet doesn't render these on pages)</span>
								</button>
								{#if unsortedHelpersExpanded}
									<div class="helpers-block">
										{#each withoutDeviceGroups as group (group.key)}
											{#each group.entities as entity (entity.id)}
												{@render entityRow(entity)}
											{/each}
										{/each}
									</div>
								{/if}
							{/if}
						{:else}
						{#each visibleGroups as group (group.key)}
							{#if group.device && group.entities.length > 1}
								{@const dev = group.device}
								{@const deviceExpanded = expandedDevices.has(group.key)}
								{@const dHidden = false /* visible block: by definition not hidden */}
								{@const dRenaming = deviceRenameBuffer[dev.id] !== undefined}
								{@const dDisplayName = deviceDisplayName(dev.id, dev.name)}
								{@const dHasOverride = !!curationStore.current.devices[dev.id]?.rename}
								<!--
									Multi-entity device — collapsed by default. Header shows
									count + manufacturer + model so the user can scan; click
									reveals sub-entities. This is critical for devices like
									the XIAO Test ESP32 that produce 24 entities — without
									collapse, expanding an area becomes a wall of rows.

									Device-level Rename + Hide actions sit on the right of
									the header. Hide cascades to all sub-entities (they get
									autoHideReason='device-hidden' and disappear from this
									area's visible buckets).
								-->
								<div class="device-group" class:device-expanded={deviceExpanded} class:device-hidden-card={dHidden}>
									<div class="device-head-wrap">
										{#if dRenaming}
											<div class="device-rename">
												<span class="device-icon" aria-hidden="true">▣</span>
												<input
													type="text"
													class="device-rename-input"
													bind:value={deviceRenameBuffer[dev.id]}
													placeholder={dev.name ?? 'Unnamed device'}
													onkeydown={(e) => {
														if (e.key === 'Enter') commitRenameDevice(dev.id);
														if (e.key === 'Escape') cancelRenameDevice(dev.id);
													}}
												/>
											</div>
										{:else}
											<button
												class="device-head"
												type="button"
												onclick={() => toggleDeviceExpanded(group.key)}
												aria-expanded={deviceExpanded}
											>
												<span class="device-chev" aria-hidden="true">
													{deviceExpanded ? '−' : '+'}
												</span>
												<span class="device-icon" aria-hidden="true">▣</span>
												<div class="device-meta">
													<span class="device-name">{dDisplayName}</span>
													{#if dHasOverride && dev.name}
														<span class="device-was">was: {dev.name}</span>
													{/if}
													{#if dev.manufacturer || dev.model}
														<span class="device-detail">
															{[dev.manufacturer, dev.model].filter(Boolean).join(' · ')}
														</span>
													{/if}
												</div>
												<span class="device-count">{group.entities.length} entities</span>
											</button>
										{/if}
										<div class="device-actions" role="group">
											{#if dRenaming}
												<button class="mini confirm" type="button" onclick={() => commitRenameDevice(dev.id)}>Save</button>
												<button class="mini" type="button" onclick={() => cancelRenameDevice(dev.id)}>Cancel</button>
											{:else}
												<button class="mini" type="button" onclick={() => startRenameDevice(dev.id, dev.name)}>
													Rename device
												</button>
												<button class="mini" type="button" onclick={() => toggleDeviceMovePicker(group.key)}>
													{deviceMovePickerOpen.has(group.key) ? 'Close move' : 'Move…'}
												</button>
												<button class="mini" type="button" onclick={() => toggleDeviceHidden(dev.id, dHidden, dDisplayName)}>
													{dHidden ? 'Show device' : 'Hide device'}
												</button>
											{/if}
										</div>
									</div>
									{#if deviceMovePickerOpen.has(group.key) && !dRenaming}
										{@render deviceMovePicker(dev, group.key)}
									{/if}
									{#if deviceExpanded && !dRenaming}
										<div class="device-entities">
											{#each group.entities as entity (entity.id)}
												{@render entityRow(entity)}
											{/each}
										</div>
									{/if}
								</div>
							{:else}
								<!-- Single-entity device or no-device — render as standalone row -->
								{#each group.entities as entity (entity.id)}
									{@render entityRow(entity)}
								{/each}
							{/if}
						{/each}
						{/if}

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
											`${area.hiddenEntities.filter((e) => e.autoHideReason === 'integration').length} integration`,
										area.hiddenEntities.filter((e) => e.autoHideReason === 'device-hidden').length &&
											`${area.hiddenEntities.filter((e) => e.autoHideReason === 'device-hidden').length} via device-hide`
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
											{@const dev = group.device!}
											{@const deviceExpanded = expandedDevices.has(group.key)}
											{@const dHidden = isDeviceHidden(dev.id)}
											{@const dRenaming = deviceRenameBuffer[dev.id] !== undefined}
											{@const dDisplayName = deviceDisplayName(dev.id, dev.name)}
											<div class="device-group hidden-device" class:device-expanded={deviceExpanded} class:device-hidden-card={dHidden}>
												<div class="device-head-wrap">
													{#if dRenaming}
														<div class="device-rename">
															<span class="device-icon" aria-hidden="true">▣</span>
															<input
																type="text"
																class="device-rename-input"
																bind:value={deviceRenameBuffer[dev.id]}
																placeholder={dev.name ?? 'Unnamed device'}
																onkeydown={(e) => {
																	if (e.key === 'Enter') commitRenameDevice(dev.id);
																	if (e.key === 'Escape') cancelRenameDevice(dev.id);
																}}
															/>
														</div>
													{:else}
														<button
															class="device-head"
															type="button"
															onclick={() => toggleDeviceExpanded(group.key)}
															aria-expanded={deviceExpanded}
														>
															<span class="device-chev" aria-hidden="true">
																{deviceExpanded ? '−' : '+'}
															</span>
															<span class="device-icon" aria-hidden="true">▣</span>
															<div class="device-meta">
																<span class="device-name">{dDisplayName}</span>
																{#if dev.manufacturer || dev.model}
																	<span class="device-detail">
																		{[dev.manufacturer, dev.model].filter(Boolean).join(' · ')}
																	</span>
																{/if}
															</div>
															<span class="device-count">
																{group.entities.length} {dHidden ? 'hidden (whole device)' : 'hidden'}
															</span>
														</button>
													{/if}
													<div class="device-actions" role="group">
														{#if dRenaming}
															<button class="mini confirm" type="button" onclick={() => commitRenameDevice(dev.id)}>Save</button>
															<button class="mini" type="button" onclick={() => cancelRenameDevice(dev.id)}>Cancel</button>
														{:else}
															<button class="mini" type="button" onclick={() => startRenameDevice(dev.id, dev.name)}>
																Rename device
															</button>
															<button class="mini" type="button" onclick={() => toggleDeviceHidden(dev.id, dHidden, dDisplayName)}>
																{dHidden ? 'Show device' : 'Hide device'}
															</button>
														{/if}
													</div>
												</div>
												{#if deviceExpanded && !dRenaming}
													<div class="device-entities">
														{#each group.entities as entity (entity.id)}
															{@render entityRow(entity)}
														{/each}
													</div>
												{/if}
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

	<OutLine label="Moment sensors" />
	<p class="ms-intro">
		Two sensors that drive the headline on <strong>the moment</strong>.
		Both are auto-picked from what's discovered; pin them when you have
		multiple temp sensors or several electricity tariffs and the auto
		choice doesn't match what you'd write yourself.
	</p>
	<div class="ms-grid">
		<label class="ms-row">
			<span class="ms-name">Indoor temp</span>
			<span class="ms-hint">
				"Hallway 17°C." Defaults to a public-room temp.
			</span>
			<select
				class="ms-select"
				value={indoorTempCurrent}
				onchange={(e) =>
					pickMomentSensor(
						'primaryIndoorTempSensorId',
						(e.target as HTMLSelectElement).value
					)}
			>
				<option value="auto">
					Auto{autoIndoorTempPick ? ` — ${entityLabel(autoIndoorTempPick)}` : ' — none discovered'}
				</option>
				<option value="">Off (skip clause)</option>
				{#if indoorTempCandidates.length > 0}
					<optgroup label="Pin to a sensor">
						{#each indoorTempCandidates as id (id)}
							<option value={id}>{entityLabel(id)}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
		</label>

		<label class="ms-row">
			<span class="ms-name">Electricity rate</span>
			<span class="ms-hint">
				"Electricity cheap at 8p." Octopus + similar HACS sensors auto-detect.
			</span>
			<select
				class="ms-select"
				value={rateCurrent}
				onchange={(e) =>
					pickMomentSensor(
						'primaryElectricityRateSensorId',
						(e.target as HTMLSelectElement).value
					)}
			>
				<option value="auto">
					Auto{autoRatePick ? ` — ${entityLabel(autoRatePick)}` : ' — none discovered'}
				</option>
				<option value="">Off (skip clause)</option>
				{#if rateCandidates.length > 0}
					<optgroup label="Pin to a sensor">
						{#each rateCandidates as id (id)}
							<option value={id}>{entityLabel(id)}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
		</label>
	</div>
</PageShell>

<style>
	/* ── Moment-sensor pickers ──────────────────────────────────────── */
	.ms-intro {
		max-width: 60ch;
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
		margin: 0 0 var(--space-4);
	}

	.ms-intro strong {
		font-style: normal;
		color: var(--accent);
		font-weight: 500;
	}

	.ms-grid {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: 1fr;
		max-width: 720px;
		margin-bottom: var(--space-12);
	}

	@media (min-width: 720px) {
		.ms-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.ms-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.ms-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--accent);
	}

	.ms-hint {
		font-family: var(--font-caption);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}

	.ms-select {
		font-family: var(--font-mono);
		font-size: var(--text-body);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 40px;
		max-width: 100%;
	}

	.ms-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.new-room {
		margin-bottom: var(--space-4);
	}

	.new-room-trigger {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.new-room-trigger:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.new-room-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.new-room-input {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-input);
		flex: 1;
		min-width: 14rem;
	}

	.new-room-floor {
		font-family: var(--font-caption);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-input);
		min-height: 36px;
	}

	.new-room-hint {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: var(--space-2) 0 0;
		max-width: 64ch;
	}

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
		border-bottom: 1px solid transparent;
		width: 100%;
		text-align: left;
		color: inherit;
		transition: background var(--ease-quick), border-color var(--ease-quick);
	}

	.device-head:hover {
		background: rgba(192, 138, 74, 0.06);
	}

	.device-group.device-expanded .device-head {
		border-bottom-color: var(--rule);
	}

	.device-chev {
		font-family: var(--font-mono);
		font-size: 1.1rem;
		color: var(--fg-muted);
		flex: 0 0 1.2rem;
		text-align: center;
	}

	.device-group.device-expanded .device-chev,
	.device-head:hover .device-chev {
		color: var(--accent);
	}

	.device-head-wrap {
		display: flex;
		align-items: stretch;
	}

	.device-head-wrap .device-head {
		flex: 1;
		border: none;
	}

	.device-head-wrap .device-rename {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: rgba(255, 255, 255, 0.015);
	}

	.device-rename-input {
		flex: 1;
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-input);
	}

	.device-actions {
		display: flex;
		gap: var(--space-1);
		align-items: center;
		padding: 0 var(--space-3);
		background: rgba(255, 255, 255, 0.015);
		border-bottom: 1px solid transparent;
		flex: 0 0 auto;
	}

	.device-group.device-expanded .device-actions {
		border-bottom-color: var(--rule);
	}

	.device-was {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
	}

	.device-group.device-hidden-card {
		border-color: var(--state-alert);
		opacity: 0.85;
	}

	.device-group.device-hidden-card .device-name {
		color: var(--fg-dim);
		text-decoration: line-through;
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

	.entity-platform {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-style: italic;
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

	.unsorted-cohort {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.cohort-head {
		margin-bottom: var(--space-2);
	}

	.cohort-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		color: var(--accent);
		margin: 0 0 var(--space-1);
		font-weight: 400;
	}

	.cohort-tag {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: 0;
		max-width: 64ch;
	}

	.unsorted-cohort-toggle {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-3) var(--space-3);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
		transition: color var(--ease-quick), border-color var(--ease-quick);
		margin-top: var(--space-3);
	}

	.unsorted-cohort-toggle:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.helpers-block {
		display: flex;
		flex-direction: column;
		opacity: 0.85;
		padding: var(--space-2) 0;
	}
</style>
