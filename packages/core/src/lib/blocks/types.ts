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

/* ── The discriminated union ──────────────────────────────────── */

/**
 * One block, fully serialised. The `type` discriminator selects the
 * config shape AND the registered renderer. Add a new block type by
 * adding a member here AND an entry in the registry.
 */
export type BlockDef =
	| { type: 'hero'; config: HeroBlockConfig }
	| { type: 'markdown'; config: MarkdownBlockConfig }
	| { type: 'explainer'; config: ExplainerBlockConfig };

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
	}
}
