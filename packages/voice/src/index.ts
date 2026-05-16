/**
 * @broadsheet/voice — voice substrate plugin.
 *
 * The generic voice surface: discovers HA's installed conversation
 * agents + TTS / STT / wake-word engines + assist pipelines, routes
 * utterances HA-native-first (sub-200ms, free) with the configured
 * LLM agent as fall-through. Surfaces a transcript pane at /voice
 * and an opt-in mic pill on /.
 *
 * No LLM or TTS provider is bundled. The user pairs voice with
 * whatever HA pipeline they already have (HA Cloud STT + Whisper +
 * ElevenLabs / Anthropic / OpenAI / Ollama / Piper / etc).
 *
 * For an opinionated bundle that ships Hitchcock-register Harold
 * with Claude Haiku + ElevenLabs + the "Hey Harold" wake-word +
 * meeting-mode hard-mute + Italian detection + conversational
 * memory, install `@broadsheet/harold-preset` on top.
 *
 * Contract obeyed:
 *   1. No side effects at module-eval time (plain object export).
 *   2. `import type` from @broadsheet/core ONLY at this level —
 *      runtime imports happen inside the lazy-loaded thunks.
 *
 * Spec: docs/plans/plan-voice-substrate.md (rubric Epic 8).
 */

import type { BroadsheetPlugin } from '@broadsheet/core';

/* Re-export the middleware registry + types so presets (Harold and
 * friends) can register hooks against the voice substrate without
 * reaching into voice's internal modules. The voice plugin object
 * itself is import-type-only per the BroadsheetPlugin contract; these
 * runtime imports are explicit "voice's plug points" for presets.
 *
 * See docs/plans/plan-harold-preset.md for the consumer side. */
export { voiceMiddleware } from './lib/middleware.svelte';
export type {
	VoiceMiddleware,
	MiddlewareContext,
	TranscriptTurn,
	AssistPipeline,
	ConversationAgent,
	VoiceDiscovery
} from './lib/types';

export const plugin: BroadsheetPlugin = {
	id: 'voice',
	version: '0.1.0',
	displayName: 'Voice',
	description:
		"Push-to-talk + transcript pane wired through HA's assist pipeline. HA-native intent matching first; your LLM agent as fall-through.",

	pages: [
		{
			slug: 'voice',
			label: 'Voice',
			icon: 'mdi:microphone',
			navOrder: 90,
			// Voice page is meaningful whenever the plugin is enabled —
			// even without an active pipeline (the empty state explains
			// how to set one up).
			component: () => import('./pages/VoicePage.svelte')
		}
	],

	// Pill renderer for the moment view. Core's `/` opts into it via
	// useRenderer('voice-pill'); the renderer self-gates on the
	// pillOnMoment curation flag.
	renderers: {
		'voice-pill': () => import('./renderers/VoicePillRenderer.svelte')
	},

	settingsPanel: {
		label: 'Voice',
		icon: 'mdi:microphone-outline',
		component: () => import('./settings/VoiceSettings.svelte')
	}
};
