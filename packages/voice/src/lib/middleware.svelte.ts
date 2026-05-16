/**
 * Voice middleware registry.
 *
 * Presets (Harold or any future opinionated bundle) register their
 * preFilter/wrapSystemPrompt/memoryInject/onTurn hooks here. The voice
 * router walks the registry in registration order for each utterance.
 *
 * Why a flat registry instead of a per-plugin interface: middleware
 * needs to run in a stable order, multiple presets can co-exist
 * (someone could install Harold AND a future "polyglot" preset),
 * and unregistering on plugin deactivate has to be cheap. A flat
 * array of {id, hooks} satisfies all three.
 *
 * Spec: docs/plans/plan-harold-preset.md.
 */

import type { VoiceMiddleware } from './types';

class VoiceMiddlewareRegistry {
	/** Registered middleware in order. */
	private list: VoiceMiddleware[] = [];

	register(mw: VoiceMiddleware): void {
		// De-dup by id — re-register replaces. Useful for HMR + for
		// presets that hot-reload their hooks when settings change.
		this.list = this.list.filter((m) => m.id !== mw.id).concat(mw);
	}

	unregister(id: string): void {
		this.list = this.list.filter((m) => m.id !== id);
	}

	all(): VoiceMiddleware[] {
		return this.list;
	}

	clear(): void {
		this.list = [];
	}
}

export const voiceMiddleware = new VoiceMiddlewareRegistry();

/**
 * Run every registered preFilter in order. If any returns null, the
 * utterance is dropped (caller renders the silent sentinel `~`).
 * If a filter returns a rewritten string, subsequent filters see the
 * rewritten value.
 */
export async function runPreFilters(
	ctx: import('./types').MiddlewareContext
): Promise<string | null> {
	let current = ctx.text;
	for (const mw of voiceMiddleware.all()) {
		if (!mw.preFilter) continue;
		try {
			const result = await mw.preFilter({ ...ctx, text: current });
			if (result === null) return null;
			current = result;
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn(`[@broadsheet/voice] middleware ${mw.id} preFilter threw`, err);
		}
	}
	return current;
}

/**
 * Concatenate every registered wrapSystemPrompt + memoryInject in
 * order. Returns the assembled prepend block; empty if no
 * middleware contributes. Caller prepends this to the user text
 * before sending to the LLM agent.
 */
export async function assemblePromptPrefix(
	ctx: import('./types').MiddlewareContext
): Promise<string> {
	const blocks: string[] = [];
	for (const mw of voiceMiddleware.all()) {
		if (mw.wrapSystemPrompt) {
			try {
				const block = await mw.wrapSystemPrompt(ctx);
				if (block?.trim()) blocks.push(block.trim());
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn(`[@broadsheet/voice] middleware ${mw.id} wrapSystemPrompt threw`, err);
			}
		}
		if (mw.memoryInject) {
			try {
				const block = await mw.memoryInject(ctx);
				if (block?.trim()) blocks.push(block.trim());
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn(`[@broadsheet/voice] middleware ${mw.id} memoryInject threw`, err);
			}
		}
	}
	return blocks.join('\n\n');
}

/**
 * Fire every registered onTurn observer with the final turn shape.
 * Observers persist to memory, log, etc. Failures don't propagate.
 */
export async function fireOnTurn(
	turn: import('./types').TranscriptTurn,
	ctx: import('./types').MiddlewareContext
): Promise<void> {
	for (const mw of voiceMiddleware.all()) {
		if (!mw.onTurn) continue;
		try {
			await mw.onTurn(turn, ctx);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn(`[@broadsheet/voice] middleware ${mw.id} onTurn threw`, err);
		}
	}
}
