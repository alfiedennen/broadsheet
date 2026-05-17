/**
 * Block renderer registry.
 *
 * Maps each `BlockType` to a lazy thunk for its renderer component.
 * RenderedPage looks blocks up here at render time + suspends on
 * the dynamic import — same pattern as the plugin renderer registry,
 * so editors / authors get fast-loading customised pages without
 * shipping every block's CSS to every install.
 *
 * Two tiers of lookup as of 0.9.3:
 *   - CORE_REGISTRY: the static map of core-shipped block types
 *   - pluginLoader.activePluginBlocks: block types contributed by
 *     active plugins (via `extraBlocks` on the plugin contract)
 *
 * `blockRenderer(type)` checks core first, falls through to plugin
 * blocks. Plugin block types are colon-prefixed (`tmdb-tv:rows`) so
 * they can never collide with core types.
 *
 * Adding a CORE block type:
 *   1. Add the variant to `BlockDef` in ./types.ts
 *   2. Write the renderer (a Svelte component that takes
 *      `{ config }` props matching the block's config shape)
 *   3. Add a thunk here keyed by the block's `type`
 *   4. (Phase 2) Register an editor stub for the builder UI
 *
 * Adding a PLUGIN block type: declare it on the plugin's
 * `extraBlocks` array — no edits to this file required.
 */

import type { Component } from 'svelte';
import type { BlockType } from './types';
import { pluginLoader } from '$lib/plugins/loader.svelte';

/**
 * A lazy thunk returning a Svelte component module — same shape the
 * plugin renderer registry uses. Renderers receive `{ config }` as
 * their sole prop; the prop type is the block-type-specific config.
 */
export type BlockRendererThunk = () => Promise<{ default: Component<{ config: never }> }>;

const CORE_REGISTRY: Record<BlockType, BlockRendererThunk> = {
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
		import('./renderers/MacroBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	'area-lights-panel': () =>
		import(
			'./renderers/AreaLightsPanelBlockRenderer.svelte'
		) as unknown as ReturnType<BlockRendererThunk>,
	'area-climate-panel': () =>
		import(
			'./renderers/AreaClimatePanelBlockRenderer.svelte'
		) as unknown as ReturnType<BlockRendererThunk>,
	'area-media-panel': () =>
		import(
			'./renderers/AreaMediaPanelBlockRenderer.svelte'
		) as unknown as ReturnType<BlockRendererThunk>,
	row: () =>
		import('./renderers/RowBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>,
	grid: () =>
		import('./renderers/GridBlockRenderer.svelte') as unknown as ReturnType<BlockRendererThunk>
};

/**
 * Look up a renderer thunk for a block type. Checks core first,
 * falls through to plugin-contributed block types from active
 * plugins. Throws if nothing matches — surface this as a "missing
 * renderer" message in the page renderer rather than crashing the
 * page; an unknown type usually means a plugin was disabled after
 * authoring a page that used its blocks.
 */
export function blockRenderer(type: string): BlockRendererThunk {
	const core = (CORE_REGISTRY as Record<string, BlockRendererThunk>)[type];
	if (core) return core;
	const plugin = pluginLoader.pluginBlockByType(type);
	if (plugin) return plugin.renderer as BlockRendererThunk;
	throw new Error(`No renderer registered for block type "${type}"`);
}

/** Every CORE registered block type — for the legacy builder picker. */
export const ALL_BLOCK_TYPES: BlockType[] = Object.keys(CORE_REGISTRY) as BlockType[];

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
	},
	'area-lights-panel': {
		label: 'Lights panel (per area)',
		description:
			'0.9.3 composite — one block, takes an areaId, renders one toggle per light in that area at render-time. Grows + shrinks with discovery (add a new light to the area → it appears in the panel).'
	},
	'area-climate-panel': {
		label: 'Heating panel (per area)',
		description:
			'0.9.3 composite — one block, takes an areaId, renders one climate tile per TRV in that area at render-time. Tap-expand for setpoint slider.'
	},
	'area-media-panel': {
		label: 'Media panel (per area)',
		description:
			'0.9.3 composite — one block, takes an areaId, renders TV remote(s) + speaker(s) together with the right widget per device. Single drop, single remove.'
	},
	row: {
		label: 'Row (horizontal layout)',
		description:
			'0.9.4 layout container — places its child blocks side-by-side in a horizontal row. Stacks back to a column on narrow viewports. Use for two-up tiles.'
	},
	grid: {
		label: 'Grid (N-column layout)',
		description:
			'0.9.4 layout container — places its child blocks in a CSS grid with N columns (default 12, matching Lovelace). Children use `colSpan` to span multiple columns. Lovelace `sections` views land here.'
	}
};
