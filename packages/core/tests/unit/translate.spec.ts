/**
 * Lovelace translator tests.
 *
 * Per-card-type translator unit tests. Each translator gets a
 * representative input + expected blocks + expected coverage class.
 *
 * Rubric coverage: P4-S4 (importer translates 80%+ of cards).
 * Backbone of the importer-coverage measurement; if any of these
 * regress, the rubric measurement drops with them.
 */

import { describe, it, expect } from 'vitest';
import {
	translateView,
	translateDashboard,
	isSupportedCardType,
	slugifyForBroadsheet
} from '$lib/lovelace/translate';
import type { LovelaceCard, LovelaceConfig, LovelaceView } from '$lib/lovelace/reader';

/** Build a single-card view for translator testing. */
function singleCardView(card: LovelaceCard): LovelaceView {
	return { title: 'Test', path: 'test', cards: [card] };
}

describe('isSupportedCardType', () => {
	it('recognises every translator we ship', () => {
		const supported = [
			'markdown',
			'entity',
			'entities',
			'vertical-stack',
			'horizontal-stack',
			'glance',
			'gauge',
			'sensor',
			'weather-forecast',
			'picture',
			'picture-glance',
			'picture-entity',
			'button',
			'light',
			'tile',
			'media-control',
			'conditional',
			'iframe',
			'heading',
			'custom:mushroom-template-card',
			'custom:mushroom-chips-card',
			'custom:mushroom-light-card',
			'custom:mushroom-entity-card',
			'custom:layout-card',
			'custom:stack-in-card',
			'custom:button-card',
			'custom:calendar-card-pro',
			'custom:mini-graph-card'
		];
		for (const t of supported) {
			expect(isSupportedCardType(t), `expected '${t}' to be supported`).toBe(true);
		}
	});

	it('does NOT recognise unknown card types', () => {
		expect(isSupportedCardType('custom:made-up-card')).toBe(false);
		expect(isSupportedCardType('xyz')).toBe(false);
	});
});

describe('translator: markdown', () => {
	it('translates plain markdown cleanly', () => {
		const view = singleCardView({ type: 'markdown', content: 'Hello **world**' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('markdown');
		expect((r.blocks[0].config as { body: string }).body).toBe('Hello **world**');
		expect(r.reports[0].coverage).toBe('clean');
	});

	it('flags Jinja-containing markdown as partial', () => {
		const view = singleCardView({
			type: 'markdown',
			content: `Hello {{ states('sensor.x') }}`
		});
		const r = translateView(view);
		expect(r.reports[0].coverage).toBe('partial');
		expect(r.reports[0].note).toMatch(/Jinja/i);
	});
});

describe('translator: entity', () => {
	it('translates to a markdown line with state interpolation', () => {
		const view = singleCardView({
			type: 'entity',
			entity: 'sensor.temp',
			name: 'Temperature'
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('markdown');
		expect((r.blocks[0].config as { body: string }).body).toBe(
			'**Temperature**: `{{sensor.temp}}`'
		);
		expect(r.reports[0].coverage).toBe('clean');
	});

	it('returns unsupported when entity field is missing', () => {
		const view = singleCardView({ type: 'entity' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(0);
		expect(r.reports[0].coverage).toBe('unsupported');
	});
});

describe('translator: entities', () => {
	it('translates a flat entity list cleanly', () => {
		const view = singleCardView({
			type: 'entities',
			title: 'Lights',
			entities: ['light.a', 'light.b', { entity: 'light.c', name: 'Custom Name' }]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('entity-list');
		const cfg = r.blocks[0].config as {
			label: string;
			entities: string[];
			nameOverrides?: Record<string, string>;
		};
		expect(cfg.label).toBe('Lights');
		expect(cfg.entities).toEqual(['light.a', 'light.b', 'light.c']);
		expect(cfg.nameOverrides).toEqual({ 'light.c': 'Custom Name' });
		expect(r.reports[0].coverage).toBe('clean');
	});

	it('marks partial when divider rows are dropped', () => {
		const view = singleCardView({
			type: 'entities',
			entities: ['light.a', { type: 'divider' }, 'light.b']
		});
		const r = translateView(view);
		expect(r.reports[0].coverage).toBe('partial');
		expect(r.reports[0].note).toMatch(/dropped/i);
	});

	it('returns unsupported when no entities resolve', () => {
		const view = singleCardView({
			type: 'entities',
			entities: [{ type: 'section', label: 'Nope' }]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(0);
		expect(r.reports[0].coverage).toBe('unsupported');
	});
});

describe('translator: vertical-stack / horizontal-stack', () => {
	it('vertical-stack recurses into children', () => {
		const view = singleCardView({
			type: 'vertical-stack',
			cards: [
				{ type: 'markdown', content: 'first' },
				{ type: 'markdown', content: 'second' }
			]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(2);
		expect(r.blocks.every((b) => b.type === 'markdown')).toBe(true);
		// Wrapper itself + 2 children = 3 reports
		expect(r.reports).toHaveLength(3);
		expect(r.reports[0].type).toBe('vertical-stack');
		expect(r.reports[0].coverage).toBe('clean');
	});

	it('horizontal-stack flags the layout flatten note', () => {
		const view = singleCardView({
			type: 'horizontal-stack',
			cards: [{ type: 'markdown', content: 'a' }]
		});
		const r = translateView(view);
		expect(r.reports[0].type).toBe('horizontal-stack');
		expect(r.reports[0].note).toMatch(/Horizontal/i);
	});
});

describe('translator: button + light', () => {
	it('button translates with toggle default for light entity', () => {
		const view = singleCardView({
			type: 'button',
			entity: 'light.kitchen',
			name: 'Kitchen'
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('action-grid');
		const cfg = r.blocks[0].config as { actions: { service: { domain: string; service: string } }[] };
		expect(cfg.actions[0].service.domain).toBe('light');
		expect(cfg.actions[0].service.service).toBe('toggle');
		expect(r.reports[0].coverage).toBe('clean');
	});

	it('button explicit tap_action call-service is honoured', () => {
		const view = singleCardView({
			type: 'button',
			entity: 'light.kitchen',
			tap_action: {
				action: 'call-service',
				service: 'scene.turn_on',
				target: { entity_id: 'scene.movie' }
			}
		});
		const r = translateView(view);
		const cfg = r.blocks[0].config as { actions: { service: { domain: string; service: string } }[] };
		expect(cfg.actions[0].service.domain).toBe('scene');
		expect(cfg.actions[0].service.service).toBe('turn_on');
	});

	it('light requires a light.* entity', () => {
		const view = singleCardView({ type: 'light', entity: 'switch.x' });
		const r = translateView(view);
		expect(r.reports[0].coverage).toBe('unsupported');
	});

	it('light translates partial (brightness slider dropped)', () => {
		const view = singleCardView({ type: 'light', entity: 'light.x', name: 'X' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('action-grid');
		expect(r.reports[0].coverage).toBe('partial');
		expect(r.reports[0].note).toMatch(/brightness/i);
	});
});

describe('translator: heading', () => {
	it('translates to outline cleanly', () => {
		const view = singleCardView({ type: 'heading', heading: 'Section A' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('outline');
		expect((r.blocks[0].config as { label: string }).label).toBe('Section A');
		expect(r.reports[0].coverage).toBe('clean');
	});
});

describe('translator: conditional', () => {
	it('recurses into wrapped card with condition dropped', () => {
		const view = singleCardView({
			type: 'conditional',
			conditions: [{ entity: 'light.x', state: 'on' }],
			card: { type: 'markdown', content: 'shown only when light is on' }
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('markdown');
		expect(r.reports[0].type).toBe('conditional');
		expect(r.reports[0].coverage).toBe('partial');
		expect(r.reports[0].note).toMatch(/Condition dropped/i);
	});
});

describe('translator: custom:layout-card + custom:stack-in-card', () => {
	it('layout-card recurses into all children', () => {
		const view = singleCardView({
			type: 'custom:layout-card',
			cards: [
				{ type: 'markdown', content: 'a' },
				{ type: 'markdown', content: 'b' },
				{ type: 'markdown', content: 'c' }
			]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(3);
	});

	it('stack-in-card recurses with its own note', () => {
		const view = singleCardView({
			type: 'custom:stack-in-card',
			cards: [{ type: 'markdown', content: 'a' }]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.reports[0].note).toMatch(/stack-in-card/i);
	});
});

describe('translator: custom:mushroom-template-card', () => {
	it('renders text card as markdown', () => {
		const view = singleCardView({
			type: 'custom:mushroom-template-card',
			primary: 'Status',
			secondary: 'All good'
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('markdown');
		const body = (r.blocks[0].config as { body: string }).body;
		expect(body).toContain('**Status**');
		expect(body).toContain('All good');
	});

	it('icon-only with tap_action becomes action-grid tile', () => {
		const view = singleCardView({
			type: 'custom:mushroom-template-card',
			entity: 'light.x',
			icon: 'mdi:lightbulb',
			tap_action: { action: 'toggle' }
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('action-grid');
		const cfg = r.blocks[0].config as { actions: { icon: string; service: { service: string } }[] };
		expect(cfg.actions[0].icon).toBe('mdi:lightbulb');
		expect(cfg.actions[0].service.service).toBe('toggle');
	});

	it('decorative empty card emits zero blocks but is partial (not unsupported)', () => {
		const view = singleCardView({ type: 'custom:mushroom-template-card' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(0);
		expect(r.reports[0].coverage).toBe('partial');
		expect(r.reports[0].note).toMatch(/[Dd]ecorative/);
	});
});

describe('translator: custom:mini-graph-card', () => {
	it('single-entity becomes a single sparkline (clean)', () => {
		const view = singleCardView({
			type: 'custom:mini-graph-card',
			entity: 'sensor.temp',
			name: 'Temperature',
			hours_to_show: 12
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('sparkline');
		const cfg = r.blocks[0].config as { entityId: string; label: string; hours: number };
		expect(cfg.entityId).toBe('sensor.temp');
		expect(cfg.label).toBe('Temperature');
		expect(cfg.hours).toBe(12);
		expect(r.reports[0].coverage).toBe('clean');
	});

	it('multi-entity becomes stacked sparklines (partial)', () => {
		const view = singleCardView({
			type: 'custom:mini-graph-card',
			entities: ['sensor.a', 'sensor.b']
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(2);
		expect(r.blocks.every((b) => b.type === 'sparkline')).toBe(true);
		expect(r.reports[0].coverage).toBe('partial');
		expect(r.reports[0].note).toMatch(/stacked sparklines/i);
	});
});

describe('translator: unsupported card type', () => {
	it('returns 0 blocks + unsupported coverage', () => {
		const view = singleCardView({ type: 'custom:made-up-card', foo: 'bar' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(0);
		expect(r.reports[0].coverage).toBe('unsupported');
		expect(r.reports[0].note).toMatch(/No translator/i);
	});
});

describe('translateDashboard — full pipeline', () => {
	it('aggregates totals across multiple views', () => {
		const config: LovelaceConfig = {
			title: 'Test Dashboard',
			views: [
				{
					title: 'View A',
					cards: [
						{ type: 'markdown', content: 'a1' },
						{ type: 'markdown', content: 'a2' }
					]
				},
				{
					title: 'View B',
					cards: [
						{ type: 'entities', entities: ['light.a'] },
						{ type: 'custom:made-up', foo: 'bar' }
					]
				}
			]
		};
		const r = translateDashboard(config);
		expect(r.views).toHaveLength(2);
		expect(r.totals.total).toBe(4);
		expect(r.totals.clean).toBe(3); // 2 markdown + 1 entities
		expect(r.totals.partial).toBe(0);
		expect(r.totals.unsupported).toBe(1);
	});

	it('handles an empty dashboard', () => {
		const r = translateDashboard({ title: 'Empty', views: [] });
		expect(r.views).toHaveLength(0);
		expect(r.totals.total).toBe(0);
	});
});

describe('slugifyForBroadsheet', () => {
	it('lowercases + spaces-to-hyphens', () => {
		expect(slugifyForBroadsheet('My Garage')).toBe('my-garage');
	});
	it('strips special chars', () => {
		expect(slugifyForBroadsheet("Alfie's Office")).toBe('alfies-office');
	});
	it('collapses multiple spaces', () => {
		expect(slugifyForBroadsheet('a   b')).toBe('a-b');
	});
	it('collapses multiple hyphens', () => {
		expect(slugifyForBroadsheet('a---b')).toBe('a-b');
	});
	it('caps length at 64', () => {
		expect(slugifyForBroadsheet('a'.repeat(100))).toHaveLength(64);
	});
});
