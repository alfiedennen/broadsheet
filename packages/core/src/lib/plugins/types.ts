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
