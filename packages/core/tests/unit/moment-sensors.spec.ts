/**
 * Moment-sensor heuristic tests.
 *
 * Verifies the auto-discovery + cheap/ordinary/expensive band logic
 * behind `/`'s Hallway 17°C and Electricity ordinary at 15p clauses.
 *
 * Rubric coverage: P1-S2 (familiar HA surfaces — moment manifest
 * adapts to the user's actual sensors without configuration).
 */

import { describe, it, expect } from 'vitest';
import {
	resolveIndoorTempSensor,
	resolveElectricityRateSensor,
	indoorTempClause,
	electricityRateClause,
	highlightValues,
	listIndoorTempCandidates,
	listElectricityRateCandidates
} from '$lib/manifest/momentSensors';
import type { State } from '$lib/ha/types';

function s(state: string, attributes: Record<string, unknown> = {}): State {
	return {
		entity_id: '',
		state,
		attributes,
		last_changed: '2026-05-15T00:00:00.000Z',
		last_updated: '2026-05-15T00:00:00.000Z'
	} as State;
}

describe('resolveIndoorTempSensor — auto-discovery preferences', () => {
	it('prefers hallway when present', () => {
		const states = {
			'sensor.bedroom_temperature': s('19', { device_class: 'temperature', unit_of_measurement: '°C' }),
			'sensor.hallway_temperature': s('17', { device_class: 'temperature', unit_of_measurement: '°C' }),
			'sensor.kitchen_temperature': s('22', { device_class: 'temperature', unit_of_measurement: '°C' })
		};
		expect(resolveIndoorTempSensor(states, undefined)).toBe('sensor.hallway_temperature');
	});

	it('falls back to living_room when no hallway', () => {
		const states = {
			'sensor.bedroom_temperature': s('19', { device_class: 'temperature' }),
			'sensor.living_room_temperature': s('20', { device_class: 'temperature' })
		};
		expect(resolveIndoorTempSensor(states, undefined)).toBe('sensor.living_room_temperature');
	});

	it('skips outdoor / weather / appliance sensors', () => {
		const states = {
			'sensor.outdoor_temperature': s('5', { device_class: 'temperature' }),
			'sensor.fridge_temperature': s('3', { device_class: 'temperature' }),
			'sensor.weather_forecast_temp': s('5', { device_class: 'temperature' }),
			'sensor.living_room_temperature': s('21', { device_class: 'temperature' })
		};
		expect(resolveIndoorTempSensor(states, undefined)).toBe('sensor.living_room_temperature');
	});

	it('returns null when no temperature sensors discovered', () => {
		const states = { 'light.x': s('on') };
		expect(resolveIndoorTempSensor(states, undefined)).toBeNull();
	});

	it('honours curated pin when entity exists', () => {
		const states = {
			'sensor.hallway_temperature': s('17', { device_class: 'temperature' }),
			'sensor.bedroom_temperature': s('19', { device_class: 'temperature' })
		};
		expect(resolveIndoorTempSensor(states, 'sensor.bedroom_temperature')).toBe(
			'sensor.bedroom_temperature'
		);
	});

	it('treats empty-string curated as explicit OFF', () => {
		const states = {
			'sensor.hallway_temperature': s('17', { device_class: 'temperature' })
		};
		expect(resolveIndoorTempSensor(states, '')).toBeNull();
	});

	it('falls back to auto when curated pin no longer exists', () => {
		const states = {
			'sensor.hallway_temperature': s('17', { device_class: 'temperature' })
		};
		expect(resolveIndoorTempSensor(states, 'sensor.deleted')).toBe(
			'sensor.hallway_temperature'
		);
	});
});

describe('indoorTempClause — output formatting', () => {
	it('produces "Hallway 17°C." for the canonical case', () => {
		const states = {
			'sensor.hallway_temperature': s('17', {
				device_class: 'temperature',
				unit_of_measurement: '°C'
			})
		};
		const areaName = (id: string) => (id === 'sensor.hallway_temperature' ? 'Hallway' : null);
		expect(indoorTempClause(states, undefined, areaName)).toBe('Hallway 17°C.');
	});

	it('falls back to entity-id-derived label when no area function', () => {
		const states = {
			'sensor.hallway_temperature': s('17', {
				device_class: 'temperature',
				unit_of_measurement: '°C'
			})
		};
		expect(indoorTempClause(states, undefined)).toBe('Hallway 17°C.');
	});

	it('returns null when explicitly off', () => {
		const states = {
			'sensor.hallway_temperature': s('17', { device_class: 'temperature' })
		};
		expect(indoorTempClause(states, '')).toBeNull();
	});

	it('rounds to integer for display', () => {
		const states = {
			'sensor.hallway_temperature': s('17.6', {
				device_class: 'temperature',
				unit_of_measurement: '°C'
			})
		};
		expect(indoorTempClause(states, undefined)).toBe('Hallway 18°C.');
	});
});

describe('resolveElectricityRateSensor — Octopus first', () => {
	it('prefers octopus_energy_*_current_rate', () => {
		const states = {
			'sensor.electricity_rate': s('0.20', { unit_of_measurement: 'GBP/kWh' }),
			'sensor.octopus_energy_electricity_a1b2_current_rate': s('0.15', {
				unit_of_measurement: 'GBP/kWh'
			})
		};
		expect(resolveElectricityRateSensor(states, undefined)).toBe(
			'sensor.octopus_energy_electricity_a1b2_current_rate'
		);
	});

	it('falls through to generic rate sensor', () => {
		const states = {
			'sensor.electricity_rate': s('0.20', { unit_of_measurement: 'GBP/kWh' })
		};
		expect(resolveElectricityRateSensor(states, undefined)).toBe('sensor.electricity_rate');
	});

	it('returns null when no rate sensors discovered', () => {
		expect(resolveElectricityRateSensor({}, undefined)).toBeNull();
	});

	it('curated pin wins over auto-discovery', () => {
		const states = {
			'sensor.octopus_energy_electricity_x_current_rate': s('0.15', {
				unit_of_measurement: 'GBP/kWh'
			}),
			'sensor.my_custom_rate': s('0.20', { unit_of_measurement: 'p/kWh' })
		};
		expect(resolveElectricityRateSensor(states, 'sensor.my_custom_rate')).toBe(
			'sensor.my_custom_rate'
		);
	});
});

describe('electricityRateClause — three-band classification', () => {
	it('cheap band (< 12p) — pence/kWh sensor', () => {
		const states = {
			'sensor.electricity_rate': s('8', { unit_of_measurement: 'p/kWh' })
		};
		expect(electricityRateClause(states, undefined)).toBe('Electricity cheap at 8p.');
	});

	it('ordinary band (12-22p) — pence/kWh sensor', () => {
		const states = {
			'sensor.electricity_rate': s('17', { unit_of_measurement: 'p/kWh' })
		};
		expect(electricityRateClause(states, undefined)).toBe('Electricity ordinary at 17p.');
	});

	it('expensive band (≥ 22p) — pence/kWh sensor', () => {
		const states = {
			'sensor.electricity_rate': s('32', { unit_of_measurement: 'p/kWh' })
		};
		expect(electricityRateClause(states, undefined)).toBe('Electricity expensive at 32p.');
	});

	it('GBP/kWh fraction is normalised to pence', () => {
		const states = {
			'sensor.octopus_energy_electricity_x_current_rate': s('0.15', {
				unit_of_measurement: 'GBP/kWh'
			})
		};
		expect(electricityRateClause(states, undefined)).toBe('Electricity ordinary at 15p.');
	});

	it('explicit-off curated returns null', () => {
		const states = {
			'sensor.electricity_rate': s('15', { unit_of_measurement: 'p/kWh' })
		};
		expect(electricityRateClause(states, '')).toBeNull();
	});
});

describe('highlightValues — em-pop on numbers + descriptors', () => {
	it('wraps temperatures in <em>', () => {
		expect(highlightValues('Hallway 17°C.')).toBe('Hallway <em>17°C</em>.');
	});

	it('wraps rate values + descriptor', () => {
		expect(highlightValues('Electricity cheap at 8p.')).toBe(
			'Electricity <em>cheap</em> at <em>8p</em>.'
		);
	});

	it('does not wrap "cheap" outside the Electricity prefix', () => {
		expect(highlightValues('A cheap thing.')).toBe('A cheap thing.');
	});

	it('escapes HTML before applying inline syntax', () => {
		// The `<` should be escaped, so the wrap pattern still works on the
		// numeric afterward
		expect(highlightValues('<script>')).toBe('&lt;script&gt;');
	});

	it('handles multiple numbers in one string', () => {
		expect(highlightValues('Outside 9.8°C, hallway 17°C.')).toBe(
			'Outside <em>9.8°C</em>, hallway <em>17°C</em>.'
		);
	});
});

describe('candidate listing — for the picker UI', () => {
	it('listIndoorTempCandidates filters out outdoor sensors', () => {
		const states = {
			'sensor.outdoor_temp': s('5', { device_class: 'temperature' }),
			'sensor.living_room_temp': s('21', { device_class: 'temperature' }),
			'sensor.fridge_temp': s('3', { device_class: 'temperature' })
		};
		const cands = listIndoorTempCandidates(states);
		expect(cands).toEqual(['sensor.living_room_temp']);
	});

	it('listElectricityRateCandidates includes all rate sensors', () => {
		const states = {
			'sensor.electricity_rate': s('0.15', { unit_of_measurement: 'GBP/kWh' }),
			'sensor.octopus_energy_electricity_x_current_rate': s('0.15', {
				unit_of_measurement: 'GBP/kWh'
			}),
			'sensor.unrelated': s('on')
		};
		const cands = listElectricityRateCandidates(states);
		expect(cands.length).toBeGreaterThanOrEqual(2);
		expect(cands).toContain('sensor.electricity_rate');
		expect(cands).toContain('sensor.octopus_energy_electricity_x_current_rate');
	});
});
