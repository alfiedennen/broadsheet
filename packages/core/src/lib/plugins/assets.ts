/**
 * pluginAssetUrl — resolves a plugin's static asset to a URL that
 * works under HA Ingress AND direct serving, without the plugin code
 * knowing about ingress prefixes.
 *
 * A plugin declares `staticAssets: 'static/'` in its BroadsheetPlugin
 * object; the add-on build stages that directory into the image at
 * `www/plugin-assets/<plugin-id>/`, and nginx serves it at
 * `/plugin-assets/<plugin-id>/*`.
 *
 * Why `/plugin-assets/` and not `/local/<plugin-id>/` (as an earlier
 * draft of RENDERER-CONTRACT.md said): the add-on's nginx already
 * owns `/local/` — it proxies to HA Core's own www folder. Plugin
 * assets need their own namespace or they'd collide.
 *
 * The `base` prefix is the key. svelte.config sets `base: ''` at
 * build time, but the add-on's nginx `sub_filter` rewrites `base: ""`
 * to the live ingress entry at serve time — so at runtime `base` is
 * `/api/hassio_ingress/<token>` under the add-on, and `''` in
 * dev/standalone. Prefixing with it makes the URL correct in both.
 */

import { base } from '$app/paths';

/**
 * Resolve a plugin static asset to a servable URL.
 *
 * @param pluginId  the plugin's `id` (e.g. `'emanations'`)
 * @param assetPath path within the plugin's `static/` dir
 *                  (e.g. `'paintings/office.png'`); leading slashes
 *                  are tolerated.
 */
export function pluginAssetUrl(pluginId: string, assetPath: string): string {
	const clean = assetPath.replace(/^\/+/, '');
	return `${base}/plugin-assets/${pluginId}/${clean}`;
}

/**
 * Resolve a USER-UPLOADED plugin file to a servable URL.
 *
 * Counterpart to `pluginAssetUrl`. Bundled assets (pluginAssetUrl) live
 * in the add-on image — immutable per build, baked at CI time. Plugin
 * DATA (this) lives in the add-on's persistent /data/ volume and
 * survives add-on updates; files land via `uploadPluginData()` and are
 * served by nginx at `/plugin-data/<pluginId>/<filename>`.
 *
 * Different lifecycles, different namespaces, same URL pattern.
 *
 * @param pluginId  the plugin's `id` (e.g. `'emanations'`)
 * @param filename  filename within the plugin's data dir (e.g.
 *                  `'office-elena.png'`); leading slashes tolerated.
 */
export function pluginDataUrl(pluginId: string, filename: string): string {
	const clean = filename.replace(/^\/+/, '');
	return `${base}/plugin-data/${pluginId}/${clean}`;
}
