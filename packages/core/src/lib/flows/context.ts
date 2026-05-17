/**
 * Theme B — FlowStepContext builder + localStorage flag store.
 *
 * Steps call `isComplete(ctx)` on every render. ctx is a thin facade
 * over the live curation/discovery snapshots + a read-only view of
 * the per-step "I clicked through" flags stored in localStorage.
 *
 * The flag key shape is `flow:<plugin-id>:<step-id>:done`. Only
 * `kind: 'external-link'` steps consume them today; future kinds
 * can reuse the same store via `setLocalFlag()`.
 *
 * Why localStorage (and not curation): clicked-through flags are
 * per-browser-profile by nature (a fresh browser hasn't done the
 * click). Putting them in curation would require Turso-style sync
 * we don't have yet AND would conflate "the user did the thing"
 * with "broadsheet remembers they did". A future v0.5.x could
 * promote them to curation if cross-device replay matters.
 *
 * Spec: docs/plans/plan-theme-B-onboarding-flows.md.
 */

import type {
	BroadsheetPlugin,
	FlowStepContext,
	PluginDiscoverySnapshot
} from '$lib/plugins/types';
import type { Curation } from '$lib/curation/types';
import type { FlowDefinition, ResolvedStep } from './definitions';
import { resolveStepRef } from './definitions';

/* ── localStorage flag store ───────────────────────────────────────── */

const LS_PREFIX = 'flow:';
const LS_SUFFIX = ':done';

export function localFlagKey(pluginId: string, stepId: string): string {
	return `${LS_PREFIX}${pluginId}:${stepId}${LS_SUFFIX}`;
}

function readFlag(key: string): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		// localStorage can throw in private-browsing mode etc — treat
		// as "not done" rather than crashing the flow page.
		return false;
	}
}

function writeFlag(key: string, done: boolean): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (done) localStorage.setItem(key, '1');
		else localStorage.removeItem(key);
	} catch {
		// Same as readFlag — silently ignore.
	}
}

/**
 * Mark an external-link step as done. Called from the step's
 * "I've done this →" button.
 */
export function markStepClicked(pluginId: string, stepId: string): void {
	writeFlag(localFlagKey(pluginId, stepId), true);
}

/**
 * Clear a step's clicked-through flag — exposed so the flow page can
 * surface a "redo this step" affordance for the curious. Not wired
 * to any UI in v0.5; ready for v0.5.x.
 */
export function unmarkStepClicked(pluginId: string, stepId: string): void {
	writeFlag(localFlagKey(pluginId, stepId), false);
}

/* ── Curation field resolver ───────────────────────────────────────── */

/**
 * Dotted-path getter for the curation tree. Mirrors how
 * `useCurationField` resolves paths but as a pure function so the
 * flow context stays Svelte-rune-free.
 */
export function getCurationPath(
	curation: Record<string, unknown>,
	path: string
): unknown {
	const parts = path.split('.');
	let cur: unknown = curation;
	for (const p of parts) {
		if (cur === null || cur === undefined) return undefined;
		if (typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

/* ── FlowStepContext factory ───────────────────────────────────────── */

/**
 * Build a fresh `FlowStepContext` from current snapshots. Cheap —
 * call this in the render path. The localFlags facade reads
 * localStorage lazily per key (no upfront enumeration).
 */
export function buildFlowStepContext(
	curation: Curation,
	discovery: PluginDiscoverySnapshot
): FlowStepContext {
	return {
		curation: curation as unknown as FlowStepContext['curation'],
		discovery,
		localFlags: {
			get: (key: string) => readFlag(key)
		}
	};
}

/* ── Completion helpers ────────────────────────────────────────────── */

/**
 * Count completed steps in a flow against current context. Used by
 * the attention hub ("3 of 7 done") + the flow page progress chip.
 */
export function countDone(
	flow: FlowDefinition,
	plugins: BroadsheetPlugin[],
	ctx: FlowStepContext
): number {
	let done = 0;
	for (const ref of flow.steps) {
		const resolved = resolveStepRef(ref, plugins);
		if (!resolved) continue; // unresolved steps don't count as done
		if (safeIsComplete(resolved, ctx)) done++;
	}
	return done;
}

/**
 * True iff every resolved step in the flow returns isComplete = true.
 * Unresolved steps (missing plugin etc.) block completion — the flow
 * can't claim to be done if a step is unreachable.
 */
export function isFlowComplete(
	flow: FlowDefinition,
	plugins: BroadsheetPlugin[],
	ctx: FlowStepContext
): boolean {
	for (const ref of flow.steps) {
		const resolved = resolveStepRef(ref, plugins);
		if (!resolved) return false;
		if (!safeIsComplete(resolved, ctx)) return false;
	}
	return true;
}

/**
 * Find the index of the first unresolved-or-incomplete step. Returns
 * -1 if the whole flow is complete. The flow page uses this to
 * scroll-to-active-step on entry when no explicit hash is present.
 */
export function firstIncompleteIndex(
	flow: FlowDefinition,
	plugins: BroadsheetPlugin[],
	ctx: FlowStepContext
): number {
	for (let i = 0; i < flow.steps.length; i++) {
		const resolved = resolveStepRef(flow.steps[i], plugins);
		if (!resolved) return i;
		if (!safeIsComplete(resolved, ctx)) return i;
	}
	return -1;
}

/**
 * Defensive wrapper around step `isComplete`. A misbehaving step
 * predicate that throws should treat the step as "not done" rather
 * than crashing the whole flow page.
 */
function safeIsComplete(resolved: ResolvedStep, ctx: FlowStepContext): boolean {
	try {
		return resolved.step.isComplete(ctx) === true;
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn(
			`[broadsheet:flows] step ${resolved.pluginId}:${resolved.step.id} isComplete threw — treating as not-done`,
			err
		);
		return false;
	}
}
