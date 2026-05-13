/**
 * Manifest composition — the single-line summary that opens `/`.
 *
 * Default copy: composes from discovered persons + their suggested
 * presence sensors. Eventually overridable via M4 Settings UI →
 * /settings/voice.
 *
 * Sentence shapes (priority order):
 *  - Both home, same room: "Both in the {room}."
 *  - Both home, different rooms: "{a} in the {a-room}, {b} in the {b-room}."
 *  - One home only: "{name} home in the {room}."
 *  - One home, room unknown: "{name} home."
 *  - All away: "The house is empty."
 */

import type { DomainPerson } from '$lib/discovery';
import type { State } from '$lib/ha/types';

export interface ManifestInput {
	persons: DomainPerson[];
	states: Record<string, State>;
}

export interface ManifestPersonState {
	person: DomainPerson;
	isHome: boolean;
	room: string | null;
}

/**
 * Resolve each person's home/away state + current room from their
 * suggested presence sensor.
 */
export function resolvePresence(input: ManifestInput): ManifestPersonState[] {
	return input.persons.map((p) => {
		const sensorId = p.suggestedPresenceSensor;
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

/** Compose the manifest sentence. */
export function composeManifest(input: ManifestInput): string {
	const states = resolvePresence(input);
	const home = states.filter((s) => s.isHome);

	if (home.length === 0) {
		return 'The house is empty.';
	}

	if (home.length === 1) {
		const { person, room } = home[0];
		const name = person.name.split(' ')[0]; // first name only
		if (room) return `${name} home in the ${room.toLowerCase()}.`;
		return `${name} home.`;
	}

	if (home.length === 2) {
		const [a, b] = home;
		const aName = a.person.name.split(' ')[0];
		const bName = b.person.name.split(' ')[0];

		if (a.room && b.room && a.room === b.room) {
			return `Both in the ${a.room.toLowerCase()}.`;
		}
		if (a.room && b.room) {
			return `${aName} in the ${a.room.toLowerCase()}, ${bName} in the ${b.room.toLowerCase()}.`;
		}
		// Mixed knowable / unknowable rooms
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
