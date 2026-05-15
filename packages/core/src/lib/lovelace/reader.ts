/**
 * Lovelace dashboard reader — WS API thin wrapper.
 *
 * HA exposes Lovelace dashboards via two WS messages:
 *   - `lovelace/dashboards/list` — every dashboard the user has,
 *     including the default + storage + every YAML-mode dashboard
 *   - `lovelace/config` — full config for one dashboard, or the
 *     default if no `url_path` given (returns the storage object
 *     for storage-mode, or the parsed YAML for yaml-mode)
 *
 * The translator (./translate.ts) consumes whatever shape these
 * return; this file is the boundary with HA. Authoring + editing
 * Lovelace is HA's job, not broadsheet's.
 */

import { getConnection } from '$lib/ha/client';
import { audit } from '$lib/ha/audit';

/* ── Types mirroring HA's WS responses ────────────────────────────── */

/** One dashboard entry from `lovelace/dashboards/list`. */
export interface LovelaceDashboardEntry {
	id: string;
	url_path: string | null; // null for the default
	title: string;
	icon?: string;
	mode?: 'storage' | 'yaml';
	require_admin?: boolean;
	show_in_sidebar?: boolean;
}

/**
 * A Lovelace card. The shape varies wildly by `type`; we keep this
 * permissive and let the translator sort it out per-type.
 */
export interface LovelaceCard {
	type: string;
	[key: string]: unknown;
}

/** A view inside a Lovelace dashboard — the "tab" abstraction. */
export interface LovelaceView {
	title?: string;
	path?: string; // url-friendly slug for the view
	icon?: string;
	cards?: LovelaceCard[];
	// Some views use a sub-section structure (e.g. masonry layouts).
	// The translator falls back to recursing whatever array of cards
	// it can find.
	[key: string]: unknown;
}

/** A full Lovelace config (storage-mode or parsed YAML). */
export interface LovelaceConfig {
	title?: string;
	views?: LovelaceView[];
	[key: string]: unknown;
}

/* ── WS readers ────────────────────────────────────────────────────── */

/**
 * List every Lovelace dashboard configured in HA.
 *
 * Note: HA's `lovelace/dashboards/list` returns ONLY user-added
 * dashboards, NOT the default dashboard. We splice the default in at
 * the front so users can import from it (the most common case for
 * vanilla installs that haven't created any extra dashboards).
 */
export async function listLovelaceDashboards(): Promise<LovelaceDashboardEntry[]> {
	const conn = getConnection();
	if (!conn) {
		audit({
			kind: 'auth-event',
			note: 'listLovelaceDashboards: no connection'
		});
		return [];
	}
	try {
		const result = (await conn.sendMessagePromise({
			type: 'lovelace/dashboards/list'
		})) as unknown;
		// HA returns an array; defensive handling for unexpected shapes.
		const arr = Array.isArray(result) ? (result as LovelaceDashboardEntry[]) : [];
		audit({
			kind: 'auth-event',
			note: `listLovelaceDashboards: ${arr.length} extra dashboard(s)`
		});
		// Always include the default dashboard at the head of the list.
		const defaultEntry: LovelaceDashboardEntry = {
			id: '__default__',
			url_path: null,
			title: 'Overview (default)',
			mode: 'storage'
		};
		return [defaultEntry, ...arr];
	} catch (err) {
		audit({
			kind: 'auth-event',
			note: 'listLovelaceDashboards FAILED',
			error: String(err)
		});
		// Even on error, return the default — it's the most common case
		// and lovelace/config without url_path will succeed for it.
		return [
			{
				id: '__default__',
				url_path: null,
				title: 'Overview (default)',
				mode: 'storage'
			}
		];
	}
}

/**
 * Fetch a Lovelace dashboard's full config. Pass null/undefined for
 * the default dashboard. yaml-mode dashboards return the parsed YAML
 * object; storage-mode return the saved storage object — both shapes
 * are LovelaceConfig-compatible.
 */
export async function getLovelaceConfig(
	urlPath: string | null = null
): Promise<LovelaceConfig | null> {
	const conn = getConnection();
	if (!conn) {
		audit({
			kind: 'auth-event',
			note: 'getLovelaceConfig: no connection'
		});
		return null;
	}
	try {
		const message: { type: string; url_path?: string; force?: boolean } = {
			type: 'lovelace/config',
			force: true
		};
		if (urlPath) message.url_path = urlPath;
		const result = (await conn.sendMessagePromise(message)) as LovelaceConfig;
		return result ?? null;
	} catch (err) {
		audit({
			kind: 'auth-event',
			note: `getLovelaceConfig("${urlPath ?? 'default'}") FAILED`,
			error: String(err)
		});
		return null;
	}
}
