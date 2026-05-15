/**
 * Jinja-subset evaluator tests.
 *
 * Battery of representative HA templates against synthetic state.
 * Covers every supported feature + the key error/fallback paths.
 *
 * Rubric coverage: P4-S2 (Jinja-heavy markdown blocks evaluate live).
 */

import { describe, it, expect } from 'vitest';
import { render, looksLikeJinja } from '$lib/jinja';
import type { State } from '$lib/ha/types';

/** Synthetic state lookup helper — returns a State for a fixed entity map. */
function makeStateLookup(entities: Record<string, Partial<State>>): (id: string) => State | undefined {
	return (id) => {
		const e = entities[id];
		if (!e) return undefined;
		return {
			entity_id: id,
			state: '',
			attributes: {},
			last_changed: '2026-05-15T00:00:00.000Z',
			last_updated: '2026-05-15T00:00:00.000Z',
			...e
		} as State;
	};
}

describe('looksLikeJinja', () => {
	it('detects {{ expression }}', () => {
		expect(looksLikeJinja('hello {{ states("x") }}')).toBe(true);
	});
	it('detects {% statement %}', () => {
		expect(looksLikeJinja('{% set x = 1 %}')).toBe(true);
	});
	it('returns false for plain text', () => {
		expect(looksLikeJinja('just plain prose with no template syntax')).toBe(false);
	});
	it('returns false for empty string', () => {
		expect(looksLikeJinja('')).toBe(false);
	});
});

describe('render — pure expressions', () => {
	const ctx = {};

	it('renders a number literal', () => {
		expect(render('{{ 42 }}', ctx)).toBe('42');
	});
	it('renders a string literal', () => {
		expect(render('{{ "hello" }}', ctx)).toBe('hello');
	});
	it('renders boolean true as "True"', () => {
		expect(render('{{ true }}', ctx)).toBe('True');
	});
	it('renders boolean false as "False"', () => {
		expect(render('{{ false }}', ctx)).toBe('False');
	});
	it('renders none as empty', () => {
		expect(render('{{ none }}', ctx)).toBe('');
	});
	it('renders a sum', () => {
		expect(render('{{ 2 + 3 }}', ctx)).toBe('5');
	});
	it('renders a difference', () => {
		expect(render('{{ 10 - 4 }}', ctx)).toBe('6');
	});
	it('renders a product', () => {
		expect(render('{{ 6 * 7 }}', ctx)).toBe('42');
	});
	it('renders string concatenation', () => {
		expect(render('{{ "a" + "b" }}', ctx)).toBe('ab');
	});
	it('renders comparison true', () => {
		expect(render('{{ 5 > 3 }}', ctx)).toBe('True');
	});
	it('renders equality', () => {
		expect(render('{{ "x" == "x" }}', ctx)).toBe('True');
	});
	it('renders logical and (truthy passthrough)', () => {
		expect(render('{{ "a" and "b" }}', ctx)).toBe('b');
	});
	it('renders logical or (first truthy)', () => {
		expect(render('{{ "" or "fallback" }}', ctx)).toBe('fallback');
	});
	it('renders not', () => {
		expect(render('{{ not false }}', ctx)).toBe('True');
	});
});

describe('render — HA state functions', () => {
	const lookup = makeStateLookup({
		'sensor.temp': { state: '21.3', attributes: { unit_of_measurement: '°C' } },
		'light.living_room': { state: 'on' },
		'sensor.washer': {
			state: 'running',
			attributes: { remaining_minutes: 42, programme: 'Cotton 60' }
		}
	});

	it('states() returns the state value', () => {
		expect(render(`{{ states('sensor.temp') }}`, { stateLookup: lookup })).toBe('21.3');
	});

	it('states() returns empty for unknown entity', () => {
		expect(render(`{{ states('sensor.nope') }}`, { stateLookup: lookup })).toBe('');
	});

	it('state_attr() returns the attribute', () => {
		expect(
			render(`{{ state_attr('sensor.temp', 'unit_of_measurement') }}`, { stateLookup: lookup })
		).toBe('°C');
	});

	it('is_state() returns boolean True when matches', () => {
		expect(
			render(`{{ is_state('light.living_room', 'on') }}`, { stateLookup: lookup })
		).toBe('True');
	});

	it('is_state() returns False when does not match', () => {
		expect(
			render(`{{ is_state('light.living_room', 'off') }}`, { stateLookup: lookup })
		).toBe('False');
	});

	it('combines states() with string concatenation', () => {
		expect(
			render(`Temp is {{ states('sensor.temp') }} degrees`, { stateLookup: lookup })
		).toBe('Temp is 21.3 degrees');
	});
});

describe('render — {% set %} bindings', () => {
	const lookup = makeStateLookup({
		'sensor.washer': {
			state: 'running',
			attributes: { remaining_minutes: 42 }
		}
	});

	it('binds a literal then references it', () => {
		expect(render(`{% set greeting = "hi" %}{{ greeting }}`)).toBe('hi');
	});

	it('binds the result of a function call', () => {
		expect(
			render(`{% set t = states('sensor.washer') %}{{ t }}`, { stateLookup: lookup })
		).toBe('running');
	});

	it('uses bound dict literal + index access', () => {
		expect(
			render(
				`{% set modes = {'1': 'Ready', '2': 'Running'} %}{{ modes['2'] }}`
			)
		).toBe('Running');
	});

	it('uses bound list literal + index access', () => {
		expect(render(`{% set xs = [10, 20, 30] %}{{ xs[1] }}`)).toBe('20');
	});
});

describe('render — {% if %} / {% elif %} / {% else %}', () => {
	const lookup = makeStateLookup({
		'person.alfie': { state: 'home' },
		'person.elena': { state: 'not_home' }
	});

	it('renders the if branch when condition is truthy', () => {
		expect(
			render(`{% if is_state('person.alfie', 'home') %}home{% else %}out{% endif %}`, {
				stateLookup: lookup
			})
		).toBe('home');
	});

	it('renders the else branch when condition is falsy', () => {
		expect(
			render(`{% if is_state('person.elena', 'home') %}home{% else %}out{% endif %}`, {
				stateLookup: lookup
			})
		).toBe('out');
	});

	it('renders the elif branch', () => {
		expect(
			render(
				`{% set status = 'amber' %}{% if status == 'red' %}STOP{% elif status == 'amber' %}SLOW{% else %}GO{% endif %}`
			)
		).toBe('SLOW');
	});

	it('handles nested if blocks', () => {
		expect(
			render(`{% if true %}outer{% if true %} inner{% endif %} done{% endif %}`)
		).toBe('outer inner done');
	});
});

describe('render — filter pipe', () => {
	const ctx = {};

	it('applies upper', () => {
		expect(render(`{{ "hello" | upper }}`, ctx)).toBe('HELLO');
	});
	it('applies lower', () => {
		expect(render(`{{ "Hello" | lower }}`, ctx)).toBe('hello');
	});
	it('applies title', () => {
		expect(render(`{{ "hello world" | title }}`, ctx)).toBe('Hello World');
	});
	it('applies round (no args = 0 places)', () => {
		expect(render(`{{ 3.7 | round }}`, ctx)).toBe('4');
	});
	it('applies round with places arg', () => {
		expect(render(`{{ 3.14159 | round(2) }}`, ctx)).toBe('3.14');
	});
	it('applies default to empty', () => {
		expect(render(`{{ "" | default("fallback") }}`, ctx)).toBe('fallback');
	});
	it('applies default to non-empty (passes through)', () => {
		expect(render(`{{ "value" | default("fallback") }}`, ctx)).toBe('value');
	});
	it('applies int', () => {
		expect(render(`{{ "42" | int }}`, ctx)).toBe('42');
	});
	it('applies float', () => {
		expect(render(`{{ "3.14" | float }}`, ctx)).toBe('3.14');
	});
	it('applies length to a string', () => {
		expect(render(`{{ "hello" | length }}`, ctx)).toBe('5');
	});
	it('applies length to a list', () => {
		expect(render(`{{ [1, 2, 3] | length }}`, ctx)).toBe('3');
	});
	it('applies replace', () => {
		expect(render(`{{ "hello world" | replace("world", "there") }}`, ctx)).toBe('hello there');
	});
	it('chains filters', () => {
		expect(render(`{{ "hello" | upper | length }}`, ctx)).toBe('5');
	});
});

describe('render — ternary expression', () => {
	it('value if cond else other (cond truthy)', () => {
		expect(render(`{{ "yes" if true else "no" }}`)).toBe('yes');
	});
	it('value if cond else other (cond falsy)', () => {
		expect(render(`{{ "yes" if false else "no" }}`)).toBe('no');
	});
});

describe('render — real HA-style washer template', () => {
	const lookup = makeStateLookup({
		'sensor.wash_dryer_mode': { state: '2' },
		'sensor.wash_dryer_remaining_time': { state: '42' },
		'sensor.wash_dryer_programme': { state: 'Cotton 60' }
	});

	it('mushroom-template-card style render', () => {
		const tpl = `Washer {% set mode = states('sensor.wash_dryer_mode') %}{% set modes = {'1': 'Ready', '2': 'Running', '3': 'Done'} %}· {{ states('sensor.wash_dryer_programme') }} · {{ states('sensor.wash_dryer_remaining_time') }} min`;
		expect(render(tpl, { stateLookup: lookup })).toBe(
			'Washer · Cotton 60 · 42 min'
		);
	});
});

describe('render — error tolerance', () => {
	it('returns raw template on parse failure', () => {
		// Unbalanced braces; should fall back to raw template
		const broken = `{{ this is not valid syntax `;
		expect(render(broken)).toBe(broken);
	});

	it('passes through unknown function calls', () => {
		// Unknown function — call returns undefined → empty string
		expect(render(`{{ unknown_function('arg') }}`)).toBe('');
	});

	it('passes through plain text unchanged', () => {
		expect(render(`just plain text, no template`)).toBe('just plain text, no template');
	});
});
