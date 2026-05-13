/**
 * HA WebSocket client — wraps `home-assistant-js-websocket` with the
 * application-level heartbeat we learned to need in harold-home.
 *
 * Why heartbeat: TCP zombies. After a host restart (e.g. the ProDesk
 * power-cycling), the underlying socket can stay "open" from the OS
 * perspective long after HA has gone away. The library's own reconnect
 * doesn't trigger because there's no socket close event. Result:
 * silent broken connection, UI shows "connected" forever.
 *
 * Fix: ping every 30s, expect pong within 10s, force-close on timeout
 * → triggers library reconnect through its normal path.
 *
 * What this module does NOT do:
 *  - Layer 1 discovery pulls (registries, subscribe_entities) — that's
 *    M2 in src/lib/discovery/registries.ts
 *  - Service calls — that's actions.ts (M1.6, gated by safety rails)
 *
 * Spec: ../../docs/DISCOVERY-CONTRACT.md § "Library choice" + "Connection lifecycle"
 */

import {
	createConnection,
	createLongLivedTokenAuth,
	type Connection
} from 'home-assistant-js-websocket';
import { audit } from './audit';
import { connection as connStore } from '$lib/stores/connection.svelte';
import type { AuthCredentials } from './auth';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS_BEFORE_FATAL = 5;
/** Window over which reconnect attempts count toward "fatal" threshold. */
const RECONNECT_WINDOW_MS = 60_000;

let _connection: Connection | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectTimestamps: number[] = [];

/**
 * Get the underlying connection. Returns null if not connected.
 * Discovery + actions modules call this when they need to send messages.
 */
export function getConnection(): Connection | null {
	return _connection;
}

/**
 * Connect to HA. Idempotent — if already connected, no-op.
 *
 * For M1, only LLAT mode is supported. Add-on mode is detected at
 * the auth layer but the connection logic for it lands in M5 (it
 * needs a custom WS factory that talks to same-origin without an
 * explicit token).
 */
export async function connect(credentials: AuthCredentials): Promise<void> {
	if (_connection) {
		audit({ kind: 'connection-status', note: 'connect() called while already connected — no-op' });
		return;
	}

	if (credentials.mode === 'addon') {
		// M5 implements add-on connection. For now, fail loud rather than
		// silently misbehave.
		const msg = 'add-on auth mode not yet implemented (M5)';
		connStore.status = 'fatal';
		connStore.lastError = msg;
		audit({ kind: 'connection-status', note: msg });
		throw new Error(msg);
	}

	connStore.status = 'connecting';
	connStore.lastError = null;
	audit({ kind: 'connection-status', note: `connecting to ${credentials.url}` });

	try {
		const auth = createLongLivedTokenAuth(credentials.url, credentials.token);
		const conn = await createConnection({ auth });
		_connection = conn;
		_reconnectTimestamps = [];

		// Wire library-level lifecycle events
		conn.addEventListener('ready', onReady);
		conn.addEventListener('disconnected', onDisconnected);
		conn.addEventListener('reconnect-error', onReconnectError);

		// First connect succeeded — fire onReady manually since we missed
		// the initial event (we attached the listener after createConnection
		// resolved, by which point the event has already fired).
		onReady();
	} catch (err) {
		connStore.status = 'fatal';
		connStore.lastError = String(err);
		audit({
			kind: 'connection-status',
			note: 'initial connection failed',
			error: String(err)
		});
		throw err;
	}
}

/**
 * Disconnect cleanly. Used by /settings/about → "Forget token" + by
 * tests that need to reset state.
 */
export function disconnect(): void {
	stopHeartbeat();
	if (_connection) {
		try {
			_connection.close();
		} catch {
			/* ignore — already closed */
		}
		_connection = null;
	}
	connStore.status = 'idle';
	connStore.haVersion = null;
	audit({ kind: 'connection-status', note: 'disconnected (manual)' });
}

/* ─────────────── lifecycle handlers ─────────────── */

function onReady(): void {
	connStore.status = 'connected';
	connStore.lastConnectAt = new Date();
	connStore.lastError = null;
	connStore.reconnectAttempts = 0;

	// Pull HA version from the library — it stashes it on the connection
	// after the auth handshake.
	if (_connection) {
		const ver = (_connection as Connection & { haVersion?: string }).haVersion;
		if (ver) connStore.haVersion = ver;
	}

	audit({
		kind: 'connection-status',
		note: `connected (HA ${connStore.haVersion ?? 'unknown'})`
	});

	startHeartbeat();
}

function onDisconnected(): void {
	stopHeartbeat();
	connStore.status = 'reconnecting';
	connStore.lastDisconnectAt = new Date();
	connStore.reconnectAttempts++;

	// Track reconnect frequency — if we're flapping, escalate to fatal
	const now = Date.now();
	_reconnectTimestamps.push(now);
	_reconnectTimestamps = _reconnectTimestamps.filter((t) => now - t < RECONNECT_WINDOW_MS);

	audit({
		kind: 'connection-status',
		note: `disconnected — reconnect attempt #${connStore.reconnectAttempts} (${_reconnectTimestamps.length} in last ${RECONNECT_WINDOW_MS / 1000}s)`
	});

	if (_reconnectTimestamps.length > MAX_RECONNECT_ATTEMPTS_BEFORE_FATAL) {
		connStore.status = 'fatal';
		connStore.lastError = `${_reconnectTimestamps.length} reconnect failures in ${RECONNECT_WINDOW_MS / 1000}s — giving up`;
		audit({
			kind: 'connection-status',
			note: 'escalating to fatal',
			error: connStore.lastError
		});
		// Library would keep retrying; we stop it cold.
		if (_connection) {
			try {
				_connection.close();
			} catch {
				/* ignore */
			}
			_connection = null;
		}
	}
}

function onReconnectError(event: unknown): void {
	const msg = event instanceof Error ? event.message : String(event);
	audit({
		kind: 'connection-status',
		note: 'reconnect-error from library',
		error: msg
	});
	connStore.lastError = msg;
}

/* ─────────────── heartbeat ─────────────── */

function startHeartbeat(): void {
	stopHeartbeat();
	_heartbeatTimer = setInterval(sendPing, PING_INTERVAL_MS);
}

function stopHeartbeat(): void {
	if (_heartbeatTimer) {
		clearInterval(_heartbeatTimer);
		_heartbeatTimer = null;
	}
	if (_pongTimeoutTimer) {
		clearTimeout(_pongTimeoutTimer);
		_pongTimeoutTimer = null;
	}
}

async function sendPing(): Promise<void> {
	if (!_connection) {
		stopHeartbeat();
		return;
	}

	// If a previous pong is still pending, the previous ping never came
	// back. Skip this round — the prior pong-timeout will fire.
	if (_pongTimeoutTimer) return;

	_pongTimeoutTimer = setTimeout(onPongTimeout, PONG_TIMEOUT_MS);

	try {
		await _connection.ping();
		// Pong received in time — clear the timeout
		if (_pongTimeoutTimer) {
			clearTimeout(_pongTimeoutTimer);
			_pongTimeoutTimer = null;
		}
	} catch (err) {
		// Library threw — likely socket already closed. Let the
		// disconnected handler take it from here.
		if (_pongTimeoutTimer) {
			clearTimeout(_pongTimeoutTimer);
			_pongTimeoutTimer = null;
		}
		audit({
			kind: 'connection-status',
			note: 'ping threw',
			error: String(err)
		});
	}
}

function onPongTimeout(): void {
	_pongTimeoutTimer = null;
	if (!_connection) return;

	audit({
		kind: 'connection-status',
		note: `pong timeout (${PONG_TIMEOUT_MS}ms) — force-closing zombie WS`
	});

	// Force-close. The library's `disconnected` handler will fire and
	// trigger the normal reconnect flow.
	try {
		_connection.close();
	} catch {
		/* ignore */
	}
}
