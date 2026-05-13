/**
 * Heuristics for inferring intent from raw HA data.
 *
 * All heuristics produce *suggestions* — Layer 3 (curation, M4)
 * lets users override any of them via the Settings UI. The point
 * here is "do something sensible at first paint with no
 * configuration."
 *
 * Spec: ../../../docs/DISCOVERY-CONTRACT.md § "Heuristics"
 */

import type { Entity, Device, Person, State } from '$lib/ha/types';

/* ─────────────── lighting switches ─────────────── */

/**
 * Some `switch.*` entities physically control lights (smart plugs
 * powering lamps). These should appear on `/lights`, not `/wall` or
 * `/heat`. Heuristic: name + device_class + (eventually) user pin.
 *
 * Returns true if the switch should be treated as lighting.
 *
 * @param composedName the entity's composed display name
 *                     (after has_entity_name composition rules)
 */
export function isLightingSwitch(
	entity: Entity,
	device: Device | null,
	composedName: string
): boolean {
	if (!entity.entity_id.startsWith('switch.')) return false;

	// Strong signal: device class
	if (entity.device_class === 'outlet') {
		const lower = composedName.toLowerCase();
		if (/\b(lamp|lights?|sconce|chandelier|pendant)\b/.test(lower)) return true;
	}

	// Name-based — only fire when the name explicitly says lighting
	const lower = composedName.toLowerCase();
	if (/\b(lamp|lights?|sconce|chandelier|pendant)\b/.test(lower)) return true;

	// Device model hints (Hue plugs, smart-bulb adapters)
	const model = device?.model?.toLowerCase() ?? '';
	if (/(bulb adapter|smart lamp)/.test(model)) return true;

	return false;
}

/* ─────────────── TV detection ─────────────── */

/**
 * Pick the right entities for `/tv`. Looks for media_player entities
 * whose state.attributes.device_class is 'tv', or whose name says so.
 */
export function isTV(entity: Entity, state: State | null, composedName: string): boolean {
	if (!entity.entity_id.startsWith('media_player.')) return false;

	const stateDc = state?.attributes?.device_class as string | undefined;
	if (stateDc === 'tv') return true;
	if (/\b(tv|television)\b/i.test(composedName)) return true;

	return false;
}

/* ─────────────── Door / window contacts ─────────────── */

/**
 * binary_sensor.* with device_class door / window / opening — these
 * pair with `lock.*` entities on the `/door` page. Some don't have
 * an explicit device_class set, so we also pattern-match on entity_id
 * suffix.
 */
export function isDoorOrWindowContact(entity: Entity, state: State | null): boolean {
	if (!entity.entity_id.startsWith('binary_sensor.')) return false;

	const stateDc = state?.attributes?.device_class as string | undefined;
	const dc = stateDc ?? entity.device_class;
	if (dc === 'door' || dc === 'window' || dc === 'opening') return true;

	const id = entity.entity_id;
	if (/_door$|_window$/.test(id)) return true;

	return false;
}

/* ─────────────── Health Connect (Pixel) sensors ─────────────── */

/**
 * Pattern-match Pixel-via-Health-Connect sensors that should land on
 * the `/body` page. Apple Health bridge patterns will be added in v0.2.
 */
const HEALTH_CONNECT_PATTERNS = [
	/^sensor\..*(?:pixel|wear).*_(?:sleep|heart_rate|hrv|heart_rate_variability|oxygen_saturation|body_temperature|respiratory_rate|steps|calories)/i
];

export function isHealthConnect(entity: Entity): boolean {
	return HEALTH_CONNECT_PATTERNS.some((p) => p.test(entity.entity_id));
}

/* ─────────────── Camera pairing (lock + camera) ─────────────── */

/**
 * For each lock, find a paired camera. The pairing is heuristic:
 * if both are in the same area AND there's a single camera in
 * that area, pair them.
 *
 * Returns the entity_id of the paired camera, or null.
 */
export function findPairedCamera(
	lockEntity: Entity,
	allEntities: Entity[],
	resolveArea: (e: Entity) => string | null
): string | null {
	const lockArea = resolveArea(lockEntity);
	if (!lockArea) return null;

	const camerasInSameArea = allEntities.filter(
		(e) => e.entity_id.startsWith('camera.') && resolveArea(e) === lockArea
	);

	if (camerasInSameArea.length === 1) return camerasInSameArea[0].entity_id;

	// Name overlap fallback: lock name "front_door" → camera with "front" in name
	const lockBase = lockEntity.entity_id.replace(/^lock\./, '').replace(/_lock$/, '');
	const byName = camerasInSameArea.find((c) => c.entity_id.includes(lockBase));
	return byName?.entity_id ?? null;
}

/* ─────────────── Presence sensor ranking ─────────────── */

/**
 * Per person, rank candidate presence sensors. Top non-warning
 * candidate gets the `★ best` badge in /settings/people (M4).
 *
 * Tiers (lower = better):
 *  1. server-side committed_room sensor (post-fusion, most reliable)
 *  2. BLE device trackers (in-house, IRK-resolved or named *_ble)
 *  3. GPS device trackers (least reliable, iOS suspends)
 *  4. person.X aggregation (can lie if any tracker stuck)
 */
export interface RankedSensor {
	entityId: string;
	tier: 1 | 2 | 3 | 4;
	badge: 'best' | 'ble' | 'gps' | 'aggregate';
	reason: string;
	warning: boolean;
}

export function rankPresenceSensors(person: Person, allEntities: Entity[]): RankedSensor[] {
	const out: RankedSensor[] = [];
	// Defensive: if a future API change drops entity_id, skip rather than crash
	if (!person.entity_id) return out;
	const personSlug = person.entity_id.replace(/^person\./, '');

	// Tier 1: server-side committed_room sensor.
	// Try the full slug first (sensor.alfie_dennen_committed_room), then
	// fall back to first-name only (sensor.alfie_committed_room) — many
	// installs name their fusion sensors with the short form.
	const candidates = [`sensor.${personSlug}_committed_room`];
	const firstName = personSlug.split('_')[0];
	if (firstName !== personSlug) {
		candidates.push(`sensor.${firstName}_committed_room`);
	}
	const found = candidates.find((id) => allEntities.some((e) => e.entity_id === id));
	if (found) {
		out.push({
			entityId: found,
			tier: 1,
			badge: 'best',
			reason: 'server-side fusion (committed_room sensor)',
			warning: false
		});
	}

	// Tier 2: BLE trackers
	for (const trackerId of person.device_trackers ?? []) {
		if (/_ble$|_private_ble$|_bermuda_tracker$/i.test(trackerId)) {
			const e = allEntities.find((x) => x.entity_id === trackerId);
			if (e) {
				out.push({
					entityId: trackerId,
					tier: 2,
					badge: 'ble',
					reason: 'BLE in-house tracker',
					warning: false
				});
			}
		}
	}

	// Tier 3: GPS / mobile_app trackers
	for (const trackerId of person.device_trackers ?? []) {
		if (!/_ble$|_private_ble$|_bermuda_tracker$/i.test(trackerId)) {
			const e = allEntities.find((x) => x.entity_id === trackerId);
			if (e) {
				const isIos = e.platform === 'mobile_app' && /iphone|ipad/i.test(trackerId);
				out.push({
					entityId: trackerId,
					tier: 3,
					badge: 'gps',
					reason: isIos
						? 'iOS device — Companion App can suspend GPS, may go stale'
						: 'GPS / Companion App location',
					warning: isIos
				});
			}
		}
	}

	// Tier 4: person aggregation (always last, always warned)
	out.push({
		entityId: person.entity_id,
		tier: 4,
		badge: 'aggregate',
		reason: 'OR-aggregation of all device trackers — lies if any stuck',
		warning: true
	});

	return out.sort((a, b) => a.tier - b.tier);
}

/**
 * Of the ranked sensors, pick the best non-warning candidate as the
 * default. If all candidates are warnings (e.g. iOS-only household),
 * pick the lowest-tier warning anyway.
 */
export function pickBestPresenceSensor(ranked: RankedSensor[]): string | null {
	const nonWarning = ranked.find((r) => !r.warning);
	if (nonWarning) return nonWarning.entityId;
	return ranked[0]?.entityId ?? null;
}

/**
 * Detect device class from a person's tracker set — informs UI
 * affordances ("iOS — be aware of GPS suspension").
 */
export function detectPersonDeviceClass(
	person: Person,
	allEntities: Entity[]
): 'android' | 'ios' | 'unknown' {
	for (const trackerId of person.device_trackers ?? []) {
		const e = allEntities.find((x) => x.entity_id === trackerId);
		if (!e) continue;
		if (/iphone|ipad/i.test(trackerId)) return 'ios';
		if (/pixel|samsung|android/i.test(trackerId)) return 'android';
	}
	return 'unknown';
}

/* ─────────────── Sensor categorisation ─────────────── */

/**
 * Filter sensors that should appear on a default room view (temp,
 * humidity, lux, presence, motion). Skips utility sensors, system
 * sensors, energy meters, etc.
 */
export function isAmbientRoomSensor(entity: Entity, state: State | null): boolean {
	if (!entity.entity_id.startsWith('sensor.') && !entity.entity_id.startsWith('binary_sensor.'))
		return false;

	// state.attributes is Record<string, unknown>; cast device_class
	// explicitly because the runtime value is always string-or-undefined
	const stateDc = state?.attributes?.device_class as string | undefined;
	const dc = stateDc ?? entity.device_class;
	if (!dc) return false;

	const ambient = new Set<string>([
		'temperature',
		'humidity',
		'illuminance',
		'motion',
		'occupancy',
		'presence',
		'pressure',
		'aqi',
		'pm25',
		'co2'
	]);
	return ambient.has(dc);
}
