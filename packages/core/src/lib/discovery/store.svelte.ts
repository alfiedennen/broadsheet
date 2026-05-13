/**
 * Layer 1 reactive store — raw HA registry data + live entity states.
 *
 * Fed by registries.ts (initial pulls + subscriptions). Consumed by
 * domain.ts (Layer 2 projection) via $derived.
 *
 * The store is a singleton — one HA connection per broadsheet install,
 * one set of registries, one source of truth.
 *
 * Spec: ../../../docs/DISCOVERY-CONTRACT.md
 */

import type {
	Floor,
	Area,
	Device,
	Entity,
	Label,
	Category,
	Person,
	State
} from '$lib/ha/types';

class DiscoveryStore {
	/** Registry snapshots — refreshed on *_registry_updated events. */
	floors = $state<Floor[]>([]);
	areas = $state<Area[]>([]);
	devices = $state<Device[]>([]);
	entities = $state<Entity[]>([]);
	labels = $state<Label[]>([]);
	categories = $state<Category[]>([]);
	persons = $state<Person[]>([]);

	/**
	 * Live entity states — keyed by entity_id, updated via subscribeEntities
	 * (compressed delta protocol from home-assistant-js-websocket).
	 *
	 * Note: we replace the whole map on update rather than mutating, because
	 * Svelte 5's $state proxy doesn't track new keys efficiently on a
	 * mutable record. The library hands us a fresh object each tick anyway.
	 */
	states = $state<Record<string, State>>({});

	/**
	 * Whether the initial discovery boot has completed (all six registries
	 * pulled at least once + first subscribe_entities snapshot received).
	 * UI uses this to know whether `floors/areas/...` represent real data
	 * or just empty post-boot defaults.
	 */
	booted = $state<boolean>(false);

	/** Last error encountered during a registry refresh (for diagnostics). */
	lastDiscoveryError = $state<string | null>(null);

	/** ISO timestamp of the last full registry refresh. */
	lastRefreshAt = $state<string | null>(null);
}

/** Module-level singleton — exported as `discoveryStore`. */
export const discoveryStore = new DiscoveryStore();
