// A plugin's settings panel resolves client-side from the reactive
// plugin loader — nothing to prerender. `prerender = false` is
// inherited from the root +layout.ts, stated explicitly here because
// this is a dynamic route under adapter-static `strict: true`.
export const prerender = false;
