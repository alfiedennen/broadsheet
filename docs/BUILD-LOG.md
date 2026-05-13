# broadsheet — build log

The running journal of the v0.1 build. Decisions, fixes, gotchas,
lessons. Append-only chronologically. Each entry dated, scoped to a
milestone (M0–M7 per [`BUILD-PLAN.md`](BUILD-PLAN.md)).

The format: terse but specific. Future-you (and contributors) needs
to know *why* a thing is the way it is, not just *what* it is.

---

## 2026-05-13 — M0 — Repo scaffolding

### Decisions

**Workspace shape: pnpm workspaces, not npm or yarn.**
Single source of truth (`pnpm-workspace.yaml`), cleanest plugin-as-
peer-dep model, harold-home's existing tooling is pnpm. Pinned
`pnpm@11.1.1` via `packageManager` field so contributors get the
same version automatically (corepack-aware).

**`apps/addon/` is NOT in the pnpm workspace.**
The add-on is a Docker container with its own Dockerfile + nginx +
sidecar Python service — not a JS package. Excluding it from
`pnpm-workspace.yaml` keeps `pnpm install` clean and prevents
accidental npm-pulling of nginx-shaped things. The add-on bundles
the prebuilt `packages/core/build/` output via the CI workflow at
M5; no runtime dependency on pnpm.

**SvelteKit 2 + Svelte 5 + `adapter-static`, SPA mode.**
- `ssr = false` + `prerender = false` in root `+layout.ts` — the whole
  app is a static SPA shell that hydrates client-side and talks to HA
  over WebSocket. Matches harold-home's proven shape.
- `fallback: 'index.html'` in `adapter-static` config — any unknown
  route serves index.html, client-side router takes over. Required
  for SPA behaviour.
- `paths.relative: true` — generates relative asset URLs, important
  for HA Ingress where the path prefix is dynamic. See
  [`PREMORTEM-DIFF.md`](PREMORTEM-DIFF.md) §
  "`paths.base` + `X-Ingress-Path`".

**`home-assistant-js-websocket` as a runtime dep.**
Pinned in `packages/core/package.json` from the start. Per
[`PREMORTEM-DIFF.md`](PREMORTEM-DIFF.md) §1 of the TL;DR, we don't
roll our own client. The compressed delta protocol + cache replay +
reconnect logic are the canonical implementation. Adopting it now
(rather than later) means no migration cost downstream.

**Plugin packages exist as stubs at M0.**
`packages/emanations/`, `packages/ghost-cloud/`, `packages/tmdb-tv/`
each have a `package.json` + README only. Their `build` script is a
no-op (`echo ... && exit 0`) so workspace-wide `pnpm -r build`
succeeds cleanly. Real implementations land post-v0.1 — but the
workspace shape is committed now so the contract is visible.

### Toolchain at scaffold time

- Node v22.14.0 (Windows)
- pnpm 11.1.1 (installed via `npm install -g pnpm`, NOT corepack)
- git 2.53.0.windows.3

### Gotchas burned in

**Corepack failed to enable pnpm on Windows.**
`corepack enable pnpm` errored with `EPERM: operation not permitted,
open 'C:\Program Files\nodejs\pnpm'`. Node 22's corepack tries to
write a shim to the Node install directory, which is admin-only on
Windows. Workaround: `npm install -g pnpm` writes to the user's npm
prefix instead, no admin needed. Documented here so any other
Windows contributor knows the trap.

**Bash on Windows chokes on `D:\Visual Studio Code Projects\` paths.**
The unquoted backslashes inside double-quoted strings break Git Bash's
parser. Switched to PowerShell for all build commands. Documented in
the parent project's CLAUDE.md ("Path rendering" rule). All build
commands in BUILD-LOG.md will be PowerShell going forward unless
explicitly noted.

**pnpm 11 blocks postinstall scripts; needs `allowBuilds` not
`onlyBuiltDependencies`.**
First `pnpm install` exited 1 with `[ERR_PNPM_IGNORED_BUILDS]
Ignored build scripts: esbuild@0.21.5`. esbuild's install script
fetches the prebuilt platform binary — required for Vite to work.
Two surprises:
1. Adding `onlyBuiltDependencies: [esbuild]` to `pnpm-workspace.yaml`
   (the pnpm 9/10 syntax) didn't work — pnpm 11 ignored it AND kept
   re-injecting an `allowBuilds: esbuild: set this to true or false`
   placeholder line.
2. The fix is `allowBuilds.esbuild: true` in `pnpm-workspace.yaml`.
   That's a *map* keyed on package name, not a list. Documented in
   the workspace file with a comment explaining why esbuild is safe.

Future contributors hitting this on a different package: same fix,
add the package as another key under `allowBuilds:`. If unfamiliar
with the package, vet the postinstall script first
(`pnpm view <pkg> scripts.postinstall`).

**Build verification: `pnpm -r build` succeeded.**
- `packages/core`: SvelteKit + adapter-static built cleanly → `build/`
- `packages/emanations`, `ghost-cloud`, `tmdb-tv`: stubs no-op as
  intended

Bundle sizes at M0 (sanity baseline — these will grow as the discovery
+ page layers land):
- Total client JS: ~74 KB (gzipped: ~30 KB)
- Largest chunk: `BGEnuA6d.js` 28.6 KB / 11.0 KB gzipped (Svelte
  runtime + router)
- CSS: 1.1 KB total
- Build time: 4.5s

### Files created in M0

```
broadsheet/
├── package.json                    workspace root
├── pnpm-workspace.yaml
├── .npmrc
├── .gitignore
├── .editorconfig
├── LICENSE                         MIT
├── README.md                       placeholder; PUBLIC-README-DRAFT becomes this at v0.1.0
├── packages/
│   ├── core/                       SvelteKit 2 + Svelte 5 SPA
│   │   ├── package.json
│   │   ├── svelte.config.js
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── .prettierrc
│   │   ├── .gitignore
│   │   ├── .env.example
│   │   ├── src/
│   │   │   ├── app.html
│   │   │   ├── app.css             token placeholder; full system in M3
│   │   │   ├── app.d.ts
│   │   │   ├── lib/index.ts        public exports — empty at M0
│   │   │   └── routes/
│   │   │       ├── +layout.svelte
│   │   │       ├── +layout.ts      ssr=false, prerender=false
│   │   │       └── +page.svelte    M0 placeholder landing
│   │   └── static/
│   │       └── favicon.svg
│   ├── emanations/                 stub package
│   ├── ghost-cloud/                stub package
│   └── tmdb-tv/                    stub package
├── apps/
│   └── addon/                      scaffold; M5 implements
└── docs/                           10 docs copied from harold-home/docs/
    ├── ADDON-MOCK.md
    ├── ARCHITECTURE.md
    ├── BUILD-LOG.md                this file
    ├── BUILD-PLAN.md
    ├── DEV-ENVIRONMENTS.md
    ├── DISCOVERY-CONTRACT.md
    ├── PREMORTEM-DIFF.md
    ├── PUBLIC-README-DRAFT.md
    ├── RENDERER-CONTRACT.md
    ├── SETTINGS-SCHEMA.md
    └── SETTINGS-UI.md
```

### Cross-reference rewrite

Docs were originally written in `harold-home/docs/` with filenames
prefixed `BROADSHEET-`. Copied to `broadsheet/docs/` with the prefix
stripped (since they're now in-repo). Internal cross-references
rewritten via PowerShell `-replace` regex:
- `D:\Visual Studio Code Projects\harold-home\docs\BROADSHEET-` → `` (removes the absolute-path form)
- `BROADSHEET-` → `` (removes the filename-only form)

9 of 10 docs had references that needed fixing. Only `SETTINGS-UI.md`
was unchanged (no cross-refs with that prefix in the body).

### Pending — Alfie's parallel tracks

Two manual things that don't block scaffolding but block M1:

1. **VirtualBox HA OS VM** — set up `broadsheet-test.local` per
   [`DEV-ENVIRONMENTS.md`](DEV-ENVIRONMENTS.md) § Env 2.
2. **Dev LLAT** — generate at production HA → Profile → Long-Lived
   Access Tokens, name `broadsheet-dev-pc`. Paste into
   `packages/core/.env` (gitignored) for M1 to consume.

### Exit criteria for M0

Per [`BUILD-PLAN.md`](BUILD-PLAN.md):

- [x] All eight design docs complete and self-consistent (10 actually
      — added BUILD-LOG itself + PUBLIC-README-DRAFT)
- [x] `D:\Visual Studio Code Projects\broadsheet\` exists as a fresh
      repo (NOT a fork of harold-home — clean room)
- [x] pnpm workspace scaffolded
- [x] SvelteKit 2 + Svelte 5 + adapter-static initialised in
      `packages/core/`
- [x] All eight docs copied + cross-refs rewritten
- [ ] `pnpm install && pnpm -r build` succeeds with no errors
- [ ] Empty SvelteKit app loads at `localhost:5173`
- [ ] All docs in `broadsheet/docs/` reference each other correctly
- [ ] VirtualBox VM `broadsheet-test` exists, snapshot taken,
      hostname set (Alfie's track)
- [ ] `git init`, first commit, push to private GitHub repo

Last three items finish in this session before M0 closes.
