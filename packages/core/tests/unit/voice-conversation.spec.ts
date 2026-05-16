/**
 * @broadsheet/voice — conversation routing contract.
 *
 * The HA-native-first router is the single most-important piece of
 * voice logic; if it gets cost-optimisation wrong every utterance
 * goes to the LLM. These tests pin the routing decisions against
 * a fake HA WS connection so future refactors can't quietly slip.
 *
 * Routing rules under test:
 *   - haNativeFirst=true + pipeline.engine !== HA-native →
 *     conversation/process is called TWICE max (HA-native, then LLM)
 *     OR ONCE if HA-native succeeds.
 *   - HA-native action_done with EMPTY speech → silent reply, via=ha-native
 *   - HA-native action_done with speech → speech is the reply, via=ha-native
 *   - HA-native query_answer → speech is the reply, via=ha-native
 *   - HA-native error: code=no_intent_match → fall through to LLM
 *   - HA-native error: any OTHER code → return HA's friendly error,
 *     DON'T fall through (device-control guard)
 *   - haNativeFirst=false → skip HA-native, call LLM directly
 *   - pipeline already pinned to HA-native engine → skip HA-native
 *     pre-call (would be redundant)
 *   - LLM agent throws → return turn with error string
 */

import { describe, it, expect, vi } from 'vitest';
import { routeUtterance } from '../../../voice/src/lib/conversation';
import type { AssistPipeline, TranscriptTurn } from '../../../voice/src/lib/types';

function fakePipeline(engine: string): AssistPipeline {
	return {
		id: 'p1',
		name: 'Test',
		conversation_engine: engine,
		conversation_language: 'en-GB',
		stt_engine: null,
		stt_language: null,
		tts_engine: null,
		tts_language: null,
		tts_voice: null,
		wake_word_entity: null,
		wake_word_id: null,
		language: 'en-GB'
	};
}

function fakeTurn(text: string): TranscriptTurn {
	return {
		id: 't1',
		timestamp: 1,
		utterance: text,
		reply: null,
		via: 'unknown',
		spoke: false,
		error: null
	};
}

function fakeResponse(opts: {
	type: 'action_done' | 'query_answer' | 'error';
	speech?: string;
	code?: string;
}): unknown {
	return {
		conversation_id: 'c1',
		response: {
			response_type: opts.type,
			speech: opts.speech !== undefined ? { plain: { speech: opts.speech } } : undefined,
			data: opts.code ? { code: opts.code } : undefined
		}
	};
}

describe('voice routing: HA-native first', () => {
	it('action_done with EMPTY speech → silent reply, via=ha-native, ONE call', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({ type: 'action_done', speech: '' })
		);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'turn on kitchen lights',
			turn: fakeTurn('turn on kitchen lights'),
			useMiddleware: false
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(sendMessagePromise.mock.calls[0][0].agent_id).toBe('conversation.home_assistant');
		expect(r.turn.via).toBe('ha-native');
		expect(r.turn.reply).toBe('');
		expect(r.turn.spoke).toBe(false);
		expect(r.speech).toBeUndefined();
	});

	it('action_done with speech → spoken reply, via=ha-native, ONE call', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({ type: 'action_done', speech: 'Turned on the kitchen lights.' })
		);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'turn on kitchen lights',
			turn: fakeTurn('turn on kitchen lights'),
			useMiddleware: false
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(r.turn.via).toBe('ha-native');
		expect(r.turn.reply).toBe('Turned on the kitchen lights.');
		expect(r.turn.spoke).toBe(true);
		expect(r.speech?.text).toBe('Turned on the kitchen lights.');
	});

	it('query_answer → spoken reply, via=ha-native, ONE call', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({ type: 'query_answer', speech: 'It is 11:42.' })
		);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'what time is it',
			turn: fakeTurn('what time is it')
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(r.turn.via).toBe('ha-native');
		expect(r.turn.spoke).toBe(true);
		expect(r.turn.reply).toBe('It is 11:42.');
	});

	it('error: no_intent_match → falls through to LLM (2 calls)', async () => {
		const sendMessagePromise = vi
			.fn()
			.mockResolvedValueOnce(fakeResponse({ type: 'error', code: 'no_intent_match' }))
			.mockResolvedValueOnce(
				fakeResponse({ type: 'query_answer', speech: '42, obviously.' })
			);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'meaning of life?',
			turn: fakeTurn('meaning of life?')
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(2);
		expect(sendMessagePromise.mock.calls[0][0].agent_id).toBe('conversation.home_assistant');
		expect(sendMessagePromise.mock.calls[1][0].agent_id).toBe('conversation.openai');
		expect(r.turn.via).toBe('llm');
		expect(r.turn.reply).toBe('42, obviously.');
	});

	it('error: no_valid_targets → device-control guard, ONE call, error surfaced, NO LLM fall-through', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({
				type: 'error',
				code: 'no_valid_targets',
				speech: "Sorry, I don't know which lights you mean."
			})
		);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'turn on the made-up light',
			turn: fakeTurn('turn on the made-up light')
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(r.turn.via).toBe('ha-native');
		expect(r.turn.error).toBe('no_valid_targets');
		expect(r.turn.reply).toBe("Sorry, I don't know which lights you mean.");
	});

	it('error: failed_to_handle → device-control guard, NO LLM fall-through', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({ type: 'error', code: 'failed_to_handle', speech: 'Failed.' })
		);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'do something',
			turn: fakeTurn('do something')
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(r.turn.error).toBe('failed_to_handle');
	});

	it('haNativeFirst=false → skips HA-native, calls LLM directly', async () => {
		const sendMessagePromise = vi
			.fn()
			.mockResolvedValueOnce(fakeResponse({ type: 'query_answer', speech: 'Hi.' }));
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'hi',
			turn: fakeTurn('hi'),
			haNativeFirst: false
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(sendMessagePromise.mock.calls[0][0].agent_id).toBe('conversation.openai');
		expect(r.turn.via).toBe('llm');
	});

	it('pipeline pinned to HA-native engine → skips HA-native pre-call', async () => {
		const sendMessagePromise = vi
			.fn()
			.mockResolvedValueOnce(fakeResponse({ type: 'action_done', speech: '' }));
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.home_assistant'),
			text: 'turn on kitchen',
			turn: fakeTurn('turn on kitchen')
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(1);
		expect(sendMessagePromise.mock.calls[0][0].agent_id).toBe('conversation.home_assistant');
		expect(r.turn.via).toBe('llm');
	});

	it('LLM throws → returns turn with error, no crash', async () => {
		const sendMessagePromise = vi
			.fn()
			.mockResolvedValueOnce(fakeResponse({ type: 'error', code: 'no_intent_match' }))
			.mockRejectedValueOnce(new Error('connection refused'));
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'hi',
			turn: fakeTurn('hi')
		});
		expect(r.turn.error).toBe('connection refused');
		expect(r.turn.reply).toBeNull();
		expect(r.speech).toBeUndefined();
	});

	it('HA-native throws → falls through to LLM (does not block)', async () => {
		const sendMessagePromise = vi
			.fn()
			.mockRejectedValueOnce(new Error('ha-native down'))
			.mockResolvedValueOnce(
				fakeResponse({ type: 'query_answer', speech: 'LLM caught it.' })
			);
		const r = await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'hi',
			turn: fakeTurn('hi')
		});
		expect(sendMessagePromise).toHaveBeenCalledTimes(2);
		expect(r.turn.via).toBe('llm');
		expect(r.turn.reply).toBe('LLM caught it.');
	});
});

describe('voice routing: discovery + active pipeline resolution', () => {
	it('passes language through to conversation/process', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({ type: 'query_answer', speech: 'OK.' })
		);
		await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: { ...fakePipeline('conversation.openai'), conversation_language: 'it' },
			text: 'ciao',
			turn: fakeTurn('ciao'),
			language: 'it'
		});
		// HA-native attempt uses the passed language
		expect(sendMessagePromise.mock.calls[0][0].language).toBe('it');
	});

	it('passes conversation_id through to conversation/process', async () => {
		const sendMessagePromise = vi.fn().mockResolvedValueOnce(
			fakeResponse({ type: 'query_answer', speech: 'OK.' })
		);
		await routeUtterance({
			conn: { sendMessagePromise },
			pipeline: fakePipeline('conversation.openai'),
			text: 'follow up',
			turn: fakeTurn('follow up'),
			conversationId: 'conv-abc'
		});
		expect(sendMessagePromise.mock.calls[0][0].conversation_id).toBe('conv-abc');
	});
});
