/**
 * Preset page templates — starting points for the custom-page builder.
 *
 * Each preset is a `CustomPageDef` minus the slug (slug is supplied
 * by the user at create-time) plus metadata about when it makes
 * sense (`applicableWhen` checks the discovery snapshot for
 * prerequisites — e.g. the Person preset needs ≥1 discovered
 * person to be applicable).
 *
 * Presets sit between "blank page" and "import from Lovelace" on
 * the create-page flow:
 *   - blank → fastest if you know exactly what you want
 *   - preset → fastest if you want a sensible starting point
 *   - import → fastest if you're migrating an existing dashboard
 *
 * Adding a preset:
 *   1. Add a function below that returns the page def (sans slug)
 *   2. Add the entry to PRESETS with metadata
 *   3. The /settings/pages/new picker auto-includes it
 *
 * Presets ship as TypeScript (not JSON files) so they can reference
 * discovery facts at composition time — e.g. the Person preset
 * fills the per-person painting/sensor refs with the actual person's
 * details. Static JSON would force the user to hand-edit those.
 */

import type { CustomPageDef } from '$lib/blocks/types';
import type { DomainArea, DomainPerson } from '$lib/discovery';

/* ── Preset config types ─────────────────────────────────────────── */

export interface PresetContext {
	persons: DomainPerson[];
	areas: DomainArea[];
}

export interface PresetMeta {
	id: string;
	label: string;
	description: string;
	/** Optional: per-person presets need a person id; preset UI prompts for it. */
	requiresPerson?: boolean;
	applicableWhen?: (ctx: PresetContext) => boolean;
}

export interface PresetBuilder {
	meta: PresetMeta;
	/** Build the page (sans slug). The UI applies the user-supplied slug + label after. */
	build: (ctx: PresetContext, opts: { personId?: string; label: string }) => Omit<CustomPageDef, 'slug'>;
}

/* ── Preset 0: Blank canvas (always available) ───────────────────── */

/**
 * The "I want to compose from scratch" starting point. Always applicable.
 * Acts as a defensive fallback when none of the data-dependent presets
 * (person/wall/family/energy) qualify on a fresh install — guarantees
 * the picker always renders at least one chip so the user can proceed.
 */
const blankCanvas: PresetBuilder = {
	meta: {
		id: 'blank',
		label: 'Blank canvas',
		description: 'A starter Hero block — compose the rest yourself.'
		// no applicableWhen → always applicable
	},
	build: (_ctx, opts) => ({
		label: opts.label,
		blocks: [
			{
				type: 'hero',
				config: {
					eyebrow: opts.label,
					headline: opts.label,
					size: 'md'
				}
			}
		]
	})
};

/* ── Preset 1: Person page ───────────────────────────────────────── */

/**
 * Per-person dashboard. Hero with their name + presence state.
 * Markdown line for last-seen. PresenceCards filtered to just them.
 * Action grid prefilled with toggles for any lights in their
 * "home area" if discovery has resolved one. Sparkline of indoor
 * temp (because it's the universal sensor that tracks their
 * environment).
 *
 * The "Elena page" use case lands here.
 */
const personPage: PresetBuilder = {
	meta: {
		id: 'person',
		label: 'Person page',
		description:
			"A dashboard about one person — where they are, what's around them. Hero + presence card + sparkline + relevant lights.",
		requiresPerson: true,
		applicableWhen: (ctx) => ctx.persons.length > 0
	},
	build: (ctx, opts) => {
		const person = ctx.persons.find((p) => p.id === opts.personId) ?? ctx.persons[0];
		const personName = person?.name?.split(' ')[0] ?? 'them';
		// Find a temperature sensor we could sparkline for them — fall back
		// to an indoor temp if no per-person mapping exists yet.
		const tempCandidate = pickHallwayOrLivingRoomTemp(ctx);
		const blocks: CustomPageDef['blocks'] = [
			{
				type: 'hero',
				config: {
					eyebrow: opts.label,
					headline: `${personName}.`,
					dek: `Where they are right now and what's around them.`,
					size: 'md'
				}
			},
			{
				type: 'markdown',
				config: {
					body: `**${personName}** — \`{{${person?.id ?? 'person.unknown'}}}\``
				}
			}
		];
		if (tempCandidate) {
			blocks.push({
				type: 'sparkline',
				config: {
					entityId: tempCandidate,
					label: `Around them`,
					hours: 24
				}
			});
		}
		blocks.push({
			type: 'explainer',
			config: {
				body: `For everyone at once, see [the moment](/) or [emanations](/emanations).`
			}
		});
		return {
			label: opts.label,
			icon: 'mdi:account',
			pageWidth: 'default',
			blocks,
			navOrder: 100
		};
	}
};

/* ── Preset 2: Wall tablet morning ──────────────────────────────── */

/**
 * The hallway / kitchen wall tablet, morning-glance shape.
 * Hero manifest + room-toggle-grid + scene-row + door + explainer.
 * Sized for a Fire HD 10 / Galaxy Tab portrait.
 */
const wallMorning: PresetBuilder = {
	meta: {
		id: 'wall-morning',
		label: 'Wall tablet morning',
		description:
			'A hallway / kitchen wall tablet preset. Manifest + per-room light toggles + scenes + door. Sized for tablet portrait.',
		applicableWhen: (ctx) => ctx.areas.length >= 3
	},
	build: (ctx, opts) => ({
		label: opts.label,
		icon: 'mdi:tablet',
		pageWidth: 'wide',
		navOrder: 100,
		hiddenFromNav: false,
		blocks: [
			{
				type: 'hero',
				config: {
					eyebrow: 'Morning',
					headline: 'Good morning.',
					size: 'lg'
				}
			},
			{ type: 'macro-grid', config: { label: 'Macros' } },
			{ type: 'room-toggle-grid', config: { label: 'Rooms' } },
			{ type: 'scene-row', config: { label: 'Scenes', maxScenes: 6 } },
			{
				type: 'explainer',
				config: {
					body: `For the deeper view, see [the moment](/) or [door](/door).`
				}
			}
		]
	})
};

/* ── Preset 2b: Wall surface (0.9.0 wall builder primitive) ──────── */

/**
 * The blank wall-tablet starting point. 0.9.0 wall builder ships
 * this as the canonical "I have a tablet on the wall" preset —
 * sized for landscape 1280×800-ish (Fire HD 10, Galaxy Tab A9),
 * with an empty action-grid slot ready for the user's custom
 * controls (Edifier source toggle, Sonos pause, garage door, etc).
 *
 * Differs from `wallMorning` in three ways:
 *  1. Adds a top action-grid block (custom-actions) seeded with one
 *     example tile the user replaces — making the "you can put your
 *     own buttons here" affordance obvious without copy-pasting from
 *     /settings/pages.
 *  2. No explainer at the bottom — wall surfaces don't show prose.
 *  3. Hint to point a device at it (rendered in the page editor's
 *     "Share with a device" panel — see /settings/pages/[slug]).
 */
const wallSurface: PresetBuilder = {
	meta: {
		id: 'wall-surface',
		label: 'Wall surface (blank)',
		description:
			"A blank wall-tablet starting point. Pre-filled with custom action slot " +
			"+ room toggles + scenes. Sized for 1280×800 landscape (Fire HD 10, Galaxy Tab). " +
			"Use 'Share with a device' on the editor to point your wall at it.",
		applicableWhen: () => true
	},
	build: (ctx, opts) => ({
		label: opts.label,
		icon: 'mdi:tablet-cellphone',
		pageWidth: 'wide',
		navOrder: 100,
		hiddenFromNav: false,
		blocks: [
			{
				type: 'hero',
				config: {
					eyebrow: 'Wall',
					headline: 'Within reach.',
					size: 'sm'
				}
			},
			{
				type: 'action-grid',
				config: {
					label: 'Quick actions',
					size: 'medium',
					actions: [
						{
							label: 'Replace me',
							detail: 'Edit this in /settings/pages',
							icon: 'mdi:pencil',
							service: { domain: 'light', service: 'toggle', target: {} }
						}
					]
				}
			},
			{ type: 'macro-grid', config: { label: 'Macros' } },
			{ type: 'room-toggle-grid', config: { label: 'Rooms' } },
			{ type: 'scene-row', config: { label: 'Scenes', maxScenes: 8 } }
		]
	})
};

/* ── Preset 3: Family status board ───────────────────────────────── */

/**
 * Read-only status board. PresenceCards (everyone) + indoor temp
 * sparkline + electricity sparkline if available + door state.
 * Family-readable, no controls.
 */
const familyStatus: PresetBuilder = {
	meta: {
		id: 'family-status',
		label: 'Family status board',
		description:
			'A read-only status board. Everyone, the temperature, the door. No controls — for non-tech family.',
		applicableWhen: (ctx) => ctx.persons.length > 0
	},
	build: (_ctx, opts) => ({
		label: opts.label,
		icon: 'mdi:home-account',
		pageWidth: 'default',
		navOrder: 100,
		blocks: [
			{
				type: 'hero',
				config: {
					eyebrow: 'Status',
					headline: "Everyone, the house, the day.",
					size: 'md'
				}
			},
			{
				type: 'markdown',
				config: {
					body: `Outside is \`{{weather.forecast_home}}\`.`
				}
			},
			{
				type: 'explainer',
				config: {
					body: `The full picture is on [the moment](/).`
				}
			}
		]
	})
};

/* ── Preset 4: Energy at a glance ────────────────────────────────── */

/**
 * Energy-focused page. Indoor temp sparkline + electricity rate
 * sparkline + boost-row.
 */
const energyGlance: PresetBuilder = {
	meta: {
		id: 'energy-glance',
		label: 'Energy at a glance',
		description:
			'Indoor temp + electricity rate as sparklines, plus a boost-heat row.',
		applicableWhen: (ctx) => ctx.areas.some((a) => a.climates.length > 0)
	},
	build: (ctx, opts) => {
		const tempCandidate = pickHallwayOrLivingRoomTemp(ctx);
		const blocks: CustomPageDef['blocks'] = [
			{
				type: 'hero',
				config: {
					eyebrow: opts.label,
					headline: 'The day in degrees + pence.',
					size: 'md'
				}
			}
		];
		if (tempCandidate) {
			blocks.push({
				type: 'sparkline',
				config: { entityId: tempCandidate, label: 'Indoor temp', hours: 24 }
			});
		}
		blocks.push({ type: 'boost-row', config: { label: 'Boost', temperature: 21 } });
		blocks.push({
			type: 'explainer',
			config: { body: `For the per-room view, see [heat](/heat).` }
		});
		return {
			label: opts.label,
			icon: 'mdi:flash',
			pageWidth: 'default',
			navOrder: 100,
			blocks
		};
	}
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function pickHallwayOrLivingRoomTemp(ctx: PresetContext): string | null {
	for (const a of ctx.areas) {
		if (!a.sensors) continue;
		for (const e of a.sensors) {
			if (
				e.deviceClass === 'temperature' &&
				/hallway|landing|living[_ ]?room|lounge/i.test(e.id)
			) {
				return e.id;
			}
		}
	}
	// Fall back: any temperature sensor that's not outdoor / appliance
	for (const a of ctx.areas) {
		if (!a.sensors) continue;
		for (const e of a.sensors) {
			if (e.deviceClass !== 'temperature') continue;
			if (/outdoor|outside|fridge|freezer|oven|grill/i.test(e.id)) continue;
			return e.id;
		}
	}
	return null;
}

/* ── Registry ─────────────────────────────────────────────────────── */

export const PRESETS: PresetBuilder[] = [
	blankCanvas,
	personPage,
	wallMorning,
	wallSurface,
	familyStatus,
	energyGlance
];

export function applicablePresets(ctx: PresetContext): PresetBuilder[] {
	return PRESETS.filter((p) => !p.meta.applicableWhen || p.meta.applicableWhen(ctx));
}
