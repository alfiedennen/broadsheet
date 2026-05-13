/**
 * Public API of the discovery layer.
 *
 * Thin re-export from `./index.svelte.ts` (which holds the runes-based
 * `DiscoveryAPI` class). The rename is mechanical: Svelte 5's runes
 * (`$state`, `$derived`) only work in files with `.svelte.ts` /
 * `.svelte.js` extensions. This `.ts` re-export keeps consumers'
 * import path clean (`$lib/discovery` rather than `$lib/discovery/index.svelte`).
 */

export * from './index.svelte';
