/**
 * Theme B — flow definitions shipped by broadsheet itself.
 *
 * A *flow* composes plugin-contributed steps into a named, guided
 * journey. Plugins own the step content; broadsheet owns which steps
 * appear in which order under which flow id.
 *
 * Adding a new flow:
 *  1. Decide the user outcome ("Add Harold", "Add TMDB content")
 *  2. Add a `FlowDefinition` here referencing existing plugin steps
 *     in the form `<plugin-id>:<step-id>`
 *  3. Set `whenIncomplete` to gate when the attention hub surfaces it
 *  4. The /settings/setup/<id>/ page picks it up automatically;
 *     no route changes needed
 *
 * Spec: docs/plans/plan-theme-B-onboarding-flows.md.
 */

import type { PluginFlowStep } from '$lib/plugins/types';

export interface FlowDefinition {
	/** URL slug under /settings/setup/<id>/. Lowercase, hyphens allowed. */
	id: string;
	/** Hero headline on the flow page + attention-hub card title. */
	title: string;
	/** Hero dek + attention-hub card sublabel. */
	description: string;
	/**
	 * Gate for when the attention-hub surfaces this flow as a
	 * "Resume setup →" card:
	 *  - `'always'`: surface until all steps are complete
	 *  - `'plugin-enabled:<id>'`: only after the named plugin is on
	 *  - `'never'`: don't auto-surface (a future "Setup" tab on
	 *     /settings/ root will list all flows regardless)
	 */
	whenIncomplete: 'always' | `plugin-enabled:${string}` | 'never';
	/**
	 * Ordered list of step refs in the form `<plugin-id>:<step-id>`.
	 * The flow page resolves each ref against the plugin loader's
	 * registry; a missing ref renders as a "(step unavailable — is
	 * the contributing plugin bundled?)" placeholder rather than
	 * breaking the flow.
	 */
	steps: string[];
}

/**
 * The shipped flow registry. v0.5 starts with the canonical "Add
 * Harold" flow exercising every step kind end-to-end. Future flows
 * land here additively.
 */
export const FLOWS: FlowDefinition[] = [
	{
		id: 'add-harold',
		title: 'Add Harold to your house',
		description:
			"Seven steps to bring the Hitchcock-register voice assistant " +
			"online. You can pause mid-flow and resume any time — broadsheet " +
			"picks up where you actually are, not where you last clicked.",
		whenIncomplete: 'always',
		steps: [
			'voice:enable',
			'harold-preset:enable',
			'harold-preset:anthropic-key',
			'harold-preset:elevenlabs-key',
			'harold-preset:meeting-blueprint',
			'harold-preset:wakeword-download',
			'voice:test-mic'
		]
	}
];

/**
 * Resolve a `<plugin-id>:<step-id>` ref against the loaded plugins.
 * Returns null if the contributing plugin isn't bundled or the step
 * id isn't found. The flow page treats null as "step unavailable"
 * rather than throwing — degrades gracefully if a plugin drops out
 * of a build.
 */
export interface ResolvedStep {
	pluginId: string;
	step: PluginFlowStep;
}

export function resolveStepRef(
	ref: string,
	plugins: { id: string; flows?: PluginFlowStep[] }[]
): ResolvedStep | null {
	const colon = ref.indexOf(':');
	if (colon < 0) return null;
	const pluginId = ref.slice(0, colon);
	const stepId = ref.slice(colon + 1);
	const plugin = plugins.find((p) => p.id === pluginId);
	if (!plugin?.flows) return null;
	const step = plugin.flows.find((s) => s.id === stepId);
	if (!step) return null;
	return { pluginId, step };
}
