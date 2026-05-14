/**
 * Public API of the discovery layer.
 *
 * Layer 2 + Layer 3 surface — pages and components ONLY import from
 * this module. The internal `store.svelte.ts`, `registries.ts`,
 * `domain.ts`, `heuristics.ts` modules are implementation detail.
 *
 * Spec: ../../../docs/DISCOVERY-CONTRACT.md
 */

import { discoveryStore } from './store.svelte';
import { projectDomain, type DomainArea, type DomainEntity, type DomainFloor, type DomainPerson } from './domain';
import { PAGES, NAV_ORDER, unbucketed, type PageSlug } from './page-map';
import { curationStore } from '$lib/curation/store.svelte';
import { pluginContributions } from '$lib/plugins/contributorStore.svelte';

export type { DomainArea, DomainEntity, DomainFloor, DomainPerson, PageSlug };
export { bootDiscovery, teardownDiscovery } from './registries';
export { PAGES, NAV_ORDER };

/**
 * Reactive façade over Layer 2. Pages read from `discovery.areas` etc;
 * Svelte 5's runes recompute when underlying $state changes (registry
 * updates, state deltas).
 *
 * NOTE: this object is constructed lazily because $derived can only
 * be called inside a component or $effect.root. Pages access via the
 * exported `useDiscovery()` hook OR the singleton `discovery` proxy.
 *
 * For M2 the simpler pattern: a class with $derived getters. Svelte 5
 * supports this — see https://svelte.dev/docs/svelte/$derived
 */
class DiscoveryAPI {
	/* ───────── derived domain projection ───────── */

	#projection = $derived.by(() => {
		// Read tick to establish reactive dep on curation mutations.
		// Curation object is replaced on every save; tick ensures we
		// recompute even if Svelte's deep-equality short-circuits.
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		return projectDomain({
			floors: discoveryStore.floors,
			areas: discoveryStore.areas,
			devices: discoveryStore.devices,
			entities: discoveryStore.entities,
			labels: discoveryStore.labels,
			persons: discoveryStore.persons,
			states: discoveryStore.states,
			curation: curationStore.loaded ? curationStore.current : undefined
		});
	});

	floors = $derived(this.#projection.floors);
	areas = $derived(this.#projection.areas);
	persons = $derived(this.#projection.persons);

	/** True iff initial discovery boot has completed. */
	booted = $derived(discoveryStore.booted);

	/** Last error encountered during a registry refresh. */
	lastError = $derived(discoveryStore.lastDiscoveryError);

	/** ISO timestamp of last refresh. */
	lastRefreshAt = $derived(discoveryStore.lastRefreshAt);

	/* ───────── raw counts (for diagnostics) ───────── */

	rawCounts = $derived({
		floors: discoveryStore.floors.length,
		areas: discoveryStore.areas.length,
		devices: discoveryStore.devices.length,
		entities: discoveryStore.entities.length,
		labels: discoveryStore.labels.length,
		categories: discoveryStore.categories.length,
		persons: discoveryStore.persons.length,
		states: Object.keys(discoveryStore.states).length
	});

	/* ───────── helpers ───────── */

	/** Find a domain area by id (including __unsorted__). Returns null if not found. */
	byAreaId(id: string): DomainArea | null {
		return this.areas.find((a) => a.id === id) ?? null;
	}

	/** Find a domain entity by entity_id across all areas. */
	byEntityId(id: string): DomainEntity | null {
		for (const a of this.areas) {
			for (const bucket of [
				a.lights,
				a.switches,
				a.climates,
				a.locks,
				a.contacts,
				a.cameras,
				a.media,
				a.tvs,
				a.remotes,
				a.sensors,
				a.scenes,
				a.otherEntities
			]) {
				const found = bucket.find((e) => e.id === id);
				if (found) return found;
			}
		}
		return null;
	}

	/** All areas relevant to a given page (per page-map.ts). */
	areasForPage(slug: PageSlug): DomainArea[] {
		return this.areas.filter((a) => a.id !== '__unsorted__' && PAGES[slug].areasFilter(a));
	}

	/** Cross-area entities for a page (e.g. Health-Connect on /body). */
	crossAreaEntitiesForPage(slug: PageSlug): DomainEntity[] {
		const fn = PAGES[slug].crossAreaEntities;
		return fn ? fn(this.areas) : [];
	}

	/** The synthetic Unsorted area (entities with no resolvable area_id). */
	get unsorted(): DomainArea | null {
		return this.areas.find((a) => a.id === '__unsorted__') ?? null;
	}

	/** Entities not picked up by any page (for /settings/house surface in M4). */
	unbucketed(): DomainEntity[] {
		return unbucketed(this.areas);
	}

	/**
	 * Plugin discovery contributions, keyed by plugin id. A plugin's
	 * discoveryContributors run at boot + on registry updates; their
	 * merged output lands here. A plugin reads its own slice via
	 * `discovery.plugins[<id>]?.<key>`. Empty until contributors run
	 * (or `{}` for plugins with no contributors).
	 */
	get plugins(): Record<string, Record<string, unknown>> {
		return pluginContributions;
	}
}

/**
 * Singleton discovery proxy. Components import this directly:
 *
 *   import { discovery } from '$lib/discovery';
 *
 *   const lightingAreas = $derived(discovery.areasForPage('lights'));
 */
export const discovery = new DiscoveryAPI();
