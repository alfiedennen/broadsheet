/**
 * Editorial humanizers — turn raw HA strings into prose-shaped text
 * that fits broadsheet's register.
 *
 * The two recurring offenders:
 *   1. Area names that come from HA as raw slugs (alfies_office,
 *      Utility_Room, library) when the user hasn't curated a rename.
 *      In hero italic ("alfies_office, Bedroom, … are on") this reads
 *      like the dashboard's broken.
 *   2. Weather states that ship as run-together identifiers
 *      (partlycloudy, clearnight) instead of human prose
 *      (partly cloudy, clear night).
 *
 * These run AFTER the curation override layer — if the user has set
 * a rename, that wins; this only humanizes the fallback path. So
 * "Bedroom" stays "Bedroom" (no change), "alfies_office" becomes
 * "Alfies Office" (humanized fallback), and a curated rename like
 * "Office" is untouched (override wins upstream).
 *
 * Regression test for BUG-005 (raw area_id slugs leaked into hero
 * italic on /lights, /heat, /wall) and BUG-014 (weather state
 * `partlycloudy` not humanized in moment manifest).
 */

/**
 * Turn `alfies_office` → `Alfies Office`, `Utility_Room` →
 * `Utility Room`, `library` → `Library`.
 *
 * Heuristic: if the name looks like a slug (lowercase letters with
 * underscores, OR all-lowercase words, OR mixed-case-with-underscores
 * like Utility_Room), apply title-case + space. Otherwise pass through
 * untouched (so "Front Hallway", "Bedroom", "FRONT" stay as the user
 * set them in HA).
 */
export function humanizeAreaName(raw: string): string {
	if (!raw) return raw;
	// Detect slug-shape: contains underscore, OR is all-lowercase with
	// no spaces (single-word lowercase like "library"). Skip if it
	// already has a space (multi-word, user-shaped).
	const looksLikeSlug =
		raw.includes('_') ||
		(/^[a-z][a-z0-9]*$/.test(raw) && !raw.includes(' '));
	if (!looksLikeSlug) return raw;
	return raw
		.replace(/_/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 0)
		.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');
}

/**
 * Map HA weather state IDs to display strings.
 *
 * HA's `weather` integration uses these condition values (per the
 * official `homeassistant.components.weather` constants): clear-night,
 * cloudy, fog, hail, lightning, lightning-rainy, partlycloudy,
 * pouring, rainy, snowy, snowy-rainy, sunny, windy, windy-variant,
 * exceptional. The run-together ones (`partlycloudy`,
 * `clear-night`, etc) need explicit mappings to read naturally in
 * hero prose.
 *
 * Unknown states fall through with hyphen-to-space + lowercase, so
 * future HA conditions still humanize sensibly.
 */
const WEATHER_DISPLAY: Record<string, string> = {
	'clear-night': 'clear night',
	cloudy: 'cloudy',
	exceptional: 'exceptional',
	fog: 'foggy',
	hail: 'hailing',
	lightning: 'thunder',
	'lightning-rainy': 'thunderstorms',
	partlycloudy: 'partly cloudy',
	pouring: 'pouring',
	rainy: 'rainy',
	snowy: 'snowy',
	'snowy-rainy': 'sleet',
	sunny: 'sunny',
	windy: 'windy',
	'windy-variant': 'windy'
};

export function humanizeWeatherState(raw: string | null | undefined): string {
	if (!raw) return '';
	if (WEATHER_DISPLAY[raw] !== undefined) return WEATHER_DISPLAY[raw];
	// Fallback: hyphens → spaces, lowercased. Catches future HA states
	// without having to extend the table.
	return raw.replace(/-/g, ' ').toLowerCase();
}
