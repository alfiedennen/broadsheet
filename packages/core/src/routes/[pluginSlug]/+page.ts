// The plugin catch-all. Resolution is fully client-side + reactive —
// it depends on the plugin loader, which depends on curation +
// discovery, both of which boot in +layout's onMount. So there's
// nothing to prerender; the SPA fallback (index.html) serves the
// shell and +page.svelte does the registry lookup.
//
// `prerender = false` is inherited from +layout.ts, but a dynamic
// route under adapter-static `strict: true` is clearest stated
// explicitly: this route is reachable ONLY via the SPA fallback.
export const prerender = false;
