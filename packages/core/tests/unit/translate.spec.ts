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
	translateDashboardAsTabs,
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
	it('vertical-stack recurses into children + flat-emits (no wrapper)', () => {
		const view = singleCardView({
			type: 'vertical-stack',
			cards: [
				{ type: 'markdown', content: 'first' },
				{ type: 'markdown', content: 'second' }
			]
		});
		const r = translateView(view);
		// vertical-stack still flat-emits children to the page (the page
		// is already vertical) — no wrapper block.
		expect(r.blocks).toHaveLength(2);
		expect(r.blocks.every((b) => b.type === 'markdown')).toBe(true);
		// Wrapper itself + 2 children = 3 reports
		expect(r.reports).toHaveLength(3);
		expect(r.reports[0].type).toBe('vertical-stack');
		expect(r.reports[0].coverage).toBe('clean');
	});

	// 0.9.4: horizontal-stack now emits a row block wrapping the
	// translated children (was: flat sequence with a "lost" note).
	it('horizontal-stack emits a row block wrapping the children (0.9.4)', () => {
		const view = singleCardView({
			type: 'horizontal-stack',
			cards: [
				{ type: 'markdown', content: 'a' },
				{ type: 'markdown', content: 'b' }
			]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('row');
		if (r.blocks[0].type === 'row') {
			expect(r.blocks[0].config.children).toHaveLength(2);
			expect(r.blocks[0].config.children.every((c) => c.type === 'markdown')).toBe(true);
		}
		expect(r.reports[0].type).toBe('horizontal-stack');
		expect(r.reports[0].coverage).toBe('clean');
		// No more "Horizontal layout flattened" note since the layout IS preserved.
		expect(r.reports[0].note).toBeUndefined();
	});
});

/* ── 0.9.4 grid + sections + panel + masonry tests ─────────────── */

describe('translator: grid card (0.9.4)', () => {
	it('emits a grid block with column count + children translated', () => {
		const view = singleCardView({
			type: 'grid',
			columns: 4,
			cards: [
				{ type: 'markdown', content: 'a' },
				{ type: 'markdown', content: 'b' },
				{ type: 'markdown', content: 'c' }
			]
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('grid');
		if (r.blocks[0].type === 'grid') {
			expect(r.blocks[0].config.columns).toBe(4);
			expect(r.blocks[0].config.children).toHaveLength(3);
		}
	});

	it('per-child grid_options.columns becomes the block colSpan', () => {
		const view = singleCardView({
			type: 'grid',
			columns: 12,
			cards: [
				{ type: 'markdown', content: 'wide', grid_options: { columns: 8 } },
				{ type: 'markdown', content: 'narrow', grid_options: { columns: 4 } }
			]
		});
		const r = translateView(view);
		if (r.blocks[0].type === 'grid') {
			expect(r.blocks[0].config.children[0].colSpan).toBe(8);
			expect(r.blocks[0].config.children[1].colSpan).toBe(4);
		}
	});
});

describe('translator: sections view (0.9.4)', () => {
	it('emits one grid block per section + outline for section titles', () => {
		const view = {
			type: 'sections',
			title: 'Living Room',
			sections: [
				{
					title: 'Lights',
					type: 'grid',
					cards: [
						{ type: 'markdown', content: 'pendant', grid_options: { columns: 6 } },
						{ type: 'markdown', content: 'lamps', grid_options: { columns: 6 } }
					]
				},
				{
					title: 'Cinema',
					type: 'grid',
					cards: [{ type: 'markdown', content: 'movie' }]
				}
			]
		} as unknown as LovelaceView;
		const r = translateView(view);
		// Expected: outline 'Lights' + grid (2 children) + outline 'Cinema' + grid (1 child) = 4 blocks
		expect(r.blocks).toHaveLength(4);
		expect(r.blocks[0].type).toBe('outline');
		expect(r.blocks[1].type).toBe('grid');
		expect(r.blocks[2].type).toBe('outline');
		expect(r.blocks[3].type).toBe('grid');
		if (r.blocks[1].type === 'grid') {
			expect(r.blocks[1].config.columns).toBe(12);
			expect(r.blocks[1].config.children[0].colSpan).toBe(6);
			expect(r.blocks[1].config.children[1].colSpan).toBe(6);
		}
	});

	it('sections without titles do not emit an outline', () => {
		const view = {
			type: 'sections',
			sections: [{ type: 'grid', cards: [{ type: 'markdown', content: 'a' }] }]
		} as unknown as LovelaceView;
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('grid');
	});

	it('empty sections produce no block at all', () => {
		const view = {
			type: 'sections',
			sections: [{ title: 'Empty', type: 'grid', cards: [] }]
		} as unknown as LovelaceView;
		const r = translateView(view);
		// outline header emits, but no grid since the section has no children
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('outline');
	});
});

describe('translator: panel view (0.9.4)', () => {
	it('translates the single card without any wrapper', () => {
		const view = {
			type: 'panel',
			cards: [{ type: 'markdown', content: 'just me' }]
		} as unknown as LovelaceView;
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('markdown');
	});
});

describe('translator: masonry heuristic (0.9.4)', () => {
	const small = (i: number): LovelaceCard =>
		({ type: 'chip', entity: `sensor.s${i}` }) as unknown as LovelaceCard;
	const tall = (i: number): LovelaceCard =>
		({ type: 'custom:mini-graph-card', entity: `sensor.g${i}` }) as unknown as LovelaceCard;
	const md = (i: number): LovelaceCard =>
		({ type: 'markdown', content: `block ${i}` }) as unknown as LovelaceCard;

	it('< 6 cards → no wrap (flat sequence, single column)', () => {
		const view = {
			cards: [small(1), small(2), small(3)]
		} as unknown as LovelaceView;
		const r = translateView(view);
		expect(r.blocks.every((b) => b.type !== 'grid')).toBe(true);
		expect(r.blocks).toHaveLength(3);
	});

	it('6-12 cards with ≥ 1 small type → wrap in 2-col grid + partial-layout coverage', () => {
		const view = {
			cards: [small(1), md(2), md(3), md(4), md(5), md(6), md(7)]
		} as unknown as LovelaceView;
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('grid');
		if (r.blocks[0].type === 'grid') {
			expect(r.blocks[0].config.columns).toBe(2);
		}
		// Clean reports got re-stamped to partial-layout
		expect(r.reports.some((rep) => rep.coverage === 'partial-layout')).toBe(true);
	});

	it('> 12 cards with ≥ 1 small → wrap in 3-col grid', () => {
		const cards = [small(0), ...Array.from({ length: 14 }, (_, i) => md(i))];
		const view = { cards } as unknown as LovelaceView;
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		if (r.blocks[0].type === 'grid') {
			expect(r.blocks[0].config.columns).toBe(3);
		}
	});

	it('many cards but ALL tall types → no wrap (kept single-column to avoid bunching)', () => {
		const view = {
			cards: Array.from({ length: 8 }, (_, i) => tall(i))
		} as unknown as LovelaceView;
		const r = translateView(view);
		// Each tall card produces its own block; none wrap into a grid.
		expect(r.blocks.every((b) => b.type !== 'grid')).toBe(true);
		expect(r.blocks.length).toBeGreaterThan(1);
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
	it('emits a placeholder markdown block + unsupported coverage (BUG-010)', () => {
		// Previously dropped silently — now emits a `> _Unsupported …_` block
		// so the user sees that the card was there in their source dashboard
		// and can choose to delete or replace it.
		const view = singleCardView({ type: 'custom:made-up-card', foo: 'bar' });
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('markdown');
		expect((r.blocks[0] as { config: { body: string } }).config.body).toMatch(
			/Unsupported.*custom:made-up-card/
		);
		expect(r.reports[0].coverage).toBe('unsupported');
		expect(r.reports[0].note).toMatch(/No translator/i);
	});

	it('embeds the entity_id in the placeholder when card had one', () => {
		const view = singleCardView({
			type: 'custom:made-up-card',
			entity: 'sensor.foo'
		});
		const r = translateView(view);
		expect((r.blocks[0] as { config: { body: string } }).config.body).toMatch(
			/sensor\.foo/
		);
	});
});

describe('translator: mushroom-climate-card (BUG-009)', () => {
	it('emits action-grid tile bound to climate entity', () => {
		const view = singleCardView({
			type: 'custom:mushroom-climate-card',
			entity: 'climate.kitchen_trv',
			name: 'Kitchen TRV'
		});
		const r = translateView(view);
		expect(r.blocks).toHaveLength(1);
		expect(r.blocks[0].type).toBe('action-grid');
		const block = r.blocks[0] as {
			config: {
				actions: Array<{
					label: string;
					stateBinding?: { entityId: string };
				}>;
			};
		};
		expect(block.config.actions[0].label).toBe('Kitchen TRV');
		expect(block.config.actions[0].stateBinding?.entityId).toBe('climate.kitchen_trv');
		expect(r.reports[0].coverage).toBe('partial');
	});

	it('falls through to unsupported when entity field missing', () => {
		const view = singleCardView({ type: 'custom:mushroom-climate-card' });
		const r = translateView(view);
		expect(r.reports[0].coverage).toBe('unsupported');
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

/* ── 0.9.4.1 multi-view → tabs + chip-bar dedup ────────────────── */

describe('translateDashboardAsTabs (0.9.4.1)', () => {
	function mkView(path: string, title: string, cards: LovelaceCard[]): LovelaceView {
		return { title, path, cards } as unknown as LovelaceView;
	}

	it('emits ONE TranslatedView whose single block is a tabs block, one tab per source view', () => {
		const cfg: LovelaceConfig = {
			title: 'Wall Tablet',
			views: [
				mkView('home', 'Home', [{ type: 'markdown', content: 'home content' }]),
				mkView('heating', 'Heating', [{ type: 'markdown', content: 'heat content' }]),
				mkView('door', 'Door', [{ type: 'markdown', content: 'door content' }])
			]
		} as unknown as LovelaceConfig;
		const r = translateDashboardAsTabs(cfg, 'wall-tablet');
		expect(r.views).toHaveLength(1);
		expect(r.views[0].blocks).toHaveLength(1);
		expect(r.views[0].blocks[0].type).toBe('tabs');
		if (r.views[0].blocks[0].type === 'tabs') {
			const tabs = r.views[0].blocks[0].config.tabs;
			expect(tabs).toHaveLength(3);
			expect(tabs.map((t) => t.id)).toEqual(['home', 'heating', 'door']);
			expect(tabs.map((t) => t.label)).toEqual(['Home', 'Heating', 'Door']);
			// Each tab carries its view's translated blocks.
			expect(tabs[0].blocks.every((b) => b.type === 'markdown')).toBe(true);
		}
	});

	it('aggregates per-card reports across all views', () => {
		const cfg: LovelaceConfig = {
			views: [
				mkView('a', 'A', [{ type: 'markdown', content: '1' }]),
				mkView('b', 'B', [{ type: 'markdown', content: '2' }])
			]
		} as unknown as LovelaceConfig;
		const r = translateDashboardAsTabs(cfg, 'd');
		expect(r.totals.total).toBe(2);
		expect(r.totals.clean).toBe(2);
	});
});

describe('chip-bar dedup (0.9.4.1)', () => {
	function chipNavCard(targetPath: string): LovelaceCard {
		return {
			type: 'custom:mushroom-template-card',
			primary: 'Heat',
			tap_action: { action: 'navigate', navigation_path: targetPath }
		} as unknown as LovelaceCard;
	}

	function mkView(path: string, title: string, cards: LovelaceCard[]): LovelaceView {
		return { title, path, cards } as unknown as LovelaceView;
	}

	it('drops a horizontal-stack chip-bar whose tap_actions all navigate to sibling views', () => {
		const cfg: LovelaceConfig = {
			views: [
				mkView('home', 'Home', [
					{
						type: 'horizontal-stack',
						cards: [
							chipNavCard('/wall-tablet/home'),
							chipNavCard('/wall-tablet/heating'),
							chipNavCard('/wall-tablet/door')
						]
					},
					{ type: 'markdown', content: 'real home content' }
				]),
				mkView('heating', 'Heating', [{ type: 'markdown', content: 'heat' }]),
				mkView('door', 'Door', [{ type: 'markdown', content: 'door' }])
			]
		} as unknown as LovelaceConfig;
		const r = translateDashboardAsTabs(cfg, 'wall-tablet');
		if (r.views[0].blocks[0].type === 'tabs') {
			const homeTab = r.views[0].blocks[0].config.tabs[0];
			// chip-bar at the top is gone; only the real content survives.
			expect(homeTab.blocks).toHaveLength(1);
			expect(homeTab.blocks[0].type).toBe('markdown');
			if (homeTab.blocks[0].type === 'markdown') {
				expect(homeTab.blocks[0].config.body).toBe('real home content');
			}
		}
	});

	it('keeps a chip-bar whose tap_actions point at non-sibling paths (real navigation)', () => {
		const cfg: LovelaceConfig = {
			views: [
				mkView('home', 'Home', [
					{
						type: 'horizontal-stack',
						cards: [
							chipNavCard('/lovelace/elsewhere'),
							chipNavCard('/wall-tablet/heating')
						]
					},
					{ type: 'markdown', content: 'home' }
				]),
				mkView('heating', 'Heating', [{ type: 'markdown', content: 'heat' }])
			]
		} as unknown as LovelaceConfig;
		const r = translateDashboardAsTabs(cfg, 'wall-tablet');
		if (r.views[0].blocks[0].type === 'tabs') {
			const homeTab = r.views[0].blocks[0].config.tabs[0];
			// Mixed chip-bar (not all siblings) → kept. So home tab gets
			// the translated chip-bar (becomes a row of action-grids)
			// + the real markdown.
			expect(homeTab.blocks.length).toBeGreaterThan(1);
		}
	});

	it('drops a mushroom-chips-card whose chips all navigate to siblings', () => {
		const cfg: LovelaceConfig = {
			views: [
				{
					title: 'Home',
					path: 'home',
					cards: [
						{
							type: 'custom:mushroom-chips-card',
							chips: [
								{ tap_action: { action: 'navigate', navigation_path: '/d/home' } },
								{ tap_action: { action: 'navigate', navigation_path: '/d/door' } }
							]
						},
						{ type: 'markdown', content: 'real' }
					]
				} as unknown as LovelaceView,
				{ title: 'Door', path: 'door', cards: [{ type: 'markdown', content: 'door' }] } as unknown as LovelaceView
			]
		} as unknown as LovelaceConfig;
		const r = translateDashboardAsTabs(cfg, 'd');
		if (r.views[0].blocks[0].type === 'tabs') {
			const homeTab = r.views[0].blocks[0].config.tabs[0];
			// Only the real markdown survives; chips-card got stripped.
			expect(homeTab.blocks).toHaveLength(1);
			expect(homeTab.blocks[0].type).toBe('markdown');
		}
	});

	it('single-view dashboards: chip-bar stripping never fires (the public translateDashboard path)', () => {
		const cfg: LovelaceConfig = {
			views: [
				{
					title: 'Solo',
					path: 'solo',
					cards: [
						{
							type: 'horizontal-stack',
							cards: [chipNavCard('/d/solo')]
						},
						{ type: 'markdown', content: 'body' }
					]
				} as unknown as LovelaceView
			]
		} as unknown as LovelaceConfig;
		const r = translateDashboard(cfg);
		// translateDashboard doesn't know about siblings → nothing
		// stripped. Both the horizontal-stack and the markdown make it
		// through.
		const totalBlocks = r.views[0].blocks.length;
		expect(totalBlocks).toBeGreaterThan(1);
	});
});
