/**
 * Block contract — the typed primitives that compose a custom page.
 *
 * A "block" is one of broadsheet's editorial primitives (hero,
 * action-grid, room-tile-grid, etc) with a typed config schema. A
 * page is an ordered list of blocks; the renderer dispatches each
 * to its registered component.
 *
 * Design echoes the BroadsheetPlugin contract: tagged-union config
 * shape, renderer thunks held lazy in a registry, importer +
 * builder UI both produce the same `BlockDef` instances. That means:
 *   - Adding a new block type is one entry in three places (this
 *     union, the registry, an editor stub for Phase 2).
 *   - Storage shape (in curation.customPages) is the union itself
 *     — JSON-serialisable, version-tolerant via discriminated union
 *     defaults.
 *   - Lovelace importer (Phase 3) emits the same instances; the
 *     builder UI (Phase 2) edits them in place.
 *
 * Keep this file ZERO-IMPORT (no Svelte, no $lib runtime) — the
 * types are consumed by curation persistence, the schema validator,
 * the importer, and the builder UI alike. Renderers are lazy-loaded
 * via the registry.
 */

/* ── Block-specific config shapes ─────────────────────────────── */

/** Hero block: eyebrow + headline + dek. The "page-opening" composition. */
export interface HeroBlockConfig {
	/** Section label shown above the headline (e.g. "the moment"). */
	eyebrow?: string | null;
	/** Number after the eyebrow ("№ 03"). Optional. */
	number?: number | null;
	/** Italic display headline. Required. Markdown is NOT processed. */
	headline: string;
	/** Optional muted sub-headline. Accepts plain text. */
	dek?: string | null;
	/** Hero size bucket — matches the existing Hero component. */
	size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Markdown block: prose paragraphs with optional `{{entity_id}}`
 * substitutions. Resolved at render time against discoveryStore.states.
 * Substitutions that don't resolve render as literal `{{entity_id}}`
 * so authors notice typos.
 *
 * Editorial register: rendered with the body font + leading-snug.
 * The renderer escapes HTML-unsafe input then runs a small markdown
 * pass (paragraphs, **bold**, *italic*, `code`, [text](href)) — NOT
 * a full CommonMark engine. Anything more involved is a sign the
 * page wants a different primitive.
 */
export interface MarkdownBlockConfig {
	body: string;
}

/**
 * Explainer block: the italic-muted cross-page link mesh. A list of
 * link segments; the renderer joins them with prose connectives
 * ("and", ",") into a single sentence.
 *
 * For v0.2 the config is just a single body string with the same
 * `[text](href)` syntax as MarkdownBlockConfig — keeps it simple.
 * Authors who want fancy multi-link composition use markdown blocks.
 */
export interface ExplainerBlockConfig {
	body: string;
}

/**
 * Outline block: the small caps label that divides sections.
 *
 *   ──────────  MACROS  ──────────
 *
 * Config is just the label. Used as a standalone block when the next
 * block doesn't have its own label config (e.g. above a markdown
 * block). Most action-y blocks also accept an inline `label` config
 * field that renders an outline above them — cuts down on author
 * boilerplate for the common case.
 */
export interface OutlineBlockConfig {
	label: string;
}

/**
 * Macro grid: three fixed action tiles for the most-used house-wide
 * macros — All lights off / Boost heat / All TVs off. Discovers
 * targets at render time (every light, every climate area, every TV)
 * so authors don't have to enumerate them.
 *
 * Config is currently empty — the macros are hardcoded into the
 * renderer because they're the universal three. If a user wants
 * different macros they use action-grid (Phase 1 commit 3) with
 * custom service-call specs.
 */
export interface MacroGridBlockConfig {
	/** Optional inline section label rendered as an OutLine above the grid. */
	label?: string | null;
}

/**
 * Room toggle grid: one tile per discovered lighting area, tap to
 * toggle every light in that room. Auto-discovers from
 * `discovery.areasForPage('lights')` so the grid grows + shrinks
 * with HA's area registry.
 */
export interface RoomToggleGridBlockConfig {
	label?: string | null;
}

/**
 * Scene row: pill row of every discovered scene (capped at 8 by
 * default to keep the row under one line on a tablet). Tap →
 * scene.turn_on.
 */
export interface SceneRowBlockConfig {
	label?: string | null;
	/** Cap on number of scenes shown. Default 8. */
	maxScenes?: number;
}

/**
 * Boost row: per-climate-area "set to N°" tile. Tap →
 * climate.set_temperature on every climate entity in that area.
 */
export interface BoostRowBlockConfig {
	label?: string | null;
	/** Target temperature for the boost. Default 21. */
	temperature?: number;
}

/**
 * Service-call spec — what an action tile fires when tapped. Plain-
 * shape JSON so the importer + builder UI can both produce it from
 * a Lovelace tap_action / service / entity hint.
 */
export interface ActionServiceCall {
	domain: string;
	service: string;
	data?: Record<string, unknown>;
	target?: { entity_id?: string | string[]; area_id?: string | string[] };
}

/** One tile in an ActionGrid. */
export interface ActionGridItem {
	label: string;
	/** Optional sub-label, shown small + accent ("→ 21°", "playing", etc). */
	detail?: string | null;
	/** mdi:* icon name (chip-rendered, no SVG dependency). */
	icon?: string | null;
	/** What firing the tile does. */
	service: ActionServiceCall;
	/**
	 * If set, the tile reflects this entity's live state — highlights
	 * when state is in `activeStates` (default ['on', 'playing',
	 * 'home']). Used for light toggles, media toggles, etc so the
	 * tile shows whether the underlying thing is currently ON.
	 */
	stateBinding?: {
		entityId: string;
		activeStates?: string[];
	};
}

/**
 * Action grid: a flexible grid of action tiles. Each tile fires a
 * service call when tapped, optionally reflecting an entity's live
 * state. Lovelace landing zone for `button`, `light`, mushroom-light,
 * mushroom-chips, and similar action-shaped cards.
 *
 * Different from macro-grid (which is a fixed 3-tile house-wide
 * macro set) — action-grid is variable-length + per-tile-configured.
 */
export interface ActionGridBlockConfig {
	label?: string | null;
	/** Tile size affects min-height + label size. Default 'medium'. */
	size?: 'small' | 'medium' | 'large';
	actions: ActionGridItem[];
}

/**
 * Sparkline: inline SVG chart of one entity's recent history,
 * pulled lazily via HA's `history/history_during_period` WS API.
 *
 * The first historical-data primitive in broadsheet — every other
 * primitive renders from the live state snapshot. Sparkline opens
 * the door to chart-shaped imports (mini-graph-card, sensor card,
 * apexcharts-card etc) that previously dropped their history.
 *
 * Editorial register: thin warm-rule line, no axes, no grid, no
 * tooltips. The current value (live, from discoveryStore.states)
 * sits prominent next to the chart. The point IS the trend, not
 * the precise readout.
 *
 * Performance: each sparkline holds a one-shot subscription that
 * fires on mount (and when entityId or hours changes). No polling
 * — the chart is "history as of when you opened the page". Live
 * value updates via the discoveryStore subscription as normal.
 */
export interface SparklineBlockConfig {
	/** Required: entity_id whose history is charted. */
	entityId: string;
	/** Optional label rendered above the chart. */
	label?: string | null;
	/** How far back to plot. Default 24 hours. */
	hours?: number;
	/**
	 * Optional unit override for display. Falls back to the entity's
	 * `unit_of_measurement` attribute when absent.
	 */
	unit?: string | null;
}

/**
 * Entity list: a vertical list of entities with name + state. The
 * Lovelace-importer landing zone for `entities` cards. Each row
 * resolves the entity at render time so state stays live.
 *
 * Editorial register: italic display names + tabular-num states +
 * separating rules between rows. NOT trying to be a control panel;
 * if the user wants buttons, that's action-grid (Phase 1 commit 3).
 */
export interface EntityListBlockConfig {
	label?: string | null;
	/** Ordered list of entity_ids to display. */
	entities: string[];
	/** When true (default), prefix each row with the entity's icon. */
	showIcon?: boolean;
	/**
	 * Override display name for an entity. Keys are entity_ids; values
	 * are the friendly label. Falls back to the entity's friendly_name
	 * attribute when absent.
	 */
	nameOverrides?: Record<string, string>;
}

/* ── The discriminated union ──────────────────────────────────── */

/* ── 0.9.1 things-first primitives ───────────────────────────────── */

/**
 * One of the named widgets the `thing` block renders. broadsheet
 * picks the default automatically from the entity's domain via the
 * mapping in `$lib/blocks/thing-mapping.ts`; the user can override
 * per-thing via `widget` (rare — when they want a light as a
 * scene-trigger or a sensor as a tile rather than a pill).
 */
export type ThingWidget =
	| 'toggle'         // light, switch, input_boolean
	| 'fire'           // scene, script (one-shot tap-to-fire)
	| 'climate'        // climate (current + setpoint + slider on tap-expand)
	| 'lock'           // lock (state + unlock-on-tap)
	| 'cover'          // cover (open/close)
	| 'media-tv'       // media_player with TV device_class
	| 'media-speaker'  // media_player others (play/pause + source-toggle)
	| 'camera'         // camera, image (snapshot tile)
	| 'state-pill'     // binary_sensor (read-only state)
	| 'value-pill'     // sensor (read-only value)
	| 'pick'           // input_select (dropdown picker)
	| 'auto';          // let broadsheet pick — the default

/**
 * 0.9.1 — the things-first primitive. Wraps one HA entity_id; the
 * renderer reads the entity's domain at render time and dispatches
 * to the right widget. ONE block per thing the user placed on the
 * wall canvas. This is the workhorse for things-first authoring.
 *
 * The user never names a service domain or a widget type — they
 * pick a thing from the browser, broadsheet picks the widget.
 * `widget: 'auto'` (the default) defers to thing-mapping.ts;
 * override only when the user explicitly picks a non-default.
 */
export interface ThingBlockConfig {
	/** The HA entity_id this thing wraps. e.g. `light.kitchen_pendant`. */
	entityId: string;
	/**
	 * Per-thing label override. When unset, the renderer reads
	 * `friendly_name` from the entity at render time + the
	 * curation rename if set. Override here only when the user wants
	 * a tile labelled differently on this specific wall surface.
	 */
	label?: string | null;
	/**
	 * Per-thing icon override (mdi:*). When unset, the renderer
	 * reads `icon` from the entity. Override only when the user
	 * wants a tile glyph different from the entity's HA icon.
	 */
	icon?: string | null;
	/**
	 * Widget pick. 'auto' (default) → broadsheet picks from the
	 * domain→widget map. Any other value → the user explicitly
	 * overrode the default for this tile.
	 */
	widget?: ThingWidget;
}

/**
 * One step in a composed macro — a service call + a human-readable
 * description (which the macro composer fills in automatically based
 * on the picked thing + action). Same shape as ActionServiceCall plus
 * a description for the composer's preview.
 */
export interface MacroStep {
	/** Human description ("Turn off Hallway Lights", "Fire scene.movie"). */
	description: string;
	/** The actual service call to fire. */
	service: ActionServiceCall;
}

/**
 * 0.9.1 — composed macro tile. A user-defined house-wide action
 * built in the in-editor macro composer (pick a thing → pick an
 * action → repeat → save). Renders as a single tile on the canvas;
 * tap fires every step in order.
 *
 * Distinct from the existing 'macro-grid' (which is broadsheet's
 * hardcoded 3-tile All-lights-off / Boost-heat / TVs-off set).
 * Things-first pages don't use macro-grid; they use one or more
 * `macro` blocks composed by the user.
 */
export interface MacroBlockConfig {
	/** Tile label ("Cinema mode", "Goodnight", "Movie night"). */
	label: string;
	/** Optional sub-label ("→ 3 actions"). */
	detail?: string | null;
	/** mdi:* icon for the tile glyph. */
	icon?: string | null;
	/** Ordered list of steps to fire on tap. */
	steps: MacroStep[];
}

/* ── BlockDef discriminated union ────────────────────────────────── */

/**
 * One block, fully serialised. The `type` discriminator selects the
 * config shape AND the registered renderer. Add a new block type by
 * adding a member here AND an entry in the registry.
 *
 * 0.9.1 added `thing` and `macro` as the things-first authoring
 * primitives; the existing block types remain for backwards-compat
 * with previously-authored pages + the Lovelace importer.
 */
export type BlockDef =
	| { type: 'hero'; config: HeroBlockConfig }
	| { type: 'markdown'; config: MarkdownBlockConfig }
	| { type: 'explainer'; config: ExplainerBlockConfig }
	| { type: 'outline'; config: OutlineBlockConfig }
	| { type: 'macro-grid'; config: MacroGridBlockConfig }
	| { type: 'room-toggle-grid'; config: RoomToggleGridBlockConfig }
	| { type: 'scene-row'; config: SceneRowBlockConfig }
	| { type: 'boost-row'; config: BoostRowBlockConfig }
	| { type: 'entity-list'; config: EntityListBlockConfig }
	| { type: 'action-grid'; config: ActionGridBlockConfig }
	| { type: 'sparkline'; config: SparklineBlockConfig }
	| { type: 'thing'; config: ThingBlockConfig }
	| { type: 'macro'; config: MacroBlockConfig };

/** Just the type discriminator — useful for builder UI listings. */
export type BlockType = BlockDef['type'];

/* ── Custom page contract ──────────────────────────────────────── */

/**
 * A custom page authored either by the builder UI (Phase 2) or
 * imported from Lovelace (Phase 3). Stored in curation.customPages
 * keyed by slug.
 *
 * Contract guarantees:
 *   - `slug` follows the same rules as plugin page slugs (lowercase,
 *     hyphens allowed, must not collide with reserved core routes
 *     OR active plugin pages — checked at route resolution time).
 *   - `pageWidth` mirrors PageShell's width prop.
 *   - `navOrder` slots the page into the kebab nav. Custom pages
 *     conventionally use 100+ to sit after core (0–40) and plugin
 *     pages (50–99).
 *   - `blocks` renders in array order, no nesting (v0.2). Future
 *     shapes (columns, rows) would need a different schema.
 */
export interface CustomPageDef {
	slug: string;
	label: string;
	icon?: string | null;
	navOrder?: number;
	hiddenFromNav?: boolean;
	pageWidth?: 'narrow' | 'default' | 'wide';
	blocks: BlockDef[];
	/**
	 * 0.9.1: which editor surface to use when this page is opened
	 * for editing.
	 *  - 'things-first' — the new browser+canvas surface (default
	 *     for new pages). User browses controllable entities + taps
	 *     or drags them onto the canvas; broadsheet picks the widget.
	 *  - 'advanced' — the legacy block-by-block picker + per-block
	 *     config forms. Default for pre-0.9.1 pages (backwards-compat).
	 *  - undefined — treat as 'advanced' so pages from before this
	 *     field existed keep their familiar editor surface.
	 * Each page's mode is persisted independently; the user can flip
	 * either way in page meta.
	 */
	editorMode?: 'things-first' | 'advanced';
	/**
	 * 0.9.0 wall builder: optional target dimensions for a wall surface.
	 * Used by the page editor's "Share with a device" panel to suggest
	 * a sensible Fully Kiosk Browser config + by the editor's preview
	 * pane to frame the layout at the target size. Doesn't constrain
	 * the page render itself — the page lays out responsively whatever
	 * device it's actually opened on.
	 */
	surface?: {
		/** Target wall device width in CSS px (landscape orientation). */
		width: number;
		/** Target height in CSS px. */
		height: number;
		/** Human label — e.g. "Fire HD 10", "Galaxy Tab A9", "Custom". */
		label?: string;
	};
}

/**
 * 0.9.0: known wall-surface device presets the editor offers in the
 * "Share with a device" dropdown. Width/height are landscape pixel
 * dimensions matching native CSS viewport (after device-pixel-ratio
 * scaling). Adding a new one is mechanical — drop the entry.
 */
export const WALL_SURFACE_PRESETS = [
	{ label: 'Fire HD 10', width: 1280, height: 800 },
	{ label: 'Fire HD 8', width: 1280, height: 800 },
	{ label: 'Galaxy Tab A9 / A9+', width: 1340, height: 800 },
	{ label: 'Galaxy Tab S6 / S7', width: 1600, height: 1000 },
	{ label: 'iPad 10.2"', width: 1080, height: 810 },
	{ label: 'iPad Pro 11"', width: 1668, height: 1124 },
	{ label: 'Pixel Tablet', width: 2560, height: 1600 },
	{ label: 'Generic 7" tablet', width: 1024, height: 600 },
	{ label: 'Generic phone landscape', width: 800, height: 480 }
] as const;

/**
 * Default-config factory for a fresh block of `type` — used by the
 * builder UI when adding a new block. Produces a config object that
 * passes the type's "valid" check (e.g. a hero with a placeholder
 * headline, not an empty string).
 */
export function defaultBlockConfig(type: BlockType): BlockDef {
	switch (type) {
		case 'hero':
			return {
				type: 'hero',
				config: {
					eyebrow: 'New section',
					headline: 'A new hero.',
					size: 'md'
				}
			};
		case 'markdown':
			return {
				type: 'markdown',
				config: {
					body: 'A paragraph of prose. Use `{{entity_id}}` to interpolate live state.'
				}
			};
		case 'explainer':
			return {
				type: 'explainer',
				config: {
					body: 'For more, see [the moment](/) or [settings](/settings).'
				}
			};
		case 'outline':
			return { type: 'outline', config: { label: 'Section' } };
		case 'macro-grid':
			return { type: 'macro-grid', config: { label: 'Macros' } };
		case 'room-toggle-grid':
			return { type: 'room-toggle-grid', config: { label: 'Rooms' } };
		case 'scene-row':
			return { type: 'scene-row', config: { label: 'Scenes', maxScenes: 8 } };
		case 'boost-row':
			return { type: 'boost-row', config: { label: 'Boost', temperature: 21 } };
		case 'entity-list':
			return {
				type: 'entity-list',
				config: { label: null, entities: [], showIcon: true }
			};
		case 'action-grid':
			return {
				type: 'action-grid',
				config: { label: null, size: 'medium', actions: [] }
			};
		case 'sparkline':
			return {
				type: 'sparkline',
				config: { entityId: '', label: null, hours: 24 }
			};
		case 'thing':
			return {
				type: 'thing',
				config: { entityId: '', widget: 'auto' }
			};
		case 'macro':
			return {
				type: 'macro',
				config: { label: 'New macro', steps: [] }
			};
	}
}
