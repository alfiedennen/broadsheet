/**
 * @broadsheet/harold-preset — Hitchcock prompt composition.
 *
 * Pins the prompt assembly so future tuning passes can't quietly
 * change the character. If the prompt body changes, these tests
 * need explicit updates — that's the point.
 */

import { describe, it, expect } from 'vitest';
import {
	buildPrompt,
	HITCHCOCK_BASE,
	VOICE_SUFFIX,
	WALL_SUFFIX,
	APP_SUFFIX,
	ITALIAN_DIRECTIVE
} from '../../../harold-preset/src/prompts/hitchcock';

describe('Hitchcock prompt composition', () => {
	it('voice surface = base + voice suffix', () => {
		const p = buildPrompt('voice');
		expect(p).toContain(HITCHCOCK_BASE);
		expect(p).toContain(VOICE_SUFFIX);
		expect(p).not.toContain(WALL_SUFFIX);
		expect(p).not.toContain(APP_SUFFIX);
	});

	it('wall surface = base + wall suffix (tighter rules)', () => {
		const p = buildPrompt('wall');
		expect(p).toContain(HITCHCOCK_BASE);
		expect(p).toContain(WALL_SUFFIX);
		expect(p).not.toContain(VOICE_SUFFIX);
	});

	it('app surface = base + app suffix (text channel, can use markdown)', () => {
		const p = buildPrompt('app');
		expect(p).toContain(HITCHCOCK_BASE);
		expect(p).toContain(APP_SUFFIX);
	});

	it('panel surface uses voice suffix (audio-out)', () => {
		const p = buildPrompt('panel');
		expect(p).toContain(VOICE_SUFFIX);
	});

	it('italian=true appends the Sistema directive', () => {
		const p = buildPrompt('voice', true);
		expect(p).toContain(ITALIAN_DIRECTIVE);
		expect(p).toContain('rispondi sempre in italiano');
	});

	it('italian=false omits the Sistema directive', () => {
		const p = buildPrompt('voice', false);
		expect(p).not.toContain(ITALIAN_DIRECTIVE);
	});
});

describe('Hitchcock character invariants', () => {
	it('base prompt establishes the silent-sentinel convention', () => {
		// The "~" sentinel for silent device control is the most
		// important behavioural rule. If this assertion fails, the
		// preset is silently breaking the no-confirmation contract
		// that makes the voice surface usable.
		expect(HITCHCOCK_BASE).toMatch(/single character "~"/);
		expect(HITCHCOCK_BASE).toMatch(/no speech, just do it/);
	});

	it('base prompt sets the British understatement register', () => {
		expect(HITCHCOCK_BASE).toMatch(/Hitchcock/);
		// "British understatement" wraps across lines in the source —
		// regex tolerates whitespace (incl. \n) between the two words.
		expect(HITCHCOCK_BASE).toMatch(/British\s+understatement/);
	});

	it('voice suffix caps replies at 2 sentences', () => {
		expect(VOICE_SUFFIX).toMatch(/2 sentences/);
	});

	it('wall suffix prefers silence over false-fires', () => {
		expect(WALL_SUFFIX).toMatch(/return "~"/);
		expect(WALL_SUFFIX).toMatch(/meeting/i);
	});
});
