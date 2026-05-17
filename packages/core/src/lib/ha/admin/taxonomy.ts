/**
 * Theme D — device-vs-plumbing taxonomy.
 *
 * /settings/devices originally counted everything HA's device_registry
 * returned, which for a typical install is hundreds of rows — most of
 * them plumbing (HACS, Sun, the weather integration's per-location
 * stub, Octopus Energy, etc.) rather than physical user-facing objects.
 * The dogfood report from V3 surfaced this as a meta-pattern: "is this
 * a USER-FACING physical object, or is it plumbing?".
 *
 * `classifyDevice()` returns 'user-facing' | 'plumbing' from a few
 * cheap heuristics in confidence order:
 *
 *   1. `entry_type === 'service'` — HA's own canonical marker
 *   2. Domain belongs to a known PLUMBING_DOMAINS list (HACS,
 *      Octopus Energy, etc.) — the long tail of integrations that
 *      surface as "devices" but aren't physical
 *   3. Manufacturer is 'Home Assistant' (template helpers, Sun, etc.)
 *   4. Else: user-facing
 *
 * `splitByTaxonomy()` partitions a device list into the two buckets
 * in one pass; `countUserFacing()` is the cheap version for status
 * lines that only need a count.
 *
 * Heuristic philosophy: false-positives (calling plumbing user-facing)
 * are MUCH cheaper than false-negatives (hiding a real device). When
 * in doubt the classifier sides with user-facing. The "show plumbing"
 * toggle on /settings/devices is the user's escape hatch for the
 * inevitable edge cases.
 */

import type { DeviceRecord } from './devices';
import type { ConfigEntry } from './integrations';

/**
 * Integration domains whose devices are almost always plumbing rather
 * than physical objects. Curated list — additions welcome but only
 * after confirming an integration ships ZERO actuable physical devices.
 * The bias is conservative: when in doubt, do NOT add to this list
 * (better to show a plumbing row than hide a real device).
 */
export const PLUMBING_DOMAINS: ReadonlySet<string> = new Set([
	// HA-shipped service-shaped integrations
	'sun',
	'hacs',
	'analytics_insights',
	'backup',
	'cloud',
	'system_health',
	'hassio', // Supervisor itself
	// Per-location service-shaped integrations
	'met', // Met.no weather
	'forecast_solar',
	// Common HACS energy / utility "integrations" that surface as devices
	'octopus_energy',
	'octopus_intelligent',
	'apexcharts_card', // HACS frontend cards register as devices in some versions
	'mini_graph_card',
	'card_mod',
	// Cloud-only services
	'google_translate',
	'openweathermap',
	'pollen'
]);

/** Manufacturers whose entries are virtually always plumbing. */
export const PLUMBING_MANUFACTURERS: ReadonlySet<string> = new Set([
	'Home Assistant',
	'Home Assistant Community Store'
]);

export type DeviceClass = 'user-facing' | 'plumbing';

/**
 * Classify a single device. Cheap — pure function over the device row
 * + the config_entries index. Called once per row per render, so
 * O(devices) per /settings/devices repaint.
 */
export function classifyDevice(
	device: DeviceRecord,
	entryById: ReadonlyMap<string, ConfigEntry>
): DeviceClass {
	// 1. HA's own canonical marker.
	if (device.entry_type === 'service') return 'plumbing';

	// 2. Domain belongs to the curated PLUMBING_DOMAINS list.
	const firstEntryId = device.config_entries[0];
	if (firstEntryId) {
		const entry = entryById.get(firstEntryId);
		if (entry && PLUMBING_DOMAINS.has(entry.domain)) return 'plumbing';
	}

	// 3. Manufacturer is HA itself.
	if (device.manufacturer && PLUMBING_MANUFACTURERS.has(device.manufacturer)) {
		return 'plumbing';
	}

	// 4. Default: user-facing.
	return 'user-facing';
}

/**
 * Partition a device list into the two taxonomy buckets. Single pass
 * over the input — both buckets returned. Useful for the page that
 * needs the count of both even when only one is rendered.
 */
export function splitByTaxonomy(
	devices: readonly DeviceRecord[],
	entryById: ReadonlyMap<string, ConfigEntry>
): { userFacing: DeviceRecord[]; plumbing: DeviceRecord[] } {
	const userFacing: DeviceRecord[] = [];
	const plumbing: DeviceRecord[] = [];
	for (const d of devices) {
		if (classifyDevice(d, entryById) === 'plumbing') plumbing.push(d);
		else userFacing.push(d);
	}
	return { userFacing, plumbing };
}

/**
 * Cheap count-only helper for status lines that don't need the full
 * partition. Equivalent to `splitByTaxonomy(...).userFacing.length`
 * but allocates no arrays.
 */
export function countUserFacing(
	devices: readonly DeviceRecord[],
	entryById: ReadonlyMap<string, ConfigEntry>
): number {
	let n = 0;
	for (const d of devices) {
		if (classifyDevice(d, entryById) === 'user-facing') n++;
	}
	return n;
}
