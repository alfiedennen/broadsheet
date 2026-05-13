/**
 * Authentication mode detection + LLAT credential management.
 *
 * Three runtime auth modes (only LLAT is implemented in M1):
 *
 *  1. addon  — broadsheet runs as an HA add-on. nginx in the add-on
 *              container injects `Authorization: Bearer <SUPERVISOR_TOKEN>`
 *              for every API request, so the SPA never sees a token.
 *              WebSocket goes to same-origin /api/websocket and the proxy
 *              authenticates it. STUB at M1 — implementation in M5
 *              alongside the add-on packaging work.
 *
 *  2. llat   — dev / standalone path. User pastes HA URL + LLAT into the
 *              /setup form. We persist to localStorage. M1 ships this.
 *
 *  3. none   — no auth credentials available. UI redirects to /setup.
 *
 * Spec: ../../docs/DEV-ENVIRONMENTS.md (Env 1 dev path)
 *       ../../docs/ADDON-MOCK.md (M5 addon path)
 */

import { audit } from './audit';

export type AuthMode = 'addon' | 'llat' | 'none';

export interface LLATCredentials {
	mode: 'llat';
	url: string;
	token: string;
}

export interface AddonCredentials {
	mode: 'addon';
	// SPA hits same-origin; nginx injects Supervisor token via header.
	// No token visible to the SPA itself.
	url: string; // typically `''` (same-origin)
}

export type AuthCredentials = LLATCredentials | AddonCredentials;

const STORAGE_KEY_URL = 'broadsheet:ha:url';
const STORAGE_KEY_TOKEN = 'broadsheet:ha:token';

/**
 * Detect which auth mode we should use.
 *
 * Heuristic order (first match wins):
 *  1. If `window.__BROADSHEET_ENV__.ingressEntry` is set, we're inside
 *     the HA add-on (the add-on's `run.sh` writes this — see
 *     docs/ADDON-MOCK.md). Mode = 'addon'.
 *  2. If we have an LLAT in localStorage, mode = 'llat'.
 *  3. Otherwise, mode = 'none' — UI shows /setup.
 *
 * M1 only fully implements (2) + (3). (1) is detected but the
 * connection logic for it lands in M5.
 */
export function detectAuthMode(): AuthMode {
	if (typeof window === 'undefined') return 'none';

	// 1. Add-on environment (M5 path)
	if (
		typeof (window as Window & { __BROADSHEET_ENV__?: { ingressEntry?: string } })
			.__BROADSHEET_ENV__ !== 'undefined'
	) {
		return 'addon';
	}

	// 2. LLAT in storage
	if (getStoredLLAT().url && getStoredLLAT().token) {
		return 'llat';
	}

	// 3. No creds
	return 'none';
}

/** Return the current credentials, or null if none. */
export function getAuthCredentials(): AuthCredentials | null {
	const mode = detectAuthMode();
	if (mode === 'addon') {
		return { mode: 'addon', url: '' };
	}
	if (mode === 'llat') {
		const { url, token } = getStoredLLAT();
		if (url && token) return { mode: 'llat', url, token };
	}
	return null;
}

/** Persist LLAT credentials. */
export function saveLLAT(url: string, token: string): void {
	if (typeof localStorage === 'undefined') {
		throw new Error('localStorage unavailable — cannot save credentials');
	}
	const cleanUrl = normaliseUrl(url);
	localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
	localStorage.setItem(STORAGE_KEY_TOKEN, token);
	audit({
		kind: 'auth-event',
		note: `LLAT saved for ${cleanUrl}`
	});
}

/** Clear LLAT credentials (used by /settings/about → "Forget token"). */
export function clearLLAT(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(STORAGE_KEY_URL);
	localStorage.removeItem(STORAGE_KEY_TOKEN);
	audit({
		kind: 'auth-event',
		note: 'LLAT cleared'
	});
}

/* ─────────────── helpers ─────────────── */

function getStoredLLAT(): { url: string; token: string } {
	if (typeof localStorage === 'undefined') return { url: '', token: '' };
	return {
		url: localStorage.getItem(STORAGE_KEY_URL) ?? '',
		token: localStorage.getItem(STORAGE_KEY_TOKEN) ?? ''
	};
}

/**
 * Normalise an HA URL: strip trailing slash, ensure protocol.
 * Accepts `192.168.1.11:8123`, `homeassistant.local`, `https://...`.
 */
export function normaliseUrl(input: string): string {
	let url = input.trim();
	if (!url) return '';
	// Add protocol if missing (default to http for LAN, https for external)
	if (!/^https?:\/\//i.test(url)) {
		const isExternal = !/^(\d+\.\d+\.\d+\.\d+|[\w-]+\.local)(:\d+)?$/i.test(url);
		url = (isExternal ? 'https://' : 'http://') + url;
	}
	// Strip trailing slash(es)
	return url.replace(/\/+$/, '');
}

/** Validate that an HA URL is well-formed. */
export function isValidHaUrl(input: string): boolean {
	const url = normaliseUrl(input);
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * LLAT shape sniff. HA tokens are JWTs (eyJ... three base64-ish segments
 * separated by periods). This is the WS server's check too — we mirror
 * it here so /setup can give a useful error before round-tripping.
 */
export function looksLikeLLAT(input: string): boolean {
	const t = input.trim();
	if (!t) return false;
	const parts = t.split('.');
	if (parts.length !== 3) return false;
	return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
