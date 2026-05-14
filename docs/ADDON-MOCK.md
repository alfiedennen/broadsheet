# broadsheet — HA add-on mock

The "install in 2 minutes" claim is the gating requirement to compete
with ha-fusion. This document mocks the actual files + flow end-to-end
so we know it's real before we commit to the README copy that promises it.

---

## What "HA add-on" actually means

An HA add-on is a Docker container managed by HA's Supervisor. The
Supervisor:
- Reads a `config.yaml` manifest from the add-on repository
- Builds the Docker image (or pulls a prebuilt one)
- Runs it with environment variables / API tokens / volume mounts
  pre-wired
- Exposes a "Web UI" link in HA's add-on page
- Handles updates, logs, options UI, autostart, ingress

The user experience is:
1. **Add the add-on repository URL** in HA → Settings → Add-ons →
   3-dot menu → Repositories → paste `https://github.com/<TBD>/broadsheet`
2. **Find broadsheet in the add-on store**, click it, click **Install**
3. Wait 30s for the container to build/pull
4. Click **Start**
5. Click **Open Web UI** → broadsheet loads, already authenticated

Steps 1-3 are HA's UI. Step 4-5 is what our mock has to make work.

---

## File layout for the add-on repo

```
addon/                          ← separate repo from broadsheet/core
├── repository.yaml                        ← repo-level metadata
├── README.md                              ← shown in HA's add-on store
├── broadsheet/                            ← the actual add-on directory
│   ├── config.yaml                        ← manifest
│   ├── Dockerfile                         ← container build
│   ├── run.sh                             ← entrypoint (the auto-auth flow)
│   ├── nginx.conf                         ← reverse-proxy + static serving
│   ├── icon.png                           ← shown in store
│   ├── logo.png
│   └── translations/
│       └── en.yaml                        ← UI labels for the options panel
└── .github/workflows/
    └── builder.yaml                       ← multi-arch image build on tag
```

---

## `repository.yaml`

```yaml
name: broadsheet
url: https://github.com/<TBD>/addon
maintainer: <TBD>
```

Minimal. Just tells HA "this URL is an add-on repository, here's a name."

---

## `broadsheet/config.yaml` — the add-on manifest

```yaml
name: broadsheet
version: "0.1.0"
slug: broadsheet
description: >
  An editorial frontend for Home Assistant. Italic display serif,
  pages not screens, prose not specs.
url: https://github.com/<TBD>/broadsheet
arch:
  - aarch64
  - amd64
  - armv7
  - armhf

# Boot at HA boot, restart on crash
startup: services
boot: auto

# Web UI — what HA links from the add-on page
webui: http://[HOST]:[PORT:80]
ingress: true              # serve via HA's authenticated ingress proxy
ingress_port: 8099         # internal port broadsheet listens on inside the container
ingress_stream: true       # WebSocket support through the ingress proxy

# Sidebar entry — show in HA's left nav, no clicking through to the add-on page
panel_icon: mdi:home-heart
panel_title: harold home
panel_admin: false         # any HA user can access

# Map the add-on's persistent config volume to HA's `/addons/broadsheet`
map:
  - addon_config:rw

# Permissions
hassio_api: true           # access HA Supervisor API (for self-introspection)
homeassistant_api: true    # access HA Core REST/WS via supervisor proxy
hassio_role: default       # standard supervisor permissions

# Options shown in the add-on's Configuration tab
options:
  log_level: info
  curation_path: /data/broadsheet.json
  enable_plugins:
    - emanations
    - tmdb-tv
  tmdb_api_key: ""           # paste here if not set per-device
  region: GB

schema:
  log_level: list(trace|debug|info|notice|warning|error|fatal)
  curation_path: str
  enable_plugins:
    - list(emanations|ghost-cloud|tmdb-tv|calendar)
  tmdb_api_key: password?
  region: match(^[A-Z]{2}$)
```

**Key decisions captured here**:

- **`ingress: true`** — broadsheet is served via HA's *ingress proxy*,
  not as a separate port on the network. This means:
  - No CORS issues — the SPA is at `https://homeassistant.local:8123/api/hassio_ingress/<token>/...`
  - Auth is HA's own (the user is logged into HA already)
  - The Supervisor handles the auth handshake; we just receive the
    request authenticated
- **`panel_icon` + `panel_title`** — broadsheet appears as a sidebar
  entry in HA's main UI. One click from anywhere.
- **`map: [addon_config:rw]`** — `/data/` inside the container maps to
  `/addons/broadsheet/` on the HA host, persistent across container
  restarts. Where `broadsheet.json` lives.
- **`hassio_api` + `homeassistant_api` true** — gives us access to
  Supervisor API (`http://supervisor/`) and HA Core API
  (`http://supervisor/core/api/`) without explicit token paste
- **Options schema** — auto-generates the form HA shows in the add-on's
  Configuration tab. Users edit YAML there OR via a friendly dropdown
  UI HA renders for free.

---

## `Dockerfile`

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# BUILD_FROM is HA's hass-base image — comes with bashio, jq, tempio,
# and all the supervisor-aware tooling.

# Install nginx + node (for any runtime chunks; mostly nginx serves static)
RUN apk add --no-cache nginx

# Copy the prebuilt SPA. We DON'T build inside the container — the build
# happens in CI (multi-arch matrix on tag), the Docker image bakes the
# build/ output. Keeps the runtime image small (~30MB).
COPY rootfs/ /
COPY www/    /usr/share/broadsheet/www/

# Default plugins shipped in the image — toggleable via options
COPY plugins/emanations  /usr/share/broadsheet/plugins/emanations/
COPY plugins/ghost-cloud /usr/share/broadsheet/plugins/ghost-cloud/
COPY plugins/tmdb-tv     /usr/share/broadsheet/plugins/tmdb-tv/

EXPOSE 8099

CMD ["/run.sh"]
```

`BUILD_FROM` is set by HA's add-on builder to the right `hass-base`
image per architecture (aarch64, amd64, armv7, armhf). bashio +
supervisor-talk-tooling come for free.

---

## `run.sh` — the entrypoint + auto-auth flow

```sh
#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -e

# ── Read add-on options ─────────────────────────────────────────────
LOG_LEVEL=$(bashio::config 'log_level')
CURATION_PATH=$(bashio::config 'curation_path')
TMDB_KEY=$(bashio::config 'tmdb_api_key')
REGION=$(bashio::config 'region')

bashio::log.info "broadsheet starting up..."
bashio::log.info "  curation: ${CURATION_PATH}"
bashio::log.info "  region:   ${REGION}"

# ── Ensure curation directory exists ────────────────────────────────
mkdir -p "$(dirname "${CURATION_PATH}")"
if [ ! -f "${CURATION_PATH}" ]; then
    bashio::log.info "First boot — creating empty curation at ${CURATION_PATH}"
    cat > "${CURATION_PATH}" <<EOF
{
  "version": 1,
  "people": [],
  "areas": {},
  "entities": {},
  "pagePins": {},
  "voice": {},
  "plugins": {
    "emanations": {"enabled": false},
    "ghost-cloud": {"enabled": false},
    "tmdb-tv": {"enabled": $([ -n "${TMDB_KEY}" ] && echo true || echo false)}
  }
}
EOF
fi

# ── Discover ingress URL (broadsheet runs at this path INSIDE HA's UI) ──
# Supervisor exposes the assigned ingress entry via env vars when ingress is
# enabled. broadsheet's WebSocket connections go to the supervisor proxy,
# which authenticates them with the user's HA session cookie.
INGRESS_ENTRY=$(bashio::addon.ingress_entry)
bashio::log.info "  ingress: ${INGRESS_ENTRY}"

# ── Configure the SPA's runtime env ─────────────────────────────────
# At build time we DIDN'T bake VITE_HA_TOKEN. At runtime we generate
# a small JS file the SPA picks up before it boots. This avoids the
# "stale token in image" problem entirely.

mkdir -p /usr/share/broadsheet/www
cat > /usr/share/broadsheet/www/runtime-env.js <<EOF
// Injected by run.sh on each container boot.
// Read by +layout.svelte before the WS client constructs.
window.__BROADSHEET_ENV__ = {
  // Same-origin: WS connects to the SAME hostname/port the SPA was
  // loaded from, which is HA's ingress endpoint. Supervisor authenticates
  // via the existing HA session cookie — NO token paste required.
  ingressEntry: "${INGRESS_ENTRY}",
  region: "${REGION}",
  tmdbKey: "${TMDB_KEY}",
  curationEndpoint: "/api/broadsheet/curation",
  pluginsEnabled: $(bashio::config 'enable_plugins' | jq -c .)
};
EOF

# ── Render nginx config from template ───────────────────────────────
# tempio is HA's templating engine — substitutes env vars into a config file
tempio -conf /etc/nginx/nginx.conf.tpl -out /etc/nginx/nginx.conf

# ── Start a tiny sidecar API for /api/broadsheet/curation reads/writes ──
# The SPA can POST to /api/broadsheet/curation to update broadsheet.json.
# Tiny Python + aiohttp — keeps the curation file as the source of truth.
python3 /usr/share/broadsheet/sidecar.py \
    --curation-path "${CURATION_PATH}" \
    --bind 127.0.0.1:8100 &
SIDECAR_PID=$!

# ── Start nginx in the foreground ───────────────────────────────────
bashio::log.info "broadsheet ready at ingress entry ${INGRESS_ENTRY}"
exec nginx -g "daemon off;"
```

### What the auto-auth flow actually is

There are TWO paths depending on install method:

**Add-on install (ingress mode)** — the easy path:
- Browser is already logged into HA
- HA's ingress proxy at `/api/hassio_ingress/<token>/...` forwards to the
  add-on with the user's session AUTOMATICALLY authenticated
- Our SPA's WS connection at `wss://<ha-host>/api/websocket` carries the
  same session cookie → HA accepts → NO token paste, NO LLAT, NO setup form
- The first-load UX: open from HA sidebar → painting renders, lights work,
  zero clicks, zero pastes

**Docker / standalone install** — the harder path:
- No HA session in the browser
- User must paste an LLAT in the setup form (today's harold-home flow)
- OR use OAuth (HA supports it; we'd implement the redirect dance)
- For v0.1, ship LLAT-paste; for v0.2, add OAuth

The README's "two minutes" claim only holds for the add-on path. The
Docker path is "two minutes + paste a token". Be honest about that.

---

## `nginx.conf.tpl` — the served config

```nginx
worker_processes 1;
events { worker_connections 1024; }

# Connection-upgrade map for WebSocket support
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;

    server {
        listen {{ .ingress_port }} default_server;
        server_name _;

        root /usr/share/broadsheet/www;
        index index.html;

        # SPA fallback — any unknown path serves index.html
        location / {
            try_files $uri $uri/ /index.html;
        }

        # ── Curation API — sidecar Python service ──
        location /api/broadsheet/ {
            proxy_pass http://127.0.0.1:8100/;
            proxy_set_header Host $host;
        }

        # ── HA proxy — Supervisor's HA Core endpoint ──
        # This is the magic line. The Supervisor exposes HA Core at
        # http://supervisor/core/ from inside the add-on container,
        # AUTHENTICATED via the SUPERVISOR_TOKEN env var that's
        # auto-injected. We pass that through.
        location /api/ {
            proxy_pass http://supervisor/core/api/;
            proxy_set_header Authorization "Bearer ${SUPERVISOR_TOKEN}";
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_read_timeout 86400;
            proxy_buffering off;
        }

        # ── HA static /local/* — paintings, plugin assets, etc. ──
        location /local/ {
            proxy_pass http://supervisor/core/local/;
            proxy_set_header Authorization "Bearer ${SUPERVISOR_TOKEN}";
            proxy_set_header Host $host;
        }
    }
}
```

**The crucial trick**: the `proxy_set_header Authorization "Bearer
${SUPERVISOR_TOKEN}"` means the SPA NEVER sees a token, NEVER pastes a
token, NEVER stores a token. The Supervisor token is auto-issued per
container boot, scoped to the add-on, rotated automatically. The SPA
just talks to its own origin (`/api/...` and `/local/...`) and nginx
silently appends the Supervisor's auth on the way through.

This is what "two-minute install" means: install the add-on, click
Open Web UI, you're in. Zero credentials handled by the user.

---

## The sidecar — `sidecar.py`

```python
#!/usr/bin/env python3
"""Tiny aiohttp service for reading/writing broadsheet.json."""
from aiohttp import web
import json, argparse, asyncio
from pathlib import Path

routes = web.RouteTableDef()

@routes.get('/curation')
async def get_curation(request):
    p = Path(request.app['curation_path'])
    return web.json_response(json.loads(p.read_text()))

@routes.put('/curation')
async def put_curation(request):
    body = await request.json()
    if not isinstance(body, dict) or body.get('version') != 1:
        return web.json_response({'error': 'bad shape'}, status=400)
    p = Path(request.app['curation_path'])
    p.write_text(json.dumps(body, indent=2))
    return web.json_response({'ok': True})

@routes.get('/health')
async def health(request):
    return web.json_response({'status': 'ok'})

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--curation-path', required=True)
    parser.add_argument('--bind', default='127.0.0.1:8100')
    args = parser.parse_args()

    app = web.Application()
    app['curation_path'] = args.curation_path
    app.add_routes(routes)
    host, port = args.bind.split(':')
    web.run_app(app, host=host, port=int(port))

if __name__ == '__main__':
    main()
```

~30 lines. Reads + writes the curation file. Bound to localhost so
only nginx can reach it. The SPA's Settings UI POSTs here.

Could also be Node, Go, anything — Python because `hass-base` already
has it.

---

## CI — `.github/workflows/builder.yaml`

```yaml
name: Build add-on

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        arch: [aarch64, amd64, armv7, armhf]
    steps:
      - uses: actions/checkout@v4
      - name: Build broadsheet SPA
        run: |
          cd ../broadsheet  # checkout the core repo
          pnpm install --frozen-lockfile
          pnpm build
          cp -r build/* ../addon/broadsheet/www/
      - name: Build add-on image
        uses: home-assistant/builder@master
        with:
          args: |
            --${{ matrix.arch }} \
            --target /data/broadsheet \
            --image "{arch}" \
            --docker-hub ghcr.io/<TBD>
```

Cross-compiles for the four supported HA architectures on every tag.
Pushes to GHCR. HA's add-on builder pulls from GHCR when the user
installs.

---

## End-to-end install timing

Tested mentally against HA's actual flow:

| Step | Time | What happens |
|---|---|---|
| Add repository URL | ~5s | HA fetches the repo, parses `repository.yaml` |
| Click broadsheet → Install | ~30s | Image pull from GHCR (depends on bandwidth) |
| Click Start | ~3s | Container boot, run.sh executes, nginx starts |
| Click Open Web UI | ~1s | Browser navigates to HA's ingress URL |
| SPA loads + WebSocket connects | ~2s | First paint with live state |

**Total: ~45-60s on a fresh install.** Well under the 2-minute promise.

---

## What this commits us to

- **A second repo**: `addon` separate from `broadsheet`. The
  add-on lifecycle (HA add-on store, multi-arch builds, version-tagged
  releases) is different from the SPA core's. They evolve at different
  cadences.
- **Multi-arch CI**: building for amd64 + aarch64 + armv7 + armhf on
  every tag. Have to test on at least amd64 + aarch64 (Pi 4/5).
- **The sidecar Python service**: 30 lines today, but a real attack
  surface. Need to validate input on PUT (JSON schema check beyond the
  shape sniff), need to rate-limit, need to disable when running
  outside the add-on context.
- **Config schema discipline**: every option we expose in `config.yaml`
  is forever (or migrated). Plugin enable/disable as a list is fine
  for v0.1; per-plugin config gets messy fast — design carefully.
- **Documentation for the Docker path**: people who install via Docker
  Compose don't have ingress + Supervisor. They paste a token. That
  flow needs its own README section + ideally OAuth in v0.2.
- **An icon / logo**: HA's add-on store renders these. They need to
  exist + be on-brand. Bounded design work.

---

## What I'm worried about

- **Supervisor token scope**: the `SUPERVISOR_TOKEN` is scoped to what
  the `hassio_role` permission allows. We requested `default`. Need to
  verify it actually has access to all the WS endpoints we use
  (subscribe_events, area_registry/list, etc.). If not, we need a
  higher role and that affects the install confidence ("this add-on
  wants admin permissions on your HA").
- **Ingress + WebSocket**: need to verify the ingress proxy actually
  passes the WebSocket upgrade through cleanly with `ingress_stream:
  true`. Some add-ons have hit issues here. Test before promising.
- **Update flow**: when broadsheet ships v0.2, how does HA know? HA's
  add-on store polls the repository periodically and shows update
  badges. Need to verify our `version` bumping in `config.yaml` triggers
  this correctly.
- **The "first boot" curation file**: writing a default
  `broadsheet.json` with `plugins.emanations.enabled: false` means new
  installs DON'T see Emanations until they enable it in Settings.
  That might be the right default (slim install) or the wrong one
  (people miss the killer demo). Test with first-time users.
- **Backups**: HA backs up add-on config (the `addon_config` map). So
  `broadsheet.json` is in the user's HA snapshot. Good — they don't
  lose curation across HA restores. Make sure paintings volume is
  also in the backup map.
