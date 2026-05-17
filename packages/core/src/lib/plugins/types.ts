/**
 * The broadsheet plugin contract.
 *
 * Spec: ../../../docs/RENDERER-CONTRACT.md
 *
 * ─────────────────────────────────────────────────────────────────
 * FROZEN at v0.1. This is a public commitment: within semver-minor
 * releases of `@broadsheet/core`, no field here is removed and no
 * NEW REQUIRED field is added. New capabilities arrive only as new
 * OPTIONAL fields. Breaking changes wait for a major bump and a
 * CHANGELOG entry.
 * ─────────────────────────────────────────────────────────────────
 *
 * A plugin package's `src/index.ts` exports `const plugin:
 * BroadsheetPlugin`. Two hard rules on that module:
 *
 *  1. NO side effects at module-eval time. It exports a plain object.
 *  2. It may `import type` from `@broadsheet/core` but must NEVER do a
 *     runtime import of core. core imports the plugin (registry.ts);
 *     a runtime back-import would create an execution cycle. Type
 *     imports are erased at compile, so `import type` is safe.
 *
 * Heavy code (page components, renderers, settings panels) lives
 * behind `LazyComponent` thunks so Vite code-splits it into its own
 * chunk — fetched only when the plugin is actually active.
 */

import type { Component } from 'svelte';
import type { DomainArea, DomainEntity, DomainFloor, DomainPerson } from '$lib/discovery';

/**
 * A lazily-imported Svelte component. The registry is heterogeneous —
 * every plugin's components have different (or no) props — and
 * `Component<Props>` is contravariant in `Props`, so no concrete
 * props type accepts *every* component. `Component<any>` is the
 * deliberate escape hatch: it accepts any component shape. Concrete
 * prop typing happens where a component is actually rendered.
 */
export type LazyComponent = () => Promise<{ default: Component<any> }>;

/**
 * The discovery snapshot a plugin sees — a read-only subset of core's
 * `discovery` façade. Plugins never reach into core internals
 * (`discoveryStore`, the WebSocket connection, the curation store);
 * they get this snapshot and nothing else.
 */
export interface PluginDiscoverySnapshot {
	floors: DomainFloor[];
	areas: DomainArea[];
	persons: DomainPerson[];
}

/**
 * A page a plugin contributes. Each registered page gets a top-level
 * route at `/<slug>` via core's `[pluginSlug]` catch-all.
 */
export interface PluginPage {
	/**
	 * URL slug — also the nav key. Lowercase, hyphens allowed. Must be
	 * unique across all plugins AND must not collide with a reserved
	 * core route (see RESERVED_ROUTE_SLUGS). The loader rejects
	 * colliding slugs with a `load-error` status.
	 */
	slug: string;
	/** Nav label. */
	label: string;
	/** `mdi:*` icon id for the nav entry. */
	icon: string;
	/**
	 * Sort key in the kebab nav. Core pages occupy 0–40; plugin pages
	 * conventionally use 50+.
	 */
	navOrder: number;
	/**
	 * Visibility predicate. When it returns false the page is still
	 * registered but hidden from nav and 404s on direct navigation —
	 * and `/settings/plugins` shows the plugin as `enabled-inactive`
	 * with the reason. Omit to mean "always visible when enabled".
	 */
	visibleWhen?: (discovery: PluginDiscoverySnapshot) => boolean;
	/**
	 * When true, the route stays live (and the page stays "active" for
	 * /settings/plugins purposes) but the page does NOT appear in the
	 * kebab nav. Use for plugin pages whose content has migrated to a
	 * core page (e.g. /emanations imagery now also rendering on `/`),
	 * keeping permalinks valid while removing the redundant nav entry.
	 * Defaults to false.
	 */
	hiddenFromNav?: boolean;
	/** The page component. Lazy — code-split, fetched on first nav. */
	component: LazyComponent;
}

/**
 * Renderers a plugin exposes for other pages (core or plugin) to use
 * opportunistically via `useRenderer(id)`. Keys are kebab-case +
 * descriptive (`multi-person-painting`, `radar-time-tube`).
 */
export type PluginRenderers = Record<string, LazyComponent>;

/** A settings panel, shown at `/settings/plugins/<plugin-id>/config`. */
export interface PluginSettingsPanel {
	label: string;
	icon: string;
	component: LazyComponent;
}

/**
 * The sandbox a `DiscoveryContributor` runs inside. It gets a
 * same-origin-only `fetch` and a read-only discovery snapshot. It
 * CANNOT touch the WebSocket connection and CANNOT write curation.
 */
export interface DiscoveryContributorContext {
	discovery: PluginDiscoverySnapshot;
	/**
	 * Same-origin fetch only — cross-origin requests reject. Paths are
	 * resolved against broadsheet's own origin (so ingress-prefixed
	 * correctly). Use this to read files HA serves under `/local/…`
	 * or `/api/…`.
	 */
	fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

/**
 * A discovery contributor augments the core domain model with data
 * the core doesn't read (e.g. ghost-cloud reads radar JSON files).
 * It runs at boot and on registry updates; its return value is
 * merged into `discovery.plugins[<plugin-id>]`.
 *
 * Contributors must handle missing data gracefully — a thrown error
 * or rejected promise yields an empty contribution + flags the
 * plugin `errored` in `/settings/plugins`, but never crashes core.
 */
export interface DiscoveryContributor {
	id: string;
	contribute: (ctx: DiscoveryContributorContext) => Promise<Record<string, unknown>>;
}

/** Context passed to the `onActivate` lifecycle hook. */
export interface PluginActivationContext {
	discovery: PluginDiscoverySnapshot;
	/** This plugin's slice of curation: `broadsheet.json → plugins.<id>.config`. */
	config: Record<string, unknown>;
}

/**
 * Where a plugin recipe lands in the things-first browser.
 *
 *  - `area` + a known per-area sub-group key → the recipe shows
 *     INSIDE that area's matching sub-group ("Living Room → TV").
 *     The recipe placement engine reads the area's bucket arrays
 *     (lights / tvs / media / climate / switches / locks / cameras /
 *     sensors) for membership counts.
 *  - `cross-area` + a bucket key → the recipe shows in one of the
 *     cross-area buckets at the bottom of the browser. `components`
 *     is the bucket reserved for plugin-contributed recipes that
 *     don't fit elsewhere.
 */
export type PluginRecipePlacement =
	| {
			kind: 'area';
			areaId: string;
			subGroup:
				| 'lights'
				| 'tvs'
				| 'media'
				| 'climate'
				| 'switches'
				| 'locks'
				| 'cameras'
				| 'sensors';
	  }
	| {
			kind: 'cross-area';
			bucket: 'scenes' | 'scripts' | 'automations' | 'status' | 'other' | 'components';
	  };

/**
 * A recipe a plugin suggests for the things-first browser. The
 * shape mirrors `AccomplishmentRecipe` in `$lib/blocks/things-browser`
 * but is decoupled from BlockDef — the browser's recipe walker
 * lifts these into full AccomplishmentRecipe instances at slot
 * time, building the actual blocks array from the contribution's
 * `type` + the suggestion's `config`.
 */
export interface PluginRecipeSuggestion {
	/**
	 * Stable id. MUST be globally unique within this plugin's
	 * suggestions; the browser uses it for placed-tracking + drag
	 * payload. Convention: `<plugin-id>:<recipe-slug>`.
	 */
	id: string;
	title: string;
	description?: string;
	/** mdi:* hint for the row icon. */
	icon?: string;
	/** Where the recipe shows up in the browser. */
	placement: PluginRecipePlacement;
	/**
	 * The config object the placed block carries. Shape is plugin-
	 * defined (matches whatever the renderer expects).
	 */
	config: Record<string, unknown>;
	/**
	 * entity_ids this recipe references. Drives the "✓ placed" badge:
	 * a recipe is "placed" when every referenced entity already has
	 * a `thing` block (or any block referencing it) on the canvas.
	 * Pass an empty array for recipes that don't reference HA entities
	 * (e.g. a page-level decorative block).
	 */
	referencedEntityIds: string[];
}

/**
 * 0.9.3: the host-context plugin block renderers can read via Svelte's
 * `getContext` to access core's curation + discovery snapshot
 * reactively, without runtime-importing `@broadsheet/core` (which
 * would create the execution cycle the contract forbids).
 *
 * Core's `RenderedPage` sets this context at mount; plugin block
 * renderers call:
 *
 * ```ts
 * import { getContext } from 'svelte';
 * import type { PluginBlockHostContext } from '@broadsheet/core';
 * const host = getContext<PluginBlockHostContext>(PLUGIN_BLOCK_HOST_CONTEXT_KEY);
 * // host.curation is reactive — re-renders when curation updates
 * // host.discovery is reactive — re-renders when discovery updates
 * ```
 *
 * The key is a string so plugins can use it verbatim (`getContext('broadsheet:plugin-block-host')`)
 * even when they only `import type` from core. The TYPE import is
 * compile-time only and is erased; no runtime cycle.
 */
export const PLUGIN_BLOCK_HOST_CONTEXT_KEY = 'broadsheet:plugin-block-host';

/**
 * Reactive shape exposed via the plugin-block-host context. Plugin
 * block renderers read from these getters — broadcasters wired by
 * core's `RenderedPage` re-fire on curation / discovery updates.
 */
export interface PluginBlockHostContext {
	/**
	 * The full curation object. Plugins access:
	 *  - their own config at `curation.plugins.<id>.config`
	 *  - shared integrations at `curation.integrations.<id>`
	 * Use it as a getter (`host.curation`) — Svelte 5 $state makes
	 * the underlying read reactive.
	 */
	curation: Record<string, unknown>;
	/** Read-only discovery snapshot — same shape as plugin pages get. */
	discovery: PluginDiscoverySnapshot;
}

/**
 * One block-type contribution from a plugin. Each contribution
 * declares a block type id, a default config + label + description
 * for the (legacy) advanced block picker, and a lazy renderer thunk.
 * Plugins MAY additionally declare `suggestRecipes` to surface the
 * block as recipe(s) in the things-first browser; without it the
 * block is still placeable via the advanced editor but doesn't
 * appear in the things-first surface.
 */
export interface PluginBlockContribution {
	/**
	 * Block type id. MUST be plugin-id-prefixed (`tmdb-tv:rows`,
	 * `emanations:painting`) so it never collides with core block
	 * types OR with another plugin's contributions. Validated at
	 * registration time; load-error on collision.
	 */
	type: string;
	/** Human label for the advanced block picker + things-first row title fallback. */
	label: string;
	/** Short description for the advanced block picker. */
	description: string;
	/** Default config when the block is added via "+ Add" in advanced mode. */
	defaultConfig: Record<string, unknown>;
	/** Lazy renderer component. Receives `{ config }` as its sole prop. */
	renderer: LazyComponent;
	/**
	 * Optional things-first recipe suggestions. Called once per
	 * `buildBrowserTree` recompute with the discovery snapshot;
	 * returned suggestions slot into the browser per `placement`.
	 * Keep cheap — runs on every reactive recompute of the tree.
	 */
	suggestRecipes?: (discovery: PluginDiscoverySnapshot) => PluginRecipeSuggestion[];
}

/**
 * The plugin contract. See the FROZEN note at the top of this file.
 */
export interface BroadsheetPlugin {
	/**
	 * Stable id. Matches the npm package name minus the `@broadsheet/`
	 * scope AND the key under `broadsheet.json → plugins`.
	 */
	id: string;
	/** The plugin's own semver. */
	version: string;
	displayName: string;
	description: string;
	/** Pages this plugin adds. Each gets a `/<slug>` route. */
	pages?: PluginPage[];
	/** Renderers this plugin exposes for `useRenderer()`. */
	renderers?: PluginRenderers;
	/** Settings panel for plugin-specific config. */
	settingsPanel?: PluginSettingsPanel;
	/**
	 * Path (relative to the plugin package root) of a static-asset
	 * directory to ship. Its contents are served at
	 * `/local/<plugin-id>/*` through the add-on's nginx. Reference
	 * them from plugin code via `pluginAssetUrl(id, path)`.
	 */
	staticAssets?: string;
	/** Discovery contributors — augment `discovery.plugins[<id>]`. */
	discoveryContributors?: DiscoveryContributor[];
	/** Called when the plugin activates (enabled AND checks pass). */
	onActivate?: (ctx: PluginActivationContext) => void | Promise<void>;
	/** Called when the plugin deactivates (disabled, or checks stop passing). */
	onDeactivate?: () => void | Promise<void>;
	/**
	 * Theme B: onboarding flow steps this plugin contributes.
	 * broadsheet aggregates these across all bundled plugins and
	 * references them by `<plugin-id>:<step-id>` from flow definitions
	 * shipped in `lib/flows/definitions.ts`. Each step's `isComplete`
	 * is evaluated live from curation + discovery + local flags —
	 * never a separate "done" flag — so partial outside-flow progress
	 * is picked up on every render.
	 */
	flows?: PluginFlowStep[];
	/**
	 * 0.9.3: block types this plugin contributes. Each declared
	 * block becomes lookup-able via core's `blockRenderer(type)` AND
	 * (when `suggestRecipes` is provided) shows up as recipe(s) in
	 * the things-first browser. Block type ids MUST be plugin-id-
	 * prefixed (`tmdb-tv:rows`) to avoid collisions with core block
	 * types and with other plugins' contributions.
	 *
	 * Additive + optional — plugins that don't contribute blocks
	 * leave this undefined; the FROZEN-at-v0.1 contract is preserved.
	 */
	extraBlocks?: PluginBlockContribution[];
}

/**
 * Theme B: how a flow step is shaped + what affordance broadsheet
 * renders for it. See `docs/plans/plan-theme-B-onboarding-flows.md`.
 */
export type PluginFlowStepKind =
	/** Step is complete when `plugins.<pluginId>.enabled === true`. */
	| 'enable-plugin'
	/** Step is complete when `curationField.path` resolves to a non-empty value. */
	| 'set-curation-field'
	/** Step is complete when the user clicks (tracked in localStorage). */
	| 'external-link'
	/** Step renders a plugin-provided component + supplies its own `isComplete`. */
	| 'custom';

/**
 * Context handed to each step's `isComplete` predicate. Read-only
 * snapshots of the surfaces a step might depend on. Plugins NEVER
 * mutate via this context — they use the same hooks the rest of the
 * SPA does (`useCurationField`, etc.) to write.
 */
export interface FlowStepContext {
	curation: {
		plugins: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
		people: { personId: string; presenceSensorId: string | null }[];
		[k: string]: unknown;
	};
	discovery: PluginDiscoverySnapshot;
	/**
	 * localStorage-backed flags. `get(key)` returns `true` only after
	 * the user has explicitly clicked the step's "done" affordance.
	 * Used by `kind: 'external-link'` to remember "I clicked through".
	 */
	localFlags: { get: (key: string) => boolean };
}

/**
 * Theme B: a single step in an onboarding flow. Steps are owned by
 * plugins (each plugin exports its own steps via `flows: [...]`);
 * the addon's `lib/flows/definitions.ts` composes them into named
 * flows by reference.
 */
export interface PluginFlowStep {
	/**
	 * Stable id, unique within this plugin's `flows`. Flow definitions
	 * reference steps as `<plugin-id>:<step-id>` (e.g. `voice:enable`).
	 */
	id: string;
	/** Short imperative title — "Paste your Anthropic key". */
	title: string;
	/** One-paragraph dek explaining what + why. Same register as page deks. */
	description: string;
	/** When true, broadsheet surfaces a "Skip →" affordance. */
	optional?: boolean;
	/** Determines the affordance shape. */
	kind: PluginFlowStepKind;
	/**
	 * Live completion predicate. Called on every render — must be
	 * cheap (just a curation/discovery/localFlag lookup). Theme B
	 * relies on this being idempotent so partial outside-flow
	 * progress is detected on entry.
	 */
	isComplete: (ctx: FlowStepContext) => boolean;
	/**
	 * Required when `kind === 'custom'`; optional supplementary UI
	 * for other kinds. Lazy-loaded so a missing/broken component
	 * doesn't crash the rest of the flow page.
	 */
	component?: LazyComponent;
	/**
	 * For `kind: 'external-link'`. broadsheet renders an "Open
	 * <label> ↗" anchor + an "I've done this →" button that sets
	 * a localStorage flag (`flow:<plugin-id>:<step-id>:done`) so the
	 * step flips to complete on the next render.
	 */
	link?: { href: string; label: string };
	/**
	 * For `kind: 'set-curation-field'`. broadsheet doesn't render
	 * the input itself (the plugin's settings panel owns that) — it
	 * just deep-links to that panel + reads the field for the
	 * `isComplete` check.
	 */
	curationField?: {
		/** Dotted path inside curation, e.g. `plugins.harold-preset.config.anthropicKey`. */
		path: string;
		/** Short hint shown under the title — e.g. "an `sk-ant-…` key". */
		valueHint: string;
		/**
		 * Optional deep-link to the settings panel that hosts the
		 * input. Surfaces as a "Set in settings ↗" anchor below the
		 * description. Typically `/settings/plugins/<id>/config/`.
		 */
		settingsHref?: string;
	};
}

/**
 * Runtime status of a registered plugin, surfaced in
 * `/settings/plugins` — the honesty escape hatch.
 */
export type PluginStatus =
	/** Enabled, all activation checks pass, loaded OK. */
	| 'active'
	/** Enabled, but `visibleWhen` / activation checks don't pass yet. */
	| 'enabled-inactive'
	/** `plugins.<id>.enabled === false`. */
	| 'disabled'
	/** A `discoveryContributor` threw — plugin runs but data is degraded. */
	| 'errored'
	/** Import threw, or the exported object failed contract validation. */
	| 'load-error';

/** What the loader tracks per registered plugin. */
export interface RegisteredPlugin {
	plugin: BroadsheetPlugin;
	status: PluginStatus;
	/** Human-readable reason shown in `/settings/plugins` when status !== 'active'. */
	statusReason?: string;
}

/**
 * Route slugs that plugins must NOT use — core owns these. The
 * `[pluginSlug]` loader rejects a plugin page whose slug collides
 * with one of these (status `load-error`).
 *
 * `''` is the landing manifest (`/`). `settings` + `setup` are core
 * config surfaces. The rest are the core domain pages.
 */
export const RESERVED_ROUTE_SLUGS: readonly string[] = [
	'',
	'lights',
	'heat',
	'door',
	'tv',
	'body',
	'wall',
	'settings',
	'setup'
];
