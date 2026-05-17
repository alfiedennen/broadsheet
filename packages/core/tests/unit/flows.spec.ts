/**
 * Theme B — flow completion helpers tests.
 *
 * Pure-function coverage of resolveStepRef + countDone + isFlowComplete
 * + firstIncompleteIndex. The flow page wires these into the live
 * curationStore + discovery + localStorage facade, but the helpers
 * themselves are pure — easy to test, hard to regress.
 */

import { describe, it, expect } from 'vitest';
import type { BroadsheetPlugin, PluginFlowStep, FlowStepContext } from '$lib/plugins/types';
import { resolveStepRef, type FlowDefinition } from '$lib/flows/definitions';
import { countDone, isFlowComplete, firstIncompleteIndex } from '$lib/flows/context';

/* ── Fixtures ──────────────────────────────────────────────────────── */

function mkStep(id: string, complete: boolean): PluginFlowStep {
	return {
		id,
		title: `Step ${id}`,
		description: `Do ${id}`,
		kind: 'enable-plugin',
		isComplete: () => complete
	};
}

function mkPlugin(id: string, flows: PluginFlowStep[]): BroadsheetPlugin {
	return {
		id,
		version: '0.0.0',
		displayName: id,
		description: '',
		flows
	};
}

function mkCtx(): FlowStepContext {
	return {
		curation: { plugins: {}, people: [] },
		discovery: { floors: [], areas: [], persons: [] },
		localFlags: { get: () => false }
	};
}

const flow: FlowDefinition = {
	id: 'test-flow',
	title: 'Test flow',
	description: 'just a test',
	whenIncomplete: 'always',
	steps: ['voice:enable', 'harold-preset:enable', 'harold-preset:key']
};

/* ── resolveStepRef ────────────────────────────────────────────────── */

describe('resolveStepRef', () => {
	const plugins: BroadsheetPlugin[] = [
		mkPlugin('voice', [mkStep('enable', false)]),
		mkPlugin('harold-preset', [mkStep('enable', false), mkStep('key', false)])
	];

	it('finds an existing step', () => {
		const r = resolveStepRef('voice:enable', plugins);
		expect(r).not.toBeNull();
		expect(r?.pluginId).toBe('voice');
		expect(r?.step.id).toBe('enable');
	});

	it('returns null for unknown plugin', () => {
		expect(resolveStepRef('missing:enable', plugins)).toBeNull();
	});

	it('returns null for unknown step within a known plugin', () => {
		expect(resolveStepRef('voice:nonexistent', plugins)).toBeNull();
	});

	it('returns null for plugin without flows', () => {
		const noFlows = [{ id: 'x', version: '0', displayName: 'X', description: '' } as BroadsheetPlugin];
		expect(resolveStepRef('x:anything', noFlows)).toBeNull();
	});

	it('returns null on malformed refs', () => {
		expect(resolveStepRef('no-colon', plugins)).toBeNull();
		expect(resolveStepRef('', plugins)).toBeNull();
	});
});

/* ── countDone ─────────────────────────────────────────────────────── */

describe('countDone', () => {
	it('returns 0 when all steps incomplete', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', false)]),
			mkPlugin('harold-preset', [mkStep('enable', false), mkStep('key', false)])
		];
		expect(countDone(flow, plugins, mkCtx())).toBe(0);
	});

	it('returns full count when all steps complete', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', true)]),
			mkPlugin('harold-preset', [mkStep('enable', true), mkStep('key', true)])
		];
		expect(countDone(flow, plugins, mkCtx())).toBe(3);
	});

	it('counts mixed progress', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', true)]),
			mkPlugin('harold-preset', [mkStep('enable', true), mkStep('key', false)])
		];
		expect(countDone(flow, plugins, mkCtx())).toBe(2);
	});

	it('treats unresolved refs as incomplete', () => {
		// Only voice:enable resolves; harold-preset:enable + :key are missing
		const plugins = [mkPlugin('voice', [mkStep('enable', true)])];
		expect(countDone(flow, plugins, mkCtx())).toBe(1);
	});

	it('treats a throwing isComplete as incomplete (defensive)', () => {
		const throwingStep: PluginFlowStep = {
			id: 'enable',
			title: 'x',
			description: 'x',
			kind: 'enable-plugin',
			isComplete: () => {
				throw new Error('boom');
			}
		};
		const plugins = [mkPlugin('voice', [throwingStep])];
		const oneStepFlow = { ...flow, steps: ['voice:enable'] };
		expect(countDone(oneStepFlow, plugins, mkCtx())).toBe(0);
	});
});

/* ── isFlowComplete ────────────────────────────────────────────────── */

describe('isFlowComplete', () => {
	it('false if any step is incomplete', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', true)]),
			mkPlugin('harold-preset', [mkStep('enable', true), mkStep('key', false)])
		];
		expect(isFlowComplete(flow, plugins, mkCtx())).toBe(false);
	});

	it('true only when every step is complete', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', true)]),
			mkPlugin('harold-preset', [mkStep('enable', true), mkStep('key', true)])
		];
		expect(isFlowComplete(flow, plugins, mkCtx())).toBe(true);
	});

	it('false if any step is unresolved (plugin missing)', () => {
		const plugins = [mkPlugin('voice', [mkStep('enable', true)])];
		expect(isFlowComplete(flow, plugins, mkCtx())).toBe(false);
	});
});

/* ── firstIncompleteIndex ──────────────────────────────────────────── */

describe('firstIncompleteIndex', () => {
	it('returns 0 when nothing is done', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', false)]),
			mkPlugin('harold-preset', [mkStep('enable', false), mkStep('key', false)])
		];
		expect(firstIncompleteIndex(flow, plugins, mkCtx())).toBe(0);
	});

	it('skips completed leading steps', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', true)]),
			mkPlugin('harold-preset', [mkStep('enable', false), mkStep('key', false)])
		];
		expect(firstIncompleteIndex(flow, plugins, mkCtx())).toBe(1);
	});

	it('returns -1 when fully complete', () => {
		const plugins = [
			mkPlugin('voice', [mkStep('enable', true)]),
			mkPlugin('harold-preset', [mkStep('enable', true), mkStep('key', true)])
		];
		expect(firstIncompleteIndex(flow, plugins, mkCtx())).toBe(-1);
	});

	it('treats unresolved ref as the first incomplete (forces visibility)', () => {
		const plugins = [mkPlugin('voice', [mkStep('enable', true)])];
		expect(firstIncompleteIndex(flow, plugins, mkCtx())).toBe(1);
	});
});
