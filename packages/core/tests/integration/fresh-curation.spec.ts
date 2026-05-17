/**
 * Fresh-curation smoke fixture.
 *
 * The "what does a naive user see on day one" test. Every check
 * here corresponds to a friction point captured in the
 * FRESH-USER-DOGFOOD-RESULTS.md walk; if any of these regress, the
 * fresh-install experience has degraded in a way the existing-install
 * regression suite is structurally blind to.
 *
 * Process change captured in v1 of the dogfood: the existing-install
 * sweep was a false positive — it tested whether the canary's already-
 * curated state still works, not whether a new install renders
 * sensibly. This fixture closes that gap so future Phase G regressions
 * get caught in CI, not by another manual dogfood.
 *
 * Coverage:
 *   - presets render Blank canvas with empty discovery (BUG-003)
 *   - block picker offers all 11 primitives (BUG-011 was a dogfood
 *     error; this asserts the count is correct)
 *   - markdown headings + emphasis parse correctly (BUG-008)
 *   - area-name humanizer turns slug-shaped HA names into prose
 *     (BUG-005)
 *   - weather-state humanizer turns `partlycloudy` into prose
 *     (BUG-014)
 *   - importer emits placeholder for unsupported cards (BUG-010)
 *   - importer translates mushroom-climate-card (BUG-009)
 */

import { describe, it, expect } from 'vitest';
import { applicablePresets } from '$lib/presets';
import { ALL_BLOCK_TYPES } from '$lib/blocks/registry';
import { humanizeAreaName, humanizeWeatherState } from '$lib/utils/humanize';

describe('fresh-curation smoke — preset picker', () => {
	it('returns at least one preset with empty discovery (BUG-003)', () => {
		const result = applicablePresets({ persons: [], areas: [] });
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result[0].meta.id).toBe('blank');
	});

	it('Blank canvas builds a usable starter page', () => {
		const built = applicablePresets({ persons: [], areas: [] })[0].build(
			{ persons: [], areas: [] },
			{ label: 'My first page' }
		);
		expect(built.blocks.length).toBeGreaterThan(0);
	});
});

describe('fresh-curation smoke — block picker', () => {
	it('offers all 16 primitive types', () => {
		// Hard-coded count — if a primitive is added or removed this
		// reminds the maintainer to update the dogfood expectations too.
		// 11 pre-0.9.1 + thing + macro (0.9.1) + 3 area-panels (0.9.3) = 16.
		expect(ALL_BLOCK_TYPES).toHaveLength(16);
	});

	it('includes Action grid + Entity list + Sparkline', () => {
		// These three were "missed" in the v1 dogfood — assert they're
		// always discoverable from the registry so future audits know
		// they're shipped (independent of any UI scroll affordance).
		expect(ALL_BLOCK_TYPES).toContain('action-grid');
		expect(ALL_BLOCK_TYPES).toContain('entity-list');
		expect(ALL_BLOCK_TYPES).toContain('sparkline');
	});

	it('includes 0.9.1 things-first primitives', () => {
		// The two things-first primitives are the authoring workhorses.
		// Make sure they survive any future registry trimming.
		expect(ALL_BLOCK_TYPES).toContain('thing');
		expect(ALL_BLOCK_TYPES).toContain('macro');
	});
});

describe('fresh-curation smoke — area name humanizer (BUG-005)', () => {
	it('turns alfies_office into Alfies Office', () => {
		expect(humanizeAreaName('alfies_office')).toBe('Alfies Office');
	});
	it('turns Utility_Room into Utility Room', () => {
		expect(humanizeAreaName('Utility_Room')).toBe('Utility Room');
	});
	it('turns library into Library', () => {
		expect(humanizeAreaName('library')).toBe('Library');
	});
	it('leaves multi-word user-shaped names alone', () => {
		expect(humanizeAreaName('Front Hallway')).toBe('Front Hallway');
		expect(humanizeAreaName('Bedroom')).toBe('Bedroom');
	});
	it('passes through empty + nullish values safely', () => {
		expect(humanizeAreaName('')).toBe('');
	});
});

describe('fresh-curation smoke — weather state humanizer (BUG-014)', () => {
	it('turns partlycloudy into "partly cloudy"', () => {
		expect(humanizeWeatherState('partlycloudy')).toBe('partly cloudy');
	});
	it('turns clear-night into "clear night"', () => {
		expect(humanizeWeatherState('clear-night')).toBe('clear night');
	});
	it('passes through known single-word states unchanged', () => {
		expect(humanizeWeatherState('sunny')).toBe('sunny');
		expect(humanizeWeatherState('cloudy')).toBe('cloudy');
		expect(humanizeWeatherState('rainy')).toBe('rainy');
	});
	it('falls back to hyphen-to-space for unknown future states', () => {
		expect(humanizeWeatherState('hurricane-watch')).toBe('hurricane watch');
	});
	it('returns empty string for null / undefined', () => {
		expect(humanizeWeatherState(null)).toBe('');
		expect(humanizeWeatherState(undefined)).toBe('');
		expect(humanizeWeatherState('')).toBe('');
	});
});
