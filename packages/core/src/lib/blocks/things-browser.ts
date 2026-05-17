/**
 * 0.9.2 — things-browser data model: accomplishments, not atoms.
 *
 * The 0.9.1 browser showed entities grouped by area. Dogfood revealed
 * the same mistake as 0.9.0 → 0.9.1, one layer in: the user thinks in
 * verbs ("turn on the TV", "toggle all the lights in here", "boost
 * heating to 21°"), but the browser was showing nouns (one row per
 * entity).
 *
 * 0.9.2 reframes the browser around `AccomplishmentRecipe` — a named
 * verb the user can drop on a wall surface. Each recipe produces ≥1
 * blocks. Some recipes are atomic (one entity → one thing block);
 * others are composed (a panel of lights, a one-tap macro across
 * multiple TRVs).
 *
 * Structure:
 *
 *   ▼ Living Room
 *      ┌─ Lights ─────────────────────────────
 *      │  ▸ Living Room lights — panel       ← outline + 3 things
 *      │  ▸ Living Room lights — off         ← macro: 3 turn_off steps
 *      │  ▸ Living Room lights — toggle      ← macro: 3 toggle steps
 *      │  · Living Room Pendant              ← atomic
 *      │  · Library Floor Lamp
 *      ├─ TV ─────────────────────────────────
 *      │  ▸ Living Room TV — full remote     ← thing widget=media-tv
 *      │  ▸ Living Room TV — power toggle    ← thing widget=toggle
 *      │  ▸ Living Room TV — turn on         ← macro: 1 step
 *      │  ▸ Living Room TV — turn off        ← macro: 1 step
 *      ├─ Climate ────────────────────────────
 *      │  ▸ Living Room heating — boost to 21°
 *      …
 *
 *   ▼ Scenes (cross-area)
 *      · Activate Cinema
 *      · Activate Warm Evening
 *      …
 *
 * Spec: docs/plans/plan-9.2-browser-accomplishments.md.
 */

import type { DomainArea, DomainEntity } from '$lib/discovery';
import { isRealMediaSource } from '$lib/discovery/heuristics';
import type { BlockDef, MacroStep } from '$lib/blocks/types';
import type {
	PluginBlockContribution,
	PluginRecipePlacement,
	PluginRecipeSuggestion,
	PluginDiscoverySnapshot
} from '$lib/plugins/types';

/**
 * 0.9.3.1: filter HA's media_player bucket down to REAL media
 * sources — tablets / kiosks / phones / Cast-Web surfaces are
 * media_players by HA's protocol but aren't things the user wants
 * on a media panel. Used by tvSubGroup + mediaSubGroup. Same
 * heuristic /tv uses + area-media-panel renderer uses, so the three
 * surfaces stay aligned.
 */
function realMedia(area: DomainArea): DomainEntity[] {
	return area.media.filter(isRealMediaSource);
}
function realTvs(area: DomainArea): DomainEntity[] {
	return area.tvs.filter(isRealMediaSource);
}

/* ── Types ──────────────────────────────────────────────────────── */

/** One row in the browser: a verb the user can drop on a wall. */
export interface AccomplishmentRecipe {
	/** Stable id used for placed-tracking + recipe lookup on drop. */
	id: string;
	/** Verb phrase: "All Living Room lights — off". */
	title: string;
	/** Optional helper subtitle: "1-tap macro: turn off 3 lights". */
	description?: string;
	/** mdi:* hint for the row icon. */
	icon?: string;
	/**
	 * The blocks to insert when the recipe is added to the canvas.
	 * 1 block for atomic recipes; N for compositions (a panel + per-
	 * light tiles, or a header + macro tile, etc.).
	 */
	blocks: BlockDef[];
	/**
	 * entity_ids this recipe references. Drives the "✓ placed" badge:
	 * a recipe is "placed" when every referenced entity already has a
	 * `thing` block on the canvas.
	 */
	referencedEntityIds: string[];
}

/** A grouped set of recipes within a top-level group. */
export interface BrowserSubGroup {
	id: string;
	label: string;
	recipes: AccomplishmentRecipe[];
}

/** Top-level group: an area, or one of the cross-area buckets. */
export interface BrowserGroup {
	id: string;
	label: string;
	/** Per-area groups expand by default; cross-area buckets collapse. */
	defaultCollapsed: boolean;
	subGroups: BrowserSubGroup[];
}

/* ── Recipe generators — per-area ───────────────────────────────── */

function lightSubGroup(area: DomainArea): BrowserSubGroup | null {
	if (area.lights.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	const ids = area.lights.map((l) => l.id);

	if (area.lights.length >= 2) {
		// Composed: panel — 0.9.3 emits ONE composite block that reads
		// `discovery.byAreaId(areaId)` at render time. Grows + shrinks
		// when lights are added or removed from the area in HA. (0.9.2
		// emitted outline + N thing blocks; that flat-atom form is
		// still placeable via the atomic recipes below.)
		recipes.push({
			id: `${area.id}/lights/panel`,
			title: `${area.name} lights — panel`,
			description: `One block, one toggle per light (${area.lights.length} lights, grows automatically)`,
			icon: 'mdi:lightbulb-group',
			blocks: [
				{ type: 'area-lights-panel', config: { areaId: area.id } }
			],
			referencedEntityIds: ids
		});
		// Composed: one-tap "off" macro.
		recipes.push({
			id: `${area.id}/lights/off`,
			title: `${area.name} lights — off`,
			description: `1-tap macro: turn off ${area.lights.length} lights`,
			icon: 'mdi:lightbulb-off',
			blocks: [
				{
					type: 'macro',
					config: {
						label: `${area.name} lights off`,
						icon: 'mdi:lightbulb-off',
						steps: area.lights.map(
							(l): MacroStep => ({
								description: `Turn off ${l.name}`,
								service: {
									domain: 'light',
									service: 'turn_off',
									target: { entity_id: l.id }
								}
							})
						)
					}
				}
			],
			referencedEntityIds: ids
		});
		// Composed: one-tap toggle macro.
		recipes.push({
			id: `${area.id}/lights/toggle`,
			title: `${area.name} lights — toggle`,
			description: `1-tap macro: toggle ${area.lights.length} lights`,
			icon: 'mdi:lightbulb-on-outline',
			blocks: [
				{
					type: 'macro',
					config: {
						label: `${area.name} lights`,
						icon: 'mdi:lightbulb-on-outline',
						steps: area.lights.map(
							(l): MacroStep => ({
								description: `Toggle ${l.name}`,
								service: {
									domain: 'light',
									service: 'toggle',
									target: { entity_id: l.id }
								}
							})
						)
					}
				}
			],
			referencedEntityIds: ids
		});
	}

	// Atomic — always emit, regardless of count. Even a 1-light area
	// needs the individual entry; ≥ 2-light areas get atoms below the
	// composed verbs so a user can still grab a single bulb.
	for (const light of area.lights) {
		recipes.push({
			id: `${area.id}/lights/atom/${light.id}`,
			title: light.name,
			description: 'Single tile — broadsheet picks the widget',
			icon: light.icon ?? 'mdi:lightbulb',
			blocks: [{ type: 'thing', config: { entityId: light.id, widget: 'auto' } }],
			referencedEntityIds: [light.id]
		});
	}

	return { id: `${area.id}/lights`, label: 'Lights', recipes };
}

function tvSubGroup(area: DomainArea): BrowserSubGroup | null {
	// 0.9.3.1: filter out kiosks/tablets up front — they shouldn't
	// appear as TVs OR speakers OR drive the media-panel recipe count.
	const tvs = realTvs(area);
	const speakers = realMedia(area);
	if (tvs.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];

	// Composed media panel (TV + speakers together) — only when the
	// area has > 1 REAL media device OR mixed TVs + speakers. A
	// single-TV area gets the more detailed per-TV recipes below
	// without the extra panel-tile clutter.
	const totalMedia = tvs.length + speakers.length;
	const isMixed = tvs.length > 0 && speakers.length > 0;
	if (totalMedia >= 2 || isMixed) {
		const allMediaIds = [...tvs.map((t) => t.id), ...speakers.map((m) => m.id)];
		recipes.push({
			id: `${area.id}/tvs/panel`,
			title: `${area.name} media — panel`,
			description: `One block, TV remote${tvs.length === 1 ? '' : 's'} + speaker${speakers.length === 1 ? '' : 's'} together`,
			icon: 'mdi:multimedia',
			blocks: [{ type: 'area-media-panel', config: { areaId: area.id } }],
			referencedEntityIds: allMediaIds
		});
	}

	for (const tv of tvs) {
		recipes.push(
			{
				id: `${area.id}/tvs/${tv.id}/remote`,
				title: `${tv.name} — full remote`,
				description: 'Full media-player widget: power, source, transport',
				icon: tv.icon ?? 'mdi:remote-tv',
				blocks: [{ type: 'thing', config: { entityId: tv.id, widget: 'media-tv' } }],
				referencedEntityIds: [tv.id]
			},
			{
				id: `${area.id}/tvs/${tv.id}/toggle`,
				title: `${tv.name} — power toggle`,
				description: 'Single tile, tap to flip on/off',
				icon: 'mdi:television',
				blocks: [{ type: 'thing', config: { entityId: tv.id, widget: 'toggle' } }],
				referencedEntityIds: [tv.id]
			},
			{
				id: `${area.id}/tvs/${tv.id}/on`,
				title: `${tv.name} — turn on`,
				description: '1-tap macro: power on only',
				icon: 'mdi:television',
				blocks: [
					{
						type: 'macro',
						config: {
							label: `${tv.name} on`,
							icon: 'mdi:television',
							steps: [
								{
									description: `Turn on ${tv.name}`,
									service: {
										domain: 'media_player',
										service: 'turn_on',
										target: { entity_id: tv.id }
									}
								}
							]
						}
					}
				],
				referencedEntityIds: [tv.id]
			},
			{
				id: `${area.id}/tvs/${tv.id}/off`,
				title: `${tv.name} — turn off`,
				description: '1-tap macro: power off only',
				icon: 'mdi:television-off',
				blocks: [
					{
						type: 'macro',
						config: {
							label: `${tv.name} off`,
							icon: 'mdi:television-off',
							steps: [
								{
									description: `Turn off ${tv.name}`,
									service: {
										domain: 'media_player',
										service: 'turn_off',
										target: { entity_id: tv.id }
									}
								}
							]
						}
					}
				],
				referencedEntityIds: [tv.id]
			}
		);
	}
	return { id: `${area.id}/tvs`, label: 'TV', recipes };
}

function mediaSubGroup(area: DomainArea): BrowserSubGroup | null {
	// 0.9.3.1: drop kiosk/tablet entries — HA classes them as
	// media_player but they're surfaces, not sources.
	const speakers = realMedia(area);
	if (speakers.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	for (const sp of speakers) {
		recipes.push(
			{
				id: `${area.id}/media/${sp.id}/full`,
				title: `${sp.name} — full control`,
				description: 'Play / pause, source, transport',
				icon: sp.icon ?? 'mdi:speaker',
				blocks: [{ type: 'thing', config: { entityId: sp.id, widget: 'media-speaker' } }],
				referencedEntityIds: [sp.id]
			},
			{
				id: `${area.id}/media/${sp.id}/play_pause`,
				title: `${sp.name} — play / pause`,
				description: '1-tap macro: toggle playback',
				icon: 'mdi:play-pause',
				blocks: [
					{
						type: 'macro',
						config: {
							label: `${sp.name} play/pause`,
							icon: 'mdi:play-pause',
							steps: [
								{
									description: `Play/pause ${sp.name}`,
									service: {
										domain: 'media_player',
										service: 'media_play_pause',
										target: { entity_id: sp.id }
									}
								}
							]
						}
					}
				],
				referencedEntityIds: [sp.id]
			},
			{
				id: `${area.id}/media/${sp.id}/on`,
				title: `${sp.name} — turn on`,
				icon: 'mdi:speaker',
				blocks: [
					{
						type: 'macro',
						config: {
							label: `${sp.name} on`,
							icon: 'mdi:speaker',
							steps: [
								{
									description: `Turn on ${sp.name}`,
									service: {
										domain: 'media_player',
										service: 'turn_on',
										target: { entity_id: sp.id }
									}
								}
							]
						}
					}
				],
				referencedEntityIds: [sp.id]
			},
			{
				id: `${area.id}/media/${sp.id}/off`,
				title: `${sp.name} — turn off`,
				icon: 'mdi:speaker-off',
				blocks: [
					{
						type: 'macro',
						config: {
							label: `${sp.name} off`,
							icon: 'mdi:speaker-off',
							steps: [
								{
									description: `Turn off ${sp.name}`,
									service: {
										domain: 'media_player',
										service: 'turn_off',
										target: { entity_id: sp.id }
									}
								}
							]
						}
					}
				],
				referencedEntityIds: [sp.id]
			}
		);
	}
	return { id: `${area.id}/media`, label: 'Speakers', recipes };
}

function climateSubGroup(area: DomainArea): BrowserSubGroup | null {
	if (area.climates.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	const ids = area.climates.map((c) => c.id);

	if (area.climates.length >= 2) {
		// Composed: panel — one block, one climate tile per TRV. Grows
		// + shrinks with discovery.
		recipes.push({
			id: `${area.id}/climate/panel`,
			title: `${area.name} heating — panel`,
			description: `One block, one tile per TRV (${area.climates.length} TRVs, grows automatically)`,
			icon: 'mdi:radiator-fan',
			blocks: [{ type: 'area-climate-panel', config: { areaId: area.id } }],
			referencedEntityIds: ids
		});
		// Composed: boost-to-21 (matches the existing `boost-row` block's
		// canonical default; same one-tap heat-up macro the user runs all
		// winter).
		recipes.push({
			id: `${area.id}/climate/boost21`,
			title: `${area.name} heating — boost to 21°`,
			description: `1-tap macro: set ${area.climates.length} TRVs to 21°`,
			icon: 'mdi:radiator',
			blocks: [
				{
					type: 'macro',
					config: {
						label: `${area.name} boost 21°`,
						icon: 'mdi:radiator',
						steps: area.climates.map(
							(c): MacroStep => ({
								description: `Set ${c.name} to 21°`,
								service: {
									domain: 'climate',
									service: 'set_temperature',
									target: { entity_id: c.id },
									data: { temperature: 21 }
								}
							})
						)
					}
				}
			],
			referencedEntityIds: ids
		});
		// Composed: setback to 5° (frost safe, "all off").
		recipes.push({
			id: `${area.id}/climate/off`,
			title: `${area.name} heating — off (5°)`,
			description: `1-tap macro: frost-safe setback for ${area.climates.length} TRVs`,
			icon: 'mdi:radiator-off',
			blocks: [
				{
					type: 'macro',
					config: {
						label: `${area.name} heat off`,
						icon: 'mdi:radiator-off',
						steps: area.climates.map(
							(c): MacroStep => ({
								description: `Setback ${c.name} to 5°`,
								service: {
									domain: 'climate',
									service: 'set_temperature',
									target: { entity_id: c.id },
									data: { temperature: 5 }
								}
							})
						)
					}
				}
			],
			referencedEntityIds: ids
		});
	}

	// Atomic — per TRV (climate widget shows current + setpoint).
	for (const trv of area.climates) {
		recipes.push({
			id: `${area.id}/climate/atom/${trv.id}`,
			title: trv.name,
			description: 'Climate tile — current temp + setpoint + tap-expand slider',
			icon: trv.icon ?? 'mdi:radiator',
			blocks: [{ type: 'thing', config: { entityId: trv.id, widget: 'auto' } }],
			referencedEntityIds: [trv.id]
		});
	}

	return { id: `${area.id}/climate`, label: 'Heating', recipes };
}

function switchSubGroup(area: DomainArea): BrowserSubGroup | null {
	if (area.switches.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	for (const sw of area.switches) {
		recipes.push({
			id: `${area.id}/switches/atom/${sw.id}`,
			title: sw.name,
			description: 'On / off tile',
			icon: sw.icon ?? 'mdi:toggle-switch',
			blocks: [{ type: 'thing', config: { entityId: sw.id, widget: 'auto' } }],
			referencedEntityIds: [sw.id]
		});
	}
	return { id: `${area.id}/switches`, label: 'Switches', recipes };
}

function lockSubGroup(area: DomainArea): BrowserSubGroup | null {
	if (area.locks.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	for (const lock of area.locks) {
		recipes.push(
			{
				id: `${area.id}/locks/${lock.id}/unlock`,
				title: `${lock.name} — unlock`,
				description: '1-tap macro: unlock the lock',
				icon: 'mdi:lock-open-variant',
				blocks: [
					{
						type: 'macro',
						config: {
							label: `${lock.name} unlock`,
							icon: 'mdi:lock-open-variant',
							steps: [
								{
									description: `Unlock ${lock.name}`,
									service: {
										domain: 'lock',
										service: 'unlock',
										target: { entity_id: lock.id }
									}
								}
							]
						}
					}
				],
				referencedEntityIds: [lock.id]
			},
			{
				id: `${area.id}/locks/${lock.id}/tile`,
				title: `${lock.name} — status tile`,
				description: 'Show locked / unlocked state with tap-to-unlock',
				icon: lock.icon ?? 'mdi:lock',
				blocks: [{ type: 'thing', config: { entityId: lock.id, widget: 'lock' } }],
				referencedEntityIds: [lock.id]
			}
		);
	}
	return { id: `${area.id}/locks`, label: 'Locks', recipes };
}

function cameraSubGroup(area: DomainArea): BrowserSubGroup | null {
	if (area.cameras.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	for (const cam of area.cameras) {
		recipes.push({
			id: `${area.id}/cameras/atom/${cam.id}`,
			title: `${cam.name} — snapshot tile`,
			description: 'Latest snapshot, tap to expand',
			icon: cam.icon ?? 'mdi:cctv',
			blocks: [{ type: 'thing', config: { entityId: cam.id, widget: 'camera' } }],
			referencedEntityIds: [cam.id]
		});
	}
	return { id: `${area.id}/cameras`, label: 'Cameras', recipes };
}

function sensorSubGroup(area: DomainArea): BrowserSubGroup | null {
	if (area.sensors.length === 0) return null;
	const recipes: AccomplishmentRecipe[] = [];
	for (const s of area.sensors) {
		recipes.push({
			id: `${area.id}/sensors/atom/${s.id}`,
			title: `Show ${s.name}`,
			description: 'Read-only value pill',
			icon: s.icon ?? 'mdi:thermometer',
			blocks: [{ type: 'thing', config: { entityId: s.id, widget: 'auto' } }],
			referencedEntityIds: [s.id]
		});
	}
	return { id: `${area.id}/sensors`, label: 'Sensors', recipes };
}

/* ── Cross-area recipe generators ──────────────────────────────── */

type CrossAreaBucket = 'scenes' | 'scripts' | 'automations' | 'status' | 'other';

interface CrossAreaAccumulator {
	scenes: AccomplishmentRecipe[];
	scripts: AccomplishmentRecipe[];
	automations: AccomplishmentRecipe[];
	status: AccomplishmentRecipe[];
	other: AccomplishmentRecipe[];
	/** entity_ids already added so duplicates across areas don't double-list. */
	seen: Set<string>;
}

function crossAreaBucketFor(domain: string): CrossAreaBucket | null {
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

function domainOf(id: string): string {
	const dot = id.indexOf('.');
	return dot < 0 ? id : id.slice(0, dot);
}

function recipeForCrossAreaEntity(ent: DomainEntity): AccomplishmentRecipe {
	const domain = domainOf(ent.id);
	if (domain === 'scene') {
		return {
			id: `cross/scenes/${ent.id}`,
			title: `Activate ${ent.name}`,
			description: 'Tap to activate the scene',
			icon: ent.icon ?? 'mdi:palette',
			blocks: [{ type: 'thing', config: { entityId: ent.id, widget: 'auto' } }],
			referencedEntityIds: [ent.id]
		};
	}
	if (domain === 'script') {
		return {
			id: `cross/scripts/${ent.id}`,
			title: `Run ${ent.name}`,
			description: 'Tap to run the script',
			icon: ent.icon ?? 'mdi:script-text',
			blocks: [{ type: 'thing', config: { entityId: ent.id, widget: 'auto' } }],
			referencedEntityIds: [ent.id]
		};
	}
	if (domain === 'automation') {
		return {
			id: `cross/automations/${ent.id}`,
			title: `Trigger ${ent.name}`,
			description: 'Tap to trigger the automation',
			icon: ent.icon ?? 'mdi:robot',
			blocks: [{ type: 'thing', config: { entityId: ent.id, widget: 'auto' } }],
			referencedEntityIds: [ent.id]
		};
	}
	if (domain === 'sensor' || domain === 'binary_sensor') {
		return {
			id: `cross/status/${ent.id}`,
			title: `Show ${ent.name}`,
			description: 'Read-only state / value',
			icon: ent.icon ?? (domain === 'sensor' ? 'mdi:gauge' : 'mdi:checkbox-marked-circle-outline'),
			blocks: [{ type: 'thing', config: { entityId: ent.id, widget: 'auto' } }],
			referencedEntityIds: [ent.id]
		};
	}
	// Default (input_*, select, number, person) — pick widget will give
	// the dropdown/picker shape.
	return {
		id: `cross/other/${ent.id}`,
		title: `Pick ${ent.name}`,
		description: 'Tap to cycle / pick an option',
		icon: ent.icon ?? 'mdi:menu-down',
		blocks: [{ type: 'thing', config: { entityId: ent.id, widget: 'auto' } }],
		referencedEntityIds: [ent.id]
	};
}

/* ── Tree builder ──────────────────────────────────────────────── */

/**
 * Per-area sub-group order. Lights first (most-used), then media
 * (TV, then non-TV speakers), then climate, then doors/access, then
 * read-only sensors. Switches and cameras slot in their natural place.
 */
const PER_AREA_SUBGROUP_BUILDERS: Array<
	(area: DomainArea) => BrowserSubGroup | null
> = [
	lightSubGroup,
	tvSubGroup,
	mediaSubGroup,
	climateSubGroup,
	switchSubGroup,
	lockSubGroup,
	cameraSubGroup,
	sensorSubGroup
];

/**
 * 0.9.3: lift a `PluginRecipeSuggestion` (decoupled, plugin-side
 * shape) into a full `AccomplishmentRecipe` ready to slot into the
 * browser tree. The lifted recipe carries ONE block of the plugin's
 * contributed type, configured with the suggestion's `config`.
 */
function liftPluginSuggestion(
	contribution: PluginBlockContribution,
	suggestion: PluginRecipeSuggestion
): AccomplishmentRecipe {
	return {
		id: suggestion.id,
		title: suggestion.title,
		description: suggestion.description,
		icon: suggestion.icon,
		blocks: [
			// The block carries the plugin-contributed type id. Block
			// registry looks this up via pluginLoader.activePluginBlocks
			// at render time; an unknown type (plugin disabled after the
			// page was saved) renders a "missing renderer" placeholder
			// instead of crashing.
			{
				type: contribution.type,
				config: suggestion.config
			} as BlockDef
		],
		referencedEntityIds: suggestion.referencedEntityIds
	};
}

/**
 * 0.9.3: slot a lifted plugin recipe into the right sub-group of a
 * group tree, based on the suggestion's `placement`. Mutates `tree`
 * in place. Returns true iff a slot was found and the recipe landed;
 * false means the placement target wasn't present in the tree (e.g.
 * a per-area suggestion for an area the user doesn't have) and the
 * recipe was dropped on the floor with no error.
 */
function slotPluginRecipe(
	tree: BrowserGroup[],
	placement: PluginRecipePlacement,
	recipe: AccomplishmentRecipe
): boolean {
	if (placement.kind === 'area') {
		const groupId = `area-${placement.areaId}`;
		const group = tree.find((g) => g.id === groupId);
		if (!group) return false;
		// Sub-group ids are `${areaId}/${slug}`; resolve the matching slug.
		const sgId = `${placement.areaId}/${placement.subGroup}`;
		const sg = group.subGroups.find((s) => s.id === sgId);
		if (!sg) return false;
		sg.recipes.push(recipe);
		return true;
	}
	// Cross-area
	const bucketId = `bucket-${placement.bucket}`;
	let group = tree.find((g) => g.id === bucketId);
	if (!group) {
		// Lazy-create the bucket — 'components' is the canonical home
		// for plugin recipes that don't fit any natural cross-area
		// category. Same default-collapsed behaviour as the other
		// cross-area buckets.
		const label = placement.bucket === 'components'
			? 'Components'
			: placement.bucket.charAt(0).toUpperCase() + placement.bucket.slice(1);
		group = {
			id: bucketId,
			label,
			defaultCollapsed: placement.bucket !== 'scenes',
			subGroups: [{ id: `${bucketId}/all`, label, recipes: [] }]
		};
		tree.push(group);
	}
	const sg = group.subGroups[0];
	sg.recipes.push(recipe);
	return true;
}

/**
 * Build the things-browser tree from discovery's areas. Per-area
 * groups come first (sorted by area name; unsorted area last,
 * default-collapsed). Cross-area buckets follow (scenes / scripts /
 * automations / status / other).
 *
 * 0.9.3 extension: `pluginBlocks` (optional) is a list of plugin
 * block contributions from active plugins. For each contribution
 * with a `suggestRecipes`, the returned suggestions are lifted into
 * `AccomplishmentRecipe`s and slotted into the right per-area sub-
 * group (or cross-area bucket). Omitted → no plugin recipes (used
 * by tests + by surfaces that don't want plugin contributions).
 */
export function buildBrowserTree(
	areas: DomainArea[],
	pluginBlocks: PluginBlockContribution[] = []
): BrowserGroup[] {
	const groups: BrowserGroup[] = [];

	// Per-area pass.
	const realAreas = areas
		.filter((a) => a.id !== '__unsorted__')
		.sort((a, b) => a.name.localeCompare(b.name));
	const unsortedArea = areas.find((a) => a.id === '__unsorted__');
	const perAreaSorted = unsortedArea ? [...realAreas, unsortedArea] : realAreas;

	// Cross-area accumulators — built as we walk every area's
	// otherEntities + scenes + sensors buckets, deduplicated by
	// entity_id.
	const cross: CrossAreaAccumulator = {
		scenes: [],
		scripts: [],
		automations: [],
		status: [],
		other: [],
		seen: new Set()
	};

	function pushCrossArea(ent: DomainEntity) {
		if (cross.seen.has(ent.id)) return;
		const bucket = crossAreaBucketFor(domainOf(ent.id));
		if (!bucket) return;
		cross.seen.add(ent.id);
		const recipe = recipeForCrossAreaEntity(ent);
		cross[bucket].push(recipe);
	}

	for (const area of perAreaSorted) {
		const subGroups: BrowserSubGroup[] = [];
		for (const builder of PER_AREA_SUBGROUP_BUILDERS) {
			const sg = builder(area);
			if (sg) subGroups.push(sg);
		}

		// Cross-area pass: scenes that happen to be ASSIGNED to this area
		// still feed the cross-area Scenes bucket (scenes are conceptually
		// house-wide). Same for the "other" buckets.
		for (const ent of area.scenes) pushCrossArea(ent);
		for (const ent of area.otherEntities) pushCrossArea(ent);
		// Sensors are ambiguous — they live in area.sensors AND feed the
		// cross-area Status bucket. We surface them in BOTH places so the
		// user can find them via "where they live" (area) or "what they
		// are" (status). Dedup is by recipe id, which differs between the
		// two paths.
		for (const ent of area.sensors) pushCrossArea(ent);

		if (subGroups.length === 0) continue;

		groups.push({
			id: `area-${area.id}`,
			label: area.name,
			defaultCollapsed: area.id === '__unsorted__',
			subGroups
		});
	}

	// Cross-area buckets — only emit non-empty ones.
	const crossDefs: Array<{ key: CrossAreaBucket; label: string }> = [
		{ key: 'scenes', label: 'Scenes' },
		{ key: 'scripts', label: 'Scripts' },
		{ key: 'automations', label: 'Automations' },
		{ key: 'status', label: 'Status sensors' },
		{ key: 'other', label: 'Other' }
	];
	for (const def of crossDefs) {
		const recipes: AccomplishmentRecipe[] = cross[def.key];
		if (recipes.length === 0) continue;
		// Sort recipes alphabetically within the bucket.
		const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
		groups.push({
			id: `bucket-${def.key}`,
			label: def.label,
			// Scenes default-expanded (frequently used); rest collapsed.
			defaultCollapsed: def.key !== 'scenes',
			subGroups: [{ id: `bucket-${def.key}/all`, label: def.label, recipes: sorted }]
		});
	}

	/* ── 0.9.3: plugin recipe walk ─────────────────────────────────
	 * For each plugin block contribution with a `suggestRecipes`
	 * hook, call it against the discovery snapshot + slot returned
	 * suggestions into the right sub-group. Cross-area `components`
	 * bucket is lazily created if any suggestion lands there.
	 */
	if (pluginBlocks.length > 0) {
		const snapshot: PluginDiscoverySnapshot = {
			floors: [],
			areas,
			persons: []
		};
		for (const contribution of pluginBlocks) {
			if (!contribution.suggestRecipes) continue;
			let suggestions: PluginRecipeSuggestion[] = [];
			try {
				suggestions = contribution.suggestRecipes(snapshot);
			} catch (err) {
				// A misbehaving plugin shouldn't crash the browser.
				console.warn(
					`[things-browser] plugin ${contribution.type} suggestRecipes() threw — dropping`,
					err
				);
				continue;
			}
			for (const s of suggestions) {
				const recipe = liftPluginSuggestion(contribution, s);
				slotPluginRecipe(groups, s.placement, recipe);
			}
		}
	}

	return groups;
}

/**
 * Filter a tree by query — case-insensitive, matches recipe title,
 * description, entity_id, sub-group label, or group label. Returns
 * a new tree with empty sub-groups + empty groups dropped. All
 * matching groups expand by default.
 */
export function filterBrowserTree(tree: BrowserGroup[], query: string): BrowserGroup[] {
	const q = query.trim().toLowerCase();
	if (!q) return tree;
	const out: BrowserGroup[] = [];
	for (const group of tree) {
		const groupMatches = group.label.toLowerCase().includes(q);
		const subGroups: BrowserSubGroup[] = [];
		for (const sg of group.subGroups) {
			const sgMatches = sg.label.toLowerCase().includes(q);
			const recipes = sg.recipes.filter((r) => {
				if (groupMatches || sgMatches) return true;
				if (r.title.toLowerCase().includes(q)) return true;
				if (r.description?.toLowerCase().includes(q)) return true;
				return r.referencedEntityIds.some((id) => id.toLowerCase().includes(q));
			});
			if (recipes.length === 0) continue;
			subGroups.push({ ...sg, recipes });
		}
		if (subGroups.length === 0) continue;
		out.push({ ...group, subGroups, defaultCollapsed: false });
	}
	return out;
}

/**
 * Count recipes across an entire tree. Used by the browser header
 * to show a total + the editor's status line. O(n) — call sparingly
 * on big installs.
 */
export function countRecipes(tree: BrowserGroup[]): number {
	let n = 0;
	for (const g of tree) for (const sg of g.subGroups) n += sg.recipes.length;
	return n;
}

/* ── Entity picker (for the macro composer) ────────────────────── */
/**
 * The macro composer has a different UX from the main browser. Its
 * job is "pick a thing, then pick an action to fire against it" —
 * it deliberately works at the atomic-entity level rather than the
 * accomplishment level (composing a macro IS what produces the
 * composition). So it gets a simpler data shape: flat groups of
 * individual entities, no sub-groups, no recipes.
 */

/** One entity in the macro composer's picker. */
export interface EntityPickerItem {
	entityId: string;
	name: string;
	domain: string;
	icon?: string | null;
	areaName?: string;
}

/** A group in the macro composer's picker — e.g. "Kitchen" or "Scenes". */
export interface EntityPickerGroup {
	id: string;
	label: string;
	defaultCollapsed: boolean;
	items: EntityPickerItem[];
}

/** Per-area domains the picker surfaces (controllable). */
const PICKER_PER_AREA_DOMAINS = new Set([
	'light',
	'switch',
	'climate',
	'lock',
	'cover',
	'camera',
	'image',
	'media_player'
]);

function pickerCrossAreaBucketFor(domain: string): string | null {
	if (domain === 'scene') return 'scenes';
	if (domain === 'script') return 'scripts';
	if (domain === 'automation') return 'automations';
	if (
		domain === 'input_boolean' ||
		domain === 'input_select' ||
		domain === 'input_number' ||
		domain === 'select' ||
		domain === 'number'
	) {
		return 'other';
	}
	// The composer doesn't surface read-only sensors (binary_sensor,
	// sensor, person) — they have no fire-able default action.
	return null;
}

/**
 * Build the entity picker for the macro composer. Per-area groups
 * (controllable domains only) + cross-area buckets for scenes /
 * scripts / automations / input_*.
 */
export function buildEntityPicker(areas: DomainArea[]): EntityPickerGroup[] {
	const groups: EntityPickerGroup[] = [];

	const realAreas = areas
		.filter((a) => a.id !== '__unsorted__')
		.sort((a, b) => a.name.localeCompare(b.name));
	const unsortedArea = areas.find((a) => a.id === '__unsorted__');
	const perAreaSorted = unsortedArea ? [...realAreas, unsortedArea] : realAreas;

	const crossBuckets = new Map<string, EntityPickerItem[]>();
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

	for (const area of perAreaSorted) {
		const items: EntityPickerItem[] = [];
		const pushEnt = (ent: DomainEntity) => {
			const dom = domainOf(ent.id);
			if (!PICKER_PER_AREA_DOMAINS.has(dom)) {
				const bucket = pickerCrossAreaBucketFor(dom);
				if (bucket) pushCross(bucket, ent, area.name);
				return;
			}
			items.push({
				entityId: ent.id,
				name: ent.name,
				domain: dom,
				icon: ent.icon ?? null,
				areaName: area.name
			});
		};

		for (const ent of area.lights) pushEnt(ent);
		for (const ent of area.switches) pushEnt(ent);
		for (const ent of area.climates) pushEnt(ent);
		for (const ent of area.locks) pushEnt(ent);
		for (const ent of area.cameras) pushEnt(ent);
		for (const ent of area.media) pushEnt(ent);
		for (const ent of area.tvs) pushEnt(ent);
		for (const ent of area.scenes) pushEnt(ent);
		for (const ent of area.otherEntities) pushEnt(ent);

		if (items.length === 0) continue;
		// Sort by domain priority then name.
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
		items.sort((a, b) => {
			const ai = domainOrder.indexOf(a.domain);
			const bi = domainOrder.indexOf(b.domain);
			if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
			return a.name.localeCompare(b.name);
		});

		groups.push({
			id: `area-${area.id}`,
			label: area.name,
			defaultCollapsed: area.id === '__unsorted__',
			items
		});
	}

	const bucketOrder: ReadonlyArray<readonly [string, string]> = [
		['scenes', 'Scenes'],
		['scripts', 'Scripts'],
		['automations', 'Automations'],
		['other', 'Other']
	];
	for (const [key, label] of bucketOrder) {
		const items = crossBuckets.get(key);
		if (!items || items.length === 0) continue;
		items.sort((a, b) => a.name.localeCompare(b.name));
		groups.push({
			id: `bucket-${key}`,
			label,
			defaultCollapsed: key !== 'scenes',
			items
		});
	}

	return groups;
}

/**
 * Filter the entity picker by query — case-insensitive, matches name
 * / entity_id / area name. Returns groups with empty groups dropped.
 */
export function filterEntityPicker(
	groups: EntityPickerGroup[],
	query: string
): EntityPickerGroup[] {
	const q = query.trim().toLowerCase();
	if (!q) return groups;
	const out: EntityPickerGroup[] = [];
	for (const g of groups) {
		const items = g.items.filter((i) => {
			if (i.name.toLowerCase().includes(q)) return true;
			if (i.entityId.toLowerCase().includes(q)) return true;
			if (i.areaName?.toLowerCase().includes(q)) return true;
			return false;
		});
		if (items.length === 0) continue;
		out.push({ ...g, items, defaultCollapsed: false });
	}
	return out;
}
