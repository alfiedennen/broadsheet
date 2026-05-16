/**
 * @broadsheet/voice — discovery resolution + summary contracts.
 *
 * resolveActivePipeline + pipelineSummary are the bridge between
 * "what HA installed" and "what broadsheet's voice surfaces use".
 * Pin the fall-through order so future refactors can't quietly
 * change which pipeline runs by default.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	resolveActivePipeline,
	pipelineSummary,
	pullVoiceDiscovery
} from '../../../voice/src/lib/discovery';
import type { AssistPipeline, VoiceDiscovery } from '../../../voice/src/lib/types';

function pipe(id: string, opts: Partial<AssistPipeline> = {}): AssistPipeline {
	return {
		id,
		name: id,
		conversation_engine: 'conversation.home_assistant',
		conversation_language: 'en-GB',
		stt_engine: null,
		stt_language: null,
		tts_engine: null,
		tts_language: null,
		tts_voice: null,
		wake_word_entity: null,
		wake_word_id: null,
		language: 'en-GB',
		...opts
	};
}

function disc(pipelines: AssistPipeline[], preferredId: string | null = null): VoiceDiscovery {
	return {
		pipelines,
		preferredPipelineId: preferredId,
		agents: [],
		tts: [],
		stt: [],
		wakeWords: [],
		booted: true,
		lastError: null
	};
}

describe('resolveActivePipeline', () => {
	it('returns null when no pipelines exist', () => {
		expect(resolveActivePipeline(disc([]), null)).toBeNull();
	});

	it('returns the explicit activeId when set + exists', () => {
		const p = pipe('chosen');
		const result = resolveActivePipeline(disc([pipe('preferred'), p]), 'chosen');
		expect(result?.id).toBe('chosen');
	});

	it('falls through to preferredPipelineId when activeId is missing', () => {
		const result = resolveActivePipeline(
			disc([pipe('preferred'), pipe('other')], 'preferred'),
			null
		);
		expect(result?.id).toBe('preferred');
	});

	it('falls through to first pipeline when no preferred + no active', () => {
		const result = resolveActivePipeline(disc([pipe('first'), pipe('other')]), null);
		expect(result?.id).toBe('first');
	});

	it('falls through to first when activeId references a nonexistent pipeline', () => {
		const result = resolveActivePipeline(
			disc([pipe('first'), pipe('other')]),
			'ghost'
		);
		expect(result?.id).toBe('first');
	});
});

describe('pipelineSummary', () => {
	it('returns "no pipeline" message when pipeline is null', () => {
		expect(pipelineSummary(null, disc([]))).toMatch(/No pipeline/);
	});

	it('composes "STT + agent + TTS" line with engine names', () => {
		const p = pipe('p1', {
			stt_engine: 'stt.whisper',
			conversation_engine: 'conversation.anthropic',
			tts_engine: 'tts.elevenlabs'
		});
		const d: VoiceDiscovery = {
			...disc([p]),
			stt: [{ id: 'stt.whisper', name: 'Whisper' }],
			agents: [
				{ id: 'conversation.anthropic', name: 'Anthropic', supported_languages: '*' }
			],
			tts: [{ id: 'tts.elevenlabs', name: 'ElevenLabs' }]
		};
		expect(pipelineSummary(p, d)).toBe('Whisper + Anthropic + ElevenLabs');
	});

	it('falls back to engine ids when names are not in the discovery snapshot', () => {
		const p = pipe('p1', {
			stt_engine: 'unknown.stt',
			conversation_engine: 'unknown.agent',
			tts_engine: 'unknown.tts'
		});
		const result = pipelineSummary(p, disc([p]));
		expect(result).toContain('no STT');
		expect(result).toContain('unknown.agent');
		expect(result).toContain('no TTS');
	});
});

describe('pullVoiceDiscovery (resilience)', () => {
	it('returns a populated snapshot when every WS call succeeds', async () => {
		const conn = {
			sendMessagePromise: vi
				.fn()
				.mockResolvedValueOnce({
					pipelines: [pipe('a')],
					preferred_pipeline: 'a'
				})
				.mockResolvedValueOnce({ agents: [] })
				.mockResolvedValueOnce({ providers: [] })
				.mockResolvedValueOnce({ providers: [] })
		};
		const result = await pullVoiceDiscovery(conn);
		expect(result.booted).toBe(true);
		expect(result.lastError).toBeNull();
		expect(result.pipelines).toHaveLength(1);
		expect(result.preferredPipelineId).toBe('a');
	});

	it('degrades gracefully when one WS call rejects', async () => {
		const conn = {
			sendMessagePromise: vi
				.fn()
				.mockResolvedValueOnce({
					pipelines: [pipe('a')],
					preferred_pipeline: 'a'
				})
				.mockResolvedValueOnce({ agents: [] })
				.mockRejectedValueOnce(new Error('tts not installed'))
				.mockResolvedValueOnce({ providers: [] })
		};
		const result = await pullVoiceDiscovery(conn);
		expect(result.booted).toBe(true);
		expect(result.pipelines).toHaveLength(1);
		expect(result.tts).toEqual([]);
		// One of the calls reported an error
		expect(result.lastError).toMatch(/tts not installed/);
	});

	it('formats HA WS plain-object rejections into legible strings', async () => {
		// HA's WS library rejects with {code, message} not Error
		// instances. The errorToMessage helper must drill into that.
		const conn = {
			sendMessagePromise: vi
				.fn()
				.mockRejectedValueOnce({
					code: 'invalid_format',
					message: 'required key not provided @ data[entity_id]'
				})
				.mockResolvedValueOnce({ agents: [] })
				.mockResolvedValueOnce({ providers: [] })
				.mockResolvedValueOnce({ providers: [] })
		};
		const result = await pullVoiceDiscovery(conn);
		expect(result.lastError).not.toBeNull();
		expect(result.lastError).not.toContain('[object Object]');
		expect(result.lastError).toContain('required key not provided');
		expect(result.lastError).toContain('invalid_format');
	});
});
