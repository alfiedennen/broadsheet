/**
 * HA system_log WS wrapper — recent errors + warnings + clear.
 *
 * Powers /settings/logs. HA's `system_log` captures every Python
 * warning + exception emitted by core or integrations. The list is
 * bounded (HA holds the most recent ~50 by default) and persistent
 * across restarts. Clear is per-integration or all-at-once.
 *
 * v0.1.0 ships read + clear-all. Per-integration filter is a
 * client-side group-by; HA's clear endpoint doesn't take a filter
 * argument so the "clear this integration's errors" affordance
 * deletes ALL system_log entries for now. Most users will only
 * have a handful so it's not catastrophic.
 *
 * Spec: docs/plans/plan-ha-settings-native-uis.md.
 */

import { audit } from '$lib/ha/audit';
import { getConnection } from '$lib/ha/client';
import type { ServiceCallResult } from '$lib/ha/types';

export interface SystemLogEntry {
	name: string;
	message: string[];
	level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
	source: [string, number]; // [file, line]
	timestamp: number; // unix seconds
	exception: string;
	count: number; // repeat-count
	first_occurred: number;
}

export async function listSystemLog(): Promise<SystemLogEntry[]> {
	const conn = getConnection();
	if (!conn) return [];
	try {
		const result = await conn.sendMessagePromise<SystemLogEntry[]>({
			type: 'system_log/list'
		});
		return result ?? [];
	} catch (err) {
		audit({
			kind: 'admin-write',
			note: 'listSystemLog failed',
			error: err instanceof Error ? err.message : String(err)
		});
		return [];
	}
}

export async function clearSystemLog(): Promise<ServiceCallResult> {
	const conn = getConnection();
	if (!conn) {
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}
	audit({ kind: 'admin-write', note: 'clear system_log' });
	try {
		await conn.sendMessagePromise({
			type: 'system_log/clear'
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({ kind: 'admin-write', note: 'clear system_log failed', error: msg });
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Try to extract the integration name from a log entry's `name`
 * field. HA log names are like `homeassistant.components.<integration>.x.y.z`
 * — the integration is the segment after `components.`.
 *
 * Falls back to the first segment for non-integration logs (core
 * exceptions, etc).
 */
export function integrationFromLog(entry: SystemLogEntry): string {
	const parts = entry.name.split('.');
	const idx = parts.indexOf('components');
	if (idx >= 0 && idx + 1 < parts.length) {
		return parts[idx + 1];
	}
	return parts[0] ?? 'unknown';
}

/**
 * Group log entries by integration. Within each group, sorted by
 * most-recent first. Useful for the editorial "Sonos has 2 errors,
 * Yale has 1, Z2M has 1" prose.
 */
export function logsByIntegration(entries: SystemLogEntry[]): Map<string, SystemLogEntry[]> {
	const m = new Map<string, SystemLogEntry[]>();
	for (const e of entries) {
		const integ = integrationFromLog(e);
		if (!m.has(integ)) m.set(integ, []);
		m.get(integ)!.push(e);
	}
	for (const arr of m.values()) {
		arr.sort((a, b) => b.timestamp - a.timestamp);
	}
	return m;
}

/**
 * Editorial summary line — "12 entries from 5 integrations, 3
 * errors, 9 warnings". Compact enough to sit as a hero dek.
 */
export function logSummary(entries: SystemLogEntry[]): string {
	if (entries.length === 0) {
		return 'No recent errors or warnings — HA is quiet.';
	}
	const errors = entries.filter((e) => e.level === 'ERROR' || e.level === 'CRITICAL').length;
	const warnings = entries.filter((e) => e.level === 'WARNING').length;
	const others = entries.length - errors - warnings;
	const integrationCount = new Set(entries.map(integrationFromLog)).size;

	const parts: string[] = [];
	if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
	if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
	if (others > 0) parts.push(`${others} info`);
	const breakdown = parts.join(', ');

	return `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} from ${integrationCount} ${integrationCount === 1 ? 'integration' : 'integrations'}. ${breakdown}.`;
}
