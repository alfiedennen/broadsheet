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

/* ── Headline render helper: italic-amber the values ──────────────── */

const HTML_ESCAPE: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};
function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]!);
}

/**
 * Wrap numeric values + rate-band descriptors in `<em>` for the moment
 * headline. Mirrors harold.local's pattern: temps, rate values + the
 * cheap/ordinary/expensive band words pop in italic-amber. Other
 * tokens (weekday, room names, weather conditions) stay plain.
 *
 * Output is HTML-safe — caller may `{@html}` it. Operates on a single
 * composed clause string at a time so it composes with the existing
 * manifest pipeline.
 */
export function highlightValues(clause: string): string {
	const escaped = escapeHtml(clause);
	return (
		escaped
			// Temperatures: 17°C, 21.5°F, -3°C
			.replace(/(-?\d+(?:\.\d+)?°[CF])/g, '<em>$1</em>')
			// Rate values: 8p, 32p (only when not already inside <em>)
			.replace(/(\d+p)\b/g, '<em>$1</em>')
			// Rate band descriptors — only after "Electricity " prefix to
			// avoid hitting the same words elsewhere in copy
			.replace(
				/(Electricity )(cheap|ordinary|expensive|peak)\b/g,
				'$1<em>$2</em>'
			)
	);
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
 *   - cheap     (< 12p):    "Electricity cheap at 8p."
 *   - ordinary (12-22p):    "Electricity ordinary at 17p."
 *   - expensive (≥ 22p):    "Electricity expensive at 32p."
 *
 * Three-band thresholds match harold-home (the editorial register
 * source). For non-£ tariffs the descriptor is omitted: just
 * "Electricity at <n><uom>." Returns null if no sensor is resolvable.
 *
 * Unit handling: Octopus Energy (HACS) reports rates in £/kWh as a
 * fraction (e.g. `0.32`), with UOM "GBP/kWh"; older / fixed-tariff
 * sensors may report in p/kWh as integer/decimal. We detect both and
 * normalise to integer pence for display. UOMs we don't recognise as
 * currency-per-kWh fall through to "n uom" plain.
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

	// Normalise to pence-per-kWh integer for display + classification
	let pence: number | null = null;
	if (/^p\/kWh$/i.test(uom)) pence = n;
	else if (/^GBP\/kWh$/i.test(uom)) pence = n * 100;
	// Common Octopus quirk: some sensor configurations report the value
	// already in pence with no UOM, or with UOM 'p'. If it looks like a
	// reasonable UK pence value (1-100) and there's no clear £/kWh signal,
	// guess pence — better to render than to drop the clause.
	else if ((!uom || /^p$/i.test(uom)) && n >= 0.5 && n <= 100) pence = n;

	if (pence == null) {
		// Unknown unit — render plain
		const rounded = Math.round(n * 10) / 10;
		return `Electricity at ${rounded}${uom ? ` ${uom}` : ''}.`;
	}

	const rounded = Math.round(pence);
	let desc: string;
	if (pence < 12) desc = 'cheap';
	else if (pence < 22) desc = 'ordinary';
	else desc = 'expensive';
	return `Electricity ${desc} at ${rounded}p.`;
}
