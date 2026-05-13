# broadsheet HA add-on

The Home Assistant add-on packaging for broadsheet.

**Status: scaffold at M0.** Implementation lands at M5 per
[`../../docs/BUILD-PLAN.md`](../../docs/BUILD-PLAN.md). The detailed
mock for what these files will contain is in
[`../../docs/ADDON-MOCK.md`](../../docs/ADDON-MOCK.md).

Files arriving in M5:
- `repository.yaml` — repo-level metadata (the second repo
  `broadsheet-addon` will host this; this directory mirrors its
  structure for build-time bundling)
- `broadsheet/config.yaml` — add-on manifest (ingress, panel,
  Supervisor permissions)
- `broadsheet/Dockerfile` — container build (HA's hass-base + nginx +
  the prebuilt SPA)
- `broadsheet/run.sh` — entrypoint (read Supervisor token, render
  nginx config from template, start sidecar + nginx)
- `broadsheet/nginx.conf.tpl` — reverse-proxy config with
  `Authorization: Bearer ${SUPERVISOR_TOKEN}` injection
- `broadsheet/sidecar.py` — tiny aiohttp service for `broadsheet.json`
  reads/writes
- `broadsheet/icon.png` + `broadsheet/logo.png` — store assets
- `broadsheet/translations/en.yaml` — UI labels for HA's options panel

Build pipeline ships in M5 via
`broadsheet-addon/.github/workflows/builder.yaml` — multi-arch matrix
(amd64 + aarch64 minimum, armv7 + armhf if QEMU cooperates).
