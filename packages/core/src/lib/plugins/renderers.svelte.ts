/**
 * renderers.svelte.ts — the renderer registry + the `useRenderer`
 * hook.
 *
 * A renderer is a component a plugin exposes for OTHER pages (core or
 * plugin) to use opportunistically. Core's `/` page does:
 *
 *   const Painting = useRenderer('multi-person-painting');
 *   {#if Painting}<Painting .../>{:else}<ProceduralPainting/>{/if}
 *
 * — it upgrades to the plugin's renderer when that plugin is active,
 * and falls back to core's own component otherwise. Core never
 * hard-depends on a plugin.
 *
 * Renderers are LazyComponent thunks, so resolution is async: a hook
 * returns `null` until the chunk has been fetched, then the
 * component. It also returns `null` the moment the providing plugin
 * is disabled (the caller falls back instantly; the resolved chunk
 * stays cached for a fast re-enable).
 */

import type { Component } from 'svelte';
import { pluginLoader } from './loader.svelte';

class RendererRegistry {
	/** Resolved renderer components, keyed by renderer id. */
	#resolved = $state<Record<string, Component<any>>>({});
	/** Renderer ids whose lazy import is in flight — dedup guard. */
	#loading = new Set<string>();

	/**
	 * Kick off the lazy import for `id` if an active plugin provides
	 * it and it isn't resolved / already loading. Idempotent — safe to
	 * call from an `$effect` that re-runs on every discovery tick.
	 */
	ensure(id: string): void {
		if (this.#resolved[id] || this.#loading.has(id)) return;
		const thunk = pluginLoader.rendererThunk(id);
		if (!thunk) return;
		this.#loading.add(id);
		thunk()
			.then((mod) => {
				this.#resolved[id] = mod.default;
			})
			.catch(() => {
				// Failed import — leave unresolved; the caller's fallback
				// covers it. (A render-time crash, by contrast, is caught
				// by the consuming page's <svelte:boundary>.)
			})
			.finally(() => {
				this.#loading.delete(id);
			});
	}

	/**
	 * Reactive read: the resolved renderer component, or null. Null
	 * when no active plugin provides the id (covers disabled /
	 * load-errored plugins — even if a stale resolved entry lingers)
	 * OR the lazy chunk hasn't resolved yet.
	 */
	resolved(id: string): Component<any> | null {
		// If no active plugin currently provides this renderer, force
		// null regardless of cache — the plugin may have just been
		// disabled, and the caller must fall back immediately.
		if (!pluginLoader.rendererThunk(id)) return null;
		return this.#resolved[id] ?? null;
	}
}

export const rendererRegistry = new RendererRegistry();

/** Reactive handle returned by `useRenderer`. */
export interface RendererHandle {
	/**
	 * The plugin-provided renderer component when its plugin is active
	 * AND the lazy chunk has resolved, else `null`. Reactive — read it
	 * in a template / `$derived` and it updates as plugins toggle.
	 */
	readonly current: Component<any> | null;
}

/**
 * Reactive renderer hook. **Call at component init** (top-level
 * `<script>`) — it sets up an `$effect`.
 *
 * Returns a handle whose `.current` is the plugin-provided renderer
 * component when its plugin is active AND the lazy chunk has
 * resolved, else `null`. (`.current` rather than a bare reactive
 * value because a Svelte 5 function can't return a reactive
 * primitive — the getter is the reactive access point.) Usage:
 *
 *   const painting = useRenderer('multi-person-painting');
 *   {#if painting.current}
 *     {@const Painting = painting.current}
 *     <Painting persons={discovery.persons} />
 *   {:else}
 *     <ProceduralPainting />
 *   {/if}
 */
export function useRenderer(id: string): RendererHandle {
	// The $effect drives the lazy import; it re-runs when the active
	// renderer set changes (a plugin enabled / disabled). $effect must
	// be called at component init — which is the useRenderer contract.
	$effect(() => {
		rendererRegistry.ensure(id);
	});
	return {
		get current() {
			return rendererRegistry.resolved(id);
		}
	};
}
