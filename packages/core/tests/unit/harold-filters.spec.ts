/**
 * @broadsheet/harold-preset — input filters + Italian detection.
 *
 * Ported test cases from Harold Road's actual prompt-tuning suite
 * (voice_pipeline_battery.py + the voice_log.jsonl misfire archive
 * referenced in CLAUDE.md). If these regress, the wall surface
 * starts interrupting meetings + the Echo surface starts saying
 * "Pardon?" to real requests.
 */

import { describe, it, expect } from 'vitest';
import {
	isItalian,
	looksLikeRealRequestEcho,
	looksLikeRealRequestWall
} from '../../../harold-preset/src/lib/filters';

describe('isItalian', () => {
	it('detects two-marker Italian phrases', () => {
		expect(isItalian('che ore sono')).toBe(true); // "what time is it"
		expect(isItalian('accendi le luci della cucina')).toBe(true);
	});

	it('detects single-marker short utterances (≤4 words)', () => {
		expect(isItalian('ciao')).toBe(true);
		expect(isItalian('grazie mille')).toBe(true);
	});

	it('rejects English false positives', () => {
		expect(isItalian('turn on the lights')).toBe(false);
		expect(isItalian('what time is it')).toBe(false);
		expect(isItalian('hello there')).toBe(false);
	});

	it('rejects English with single accidental marker in longer phrase', () => {
		// "ora" isn't in our marker set, but "che" appears — single
		// marker in a 6-word sentence should NOT trigger
		expect(isItalian('that che cake is rather delicious indeed')).toBe(false);
	});

	it('handles empty + whitespace gracefully', () => {
		expect(isItalian('')).toBe(false);
		expect(isItalian('   ')).toBe(false);
	});
});

describe('looksLikeRealRequestEcho', () => {
	it('passes utterances containing house tokens', () => {
		expect(looksLikeRealRequestEcho('turn on the kitchen lights')).toBe(true);
		expect(looksLikeRealRequestEcho("what's the temperature")).toBe(true);
		expect(looksLikeRealRequestEcho('lock the front door')).toBe(true);
		expect(looksLikeRealRequestEcho('pause the music')).toBe(true);
	});

	it('passes ≥4-word first-person utterances', () => {
		expect(looksLikeRealRequestEcho("i'm going to bed now")).toBe(true);
		expect(looksLikeRealRequestEcho('can we have some music')).toBe(true);
	});

	it('drops ambient garbled bursts under 2 words', () => {
		expect(looksLikeRealRequestEcho('uh')).toBe(false);
		expect(looksLikeRealRequestEcho('ok')).toBe(false);
		expect(looksLikeRealRequestEcho('')).toBe(false);
	});

	it('drops short bursts with no house tokens + no first-person', () => {
		// 3-word ambient — no house token, no first-person → drop
		expect(looksLikeRealRequestEcho('he said yes')).toBe(false);
		expect(looksLikeRealRequestEcho('that was nice')).toBe(false);
	});
});

describe('looksLikeRealRequestWall', () => {
	it('passes utterances that self-reference Harold', () => {
		expect(looksLikeRealRequestWall('hey harold turn on the lights')).toBe(true);
		expect(looksLikeRealRequestWall('graves what time is it')).toBe(true);
	});

	it('passes imperative-verb starts', () => {
		expect(looksLikeRealRequestWall('turn the lights off')).toBe(true);
		expect(looksLikeRealRequestWall('play some music')).toBe(true);
		expect(looksLikeRealRequestWall('show me the weather')).toBe(true);
	});

	it('passes question-word starts', () => {
		expect(looksLikeRealRequestWall("what's on tonight")).toBe(true);
		expect(looksLikeRealRequestWall('how warm is the bedroom')).toBe(true);
	});

	it('passes utterances mentioning tight house nouns', () => {
		expect(looksLikeRealRequestWall("the kitchen's too cold")).toBe(true);
	});

	it('drops ambient call/meeting/podcast bursts (the 2026-05-11 wall misfires)', () => {
		// Real wall misfires from Harold Road's voice_log:
		expect(looksLikeRealRequestWall('thank you thank you')).toBe(false);
		expect(looksLikeRealRequestWall('yes look at that')).toBe(false);
		expect(looksLikeRealRequestWall("i think that's a great way to end my talk")).toBe(false);
		expect(looksLikeRealRequestWall('so anyway as i was saying')).toBe(false);
	});

	it('drops phatic verbs that the Echo filter would let through', () => {
		// "thank" / "look" / "is" are in HOUSE_TOKENS but NOT in the
		// tighter wall TIGHT_HOUSE_NOUNS set; this is the deliberate
		// difference between the two filters.
		expect(looksLikeRealRequestWall('thank you for that')).toBe(false);
		expect(looksLikeRealRequestWall('look at this is amazing')).toBe(false);
	});
});
