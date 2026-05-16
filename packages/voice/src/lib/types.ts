/**
 * Voice substrate types — shared between discovery, conversation,
 * transcript bus, and the UI surfaces.
 *
 * Mirrors HA's `assist_pipeline` shapes (with the fields we
 * actually consume). Stays a STRICT subset of HA's WS protocol so
 * a future HA version that adds fields doesn't break broadsheet —
 * we ignore what we don't use.
 *
 * Spec: docs/plans/plan-voice-substrate.md.
 */

/** One conversation agent HA has installed. */
export interface ConversationAgent {
	/** Stable id (e.g. "conversation.home_assistant", "conversation.openai") */
	id: string;
	/** Human label (e.g. "Home Assistant", "OpenAI Conversation") */
	name: string;
	/** Whether the agent supports multi-language input */
	supported_languages: string[] | '*';
}

/** One TTS engine HA can synthesise through. */
export interface TtsEngine {
	id: string;
	name: string;
	supported_languages?: string[];
	supported_voices?: TtsVoice[];
}

export interface TtsVoice {
	voice_id: string;
	name: string;
}

/** One STT engine HA can transcribe through. */
export interface SttEngine {
	id: string;
	name: string;
	supported_languages?: string[];
}

/** One wake-word engine. */
export interface WakeWordEngine {
	id: string;
	name: string;
	wake_words?: WakeWord[];
}

export interface WakeWord {
	id: string;
	name: string;
}

/** One assist pipeline — STT + agent + TTS + (optional) wake-word, chained. */
export interface AssistPipeline {
	id: string;
	name: string;
	conversation_engine: string; // → ConversationAgent.id
	conversation_language: string;
	stt_engine: string | null;
	stt_language: string | null;
	tts_engine: string | null;
	tts_language: string | null;
	tts_voice: string | null;
	wake_word_entity: string | null;
	wake_word_id: string | null;
	language: string;
}

/** Snapshot of everything the voice plugin discovered from HA. */
export interface VoiceDiscovery {
	pipelines: AssistPipeline[];
	preferredPipelineId: string | null;
	agents: ConversationAgent[];
	tts: TtsEngine[];
	stt: SttEngine[];
	wakeWords: WakeWordEngine[];
	booted: boolean;
	lastError: string | null;
}

/** One transcript turn — what was said + what came back. */
export interface TranscriptTurn {
	id: string;
	timestamp: number; // ms epoch
	utterance: string;
	reply: string | null; // null while in-flight
	/** Which agent answered (or HA-native if intent-matched). */
	via: 'ha-native' | 'llm' | 'unknown';
	/** Did the response play audio (or was it a silent device-control reply). */
	spoke: boolean;
	/** Optional error if the turn failed. */
	error: string | null;
}

/**
 * Plugin curation config — what the user picks in the Voice
 * settings panel. Persisted under `plugins.voice.config` in
 * broadsheet.json.
 */
export interface VoiceConfig {
	/** The pipeline this surface uses. null = HA's preferred pipeline. */
	activePipelineId: string | null;
	/** Whether the push-to-talk pill renders on `/`. */
	pillOnMoment: boolean;
	/**
	 * Which HA media_player target the browser-tab TTS plays through.
	 * Special value 'browser' = play in the current tab via <audio>;
	 * an entity_id = stream to that physical speaker via tts/speak.
	 */
	ttsTarget: string;
	/**
	 * Whether HA-native intent matching gets first attempt. Default
	 * true; set false only if the user genuinely wants every utterance
	 * to go to their LLM agent (more expensive, slower).
	 */
	haNativeFirst: boolean;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
	activePipelineId: null,
	pillOnMoment: true,
	ttsTarget: 'browser',
	haNativeFirst: true
};

/** Result of routing one utterance through the pipeline. */
export interface ConversationResult {
	turn: TranscriptTurn;
	/** Speech to play (already routed by HA's tts/speak if not browser). */
	speech?: {
		text: string;
		audioUrl?: string; // present when target=browser
	};
}

/* ── Middleware contract — opinionated presets plug here ───────────── */

/**
 * Context passed to every middleware hook. Captures the utterance + the
 * pipeline + the language + any tags the calling surface set (e.g.
 * `surface: 'pill'` vs `surface: '/voice'` vs `surface: 'wall'` so
 * Harold's per-surface prompts can switch).
 */
export interface MiddlewareContext {
	text: string;
	pipeline: AssistPipeline;
	language: string;
	/** Free-form tags the caller passes (e.g. surface origin). */
	tags?: Record<string, string>;
}

/**
 * Voice middleware. Presets register an object of these hooks at boot
 * via `registerVoiceMiddleware()`. The voice router calls them in order:
 *
 *   1. preFilter   — chance to short-circuit before any HA call
 *      (returns the (possibly-rewritten) text to use, OR null to
 *      reply with the silent sentinel `~` without ever hitting HA)
 *   2. wrapSystemPrompt — prepends a system-prompt block to the
 *      LLM-only call (HA-native is unaffected; native intent matching
 *      can't take a system prompt)
 *   3. memoryInject — returns text to prepend to the LLM call AFTER the
 *      system prompt; presets use this for "retrieved past
 *      conversations" injection
 *   4. onTurn — called once after the turn completes with the final
 *      TranscriptTurn (writers persist to memory here)
 *
 * Every hook is optional. Presets implement only what they need.
 * Multiple presets can register; hooks run in registration order
 * (FIFO).
 */
export interface VoiceMiddleware {
	id: string;
	preFilter?: (ctx: MiddlewareContext) => string | null | Promise<string | null>;
	wrapSystemPrompt?: (ctx: MiddlewareContext) => string | Promise<string>;
	memoryInject?: (ctx: MiddlewareContext) => string | Promise<string>;
	onTurn?: (turn: TranscriptTurn, ctx: MiddlewareContext) => void | Promise<void>;
}
