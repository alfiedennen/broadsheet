/**
 * Theme C — routing primitive tests.
 *
 * Pure-function coverage of routeTo() across all three modalities
 * (audio, screen, notification) + their fallback ladders. The
 * routing layer wraps the unified presence resolver so we don't
 * re-test presence semantics here — see presence.spec.ts for that
 * (when it lands). These tests stub the resolver's view of the world
 * by constructing minimal DomainPerson + DomainArea fixtures.
 */

import { describe, it, expect } from 'vitest';
import type { DomainArea, DomainEntity, DomainPerson } from '$lib/discovery';
import type { State } from '$lib/ha/types';
import { routeTo, routeToAll, type RouteContext } from '$lib/routing';

/* ── Fixtures ──────────────────────────────────────────────────────── */

function mkPerson(
	id: string,
	name: string,
	suggested: string | null,
	trackers: string[] = []
): DomainPerson {
	return {
		id: `person.${id}`,
		name,
		entityId: `person.${id}`,
		deviceClass: 'android',
		deviceTrackers: trackers,
		suggestedPresenceSensor: suggested,
		rankedPresenceSensors: [],
		zone: 'home',
		state: 'home'
	} as unknown as DomainPerson;
}

function mkArea(
	id: string,
	name: string,
	overrides: Partial<DomainArea> = {}
): DomainArea {
	const base: DomainArea = {
		id,
		name,
		wasHumanized: false,
		icon: null,
		picture: null,
		floorId: null,
		labels: [],
		lights: [],
		switches: [],
		climates: [],
		locks: [],
		contacts: [],
		cameras: [],
		media: [],
		tvs: [],
		remotes: [],
		sensors: [],
		scenes: [],
		otherEntities: [],
		hiddenEntities: [],
		hasLighting: false,
		hasClimate: false,
		hasLock: false,
		hasMedia: false,
		hasTv: false
	} as unknown as DomainArea;
	return { ...base, ...overrides };
}

function mkEntity(id: string, areaId: string | null = null): DomainEntity {
	return { id, areaId } as unknown as DomainEntity;
}

function mkSensorState(entityId: string, value: string): Record<string, State> {
	return { [entityId]: { entity_id: entityId, state: value, attributes: {} } as State };
}

/* ── routeTo / audio ───────────────────────────────────────────────── */

describe('routeTo / audio', () => {
	const office = mkArea('office', 'Office', {
		media: [mkEntity('media_player.office_mini', 'office')]
	});
	const kitchen = mkArea('kitchen', 'Kitchen', {
		media: [mkEntity('media_player.kitchen_display', 'kitchen')]
	});
	const alfie = mkPerson('alfie', 'Alfie', 'sensor.alfie_committed_room');

	it('returns in-room media_player when person is in a known area', () => {
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'Office'),
			areas: [office, kitchen]
		};
		const r = routeTo(alfie, 'audio', ctx);
		expect(r?.entityId).toBe('media_player.office_mini');
		expect(r?.confidence).toBe('in-room');
		expect(r?.reason).toContain('Office');
	});

	it('falls back to first house media_player when person is away', () => {
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'away'),
			areas: [office, kitchen]
		};
		const r = routeTo(alfie, 'audio', ctx);
		expect(r?.confidence).toBe('fallback');
		expect(r?.entityId).toMatch(/^media_player\./);
	});

	it('falls back when no in-room media but other rooms have one', () => {
		const lounge = mkArea('lounge', 'Lounge'); // no media
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'Lounge'),
			areas: [lounge, kitchen]
		};
		const r = routeTo(alfie, 'audio', ctx);
		expect(r?.confidence).toBe('fallback');
		expect(r?.entityId).toBe('media_player.kitchen_display');
	});

	it('returns null when no media_player anywhere AND no fallback in states', () => {
		const empty = mkArea('empty', 'Empty');
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'Empty'),
			areas: [empty]
		};
		const r = routeTo(alfie, 'audio', ctx);
		expect(r).toBeNull();
	});

	it('catches a guess from state-machine when areas are empty', () => {
		const empty = mkArea('empty', 'Empty');
		const ctx: RouteContext = {
			states: {
				...mkSensorState('sensor.alfie_committed_room', 'Empty'),
				...mkSensorState('media_player.somewhere', 'on')
			},
			areas: [empty]
		};
		const r = routeTo(alfie, 'audio', ctx);
		expect(r?.confidence).toBe('guess');
		expect(r?.entityId).toBe('media_player.somewhere');
	});
});

/* ── routeTo / screen ──────────────────────────────────────────────── */

describe('routeTo / screen', () => {
	const lounge = mkArea('lounge', 'Lounge', {
		tvs: [mkEntity('media_player.lounge_tv', 'lounge')]
	});
	const bedroom = mkArea('bedroom', 'Bedroom', {
		tvs: [mkEntity('media_player.bedroom_tv', 'bedroom')]
	});
	const alfie = mkPerson('alfie', 'Alfie', 'sensor.alfie_committed_room');

	it('returns in-room TV when person is in a TV-equipped room', () => {
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'Lounge'),
			areas: [lounge, bedroom]
		};
		const r = routeTo(alfie, 'screen', ctx);
		expect(r?.entityId).toBe('media_player.lounge_tv');
		expect(r?.confidence).toBe('in-room');
	});

	it('falls back to first house TV when not in a TV room', () => {
		const office = mkArea('office', 'Office'); // no TV
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'Office'),
			areas: [office, lounge]
		};
		const r = routeTo(alfie, 'screen', ctx);
		expect(r?.confidence).toBe('fallback');
		expect(r?.entityId).toBe('media_player.lounge_tv');
	});

	it('returns null when no TVs anywhere', () => {
		const office = mkArea('office', 'Office');
		const ctx: RouteContext = {
			states: mkSensorState('sensor.alfie_committed_room', 'Office'),
			areas: [office]
		};
		expect(routeTo(alfie, 'screen', ctx)).toBeNull();
	});
});

/* ── routeTo / notification ────────────────────────────────────────── */

describe('routeTo / notification', () => {
	it('finds mobile_app notify service from device_trackers', () => {
		const alfie = mkPerson('alfie', 'Alfie', null, ['device_tracker.alfie_pixel']);
		const ctx: RouteContext = {
			states: {
				'device_tracker.alfie_pixel': {
					entity_id: 'device_tracker.alfie_pixel',
					state: 'home',
					attributes: {}
				} as State
			},
			areas: []
		};
		const r = routeTo(alfie, 'notification', ctx);
		expect(r?.entityId).toBe('notify.mobile_app_alfie_pixel');
		expect(r?.confidence).toBe('in-room');
	});

	it('skips unavailable device_trackers', () => {
		const alfie = mkPerson('alfie', 'Alfie', null, [
			'device_tracker.dead_phone',
			'device_tracker.live_phone'
		]);
		const ctx: RouteContext = {
			states: {
				'device_tracker.dead_phone': {
					entity_id: 'device_tracker.dead_phone',
					state: 'unavailable',
					attributes: {}
				} as State,
				'device_tracker.live_phone': {
					entity_id: 'device_tracker.live_phone',
					state: 'home',
					attributes: {}
				} as State
			},
			areas: []
		};
		const r = routeTo(alfie, 'notification', ctx);
		expect(r?.entityId).toBe('notify.mobile_app_live_phone');
	});

	it('returns null when no tracker is reachable', () => {
		const alfie = mkPerson('alfie', 'Alfie', null, []);
		const ctx: RouteContext = { states: {}, areas: [] };
		expect(routeTo(alfie, 'notification', ctx)).toBeNull();
	});
});

/* ── routeToAll ────────────────────────────────────────────────────── */

describe('routeToAll', () => {
	it('returns one entry per person', () => {
		const alfie = mkPerson('alfie', 'Alfie', null);
		const elena = mkPerson('elena', 'Elena', null);
		const ctx: RouteContext = { states: {}, areas: [] };
		const out = routeToAll([alfie, elena], 'audio', ctx);
		expect(out).toHaveLength(2);
		expect(out[0].person.id).toBe('person.alfie');
		expect(out[1].person.id).toBe('person.elena');
		// Both null because no media anywhere
		expect(out[0].target).toBeNull();
		expect(out[1].target).toBeNull();
	});
});
