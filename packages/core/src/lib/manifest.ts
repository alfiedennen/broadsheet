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

import type { DomainPerson } from '$lib/discovery';
import type { State } from '$lib/ha/types';

export interface ManifestInput {
	persons: DomainPerson[];
	states: Record<string, State>;
	/** Per-person override map: personId → sensorId. Overrides the heuristic. */
	personOverrides?: Record<string, string | null>;
	/** Voice string overrides keyed by string id. */
	voice?: Record<string, string>;
}

export interface ManifestPersonState {
	person: DomainPerson;
	isHome: boolean;
	room: string | null;
}

/**
 * Resolve each person's home/away state + current room from their
 * presence sensor. Curation overrides the heuristic when set.
 */
export function resolvePresence(input: ManifestInput): ManifestPersonState[] {
	return input.persons.map((p) => {
		// Curation override wins over heuristic suggestion
		const overrideId = input.personOverrides?.[p.id];
		const sensorId = overrideId === null ? null : (overrideId ?? p.suggestedPresenceSensor);
		if (!sensorId) {
			return { person: p, isHome: false, room: null };
		}

		const sensor = input.states[sensorId];
		if (!sensor) return { person: p, isHome: false, room: null };

		const sval = (sensor.state || '').toLowerCase();

		// Heuristic: device_tracker / person → 'home' / 'not_home' / zone-name
		// committed_room sensor → room name string OR 'away'
		if (sval === 'home') {
			// person/device_tracker says "home" but doesn't say which room
			return { person: p, isHome: true, room: null };
		}
		if (sval === 'not_home' || sval === 'away' || sval === 'unavailable' || sval === 'unknown') {
			return { person: p, isHome: false, room: null };
		}

		// committed_room sensor returns the room name as the state value
		// Capitalise on display
		const room = sval.charAt(0).toUpperCase() + sval.slice(1);
		return { person: p, isHome: true, room };
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
		if (room) {
			const tpl = v['manifest.oneHome'] || '{name} home in the {room}.';
			return fill(tpl, { name, room: room.toLowerCase() });
		}
		const tpl = v['manifest.oneHomeRoomUnknown'] || '{name} home.';
		return fill(tpl, { name });
	}

	if (home.length === 2) {
		const [a, b] = home;
		const aName = a.person.name.split(' ')[0];
		const bName = b.person.name.split(' ')[0];

		if (a.room && b.room && a.room === b.room) {
			const tpl = v['manifest.bothHomeSameRoom'] || 'Both in the {room}.';
			return fill(tpl, { room: a.room.toLowerCase() });
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
