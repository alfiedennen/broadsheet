// SPA mode — no SSR, no prerendering. The whole app boots in the
// browser, talks to HA over WebSocket, renders live state. There is no
// server runtime in the build output.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'always';
