/**
 * HA config_entries WS wrapper — read + mutate.
 *
 * Powers /settings/integrations. Reads the user's installed
 * integrations (each = one ConfigEntry in HA's parlance), supports
 * the routine mutations: reload, disable, re-enable, remove. Setup
 * (new-integration wizards) drops out to HA's UI via HaFallbackLink.
 *
 * Subscribes to `config_entries_updated` events so the list stays
 * live across add/remove/reload from any source.
 *
 * Safety: per the registry.ts pattern, these are metadata mutations
 * (no hardware actuation) so the readonly flag doesn't gate them.
 * Removing an integration IS destructive — the UI confirms before
 * the call. Audit-logged under `admin-write` kind.
 *
 * Spec: docs/plans/plan-ha-settings-native-uis.md.
 */

import { audit } from '$lib/ha/audit';
import { getConnection } from '$lib/ha/client';
import type { ServiceCallResult } from '$lib/ha/types';

/**
 * One installed integration entry. Mirrors HA's `ConfigEntry`
 * shape (with the fields we care about; the full HA payload has
 * more we don't need yet).
 */
export interface ConfigEntry {
	entry_id: string;
	domain: string;
	title: string;
	source: string;
	state:
		| 'loaded'
		| 'setup_error'
		| 'setup_retry'
		| 'not_loaded'
		| 'failed_unload'
		| 'setup_in_progress';
	reason: string | null;
	pref_disable_polling: boolean;
	pref_disable_new_entities: boolean;
	disabled_by: string | null;
	supports_options: boolean;
	supports_remove_device: boolean;
	supports_unload: boolean;
	supports_reconfigure: boolean;
}

export async function listConfigEntries(): Promise<ConfigEntry[]> {
	const conn = getConnection();
	if (!conn) return [];
	try {
		const result = await conn.sendMessagePromise<ConfigEntry[]>({
			type: 'config_entries/get'
		});
		return result ?? [];
	} catch (err) {
		audit({
			kind: 'admin-write',
			note: 'listConfigEntries failed',
			error: err instanceof Error ? err.message : String(err)
		});
		return [];
	}
}

export async function reloadEntry(entry: ConfigEntry): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `reload integration: ${entry.domain}/${entry.title}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config_entries/reload',
			entry_id: entry.entry_id
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({ kind: 'admin-write', note: `reload failed: ${entry.title}`, error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

export async function disableEntry(entry: ConfigEntry): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `disable integration: ${entry.domain}/${entry.title}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config_entries/disable',
			entry_id: entry.entry_id,
			disabled_by: 'user'
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({ kind: 'admin-write', note: `disable failed: ${entry.title}`, error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

export async function enableEntry(entry: ConfigEntry): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `enable integration: ${entry.domain}/${entry.title}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config_entries/disable',
			entry_id: entry.entry_id,
			disabled_by: null
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({ kind: 'admin-write', note: `enable failed: ${entry.title}`, error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

export async function removeEntry(entry: ConfigEntry): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({
		kind: 'admin-write',
		note: `REMOVE integration: ${entry.domain}/${entry.title}`
	});
	try {
		await conn.sendMessagePromise({
			type: 'config_entries/remove',
			entry_id: entry.entry_id
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({ kind: 'admin-write', note: `remove failed: ${entry.title}`, error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Subscribe to `config_entries_updated` events. Returns the
 * unsubscribe function. Caller wires the callback to refresh their
 * local entries cache.
 */
export async function subscribeEntries(
	onChange: () => void
): Promise<() => void> {
	const conn = getConnection();
	if (!conn) return () => {};
	try {
		const unsub = await conn.subscribeMessage(
			() => onChange(),
			{ type: 'subscribe_events', event_type: 'config_entry_updated' }
		);
		return () => {
			try {
				unsub();
			} catch {
				// Swallow — connection may have died
			}
		};
	} catch (err) {
		audit({
			kind: 'admin-write',
			note: 'subscribeEntries failed',
			error: err instanceof Error ? err.message : String(err)
		});
		return () => {};
	}
}

/**
 * Editorial status partition — groups entries into the three buckets
 * the /settings/integrations surface renders.
 */
export type IntegrationGroup = 'errors' | 'working' | 'disabled';

export function groupEntries(entries: ConfigEntry[]): Record<IntegrationGroup, ConfigEntry[]> {
	const out: Record<IntegrationGroup, ConfigEntry[]> = {
		errors: [],
		working: [],
		disabled: []
	};
	for (const e of entries) {
		if (e.disabled_by) {
			out.disabled.push(e);
		} else if (e.state === 'setup_error' || e.state === 'setup_retry' || e.state === 'failed_unload') {
			out.errors.push(e);
		} else {
			out.working.push(e);
		}
	}
	// Sort by title within each bucket for stable list ordering
	for (const k of Object.keys(out) as IntegrationGroup[]) {
		out[k].sort((a, b) => a.title.localeCompare(b.title));
	}
	return out;
}
