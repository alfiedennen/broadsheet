/**
 * Block contract — defaultBlockConfig coverage + BlockDef shape
 * invariants.
 *
 * Rubric coverage: P1-S3 (build a first custom page — every block
 * type has a sensible default).
 */

import { describe, it, expect } from 'vitest';
import { defaultBlockConfig } from '$lib/blocks/types';
import { ALL_BLOCK_TYPES, BLOCK_META } from '$lib/blocks/registry';

describe('block registry coverage', () => {
	it('exports every supported block type', () => {
		const expected = [
			'hero',
			'markdown',
			'explainer',
			'outline',
			'macro-grid',
			'room-toggle-grid',
			'scene-row',
			'boost-row',
			'entity-list',
			'action-grid',
			'sparkline',
			// 0.9.1 things-first primitives
			'thing',
			'macro',
			// 0.9.3 area-panel composites
			'area-lights-panel',
			'area-climate-panel',
			'area-media-panel',
			// 0.9.4 layout containers
			'row',
			'grid',
			// 0.9.4.1 tabs primitive
			'tabs',
			// 0.9.4.2 lovelace-embed escape hatch
			'lovelace-embed'
		];
		// Same set, order-insensitive
		expect(ALL_BLOCK_TYPES.slice().sort()).toEqual(expected.slice().sort());
	});

	it('has a BLOCK_META entry per block type', () => {
		for (const t of ALL_BLOCK_TYPES) {
			expect(BLOCK_META[t]).toBeDefined();
			expect(BLOCK_META[t].label.length).toBeGreaterThan(0);
			expect(BLOCK_META[t].description.length).toBeGreaterThan(0);
		}
	});
});

describe('defaultBlockConfig — every type returns a valid block', () => {
	for (const type of [
		'hero',
		'markdown',
		'explainer',
		'outline',
		'macro-grid',
		'room-toggle-grid',
		'scene-row',
		'boost-row',
		'entity-list',
		'action-grid',
		'sparkline',
		// 0.9.1 things-first primitives
		'thing',
		'macro',
		// 0.9.3 area-panel composites
		'area-lights-panel',
		'area-climate-panel',
		'area-media-panel',
		// 0.9.4 layout containers
		'row',
		'grid',
		// 0.9.4.1 tabs primitive
		'tabs',
		// 0.9.4.2 lovelace-embed escape hatch
		'lovelace-embed'
	] as const) {
		it(`${type} returns a block with matching type discriminator`, () => {
			const block = defaultBlockConfig(type);
			expect(block.type).toBe(type);
			expect(block.config).toBeDefined();
		});
	}
});

describe('defaultBlockConfig — type-specific invariants', () => {
	it('hero starter has non-empty headline', () => {
		const b = defaultBlockConfig('hero');
		expect(b.type).toBe('hero');
		if (b.type === 'hero') {
			expect(b.config.headline.length).toBeGreaterThan(0);
		}
	});

	it('markdown starter has non-empty body', () => {
		const b = defaultBlockConfig('markdown');
		if (b.type === 'markdown') {
			expect(b.config.body.length).toBeGreaterThan(0);
		}
	});

	it('explainer starter has non-empty body with a link', () => {
		const b = defaultBlockConfig('explainer');
		if (b.type === 'explainer') {
			expect(b.config.body).toMatch(/\[.+\]\(.+\)/);
		}
	});

	it('outline starter has a label', () => {
		const b = defaultBlockConfig('outline');
		if (b.type === 'outline') {
			expect(b.config.label.length).toBeGreaterThan(0);
		}
	});

	it('scene-row starter caps maxScenes', () => {
		const b = defaultBlockConfig('scene-row');
		if (b.type === 'scene-row') {
			expect(b.config.maxScenes).toBeGreaterThan(0);
		}
	});

	it('boost-row starter has a sensible default temperature', () => {
		const b = defaultBlockConfig('boost-row');
		if (b.type === 'boost-row') {
			expect(b.config.temperature).toBeGreaterThanOrEqual(15);
			expect(b.config.temperature).toBeLessThanOrEqual(25);
		}
	});

	it('entity-list starter has empty entities array', () => {
		const b = defaultBlockConfig('entity-list');
		if (b.type === 'entity-list') {
			expect(Array.isArray(b.config.entities)).toBe(true);
			expect(b.config.entities).toHaveLength(0);
			expect(b.config.showIcon).toBe(true);
		}
	});

	it('action-grid starter has empty actions array', () => {
		const b = defaultBlockConfig('action-grid');
		if (b.type === 'action-grid') {
			expect(Array.isArray(b.config.actions)).toBe(true);
			expect(b.config.actions).toHaveLength(0);
			expect(b.config.size).toBe('medium');
		}
	});

	it('sparkline starter has 24h default', () => {
		const b = defaultBlockConfig('sparkline');
		if (b.type === 'sparkline') {
			expect(b.config.hours).toBe(24);
			expect(b.config.entityId).toBe('');
		}
	});

	// 0.9.1 things-first primitives — defaults must round-trip
	// through the editor's "add new" path safely (empty entityId
	// produces a no-op renderer, not a crash).
	it('thing starter has empty entityId + auto widget', () => {
		const b = defaultBlockConfig('thing');
		if (b.type === 'thing') {
			expect(b.config.entityId).toBe('');
			expect(b.config.widget).toBe('auto');
		}
	});

	it('macro starter has a label + empty steps array', () => {
		const b = defaultBlockConfig('macro');
		if (b.type === 'macro') {
			expect(b.config.label.length).toBeGreaterThan(0);
			expect(Array.isArray(b.config.steps)).toBe(true);
			expect(b.config.steps).toHaveLength(0);
		}
	});

	// 0.9.3 area-panel composites — empty areaId is the deliberate
	// default; the things-first browser's panel recipe fills it in
	// at recipe-generation time, but blocks added via the advanced
	// picker need the author to type the areaId.
	it('area-lights-panel starter has empty areaId', () => {
		const b = defaultBlockConfig('area-lights-panel');
		if (b.type === 'area-lights-panel') expect(b.config.areaId).toBe('');
	});
	it('area-climate-panel starter has empty areaId', () => {
		const b = defaultBlockConfig('area-climate-panel');
		if (b.type === 'area-climate-panel') expect(b.config.areaId).toBe('');
	});
	it('area-media-panel starter has empty areaId', () => {
		const b = defaultBlockConfig('area-media-panel');
		if (b.type === 'area-media-panel') expect(b.config.areaId).toBe('');
	});

	// 0.9.4 layout containers — empty children + sensible defaults.
	it('row starter has empty children + default gap', () => {
		const b = defaultBlockConfig('row');
		if (b.type === 'row') {
			expect(Array.isArray(b.config.children)).toBe(true);
			expect(b.config.children).toHaveLength(0);
			expect(b.config.gap).toBe(3);
		}
	});
	it('grid starter has empty children + 12 columns (Lovelace sections default) + gap 3', () => {
		const b = defaultBlockConfig('grid');
		if (b.type === 'grid') {
			expect(Array.isArray(b.config.children)).toBe(true);
			expect(b.config.children).toHaveLength(0);
			expect(b.config.columns).toBe(12);
			expect(b.config.gap).toBe(3);
		}
	});

	// 0.9.4.1 — tabs primitive defaults to two empty tabs so the
	// renderer has something to show + the user has something to fill.
	it('tabs starter has two empty tabs', () => {
		const b = defaultBlockConfig('tabs');
		if (b.type === 'tabs') {
			expect(Array.isArray(b.config.tabs)).toBe(true);
			expect(b.config.tabs).toHaveLength(2);
			expect(b.config.tabs[0].blocks).toHaveLength(0);
			expect(b.config.tabs[1].blocks).toHaveLength(0);
			expect(b.config.tabs[0].id).toBeTruthy();
			expect(b.config.tabs[1].id).toBeTruthy();
		}
	});

	// 0.9.4.2 — lovelace-embed escape hatch defaults to empty URL +
	// 800px height. The renderer surfaces a "no URL" placeholder
	// instead of an empty iframe so the user can't accidentally
	// ship a broken embed.
	it('lovelace-embed starter has empty URL + sensible default height', () => {
		const b = defaultBlockConfig('lovelace-embed');
		if (b.type === 'lovelace-embed') {
			expect(b.config.url).toBe('');
			expect(b.config.height).toBe(800);
		}
	});
});
