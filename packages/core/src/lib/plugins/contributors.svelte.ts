/**
 * contributors.svelte.ts — the discoveryContributor runner.
 *
 * A discoveryContributor lets a plugin augment the domain model with
 * data the core doesn't read (ghost-cloud reads radar JSON; emanations
 * reads its painting-set manifest). Its return value is merged into
 * `discovery.plugins[<plugin-id>]`.
 *
 * This runner: at boot and on every registry/active-plugin change,
 * runs each active plugin's contributors inside the sandbox, merges
 * outputs into `pluginContributions`, and records failures in
 * `contributorErrors` (which flips the plugin's status to `errored`).
 *
 * Sandbox (per RENDERER-CONTRACT.md):
 *  - `ctx.fetch` is same-origin only — cross-origin URLs reject.
 *  - the discovery snapshot is read-only.
 *  - no WebSocket access, no curation writes.
 */

import { base } from '$app/paths';
import { discovery } from '$lib/discovery';
import { audit } from '$lib/ha/audit';
import { pluginLoader } from './loader.svelte';
import { pluginContributions, contributorErrors } from './contributorStore.svelte';
import type { PluginDiscoverySnapshot } from './types';

/** Debounce window for re-running contributors after a reactive change. */
const RERUN_DEBOUNCE_MS = 400;

let _debounce: ReturnType<typeof setTimeout> | null = null;
let _rootCleanup: (() => void) | null = null;
/** Monotonic run id — a stale async run discards its writes. */
let _runSeq = 0;

/**
 * The sandboxed fetch handed to contributors. Same-origin only:
 * absolute URLs to a different origin reject. Relative root paths are
 * `base`-prefixed so they ride the add-on's ingress proxy (e.g.
 * `/local/…` reaches HA Core, `/plugin-assets/…` reaches the image).
 */
function sandboxedFetch(path: string, init?: RequestInit): Promise<Response> {
	if (/^https?:\/\//i.test(path)) {
		let origin: string;
		try {
			origin = new URL(path).origin;
		} catch {
			return Promise.reject(new Error('discoveryContributor fetch: invalid URL'));
		}
		if (typeof window !== 'undefined' && origin !== window.location.origin) {
			return Promise.reject(
				new Error('discoveryContributor fetch: cross-origin blocked by sandbox')
			);
		}
		return fetch(path, init);
	}
	const url = path.startsWith('/') ? `${base}${path}` : path;
	return fetch(url, init);
}

/**
 * Run every active plugin's discoveryContributors once. Stale runs
 * (superseded by a newer trigger) discard their writes via `_runSeq`.
 */
async function runContributors(): Promise<void> {
	const seq = ++_runSeq;

	const snapshot: PluginDiscoverySnapshot = {
		floors: discovery.floors,
		areas: discovery.areas,
		persons: discovery.persons
	};

	for (const { plugin, status } of pluginLoader.registry) {
		// load-error / disabled plugins don't run contributors. (An
		// already-`errored` plugin still re-runs — it may recover.)
		if (status === 'load-error' || status === 'disabled') {
			delete contributorErrors[plugin.id];
			continue;
		}
		const contributors = plugin.discoveryContributors ?? [];
		if (contributors.length === 0) continue;

		const merged: Record<string, unknown> = {};
		let failure: string | null = null;

		for (const contributor of contributors) {
			try {
				const out = await contributor.contribute({
					discovery: snapshot,
					fetch: sandboxedFetch
				});
				if (out && typeof out === 'object') Object.assign(merged, out);
			} catch (err) {
				failure = `contributor "${contributor.id}": ${err instanceof Error ? err.message : String(err)}`;
				audit({
					kind: 'auth-event',
					note: `plugin "${plugin.id}" discoveryContributor failed`,
					error: failure
				});
			}
		}

		// A newer run started while we awaited — drop our writes.
		if (seq !== _runSeq) return;

		pluginContributions[plugin.id] = merged;
		if (failure) {
			contributorErrors[plugin.id] = failure;
		} else {
			delete contributorErrors[plugin.id];
		}
	}
}

/**
 * Boot the contributor runner. Idempotent. Sets up an `$effect.root`
 * that re-runs contributors (debounced) whenever discovery registries
 * or the active-plugin set change — covering both "at boot" and "on
 * registry updates" from the contract with one mechanism.
 */
export function bootContributors(): void {
	if (_rootCleanup) return;
	_rootCleanup = $effect.root(() => {
		$effect(() => {
			// Reactive deps — read so the effect re-runs on change.
			void discovery.areas;
			void discovery.persons;
			void discovery.floors;
			void pluginLoader.registry;
			if (_debounce) clearTimeout(_debounce);
			_debounce = setTimeout(() => {
				void runContributors();
			}, RERUN_DEBOUNCE_MS);
		});
	});
}
