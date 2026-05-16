/**
 * Voice substrate — discovery layer.
 *
 * Lists every HA conversation agent, TTS engine, STT engine, wake-
 * word engine, and assist_pipeline. Exposed to the rest of broadsheet
 * via the plugin's discoveryContributor — the merged result lands at
 * `discovery.plugins.voice.*`.
 *
 * All reads are HA WS one-shots; no event subscription yet (HA's
 * pipeline registry doesn't emit deltas reliably in 2024.x). The
 * settings panel refreshes manually on open + on user mutation, which
 * is fine for the v0.1 cadence.
 *
 * Spec: docs/plans/plan-voice-substrate.md.
 */

import type {
	AssistPipeline,
	ConversationAgent,
	SttEngine,
	TtsEngine,
	WakeWordEngine,
	VoiceDiscovery
} from './types';

interface HassConnectionLike {
	sendMessagePromise<T>(message: Record<string, unknown>): Promise<T>;
}

interface PipelinesResponse {
	pipelines: AssistPipeline[];
	preferred_pipeline: string | null;
}

interface AgentsResponse {
	agents: ConversationAgent[];
}

interface EnginesResponse<T> {
	providers: T[];
}

/**
 * Stringify HA WS error rejections sensibly. The home-assistant-js-websocket
 * library rejects with plain objects of shape `{ code: string, message: string }`
 * (not Error instances), so `String(err)` would give "[object Object]". Drill
 * into the shape; fall through to JSON if we don't recognise it.
 */
function errorToMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	if (err && typeof err === 'object') {
		const e = err as { message?: unknown; code?: unknown; error?: unknown };
		if (typeof e.message === 'string' && e.message) {
			return typeof e.code === 'string' ? `${e.message} (${e.code})` : e.message;
		}
		if (typeof e.code === 'string') return e.code;
		if (typeof e.error === 'string') return e.error;
		try {
			return JSON.stringify(err);
		} catch {
			return '[unstringifiable error]';
		}
	}
	return String(err);
}

async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<{
	value: T;
	error: string | null;
}> {
	try {
		return { value: await p, error: null };
	} catch (err) {
		const msg = errorToMessage(err);
		// eslint-disable-next-line no-console
		console.warn(`[@broadsheet/voice] ${label}: ${msg}`);
		return { value: fallback, error: msg };
	}
}

/**
 * Pull every voice-related thing HA knows about. One pass; the
 * caller decides how often to refresh (settings panel: on open +
 * on toggle; runtime: not at all — we cache the snapshot).
 */
export async function pullVoiceDiscovery(
	conn: HassConnectionLike
): Promise<VoiceDiscovery> {
	// Issue four reads in parallel. Per-call failures degrade
	// gracefully — a HA install without TTS still gets a populated
	// agents + pipelines list, and the settings panel can warn about
	// the missing piece.
	//
	// `wake_word/info` deliberately omitted: HA's wake-word API
	// requires a per-entity_id query, not a list endpoint. Surfacing
	// wake-word coverage is done via core's regular device/entity
	// discovery (the wake_word domain entities are already there).
	// Plan-voice-substrate.md flagged this as wake-word discovery
	// "best-effort"; for v0.1 we just return [] and the settings
	// panel hides the wake-word strip.
	const [pipelinesR, agentsR, ttsR, sttR] = await Promise.all([
		safe<PipelinesResponse>(
			'assist_pipeline/pipeline/list',
			conn.sendMessagePromise({ type: 'assist_pipeline/pipeline/list' }),
			{ pipelines: [], preferred_pipeline: null }
		),
		safe<AgentsResponse>(
			'conversation/agent/list',
			conn.sendMessagePromise({ type: 'conversation/agent/list' }),
			{ agents: [] }
		),
		safe<EnginesResponse<TtsEngine>>(
			'tts/engine/list',
			conn.sendMessagePromise({ type: 'tts/engine/list' }),
			{ providers: [] }
		),
		safe<EnginesResponse<SttEngine>>(
			'stt/engine/list',
			conn.sendMessagePromise({ type: 'stt/engine/list' }),
			{ providers: [] }
		)
	]);

	const firstError = pipelinesR.error ?? agentsR.error ?? ttsR.error ?? sttR.error;

	return {
		pipelines: pipelinesR.value.pipelines ?? [],
		preferredPipelineId: pipelinesR.value.preferred_pipeline ?? null,
		agents: agentsR.value.agents ?? [],
		tts: ttsR.value.providers ?? [],
		stt: sttR.value.providers ?? [],
		wakeWords: [],
		booted: true,
		lastError: firstError
	};
}

/**
 * Resolve the active pipeline given a config + discovery snapshot.
 *
 * Falls through:
 *   1. Explicit `activePipelineId` if set + still exists
 *   2. HA's `preferred_pipeline` if it exists in the list
 *   3. The first pipeline (HA always has at least one — the "Home
 *      Assistant" default — once Assist is configured)
 *   4. null if no pipelines exist at all (degraded mode; UI flags it)
 */
export function resolveActivePipeline(
	discovery: VoiceDiscovery,
	activePipelineId: string | null
): AssistPipeline | null {
	if (activePipelineId) {
		const m = discovery.pipelines.find((p) => p.id === activePipelineId);
		if (m) return m;
	}
	if (discovery.preferredPipelineId) {
		const m = discovery.pipelines.find((p) => p.id === discovery.preferredPipelineId);
		if (m) return m;
	}
	return discovery.pipelines[0] ?? null;
}

/**
 * Editorial summary line for /settings/voice — "Whisper + Claude Haiku
 * + ElevenLabs · 4 wake-word satellites".
 */
export function pipelineSummary(
	pipeline: AssistPipeline | null,
	discovery: VoiceDiscovery
): string {
	if (!pipeline) return 'No pipeline configured.';
	const stt = discovery.stt.find((e) => e.id === pipeline.stt_engine)?.name ?? 'no STT';
	const agent = discovery.agents.find((a) => a.id === pipeline.conversation_engine)?.name ?? pipeline.conversation_engine;
	const tts = discovery.tts.find((e) => e.id === pipeline.tts_engine)?.name ?? 'no TTS';
	return `${stt} + ${agent} + ${tts}`;
}
