/**
 * Unified presence resolver — Theme F consolidation.
 *
 * Pre-Theme F, two functions did similar-but-different presence
 * resolution:
 *   - presenceFor(p) in routes/+page.svelte returned an Area for the
 *     home tile + painting lookup
 *   - resolvePresence() in lib/manifest.ts returned room-as-string
 *     for the moment-line prose
 *
 * Both fell through to p.suggestedPresenceSensor as fallback, but
 * read sensor state via DIFFERENT paths (presenceFor used
 * discovery.byEntityId which returns null for template sensors;
 * manifest read directly from states). When the home tile said
 * "AWAY" but the manifest said "Alfie in the office" — that was the
 * split-brain. v0.2.1 patched presenceFor to fall back to the raw
 * state machine, but the two functions stayed independent.
 *
 * This module is the single source of truth both consumers wrap.
 * Future presence-aware features (Theme C) build on top of this.
 *
 * Returns BOTH:
 *   - area: the resolved DomainArea for UI consumers (painting lookup,
 *     tile background, room label)
 *   - roomNameForProse: lowercase sensor state value for editorial
 *     prose ("alfie in the office" reads better than "alfie in the
 *     Alfies Office" — area.name might be a humanized slug)
 *
 * Spec: .dogfood/V3-PIVOT-TO-V02.md § "Theme F".
 */

import type { DomainArea, DomainPerson } from '$lib/discovery';
import { discovery } from '$lib/discovery';
import { discoveryStore } from '$lib/discovery/store.svelte';
import type { State } from '$lib/ha/types';

export interface PersonPresence {
	/** True iff the person resolved to a room or to plain 'home'. */
	home: boolean;
	/**
	 * Resolved DomainArea when the sensor value matches one of
	 * discovery.areas (via exact match OR suffix-match with person-
	 * affiliation tiebreak). Null when:
	 *   - person is away / not_home / unavailable
	 *   - sensor reports 'home' (HA's built-in person state — knows
	 *     they're home but doesn't say which room)
	 *   - sensor reports a room name that doesn't match any area
	 */
	area: DomainArea | null;
	/**
	 * Lowercase room-name string for editorial prose ("in the {room}").
	 * Mirrors the SENSOR's reported value, not area.name (which may be
	 * a humanized slug like "Alfies Office" that reads awkwardly in
	 * lowercase prose). Null when no specific room is known (away, or
	 * sensor reports bare 'home').
	 */
	roomNameForProse: string | null;
}

/**
 * Sensor state values that mean "not at home" or "unknown".
 */
const NOT_PRESENT = new Set([
	'',
	'unknown',
	'unavailable',
	'not_home',
	'away',
	'none'
]);

/**
 * Input scope. Consumers pass the lookups already in their scope so
 * this module doesn't have to import every store directly (keeps the
 * dependency tree shallow for testability).
 */
export interface PresenceContext {
	/**
	 * Map of personId → curated sensor binding from curation.people.
	 *   - undefined: no curation entry; fall back to p.suggestedPresenceSensor
	 *   - null: user explicitly cleared the binding; treat as away
	 *   - string: pinned sensor
	 */
	personOverrides: Record<string, string | null | undefined>;
	/** HA state machine snapshot. */
	states: Record<string, State>;
	/** Visible domain areas (already curation-filtered). */
	areas: DomainArea[];
}

/**
 * Resolve one person's presence. Pure-ish — only `discovery.byEntityId`
 * touches reactive state (Svelte tracks the read), everything else is
 * data-in / data-out.
 */
export function resolvePersonPresence(
	p: DomainPerson,
	ctx: PresenceContext
): PersonPresence {
	const overrideId = ctx.personOverrides[p.id];
	const sensorId =
		overrideId === null ? null : (overrideId ?? p.suggestedPresenceSensor ?? null);
	if (!sensorId) return { home: false, area: null, roomNameForProse: null };

	// Prefer the registry entity for richer metadata; fall back to the
	// raw state machine for template sensors (v0.2.1 split-brain fix).
	const fromRegistry = discovery.byEntityId(sensorId)?.state?.state;
	const fromStates = ctx.states[sensorId]?.state;
	const stateValue = (fromRegistry ?? fromStates ?? '').toString().trim();
	const lower = stateValue.toLowerCase();
	if (!stateValue || NOT_PRESENT.has(lower)) {
		return { home: false, area: null, roomNameForProse: null };
	}

	// 'home' from HA's built-in person/device_tracker means present
	// but room-unknown. Surface as home + no area + no prose room.
	if (lower === 'home') {
		return { home: true, area: null, roomNameForProse: null };
	}

	// Otherwise treat the state value as a room identifier. Resolve to
	// a DomainArea via exact match → suffix match with person-affiliation
	// tiebreak.
	const slugNeedle = lower.replace(/\s+/g, '_');
	const exact = ctx.areas.find((a) => {
		if (a.id === '__unsorted__') return false;
		if (a.name.toLowerCase() === lower) return true;
		if (a.id.toLowerCase() === slugNeedle) return true;
		if (a.name.toLowerCase().replace(/\s+/g, '_') === slugNeedle) return true;
		return false;
	});
	if (exact) {
		return { home: true, area: exact, roomNameForProse: lower };
	}

	// Suffix match: area.id endsWith `_<slugNeedle>` (catches
	// alfies_office matching "office"). Disambiguate by person-
	// affiliation when multiple match.
	const suffix = `_${slugNeedle}`;
	const suffixMatches = ctx.areas.filter(
		(a) => a.id !== '__unsorted__' && a.id.toLowerCase().endsWith(suffix)
	);
	if (suffixMatches.length === 0) {
		// Sensor reports a value that doesn't match any area. Home but
		// area-unknown — still useful for the manifest prose.
		return { home: true, area: null, roomNameForProse: lower };
	}
	if (suffixMatches.length === 1) {
		return { home: true, area: suffixMatches[0], roomNameForProse: lower };
	}
	const firstName = p.name.split(' ')[0].toLowerCase();
	const affiliated = suffixMatches.find(
		(a) =>
			a.id.toLowerCase().startsWith(firstName + '_') ||
			a.id.toLowerCase().startsWith(firstName + 's_')
	);
	return {
		home: true,
		area: affiliated ?? suffixMatches[0],
		roomNameForProse: lower
	};
}

/**
 * Batch helper for the manifest line — resolves all persons at once
 * with shared context.
 */
export function resolveAllPresence(
	persons: DomainPerson[],
	ctx: PresenceContext
): Map<string, PersonPresence> {
	const out = new Map<string, PersonPresence>();
	for (const p of persons) {
		out.set(p.id, resolvePersonPresence(p, ctx));
	}
	return out;
}

/**
 * Build a PresenceContext from the standard broadsheet stores.
 * Convenience for the common case; consumers can build their own
 * context too (e.g. tests with synthetic data).
 */
export function buildPresenceContext(
	personOverrides: Record<string, string | null | undefined>
): PresenceContext {
	return {
		personOverrides,
		states: discoveryStore.states,
		areas: discovery.areas
	};
}
