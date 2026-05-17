/**
 * 0.9.2 — things-browser data model: AccomplishmentRecipe + tree
 * generator + entity-picker filter.
 *
 * Covers the recipe generators per-area + cross-area, the placed-
 * tracking via referencedEntityIds, the search filter across the new
 * group → sub-group → recipe shape, and the entity-picker variant
 * used by the macro composer.
 */

import { describe, it, expect } from 'vitest';
import type { DomainArea, DomainEntity } from '$lib/discovery';
import type { PluginBlockContribution, PluginRecipeSuggestion } from '$lib/plugins/types';
import {
	buildBrowserTree,
	filterBrowserTree,
	countRecipes,
	buildEntityPicker,
	filterEntityPicker
} from '$lib/blocks/things-browser';

function mkEnt(id: string, name = id.split('.')[1]): DomainEntity {
	return {
		id,
		name,
		domain: id.split('.')[0],
		state: null,
		deviceId: null,
		device: null,
		areaId: null,
		labels: [],
		hidden: false,
		autoHideReason: null,
		disabled: false,
		entityCategory: null,
		icon: null,
		deviceClass: null,
		platform: 'test'
	};
}

/** Same as mkEnt but with a device model — for kiosk/tablet filter tests. */
function mkEntWithModel(id: string, name: string, model: string): DomainEntity {
	const e = mkEnt(id, name);
	(e as DomainEntity & { device: { id: string; name: null; model: string; manufacturer: null; areaId: null } | null }).device = {
		id: 'dev-1',
		name: null,
		model,
		manufacturer: null,
		areaId: null
	};
	return e;
}

function mkArea(id: string, name: string, overrides: Partial<DomainArea> = {}): DomainArea {
	const base: DomainArea = {
		id,
		name,
		wasHumanized: false,
		icon: null,
		picture: null,
		floorId: null,
		labels: [],
		lights: [],
		switches: [],
		climates: [],
		locks: [],
		contacts: [],
		cameras: [],
		media: [],
		tvs: [],
		remotes: [],
		sensors: [],
		scenes: [],
		otherEntities: [],
		hiddenEntities: [],
		hasLighting: false,
		hasClimate: false,
		hasLock: false,
		hasMedia: false,
		hasCamera: false,
		hasSensors: false,
		entityCount: 0
	};
	return { ...base, ...overrides };
}

/* ── per-area: lights ──────────────────────────────────────────── */

describe('buildBrowserTree — light recipes', () => {
	it('emits composed panel + off + toggle for an area with ≥2 lights', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [
				mkEnt('light.lr_pendant', 'Living Room Pendant'),
				mkEnt('light.lr_floor', 'Library Floor Lamp'),
				mkEnt('light.lr_table', 'Library Table Lamp')
			]
		});
		const tree = buildBrowserTree([lr]);
		expect(tree).toHaveLength(1);
		expect(tree[0].label).toBe('Living Room');
		const lights = tree[0].subGroups.find((sg) => sg.label === 'Lights');
		expect(lights).toBeDefined();
		const titles = lights!.recipes.map((r) => r.title);
		expect(titles).toContain('Living Room lights — panel');
		expect(titles).toContain('Living Room lights — off');
		expect(titles).toContain('Living Room lights — toggle');
		// Plus three atomic per-light entries.
		expect(titles).toContain('Living Room Pendant');
		expect(titles).toContain('Library Floor Lamp');
		expect(titles).toContain('Library Table Lamp');
	});

	it('skips composed recipes when area has only 1 light (still emits the atom)', () => {
		const office = mkArea('office', 'Office', {
			lights: [mkEnt('light.office_lamp', 'Office Table Lamp')]
		});
		const tree = buildBrowserTree([office]);
		const lights = tree[0].subGroups.find((sg) => sg.label === 'Lights');
		const titles = lights!.recipes.map((r) => r.title);
		// No composition: the area has only one light, so panel + off +
		// toggle would just be a clunky version of the single thing tile.
		expect(titles).not.toContain('Office lights — panel');
		expect(titles).not.toContain('Office lights — off');
		expect(titles).not.toContain('Office lights — toggle');
		// Atom still appears.
		expect(titles).toContain('Office Table Lamp');
	});

	it('panel recipe drops a single area-lights-panel composite block (0.9.3 change)', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a'), mkEnt('light.b')]
		});
		const tree = buildBrowserTree([lr]);
		const panel = tree[0].subGroups[0].recipes.find((r) => r.title.endsWith('— panel'));
		expect(panel).toBeDefined();
		// 0.9.2 used to drop outline + N thing blocks. 0.9.3 emits one
		// composite block whose renderer reads discovery at render time.
		expect(panel!.blocks).toHaveLength(1);
		expect(panel!.blocks[0].type).toBe('area-lights-panel');
		if (panel!.blocks[0].type === 'area-lights-panel') {
			expect(panel!.blocks[0].config.areaId).toBe('living_room');
		}
	});

	it('off recipe drops a single macro block with N turn_off steps', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a'), mkEnt('light.b'), mkEnt('light.c')]
		});
		const tree = buildBrowserTree([lr]);
		const off = tree[0].subGroups[0].recipes.find((r) => r.title.endsWith('— off'));
		expect(off).toBeDefined();
		expect(off!.blocks).toHaveLength(1);
		expect(off!.blocks[0].type).toBe('macro');
		if (off!.blocks[0].type === 'macro') {
			expect(off!.blocks[0].config.steps).toHaveLength(3);
			for (const step of off!.blocks[0].config.steps) {
				expect(step.service.domain).toBe('light');
				expect(step.service.service).toBe('turn_off');
			}
		}
	});
});

/* ── per-area: TV ──────────────────────────────────────────────── */

describe('buildBrowserTree — TV recipes', () => {
	it('emits full-remote + power-toggle + turn-on + turn-off per TV', () => {
		const lr = mkArea('living_room', 'Living Room', {
			tvs: [mkEnt('media_player.lr_tv', 'Living Room TV')]
		});
		const tree = buildBrowserTree([lr]);
		const tvSub = tree[0].subGroups.find((sg) => sg.label === 'TV');
		expect(tvSub).toBeDefined();
		const titles = tvSub!.recipes.map((r) => r.title);
		expect(titles).toEqual([
			'Living Room TV — full remote',
			'Living Room TV — power toggle',
			'Living Room TV — turn on',
			'Living Room TV — turn off'
		]);
	});
});

/* ── per-area: climate ─────────────────────────────────────────── */

describe('buildBrowserTree — climate recipes', () => {
	it('emits boost-to-21° + off-to-5° for area with ≥2 TRVs', () => {
		const lr = mkArea('living_room', 'Living Room', {
			climates: [mkEnt('climate.lr_trv', 'Living Room TRV'), mkEnt('climate.lib_trv', 'Library TRV')]
		});
		const tree = buildBrowserTree([lr]);
		const heat = tree[0].subGroups.find((sg) => sg.label === 'Heating');
		expect(heat).toBeDefined();
		const titles = heat!.recipes.map((r) => r.title);
		expect(titles).toContain('Living Room heating — boost to 21°');
		expect(titles).toContain('Living Room heating — off (5°)');
		// And each TRV as an atom.
		expect(titles).toContain('Living Room TRV');
		expect(titles).toContain('Library TRV');
	});

	it('boost-to-21 macro carries temperature: 21 in service data', () => {
		const lr = mkArea('living_room', 'Living Room', {
			climates: [mkEnt('climate.a'), mkEnt('climate.b')]
		});
		const tree = buildBrowserTree([lr]);
		const boost = tree[0].subGroups[0].recipes.find((r) => r.title.endsWith('boost to 21°'));
		expect(boost).toBeDefined();
		if (boost!.blocks[0].type === 'macro') {
			for (const step of boost!.blocks[0].config.steps) {
				expect(step.service.data).toEqual({ temperature: 21 });
			}
		}
	});
});

/* ── per-area: locks ───────────────────────────────────────────── */

describe('buildBrowserTree — lock recipes', () => {
	it('emits unlock + status-tile per lock', () => {
		const hall = mkArea('hallway', 'Hallway', {
			locks: [mkEnt('lock.front_door', 'Front Door')]
		});
		const tree = buildBrowserTree([hall]);
		const locks = tree[0].subGroups.find((sg) => sg.label === 'Locks');
		const titles = locks!.recipes.map((r) => r.title);
		expect(titles).toContain('Front Door — unlock');
		expect(titles).toContain('Front Door — status tile');
	});
});

/* ── cross-area: scenes, scripts, automations ──────────────────── */

describe('buildBrowserTree — cross-area buckets', () => {
	it('lifts scenes out into a Scenes bucket, dedup across areas', () => {
		const a1 = mkArea('a1', 'Area 1', { scenes: [mkEnt('scene.cinema', 'Cinema')] });
		const a2 = mkArea('a2', 'Area 2', { scenes: [mkEnt('scene.cinema', 'Cinema')] });
		const tree = buildBrowserTree([a1, a2]);
		const scenesBucket = tree.find((g) => g.id === 'bucket-scenes');
		expect(scenesBucket).toBeDefined();
		const recipes = scenesBucket!.subGroups[0].recipes;
		// dedup → just one scene recipe even though two areas reference it
		expect(recipes).toHaveLength(1);
		expect(recipes[0].title).toBe('Activate Cinema');
	});

	it('routes scripts → Scripts bucket and automations → Automations bucket', () => {
		const area = mkArea('mixed', 'Mixed', {
			otherEntities: [
				mkEnt('script.bedtime', 'Bedtime'),
				mkEnt('automation.evening', 'Evening Routine')
			]
		});
		const tree = buildBrowserTree([area]);
		const scripts = tree.find((g) => g.id === 'bucket-scripts');
		const automations = tree.find((g) => g.id === 'bucket-automations');
		expect(scripts!.subGroups[0].recipes[0].title).toBe('Run Bedtime');
		expect(automations!.subGroups[0].recipes[0].title).toBe('Trigger Evening Routine');
	});

	it('Scenes bucket default-expanded; rest default-collapsed', () => {
		const a = mkArea('a', 'A', {
			scenes: [mkEnt('scene.a', 'A')],
			otherEntities: [mkEnt('script.b', 'B')]
		});
		const tree = buildBrowserTree([a]);
		const scenes = tree.find((g) => g.id === 'bucket-scenes');
		const scripts = tree.find((g) => g.id === 'bucket-scripts');
		expect(scenes!.defaultCollapsed).toBe(false);
		expect(scripts!.defaultCollapsed).toBe(true);
	});
});

/* ── filter ────────────────────────────────────────────────────── */

describe('filterBrowserTree', () => {
	const sample = () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [
				mkEnt('light.lr_pendant', 'Living Room Pendant'),
				mkEnt('light.lr_floor', 'Library Floor Lamp')
			],
			tvs: [mkEnt('media_player.lr_tv', 'Living Room TV')]
		});
		const office = mkArea('office', 'Office', {
			lights: [mkEnt('light.office_lamp', 'Office Lamp')]
		});
		return buildBrowserTree([lr, office]);
	};

	it('matches by verb in recipe title', () => {
		const filtered = filterBrowserTree(sample(), 'off');
		// Should match "Living Room lights — off", "Living Room TV — turn off"
		const titles = filtered.flatMap((g) => g.subGroups.flatMap((sg) => sg.recipes.map((r) => r.title)));
		expect(titles.some((t) => t.includes('— off'))).toBe(true);
		expect(titles.some((t) => t === 'Living Room TV — turn off')).toBe(true);
	});

	it('matches by entity_id fragment', () => {
		const filtered = filterBrowserTree(sample(), 'lr_pendant');
		const titles = filtered.flatMap((g) => g.subGroups.flatMap((sg) => sg.recipes.map((r) => r.title)));
		expect(titles).toContain('Living Room Pendant');
	});

	it('matches by area name', () => {
		const filtered = filterBrowserTree(sample(), 'office');
		expect(filtered.find((g) => g.label === 'Office')).toBeDefined();
		expect(filtered.find((g) => g.label === 'Living Room')).toBeUndefined();
	});

	it('drops empty sub-groups and groups', () => {
		const filtered = filterBrowserTree(sample(), 'pendant');
		// Only the Lights sub-group of Living Room survives.
		expect(filtered).toHaveLength(1);
		expect(filtered[0].subGroups).toHaveLength(1);
		expect(filtered[0].subGroups[0].label).toBe('Lights');
	});

	it('empty query returns the input tree unchanged', () => {
		const tree = sample();
		expect(filterBrowserTree(tree, '')).toBe(tree);
		expect(filterBrowserTree(tree, '   ')).toBe(tree);
	});
});

/* ── countRecipes ──────────────────────────────────────────────── */

describe('countRecipes', () => {
	it('sums recipes across every sub-group of every group', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a'), mkEnt('light.b')] // 3 composed + 2 atoms = 5
		});
		const tree = buildBrowserTree([lr]);
		expect(countRecipes(tree)).toBe(5);
	});

	it('returns 0 for empty input', () => {
		expect(countRecipes([])).toBe(0);
	});
});

/* ── entity picker (macro composer's flat view) ────────────────── */

describe('buildEntityPicker', () => {
	it('shows individual controllable entities grouped by area', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.lr_a'), mkEnt('light.lr_b')],
			tvs: [mkEnt('media_player.lr_tv', 'TV')]
		});
		const picker = buildEntityPicker([lr]);
		expect(picker).toHaveLength(1);
		expect(picker[0].label).toBe('Living Room');
		const ids = picker[0].items.map((i) => i.entityId);
		expect(ids).toEqual(['light.lr_a', 'light.lr_b', 'media_player.lr_tv']);
	});

	it('routes scenes / scripts into their cross-area buckets', () => {
		const a = mkArea('a', 'A', {
			scenes: [mkEnt('scene.cinema', 'Cinema')],
			otherEntities: [mkEnt('script.bedtime', 'Bedtime')]
		});
		const picker = buildEntityPicker([a]);
		expect(picker.some((g) => g.id === 'bucket-scenes')).toBe(true);
		expect(picker.some((g) => g.id === 'bucket-scripts')).toBe(true);
	});

	it('excludes read-only sensors from the picker (macros need fire-able actions)', () => {
		const a = mkArea('a', 'A', {
			sensors: [mkEnt('sensor.temp', 'Temp')],
			lights: [mkEnt('light.a', 'Light A')]
		});
		const picker = buildEntityPicker([a]);
		const allIds = picker.flatMap((g) => g.items.map((i) => i.entityId));
		expect(allIds).toContain('light.a');
		expect(allIds).not.toContain('sensor.temp');
	});
});

describe('filterEntityPicker', () => {
	it('matches by name + entity_id + area name', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.lr_pendant', 'Living Room Pendant')]
		});
		const picker = buildEntityPicker([lr]);
		expect(filterEntityPicker(picker, 'pendant')[0].items).toHaveLength(1);
		expect(filterEntityPicker(picker, 'lr_pendant')[0].items).toHaveLength(1);
		expect(filterEntityPicker(picker, 'living room')[0].items).toHaveLength(1);
		expect(filterEntityPicker(picker, 'zzz')).toHaveLength(0);
	});
});

/* ── 0.9.3 area-panel composite recipes ────────────────────────── */

describe('buildBrowserTree — 0.9.3 area-panel composites', () => {
	it('climate panel emits one area-climate-panel block when ≥ 2 TRVs', () => {
		const lr = mkArea('living_room', 'Living Room', {
			climates: [mkEnt('climate.a'), mkEnt('climate.b')]
		});
		const tree = buildBrowserTree([lr]);
		const heat = tree[0].subGroups.find((sg) => sg.label === 'Heating');
		const panel = heat!.recipes.find((r) => r.title.endsWith('— panel'));
		expect(panel).toBeDefined();
		expect(panel!.blocks).toHaveLength(1);
		expect(panel!.blocks[0].type).toBe('area-climate-panel');
	});

	it('media panel emits one area-media-panel block when ≥ 2 media OR mixed TV + speaker', () => {
		// Mixed TV + speaker
		const lr = mkArea('living_room', 'Living Room', {
			tvs: [mkEnt('media_player.tv', 'TV')],
			media: [mkEnt('media_player.speaker', 'Speaker')]
		});
		const tree = buildBrowserTree([lr]);
		const tvSub = tree[0].subGroups.find((sg) => sg.label === 'TV');
		const panel = tvSub!.recipes.find((r) => r.title.endsWith('media — panel'));
		expect(panel).toBeDefined();
		expect(panel!.blocks[0].type).toBe('area-media-panel');
		expect(panel!.referencedEntityIds).toEqual(['media_player.tv', 'media_player.speaker']);
	});

	it('media panel does NOT appear when area has just one TV (and no speakers)', () => {
		const lr = mkArea('living_room', 'Living Room', {
			tvs: [mkEnt('media_player.lr_tv', 'TV')]
		});
		const tree = buildBrowserTree([lr]);
		const tvSub = tree[0].subGroups.find((sg) => sg.label === 'TV');
		const panel = tvSub!.recipes.find((r) => r.title.endsWith('media — panel'));
		expect(panel).toBeUndefined();
	});

	// 0.9.3.1: tablets / kiosks / phones are media_player by HA's
	// protocol but are SURFACES (broadsheet often runs ON them), not
	// SOURCES. They must not appear on a media panel, contribute to
	// the panel-count threshold, or get TMDB recipes.
	it('drops kiosk/tablet entities from the Speakers sub-group', () => {
		const lr = mkArea('living_room', 'Living Room', {
			media: [
				mkEntWithModel('media_player.galaxy_tab_a9', 'Galaxy Tab A9', 'SM-X115'),
				mkEntWithModel('media_player.fire_tablet', 'Fire HD 10', 'KFSUWI'),
				mkEnt('media_player.kitchen_sonos', 'Kitchen Sonos')
			]
		});
		const tree = buildBrowserTree([lr]);
		const speakers = tree[0].subGroups.find((sg) => sg.label === 'Speakers');
		// Only the Sonos survives; the tablets drop.
		expect(speakers).toBeDefined();
		const titles = speakers!.recipes.map((r) => r.title);
		expect(titles.some((t) => t.includes('Sonos'))).toBe(true);
		expect(titles.some((t) => t.toLowerCase().includes('galaxy tab'))).toBe(false);
		expect(titles.some((t) => t.toLowerCase().includes('fire'))).toBe(false);
	});

	it('drops kiosk/tablet entries from the media-panel referencedEntityIds + count threshold', () => {
		// Single real TV + a tablet — the panel-2-or-mixed threshold
		// should NOT trip, because the tablet doesn't count as a real
		// speaker.
		const lr = mkArea('living_room', 'Living Room', {
			tvs: [mkEnt('media_player.lr_tv', 'TV')],
			media: [mkEntWithModel('media_player.galaxy_tab_a9', 'Galaxy Tab A9', 'SM-X115')]
		});
		const tree = buildBrowserTree([lr]);
		const tvSub = tree[0].subGroups.find((sg) => sg.label === 'TV');
		const panel = tvSub!.recipes.find((r) => r.title.endsWith('media — panel'));
		expect(panel).toBeUndefined();
	});

	it('keeps the media-panel recipe when there are real mixed sources, with the tablet excluded', () => {
		const lr = mkArea('living_room', 'Living Room', {
			tvs: [mkEnt('media_player.lr_tv', 'TV')],
			media: [
				mkEnt('media_player.kitchen_sonos', 'Sonos'),
				mkEntWithModel('media_player.galaxy_tab_a9', 'Galaxy Tab', 'SM-X115')
			]
		});
		const tree = buildBrowserTree([lr]);
		const tvSub = tree[0].subGroups.find((sg) => sg.label === 'TV');
		const panel = tvSub!.recipes.find((r) => r.title.endsWith('media — panel'));
		expect(panel).toBeDefined();
		// Tablet not in referenced entity ids.
		expect(panel!.referencedEntityIds).not.toContain('media_player.galaxy_tab_a9');
		// Sonos + TV are.
		expect(panel!.referencedEntityIds).toEqual(['media_player.lr_tv', 'media_player.kitchen_sonos']);
	});
});

/* ── 0.9.3 plugin recipe walker ────────────────────────────────── */

describe('buildBrowserTree — plugin recipe slotting', () => {
	function makePluginBlock(
		type: string,
		suggest: (areas: DomainArea[]) => PluginRecipeSuggestion[]
	): PluginBlockContribution {
		return {
			type,
			label: type,
			description: 'test',
			defaultConfig: {},
			renderer: () => Promise.resolve({ default: (() => null) as never }),
			suggestRecipes: (snapshot) => suggest(snapshot.areas)
		};
	}

	it('slots a per-area suggestion into the named sub-group', () => {
		const lr = mkArea('living_room', 'Living Room', {
			tvs: [mkEnt('media_player.lr_tv', 'TV')]
		});
		const tmdb = makePluginBlock('tmdb-tv:rows', (areas) =>
			areas
				.filter((a) => a.tvs.length > 0)
				.map((a) => ({
					id: `tmdb-tv:rows:${a.id}`,
					title: `${a.name} TV — TMDB show & movie rows`,
					placement: { kind: 'area', areaId: a.id, subGroup: 'tvs' as const },
					config: {},
					referencedEntityIds: a.tvs.map((tv) => tv.id)
				}))
		);
		const tree = buildBrowserTree([lr], [tmdb]);
		const tvSub = tree[0].subGroups.find((sg) => sg.label === 'TV');
		const tmdbRecipe = tvSub!.recipes.find((r) => r.id === 'tmdb-tv:rows:living_room');
		expect(tmdbRecipe).toBeDefined();
		expect(tmdbRecipe!.blocks).toHaveLength(1);
		expect(tmdbRecipe!.blocks[0].type).toBe('tmdb-tv:rows');
		expect(tmdbRecipe!.referencedEntityIds).toEqual(['media_player.lr_tv']);
	});

	it('lazy-creates the "components" cross-area bucket when a cross-area suggestion lands', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a')]
		});
		const decorative = makePluginBlock('emanations:painting', () => [
			{
				id: 'emanations:painting:home',
				title: 'House painting',
				placement: { kind: 'cross-area', bucket: 'components' as const },
				config: {},
				referencedEntityIds: []
			}
		]);
		const tree = buildBrowserTree([lr], [decorative]);
		const components = tree.find((g) => g.id === 'bucket-components');
		expect(components).toBeDefined();
		expect(components!.subGroups[0].recipes[0].title).toBe('House painting');
	});

	it('drops suggestions whose placement target is missing (no error, no crash)', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a')]
		});
		const ghost = makePluginBlock('ghost:tube', () => [
			{
				id: 'ghost:tube:nonexistent',
				title: 'Ghost tube',
				placement: { kind: 'area', areaId: 'nonexistent', subGroup: 'lights' as const },
				config: {},
				referencedEntityIds: []
			}
		]);
		// Should not throw, recipe just doesn't appear anywhere.
		expect(() => buildBrowserTree([lr], [ghost])).not.toThrow();
	});

	it('a misbehaving plugin (suggestRecipes throws) does not crash the tree builder', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a')]
		});
		const broken: PluginBlockContribution = {
			type: 'broken',
			label: 'broken',
			description: 'broken',
			defaultConfig: {},
			renderer: () => Promise.resolve({ default: (() => null) as never }),
			suggestRecipes: () => {
				throw new Error('boom');
			}
		};
		// Silence the console.warn the walker emits for the broken
		// plugin so the test output stays clean.
		const orig = console.warn;
		console.warn = () => {};
		try {
			expect(() => buildBrowserTree([lr], [broken])).not.toThrow();
		} finally {
			console.warn = orig;
		}
	});

	it('omitted suggestRecipes is fine (plugin block placeable via advanced mode only)', () => {
		const lr = mkArea('living_room', 'Living Room', {
			lights: [mkEnt('light.a')]
		});
		const noSuggest: PluginBlockContribution = {
			type: 'quiet',
			label: 'quiet',
			description: 'no recipe suggestions',
			defaultConfig: {},
			renderer: () => Promise.resolve({ default: (() => null) as never })
		};
		const tree = buildBrowserTree([lr], [noSuggest]);
		// Tree built normally; no extra recipes from the plugin.
		const allRecipes = tree.flatMap((g) => g.subGroups.flatMap((sg) => sg.recipes));
		expect(allRecipes.every((r) => !r.id.startsWith('quiet:'))).toBe(true);
	});
});
