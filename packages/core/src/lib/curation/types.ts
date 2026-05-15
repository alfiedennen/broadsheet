/**
 * Curation schema (Layer 3) — the shape of `broadsheet.json`.
 *
 * Spec: ../../../docs/SETTINGS-SCHEMA.md
 *
 * v0.1 schema is `version: 1`. Forward-only migrations land in
 * `migrate.ts` when `version: 2` arrives.
 *
 * Types here mirror the SETTINGS-SCHEMA doc 1:1. Every override is
 * optional — empty objects + arrays are valid + mean "no overrides
 * apply, use whatever Layer 2 discovered."
 */

export type CurationVersion = 1;
export const CURRENT_CURATION_VERSION: CurationVersion = 1;

/** Per-person presence-sensor pick + device class. */
export interface PersonOverride {
	personId: string;
	presenceSensorId: string | null; // null = use heuristic default
	deviceClass: 'android' | 'ios' | 'unknown';
	displayNameOverride?: string | null;
}

/** Per-floor overrides (when HA has floors configured). */
export interface FloorOverride {
	rename?: string | null;
	iconOverride?: string | null;
	hidden?: boolean;
	navOrder?: number;
}

/** Per-area overrides (the most-used override class). */
export interface AreaOverride {
	rename?: string | null;
	iconOverride?: string | null;
	hidden?: boolean;
	pageOrder?: number;
	paintingOverride?: string | null;
}

/** Per-entity overrides (hide / unhide / rename / warning label). */
export interface EntityOverride {
	hidden?: boolean; // user-set hide
	unhide?: boolean; // explicitly show entities HA's hidden_by would have hidden
	warningLabel?: string | null;
	rename?: string | null;
	iconOverride?: string | null;
}

/**
 * Per-device overrides. Renames apply at the device-header level
 * in /settings/house; hide cascades to ALL entities under the
 * device (autoHideReason='device-hidden').
 */
export interface DeviceOverride {
	rename?: string | null;
	hidden?: boolean;
}

/** Per-label overrides (orthogonal-tag styling + behaviour). */
export interface LabelOverride {
	iconOverride?: string | null;
	colorOverride?: string | null;
	hideEntitiesByDefault?: boolean;
	pinAllToPage?: string | null;
}

/** Per-page configuration: hide, reorder, custom title. */
export interface PageOverride {
	hidden?: boolean;
	navOrder?: number;
	titleOverride?: string | null;
}

/** Painting variant pointers per area (filenames in /data/paintings/). */
export interface PaintingOverride {
	default?: string | null;
	[personSlug: string]: string | null | undefined; // alfie, elena, both, etc
}

/** Per-integration config that broadsheet's pages need. */
export interface IntegrationsConfig {
	tmdb?: {
		apiKey?: string | null;
		region?: string;
		enabledLenses?: string[];
	};
	healthConnect?: {
		platformDetected?: boolean;
		sleepStartHourUTC?: number;
		sleepEndHourUTC?: number;
	};
	appleHealth?: {
		enabled?: boolean;
	};
}

/** Per-plugin enable/disable + plugin-specific opaque config. */
export interface PluginConfig {
	enabled: boolean;
	config?: Record<string, unknown>;
}

/**
 * Custom page authored via the builder UI (Phase 2) or imported from
 * Lovelace (Phase 3). Stored as a plain JSON object — the BlockDef
 * union is JSON-serialisable so persistence is direct.
 *
 * The full type lives in $lib/blocks/types — this file imports it
 * via `type` only to keep curation/types.ts free of runtime deps.
 */
export type { CustomPageDef } from '$lib/blocks/types';
import type { CustomPageDef as _CustomPageDef } from '$lib/blocks/types';

/**
 * Sensor picks that drive the moment-view manifest clauses. Each is
 * optional — if unset, `/+page.svelte` falls back to auto-discovery
 * (first matching entity). Curation override exists so installs with
 * multiple temp sensors / multiple electricity tariffs can pin the one
 * that matters. Settings UI surfaces these in /settings/house.
 */
export interface MomentSensorsConfig {
	/** Indoor temp clause source ("Hallway 17°C."). */
	primaryIndoorTempSensorId?: string | null;
	/** Electricity rate clause source ("Electricity cheap at 8p."). */
	primaryElectricityRateSensorId?: string | null;
}

/** The top-level shape of broadsheet.json v1. */
export interface Curation {
	version: CurationVersion;
	createdAt: string; // ISO
	lastModifiedAt: string; // ISO

	people: PersonOverride[];
	floors: Record<string, FloorOverride>; // keyed by floor_id
	areas: Record<string, AreaOverride>; // keyed by area_id
	devices: Record<string, DeviceOverride>; // keyed by device_id
	entities: Record<string, EntityOverride>; // keyed by entity_id
	labels: Record<string, LabelOverride>; // keyed by label_id
	pagePins: Record<string, string | null>; // entity_id → page slug
	pages: Record<string, PageOverride>; // keyed by page slug
	voice: Record<string, string>; // string id → override text
	paintings: Record<string, PaintingOverride>; // keyed by area_id
	momentSensors: MomentSensorsConfig;
	customPages: _CustomPageDef[]; // ordered — kebab nav respects array order
	integrations: IntegrationsConfig;
	plugins: Record<string, PluginConfig>;
}

/** Default curation for fresh installs (no overrides). */
export function defaultCuration(): Curation {
	const now = new Date().toISOString();
	return {
		version: CURRENT_CURATION_VERSION,
		createdAt: now,
		lastModifiedAt: now,
		people: [],
		floors: {},
		areas: {},
		devices: {},
		entities: {},
		labels: {},
		pagePins: {},
		pages: {},
		voice: {},
		paintings: {},
		momentSensors: {
			primaryIndoorTempSensorId: null,
			primaryElectricityRateSensorId: null
		},
		customPages: [],
		integrations: {
			tmdb: { apiKey: null, region: 'GB', enabledLenses: ['new', 'trending'] },
			healthConnect: { platformDetected: false, sleepStartHourUTC: 21, sleepEndHourUTC: 9 },
			appleHealth: { enabled: false }
		},
		plugins: {
			emanations: { enabled: false, config: {} },
			'ghost-cloud': { enabled: false, config: {} },
			'tmdb-tv': { enabled: false, config: {} }
		}
	};
}
