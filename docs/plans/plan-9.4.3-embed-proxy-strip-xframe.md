# Plan — 0.9.4.3: same-origin proxy for lovelace-embed (X-Frame-Options bypass)

**Status**: IMPLEMENTED 2026-05-18. svelte-check clean (523 files,
0 errors, 0 warnings), 343 tests pass (no test changes — this is
a runtime / addon nginx change), production build clean. Files
shipped:

- `broadsheet-addon/broadsheet/nginx.conf.tpl` — new routes
  `location ~ ^/embed/(.*)$` (with `proxy_hide_header X-Frame-Options`
  + `proxy_hide_header Content-Security-Policy`) + auxiliary
  `/static/`, `/frontend_latest/`, `/auth/`, `/manifest.json`,
  `/service_worker.js` proxy routes. All auth via Supervisor token.
- `packages/core/src/lib/blocks/renderers/LovelaceEmbedBlockRenderer.svelte` —
  `$derived` URL rewrites: bare paths (`/wall-tablet/home`) get
  `/embed` prepended; absolute URLs on same-host:8123 get path
  extracted + prepended with `/embed`; cross-host URLs left as-is.
  The load-timeout hint is suppressed for proxy URLs (they always
  load reliably; the hint was for the cross-origin fallback path).
- `packages/core/src/routes/settings/pages/import/+page.svelte` —
  `embedHaUrl()` now produces same-origin proxy paths directly
  (`/embed/<dashboard>/<view>?kiosk=true`) instead of cross-origin
  absolute URLs.
- `packages/core/src/lib/blocks/editor/ThingsCanvas.svelte` —
  inline editor's URL placeholder + hint updated to surface the
  new bare-path option ("0.9.4.3+ routes the embed through the
  addon's same-origin proxy automatically — no X-Frame-Options
  config needed").
- `TROUBLESHOOTING.md` — "Lovelace embed shows blank" section
  flipped from "you need to configure HA to allow framing" to
  "0.9.4.3+ handles this automatically". Cross-host caveat
  preserved.

---

**Status (pre-impl)**: LOCKED 2026-05-18 after 0.9.4.2 dogfood produced
`Refused to display 'http://homeassistant.local:8123/' in a frame
because it set 'X-Frame-Options' to 'sameorigin'`.

## Diagnosis

- HA serves `X-Frame-Options: SAMEORIGIN` (verified via `curl -I`).
- broadsheet's addon is configured with `ingress: false` — it runs
  on a dedicated host port (default 8124), NOT through HA Ingress.
- Result: broadsheet is ALWAYS cross-origin to HA's port 8123.
  Even via the broadsheet sidebar launcher (which redirects to port
  8124), the embed iframe is cross-origin to its src.
- 0.9.4.2's lovelace-embed block iframes the HA URL directly →
  browser refuses per SAMEORIGIN policy → embed shows
  `chrome-error://chromewebdata/`.

## What 0.9.4.3 ships

A same-origin proxy inside broadsheet's nginx that fetches HA
content and strips X-Frame-Options before returning to the browser.
The iframe gets a same-origin response → renders fine.

### addon-side: nginx.conf.tpl additions

1. **`location ~ ^/embed/(.*)$`** — proxies arbitrary paths to
   HA core via Supervisor. Strips `X-Frame-Options` AND
   `Content-Security-Policy` (Lovelace sets CSP that would also
   block framing). Auth via Supervisor token (admin-level view —
   acceptable for the wall-tablet use case; documented).

2. **Auxiliary HA-asset proxy routes** so the embedded Lovelace
   can load its own JS/CSS/auth assets cross-broadsheet's-origin:
   - `/static/` → HA's static assets
   - `/frontend_latest/` → HA's modern frontend chunk
   - `/auth/` → HA's auth flow
   - `/manifest.json` → PWA manifest
   - `/service_worker.js` → service worker

   All with `proxy_set_header Authorization "Bearer {{ env "SUPERVISOR_TOKEN" }}"`
   so HA accepts the proxied requests.

   `/api/` and `/api/websocket` already proxy to HA via Supervisor
   token — embedded Lovelace's WebSocket + REST calls inherit that
   plumbing.

### SPA-side: URL rewriting

1. **`LovelaceEmbedBlockRenderer.svelte`** — when the configured
   `url` is an absolute HA URL on the same hostname as broadsheet
   (e.g. `http://homeassistant.local:8123/wall-tablet`), rewrite
   to the same-origin proxy path (`/embed/wall-tablet`). Iframe SRC
   becomes `http://homeassistant.local:8124/embed/wall-tablet` →
   same-origin → no X-Frame-Options block.

   Absolute URLs to OTHER hosts (e.g. a remote HA install) are NOT
   rewritten — those need the user's manual HA-side framing
   config. Same for `https://` URLs (we don't synthesise a proxy
   for them yet).

2. **`embedHaUrl()` in the import flow** — produce same-origin proxy
   URLs directly (`/embed/<dashboard>/<view>?kiosk=true`) instead of
   cross-origin absolute URLs (`http://<host>:8123/<dashboard>/...`).
   Pages saved via 0.9.4.2's flow will be re-rewritten by the
   renderer when loaded, so no migration is needed for existing
   pages.

### Docs

- `TROUBLESHOOTING.md` — "Lovelace embed shows blank" section
  flips from "you need to configure HA to allow framing" to "the
  0.9.4.3 addon handles this automatically; if you're on an older
  addon, here's the manual HA-side recipe".
- `CUSTOM-PAGES-GUIDE.md` — Lovelace embed section gains a note
  about the proxy: it auths as Supervisor (admin), so the embedded
  Lovelace renders with full visibility.

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Where to strip X-Frame-Options | Addon-side nginx (transparent proxy) | One fix for everyone; no HA-side config needed |
| Auth model for the proxy | Supervisor token (admin) | Already what broadsheet's `/api/` route uses; same trust boundary |
| Aux HA paths to proxy | `/static/`, `/frontend_latest/`, `/auth/`, `/manifest.json`, `/service_worker.js` | The minimal set HA's Lovelace frontend needs to render; `/api/` already proxied |
| URL rewrite scope | Same-host:8123 only | Cross-host embeds need user-side HA config (out of scope) |
| Save format | Renderer rewrites on render; saved `url` stays as the user typed it | No data migration; users see their typed URL in the editor |
| CSP also stripped | Yes (`proxy_hide_header Content-Security-Policy`) | Lovelace sets CSP that would also block framing |

---

## Out of scope

- Cross-host HA installs (a broadsheet on host A iframing HA on
  host B). User has to handle X-Frame-Options on the remote HA
  side. Documented in TROUBLESHOOTING.
- HTTPS HA installs from an HTTP broadsheet (or vice versa) —
  same mixed-content rules apply regardless. Documented.
- Strict CSP-replacement (we're stripping, not rewriting). If
  HA's CSP becomes stricter and includes `frame-ancestors` even
  in proxied responses, we'd need to add the proxy origin to a
  permissive replacement CSP. Watch for it.
