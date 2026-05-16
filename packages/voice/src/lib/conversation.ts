/**
 * Voice substrate — conversation routing.
 *
 * One utterance goes in, one routed response comes out. The routing
 * decision:
 *
 *   1. If `haNativeFirst` is true AND the active pipeline isn't already
 *      pinned to conversation.home_assistant: try `conversation.home_assistant`
 *      FIRST. HA-native intent matching is sub-200ms + free + already
 *      knows the user's lights/scenes/climate/locks. If it matches, we
 *      use that response and STOP. The configured LLM agent is never
 *      called for routine device control.
 *   2. If HA-native returned `no_intent_match` (truly unrecognised
 *      input — questions, conversation, research): fall through to the
 *      user-configured agent (Whisper, OpenAI, Anthropic, etc).
 *   3. If HA-native returned any OTHER error (no_valid_targets,
 *      failed_to_handle, etc — HA understood the intent as device control
 *      but couldn't find a matching entity): return HA's friendly error
 *      and DON'T fall through. This stops the LLM agent inventing
 *      workarounds for device-control failures. (Same logic Harold
 *      Road landed in `harold_conversation/conversation.py` — see that
 *      file's "Device-control guard" note for the 2026-05-04 incident
 *      that motivated it.)
 *
 * Returns a TranscriptTurn shape; the caller persists it via the
 * transcript bus + plays any speech via the TTS module.
 *
 * Spec: docs/plans/plan-voice-substrate.md.
 */

import type {
	AssistPipeline,
	ConversationResult,
	MiddlewareContext,
	TranscriptTurn
} from './types';
import { assemblePromptPrefix, fireOnTurn, runPreFilters } from './middleware.svelte';

interface HassConnectionLike {
	sendMessagePromise<T>(message: Record<string, unknown>): Promise<T>;
}

interface ConversationProcessResponse {
	conversation_id: string;
	response: {
		response_type: 'action_done' | 'query_answer' | 'error';
		speech?: {
			plain?: { speech?: string };
		};
		data?: {
			code?: string; // 'no_intent_match' | 'no_valid_targets' | 'failed_to_handle' | ...
			targets?: unknown[];
		};
		card?: unknown;
		language?: string;
	};
}

const HA_NATIVE_AGENT_ID = 'conversation.home_assistant';

/**
 * Send a single conversation/process call and parse the response shape.
 * `speech_slots` presence is the discriminator for "spoke" vs "silent".
 */
async function callAgent(
	conn: HassConnectionLike,
	agentId: string,
	text: string,
	conversationId: string | null,
	language?: string
): Promise<ConversationProcessResponse> {
	const msg: Record<string, unknown> = {
		type: 'conversation/process',
		text,
		agent_id: agentId
	};
	if (conversationId) msg.conversation_id = conversationId;
	if (language) msg.language = language;
	return await conn.sendMessagePromise<ConversationProcessResponse>(msg);
}

function speechFrom(r: ConversationProcessResponse): string {
	return r.response?.speech?.plain?.speech ?? '';
}

function isNoIntentMatch(r: ConversationProcessResponse): boolean {
	return (
		r.response?.response_type === 'error' &&
		r.response?.data?.code === 'no_intent_match'
	);
}

function isDeviceError(r: ConversationProcessResponse): boolean {
	// Any error code OTHER than no_intent_match means HA understood
	// the intent but failed to act on it. Don't fall through.
	return (
		r.response?.response_type === 'error' &&
		r.response?.data?.code !== undefined &&
		r.response?.data?.code !== 'no_intent_match'
	);
}

export interface RouteOptions {
	conn: HassConnectionLike;
	pipeline: AssistPipeline;
	text: string;
	conversationId?: string | null;
	language?: string;
	/** True (default) routes HA-native first; false sends straight to pipeline's agent. */
	haNativeFirst?: boolean;
	/** beginTurn handle from the transcript bus — caller's responsibility. */
	turn: TranscriptTurn;
	/** Free-form tags forwarded to middleware (e.g. surface = 'pill' | '/voice'). */
	tags?: Record<string, string>;
	/**
	 * If true (default), runs registered VoiceMiddleware around the
	 * call: preFilter / wrapSystemPrompt / memoryInject / onTurn.
	 * Set false in test code to keep the router pure.
	 */
	useMiddleware?: boolean;
}

/**
 * Route one utterance and shape a ConversationResult. Doesn't touch
 * the transcript bus or TTS — those are the caller's job, so the same
 * routing logic works for /voice's push-to-talk + the satellite-driven
 * conversation flows + Harold preset's prompt-wrapped variant.
 */
export async function routeUtterance(opts: RouteOptions): Promise<ConversationResult> {
	const {
		conn,
		pipeline,
		text,
		conversationId = null,
		language,
		haNativeFirst = true,
		tags,
		useMiddleware = true
	} = opts;

	const lang = language ?? pipeline.conversation_language;
	const ctx: MiddlewareContext = {
		text,
		pipeline,
		language: lang,
		tags
	};

	// ── Middleware: preFilter ─────────────────────────────────────
	// Presets can short-circuit (return null → silent reply) or
	// rewrite the utterance (Italian detection → prepend a Sistema
	// directive) before any HA call.
	let effectiveText = text;
	if (useMiddleware) {
		const filtered = await runPreFilters(ctx);
		if (filtered === null) {
			const silentTurn = {
				...opts.turn,
				reply: '',
				via: 'ha-native' as const,
				spoke: false,
				error: null
			};
			if (useMiddleware) await fireOnTurn(silentTurn, ctx);
			return { turn: silentTurn };
		}
		effectiveText = filtered;
		ctx.text = filtered;
	}

	const useNative =
		haNativeFirst && pipeline.conversation_engine !== HA_NATIVE_AGENT_ID;

	// Helper to finalise + fire onTurn observers
	const finalise = async (result: ConversationResult): Promise<ConversationResult> => {
		if (useMiddleware) await fireOnTurn(result.turn, ctx);
		return result;
	};

	// Step 1: HA-native attempt (when applicable)
	if (useNative) {
		try {
			const native = await callAgent(
				conn,
				HA_NATIVE_AGENT_ID,
				effectiveText,
				conversationId,
				lang
			);
			const respType = native.response?.response_type;
			if (respType === 'action_done') {
				const speech = speechFrom(native);
				return finalise({
					turn: {
						...opts.turn,
						reply: speech || '',
						via: 'ha-native',
						spoke: speech.length > 0,
						error: null
					},
					speech: speech ? { text: speech } : undefined
				});
			}
			if (respType === 'query_answer') {
				const speech = speechFrom(native);
				return finalise({
					turn: {
						...opts.turn,
						reply: speech,
						via: 'ha-native',
						spoke: true,
						error: null
					},
					speech: speech ? { text: speech } : undefined
				});
			}
			if (isDeviceError(native)) {
				// Device-control guard: HA understood, couldn't act. Return
				// HA's friendly error WITHOUT falling through to the LLM.
				const speech = speechFrom(native);
				return finalise({
					turn: {
						...opts.turn,
						reply: speech,
						via: 'ha-native',
						spoke: speech.length > 0,
						error: native.response?.data?.code ?? 'ha-error'
					},
					speech: speech ? { text: speech } : undefined
				});
			}
			// Otherwise (no_intent_match): fall through to LLM step
			if (!isNoIntentMatch(native)) {
				// eslint-disable-next-line no-console
				console.warn('[@broadsheet/voice] unknown HA-native response', native);
			}
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[@broadsheet/voice] HA-native error, falling through', err);
		}
	}

	// Step 2: configured LLM agent — middleware can prepend system
	// prompts + memory injections via assemblePromptPrefix.
	let llmInput = effectiveText;
	if (useMiddleware) {
		const prefix = await assemblePromptPrefix(ctx);
		if (prefix) llmInput = `${prefix}\n\n${effectiveText}`;
	}
	try {
		const llm = await callAgent(conn, pipeline.conversation_engine, llmInput, conversationId, lang);
		const speech = speechFrom(llm);
		return finalise({
			turn: {
				...opts.turn,
				reply: speech,
				via: 'llm',
				spoke: speech.length > 0,
				error:
					llm.response?.response_type === 'error'
						? (llm.response?.data?.code ?? 'llm-error')
						: null
			},
			speech: speech ? { text: speech } : undefined
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return finalise({
			turn: {
				...opts.turn,
				reply: null,
				via: 'llm',
				spoke: false,
				error: msg
			}
		});
	}
}
