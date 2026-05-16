/**
 * HA device_registry WS wrapper — read + rename + area-assign + disable.
 *
 * Powers /settings/devices. The device registry is what binds
 * entities to their parent integration; we let the user rename
 * devices (broadsheet-side label), reassign them to a different
 * area, and disable/enable from one editorial surface.
 *
 * Discovery already subscribes to `device_registry_updated` so any
 * write here propagates to broadsheet's internal state within
 * ~500ms (the debounce window).
 *
 * Spec: docs/plans/plan-ha-settings-native-uis.md.
 */

import { audit } from '$lib/ha/audit';
import { getConnection } from '$lib/ha/client';
import type { ServiceCallResult } from '$lib/ha/types';

export interface DeviceRecord {
	id: string;
	name: string | null;
	name_by_user: string | null;
	manufacturer: string | null;
	model: string | null;
	area_id: string | null;
	config_entries: string[];
	disabled_by: string | null;
	via_device_id: string | null;
	identifiers: Array<[string, string]>;
	sw_version: string | null;
	hw_version: string | null;
}

export async function listDevices(): Promise<DeviceRecord[]> {
	const conn = getConnection();
	if (!conn) return [];
	try {
		const result = await conn.sendMessagePromise<DeviceRecord[]>({
			type: 'config/device_registry/list'
		});
		return result ?? [];
	} catch (err) {
		audit({
			kind: 'admin-write',
			note: 'listDevices failed',
			error: err instanceof Error ? err.message : String(err)
		});
		return [];
	}
}

export async function renameDevice(
	deviceId: string,
	newName: string
): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `rename device ${deviceId} → ${newName}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config/device_registry/update',
			device_id: deviceId,
			name_by_user: newName.trim() || null
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({ kind: 'admin-write', note: `rename device failed: ${deviceId}`, error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

export async function assignDeviceArea(
	deviceId: string,
	areaId: string | null
): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `assign device ${deviceId} → area ${areaId ?? '(none)'}`
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
		audit({ kind: 'admin-write', note: `assign area failed: ${deviceId}`, error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

export async function setDeviceDisabled(
	deviceId: string,
	disabled: boolean
): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `${disabled ? 'disable' : 'enable'} device ${deviceId}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config/device_registry/update',
			device_id: deviceId,
			disabled_by: disabled ? 'user' : null
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({
			kind: 'admin-write',
			note: `${disabled ? 'disable' : 'enable'} device failed: ${deviceId}`,
			error: msg
		});
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Display name for a device — user override first, HA's own name as
 * fallback. Returns "Untitled device" if both are null/empty.
 */
export function deviceDisplayName(d: DeviceRecord): string {
	return d.name_by_user?.trim() || d.name?.trim() || 'Untitled device';
}

/**
 * Group devices by integration (config_entry_id) for the editorial
 * "23 integrations · 147 devices" prose. Devices with multiple
 * config entries (multi-integration) land in EACH bucket; the UI
 * just shows them grouped under their primary.
 */
export function devicesByIntegration(
	devices: DeviceRecord[]
): Map<string, DeviceRecord[]> {
	const m = new Map<string, DeviceRecord[]>();
	for (const d of devices) {
		const primary = d.config_entries[0] ?? '__unknown__';
		if (!m.has(primary)) m.set(primary, []);
		m.get(primary)!.push(d);
	}
	return m;
}
