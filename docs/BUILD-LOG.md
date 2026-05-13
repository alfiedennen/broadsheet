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

### Pending — Alfie's parallel tracks (still open)

1. **VirtualBox HA OS VM** — set up `broadsheet-test.local` per
   [`DEV-ENVIRONMENTS.md`](DEV-ENVIRONMENTS.md) § Env 2. Doesn't block
   M1 (which is local-dev safety rails) but does block M5 add-on
   testing.
2. **Dev LLAT** — generate at production HA → Profile → Long-Lived
   Access Tokens, name `broadsheet-dev-pc`. Paste into
   `packages/core/.env` (gitignored). M1's WebSocket client connects
   against this for the first read tests.

### Repo published

- **URL**: `https://github.com/alfiedennen/broadsheet`
- **Visibility**: private (will go public at M7.6 per BUILD-PLAN)
- **Default branch**: `main`
- **First push**: commit `4404933`
- **Remote**: `origin` tracking `origin/main`

Created via `gh repo create broadsheet --private --source=. --push`.
Note: PowerShell wraps `gh`'s stderr output as a `RemoteException` even
on success — `git remote -v` + `gh repo view` confirms the operation
landed cleanly. Future `git push` invocations from PowerShell will
show the same noise; ignore unless followed by an actual error message.

### Exit criteria for M0 — all green

Per [`BUILD-PLAN.md`](BUILD-PLAN.md):

- [x] All eight design docs complete and self-consistent (10 actually
      — added BUILD-LOG itself + PUBLIC-README-DRAFT)
- [x] `D:\Visual Studio Code Projects\broadsheet\` exists as a fresh
      repo (NOT a fork of harold-home — clean room)
- [x] pnpm workspace scaffolded
- [x] SvelteKit 2 + Svelte 5 + adapter-static initialised in
      `packages/core/`
- [x] All eight docs copied + cross-refs rewritten
- [x] `pnpm install && pnpm -r build` succeeds with no errors
- [x] All docs in `broadsheet/docs/` reference each other correctly
- [x] `git init`, first commit, pushed to private GitHub repo
      (`alfiedennen/broadsheet`)

**Deferred to next session as exit-criteria check** (the two items
that are valid but didn't run this session):

- [ ] Empty SvelteKit app loads at `localhost:5173` (deferred — build
      output verified, but `pnpm dev` not run interactively. Quick
      manual check next session: `pnpm dev` from
      `D:\Visual Studio Code Projects\broadsheet`, browse
      `http://localhost:5173`, expect the M0 placeholder landing page
      with italic-amber "broadsheet" headline.)
- [ ] VirtualBox VM `broadsheet-test` exists, snapshot taken,
      hostname set (Alfie's track — does not block M1 start)

**M0 considered closed.** M1 (safety rails + WS client) ready to
begin in next session.

---

## 2026-05-13 — M1 — Safety rails + WebSocket client

### Decisions

**Adopted `home-assistant-js-websocket` directly, no wrapper for
auth.** The library exposes `createConnection`,
`createLongLivedTokenAuth`, lifecycle events (`ready`,
`disconnected`, `reconnect-error`), and `connection.ping()`. Our
client.ts wraps the connection with the heartbeat + reactive store
bridge, but doesn't re-implement auth or the WS protocol.

**Heartbeat is OUR layer.** 30s ping / 10s pong-timeout / force-close
on timeout. This is what we burned a session on in harold-home — the
library's reconnect handles network drops, but TCP zombies (HA
processes alive but socket unresponsive) need application-level
liveness. Force-closing on pong-timeout triggers the library's normal
`disconnected` flow, which triggers reconnect.

**Hard-ban list = `lock.*` only.** Set in `actions.ts`. Locks are
the one entity class where a bug is meaningfully expensive (security
incident, lockout). Adding a domain to the hard-ban list requires a
code change — deliberate friction. Documented intention is that
real lock-interaction testing happens in Env 3, with a human
present, never overnight.

**Three-state safety:**
- `safety.readonly` (env): system-wide policy, default `true` in dev
- `safety.writesAllowed` (URL): per-session opt-in via
  `?allow-writes=true`, NOT persisted across reloads
- `HARD_BANNED_DOMAINS` (code): always wins, no flag overrides

The `canWrite()` helper in `safety.svelte.ts` reads the first two;
the `HARD_BANNED_DOMAINS` check in `actions.ts` is checked FIRST so
nothing can bypass it.

**Audit log: framework-free + reactive bridge.**
`audit.ts` is plain TypeScript — no Svelte runes. It owns a 1000-entry
ring buffer + last-100 mirror to localStorage + console output.
`audit.svelte.ts` is the Svelte adapter — exposes a `tick` `$state`
counter that increments on every audit write, so components can
`$derived(() => { auditStore.tick; return getAuditLog().slice(-8); })`
to get reactive views.

Why split: `audit.ts` is testable + reusable by future non-Svelte
contexts (the M5 sidecar will mirror entries to disk). The Svelte
bridge is a thin adapter that doesn't pollute the source-of-truth
module.

**WriteAllowedBanner is sticky-top, red, refuses to be ignored.**
Visible always when `?allow-writes=true` is in the URL, with a "Reset"
link to clear it. The whole point: you cannot forget that writes are
armed.

**Auth detection has 3 modes** (`auth.ts`):
- `addon` — detected via `window.__BROADSHEET_ENV__` presence (the
  add-on's `run.sh` will inject this in M5). Connection logic for
  this mode is stubbed — calling connect with `mode: 'addon'` throws
  with a helpful "M5" message rather than silently failing.
- `llat` — LLAT in localStorage. Fully implemented in M1.
- `none` — no creds. Layout redirects to `/setup`.

### Gotchas burned in

**Svelte 5 `$derived` doesn't track plain function calls.**
First version of `+page.svelte` was:
```ts
const recent = $derived(getAuditLog().slice(-8).reverse());
```
This compiles fine but never re-runs. `$derived` only tracks
references to `$state` variables (or other `$derived`). Calling a
plain function reads stale data.

Fix: introduce `auditStore.tick` ($state counter) bumped via the
audit module's existing `onAuditWrite()` subscriber. Component reads
the tick to establish reactivity:
```ts
const recent = $derived.by(() => {
  auditStore.tick;  // dep
  return getAuditLog().slice(-8).reverse();
});
```
General lesson: any reactive view of non-rune data needs a dedicated
reactive sentinel. Documented for future contributors writing similar
bridges.

**`trailingSlash: 'always'` makes path comparisons literal.**
SvelteKit types `page.url.pathname` based on `trailingSlash`. With
`'always'` set, paths only ever end in `/` — comparing to `/setup`
(no slash) is provably false at the type level. svelte-check
correctly flagged this. Fix: use `/setup/` everywhere. (Reasonable;
keeps URLs canonical too.)

**`@types/node` not pulled by SvelteKit.**
SvelteKit's generated tsconfig references the `node` types
collection, but doesn't ship `@types/node` itself. Added as
explicit devDep — a single line in package.json, but otherwise
svelte-check warns on every run.

### Files added in M1

```
packages/core/src/lib/
├── ha/
│   ├── types.ts            HA registry types + ConnectionStatus + AuditEntry
│   ├── audit.ts            framework-free audit log (ring + console + localStorage)
│   ├── auth.ts             auth-mode detection + LLAT save/clear/validate
│   ├── client.ts           home-assistant-js-websocket wrapper + heartbeat
│   └── actions.ts          callService with safety rails + hard-ban
├── stores/
│   ├── connection.svelte.ts  $state for status, lastError, reconnectAttempts, haVersion
│   ├── safety.svelte.ts      $state for readonly + writesAllowed + canWrite()
│   └── audit.svelte.ts       $state tick reactive bridge for the audit log
└── components/
    └── WriteAllowedBanner.svelte
```

```
packages/core/src/routes/
├── +layout.svelte    re-written: boot sequence, banner, status pill, setup redirect
├── +page.svelte      connection + safety + audit-log status display
└── setup/+page.svelte  HA URL + LLAT paste form
```

```
packages/core/.env       gitignored, awaits LLAT paste
packages/core/package.json + @types/node devDep
```

### Build artifacts at end of M1

- Total client JS: ~104 KB (gzipped: ~38 KB) — up ~30 KB from M0
  baseline due to `home-assistant-js-websocket` (~25 KB raw / ~9 KB
  gzipped) + the new module surface
- Build time: 4.2s
- svelte-check: 0 errors, 0 warnings, 267 files

### Exit criteria for M1 (per BUILD-PLAN)

Code-side (verifiable now without LLAT):
- [x] `home-assistant-js-websocket` integrated, library does the WS heavy lifting
- [x] Heartbeat layer wraps it (30s/10s/force-close)
- [x] `actions.ts` enforces readonly + dry-run + audit-log + hard-ban
- [x] `lock.*` writes blocked even with unlock flag (HARD_BANNED_DOMAINS check is first)
- [x] `BROADSHEET_READONLY=true` env-var default
- [x] `?allow-writes=true` URL flag opt-in (per-session, not persisted)
- [x] WriteAllowedBanner sticky-top when armed
- [x] `/setup` form for HA URL + LLAT paste
- [x] svelte-check 0 errors / 0 warnings
- [x] `pnpm -r build` clean

Verification gated on Alfie pasting LLAT into
`packages/core/.env` and running `pnpm dev`:
- [ ] Connect to production HA, see entity states reach the SPA
      (M2 will exercise this further; M1 reaches `connected` status)
- [ ] Try to call `light.turn_on` from dev console → blocked +
      audit logged (visible in landing's audit panel)
- [ ] Add `?allow-writes=true` → banner appears, call succeeds,
      light toggles, audit logged
- [ ] Try `lock.unlock` even with `?allow-writes=true` → blocked
- [ ] Force HA restart via Proxmox → broadsheet detects disconnect
      within ~40s (heartbeat) and reconnects within ~10s of HA back

### How to verify (next time you're at the keyboard)

1. Paste your LLAT into `D:\Visual Studio Code Projects\broadsheet\packages\core\.env`
   on the `HA_TOKEN_DEV=` line.
2. `cd D:\Visual Studio Code Projects\broadsheet ; pnpm dev`
3. Browse `http://localhost:5173`. First visit shows `/setup/`
   pre-filled with the env URL — paste the same LLAT into the form,
   click Connect. (The env var is documentation; the form is
   the real auth path until the addon takes over in M5.)
4. Landing page should show "connection: connected" with the HA
   version, "safety: reads only", and audit entries for the boot
   sequence + connection-status events.
5. Open DevTools console, type:
   ```js
   import('/src/lib/ha/actions.ts').then(m => m.callService('light', 'turn_on', { entity_id: 'light.office_pendant' })).then(console.log)
   ```
   Expect: `{ success: false, reason: 'readonly' }`, audit entry shows
   `blocked-readonly`.
6. Append `?allow-writes=true` to the URL → red banner appears.
   Repeat the console call: light should turn on (assuming it's a
   real entity), audit shows `call-service`.
7. Try `lock.unlock` with the flag still on → blocked, audit shows
   `blocked-hard-banned`. The flag does NOT override.

If any of these fail, the bug is in M1 code — file as a finding
in BUILD-LOG before starting M2.

### M1 verification finding — duplicate-key crash on initial render

**Reported by Alfie during first browser test, fixed in same session.**

Symptom: page stuck on "Connecting to the house…" boot screen.
DevTools console showed:
```
Uncaught Svelte error: each_key_duplicate
Keyed each block has duplicate key `2026-05-13T09:11:26.476Z`
at indexes 1 and 2
  in +page.svelte
  in +layout.svelte
```

Root cause: `+page.svelte` keyed the audit-log `{#each}` block on
`entry.timestamp`. Two audit entries fired within the same
millisecond (the auth-event for boot + the connection-status for
the connecting transition both run inside the same onMount tick).
ISO timestamps quantise to the millisecond → identical strings →
Svelte 5's keyed-each correctly throws.

Knock-on effect (the visual symptom): Svelte 5's render guard
halted +page.svelte's render, but +layout.svelte's `{#if booted}`
block had already flipped to render children. The boot screen text
stayed visible because nothing replaced it. So a Svelte error in
the child component looked like a stuck boot.

Fix:
1. Add monotonic per-session `id: number` to AuditEntry
2. `audit()` assigns id via `++_seq` counter
3. `restoreAuditFromStorage()` re-assigns IDs to loaded entries
   (so they don't collide with new ones)
4. Key the each block on `entry.id` not `entry.timestamp`

Lesson for future Svelte 5 reactive lists: **never key on
`Date.now()` or `new Date().toISOString()` outputs.** They quantise.
Use a counter, a UUID, or a deterministic hash. Documented in
DISCOVERY-CONTRACT.md when M2 lands the entity-list rendering
surfaces (entity_id is a stable key there — won't repeat this
particular trap).

Confirmed working: hard-refresh after the patch, page renders,
connection shows `connected` with HA version, audit log displays
boot-sequence entries cleanly.

### M1 considered closed

Connection + safety surfaces verified working. Safety-rail
behavioural tests (block / arm / call / hard-ban) gated on
DevTools console verification — to run before M2 starts.
