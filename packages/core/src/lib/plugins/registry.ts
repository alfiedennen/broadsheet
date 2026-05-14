/**
 * registry.ts — THE bundling-aware module.
 *
 * This is the ONLY place in broadsheet that knows plugins are
 * bundled. Everything downstream — the loader, the [pluginSlug]
 * route, KebabNav, useRenderer, /settings/plugins — consumes the
 * bundling-agnostic `BroadsheetPlugin[]` this module produces and has
 * no idea where a plugin came from.
 *
 * ── v0.1 (now) ────────────────────────────────────────────────────
 * Statically imports the first-class plugins. `pnpm --filter
 * @broadsheet/core build` builds them transitively; their heavy code
 * is behind LazyComponent thunks so Vite code-splits it. "Only the
 * first-class trio is bundled" is true by construction — this array
 * is the entire bundle manifest.
 *
 * ── v0.2 (runtime install) ────────────────────────────────────────
 * This module gains a SECOND code path: fetch + dynamic-import
 * third-party plugin bundles behind a signed allowlist, and merge
 * them into the returned array. Nothing downstream changes — the
 * loader still receives a `BroadsheetPlugin[]`. The first-class trio
 * stays statically bundled; third-party plugins are runtime-installed
 * and NEVER bundled. See RENDERER-CONTRACT.md § "Bundling model".
 *
 * So the v0.1 → v0.2 evolution is: extend THIS file, touch nothing
 * else.
 */

import type { BroadsheetPlugin } from './types';
import { plugin as emanations } from '@broadsheet/emanations';
import { plugin as ghostCloud } from '@broadsheet/ghost-cloud';
// import { plugin as tmdbTv } from '@broadsheet/tmdb-tv';  // post-v0.1 — still a stub

/**
 * The bundled first-class plugins. tmdb-tv joins this array once its
 * `index.ts` is ported (post-v0.1) — until then its package is a stub
 * with no plugin object to import.
 */
export const BUNDLED_PLUGINS: BroadsheetPlugin[] = [emanations, ghostCloud];
