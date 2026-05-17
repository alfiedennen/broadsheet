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

import type { BroadsheetPlugin, PluginActivationContext, PluginFlowStep } from '@broadsheet/core';

/**
 * Theme B onboarding-flow steps harold-preset contributes. Referenced
 * by the addon-side "add-harold" flow.
 *
 * The `set-curation-field` steps deep-link into the plugin's own
 * settings panel (where the actual `<input>` for that field lives)
 * rather than hosting the inputs themselves — keeps a single source
 * of truth for each field's UX. isComplete reads the curation path
 * directly so partial out-of-flow progress (user pasted the key in
 * the settings panel before opening the flow) reads as ✓ on entry.
 *
 * The `external-link` step for the wakeword download is tracked via
 * a localStorage flag the user toggles by clicking "I've done this →"
 * after they've downloaded + flashed the model.
 */
const HAROLD_FLOW_STEPS: PluginFlowStep[] = [
	{
		id: 'enable',
		title: 'Enable @broadsheet/harold-preset',
		description:
			"This plugin sits on top of @broadsheet/voice and registers " +
			"the Hitchcock-register wrappers, the garbled-input filters, " +
			"the Italian detection, and the conversational memory loop.",
		kind: 'enable-plugin',
		isComplete: (ctx) => ctx.curation.plugins?.['harold-preset']?.enabled === true
	},
	{
		id: 'anthropic-key',
		title: 'Paste your Anthropic API key',
		description:
			"Claude Haiku handles conversation and questions. Typical use " +
			"runs ~£3-6/month. The key is stored in broadsheet.json on " +
			"your HA host; it never leaves your network unless Haiku itself " +
			"is called.",
		kind: 'set-curation-field',
		curationField: {
			path: 'plugins.harold-preset.config.anthropicKey',
			valueHint: 'an `sk-ant-…` key from console.anthropic.com/settings/keys',
			settingsHref: '/settings/plugins/harold-preset/config/'
		},
		isComplete: (ctx) => {
			const key = ctx.curation.plugins?.['harold-preset']?.config?.anthropicKey;
			return typeof key === 'string' && key.length > 0;
		}
	},
	{
		id: 'elevenlabs-key',
		title: 'Paste your ElevenLabs API key',
		description:
			"Optional but recommended for the Hitchcock voice. Without it, " +
			"Harold falls back to HA Cloud's TTS engine. ElevenLabs ships " +
			"a 10K-character/month free tier — comfortably enough for daily use.",
		kind: 'set-curation-field',
		optional: true,
		curationField: {
			path: 'plugins.harold-preset.config.elevenLabsKey',
			valueHint: 'an `sk-…` key from elevenlabs.io/app/settings/api-keys',
			settingsHref: '/settings/plugins/harold-preset/config/'
		},
		isComplete: (ctx) => {
			const key = ctx.curation.plugins?.['harold-preset']?.config?.elevenLabsKey;
			return typeof key === 'string' && key.length > 0;
		}
	},
	{
		id: 'meeting-blueprint',
		title: 'Install meeting-mode blueprint',
		description:
			"An HA automation blueprint that hard-mutes Harold on your " +
			"office speaker while meeting-mode is on, with a clean auto-off " +
			"timer. Drops into /homeassistant/blueprints/automation/broadsheet/.",
		kind: 'set-curation-field',
		optional: true,
		curationField: {
			path: 'plugins.harold-preset.config.meetingModeInstalled',
			valueHint: 'click "Install blueprint" in the Harold settings panel',
			settingsHref: '/settings/plugins/harold-preset/config/'
		},
		isComplete: (ctx) =>
			ctx.curation.plugins?.['harold-preset']?.config?.meetingModeInstalled === true
	},
	{
		id: 'wakeword-download',
		title: 'Download "Hey Harold" wake-word',
		description:
			"60KB .tflite model + ESPHome snippet for Atom Echo / Wyoming " +
			"satellites. Drop these into your ESPHome project and reflash " +
			"the satellite. Trained primarily on a British male voice; " +
			"results may vary for other voices.",
		kind: 'external-link',
		optional: true,
		link: {
			href: '/settings/plugins/harold-preset/config/',
			label: 'Harold settings'
		},
		isComplete: (ctx) => ctx.localFlags.get('flow:harold-preset:wakeword-download:done')
	}
];

export const plugin: BroadsheetPlugin = {
	id: 'harold-preset',
	version: '0.1.0',
	displayName: 'Harold',
	description:
		'Opinionated voice bundle — Hitchcock-register British baritone, Claude Haiku, ElevenLabs Flash v2.5, the "Hey Harold" wake-word, meeting-mode hard-mute, Italian-when-spoken-Italian detection, conversational memory. Sits on top of @broadsheet/voice.',
	flows: HAROLD_FLOW_STEPS,

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
