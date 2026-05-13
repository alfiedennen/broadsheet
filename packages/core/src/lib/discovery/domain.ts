/**
 * Layer 2 — domain projection.
 *
 * Pure functions that take Layer 1 (raw HA registries + state) and
 * produce broadsheet-shaped Areas, Persons, Floors. Everything pages
 * consume comes from here.
 *
 * Key rules (per DISCOVERY-CONTRACT.md):
 *  - Entity → Area: entity.area_id wins, falls back to device.area_id
 *  - Naming: respect has_entity_name composition rules
 *  - Filtering: skip disabled / config / diagnostic; default-hide
 *    hidden_by !== null (curation can un-hide in M4)
 *  - Unsorted bucket: synthetic Area for entities with no resolvable
 *    area — honest escape hatch, surfaced in Settings (M4)
 *
 * Types here are exported for plugin authors (RENDERER-CONTRACT.md).
 */

import type {
	Area as RawArea,
	Device as RawDevice,
	Entity as RawEntity,
	Floor as RawFloor,
	Label as RawLabel,
	Person as RawPerson,
	State
} from '$lib/ha/types';
import {
	isLightingSwitch,
	isTV,
	isDoorOrWindowContact,
	isHealthConnect,
	isAmbientRoomSensor,
	pickBestPresenceSensor,
	rankPresenceSensors,
	detectPersonDeviceClass
} from './heuristics';
import type { Curation } from '$lib/curation/types';

/* ─────────────── Layer 2 types ─────────────── */

export interface DomainEntity {
	id: string; // entity_id
	name: string; // composed display name (post curation in M4)
	domain: string; // 'light', 'climate', 'lock', ...
	state: State | null;
	deviceId: string | null;
	areaId: string | null; // resolved area_id (entity > device fallback)
	labels: string[]; // label_ids carried from registry
	hidden: boolean; // hidden_by !== null OR future-curation override
	disabled: boolean; // disabled_by !== null
	entityCategory: 'config' | 'diagnostic' | null;
	icon: string | null;
	deviceClass: string | null;
}

export interface DomainArea {
	id: string; // area_id
	name: string;
	icon: string | null;
	picture: string | null;
	floorId: string | null;
	labels: string[];

	// Pre-bucketed entities (visible only — hidden/disabled excluded
	// unless un-hidden via M4 curation)
	lights: DomainEntity[]; // domain=light + lighting switches
	switches: DomainEntity[]; // domain=switch (non-lighting)
	climates: DomainEntity[];
	locks: DomainEntity[];
	contacts: DomainEntity[]; // door / window binary_sensors
	cameras: DomainEntity[];
	media: DomainEntity[]; // media_player (non-TV)
	tvs: DomainEntity[]; // media_player (TV class)
	remotes: DomainEntity[];
	sensors: DomainEntity[]; // ambient sensors (temp/humidity/lux/etc)
	scenes: DomainEntity[];
	otherEntities: DomainEntity[]; // anything we couldn't bucket

	// Computed flags — drive page-level "show this area?" filtering
	hasLighting: boolean;
	hasClimate: boolean;
	hasLock: boolean;
	hasMedia: boolean;
	hasCamera: boolean;
	hasSensors: boolean;

	// Total count of visible entities in this area (any bucket)
	entityCount: number;
}

export interface DomainFloor {
	id: string;
	name: string;
	level: number | null;
	icon: string | null;
	areas: DomainArea[];
}

export interface DomainPerson {
	id: string; // person.X entity_id
	name: string;
	picture: string | null;
	deviceTrackers: string[];
	deviceClass: 'android' | 'ios' | 'unknown';
	suggestedPresenceSensor: string | null;
	rankedPresenceSensors: ReturnType<typeof rankPresenceSensors>;
}

/* ─────────────── projection ─────────────── */

/**
 * Project Layer 1 raw registries + state into Layer 2 domain shapes.
 *
 * Pure function: same inputs → same outputs. M4 curation overrides
 * are applied as a separate step in src/lib/discovery/index.ts via
 * derived projections.
 */
export function projectDomain(input: {
	floors: RawFloor[];
	areas: RawArea[];
	devices: RawDevice[];
	entities: RawEntity[];
	labels: RawLabel[];
	persons: RawPerson[];
	states: Record<string, State>;
	/** Layer 3 — optional. When undefined, projection runs without overrides. */
	curation?: Curation;
}): {
	floors: DomainFloor[];
	areas: DomainArea[];
	persons: DomainPerson[];
	unsortedAreaId: string;
} {
	const UNSORTED_ID = '__unsorted__';
	const deviceById = new Map(input.devices.map((d) => [d.id, d]));
	const cur = input.curation;

	// Build a per-entity name + area resolution + visibility map.
	// Curation: respect entity rename, hidden, unhide overrides; respect
	// pagePins (entities forced to a specific page rather than living in
	// their natural area bucket).
	const composed = input.entities.map((e) => {
		const device = e.device_id ? (deviceById.get(e.device_id) ?? null) : null;
		// Entity rename: curation override wins over composed name
		const baseName = composeEntityName(e, device, input.states[e.entity_id]);
		const entityOverride = cur?.entities[e.entity_id];
		const name = entityOverride?.rename || baseName;
		const areaId = resolveAreaId(e, device);
		const visibility = visibilityFor(e, entityOverride);
		return { entity: e, device, name, areaId, visibility };
	});

	// Helper: build a DomainEntity from a composed record
	const toDomain = (rec: (typeof composed)[number]): DomainEntity => {
		const { entity: e, device, name, areaId } = rec;
		return {
			id: e.entity_id,
			name,
			domain: e.entity_id.split('.')[0],
			state: input.states[e.entity_id] ?? null,
			deviceId: e.device_id,
			areaId,
			labels: e.labels ?? [],
			hidden: e.hidden_by !== null,
			disabled: e.disabled_by !== null,
			entityCategory: e.entity_category,
			icon: e.icon ?? e.original_icon,
			deviceClass: e.device_class
		};
	};

	// Build the area buckets. Visible entities only (hidden/disabled/skipped
	// excluded — Settings UI in M4 will offer the view-all view).
	const visibleByArea = new Map<string, (typeof composed)[number][]>();
	for (const rec of composed) {
		if (rec.visibility !== 'show') continue;
		const key = rec.areaId ?? UNSORTED_ID;
		if (!visibleByArea.has(key)) visibleByArea.set(key, []);
		visibleByArea.get(key)!.push(rec);
	}

	// Build DomainArea objects — one per HA area (skipping curation-hidden
	// areas), plus the synthetic Unsorted bucket if anything landed there.
	// Apply curation rename + icon override at this point.
	const realAreas: DomainArea[] = input.areas
		.filter((a) => !cur?.areas[a.area_id]?.hidden)
		.map((a) => {
			const recs = visibleByArea.get(a.area_id) ?? [];
			const override = cur?.areas[a.area_id];
			const decorated: RawArea = {
				...a,
				name: override?.rename || a.name,
				icon: override?.iconOverride !== undefined ? override.iconOverride : a.icon
			};
			return buildArea(decorated, recs, toDomain, input.states, deviceById);
		});

	const unsortedRecs = visibleByArea.get(UNSORTED_ID) ?? [];
	if (unsortedRecs.length > 0) {
		realAreas.push(
			buildArea(
				{
					area_id: UNSORTED_ID,
					name: 'Unsorted',
					floor_id: null,
					icon: 'mdi:help-rhombus-outline',
					picture: null,
					aliases: [],
					labels: []
				},
				unsortedRecs,
				toDomain,
				input.states,
				deviceById
			)
		);
	}

	// Floors → grouped areas
	const areasByFloor = new Map<string | null, DomainArea[]>();
	for (const a of realAreas) {
		const key = a.floorId;
		if (!areasByFloor.has(key)) areasByFloor.set(key, []);
		areasByFloor.get(key)!.push(a);
	}

	const floors: DomainFloor[] = input.floors
		.map((f) => ({
			id: f.floor_id,
			name: f.name,
			level: f.level,
			icon: f.icon,
			areas: (areasByFloor.get(f.floor_id) ?? []).sort(byName)
		}))
		.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

	// Areas without a floor → synthetic "Unassigned" floor (only if needed)
	const unassignedAreas = areasByFloor.get(null) ?? [];
	if (unassignedAreas.length > 0 && floors.length > 0) {
		floors.push({
			id: '__unassigned__',
			name: 'Unassigned',
			level: 99,
			icon: 'mdi:floor-plan',
			areas: unassignedAreas.sort(byName)
		});
	} else if (floors.length === 0) {
		// No floors configured at all — single synthetic floor with everything
		floors.push({
			id: '__unassigned__',
			name: 'All',
			level: 0,
			icon: 'mdi:home-outline',
			areas: realAreas.sort(byName)
		});
	}

	// Persons
	const persons: DomainPerson[] = input.persons.map((p) => {
		const ranked = rankPresenceSensors(p, input.entities);
		return {
			id: p.entity_id,
			name: p.name,
			picture: p.picture,
			deviceTrackers: p.device_trackers ?? [],
			deviceClass: detectPersonDeviceClass(p, input.entities),
			suggestedPresenceSensor: pickBestPresenceSensor(ranked),
			rankedPresenceSensors: ranked
		};
	});

	return {
		floors,
		areas: realAreas.sort(byName),
		persons,
		unsortedAreaId: UNSORTED_ID
	};
}

/* ─────────────── helpers ─────────────── */

/**
 * Compose an entity's display name following HA's has_entity_name
 * conventions. NEVER trust state.attributes.friendly_name for layout
 * decisions — translations swap it.
 */
export function composeEntityName(
	entity: RawEntity,
	device: RawDevice | null,
	state: State | null | undefined
): string {
	if (entity.has_entity_name) {
		const deviceName = device?.name_by_user ?? device?.name ?? '';
		if (entity.name === null || entity.name === '') {
			// Entity IS the device's main feature
			return deviceName || prettifyEntityId(entity.entity_id);
		}
		return deviceName ? `${deviceName} ${entity.name}` : entity.name;
	}

	// Legacy path
	if (entity.name) return entity.name;
	if (entity.original_name) return entity.original_name;
	const friendly = (state?.attributes?.friendly_name as string | undefined) ?? '';
	if (friendly) return friendly;
	return prettifyEntityId(entity.entity_id);
}

/**
 * Resolve an entity's effective area_id following the two-path rule:
 * entity.area_id wins; falls back to device.area_id; null if neither.
 */
export function resolveAreaId(entity: RawEntity, device: RawDevice | null): string | null {
	if (entity.area_id) return entity.area_id;
	if (device?.area_id) return device.area_id;
	return null;
}

/**
 * Visibility for an entity:
 *  - 'skipped': disabled OR config/diagnostic — never shown anywhere
 *  - 'hidden': hidden_by !== null OR user curation hide
 *  - 'show': default
 *
 * Curation `unhide: true` overrides HA's hidden_by.
 * Curation `hidden: true` user-hides a normally-visible entity.
 */
function visibilityFor(
	entity: RawEntity,
	override?: { hidden?: boolean; unhide?: boolean }
): 'show' | 'hidden' | 'skipped' {
	if (entity.disabled_by !== null) return 'skipped';
	if (entity.entity_category === 'config') return 'skipped';
	if (entity.entity_category === 'diagnostic') return 'skipped';

	// User-hide always wins over default-show
	if (override?.hidden) return 'hidden';

	if (entity.hidden_by !== null) {
		// HA's integration/user wants this hidden — but curation can
		// explicitly un-hide
		if (override?.unhide) return 'show';
		return 'hidden';
	}

	return 'show';
}

/**
 * Turn `light.0xa4c138...` into `Light 0xa4c138…`. Falls back when
 * we have no friendly name to display.
 */
export function prettifyEntityId(entityId: string): string {
	const [domain, rest] = entityId.split('.');
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	if (rest.length > 16 && /^0x[0-9a-f]+$/i.test(rest)) {
		return `${cap(domain)} ${rest.slice(0, 8)}…`;
	}
	return `${cap(domain)} ${rest.replace(/_/g, ' ')}`;
}

function byName(a: { name: string }, b: { name: string }): number {
	return a.name.localeCompare(b.name);
}

/**
 * Build a single DomainArea from a raw HA area + its visible entities.
 * Bucketing applies the heuristics (lighting-switches, TVs, contacts).
 */
/** Shape produced by the composed-record builder in projectDomain. */
type ComposedRec = {
	entity: RawEntity;
	device: RawDevice | null;
	name: string;
	areaId: string | null;
	visibility: 'show' | 'hidden' | 'skipped';
};

function buildArea(
	raw: RawArea,
	recs: ComposedRec[],
	toDomain: (r: ComposedRec) => DomainEntity,
	states: Record<string, State>,
	_deviceById: Map<string, RawDevice>
): DomainArea {
	const lights: DomainEntity[] = [];
	const switches: DomainEntity[] = [];
	const climates: DomainEntity[] = [];
	const locks: DomainEntity[] = [];
	const contacts: DomainEntity[] = [];
	const cameras: DomainEntity[] = [];
	const media: DomainEntity[] = [];
	const tvs: DomainEntity[] = [];
	const remotes: DomainEntity[] = [];
	const sensors: DomainEntity[] = [];
	const scenes: DomainEntity[] = [];
	const otherEntities: DomainEntity[] = [];

	for (const rec of recs) {
		const e = rec.entity;
		const dom = toDomain(rec);
		const state = states[e.entity_id] ?? null;
		const id = e.entity_id;

		if (id.startsWith('light.')) {
			lights.push(dom);
		} else if (id.startsWith('switch.')) {
			if (isLightingSwitch(e, rec.device, rec.name)) lights.push(dom);
			else switches.push(dom);
		} else if (id.startsWith('climate.')) {
			climates.push(dom);
		} else if (id.startsWith('lock.')) {
			locks.push(dom);
		} else if (id.startsWith('binary_sensor.') && isDoorOrWindowContact(e, state)) {
			contacts.push(dom);
		} else if (id.startsWith('camera.')) {
			cameras.push(dom);
		} else if (id.startsWith('media_player.')) {
			if (isTV(e, state, rec.name)) tvs.push(dom);
			else media.push(dom);
		} else if (id.startsWith('remote.')) {
			remotes.push(dom);
		} else if (
			(id.startsWith('sensor.') || id.startsWith('binary_sensor.')) &&
			isAmbientRoomSensor(e, state)
		) {
			sensors.push(dom);
		} else if (id.startsWith('scene.')) {
			scenes.push(dom);
		} else if (isHealthConnect(e)) {
			// Health-Connect sensors land on /body — also keep accessible by area
			sensors.push(dom);
		} else {
			otherEntities.push(dom);
		}
	}

	const sortByName = (arr: DomainEntity[]) => arr.sort((a, b) => a.name.localeCompare(b.name));

	return {
		id: raw.area_id,
		name: raw.name,
		icon: raw.icon,
		picture: raw.picture,
		floorId: raw.floor_id,
		labels: raw.labels ?? [],
		lights: sortByName(lights),
		switches: sortByName(switches),
		climates: sortByName(climates),
		locks: sortByName(locks),
		contacts: sortByName(contacts),
		cameras: sortByName(cameras),
		media: sortByName(media),
		tvs: sortByName(tvs),
		remotes: sortByName(remotes),
		sensors: sortByName(sensors),
		scenes: sortByName(scenes),
		otherEntities: sortByName(otherEntities),
		hasLighting: lights.length > 0,
		hasClimate: climates.length > 0,
		hasLock: locks.length > 0,
		hasMedia: media.length > 0 || tvs.length > 0,
		hasCamera: cameras.length > 0,
		hasSensors: sensors.length > 0,
		entityCount:
			lights.length +
			switches.length +
			climates.length +
			locks.length +
			contacts.length +
			cameras.length +
			media.length +
			tvs.length +
			remotes.length +
			sensors.length +
			scenes.length +
			otherEntities.length
	};
}
