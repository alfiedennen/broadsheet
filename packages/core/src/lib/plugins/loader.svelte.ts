/**
 * loader.svelte.ts — the bundling-agnostic plugin loader.
 *
 * Consumes `BUNDLED_PLUGINS` (a `BroadsheetPlugin[]`) from
 * registry.ts — it neither knows nor cares that they're bundled. In
 * v0.2 registry.ts also yields runtime-installed plugins; this loader
 * doesn't change. It does three things:
 *
 *  1. One-time static validation (`bootPlugins`): id uniqueness,
 *     reserved-slug + cross-plugin slug collisions, basic shape.
 *  2. Reactive status: per plugin, derive `PluginStatus` from
 *     (loadError, the curation `enabled` flag, `visibleWhen` against
 *     the live discovery snapshot).
 *  3. `activePluginPages`: the flat list of pages that are BOTH
 *     routable and nav-visible — consumed by KebabNav + the
 *     `[pluginSlug]` route.
 *
 * Lifecycle hooks (`onActivate` / `onDeactivate`) and
 * `discoveryContributors` are P3 — the contract carries them; firing
 * them is wired alongside the contributor pipeline.
 */

import type {
	BroadsheetPlugin,
	PluginPage,
	RegisteredPlugin,
	PluginDiscoverySnapshot
} from './types';
import { RESERVED_ROUTE_SLUGS } from './types';
import { BUNDLED_PLUGINS } from './registry';
import { discovery } from '$lib/discovery';
import { curationStore } from '$lib/curation/store.svelte';
import { audit } from '$lib/ha/audit';

/** One-time static validation result for a bundled plugin. */
interface ValidatedPlugin {
	plugin: BroadsheetPlugin;
	/** Set iff the plugin failed static validation — status becomes 'load-error'. */
	loadError?: string;
}

/** A plugin page paired with its owning plugin id — for routing + nav. */
export interface ActivePluginPage {
	pluginId: string;
	slug: string;
	label: string;
	icon: string;
	navOrder: number;
	component: PluginPage['component'];
}

class PluginLoader {
	/** Filled once by bootPlugins(). Empty until then. */
	#validated = $state<ValidatedPlugin[]>([]);
	#booted = $state(false);

	get booted(): boolean {
		return this.#booted;
	}

	/**
	 * One-time static validation of the bundled plugins. Sync — the
	 * plugins are already statically imported by registry.ts. Called
	 * from +layout once curation + discovery have booted. Idempotent.
	 */
	bootPlugins(): void {
		if (this.#booted) return;

		const seenIds = new Set<string>();
		const seenSlugs = new Set<string>();
		const validated: ValidatedPlugin[] = [];

		for (const plugin of BUNDLED_PLUGINS) {
			const errors: string[] = [];

			if (!plugin.id) errors.push('missing id');
			if (!plugin.version) errors.push('missing version');
			if (!plugin.displayName) errors.push('missing displayName');

			if (plugin.id) {
				if (seenIds.has(plugin.id)) errors.push(`duplicate plugin id "${plugin.id}"`);
				seenIds.add(plugin.id);
			}

			for (const page of plugin.pages ?? []) {
				if (RESERVED_ROUTE_SLUGS.includes(page.slug)) {
					errors.push(`page slug "${page.slug}" collides with a reserved core route`);
				}
				if (seenSlugs.has(page.slug)) {
					errors.push(`page slug "${page.slug}" is used by another plugin`);
				}
				seenSlugs.add(page.slug);
			}

			validated.push({
				plugin,
				loadError: errors.length ? errors.join('; ') : undefined
			});

			if (errors.length) {
				audit({
					kind: 'auth-event',
					note: `plugin "${plugin.id || '(no id)'}" failed validation`,
					error: errors.join('; ')
				});
			}
		}

		this.#validated = validated;
		this.#booted = true;
		audit({
			kind: 'auth-event',
			note: `plugins booted: ${validated.length} bundled, ${validated.filter((v) => !v.loadError).length} valid`
		});
	}

	/** Read-only discovery snapshot handed to `visibleWhen` predicates. */
	#snapshot = $derived<PluginDiscoverySnapshot>({
		floors: discovery.floors,
		areas: discovery.areas,
		persons: discovery.persons
	});

	/**
	 * The reactive registry — one `RegisteredPlugin` per bundled
	 * plugin, status recomputed when curation (the `enabled` flag) or
	 * discovery (`visibleWhen` inputs) change.
	 */
	registry = $derived.by<RegisteredPlugin[]>(() => {
		// Establish a reactive dep on curation mutations — the curation
		// object is replaced on every save; the tick guarantees we
		// recompute even if deep-equality would short-circuit.
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		const snap = this.#snapshot;

		return this.#validated.map(({ plugin, loadError }): RegisteredPlugin => {
			if (loadError) {
				return { plugin, status: 'load-error', statusReason: loadError };
			}

			const enabled = curationStore.current.plugins[plugin.id]?.enabled === true;
			if (!enabled) {
				return { plugin, status: 'disabled' };
			}

			// Enabled + loaded. If the plugin has pages, it's only
			// 'active' when at least one page's visibleWhen passes —
			// otherwise it contributes nothing visible right now, which
			// is the honesty escape hatch (/settings/plugins shows why).
			const pages = plugin.pages ?? [];
			if (pages.length > 0) {
				const anyVisible = pages.some((p) => (p.visibleWhen ? p.visibleWhen(snap) : true));
				if (!anyVisible) {
					return {
						plugin,
						status: 'enabled-inactive',
						statusReason: 'enabled, but no page passes its visibility check yet'
					};
				}
			}

			return { plugin, status: 'active' };
		});
	});

	/**
	 * Flat list of plugin pages that are BOTH routable and
	 * nav-visible: the owning plugin is enabled + loaded AND the
	 * page's `visibleWhen` passes (or it has none). The `[pluginSlug]`
	 * route renders exactly these; KebabNav lists exactly these. A
	 * disabled / load-errored plugin's pages — and an enabled
	 * plugin's not-yet-visible pages — are absent, so direct
	 * navigation to them 404s.
	 */
	activePluginPages = $derived.by<ActivePluginPage[]>(() => {
		const snap = this.#snapshot;
		const out: ActivePluginPage[] = [];
		for (const { plugin, status } of this.registry) {
			// load-error / disabled plugins contribute no pages. An
			// 'errored' plugin (a discoveryContributor threw — P3) keeps
			// its pages: the error is in data, not the page.
			if (status === 'load-error' || status === 'disabled') continue;
			for (const page of plugin.pages ?? []) {
				if (page.visibleWhen && !page.visibleWhen(snap)) continue;
				out.push({
					pluginId: plugin.id,
					slug: page.slug,
					label: page.label,
					icon: page.icon,
					navOrder: page.navOrder,
					component: page.component
				});
			}
		}
		return out.sort((a, b) => a.navOrder - b.navOrder);
	});

	/** Resolve a slug to its active page, or null. Used by the route. */
	pageBySlug(slug: string): ActivePluginPage | null {
		return this.activePluginPages.find((p) => p.slug === slug) ?? null;
	}
}

/** Singleton — the route, KebabNav, /settings/plugins all read this. */
export const pluginLoader = new PluginLoader();

/** Boot entry point — called from +layout after curation + discovery. */
export function bootPlugins(): void {
	pluginLoader.bootPlugins();
}
