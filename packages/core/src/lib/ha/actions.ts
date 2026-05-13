/**
 * Service-call wrapper with safety rails.
 *
 * Every write to HA goes through `callService()` here. The wrapper
 * checks, in this order:
 *
 *   1. Hard-banned domains (lock.*)         → blocked, audit, no override
 *   2. Dry-run mode (env)                   → fake success, audit
 *   3. Readonly + no per-session unlock     → blocked, audit
 *   4. Not connected                        → blocked, audit
 *   5. Otherwise                            → audit + delegate to client
 *
 * Hard-banned domains are blocked even with `?allow-writes=true`. The
 * intent is "you cannot accidentally unlock the front door from dev
 * mode, ever." The list is small + explicit, additions need a code
 * change + commit (deliberate friction).
 *
 * Spec: ../../docs/DEV-ENVIRONMENTS.md § "Safety rails"
 */

import { audit } from './audit';
import { getConnection } from './client';
import { canWrite } from '$lib/stores/safety.svelte';
import type { ServiceCallResult } from './types';

/**
 * Domains where writes are NEVER allowed in dev mode regardless of
 * the per-session unlock flag. Locks are the canonical example —
 * a bug here is meaningfully expensive (security incident, lockout).
 *
 * If you genuinely need to test lock interactions, do it in Env 3
 * (production canary, with a human present, NEVER overnight) — not in
 * Env 1 dev. See DEV-ENVIRONMENTS.md.
 */
const HARD_BANNED_DOMAINS = new Set(['lock']);

/**
 * Dry-run mode (separate from readonly). When true, callService()
 * returns a plausible success response without ever touching HA.
 * Useful for testing UI flows that depend on success state without
 * touching the house at all. Off by default; toggled via env.
 */
let _dryRun = false;

export function setDryRun(enabled: boolean): void {
	_dryRun = enabled;
	audit({
		kind: 'auth-event',
		note: `dry-run mode ${enabled ? 'ENABLED' : 'disabled'}`
	});
}

export function isDryRun(): boolean {
	return _dryRun;
}

/**
 * Call an HA service with safety-rail enforcement.
 *
 * @param domain  HA service domain, e.g. 'light', 'climate', 'lock'
 * @param service Service name, e.g. 'turn_on', 'set_temperature', 'unlock'
 * @param target  HA target spec, e.g. { entity_id: 'light.office_pendant' }
 * @param data    Optional service data, e.g. { brightness: 200, kelvin: 2700 }
 *
 * Returns a ServiceCallResult — the caller is responsible for
 * surfacing failures to the user (toast, etc.). The wrapper itself
 * NEVER throws — it always returns a structured result.
 */
export async function callService(
	domain: string,
	service: string,
	target?: unknown,
	data?: unknown
): Promise<ServiceCallResult> {
	// 1. Hard-banned check — first, no override
	if (HARD_BANNED_DOMAINS.has(domain)) {
		audit({
			kind: 'blocked-hard-banned',
			domain,
			service,
			target,
			data,
			note: `${domain}.* is hard-banned in dev mode`
		});
		return { success: false, reason: 'hard-banned' };
	}

	// 2. Dry-run — fake success, no real call
	if (_dryRun) {
		audit({ kind: 'dry-run', domain, service, target, data });
		return { success: true, reason: 'dry-run' };
	}

	// 3. Readonly + no per-session unlock
	if (!canWrite()) {
		audit({
			kind: 'blocked-readonly',
			domain,
			service,
			target,
			data,
			note: 'readonly mode active — append ?allow-writes=true to URL to enable'
		});
		return { success: false, reason: 'readonly' };
	}

	// 4. Not connected
	const conn = getConnection();
	if (!conn) {
		audit({
			kind: 'call-service-error',
			domain,
			service,
			target,
			data,
			error: 'no active connection'
		});
		return { success: false, reason: 'not-connected', error: 'No active HA connection' };
	}

	// 5. Make the real call
	audit({ kind: 'call-service', domain, service, target, data });
	try {
		await conn.sendMessagePromise({
			type: 'call_service',
			domain,
			service,
			target,
			service_data: data
		});
		return { success: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		audit({
			kind: 'call-service-error',
			domain,
			service,
			target,
			data,
			error: msg
		});
		return { success: false, reason: 'ha-error', error: msg };
	}
}

/**
 * Sugar for the very common case of toggling an entity's primary
 * service (light.turn_on, switch.turn_off, etc).
 */
export async function callOn(entityId: string, data?: unknown): Promise<ServiceCallResult> {
	const domain = entityId.split('.')[0];
	return callService(domain, 'turn_on', { entity_id: entityId }, data);
}

export async function callOff(entityId: string, data?: unknown): Promise<ServiceCallResult> {
	const domain = entityId.split('.')[0];
	return callService(domain, 'turn_off', { entity_id: entityId }, data);
}

export async function callToggle(entityId: string, data?: unknown): Promise<ServiceCallResult> {
	const domain = entityId.split('.')[0];
	return callService(domain, 'toggle', { entity_id: entityId }, data);
}

/** Read-only — the list of currently hard-banned domains. */
export function getHardBannedDomains(): readonly string[] {
	return Array.from(HARD_BANNED_DOMAINS).sort();
}
