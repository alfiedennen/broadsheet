/**
 * Voice substrate — transcript event bus.
 *
 * Shared reactive store between every voice surface in broadsheet:
 *   - the /voice page (full transcript pane)
 *   - the pill renderer on / (latest turn only)
 *   - /settings/voice (per-pipeline test-utterance scratchpad)
 *
 * Bounded ring buffer of TranscriptTurn objects (default 50 turns —
 * about a day of typical use; persists to localStorage so reload
 * preserves them across tabs).
 *
 * Why $state.raw + reassign instead of mutating in-place: Svelte
 * runes track identity on object references, not array indices. A
 * deep-mutate doesn't notify subscribers; replacing the array does.
 *
 * Spec: docs/plans/plan-voice-substrate.md.
 */

import type { TranscriptTurn } from './types';

const STORAGE_KEY = 'broadsheet:voice:transcript';
const MAX_TURNS = 50;

function loadFromStorage(): TranscriptTurn[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as TranscriptTurn[];
		if (!Array.isArray(parsed)) return [];
		// Defensive shape check — drop any malformed entries rather
		// than throw on the whole list.
		return parsed.filter(
			(t) =>
				typeof t === 'object' &&
				t !== null &&
				typeof t.id === 'string' &&
				typeof t.utterance === 'string'
		);
	} catch {
		return [];
	}
}

function persist(turns: TranscriptTurn[]): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
	} catch {
		// localStorage full / disabled — degraded, but in-memory state
		// still works. Don't crash the surface.
	}
}

class TranscriptBus {
	turns = $state<TranscriptTurn[]>(loadFromStorage());

	/** True while the user is talking / the pipeline is mid-response. */
	inFlight = $state(false);

	/** Most recent turn (or undefined if none yet). */
	get latest(): TranscriptTurn | undefined {
		return this.turns[this.turns.length - 1];
	}

	add(turn: TranscriptTurn): void {
		const next = [...this.turns, turn];
		if (next.length > MAX_TURNS) {
			next.splice(0, next.length - MAX_TURNS);
		}
		this.turns = next;
		persist(this.turns);
	}

	/** Update the most-recent in-flight turn (e.g. fill in the reply). */
	updateLatest(patch: Partial<TranscriptTurn>): void {
		const i = this.turns.length - 1;
		if (i < 0) return;
		const merged: TranscriptTurn = { ...this.turns[i], ...patch };
		this.turns = [...this.turns.slice(0, i), merged];
		persist(this.turns);
	}

	clear(): void {
		this.turns = [];
		persist(this.turns);
	}

	beginTurn(utterance: string): TranscriptTurn {
		const turn: TranscriptTurn = {
			id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
			timestamp: Date.now(),
			utterance,
			reply: null,
			via: 'unknown',
			spoke: false,
			error: null
		};
		this.add(turn);
		this.inFlight = true;
		return turn;
	}

	finishTurn(
		patch: Pick<TranscriptTurn, 'reply' | 'via' | 'spoke' | 'error'>
	): void {
		this.updateLatest(patch);
		this.inFlight = false;
	}
}

export const transcriptBus = new TranscriptBus();
