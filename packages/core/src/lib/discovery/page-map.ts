/**
 * Page-slug → discovery filter table.
 *
 * Each broadsheet page asks discovery for "the areas + entities I
 * should render." This table is the source of truth for that mapping.
 *
 * Plugins (M3+) can extend this table by registering additional pages
 * via the plugin API (RENDERER-CONTRACT.md).
 */

import type { DomainArea, DomainEntity } from './domain';
import { isHealthConnect } from './heuristics';

export type PageSlug = 'lights' | 'heat' | 'door' | 'tv' | 'body' | 'wall';

export interface PageBucket {
	slug: PageSlug;
	label: string;
	icon: string;
	/** Areas that should appear on this page (have at least one relevant entity). */
	areasFilter: (area: DomainArea) => boolean;
	/** From an area, which entity buckets are relevant on this page. */
	entitiesFromArea: (area: DomainArea) => DomainEntity[];
	/** Optional: cross-area entity selection (e.g. health sensors are not area-bound). */
	crossAreaEntities?: (allAreas: DomainArea[]) => DomainEntity[];
}

export const PAGES: Record<PageSlug, PageBucket> = {
	lights: {
		slug: 'lights',
		label: 'Lights',
		icon: 'mdi:lightbulb-outline',
		areasFilter: (a) => a.hasLighting,
		entitiesFromArea: (a) => [...a.lights, ...a.scenes]
	},

	heat: {
		slug: 'heat',
		label: 'Heat',
		icon: 'mdi:radiator',
		areasFilter: (a) => a.hasClimate,
		entitiesFromArea: (a) => a.climates
	},

	door: {
		slug: 'door',
		label: 'Door',
		icon: 'mdi:door-closed-lock',
		areasFilter: (a) => a.hasLock,
		entitiesFromArea: (a) => [...a.locks, ...a.contacts, ...a.cameras]
	},

	tv: {
		slug: 'tv',
		label: 'TV',
		icon: 'mdi:television',
		areasFilter: (a) => a.tvs.length > 0 || a.remotes.length > 0,
		entitiesFromArea: (a) => [...a.tvs, ...a.remotes, ...a.media]
	},

	body: {
		slug: 'body',
		label: 'Body',
		icon: 'mdi:heart-pulse',
		areasFilter: () => false, // body is cross-area only
		entitiesFromArea: () => [],
		crossAreaEntities: (allAreas) => {
			// Pull every entity that matches the Health-Connect pattern,
			// regardless of which area it landed in
			const out: DomainEntity[] = [];
			for (const a of allAreas) {
				for (const e of a.sensors) {
					// Recover the raw entity_id pattern check via the DomainEntity.id
					if (isHealthConnect({ entity_id: e.id } as never)) out.push(e);
				}
				for (const e of a.otherEntities) {
					if (isHealthConnect({ entity_id: e.id } as never)) out.push(e);
				}
			}
			return out;
		}
	},

	wall: {
		slug: 'wall',
		label: 'Wall',
		icon: 'mdi:tablet',
		// Wall is the cross-cutting dense action grid — every area with
		// anything actionable shows up
		areasFilter: (a) => a.hasLighting || a.hasClimate || a.hasLock,
		entitiesFromArea: (a) => [
			...a.lights,
			...a.switches,
			...a.climates,
			...a.locks,
			...a.scenes
		]
	}
};

/** Ordered list of page slugs for the kebab nav (M3 ships this). */
export const NAV_ORDER: PageSlug[] = ['lights', 'heat', 'door', 'tv', 'body'];

/**
 * Helper: which entities don't fit any page bucket? Used by /settings/house
 * (M4) to surface entities that broadsheet doesn't render anywhere.
 *
 * Implementation: all `otherEntities` from all areas, minus those picked
 * up by `crossAreaEntities` filters (Health-Connect, etc).
 */
export function unbucketed(allAreas: DomainArea[]): DomainEntity[] {
	const usedIds = new Set<string>();
	for (const page of Object.values(PAGES)) {
		if (page.crossAreaEntities) {
			for (const e of page.crossAreaEntities(allAreas)) usedIds.add(e.id);
		}
	}
	const out: DomainEntity[] = [];
	for (const a of allAreas) {
		for (const e of a.otherEntities) {
			if (!usedIds.has(e.id)) out.push(e);
		}
	}
	return out;
}
