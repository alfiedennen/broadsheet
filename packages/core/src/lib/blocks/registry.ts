/**
 * Block renderer registry.
 *
 * Maps each `BlockType` to a lazy thunk for its renderer component.
 * RenderedPage looks blocks up here at render time + suspends on
 * the dynamic import — same pattern as the plugin renderer registry,
 * so editors / authors get fast-loading customised pages without
 * shipping every block's CSS to every install.
 *
 * Adding a block type:
 *   1. Add the variant to `BlockDef` in ./types.ts
 *   2. Write the renderer (a Svelte component that takes
 *      `{ config }` props matching the block's config shape)
 *   3. Add a thunk here keyed by the block's `type`
 *   4. (Phase 2) Register an editor stub for the builder UI
 */

import type { Component } from 'svelte';
import type { BlockType } from './types';

/**
 * A lazy thunk returning a Svelte component module — same shape the
 * plugin renderer registry uses. Renderers receive `{ config }` as
 * their sole prop; the prop type is the block-type-specific config.
 */
export type BlockRendererThunk = () => Promise<{ default: Component<{ config: never }> }>;

const REGISTRY: Record<BlockType, BlockRendererThunk> = {
	hero: () =>
		import('./renderers/HeroBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	markdown: () =>
		import('./renderers/MarkdownBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	explainer: () =>
		import('./renderers/ExplainerBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	outline: () =>
		import('./renderers/OutlineBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'macro-grid': () =>
		import('./renderers/MacroGridBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'room-toggle-grid': () =>
		import('./renderers/RoomToggleGridBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'scene-row': () =>
		import('./renderers/SceneRowBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'boost-row': () =>
		import('./renderers/BoostRowBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'entity-list': () =>
		import('./renderers/EntityListBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'action-grid': () =>
		import('./renderers/ActionGridBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	sparkline: () =>
		import('./renderers/SparklineBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	thing: () =>
		import('./renderers/ThingBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	macro: () =>
		import('./renderers/MacroBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>
};

/** Look up a renderer thunk for a block type. Throws on unknown type. */
export function blockRenderer(type: BlockType): BlockRendererThunk {
	const thunk = REGISTRY[type];
	if (!thunk) {
		throw new Error(`No renderer registered for block type "${type}"`);
	}
	return thunk;
}

/** Every registered block type — for builder UI listings. */
export const ALL_BLOCK_TYPES: BlockType[] = Object.keys(REGISTRY) as BlockType[];

/**
 * Human-readable label + short description for each block type.
 * Powers the "+ Add block" picker in the Phase 2 builder. Kept here
 * (not on the renderer) so the picker doesn't have to load every
 * renderer chunk just to render a list of options.
 */
export const BLOCK_META: Record<BlockType, { label: string; description: string }> = {
	hero: {
		label: 'Hero',
		description: 'Eyebrow + italic headline + dek. Page-opening composition.'
	},
	markdown: {
		label: 'Markdown',
		description:
			'Full markdown — headings, lists, tables, emphasis, links — with `{{entity_id}}` and Jinja substitutions resolved at render time.'
	},
	explainer: {
		label: 'Explainer',
		description: 'Italic-muted footer paragraph with cross-page links.'
	},
	outline: {
		label: 'Outline',
		description: 'Caps-and-rule section divider. Use to visually separate sections.'
	},
	'macro-grid': {
		label: 'Macro grid',
		description:
			'Three big tiles: All lights off · Boost heat · TVs off. Discovers targets.'
	},
	'room-toggle-grid': {
		label: 'Room toggle grid',
		description:
			'One tile per discovered lighting area, tap to toggle every light in that room.'
	},
	'scene-row': {
		label: 'Scene row',
		description: 'Pill row of every discovered scene, tap to activate.'
	},
	'boost-row': {
		label: 'Boost row',
		description: 'Per-climate-area "boost to N°" tile, tap to set temperature.'
	},
	'entity-list': {
		label: 'Entity list',
		description: 'Vertical list of entities with name + live state. The Lovelace `entities` card landing zone.'
	},
	'action-grid': {
		label: 'Action grid',
		description:
			'Configurable grid of action tiles, each firing a service call. Optionally state-bound to highlight when active. Lovelace landing zone for `button`, `light`, mushroom-chips, and similar.'
	},
	sparkline: {
		label: 'Sparkline',
		description:
			'Inline SVG chart of one entity’s recent history pulled from HA. The first historical-data primitive — mini-graph-card / sensor / apexcharts importer landing zone.'
	},
	thing: {
		label: 'Thing',
		description:
			'0.9.1 things-first primitive — wraps one HA entity, picks the right widget (toggle / scene / climate / lock / camera / etc.) from the domain. The workhorse of things-first authoring.'
	},
	macro: {
		label: 'Macro',
		description:
			'0.9.1 composed macro tile — fires N service calls in order when tapped. Built in the macro composer; distinct from the legacy macro-grid block.'
	}
};
