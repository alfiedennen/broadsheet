/**
 * Manifest composition — the single-line summary that opens `/`.
 *
 * Default copy: composes from discovered persons + their suggested
 * presence sensors. Each sentence shape is keyed by a stable string
 * id ('manifest.empty', 'manifest.oneHome', etc.) — Settings UI →
 * /settings/voice can override any of them.
 *
 * Sentence shapes (priority order):
 *  - manifest.bothHomeSameRoom: "Both in the {room}."
 *  - manifest.bothHomeDifferent: "{a} in the {a-room}, {b} in the {b-room}."
 *  - manifest.oneHome: "{name} home in the {room}."
 *  - manifest.oneHomeRoomUnknown: "{name} home."
 *  - manifest.empty: "The house is empty."
 */

import type { DomainPerson, DomainArea } from '$lib/discovery';
import type { State } from '$lib/ha/types';
import { resolvePersonPresence } from './presence';

export interface ManifestInput {
	persons: DomainPerson[];
	states: Record<string, State>;
	/** Per-person override map: personId → sensorId. Overrides the heuristic. */
	personOverrides?: Record<string, string | null>;
	/** Voice string overrides keyed by string id. */
	voice?: Record<string, string>;
	/**
	 * Theme F: domain areas needed by the unified resolver for
	 * suffix-match + person-affiliation tiebreak. Optional for
	 * backwards-compat (callers that don't supply will get the
	 * pre-Theme F behaviour: no area resolution, sensor state value
	 * used as room name).
	 */
	areas?: DomainArea[];
}

export interface ManifestPersonState {
	person: DomainPerson;
	isHome: boolean;
	room: string | null;
}

/**
 * Resolve each person's home/away state + current room.
 *
 * Theme F: thin wrapper around the unified $lib/presence resolver
 * so the home tile + manifest line never drift apart. Returns the
 * lowercase room-name string the manifest prose expects (rather than
 * the area.name which may be a humanized slug).
 */
export function resolvePresence(input: ManifestInput): ManifestPersonState[] {
	const overrides = input.personOverrides ?? {};
	return input.persons.map((p) => {
		const r = resolvePersonPresence(p, {
			personOverrides: overrides,
			states: input.states,
			areas: input.areas ?? []
		});
		return {
			person: p,
			isHome: r.home,
			room: r.roomNameForProse
		};
	});
}

/**
 * Tiny template substitution: replaces `{key}` with `vars[key]`.
 * Unknown keys are left intact (so authors notice typos).
 */
function fill(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w[\w-]*)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/** Compose the manifest sentence. */
export function composeManifest(input: ManifestInput): string {
	const states = resolvePresence(input);
	const home = states.filter((s) => s.isHome);
	const v = input.voice ?? {};

	if (home.length === 0) {
		return v['manifest.empty'] || 'The house is empty.';
	}

	if (home.length === 1) {
		const { person, room } = home[0];
		const name = person.name.split(' ')[0]; // first name only
		// Are there other (away) people in the household to name? With ≥2
		// people configured, naming the absent one is more informative than
		// silence — "Alfie home in the office. Elena out." reads as the
		// state of the WHOLE household, not just the one home.
		const others = states.filter((s) => !s.isHome).map((s) => s.person.name.split(' ')[0]);
		const outClause =
			others.length === 1
				? ` ${others[0]} out.`
				: others.length === 2
					? ` ${others[0]} and ${others[1]} out.`
					: others.length > 2
						? ` ${others.slice(0, -1).join(', ')} and ${others[others.length - 1]} out.`
						: '';

		if (room) {
			const tpl = v['manifest.oneHome'] || '{name} home in the {room}.';
			return fill(tpl, { name, room: room.toLowerCase() }) + outClause;
		}
		const tpl = v['manifest.oneHomeRoomUnknown'] || '{name} home.';
		return fill(tpl, { name }) + outClause;
	}

	if (home.length === 2) {
		const [a, b] = home;
		const aName = a.person.name.split(' ')[0];
		const bName = b.person.name.split(' ')[0];

		if (a.room && b.room && a.room === b.room) {
			const tpl = v['manifest.bothHomeSameRoom'] || 'Both in the {room}.';
			// Pass {a}/{b} too — the default tpl doesn't use them, but
			// authors who override (e.g. "{a} and {b} are both in {room}")
			// expect name substitution. Pre-0.9.5: only {room} was filled,
			// leaving "{a} and {b}" literal in the output.
			return fill(tpl, { a: aName, b: bName, room: a.room.toLowerCase() });
		}
		if (a.room && b.room) {
			const tpl =
				v['manifest.bothHomeDifferent'] ||
				'{a} in the {aRoom}, {b} in the {bRoom}.';
			return fill(tpl, {
				a: aName,
				b: bName,
				aRoom: a.room.toLowerCase(),
				bRoom: b.room.toLowerCase()
			});
		}
		// Mixed knowable / unknowable rooms — fallback shapes
		if (a.room && !b.room) {
			return `${aName} in the ${a.room.toLowerCase()}, ${bName} also home.`;
		}
		if (!a.room && b.room) {
			return `${aName} home, ${bName} in the ${b.room.toLowerCase()}.`;
		}
		return `${aName} and ${bName} home.`;
	}

	// 3+ home: simple list
	const names = home.map((s) => s.person.name.split(' ')[0]);
	const last = names.pop();
	return `${names.join(', ')} and ${last} home.`;
}
