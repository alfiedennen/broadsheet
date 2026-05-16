/**
 * HA Supervisor `supervisor/api` WS wrapper — addon list + start/stop/update.
 *
 * Powers /settings/addons. Goes through HA's WS supervisor/api
 * passthrough so the SPA doesn't need a separate proxy. Only
 * available when HA is running on Supervisor (HA OS / HA
 * Supervised); HA Core / Container installs return errors —
 * surface gracefully.
 *
 * For v0.1.0 we expose start / stop / update / restart on OTHER
 * addons (the user has admin authority to do this in HA's UI
 * already; we're just re-skinning that surface). UNINSTALL stays
 * deep-linked out to HA's UI as a friction gate (destructive +
 * irreversible).
 *
 * Spec: docs/plans/plan-ha-settings-native-uis.md.
 */

import { audit } from '$lib/ha/audit';
import { getConnection } from '$lib/ha/client';
import type { ServiceCallResult } from '$lib/ha/types';

export interface AddonInfo {
	slug: string;
	name: string;
	description: string;
	version: string;
	version_latest: string;
	update_available: boolean;
	state: 'started' | 'stopped' | 'unknown' | 'error';
	url: string;
	icon: boolean;
	logo: boolean;
	repository: string;
	advanced: boolean;
	stage: 'stable' | 'experimental' | 'deprecated';
	installed: string | null;
}

interface AddonsListResponse {
	addons?: AddonInfo[];
}

async function supervisorRequest<T>(
	endpoint: string,
	method: 'get' | 'post' = 'get'
): Promise<T | null> {
	const conn = getConnection();
	if (!conn) return null;
	try {
		const result = await conn.sendMessagePromise<{ data?: T; result?: string }>({
			type: 'supervisor/api',
			endpoint,
			method,
			timeout: 30
		});
		// Supervisor wraps responses in { result: 'ok', data: {...} } —
		// the WS layer unwraps the top-level but we still get .data.
		// Some endpoints return data directly; tolerate either.
		return ((result as unknown as { data?: T }).data ?? (result as unknown as T)) ?? null;
	} catch (err) {
		audit({
			kind: 'admin-write',
			note: `supervisor/api ${method.toUpperCase()} ${endpoint} failed`,
			error: err instanceof Error ? err.message : String(err)
		});
		return null;
	}
}

export async function listAddons(): Promise<AddonInfo[]> {
	const result = await supervisorRequest<AddonsListResponse>('/addons');
	return result?.addons ?? [];
}

export async function startAddon(slug: string): Promise<ServiceCallResult> {
	audit({ kind: 'admin-write', note: `start addon: ${slug}` });
	const ok = await supervisorRequest<unknown>(`/addons/${slug}/start`, 'post');
	if (ok === null) {
		return { success: false, reason: 'ha-error', error: 'supervisor call failed' };
	}
	return { success: true };
}

export async function stopAddon(slug: string): Promise<ServiceCallResult> {
	audit({ kind: 'admin-write', note: `stop addon: ${slug}` });
	const ok = await supervisorRequest<unknown>(`/addons/${slug}/stop`, 'post');
	if (ok === null) {
		return { success: false, reason: 'ha-error', error: 'supervisor call failed' };
	}
	return { success: true };
}

export async function restartAddon(slug: string): Promise<ServiceCallResult> {
	audit({ kind: 'admin-write', note: `restart addon: ${slug}` });
	const ok = await supervisorRequest<unknown>(`/addons/${slug}/restart`, 'post');
	if (ok === null) {
		return { success: false, reason: 'ha-error', error: 'supervisor call failed' };
	}
	return { success: true };
}

export async function updateAddon(slug: string): Promise<ServiceCallResult> {
	audit({ kind: 'admin-write', note: `update addon: ${slug}` });
	// Updates can take minutes — bumping the supervisor passthrough
	// timeout doesn't help (HA still has its own); the UI fires +
	// surfaces status polling rather than blocking on completion.
	const ok = await supervisorRequest<unknown>(`/addons/${slug}/update`, 'post');
	if (ok === null) {
		return { success: false, reason: 'ha-error', error: 'supervisor call failed' };
	}
	return { success: true };
}

/**
 * Group addons by status. v0.1 distinguishes:
 *   - errors      — state=error (any addon in a broken state)
 *   - running     — state=started
 *   - stopped     — state=stopped
 *   - updates     — state=started AND update_available
 * "updates" is a derived view, not a partition — those addons ALSO
 * appear in running.
 */
export function groupAddons(addons: AddonInfo[]): {
	errors: AddonInfo[];
	running: AddonInfo[];
	stopped: AddonInfo[];
	updates: AddonInfo[];
} {
	const out = {
		errors: [] as AddonInfo[],
		running: [] as AddonInfo[],
		stopped: [] as AddonInfo[],
		updates: [] as AddonInfo[]
	};
	for (const a of addons) {
		if (a.state === 'error') {
			out.errors.push(a);
		} else if (a.state === 'started') {
			out.running.push(a);
			if (a.update_available) out.updates.push(a);
		} else if (a.state === 'stopped') {
			out.stopped.push(a);
		}
	}
	for (const arr of [out.errors, out.running, out.stopped, out.updates]) {
		arr.sort((a, b) => a.name.localeCompare(b.name));
	}
	return out;
}
