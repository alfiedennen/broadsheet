/**
 * Curation auto-seed — Theme F first-install foundation.
 *
 * On first boot (or any boot where curation.people is empty), populate
 * curation.people with entries for every HA-discovered person, each
 * pointed at the auto-picked suggestedPresenceSensor. Idempotent —
 * never overrides an existing entry, never seeds when the user has
 * already touched /settings/people.
 *
 * Why this exists: pre-Theme F, fresh installs left curation.people
 * empty, meaning /settings/people displayed "Add presence sensor" for
 * each person even though rankPresenceSensors had already identified
 * the right one. Auto-seeding makes the bindings EXPLICIT from day
 * one: user opens broadsheet, opens /settings/people, sees their
 * sensors already bound with ★ BEST, can adjust if they want.
 *
 * Auto-seed runs ONCE per addon lifetime (gated on curation.people
 * length); after that, user actions own the state.
 *
 * Spec: .dogfood/V3-PIVOT-TO-V02.md § "Theme F".
 */

import { discovery } from '$lib/discovery';
import { curationStore, setPersonPresenceSensor } from './store.svelte';

/**
 * Returns the number of bindings seeded. Zero if either (a) curation
 * already has people entries (user has interacted, don't override) or
 * (b) discovery has no persons yet (boot timing race — caller should
 * retry after discovery settles).
 */
export async function autoSeedPeopleFromDiscovery(): Promise<number> {
	// Guard 1: respect existing curation. ANY entry in curation.people
	// means the user has touched the picker (even if they cleared a
	// binding). Don't override.
	if (curationStore.current.people.length > 0) return 0;

	// Guard 2: discovery must have surfaced persons. If not, this is
	// an early boot pass; the caller should retry or skip.
	const persons = discovery.persons;
	if (persons.length === 0) return 0;

	let seeded = 0;
	for (const p of persons) {
		const sensor = p.suggestedPresenceSensor;
		if (!sensor) continue; // person has no rank-able sensor; skip
		// deviceClass is already detected by discovery; pass through.
		const ok = await setPersonPresenceSensor(p.id, sensor, p.deviceClass);
		if (ok) seeded++;
	}
	return seeded;
}
