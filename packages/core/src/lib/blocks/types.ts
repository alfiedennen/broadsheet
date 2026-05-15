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
	size?: 'md' | 'lg' | 'xl';
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

/**
 * One block, fully serialised. The `type` discriminator selects the
 * config shape AND the registered renderer. Add a new block type by
 * adding a member here AND an entry in the registry.
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
	| { type: 'action-grid'; config: ActionGridBlockConfig };

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
}

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
	}
}
