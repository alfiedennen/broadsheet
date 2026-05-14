/**
 * Registry mutations — write-side counterpart to discovery's read pulls.
 *
 * Where `actions.ts` wraps `call_service` (physical actuation),
 * this module wraps registry edits — moving an entity to a new
 * area, creating a new area, renaming an area in HA itself, etc.
 *
 * **Safety model**: registry writes are NOT gated by the readonly
 * flag because they're metadata, not hardware actuation. Setting an
 * entity's area_id can't unlock your front door; creating an empty
 * area actuates nothing at all. They're audit-logged under the
 * `registry-write` kind for observability and go through the same
 * `not-connected` check, but `?allow-writes=true` isn't required.
 *
 * If a future case warrants gating (e.g. bulk delete), add a
 * separate flag — don't overload the service-call readonly.
 */

import { audit } from './audit';
import { getConnection } from './client';
import type { ServiceCallResult } from './types';

/**
 * Move an entity to a different area in HA's registry.
 *
 * Pass `null` to clear the area assignment (entity returns to the
 * Unsorted bucket).
 *
 * Discovery's `entity_registry_updated` subscription picks the
 * change up within ~500ms (debounce window), so the entity migrates
 * to its new area in broadsheet automatically.
 */
export async function updateEntityArea(
	entityId: string,
	areaId: string | null
): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		audit({
			kind: 'registry-write',
			note: `updateEntityArea(${entityId}): no connection`,
			error: 'no active HA connection'
		});
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}

	audit({
		kind: 'registry-write',
		note: `updateEntityArea: ${entityId} → ${areaId ?? '(no area)'}`
	});

	try {
		await conn.sendMessagePromise({
			type: 'config/entity_registry/update',
			entity_id: entityId,
			area_id: areaId
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({
			kind: 'registry-write',
			note: `updateEntityArea: ${entityId} → ${areaId ?? '(no area)'} FAILED`,
			error: msg
		});
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Move a whole DEVICE to a different area in HA's registry.
 *
 * This is the "place a thing in a room" primitive. HA cascades it
 * natively — every entity under the device that doesn't carry its own
 * explicit `area_id` inherits the device's area. broadsheet's
 * `resolveAreaId` already does the `entity.area_id → device.area_id`
 * fallback, so the device's entities migrate as one.
 *
 * Pass `null` to clear the device's area (its area-less entities
 * return to Unsorted).
 *
 * `device_registry_updated` is subscribed in discovery/registries.ts,
 * so the change re-projects within the debounce window (~500ms).
 *
 * Same safety model as `updateEntityArea` — registry metadata, not
 * hardware actuation; audit-logged, not readonly-gated.
 */
export async function updateDeviceArea(
	deviceId: string,
	areaId: string | null
): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		audit({
			kind: 'registry-write',
			note: `updateDeviceArea(${deviceId}): no connection`,
			error: 'no active HA connection'
		});
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}

	audit({
		kind: 'registry-write',
		note: `updateDeviceArea: ${deviceId} → ${areaId ?? '(no area)'}`
	});

	try {
		await conn.sendMessagePromise({
			type: 'config/device_registry/update',
			device_id: deviceId,
			area_id: areaId
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({
			kind: 'registry-write',
			note: `updateDeviceArea: ${deviceId} → ${areaId ?? '(no area)'} FAILED`,
			error: msg
		});
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Rename an area in HA's registry. Different from broadsheet's
 * curation rename (which only affects broadsheet's display) —
 * this writes to HA itself and is visible to every HA frontend.
 *
 * Currently UNUSED in v0.1 (curation rename is the right scope for
 * editorial display) but here for completeness — power users can
 * call it via the dev console if they really want HA-level renames.
 */
export async function updateAreaName(areaId: string, name: string): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'registry-write',
		note: `updateAreaName: ${areaId} → ${name}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config/area_registry/update',
			area_id: areaId,
			name
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Create a new area in HA's registry — the "+ New room" affordance on
 * /settings/house.
 *
 * A created area is a *real* HA area (not a broadsheet-local construct).
 * It flows back through discovery's `area_registry_updated` subscription
 * and appears everywhere — every broadsheet page, and HA itself — so
 * there's no manual insert on the caller side: create, toast, the row
 * appears within the debounce window (~500ms).
 *
 * Same safety model as the other mutations here: audit-logged,
 * `not-connected`-checked, but NOT readonly-gated. An empty area
 * actuates nothing — it's strictly safer than `updateEntityArea`, which
 * is already ungated; gating create while move stays open would be
 * backwards.
 *
 * Returns the new `area_id` on success (HA derives it from the name).
 */
export async function createArea(
	name: string,
	floorId?: string | null
): Promise<ServiceCallResult & { areaId?: string }> {
	const conn = getConnection();
	if (!conn) {
		audit({
			kind: 'registry-write',
			note: `createArea("${name}"): no connection`,
			error: 'no active HA connection'
		});
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}

	audit({
		kind: 'registry-write',
		note: `createArea: "${name}"${floorId ? ` on floor ${floorId}` : ''}`
	});

	try {
		const message: { type: string; name: string; floor_id?: string } = {
			type: 'config/area_registry/create',
			name
		};
		if (floorId) message.floor_id = floorId;
		const created = (await conn.sendMessagePromise(message)) as { area_id?: string };
		return { success: true, areaId: created?.area_id };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({
			kind: 'registry-write',
			note: `createArea: "${name}" FAILED`,
			error: msg
		});
		return { success: false, reason: 'ha-error', error: msg };
	}
}
