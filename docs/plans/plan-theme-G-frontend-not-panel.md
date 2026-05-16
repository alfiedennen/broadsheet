# Plan — Theme G: broadsheet as frontend, not addon panel

**Status**: Drafted 2026-05-16 after V3 manual dogfood + strategic pivot to v0.2.
**Sequence**: First theme in v0.2 (changes the architectural premise everything
else rests on). Sequence: G → F → B → C → D → E. A is continuous discipline.
**Reference**: `.dogfood/V3-PIVOT-TO-V02.md` for the broader pivot context.

## Why this exists

Plan 1's "sidebar takeover" was the wrong scope. It hides HA's sidebar via
`dockedSidebar='always_hidden'`, but the top bar (hamburger + addon-name
label + user avatar + theme picker chips) stays — that's HA's panel chrome,
which addons can't remove from inside an ingress iframe. User feedback from
V3 walkthrough:

> sidebar shouldnt be hidden, it shouldnt be *there!*

"Not there" = no HA chrome at all. broadsheet IS the page. The only way to
achieve that while staying installable as an HA add-on is to **stop being
an HA panel iframe**: addon container still runs nginx + sidecar, but on a
dedicated host port that the browser hits directly. No ingress. No panel
chrome. No HA wrapping anywhere.

harold.local already proves the architecture works (separate SvelteKit
frontend on its own nginx, calling HA via WS+LLAT). Theme G is the same
shape, packaged as the standard HA addon for distribution.

## Decisions locked (with user, 2026-05-16)

| Decision | Choice | Rationale |
|---|---|---|
| Delivery path | Addon-served nginx on dedicated host port | Bypasses HA ingress entirely. No HA chrome. Same lifecycle as today (addon repo, CI, GHCR). Plugin contract + sidecar API stay identical. |
| Sidecar location | Stays inside addon container | nginx proxies `/api/broadsheet/*` + `/api/harold-preset/*` to 127.0.0.1:8100. Same pattern as today, just no ingress proxy in front. |
| Auth path | LLAT entry on first visit | Same proven model as harold.local. SPA's `/setup` flow prompts for token, stores in localStorage, uses for WS auth. Works regardless of whether broadsheet is reached via dedicated port or `/local/`. |
| Discoverability | HA sidebar entry to enter + kebab to exit | Sidebar entry registered on first addon boot (writes to HA's `panel_iframe`-style sidebar config). KebabNav's existing "Open Home Assistant" link is the exit. Round-trip works without HA chrome around broadsheet. |

## Architecture before / after

### Before (v0.1.x)

```
Browser → HA frontend (top bar + sidebar + drawer) → ingress iframe
                                                     ↓
                                          nginx (in addon container)
                                                     ↓
                                          static SPA + /api/broadsheet/* → sidecar
                                          /api/harold-preset/* → sidecar
```

Problems:
- HA chrome wraps every broadsheet page
- Ingress URL has random rotating token in the path (`/api/hassio_ingress/<token>/...`)
- nginx has to sub_filter rewrite every `/_app/` and `/favicon` path with the ingress prefix
- Plan 1's `sidebar_takeover` is a workaround that only hides part of the chrome
- runtime-env.js carries SUPERVISOR_TOKEN baked in (auth tied to addon lifecycle)

### After (v0.2)

```
Browser → http://homeassistant.local:8124/ → nginx (in addon container)
                                              ↓
                                              static SPA (boots, prompts for LLAT
                                              on first visit, stores in localStorage)
                                              + /api/broadsheet/* → sidecar
                                              + /api/harold-preset/* → sidecar

Browser → HA WS (homeassistant.local:8123/api/websocket) with user's LLAT
                                              ↓
                                              full HA state, full subscribe API,
                                              full service-call access
```

Properties:
- No HA chrome anywhere
- Stable URL (no rotating ingress token)
- nginx config simpler (no sub_filter rewrites, no ingress-prefix games)
- LLAT-based auth — works in a regular browser tab, no HA-session dependency
- HA sidebar entry (registered by addon installer) lets users enter broadsheet
  with one tap from HA proper
- KebabNav "Open Home Assistant" entry (target="_top" `/`) is the exit

## Implementation breakdown (changes by file)

### Addon repo (`broadsheet-addon/`)

**`broadsheet/config.yaml`** — substantial:
- Remove: `ingress: true`, `ingress_panel: true`, `panel_*`
- Add: `ports: { "8124/tcp": 8124 }` (or whatever default port)
- Add: `ports_description: { "8124/tcp": "broadsheet HTTP — your dashboard URL" }`
- Add: `webui: "http://[HOST]:[PORT:8124]"` (HA UI shows OPEN WEB UI button)
- Keep: `homeassistant_config: rw` (for HA sidebar entry write + blueprint install)
- Remove: `sidebar_takeover` option (no sidebar to take over)

**`broadsheet/run.sh`** — substantial:
- Remove: ingress entry / port reading from bashio
- Remove: SUPERVISOR_TOKEN bake into runtime-env.js (user provides LLAT)
- Remove: sidebar.py invocation + SIGTERM revert (no takeover anymore)
- Add: sidebar-entry registration on first boot (write to HA's
  `lovelace.dashboards` or `panel_custom` config; need to investigate which is
  cleanest for "tap entry → open broadsheet URL in new tab / target=_top")
- Keep: theme install (with-marker logic stays)
- Simplify: nginx-config tempio rendering (just port + sidecar address, no
  ingress-prefix substitutions)

**`broadsheet/nginx.conf.tpl`** — simplify:
- Remove: all `sub_filter` rules (no path rewriting needed without ingress)
- Remove: `location ~ /runtime-env\.js$ { alias ... }` (still served, just no
  rewriting)
- Keep: `location / { try_files $uri $uri/ /index.html; }` (SPA fallback)
- Keep: `location /api/broadsheet/ { proxy_pass http://127.0.0.1:8100/; }`
- Keep: `location /api/harold-preset/ { proxy_pass http://127.0.0.1:8100/harold-preset/; }`
- Keep: `location /plugin-assets/` static serve
- Listen on `8124` (or whatever port)

**`broadsheet/init/sidebar.py`** — deleted (no takeover to apply / revert).

**`broadsheet/init/register-panel.py`** (NEW) — first-boot:
- Use HA WS to register a sidebar entry pointing at broadsheet's URL
- The entry should be a `panel_custom` that's just a redirect, OR write a
  `panel_iframe` config entry to `lovelace.yaml`, OR use HA's
  `frontend/register_panel` WS API directly
- Mark broadsheet-managed entries with a known prefix so cleanup is safe
- On SIGTERM in run.sh: deregister the entry (similar to sidebar.py revert)

### SPA repo (`broadsheet/packages/core/`)

**`src/lib/ha/auth.ts`** — simplify:
- Remove: addon-mode SUPERVISOR_TOKEN detection (no more `__BROADSHEET_ENV__`
  carrying it) — actually keep the detection logic but make addon-mode optional
  (delivery-path 3 hybrid would still want it)
- LLAT mode stays as primary
- `detectAuthMode()` returns `'llat'` when localStorage has a stored token,
  `'none'` when not — bounces to `/setup`

**`src/routes/setup/+page.svelte`** — extend:
- Make the LLAT entry path the primary onboarding (was a fallback)
- Add HA URL field if HA isn't at the same origin (broadsheet on :8124, HA on :8123)
- Save URL + LLAT to localStorage

**`src/lib/ha/client.ts`** — extend:
- `connect()` takes `{url, llat}` instead of inferring from current origin
- WS URL becomes `<haUrl>/api/websocket`

**`src/routes/+layout.svelte`** — simplify:
- Remove: Plan 1 dockedSidebar localStorage write (no HA chrome to manage)
- TakeoverBanner can be retired or repurposed as "broadsheet is your dashboard"
  copy on the first /setup screen

**`src/lib/components/KebabNav.svelte`** — unchanged:
- "Open Home Assistant" entry stays (target="_top" `<haUrl>/`)
- Forget token entry stays

### CI (`builder.yaml`) — minor:
- Drop ingress-related env var passing if any
- Stage SPA build into `broadsheet/www/` (same as today)
- Rest unchanged

## Migration story (existing 0.1.73 users → v0.2)

The addon update from 0.1.x → 0.2.0 is a meaningful break:

1. **Sidebar entry that points at the OLD ingress URL becomes a dead link.**
   Mitigation: 0.2.0's first-boot register-panel.py deletes the old entry
   AND creates the new one.
2. **Users have to enter a LLAT once** post-update (replacing the implicit
   SUPERVISOR_TOKEN auth). Mitigation: clear /setup screen with copy + a
   "create a LLAT in HA" link. Time cost ~60s.
3. **Curation persists** — `/data/broadsheet.json` survives. No data loss.
4. **Plugin config persists** — same `/data/` mount.
5. **HA users' `frontend.user_data` from Plan 1 takeover** is left behind.
   0.2.0's run.sh runs sidebar.py one last time with mode=off on FIRST boot
   to revert any prior takeover, then deletes sidebar.py.

Worth a v0.1.99 transition release that does ONLY the migration prep (revert
takeover, delete sidebar entry) so 0.2.0 starts from a clean HA state for
every user.

## Risks + open questions

- **HA sidebar entry mechanism**: HA's panel-registration APIs are
  poorly documented. Worth a 30-min spike to confirm the cleanest path
  before writing register-panel.py. Three candidates: `panel_custom`,
  `panel_iframe`, direct WS `frontend/register_panel`. Each has trade-offs.
- **Port allocation**: 8124 might collide with an existing addon. Make the
  port configurable via addon options with a sensible default.
- **HTTPS / TLS**: If user has HA on HTTPS via Nabu Casa / reverse proxy,
  serving broadsheet on plain HTTP at a different port breaks mixed-content.
  Solution: addon could proxy through Nabu Casa OR document HTTPS setup
  separately. v0.2.0 ships HTTP-only; HTTPS as v0.2.1 polish.
- **LLAT rotation**: HA LLATs don't expire by default but users can revoke.
  broadsheet needs to surface "your token doesn't work anymore" cleanly
  (route to /setup with prefill).
- **First-paint UX**: User taps HA sidebar entry → broadsheet URL opens →
  /setup screen appears (asking for LLAT) → user pastes → app boots.
  Three steps for a fresh install. Acceptable; same as harold.local.

## Test plan

- Unit: existing 236 tests stay green (none of them test ingress-specific behavior)
- Addon: tar-deploy + addon-update test on canary. Verify:
  - SPA serves at `http://homeassistant.local:8124/` directly
  - Sidecar reachable via nginx proxy
  - First-visit prompts for LLAT
  - LLAT entry → WS connects → discovery surfaces
  - HA sidebar entry appears + tap opens broadsheet in same tab (target=_top redirect)
  - KebabNav "Open Home Assistant" exits cleanly
  - Addon update from 0.1.73 → 0.2.0 doesn't lose curation
  - Addon uninstall removes the HA sidebar entry
- Migration: install 0.1.99 first, verify sidebar takeover reverted; then
  install 0.2.0, verify clean architecture

## Out of scope for Theme G

- Onboarding flows (Theme B) — register-panel.py is a one-shot, not a
  user-facing flow primitive
- Presence-aware routing (Theme C)
- Content filtering (Theme D)
- TMDB depth (Theme E)
- Editorial polish (Theme A) — applied during Theme G implementation but
  not the focus

## Ship signal

v0.2.0 ships when:
1. Fresh install via HA addon store → addon installs + starts cleanly
2. HA sidebar shows new "broadsheet" entry
3. Tapping the entry opens broadsheet at the dedicated URL with NO HA chrome
4. /setup LLAT entry flow works
5. All v0.1.73 surfaces (the moment, lights, heat, etc., 4 settings surfaces, voice, harold-preset) render at the new URL
6. Addon uninstall reverts the sidebar entry + everything else
7. Manual dogfood walkthrough produces zero "where's the chrome" surprises
