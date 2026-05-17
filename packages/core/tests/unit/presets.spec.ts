/**
 * Preset registry — applicablePresets must always return the
 * Blank canvas (defensive default), even with empty discovery
 * context.
 *
 * Rubric coverage: P1-S3 (build a first custom page) — the picker
 * must offer at least one chip on a fresh install with zero
 * persons + zero areas.
 *
 * Regression test for BUG-003 (Phase G preset picker missing on
 * fresh install). Originally hypothesized as a $derived reactivity
 * break; live probe revealed all 4 data-dependent predicates were
 * correctly returning false on empty discovery, leaving
 * `presets.length === 0` and the `{#if presets.length > 0}` gate
 * suppressing the picker entirely. Fix: a `blank` preset with no
 * `applicableWhen` predicate, always at index 0 of PRESETS.
 */

import { describe, it, expect } from 'vitest';
import { PRESETS, applicablePresets } from '$lib/presets';

describe('preset registry', () => {
	it('exports the Blank canvas preset at index 0', () => {
		expect(PRESETS[0].meta.id).toBe('blank');
	});

	it('Blank canvas has no applicableWhen predicate', () => {
		// Always-applicable presets must have undefined applicableWhen,
		// not a function returning true. Future maintainers tempted to
		// add a predicate — don't, the absence is the contract.
		expect(PRESETS[0].meta.applicableWhen).toBeUndefined();
	});

	it('Blank canvas builds a one-block page with a Hero', () => {
		const built = PRESETS[0].build(
			{ persons: [], areas: [] },
			{ label: 'Test page' }
		);
		expect(built.blocks).toHaveLength(1);
		expect(built.blocks[0].type).toBe('hero');
	});
});

describe('applicablePresets — empty discovery', () => {
	it('returns Blank canvas with zero persons + zero areas', () => {
		const result = applicablePresets({ persons: [], areas: [] });
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result[0].meta.id).toBe('blank');
	});

	it('returns Blank + always-applicable presets when no data-dependent predicates pass', () => {
		const result = applicablePresets({ persons: [], areas: [] });
		// person/wall-morning/family/energy require persons or
		// area-counts/climates → don't pass on empty ctx. blank +
		// wall-surface have no applicableWhen / `() => true` → always
		// pass. 0.9.0 wall builder added wall-surface as the second
		// always-applicable preset (a blank wall-tablet starting point).
		expect(result.map((p) => p.meta.id)).toEqual(['blank', 'wall-surface']);
	});
});

describe('applicablePresets — populated discovery', () => {
	const fullCtx = {
		persons: [
			{ id: 'person.alice', name: 'Alice', state: 'home' as const, attributes: {} },
			{ id: 'person.bob', name: 'Bob', state: 'home' as const, attributes: {} }
		],
		areas: [
			// 5 areas, two with climates
			{
				id: 'kitchen',
				name: 'Kitchen',
				lights: [],
				switches: [],
				climates: [{ id: 'climate.kitchen_trv', deviceClass: null }],
				locks: [],
				contacts: [],
				cameras: [],
				media: [],
				tvs: [],
				remotes: [],
				sensors: [],
				scenes: [],
				otherEntities: []
			},
			{
				id: 'living-room',
				name: 'Living Room',
				lights: [],
				switches: [],
				climates: [{ id: 'climate.living_room_trv', deviceClass: null }],
				locks: [],
				contacts: [],
				cameras: [],
				media: [],
				tvs: [],
				remotes: [],
				sensors: [],
				scenes: [],
				otherEntities: []
			},
			{
				id: 'bedroom',
				name: 'Bedroom',
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
				otherEntities: []
			},
			{
				id: 'hallway',
				name: 'Hallway',
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
				otherEntities: []
			},
			{
				id: 'office',
				name: 'Office',
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
				otherEntities: []
			}
		]
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;

	it('returns all 6 presets when context satisfies every predicate', () => {
		const result = applicablePresets(fullCtx);
		// 0.9.0 wall builder added wall-surface as a 6th preset
		// (always-applicable, slots between wall-morning + family-status
		// per PRESETS registry order).
		expect(result.map((p) => p.meta.id)).toEqual([
			'blank',
			'person',
			'wall-morning',
			'wall-surface',
			'family-status',
			'energy-glance'
		]);
	});
});
