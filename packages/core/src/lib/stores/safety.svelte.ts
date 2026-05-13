/**
 * Safety store — tracks whether writes are currently allowed.
 *
 * `readonly` is the env-var default (PUBLIC_BROADSHEET_READONLY,
 * defaults to true in dev). It's the system-wide policy.
 *
 * `writesAllowed` is the per-session opt-in via `?allow-writes=true`
 * URL flag. NOT persisted across reloads — has to be re-typed each
 * session. The whole point is that you can't accidentally leave it on.
 *
 * The actions wrapper consults both:
 *   - if !readonly → writes always go (production / explicit prod env)
 *   - else if writesAllowed → writes go this session only
 *   - else → block + audit
 *
 * Hard-banned domains (lock.*) are blocked regardless of either flag.
 *
 * Spec: ../../../docs/DEV-ENVIRONMENTS.md § "Safety rails"
 */

import { audit } from '$lib/ha/audit';

const URL_FLAG = 'allow-writes';

class SafetyStore {
	/** System-wide readonly policy from env. Static once loaded. */
	readonly = $state<boolean>(true);

	/** Per-session ephemeral unlock from URL flag. */
	writesAllowed = $state<boolean>(false);
}

export const safety = new SafetyStore();

/**
 * Initialize safety state from env + current URL.
 * Called once on app boot from +layout.svelte.
 */
export function initSafety(env: { readonly: boolean }): void {
	safety.readonly = env.readonly;

	if (typeof window !== 'undefined') {
		const flag = new URL(window.location.href).searchParams.get(URL_FLAG);
		safety.writesAllowed = flag === 'true';

		if (safety.writesAllowed && safety.readonly) {
			audit({
				kind: 'auth-event',
				note: 'WRITES ALLOWED for this session — readonly mode bypassed via URL flag'
			});
			// eslint-disable-next-line no-console
			console.warn(
				'%c⚠ broadsheet writes ALLOWED for this session %c(refresh to reset)',
				'background:#bf3a30;color:white;font-weight:bold;padding:2px 6px',
				'color:#bf3a30'
			);
		}
	}
}

/** True iff a service call should actually fire. */
export function canWrite(): boolean {
	if (!safety.readonly) return true;
	return safety.writesAllowed;
}
