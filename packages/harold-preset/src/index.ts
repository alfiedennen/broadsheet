/**
 * @broadsheet/harold-preset — opinionated voice bundle.
 *
 * Sits on top of @broadsheet/voice. On activate, registers
 * voice-middleware that:
 *   - filters garbled STT misfires (Echo + wall variants)
 *   - detects Italian and prepends a Sistema directive
 *   - wraps the system prompt with the Hitchcock register
 *   - injects top-K semantically-similar past conversations as
 *     "Topics from past conversations" memory context
 *   - observes each turn to write it to local memory
 *
 * Ships a settings panel for the API keys + memory mode + meeting-
 * mode toggle + wakeword download link.
 *
 * Contract:
 *   1. Plain object export at module-eval (BroadsheetPlugin rule 1).
 *   2. `import type` from @broadsheet/core/voice only at this level
 *      (rule 2). Runtime imports happen inside the lazy thunks +
 *      inside onActivate / onDeactivate which are post-boot calls.
 *
 * Spec: docs/plans/plan-harold-preset.md (rubric P8-S4).
 */

import type { BroadsheetPlugin, PluginActivationContext } from '@broadsheet/core';

export const plugin: BroadsheetPlugin = {
	id: 'harold-preset',
	version: '0.1.0',
	displayName: 'Harold',
	description:
		'Opinionated voice bundle — Hitchcock-register British baritone, Claude Haiku, ElevenLabs Flash v2.5, the "Hey Harold" wake-word, meeting-mode hard-mute, Italian-when-spoken-Italian detection, conversational memory. Sits on top of @broadsheet/voice.',

	settingsPanel: {
		label: 'Harold',
		icon: 'mdi:account-tie-voice',
		component: () => import('./settings/HaroldPresetSettings.svelte')
	},

	async onActivate(ctx: PluginActivationContext): Promise<void> {
		// Lazy: only pull middleware + memory bindings when the
		// preset is actually enabled, never at module-eval. Voice
		// substrate must already be active for this to mean anything
		// (the preset has no fallback to its own runtime).
		const { voiceMiddleware } = await import('@broadsheet/voice');
		const { buildPrompt } = await import('./prompts/hitchcock');
		const { looksLikeRealRequestEcho, looksLikeRealRequestWall, isItalian } =
			await import('./lib/filters');
		const { memory } = await import('./lib/memory');

		const cfg = ctx.config as {
			memoryMode?: 'off' | 'local';
		};
		memory.setMode(cfg.memoryMode ?? 'local');

		voiceMiddleware.register({
			id: 'harold-preset',
			preFilter: async ({ text, tags }) => {
				// Surface-specific tolerance: wall is tighter (silent on
				// misfire), Echo satellites + browser surfaces are
				// medium. Plain text inputs from /voice push-to-talk OR
				// typed-in skip the filter entirely (the user typed it
				// deliberately).
				const surface = tags?.surface;
				if (surface === 'wall') {
					if (!looksLikeRealRequestWall(text)) return null;
				} else if (surface === 'echo') {
					if (!looksLikeRealRequestEcho(text)) return null;
				}
				// Italian detection — rewrite the input (or rather,
				// flag it via the tag for downstream prompt assembly).
				if (isItalian(text)) {
					if (tags) tags.italian = 'true';
					else (tags as Record<string, string> | undefined) === undefined;
				}
				return text;
			},
			wrapSystemPrompt: ({ tags }) => {
				const surface = (tags?.surface as 'voice' | 'wall' | 'app' | 'panel') ?? 'voice';
				const italian = tags?.italian === 'true';
				return buildPrompt(surface, italian);
			},
			memoryInject: async ({ text }) => {
				return await memory.retrieve(text);
			},
			onTurn: async (turn) => {
				await memory.record(turn);
			}
		});
	},

	async onDeactivate(): Promise<void> {
		const { voiceMiddleware } = await import('@broadsheet/voice');
		const { memory } = await import('./lib/memory');
		voiceMiddleware.unregister('harold-preset');
		memory.setMode('off');
	}
};
