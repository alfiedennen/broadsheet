/**
 * Reactive bridge for the audit log.
 *
 * `audit.ts` is the source of truth (ring buffer + console + storage).
 * It's framework-free so it can be tested in isolation. This module
 * is the Svelte 5 runes adapter — components that want reactive
 * audit-log views read `auditTick` (a $state counter that increments
 * on every audit write) and call getAuditLog() to fetch the snapshot.
 *
 * Wired in app boot via `wireAuditReactivity()` in +layout.svelte.
 */

import { onAuditWrite } from '$lib/ha/audit';

class AuditReactiveStore {
	/** Increments on every audit write. Use as a $derived dep. */
	tick = $state<number>(0);
}

export const auditStore = new AuditReactiveStore();

let _unsub: (() => void) | null = null;

/** Hook the audit module's writes into the reactive tick. Call once at boot. */
export function wireAuditReactivity(): void {
	if (_unsub) return; // idempotent
	_unsub = onAuditWrite(() => {
		auditStore.tick++;
	});
}

/** Detach the reactive bridge. For tests + hot-reload safety. */
export function unwireAuditReactivity(): void {
	if (_unsub) {
		_unsub();
		_unsub = null;
	}
}
