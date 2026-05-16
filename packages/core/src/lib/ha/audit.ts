/**
 * Audit log — every service-call attempt + connection event lands here.
 *
 * Three sinks:
 *  1. In-memory ring buffer (last 1000 entries) — for in-app diagnostics
 *     surface in /settings/about (M4).
 *  2. Browser console — `[broadsheet:audit]` prefix + colour for visibility.
 *  3. localStorage `broadsheet:audit` — last 100 entries, JSONL string.
 *     Survives reload, helps diagnose post-hoc failures. NOT a security
 *     log — it's a developer aid.
 *
 * What this is NOT: server-side persistence. That's M5's sidecar work
 * (audit log will mirror to /data/audit.jsonl in the add-on path).
 *
 * Spec: ../../docs/DEV-ENVIRONMENTS.md § "Service-call audit log"
 */

import type { AuditEntry } from './types';

const RING_SIZE = 1000;
const STORAGE_KEY = 'broadsheet:audit';
const STORAGE_TAIL = 100;

const ring: AuditEntry[] = [];
let writeListeners: Array<(entry: AuditEntry) => void> = [];

/**
 * Per-session monotonic counter for audit entry IDs.
 *
 * Why: timestamps from `new Date().toISOString()` collide when multiple
 * events fire within the same millisecond — which happens on every
 * boot (auth-event + connection-status fire back-to-back). Svelte 5
 * keyed-each rightly throws `each_key_duplicate` if we use timestamp.
 *
 * IDs are session-only; restored entries from localStorage get fresh
 * IDs assigned during restoreAuditFromStorage().
 */
let _seq = 0;

/** Record an audit event. */
export function audit(entry: Omit<AuditEntry, 'timestamp' | 'id'>): void {
	const full: AuditEntry = {
		...entry,
		id: ++_seq,
		timestamp: new Date().toISOString()
	};

	// 1. In-memory ring buffer
	ring.push(full);
	if (ring.length > RING_SIZE) ring.shift();

	// 2. Console — colour-code by kind for skimmability
	const colour = consoleColourFor(full.kind);
	const summary = formatForConsole(full);
	if (typeof console !== 'undefined') {
		// eslint-disable-next-line no-console
		console.log(`%c[broadsheet:audit] ${summary}`, `color:${colour}`, full);
	}

	// 3. localStorage tail
	if (typeof localStorage !== 'undefined') {
		try {
			const tail = ring.slice(-STORAGE_TAIL);
			localStorage.setItem(STORAGE_KEY, JSON.stringify(tail));
		} catch {
			// localStorage quota or disabled — silently degrade
		}
	}

	// 4. Notify subscribers
	for (const fn of writeListeners) {
		try {
			fn(full);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('[broadsheet:audit] listener threw', err);
		}
	}
}

/** Read the in-memory ring buffer (newest last). */
export function getAuditLog(): readonly AuditEntry[] {
	return ring.slice();
}

/** Clear the in-memory + localStorage audit log. */
export function clearAuditLog(): void {
	ring.length = 0;
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}
}

/** Subscribe to new audit entries. Returns an unsubscribe fn. */
export function onAuditWrite(fn: (entry: AuditEntry) => void): () => void {
	writeListeners.push(fn);
	return () => {
		writeListeners = writeListeners.filter((l) => l !== fn);
	};
}

/** Restore the localStorage tail into the in-memory ring on boot. */
export function restoreAuditFromStorage(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return;
		for (const entry of parsed) {
			if (entry && typeof entry === 'object' && entry.timestamp && entry.kind) {
				// Re-assign id from this session's _seq — restored entries
				// don't keep their old IDs (they could collide with new ones)
				ring.push({ ...entry, id: ++_seq } as AuditEntry);
			}
		}
	} catch {
		// Corrupt storage — clear it and move on
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}
}

/* ─────────────── helpers ─────────────── */

function consoleColourFor(kind: AuditEntry['kind']): string {
	switch (kind) {
		case 'call-service':
			return '#7aa37a'; // sage — successful action
		case 'blocked-readonly':
			return '#c08a4a'; // amber — soft block
		case 'blocked-hard-banned':
			return '#bf3a30'; // rust — hard block
		case 'dry-run':
			return '#8a7f6f'; // muted — fake call
		case 'call-service-error':
			return '#bf3a30'; // rust — real error
		case 'registry-write':
			return '#6f93a3'; // slate-blue — registry mutation
		case 'admin-write':
			return '#9b7cb8'; // dusty-violet — settings admin mutation
		case 'connection-status':
			return '#a89978'; // gold — lifecycle
		case 'auth-event':
			return '#a89978'; // gold — lifecycle
		default:
			return '#8a7f6f';
	}
}

function formatForConsole(e: AuditEntry): string {
	switch (e.kind) {
		case 'call-service':
			return `→ ${e.domain}.${e.service}`;
		case 'blocked-readonly':
			return `⊘ readonly: ${e.domain}.${e.service}`;
		case 'blocked-hard-banned':
			return `⊗ hard-banned: ${e.domain}.${e.service}`;
		case 'dry-run':
			return `⤳ dry-run: ${e.domain}.${e.service}`;
		case 'call-service-error':
			return `✗ ${e.domain}.${e.service}: ${e.error}`;
		case 'registry-write':
			return `⊕ ${e.note}`;
		case 'admin-write':
			return `⊜ ${e.note}`;
		case 'connection-status':
			return `◇ ${e.note}`;
		case 'auth-event':
			return `◈ ${e.note}`;
		default:
			return JSON.stringify(e);
	}
}
