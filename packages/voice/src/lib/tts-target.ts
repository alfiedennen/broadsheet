/**
 * 0.7 fix #3 — TTS target resolver.
 *
 * Translates a user-configured `ttsTarget` curation value into a
 * concrete entity_id (or 'browser') at speak time. Three shapes:
 *
 *   - 'browser'                  → 'browser' (passthrough)
 *   - 'media_player.kitchen'     → 'media_player.kitchen' (passthrough)
 *   - 'presence:<personId>'      → routeTo(that person, 'audio')
 *   - 'presence:originator'      → infer the person via view.surfaceArea,
 *                                  then routeTo(them, 'audio')
 *
 * When the presence resolution fails (e.g. originator has no surface
 * area set, or the picked person isn't home + there's no fallback
 * media_player at all) we return null and let the caller decide
 * whether to fall back to browser or silently skip. The renderer
 * today falls back to browser — voice replies always have to come
 * out somewhere, otherwise the user thinks Harold's broken.
 *
 * Why this lives in voice and not core: the routing primitive is
 * core (routeTo / RouteContext), but the "what does this STRING
 * mean" parsing is voice-plugin-specific (other plugins might want
 * 'screen:<personId>' or 'notify:<personId>' shapes that mean
 * different things).
 */

import { routeTo, discovery, getStates, getCuration } from '@broadsheet/core';
import type { DomainPerson } from '@broadsheet/core';

/** A label-bearing result the renderer logs / surfaces. */
export interface ResolvedTtsTarget {
	/** Final entity_id (or 'browser'). */
	target: string;
	/**
	 * Why we picked it. Cheap log-grade explanation; not surfaced to
	 * the user unless the plugin chooses to.
	 */
	reason: string;
	/** Confidence inherited from routeTo, or 'explicit' for direct picks. */
	confidence: 'explicit' | 'in-room' | 'fallback' | 'guess' | 'browser-fallback';
}

/**
 * Pick the person whose presence drives the originator route.
 * Order of preference:
 *   1. A person whose suggestedPresenceSensor reports them in the
 *      configured surfaceArea (the broadsheet instance's "I am here").
 *   2. The first home person (when surfaceArea is unset or empty).
 *   3. Null when nobody's home.
 */
function pickOriginatorPerson(surfaceArea: string | null): DomainPerson | null {
	const states = getStates();
	const persons = discovery.persons;
	if (persons.length === 0) return null;

	if (surfaceArea) {
		// Find a person whose committed_room sensor (or whatever
		// suggestedPresenceSensor resolves to) matches the surface area.
		// This is intentionally a thin string-match on sensor state vs
		// area name — broadsheet's full presence resolver does richer
		// matching but here we want the cheapest "is this person in
		// THIS room" check possible.
		const surfaceArea_lc = surfaceArea.toLowerCase();
		for (const p of persons) {
			const sensorId = p.suggestedPresenceSensor;
			if (!sensorId) continue;
			const v = states[sensorId]?.state;
			if (typeof v !== 'string') continue;
			if (v.toLowerCase() === surfaceArea_lc) return p;
			// Also match against area-id-style slugs ("Living Room" ~ "living_room")
			if (v.toLowerCase().replace(/[\s-]/g, '_') === surfaceArea_lc.replace(/[\s-]/g, '_'))
				return p;
		}
	}

	// Fallback: first home person (state === 'home') OR first person
	// at all when none report home.
	const home = persons.find((p) => {
		const s = states[p.id]?.state;
		return s === 'home';
	});
	return home ?? persons[0];
}

/**
 * Resolve a configured TTS target string to a real endpoint.
 * Single entry point — called by VoicePillRenderer + VoicePage
 * once per speak() invocation. Cheap (a few state reads + at most
 * one routeTo call); fine to inline at the speak callsite.
 */
export function resolveTtsTarget(raw: string | undefined | null): ResolvedTtsTarget {
	const target = (raw ?? '').trim() || 'browser';

	if (target === 'browser') {
		return { target: 'browser', reason: 'configured browser playback', confidence: 'explicit' };
	}

	// Direct entity_id pick — most-common shape.
	if (!target.startsWith('presence:')) {
		return {
			target,
			reason: `configured static target ${target}`,
			confidence: 'explicit'
		};
	}

	const who = target.slice('presence:'.length);
	const curation = getCuration();
	const surfaceArea = (curation.view?.surfaceArea ?? null) as string | null;
	const personOverrides: Record<string, string | null> = Object.fromEntries(
		(curation.people ?? []).map((p) => [p.personId, p.presenceSensorId])
	);

	let person: DomainPerson | null = null;
	if (who === 'originator') {
		person = pickOriginatorPerson(surfaceArea);
	} else {
		// who is a person id — `person.<slug>` or bare `<slug>`.
		const id = who.startsWith('person.') ? who : `person.${who}`;
		person = discovery.persons.find((p) => p.id === id) ?? null;
	}

	if (!person) {
		return {
			target: 'browser',
			reason:
				who === 'originator'
					? 'originator presence unresolved — falling back to browser'
					: `no person matched '${who}' — falling back to browser`,
			confidence: 'browser-fallback'
		};
	}

	const route = routeTo(person, 'audio', {
		states: getStates(),
		areas: discovery.areas,
		personOverrides
	});

	if (!route) {
		return {
			target: 'browser',
			reason: `${person.name}: no audio target available — falling back to browser`,
			confidence: 'browser-fallback'
		};
	}

	return {
		target: route.entityId,
		reason: `${person.name}: ${route.reason}`,
		confidence: route.confidence
	};
}
