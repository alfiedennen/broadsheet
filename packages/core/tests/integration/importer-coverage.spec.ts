/**
 * Importer integration test — measures real-world coverage on a
 * representative dashboard fixture.
 *
 * Rubric coverage: P4-S4 (importer translates 80%+ of cards).
 * The fixture is a sanitised + reduced approximation of the canary's
 * Harold Road dashboard (Mushroom-heavy + layout-card-wrapped +
 * mini-graph + horizontal stacks + an unsupported card).
 *
 * The test is the rubric: this fixture's coverage must stay above
 * the gate threshold, and any regression below it fails CI.
 */

import { describe, it, expect } from 'vitest';
import { translateDashboard } from '$lib/lovelace/translate';
import type { LovelaceConfig } from '$lib/lovelace/reader';

/**
 * Representative dashboard fixture — captures the patterns that
 * make the canary's real dashboard challenging:
 *  - layout-card wrappers
 *  - stack-in-card wrappers
 *  - mushroom-template-card with Jinja
 *  - mushroom-chips-card
 *  - mini-graph-card
 *  - horizontal-stack
 *  - heading
 *  - one genuinely-unsupported card to validate the report
 */
const FIXTURE: LovelaceConfig = {
	title: 'Test Dashboard',
	views: [
		{
			title: 'Home',
			cards: [
				{ type: 'heading', heading: 'Status' },
				{
					type: 'custom:layout-card',
					cards: [
						{
							type: 'markdown',
							content: 'Plain prose summary.'
						},
						{
							type: 'custom:mushroom-template-card',
							primary: 'Status',
							secondary: `{{ states('sensor.status') }}`,
							icon: 'mdi:check'
						},
						{
							type: 'entities',
							title: 'Lights',
							entities: ['light.living_room', 'light.kitchen', 'light.bedroom']
						}
					]
				},
				{
					type: 'horizontal-stack',
					cards: [
						{
							type: 'custom:mushroom-light-card',
							entity: 'light.living_room',
							name: 'Living'
						},
						{
							type: 'custom:mushroom-light-card',
							entity: 'light.kitchen',
							name: 'Kitchen'
						}
					]
				}
			]
		},
		{
			title: 'Energy',
			cards: [
				{
					type: 'custom:stack-in-card',
					cards: [
						{
							type: 'heading',
							heading: 'Today'
						},
						{
							type: 'custom:mini-graph-card',
							entity: 'sensor.electricity_consumption',
							name: 'Electricity',
							hours_to_show: 24
						},
						{
							type: 'custom:mushroom-template-card',
							primary: 'Electricity',
							secondary: `{{ (states('sensor.electricity_rate') | float * 100) | round }}p`
						}
					]
				}
			]
		},
		{
			title: 'Remote',
			cards: [
				{
					type: 'custom:layout-card',
					cards: [
						// Decorative empty mushroom (D-pad spacer pattern)
						{ type: 'custom:mushroom-template-card' },
						// Icon-only mushroom button (D-pad arrow)
						{
							type: 'custom:mushroom-template-card',
							entity: 'remote.living_room_tv',
							icon: 'mdi:arrow-up',
							tap_action: {
								action: 'call-service',
								service: 'remote.send_command',
								target: { entity_id: 'remote.living_room_tv' },
								data: { command: 'DPAD_UP' }
							}
						},
						// Mushroom chips (mixed action + template)
						{
							type: 'custom:mushroom-chips-card',
							chips: [
								{
									type: 'entity',
									entity: 'media_player.living_room_tv',
									tap_action: { action: 'toggle' }
								},
								{
									type: 'template',
									content: `{{ states('sensor.tv_status') }}`
								}
							]
						},
						// Genuinely-unsupported card
						{
							type: 'custom:made-up-future-card',
							some_config: 'value'
						}
					]
				}
			]
		}
	]
};

describe('Importer integration — Harold-Road-shape fixture', () => {
	const result = translateDashboard(FIXTURE);

	it('produces translation reports for every card in every view', () => {
		expect(result.views).toHaveLength(3);
		// Total cards across all views (counted recursively):
		// View 1: heading + layout-card + 3 children + horizontal-stack + 2 children = 8
		// View 2: stack-in-card + 3 children = 4
		// View 3: layout-card + 4 children = 5
		// Total: 17
		expect(result.totals.total).toBe(17);
	});

	it('hits the v0.9 gate: ≥80% rendered (clean + partial)', () => {
		const rendered = result.totals.clean + result.totals.partial;
		const ratio = rendered / result.totals.total;
		expect(
			ratio,
			`coverage ${rendered}/${result.totals.total} = ${(ratio * 100).toFixed(1)}% — must be ≥ 80%`
		).toBeGreaterThanOrEqual(0.8);
	});

	it('produces blocks for the supported cards', () => {
		const totalBlocks = result.views.reduce((acc, v) => acc + v.blocks.length, 0);
		// Should be substantial — every supported card emits ≥1 block
		// except wrappers (which emit 0 themselves but recurse) and
		// decorative empty mushroom (also 0).
		expect(totalBlocks).toBeGreaterThanOrEqual(10);
	});

	it('flags the genuinely-unsupported card', () => {
		const allReports = result.views.flatMap((v) => v.reports);
		const unsupported = allReports.filter((r) => r.coverage === 'unsupported');
		expect(unsupported.length).toBeGreaterThanOrEqual(1);
		expect(unsupported.some((r) => r.type === 'custom:made-up-future-card')).toBe(true);
	});

	it('Energy view: mini-graph translates to sparkline (clean)', () => {
		const energyView = result.views.find((v) => v.title === 'Energy');
		expect(energyView).toBeDefined();
		const sparklines = energyView!.blocks.filter((b) => b.type === 'sparkline');
		expect(sparklines).toHaveLength(1);
	});

	it('Remote view: icon-only mushroom translates to action-grid', () => {
		const remoteView = result.views.find((v) => v.title === 'Remote');
		expect(remoteView).toBeDefined();
		const actions = remoteView!.blocks.filter((b) => b.type === 'action-grid');
		expect(actions.length).toBeGreaterThanOrEqual(1);
	});

	it('Decorative empty mushroom is partial, not unsupported', () => {
		const remoteView = result.views.find((v) => v.title === 'Remote');
		const decorative = remoteView!.reports.filter(
			(r) => r.note?.includes('Decorative') || r.note?.includes('decorative')
		);
		expect(decorative.length).toBeGreaterThanOrEqual(1);
		expect(decorative[0].coverage).toBe('partial');
	});

	it('Mushroom-template with Jinja gets the Jinja note', () => {
		const allReports = result.views.flatMap((v) => v.reports);
		const jinjaCards = allReports.filter((r) => r.note?.match(/Jinja/));
		expect(jinjaCards.length).toBeGreaterThanOrEqual(1);
	});

	it('Layout-card + stack-in-card recurse into children', () => {
		// View 1's first wrapper is layout-card with 3 children
		const view1Reports = result.views[0].reports;
		// Should contain layout-card + 3 child reports (and other top-level cards)
		const layoutWrapper = view1Reports.find((r) => r.type === 'custom:layout-card');
		expect(layoutWrapper).toBeDefined();
		expect(layoutWrapper?.coverage).toBe('clean');
	});
});
