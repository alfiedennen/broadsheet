/**
 * Connection lifecycle store. Reactive via Svelte 5 runes — consumers
 * read these fields and re-render when they change.
 *
 * Status transitions:
 *   idle → connecting → connected
 *                          ↓ (network drop or pong timeout)
 *                       reconnecting → connected (loop)
 *                          ↓ (5+ failed reconnects in 60s)
 *                       fatal (user must intervene)
 *
 * Spec: ../../../docs/DISCOVERY-CONTRACT.md § "Connection lifecycle"
 */

import type { ConnectionStatus } from '$lib/ha/types';

class ConnectionStore {
	status = $state<ConnectionStatus>('idle');
	lastError = $state<string | null>(null);
	lastConnectAt = $state<Date | null>(null);
	lastDisconnectAt = $state<Date | null>(null);
	reconnectAttempts = $state<number>(0);
	/** HA Core version, populated after auth handshake. Null until known. */
	haVersion = $state<string | null>(null);
}

export const connection = new ConnectionStore();
