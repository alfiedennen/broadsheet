# Plan — 0.9.4.5: auth injection + asset-extension fallback proxy

**Status**: IMPLEMENTED 2026-05-18. svelte-check clean (523 files,
0 errors, 0 warnings), 343 tests pass (no test changes — runtime
nginx + renderer changes only), production build clean. Live-
verified via Chrome MCP against the production canary
(`68fa04fc_broadsheet` on the real ProDesk HA): manual injection
of the supervisor-token-as-hassTokens skipped the OAuth login
screen entirely, HA's Overview dashboard rendered with full
sidebar + live entity state + asset icons + WebSocket connected.
Zero auth/token/login errors in the console.

Files shipped:

- `broadsheet-addon/broadsheet/config.yaml` — version `0.9.4.4` →
  `0.9.4.5`.
- `broadsheet-addon/broadsheet/nginx.conf.tpl`:
  - `/local/` upstream flipped from `supervisor/core/local/` (REST
    API — returned 403 for actual file requests) to
    `homeassistant:8123/local/` (HA Core's static-file serving for
    `/config/www/`). No Bearer auth — HA serves `/local/` files
    to authenticated browser sessions; with the new auth injection
    those credentials are already in the iframe's localStorage.
    `X-Frame-Options` stripped on response.
  - New `location ^~ /hacsfiles/` route → `homeassistant:8123/hacsfiles/`.
    HACS-installed Lovelace plugins serve their assets from this
    path; without the explicit route they fell into broadsheet's
    SPA fallback (returning `index.html` as `text/html`, browser
    refused module loads with the classic "Expected a JS module
    but server responded with text/html" error).
  - New regex fallback for unknown file-extension paths:
    ```nginx
    location ~* ^/[^/]+/.+\.(js|mjs|css|png|jpg|jpeg|svg|ico|woff2?|ttf|json|wasm|webp|gif|map)$ {
        try_files $uri @ha_asset_proxy;
    }
    location @ha_asset_proxy {
        proxy_pass http://homeassistant:8123$request_uri;
        proxy_set_header Host $host;
        proxy_hide_header X-Frame-Options;
    }
    ```
    Catches HACS-integration static paths broadsheet can't
    enumerate (e.g. `/room_presence/room-presence-card.js`,
    arbitrary `/<plugin>/<file>.js`). Tries broadsheet's own
    filesystem first via `try_files`, falls back to the HA proxy.
  - Added `^~` priority modifier to all of broadsheet's own
    asset routes: `/_app/immutable/`, `/_app/`, `/plugin-assets/`,
    `/plugin-data/`, `/api/broadsheet/`, `/api/harold-preset/`,
    `/api/websocket`, `/api/`, plus the existing aux HA routes
    (`/static/`, `/frontend_latest/`, `/auth/`, `/local/`,
    `/hacsfiles/`). Without `^~` the new asset-extension regex
    would cannibalise them.
- `packages/core/src/lib/blocks/renderers/LovelaceEmbedBlockRenderer.svelte`:
  - New `injectHaTokens()` function called on `onMount` AND
    in an `$effect` reactive to `rawUrl` changes. Pre-populates
    `localStorage["hassTokens"]` with a synthesised entry built
    from `window.__BROADSHEET_ENV__.supervisorToken` as the
    `access_token`. `expires` is set to one year out so HA's
    frontend doesn't try to refresh via `/auth/token` (which would
    400 — broadsheet's `:8124` origin isn't a registered HA OAuth
    client). The Supervisor token rotates per container; we
    re-inject on every iframe mount so stale tokens never persist.
  - Comment additions describe the design + the risk it might fail
    (HA could reject the Supervisor token's signature for
    frontend purposes). The fallback is the same OAuth login the
    user got in 0.9.4.4 — no regression.

---

**Status (pre-impl)**: LOCKED 2026-05-18 after 0.9.4.4 verified
the X-Frame-Options bypass worked but surfaced two follow-on
gaps in the same Chrome-MCP run:

1. The iframe lands on HA's OAuth login screen because `:8124`
   is a new client to HA's auth state. The 0.9.4.4 TROUBLESHOOTING
   doc framed this as "one-time login per broadsheet origin" — a
   real friction point on wall tablets, not a true blocker but
   not a finished feature either.
2. The iframe shows the login screen but throws a cascade of MIME
   / 403 / 400 errors in the console for asset paths the proxy
   doesn't cover:
   - `/local/studio-fonts.js` → 403 (wrong upstream)
   - `/hacsfiles/<repo>/<file>.js` → SPA fallback returned HTML
   - `/room_presence/room-presence-card.js` → SPA fallback returned HTML
   - `/auth/token` → 400 (OAuth code exchange fails because
     `:8124` isn't registered)

## Diagnosis

**Auth**. HA's frontend boots and reads `localStorage["hassTokens"]`
on the first turn. If present + non-expired, it skips the OAuth
flow and uses the access_token directly for REST + WS. If absent,
it kicks off the OAuth dance — which 0.9.4.4 proxies via the
`/auth/` route, but the eventual `/auth/token` POST fails because
the addon's origin (`:8124`) isn't a registered OAuth `client_id`
for HA's auth provider. The login screen renders but the dance
can't complete.

The fix is to skip the dance entirely by pre-populating
`hassTokens` before the iframe boots. broadsheet already has
admin-level access to HA via the Supervisor token (which is what
the `/api/` proxy injects). The Supervisor token is accepted as
a Bearer for REST calls; if HA's frontend will also accept it as
`hassTokens.access_token`, the iframe will boot in the
"already authenticated" branch.

**Assets**. broadsheet's nginx had explicit routes for
`/api/`, `/static/`, `/frontend_latest/`, `/auth/`, `/manifest.json`,
`/service_worker.js`, `/local/` (broken — wrong upstream), but
HACS integrations register their own arbitrary static paths
(`/room_presence/<file>.js`, `/<other-repo>/<file>.js`) that
broadsheet can't enumerate. The 0.9.4.4 catch-all SPA fallback
matched them and returned `index.html` as `text/html`, and the
browser refused to load them as JS modules.

## What 0.9.4.5 ships

### Auth injection (SPA-side)

In `LovelaceEmbedBlockRenderer.svelte`, on mount + every URL
change, write a synthesised `hassTokens` object to localStorage:

```ts
{
  hassUrl: window.location.origin,
  clientId: window.location.origin + '/',
  access_token: env.supervisorToken,
  token_type: 'Bearer',
  refresh_token: '',
  expires_in: 31536000,
  expires: Date.now() + 31536000 * 1000
}
```

The iframe is same-origin with broadsheet (both at `:8124`), so
localStorage is shared. HA's frontend on iframe mount reads
hassTokens, treats the session as authenticated, never opens the
login screen. `expires` is far-future so the frontend doesn't try
to refresh (which would 400 because `:8124` isn't a registered
OAuth client).

The Supervisor token rotates per container restart; we re-inject
on every renderer mount (and on every URL change), so a token
rotation just means the next iframe load gets a fresh injection.
A long-running iframe could theoretically encounter rotation
mid-session, but the HA frontend's REST + WS calls would then
401, the user would see the dashboard go stale; a page reload
recovers cleanly (re-injection on remount).

### Asset routing (addon-side)

1. **`/local/` upstream fix**. The 0.9.4.4 config proxied
   `/local/` to `supervisor/core/local/` — which is the REST API
   listing endpoint, not the static-file serving. HA Core itself
   serves `/local/` from `/config/www/` on its frontend port
   (`:8123`). Flipped the upstream.

2. **Explicit `/hacsfiles/` route**. HACS-installed Lovelace
   plugins serve from this prefix. Added a proxy route mirroring
   the `/static/` shape.

3. **Regex fallback for any path with a file extension**.
   Catches arbitrary HACS-integration static paths broadsheet
   can't enumerate. Tries broadsheet's own files first via
   `try_files $uri`, falls back to the named upstream
   `@ha_asset_proxy` which proxies to HA Core. SPA routes
   (no file extension) still hit the existing `location /`
   fallback returning `index.html`.

4. **`^~` priority modifier on all of broadsheet's own asset
   routes**. nginx's location-matching gives regex locations
   priority over prefix locations unless the prefix is marked
   `^~`. Without it, the new asset-extension regex would steal
   `/_app/immutable/<hash>.js` requests and try to proxy them to
   HA. The `^~` modifier locks broadsheet's own routes in front.

### Docs

- `TROUBLESHOOTING.md` "One-time login per broadsheet origin"
  section — flipped from "log in once, token persists" to
  "0.9.4.5+ auto-authenticates via Supervisor token injection".
  Honest caveats preserved: if HA rejects the injection (token
  signature, future HA changes), the iframe falls back to the
  OAuth login screen — no worse than 0.9.4.4. The
  `trusted_networks` recipe stays as the user-side fallback.

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| How to bypass OAuth login | Pre-populate `localStorage["hassTokens"]` with Supervisor token before iframe mount | Same-origin localStorage is shared between renderer and iframe; HA's frontend reads it on boot; no `/auth/token` round-trip needed |
| Where to set the injection | `onMount` + reactive `$effect` on `rawUrl` change | Token rotates per container; re-inject covers stale-token edge cases |
| Token expiry | One year out (`expires_in: 31536000`) | Prevent HA frontend from attempting `/auth/token` refresh (which would 400 — origin isn't a registered OAuth client) |
| `/local/` upstream | `homeassistant:8123/local/`, no Bearer | HA serves `/local/` to authenticated sessions; injection makes the session authenticated; auth at the browser layer, not the proxy |
| HACS-static catch-all | Regex on file-extension paths, `try_files` first, HA proxy as fallback | Can't enumerate every HACS integration's static paths; LOOKS-like-an-asset heuristic catches them all |
| Priority modifier strategy | `^~` on every broadsheet-owned prefix location | Without it, the new asset-extension regex cannibalises broadsheet's own `/_app/`, `/api/`, etc |
| Fallback on injection failure | Let HA's OAuth login render | Same UX as 0.9.4.4; no regression |
| Test surface | Live Chrome-MCP verification (no unit tests) | Pure runtime / nginx / browser-state change; no public-contract additions to test in isolation |

---

## Out of scope

- **Multi-user installs**. Auth injection grants admin visibility
  (the Supervisor token's level). For installs where different
  users should see different dashboards, the injection model
  needs to change to per-user OAuth — out of scope until a real
  multi-user broadsheet user requests it.
- **Token rotation mid-iframe-session**. The renderer re-injects
  on every mount + URL change, but a long-running iframe could
  encounter a Supervisor token rotation between injections. The
  iframe's REST/WS calls would then 401 and the dashboard would
  stale. A page reload recovers cleanly. Auto-refresh on 401 is
  possible but adds enough complexity that we defer until it
  proves real-world painful.
- **Cross-host embeds**. The injection only works when broadsheet
  and HA are same-origin (both on the addon host). Remote HA
  installs need user-side OAuth setup; documented.
- **HA frontend changes that break `hassTokens` shape**. The
  injected object matches HA's current contract. If HA's auth
  module changes the shape (new required field, refresh token
  enforcement), our injection would fail open to the OAuth flow.
  Documented as a known fragility; we'll patch when it breaks.

---

## Companion to 0.9.4.4

0.9.4.4 made the iframe LOAD HA's frontend (X-Frame-Options bypass
+ correct upstream). 0.9.4.5 makes the loaded frontend
USEFUL out-of-the-box (no login screen + all assets resolve).
With these two together, the lovelace-embed block hits production
quality for the same-host-HA case — paste a URL, get a working
embed, no user-side config.
