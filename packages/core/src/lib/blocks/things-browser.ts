/**
 * 0.9.1 — things-browser data model.
 *
 * Reduces the discovery snapshot to a tree the things-first editor
 * can render: groups by area (primary view) + cross-area buckets
 * for scenes / scripts / automations / status sensors / other.
 *
 * The data shape mirrors the user's mental model:
 *
 *   ▼ Kitchen
 *       ○ Kitchen Lights        [light group]
 *       ○ Kitchen TRV           [climate]
 *       ○ Kitchen Display       [media_player]
 *
 *   ▼ Hallway
 *       ○ Hallway Spots         [light]
 *       ○ Front Door            [lock]
 *
 *   ▼ Scenes (12)
 *       ○ Movie
 *       ○ Warm Evening
 *       …
 *
 *   ▼ Scripts (8)
 *       ○ Edifier source toggle
 *       …
 *
 * Filter rule: only surface entities a user is likely to want on a
 * wall surface. Hidden things, diagnostic entities, and obviously-
 * uninteresting sensors (config_entry, system, plumbing) are dropped
 * — the user's mental model of "my kitchen things" doesn't include
 * "Sun above horizon" or "HACS update available".
 *
 * Spec: docs/plans/plan-9.1-wall-builder-things-first.md.
 */

import type { DomainArea, DomainEntity } from '$lib/discovery';

/** One controllable thing in the browser. */
export interface BrowserThing {
	entityId: string;
	name: string;
	domain: string;
	/** mdi:* hint from HA if any — used for the thing's tile icon. */
	icon?: string | null;
	/** The area's display name, for the entity's contextual label. */
	areaName?: string;
}

/** A group in the browser — e.g. "Kitchen" or "Scenes". */
export interface BrowserGroup {
	id: string;
	label: string;
	/** True for the cross-area buckets (Scenes, Scripts, etc.) so they
	 *  collapse by default in the browser. Per-area groups stay expanded. */
	defaultCollapsed: boolean;
	things: BrowserThing[];
}

/* ── Filter helpers ─────────────────────────────────────────────── */

/**
 * Domains we ALWAYS surface (per-area buckets). Reading from the
 * area-level entity arrays already excludes diagnostic / config /
 * autohidden entries, so we don't re-filter beyond domain.
 */
const PER_AREA_DOMAINS = new Set([
	'light',
	'switch',
	'climate',
	'lock',
	'cover',
	'camera',
	'image',
	'media_player'
]);

/** Domain → bucket key for the cross-area buckets. */
function crossAreaBucketFor(domain: string): string | null {
	if (domain === 'scene') return 'scenes';
	if (domain === 'script') return 'scripts';
	if (domain === 'automation') return 'automations';
	if (domain === 'binary_sensor' || domain === 'sensor') return 'status';
	if (
		domain === 'input_boolean' ||
		domain === 'input_select' ||
		domain === 'input_number' ||
		domain === 'select' ||
		domain === 'number' ||
		domain === 'person'
	) {
		return 'other';
	}
	return null;
}

/** Extract domain from entity_id. */
function domainOf(id: string): string {
	const dot = id.indexOf('.');
	return dot < 0 ? id : id.slice(0, dot);
}

/* ── Tree builder ──────────────────────────────────────────────── */

/**
 * Build the things-browser tree from discovery's areas. Per-area
 * groups come first (sorted by area name); cross-area buckets come
 * after. The cross-area buckets aggregate across every area — they
 * are "the user's scenes/scripts/automations regardless of where
 * the underlying entities live".
 */
export function buildBrowserTree(areas: DomainArea[]): BrowserGroup[] {
	const groups: BrowserGroup[] = [];

	// Cross-area accumulators — these collect from every area's
	// otherEntities + scenes + sensors buckets, deduplicated by
	// entity_id (a scene that's in multiple areas shouldn't show
	// twice).
	const crossBuckets = new Map<string, BrowserThing[]>();
	const seenCrossIds = new Set<string>();

	function pushCross(bucket: string, ent: DomainEntity, areaName?: string) {
		if (seenCrossIds.has(ent.id)) return;
		seenCrossIds.add(ent.id);
		const list = crossBuckets.get(bucket) ?? [];
		list.push({
			entityId: ent.id,
			name: ent.name,
			domain: domainOf(ent.id),
			icon: ent.icon ?? null,
			areaName
		});
		crossBuckets.set(bucket, list);
	}

	// Per-area pass. Real areas sort alphabetically; the synthetic
	// 'Unsorted' area gets pushed to the end of per-area groups (still
	// shown — its entities are still things the user owns — but
	// default-collapsed so it doesn't compete with named rooms).
	const realAreas = areas
		.filter((a) => a.id !== '__unsorted__')
		.sort((a, b) => a.name.localeCompare(b.name));
	const unsortedArea = areas.find((a) => a.id === '__unsorted__');
	const perAreaSorted = unsortedArea ? [...realAreas, unsortedArea] : realAreas;

	for (const area of perAreaSorted) {
		const things: BrowserThing[] = [];

		const pushThing = (ent: DomainEntity) => {
			const dom = domainOf(ent.id);
			if (!PER_AREA_DOMAINS.has(dom)) {
				// Not a per-area domain → push into the right cross-area
				// bucket if applicable, otherwise drop.
				const bucket = crossAreaBucketFor(dom);
				if (bucket) pushCross(bucket, ent, area.name);
				return;
			}
			things.push({
				entityId: ent.id,
				name: ent.name,
				domain: dom,
				icon: ent.icon ?? null,
				areaName: area.name
			});
		};

		// Walk every per-area bucket. The DomainArea pre-classifies
		// entities into action-shape buckets; we just flatten.
		for (const ent of area.lights) pushThing(ent);
		for (const ent of area.switches) pushThing(ent);
		for (const ent of area.climates) pushThing(ent);
		for (const ent of area.locks) pushThing(ent);
		for (const ent of area.cameras) pushThing(ent);
		for (const ent of area.media) pushThing(ent);
		for (const ent of area.tvs) pushThing(ent);
		for (const ent of area.scenes) pushThing(ent);
		// Sensors: read-only — only surface in things browser if the
		// user has them organised by area. Cross-area Status bucket
		// also surfaces them so they're not lost.
		for (const ent of area.sensors) pushThing(ent);
		// Other entities: scripts, automations, input_*, etc. live here.
		for (const ent of area.otherEntities) pushThing(ent);

		if (things.length === 0) continue;

		// Sort by domain (lights first, climate next, etc.), then name.
		const domainOrder = [
			'light',
			'switch',
			'climate',
			'lock',
			'cover',
			'media_player',
			'camera',
			'image',
			'scene'
		];
		things.sort((a, b) => {
			const ai = domainOrder.indexOf(a.domain);
			const bi = domainOrder.indexOf(b.domain);
			if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
			return a.name.localeCompare(b.name);
		});

		groups.push({
			id: `area-${area.id}`,
			label: area.name,
			defaultCollapsed: false,
			things
		});
	}

	// Cross-area buckets — only emit when non-empty.
	const bucketOrder = [
		['scenes', 'Scenes'],
		['scripts', 'Scripts'],
		['automations', 'Automations'],
		['status', 'Status sensors'],
		['other', 'Other']
	] as const;

	for (const [key, label] of bucketOrder) {
		const list = crossBuckets.get(key);
		if (!list || list.length === 0) continue;
		list.sort((a, b) => a.name.localeCompare(b.name));
		groups.push({
			id: `bucket-${key}`,
			label,
			// Scenes default-expanded (frequently used); rest collapsed.
			defaultCollapsed: key !== 'scenes',
			things: list
		});
	}

	return groups;
}

/**
 * Filter a tree by query — case-insensitive, matches entity name OR
 * entity_id OR area name. Returns a tree with each group's `things`
 * reduced to matches; empty groups are dropped.
 */
export function filterBrowserTree(tree: BrowserGroup[], query: string): BrowserGroup[] {
	const q = query.trim().toLowerCase();
	if (!q) return tree;
	const out: BrowserGroup[] = [];
	for (const group of tree) {
		const things = group.things.filter((t) => {
			if (t.name.toLowerCase().includes(q)) return true;
			if (t.entityId.toLowerCase().includes(q)) return true;
			if (t.areaName?.toLowerCase().includes(q)) return true;
			return false;
		});
		if (things.length === 0) continue;
		out.push({ ...group, things, defaultCollapsed: false });
	}
	return out;
}
