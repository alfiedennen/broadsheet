/**
 * Harold preset — conversational memory.
 *
 * Embeds each exchange via @xenova/transformers (all-MiniLM-L6-v2,
 * 384-dim, ~25MB lazy-loaded on first use) + stores in sql.js
 * (SQLite in WASM, blob persisted to localStorage). Retrieves the
 * top-5 most semantically similar past exchanges for each new turn,
 * injects them as a "Topics from past conversations" block ahead
 * of the user message.
 *
 * Why lazy + browser-local:
 *   - First-use latency (~10s to download the model) is acceptable
 *     because most users never enable this in the first session.
 *   - Browser-local keeps the preset open-source-friendly: no
 *     server-side dependency, no API key, no per-user state for the
 *     dev to manage.
 *
 * Storage budget:
 *   - SQLite blob in localStorage: ~50KB per 100 exchanges
 *     (compressed cosine vectors + text). 50 turns is the visible
 *     transcript cap; we keep up to 1000 in the embedding index.
 *   - The embedding model itself: ~25MB, fetched from
 *     huggingface.co/Xenova/all-MiniLM-L6-v2 the first time.
 *     Cached by the browser thereafter.
 *
 * Spec: docs/plans/plan-harold-preset.md.
 */

import type { TranscriptTurn } from '@broadsheet/voice';

const STORAGE_KEY = 'broadsheet:harold-preset:memory:db';
const MAX_ENTRIES = 1000;
const RETRIEVE_TOP_K = 5;
// Cosine-distance threshold under which exchanges are "similar enough"
// to surface. Tuned empirically; values closer to 0 = more similar.
const SIMILARITY_THRESHOLD = 0.45;

export type MemoryMode = 'off' | 'local';

interface MemoryEntry {
	id: string;
	timestamp: number;
	utterance: string;
	reply: string;
	embedding: Float32Array;
}

class MemoryStore {
	private entries: MemoryEntry[] = [];
	private embedder: ((text: string) => Promise<Float32Array>) | null = null;
	private modelLoadPromise: Promise<void> | null = null;
	private mode: MemoryMode = 'off';

	setMode(mode: MemoryMode): void {
		this.mode = mode;
		if (mode === 'local') {
			this.load();
		} else {
			this.entries = [];
		}
	}

	get currentMode(): MemoryMode {
		return this.mode;
	}

	get size(): number {
		return this.entries.length;
	}

	/**
	 * Lazily download + initialise the embedding model. First call
	 * triggers the ~25MB fetch + WASM bootstrap (5-15s); subsequent
	 * calls await the same promise.
	 */
	private async ensureEmbedder(): Promise<void> {
		if (this.embedder) return;
		if (this.modelLoadPromise) {
			await this.modelLoadPromise;
			return;
		}
		this.modelLoadPromise = (async () => {
			// Dynamic import keeps the ~5MB Transformers.js bundle out
			// of broadsheet's initial chunk. Only loads when memory
			// is actually used.
			const { pipeline } = await import('@xenova/transformers');
			const extractor = await pipeline(
				'feature-extraction',
				'Xenova/all-MiniLM-L6-v2',
				{ quantized: true } // 4x smaller download, ~same quality
			);
			this.embedder = async (text: string) => {
				const out = await extractor(text, { pooling: 'mean', normalize: true });
				return new Float32Array(out.data as Float32Array);
			};
		})();
		await this.modelLoadPromise;
	}

	/**
	 * Cosine similarity (assumes both vectors are L2-normalised — which
	 * the embedder is configured to do via `normalize: true`).
	 */
	private similarity(a: Float32Array, b: Float32Array): number {
		let dot = 0;
		for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
		// Pre-normalised → cosine sim is just the dot product
		return dot;
	}

	/**
	 * Persist a single exchange. No-op if memory mode is off OR the
	 * reply is empty (silent device-control turns don't earn memory).
	 */
	async record(turn: TranscriptTurn): Promise<void> {
		if (this.mode !== 'local') return;
		if (!turn.reply?.trim()) return;
		if (turn.via !== 'llm') return; // HA-native turns are too noisy
		try {
			await this.ensureEmbedder();
			if (!this.embedder) return;
			const concat = `${turn.utterance}\n${turn.reply}`;
			const embedding = await this.embedder(concat);
			this.entries.push({
				id: turn.id,
				timestamp: turn.timestamp,
				utterance: turn.utterance,
				reply: turn.reply,
				embedding
			});
			if (this.entries.length > MAX_ENTRIES) {
				this.entries.splice(0, this.entries.length - MAX_ENTRIES);
			}
			this.persist();
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[harold-preset] memory.record failed', err);
		}
	}

	/**
	 * Retrieve top-K semantically similar past exchanges. Returns
	 * formatted prompt-prefix text (or empty string).
	 */
	async retrieve(text: string): Promise<string> {
		if (this.mode !== 'local' || this.entries.length === 0) return '';
		try {
			await this.ensureEmbedder();
			if (!this.embedder) return '';
			const query = await this.embedder(text);
			const scored = this.entries.map((e) => ({
				entry: e,
				score: this.similarity(query, e.embedding)
			}));
			scored.sort((a, b) => b.score - a.score);
			const top = scored
				.filter((s) => s.score >= 1 - SIMILARITY_THRESHOLD)
				.slice(0, RETRIEVE_TOP_K);
			if (top.length === 0) return '';
			const lines = top.map((s) => {
				const date = new Date(s.entry.timestamp).toLocaleDateString();
				return `- ${date}: "${s.entry.utterance}" → "${s.entry.reply}"`;
			});
			return [
				'Topics from past conversations (do not echo prior phrasing):',
				...lines
			].join('\n');
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[harold-preset] memory.retrieve failed', err);
			return '';
		}
	}

	clear(): void {
		this.entries = [];
		this.persist();
	}

	/**
	 * Persist to localStorage as base64-encoded Float32Array blobs.
	 * Crude — sql.js was the original plan but its WASM init cost on
	 * every page load is wasteful for ≤1000 entries. localStorage
	 * suffices for v0.1; v0.2 can upgrade to sql.js or Turso.
	 */
	private persist(): void {
		if (typeof window === 'undefined') return;
		try {
			const serialised = this.entries.map((e) => ({
				id: e.id,
				timestamp: e.timestamp,
				utterance: e.utterance,
				reply: e.reply,
				// Float32Array → regular array for JSON
				embedding: Array.from(e.embedding)
			}));
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialised));
		} catch (err) {
			// localStorage full / disabled — degraded but not broken
			// eslint-disable-next-line no-console
			console.warn('[harold-preset] memory.persist failed', err);
		}
	}

	private load(): void {
		if (typeof window === 'undefined') return;
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Array<{
				id: string;
				timestamp: number;
				utterance: string;
				reply: string;
				embedding: number[];
			}>;
			this.entries = parsed.map((p) => ({
				...p,
				embedding: new Float32Array(p.embedding)
			}));
		} catch {
			this.entries = [];
		}
	}
}

export const memory = new MemoryStore();
