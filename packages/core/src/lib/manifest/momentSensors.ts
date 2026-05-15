/**
 * Moment-view manifest clause sources — indoor temp + electricity rate.
 *
 * Each clause has two layers:
 *   1. Curation pick (Layer 3) — explicit sensor id from
 *      `momentSensors.primaryIndoorTempSensorId` / `...ElectricityRateSensorId`
 *   2. Auto-discovery fallback (Layer 2) — heuristic against the
 *      states map. Modest patterns chosen to match the majority of
 *      installs without curation; users with unusual setups pin via
 *      /settings/house.
 *
 * Heuristics are intentionally conservative — if NOTHING matches, the
 * clause is just omitted from the manifest. That's the editorial
 * register: no fake clauses, no "—" placeholders in prose.
 *
 * Output of each clause-composer is `string | null`:
 *   - string ("Hallway 17°C.") — emit
 *   - null — skip silently
 */

import type { State } from '$lib/ha/types';

export interface MomentSensorPicks {
	indoorTempSensorId?: string | null;
	electricityRateSensorId?: string | null;
}

/* ── Indoor temp sensor resolution ────────────────────────────────── */

/**
 * Pick the indoor-temp sensor. Curated override wins; otherwise scans
 * states for a sensor whose entity_id looks indoor + temp. Skips
 * obvious outdoor / weather / appliance temps.
 */
export function resolveIndoorTempSensor(
	states: Record<string, State>,
	curated: string | null | undefined
): string | null {
	if (curated && states[curated]) return curated;

	const candidates: string[] = [];
	for (const id of Object.keys(states)) {
		if (!id.startsWith('sensor.')) continue;
		const s = states[id];
		const uom = (s.attributes?.unit_of_measurement ?? '').toString();
		const devClass = (s.attributes?.device_class ?? '').toString();
		// Must read temperature (°C / °F)
		if (devClass !== 'temperature' && !/^°[CF]$/.test(uom)) continue;
		// Skip outdoor / weather / appliance temps
		if (/outdoor|outside|weather|forecast|fridge|freezer|oven|grill|cpu|battery_temp/i.test(id))
			continue;
		// Must produce a numeric reading
		const n = Number(s.state);
		if (!isFinite(n)) continue;
		candidates.push(id);
	}

	if (candidates.length === 0) return null;

	// Prefer hallway / landing / lounge / living room — public-room temps
	// feel more "the house" than a bedroom thermostat. Order tries each
	// keyword group; first hit wins.
	const preferences = [/hallway|landing/i, /living[_ ]?room|lounge/i, /kitchen|library/i];
	for (const pref of preferences) {
		const hit = candidates.find((id) => pref.test(id));
		if (hit) return hit;
	}
	// Otherwise first numeric indoor temp wins
	return candidates[0];
}

/**
 * Compose the indoor-temp clause: "Hallway 17°C."
 * Returns null if no sensor is resolvable.
 */
export function indoorTempClause(
	states: Record<string, State>,
	curated: string | null | undefined,
	areaNameOf?: (entityId: string) => string | null
): string | null {
	const id = resolveIndoorTempSensor(states, curated);
	if (!id) return null;
	const s = states[id];
	const n = Number(s.state);
	if (!isFinite(n)) return null;
	const uom = (s.attributes?.unit_of_measurement ?? '°C').toString();
	// Prefer the entity's area name as the label; otherwise lift the
	// room word out of the entity_id (`sensor.hallway_temperature` → "Hallway").
	let label = areaNameOf?.(id) ?? null;
	if (!label) {
		const stem = id.replace(/^sensor\./, '').split('_temperature')[0].split('_temp')[0];
		label = stem
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}
	return `${label} ${Math.round(n)}${uom}.`;
}

/* ── Electricity rate sensor resolution ──────────────────────────── */

/**
 * Pick the electricity-rate sensor. Curated override wins; otherwise
 * scans states for a sensor whose entity_id contains "electricity"
 * AND "current_rate" / "rate" / "tariff" AND reads a numeric currency-
 * per-kWh value. Designed to match Octopus Energy (HACS) by default
 * but also any custom rest sensor that follows the same convention.
 */
export function resolveElectricityRateSensor(
	states: Record<string, State>,
	curated: string | null | undefined
): string | null {
	if (curated && states[curated]) return curated;

	const ids = Object.keys(states).filter((id) => id.startsWith('sensor.'));

	// Octopus convention first
	const octopus = ids.find((id) =>
		/octopus_energy_electricity.*current_rate$/i.test(id)
	);
	if (octopus) return octopus;

	// Generic rate sensor — numeric reading + currency-per-kWh-ish UOM
	for (const id of ids) {
		if (!/(electricity|electric|power|grid).*(current_rate|rate|tariff|cost)/i.test(id)) continue;
		const s = states[id];
		const uom = (s.attributes?.unit_of_measurement ?? '').toString();
		if (!/\/kWh|p\/kWh|GBP\/kWh|\$\/kWh|kr\/kWh/i.test(uom)) continue;
		const n = Number(s.state);
		if (!isFinite(n)) continue;
		return id;
	}
	return null;
}

/**
 * Compose the electricity-rate clause.
 *
 *   - cheap (≤ 12p): "Electricity cheap at 8p."
 *   - peak  (≥ 28p): "Electricity peak at 32p."
 *   - else: "Electricity at 18p."
 *
 * Thresholds tuned for UK pence-per-kWh; for non-£ tariffs the descriptor
 * is omitted (just "Electricity at <n><uom>."). Returns null if no sensor
 * resolvable.
 */
export function electricityRateClause(
	states: Record<string, State>,
	curated: string | null | undefined
): string | null {
	const id = resolveElectricityRateSensor(states, curated);
	if (!id) return null;
	const s = states[id];
	const n = Number(s.state);
	if (!isFinite(n)) return null;
	const uom = (s.attributes?.unit_of_measurement ?? '').toString();
	const isPence = /^p\/kWh$/i.test(uom);
	let desc: string | null = null;
	if (isPence) {
		if (n <= 12) desc = 'cheap';
		else if (n >= 28) desc = 'peak';
	}
	// Editorial: "8p" not "8.34p" for the clause
	const rounded = Math.round(n);
	const unit = isPence ? 'p' : uom ? ` ${uom}` : '';
	if (desc) return `Electricity ${desc} at ${rounded}${unit}.`;
	return `Electricity at ${rounded}${unit}.`;
}
