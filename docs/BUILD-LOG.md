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

### M1 verification — behavioural tests via Chrome MCP

Driven via the Chrome MCP extension. Results captured live from
the running SPA + the live HA WS connection.

**1. Connection live.** `dd[data-status="connected"]` rendered.
   Audit shows boot-sequence entries: auth-event → connecting →
   connected (HA 2026.5.1). PASS.

**2. Readonly blocks dummy `light.turn_on`.**
   `callService('light', 'turn_on', { entity_id: 'light.test_dummy_does_not_exist' })`
   → `{ success: false, reason: 'readonly' }`.
   Audit: `blocked-readonly: light.turn_on`. PASS.

**3. Hard-ban fires before readonly check.**
   `callService('lock', 'unlock', { entity_id: 'lock.front_door' })`
   in readonly mode → `{ success: false, reason: 'hard-banned' }`
   (NOT `'readonly'`). Audit: `blocked-hard-banned: lock.unlock`.
   Confirms the ordering in actions.ts: hard-ban is checked first,
   no flag can override. PASS.

**4. `?allow-writes=true` arms writes + lamp actually toggles.**
   - Banner rendered: "⚠ Writes allowed in this session — refresh
     to reset Reset"
   - `dd[data-status="writes"]` showed "WRITES ARMED"
   - Read `light.office_table_lamp` state: `"on"`
   - `light.toggle` → `{ success: true }` → state became `"off"`
     (verified via `get_states`)
   - `light.toggle` again → `{ success: true }` → state back to `"on"`
   - `returnedToOriginal: true` ✅
   - Audit: two `call-service: light.toggle` entries.
   PASS — the actual desk lamp briefly toggled off and back on.

**5. Hard-ban under armed flag.** With `?allow-writes=true` still
   in URL, `callService('lock', 'unlock', { entity_id: 'lock.front_door' })`
   → `{ success: false, reason: 'hard-banned' }`. Audit:
   `blocked-hard-banned: lock.unlock`. The flag does NOT override.
   Front door was never sent the unlock command — wrapper blocked
   before reaching HA. PASS.

**6. Heartbeat wiring** (light test, full restart deferred).
   - `connection.ping()` round-trips in **3ms** — healthy WS link
   - `connection.eventListeners` present — our `addEventListener`
     wiring landed in the library's registry
   - Status store reports `'connected'`
   - Heartbeat timer machinery (30s ping / 10s pong-timeout /
     force-close) is in client.ts but not destructively triggered
     in M1 — full disconnect-and-recover test is part of Env 3
     soak per BUILD-PLAN M6 (which uses real HA restarts in
     production canary). PASS at the wiring level; full validation
     deferred.

### M1.fix2 — Vite dev-mode dual-module-instance trap

**Surfaced during MCP-driven verification.** Our test JS did
`await import('/src/lib/ha/client.ts')` from the page console.
That returned a **different module instance** than the one
+layout.svelte's onMount imported and called `connect()` on. The
fresh instance had `_connection: null` even though the layout's
instance was fully connected. Test failed with "no WS connection"
despite the page UI showing `connected`.

Root cause: Vite's dev server CAN return distinct module instances
for the same path under certain conditions (HMR session, dynamic
imports across script contexts, etc.). Top-level static imports
within a single page bundle are deduped reliably; dynamic imports
issued from arbitrary script contexts (like DevTools console) are
not.

Fix: layout.svelte exposes the same module-bound functions on
`window.__broadsheet_dev__` in dev mode (gated by
`import.meta.env.DEV`, tree-shaken from production builds):

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__broadsheet_dev__ = {
    callService,
    getConnection,
    getAuditLog,
    connection,
    audit
  };
}
```

DevTools / E2E tests use the handle:
```js
window.__broadsheet_dev__.callService('light', 'toggle', { entity_id: '...' });
```

This binds to the SAME module instance the layout uses. No more
dual-instance trap.

Lesson: any future test surface (M3 page tests, M4 settings tests)
should reach into the app via `window.__broadsheet_dev__`, not via
`import()` of the source module. Document at the top of the test
runner when M2/M3 tests start landing.

### M1 considered closed and verified

All five behavioural exit criteria met. Heartbeat wiring confirmed,
full destructive recovery test deferred to Env 3 per design.

Ready to start M2 (discovery layer).

---

## 2026-05-13 — M2 — Discovery layer (Layer 1 + Layer 2)

### Decisions

**Library-first, no hand-rolling.** `subscribeEntities` from
home-assistant-js-websocket gives us the compressed delta protocol +
auto-resubscribe-on-reconnect for free. Our `bootDiscovery()` wraps
it + adds the registry-list calls (which AREN'T auto-replayed by
the library, so we re-pull them on every `ready` event).

**Synthetic fallbacks for missing layer-1 data.**
- No floors configured → synthetic "All" floor with all areas
- Areas without floor + floors do exist → synthetic "Unassigned" floor
- Entities without area_id → synthetic "Unsorted" area

This is the **honest escape hatch** principle from the spec —
broadsheet surfaces what's unbucketed rather than silently dropping
it. M4 Settings UI lets users assign things from the Unsorted bucket
into real areas (or pin to a page).

**`*.svelte.ts` extension is required for runes.** First attempt
put `DiscoveryAPI` (a class with `$derived` getters) in
`discovery/index.ts`. Build failed: Svelte 5 only processes runes
in files with `.svelte.ts` / `.svelte.js` extensions. Renamed
`index.ts` → `index.svelte.ts` and added a thin `index.ts` that
re-exports from it — consumers' import path stays clean
(`$lib/discovery` works) and the compiler is happy.

**Reactive façade via class with `$derived` getters.** The
DiscoveryAPI class instantiates as a singleton, exposes derived
projections (`areas`, `floors`, `persons`) that automatically
recompute when the underlying `discoveryStore.*` changes. Pages
import `discovery` and read these fields directly inside their own
`$derived` blocks.

**Debounced registry refreshes.** `*_registry_updated` events can
fire in floods during mass renames or bulk imports. 500ms trailing-
edge debounce per registry collapses bursts into single re-pulls.

### Gotchas burned in

**1. `person/list` doesn't return `entity_id`.** HA's WS API for
`person/list` returns:
```json
{ "storage": [{ "id": "alfie_dennen", "name": "...", "device_trackers": [...] }] }
```
NOT entity_id keyed. The entity_id is constructed as `person.<id>`.

Symptom: `rankPresenceSensors` crashed in projection with
"Cannot read properties of undefined (reading 'replace')" because
`person.entity_id` was undefined. Stack pointed at heuristics.ts:48
but root cause was the registry pull.

Fix: added `normalisePersons()` in `registries.ts` that maps
`{id, ...}` → `{entity_id: 'person.' + id, ...}` plus defaults for
optional fields. Plus a defensive guard in `rankPresenceSensors`
(`if (!person.entity_id) return out`) so any future API surprise
degrades gracefully instead of crashing the whole projection.

Lesson: **never trust API shape descriptions without testing.**
The Person type in DISCOVERY-CONTRACT.md describes the *normalised*
shape we expose; the raw WS response is different. Need a clearer
boundary between "raw HA response types" and "normalised broadsheet
types" — for v0.1 this is per-call mapping in registries.ts; for
v0.2 it might justify a dedicated `raw.ts` types module.

**2. State.attributes is `Record<string, unknown>`, not strings.**
The HA WS protocol gives us untyped attribute blobs. Calling
`.test()` / `Set.has()` on `state.attributes.device_class` fails
TS strict mode because `unknown` isn't assignable to `string`.
Fix: explicit cast at each usage point —
`const dc = state?.attributes?.device_class as string | undefined`.

### What discovery reports against the real production HA

End-to-end verified via Chrome MCP:

| Metric | Value | Notes |
|---|---|---|
| Raw entities | 1,907 | from `config/entity_registry/list` |
| Live states | 1,154 | from `subscribe_entities` delta protocol |
| Devices | 185 | |
| Areas | 9 raw + 1 Unsorted = 10 projected | |
| Floors | 0 raw → synthetic "All" | floor registry empty |
| Persons | 2 | Alfie (android) + Elena (ios) |
| Labels | 0 | not used in this install |
| Categories | 0 | not used |

**Page bucket counts:** lights 5 / heat 2 / door 1 / tv 1 / body 0
(plus 2 cross-area Health-Connect entities for body).

**Unsorted bucket has 482 entities.** Most entities in this install
don't have area_id set on entity or device — including most of the
TRVs, hallway lights, etc. that CLAUDE.md describes by area. The
Unsorted bucket surfaces this clearly: "here's everything broadsheet
couldn't auto-place; please curate in Settings (M4)."

### Heuristic refinements logged for M2.x polish (followups, not
blockers)

These are real misses caught in verification. None block M2's
exit criteria; all are easy fixes for the heuristics file:

1. **Alfie's `★ best` sensor missed.** Heuristic looks for
   `sensor.<person.id>_committed_room` = `sensor.alfie_dennen_committed_room`.
   Actual sensor is `sensor.alfie_committed_room` (first-name only).
   Fell back to BLE bermuda tracker (also good). Fix: also try
   first-name slug. Or: M4 Settings UI lets user override directly.

2. **Living Room shows 4 TVs, actually 1.** `isTV` matches any
   media_player with "tv"/"television" in the name. Multiple media
   surfaces with "TV" in their name get caught. Tighten with
   `device_class` precedence over name match.

3. **Body cross-area = 2 entities, expected ~8.** Health Connect
   regex doesn't match `_confidence` / `_segment` suffix keywords
   (sleep_confidence, sleep_segment) — narrow keyword list. Easy
   widening.

4. **FRONT area has 2 locks.** Only 1 physical lock (Yale Conexis
   L2). Either HA has 2 lock entities for one device, or the
   pairing heuristic is double-counting. Worth investigating in
   M3 when /door is built.

### Files added in M2

```
packages/core/src/lib/discovery/
├── store.svelte.ts        Layer 1 reactive $state (singleton)
├── registries.ts          boot pulls + subscriptions + debounced refresh
├── heuristics.ts          lighting/TV/contact/Health-Connect/presence detection
├── domain.ts              Layer 2 projection (Floor → Area → DomainEntity)
├── page-map.ts            page slug → discovery filter table + unbucketed()
├── index.svelte.ts        DiscoveryAPI class with $derived getters
└── index.ts               thin re-export so $lib/discovery works
```

```
packages/core/src/routes/
├── +layout.svelte         updated: bootDiscovery() after connect(),
│                          discovery exposed on window.__broadsheet_dev__
└── +page.svelte           updated: Discovery card with counts, floor
                           breakdown, per-page area counts, sample area
                           bucket details
```

### Exit criteria for M2 (per BUILD-PLAN)

- [x] All six registries pulled at boot (floor, area, device, entity, label, category) + person/list
- [x] `subscribe_entities` open and feeding the states map
- [x] All `*_registry_updated` events subscribed
- [x] Domain projection produces a sensible Area[] from the real HA
- [x] At least 3 known rooms render correctly (alfies_office, Kitchen,
      Living Room all show their lights/sensors/media correctly per
      verification output)
- [x] Floor → Area mapping correct (synthetic "All" when no floors;
      ready to handle real floors when configured)
- [x] Labels surfaced as orthogonal tags (0 in this install, but
      pipeline works — labels[] populated on Area/Entity)
- [x] Unsorted bucket synthesised for 482 unassigned entities
- [x] All entities accounted for: every entity in registry either
      appears in an Area (real or Unsorted), or is skipped (disabled
      / config / diagnostic)
- [ ] Adding a new area in HA → reflected within 5s without refresh
      (deferred to live test during M3 — area_registry_updated
      subscription is wired but not behaviourally tested yet)
- [ ] Renaming an area in HA → picked up within 5s (same — wired,
      not behaviourally tested)

### M2 considered closed at the spec level

Architectural surface complete. Live-mutation tests (add area /
rename area / add entity) are deferred to a behavioural test pass
that fits naturally with M3 page rendering (where we'd see the UI
react). Heuristic refinement followups (1-4 above) are tracked but
do not block M2.

Ready to start M3 (page templates) — the six core pages will
consume `discovery.areasForPage(slug)` and render them in the
editorial register.

---

## 2026-05-13 — M3 — Page templates + editorial design system

### Decisions

**Full design token system in app.css.** Warm off-black bg
(#1a1814), amber accent (#c08a4a), four-font stack via Google
Fonts (Newsreader body / Instrument Serif display / IBM Plex Sans
caption / JetBrains Mono code). Semantic state colours (sage on,
rust alert, amber warn, gold info). All exposed as CSS variables
so plugin authors can extend cleanly.

**Hover scoped to pointer-fine, touch-target floor 44pt.**
`@media (hover: hover) and (pointer: fine)` for hover effects;
`@media (hover: none), (pointer: coarse)` enforces 44pt minimum
on all buttons + a-with-role-button. Same wall-tablet + phone +
desktop set works without per-surface tuning.

**Eight layout primitives ship as the M3 toolkit.**
- `PageShell` — width modes (narrow / default / wide / bleed)
- `Eyebrow` — № section number + name in mono caps
- `Hero` — eyebrow + italic display headline + dek (snippet-based)
- `OutLine` — ruled section divider with optional centred label
- `KebabNav` — sticky top-right kebab → full-height sheet (NAV_ORDER
  + Wall + Settings + Forget token)
- `RoomReveal` — collapsed area summary + expanded controls (snippet-
  based so each page composes its own controls)
- `UnsortedSection` — surfaces unbucketed entities with assign-via-
  Settings CTA
- `ProceduralPainting` — hash-seeded animated CSS gradient (default
  visual centre when no painting plugin installed)

Pages compose these — never reach inside, never duplicate the
patterns. The eight primitives ARE the broadsheet visual identity;
pages are choreography on top.

**Manifest composer is a pure function.**
`src/lib/manifest.ts` takes `{ persons, states }` and returns the
sentence. Sentence shape changes by count (empty / one / two / 3+)
and by whether rooms are knowable. Pure function = easy to test,
easy to override per-string in M4 Settings → /settings/voice.

**Painting + manifest is the landing in v0.1.** No control surface
on `/`. The page is for arrival, not action — tap the kebab to go
anywhere. Procedural gradient as the visual centre means the page
feels alive even with no `@broadsheet/emanations` plugin installed.

**Hard-banned domains visible-but-blocked, not hidden.**
On `/door` the Unlock button renders with full styling and a
"Lock writes are hard-banned in dev mode" banner above. Tapping
it shows the audit-logged block in the response (`last attempt:
hard-banned` chip below the lock tile). Design intent: the user
sees the affordance, understands the safety floor, knows exactly
what'll happen if they try.

**Six pages + Wall.** /lights /heat /door /tv /body all from
NAV_ORDER plus /wall as the dense-action-grid surface (separate
because its design intent — every action one tap — is opposite to
the editorial register's "three deliberate tap-targets above the
fold").

**TMDB content slot is a placeholder in core.** /tv shows an
"empty content slot" card with copy pointing at the
@broadsheet/tmdb-tv plugin. v0.1 ships without TMDB integration;
the slot is a placeholder + invitation to install the plugin.

**dev test handle exposes `discovery` too.** Added to
window.__broadsheet_dev__ in M3 wave so MCP-driven verification
can inspect domain projection live.

### Heuristic fix landed mid-M3 (M3.11b)

**Presence-sensor first-name slug fallback.** M2 caught that
Alfie's `★ best` sensor was missed because the heuristic looked
for `sensor.alfie_dennen_committed_room` and the actual sensor is
`sensor.alfie_committed_room`. Fix in heuristics.ts: try the
full slug first, then fall back to first-name only:
```ts
const candidates = [`sensor.${personSlug}_committed_room`];
const firstName = personSlug.split('_')[0];
if (firstName !== personSlug) {
  candidates.push(`sensor.${firstName}_committed_room`);
}
```
Landing manifest immediately changed from "Alfie home, Elena in
the kitchen." to "Alfie in the office, Elena in the kitchen." —
real visible improvement to the most-viewed surface.

### Gotchas burned in

**1. Svelte 5 `state_referenced_locally` warning.** First version
of `RoomReveal` had `let open = $state(startOpen)` where
`startOpen` was a prop. Svelte 5's lint correctly flags this:
prop changes after init don't update `open`. Tried wrapping in a
const — same warning (lint traces back to the prop). Tried
`untrack()` — overkill. Real fix: dropped the `startOpen` prop
entirely. No current consumer needs it; if a page ever wants a
specific room to start open, we'll add the API back behind a
different shape (e.g. ref-based programmatic open) when there's
a real use case. **Lesson: don't add props for hypothetical
needs — they end up costing more than they save.**

**2. `state.attributes.brightness` is `unknown`.** Same root
cause as M2's device_class casts. The `state.attributes` blob is
`Record<string, unknown>`. Pages read `brightness`, `temperature`,
`current_temperature`, `media_title`, etc. — every read needs an
explicit cast. Tedious but correct (HA can return any shape per
integration). For M3 we cast at point of use; for v0.2 might
introduce typed accessor helpers per domain.

**3. Area names are HA-side raw forms.** Several of your areas
have lowercase / underscored / SHOUT-CASE names from the registry:
`alfies_office`, `elenas_office`, `library`, `FRONT`,
`Utility_Room`. They render verbatim in headlines like
"alfies_office, library, and Living Room are on." This is HA's
data, not a broadsheet bug — but it reads ugly. M4 Settings will
let users override display names per area. For now: works,
visible, low-friction to fix once Settings ships.

### What works against your real HA (verified live via Chrome MCP)

| Page | Headline composed | Notes |
|---|---|---|
| `/` | "Alfie in the office, Elena in the kitchen." | painting drifting, dateline, people row, kebab nav |
| `/lights` | "alfies_office, library, and Living Room are on." | 5 areas + 4 scenes (Bright / Movie / Relax / Warm Evening); 25 unsorted lights surfaced |
| `/heat` | "Every radiator at frost." | 3 macros (Boost / All warm / All frost); 2 climate areas; 5 unsorted TRVs |
| `/door` | "All unlocked." | Hard-ban banner shown above; 2 lock tiles (the M2 dupe), 2 contacts |
| `/tv` | "Living room TV: off." | D-pad + Power/Vol/Mute/Home/Back; content slot stub |
| `/body` | "Quiet — Health Connect hasn't reported recently." | Only 2 of 8 sensors (regex limitation, M2 followup #3 confirmed) |
| `/wall` | "Everything within reach." | 3 BIG primary tiles + 5 room tiles with live state + 4 scene pills + 2 boost tiles |

**Real auto-toggle test:** library lights showed "2 of 2 on" while
office showed "2 of 2 on" — matches the live state of the house
during verification. Wall tablet's per-room toggle correctly
coloured `data-on=true` rooms with the accent border + glow.

### Files added in M3

```
packages/core/src/
├── app.css                                 design tokens (rewrite)
├── app.html                                fonts wired in head
├── lib/
│   ├── manifest.ts                         pure-function manifest composer
│   └── components/
│       ├── PageShell.svelte                width modes
│       ├── Eyebrow.svelte                  № X · SECTION
│       ├── Hero.svelte                     eyebrow+headline+dek
│       ├── OutLine.svelte                  ruled section divider
│       ├── KebabNav.svelte                 sticky kebab → sheet
│       ├── RoomReveal.svelte               area summary + expandable controls
│       ├── UnsortedSection.svelte          unbucketed surface
│       └── ProceduralPainting.svelte       hash-seeded gradient
└── routes/
    ├── +page.svelte                        / landing (rewrite — manifest + painting)
    ├── lights/+page.svelte                 NEW
    ├── heat/+page.svelte                   NEW
    ├── door/+page.svelte                   NEW
    ├── tv/+page.svelte                     NEW
    ├── body/+page.svelte                   NEW
    └── wall/+page.svelte                   NEW
```

### Followups carried into M3.x polish (post-commit)

These don't block M3 closure — pages render, actions fire, safety
rails hold — but they're worth a polish pass before M4 starts:

1. **Health Connect regex too narrow** (M2 followup #3 confirmed
   live). Currently catches `_sleep / _heart_rate / _hrv /
   _oxygen_saturation / _body_temperature / _respiratory_rate /
   _steps / _calories`. Misses `_confidence` and `_segment`
   suffixes. Need to widen OR drop the suffix requirement and
   match purely on the `pixel|wear` prefix + `sensor.` domain.
2. **Sleep segment value rendering "28800000.0 ms"** instead of
   "8h". Need a per-attribute formatter for known Health Connect
   units (ms → h for sleep_segment, etc.).
3. **2 lock entities for 1 physical front door** (M2 followup #4).
   Investigate which integration creates the duplicate; might be
   a Yale + frontend lock entity pair. Could de-duplicate via
   device_id grouping in Layer 2.
4. **TV detection still too liberal**. Living Room shows 4 TVs
   (only 1 physical TCL). Tighten via device_class precedence
   over name match.
5. **Area names are raw HA forms** (alfies_office, FRONT,
   Utility_Room). M4 Settings will let users override; until
   then, they read ugly in composed headlines.

### Bundle baseline at end of M3

- Build: clean, 4-5s
- svelte-check: 0 errors / 0 warnings, 295 files
- Source lines: substantial growth from M2 (+~2000 lines for
  primitives + 6 pages + landing rewrite)
- Bundle size will be checked in next build cycle

### M3 considered closed and verified

All seven pages render against the real HA install with composed
prose state, working actions (subject to safety rails), and the
editorial register. Polish followups logged. M4 (curation +
Settings UI) is ready to start.

---

## 2026-05-13 — M4 — Curation (Layer 3) + Settings UI

### Decisions

**Curation as a separate `lib/curation/` module.** Schema (`types.ts`),
persistence backend (`persistence.ts`), reactive store
(`store.svelte.ts`), and alerts engine (`alerts.svelte.ts`) live as
their own concern, separate from `lib/discovery/`. Discovery doesn't
know curation exists; curation reaches into discovery via the
optional `curation` argument to `projectDomain`. One-way dependency,
clean separation.

**Two persistence backends, runtime-picked.**
- `LocalStorageBackend` for dev / standalone (key `broadsheet:curation`)
- `SidecarBackend` for the M5 add-on path (`/api/broadsheet/curation`)

`pickBackend()` chooses based on `window.__BROADSHEET_ENV__` presence
(set by the add-on's run.sh). Same store API, same schema, same
migration pipeline — just different bytes-on-disk strategy.

**Optimistic write + revert pattern.** Every mutator function follows
the same shape:
1. Snapshot the current state via `$state.snapshot()`
2. Apply the updater to a copy
3. Write optimistically to `curationStore.current` — UI re-renders
4. Persist async via the backend
5. On failure: restore the snapshot, audit, surface error toast

The `tick` counter increments on every successful save so $derived
projections that need to know "something changed" can depend on it.

**Layer 3 applies inside `projectDomain`.** Rather than a separate
post-projection pass, the projection function now takes an optional
`curation` argument and applies overrides as it builds:
- Area rename / icon override / hide → before bucketing
- Entity rename / hide / unhide → in the visibility check
- Voice + person overrides → consumed at render time by composers

Single pass, no double-projection cost, no risk of intermediate
state being shown.

**Voice templates use simple `{var}` substitution.** Manifest
composer changed from hardcoded sentences to template lookups via
voice-string IDs (`manifest.empty`, `manifest.oneHome`,
`manifest.bothHomeDifferent`, etc.). Each template has documented
variables (`{name}`, `{room}`, `{a}`, `{aRoom}`, etc.). Settings UI
shows the variables inline as chips.

**5 visible Settings screens vs 7 in the spec.**
- Landing (alerts + section cards) ✅
- House (areas + entities — most-impactful) ✅
- People (presence sensor picker) ✅
- Voice (manifest overrides) ✅
- Deferred to M4.x: Paintings (no plugin to bind to), Plugins (no
  plugins to manage), Integrations (TMDB stub only), About (support
  bundle is heavy). Spec parity at M4.x; functional parity at M5
  when add-on packaging brings the sidecar.

**Toast component is layout-level.** One `<Toast>` instance in
+layout.svelte, driven by `lib/stores/toast.svelte.ts`. Pages call
`showToast(text, kind)` and the toast appears bottom-centre. 1.4s
auto-dismiss for success, 3s for error.

### Gotchas burned in

**1. `structuredClone` fails on Svelte 5 `$state` proxies.**
First version of the curation `update()` function used
`structuredClone(curationStore.current)` to deep-copy before
mutation. DataCloneError at runtime: "could not be cloned." Cause:
`$state(...)` wraps the object in a Proxy, and structuredClone
refuses Proxies.

Fix: use `$state.snapshot(curationStore.current)` — Svelte 5's
canonical "give me a plain object snapshot of this reactive state."
Returns a deep clone with proxies stripped.

Lesson: **whenever you need to clone reactive state, reach for
`$state.snapshot()`, never structuredClone or JSON-roundtrip.**
The latter loses Date / Map / Set fidelity; snapshot preserves it.

**2. `<input>` inside `<button>` is invalid HTML.**
First version of /settings/house had the area-rename input INSIDE
the .expand button (which toggled the area's expanded state).
svelte-check correctly flagged the a11y issue — clicks on the
input were bubbling to the parent button and collapsing the area
mid-rename. HTML spec also disallows interactive descendants of
button.

Fix: restructure so renaming-mode renders a different layout
entirely. Rename mode = .title-block.rename-mode (just the input);
non-renaming = the .expand button as before. Two render paths,
clean event flow.

Lesson: **interactive controls don't nest. The "everything inside
one big tap target" pattern works when the inside is text, NOT
when the inside is itself interactive.**

**3. `as never` cast was wrong for spread operations.**
persistence.ts had `{ ...def.integrations, ...(input.integrations as never) }`
to satisfy TS strict mode. TS infers spread of `never` as `never`,
which then doesn't satisfy `Record<string, PluginConfig>`. Fix:
cast the SOURCE to `object`, then cast the RESULT to the destination
type: `({ ...def.integrations, ...(input.integrations as object) } as Curation['integrations'])`.

Lesson: spread casts go on the result, not the source.

### Verified end-to-end via Chrome MCP

Live test against your production HA:

| Action | Result |
|---|---|
| Rename `alfies_office` → "Alfie's office" | ✅ landing + lights pages reflect immediately |
| Rename `library` → "Library" | ✅ |
| Rename `light.office_table_lamp` → "Desk lamp" | ✅ shown inside "Alfie's office" |
| Voice override `manifest.bothHomeDifferent` → custom semicolon template | ✅ landing reads "Alfie is in the office; Elena in the bedroom." |
| Hide `front` area | ✅ disappeared from 10 areas → 9 |
| Un-hide `front` area | ✅ restored to 10 areas |
| Persistence to localStorage | ✅ inspected via `JSON.parse(localStorage.getItem('broadsheet:curation'))` |

All four save operations returned `true`. localStorage holds:
```json
{
  "areas": { "alfies_office": { "rename": "Alfie's office" }, "library": { "rename": "Library" } },
  "entities": { "light.office_table_lamp": { "rename": "Desk lamp" } },
  "voice": { "manifest.bothHomeDifferent": "{a} is in the {aRoom}; {b} in the {bRoom}." }
}
```

### Files added in M4

```
packages/core/src/lib/
├── curation/
│   ├── types.ts                  schema + defaults
│   ├── persistence.ts            localStorage + sidecar backends + migrate
│   ├── store.svelte.ts           reactive store + mutator API
│   └── alerts.svelte.ts          alerts engine
├── components/
│   └── Toast.svelte              bottom-centre ephemeral notifications
└── stores/
    └── toast.svelte.ts           toast queue
```

```
packages/core/src/routes/settings/
├── +layout.svelte                sub-nav strip
├── +page.svelte                  landing (alerts + section cards)
├── house/+page.svelte            areas + entities (renames, hides)
├── people/+page.svelte           presence sensor picker (radio list)
└── voice/+page.svelte            templated string overrides
```

Plus `+layout.svelte` updates: bootCuration() in parallel with
bootDiscovery(), Toast component mounted, dev handle exposes curation
+ curationApi.

Plus `domain.ts` updates: optional `curation` arg, applied to area
rename / icon / hide + entity rename / hide / unhide before
bucketing.

Plus `manifest.ts` updates: `personOverrides` + `voice` arguments,
`fill()` template substitution for `{var}` placeholders.

### Followups carried into M4.x (deferred, not blockers)

1. **/settings/paintings** — needs the @broadsheet/emanations plugin
   to bind to. Lands when the plugin extraction happens.
2. **/settings/plugins** — needs at least one plugin in the registry.
   Lands with the same extraction work.
3. **/settings/integrations** — TMDB key + region picker. Light
   work, deferred to keep this session focused.
4. **/settings/about** — support bundle (zip with discovery state +
   redacted curation + connection log). Worth doing before public
   release for bug-report quality.
5. **Pin-to-page UI** — the curation API supports `pagePins`; the
   Settings UI doesn't surface pinning yet. Add to /settings/house
   per-entity row.
6. **Unhide entities** — UI for "show entities HA hid" is missing.
   Add an "include hidden" toggle to /settings/house.
7. **Reset / Export / Import** — store API supports them; UI doesn't
   surface yet. Lands with /settings/about.

### Bundle / build at end of M4

- svelte-check: 0 errors / 0 warnings, 310 files
- Build: clean

### M4 considered closed at the spec level

The full Layer 3 pipeline works end-to-end:
- Schema → persistence → reactive store → projection → page rendering
- Optimistic write with revert + toast
- Real renames change the editorial prose state on the landing + lights pages

**Settings is now the validator.** When the user tests it and reacts,
we'll know which polish items deserve priority before M5 packaging.

### M4.x — Vite stale-cache trap (post-commit)

**Symptom**: Alfie opened /settings/house and reported "styling
issues which means I cant test settings." Screenshot showed area
rows with light grey backgrounds, near-invisible text, action
buttons with the wrong background.

**Diagnosis (via Chrome MCP `getComputedStyle`)**:
- `.area-name` font-family = `Arial` (should be Instrument Serif)
- `.expand` button bg = `rgb(240, 240, 240)` (browser default,
  should be transparent inheriting warm bg)
- `:root` had only the M0 5 tokens (`--bg/--fg/--muted/--accent/--rule`)
  — the M3 rewrite added 30+ tokens
- `html, body` rule still showed `font-family: Newsreader, Georgia,
  serif` (M0 form, no `var(--font-body)`)
- Component-scoped `.expand` rule WAS loaded correctly

So `app.css` on disk was the M3 rewrite, but the browser was being
served the M0 version. Hard browser refresh didn't fix it — the dev
server itself was sending stale bytes.

**Root cause**: Vite's dep-optimisation cache (`node_modules/.vite/`)
and SvelteKit's generated tsconfig (`packages/core/.svelte-kit/`)
accumulate state across long dev sessions. When something gets out
of sync (probably the dev server got auto-restarted at some point
and re-cached an older version of app.css before subsequent edits
were saved), Vite happily keeps serving the cached version.

**Fix**:
1. Kill the dev server process (`Stop-Process -Id <pid> -Force`)
2. `Remove-Item -Recurse node_modules/.vite/`
3. `Remove-Item -Recurse packages/core/.svelte-kit/`
4. `pnpm dev` fresh — Vite re-bundles from source

**Verification post-fix**:
- `:root` now has all 30+ M3 tokens
- `button { background: none; ... }` reset is loaded
- `.area-name` font = `"Instrument Serif", Iowan, Georgia, serif`
- `.expand` button bg = `rgba(0, 0, 0, 0)` (transparent, correct)

**Lesson — recurring kind of bug**: when dev hot-reload starts
behaving strangely after a long session — especially when changes
to global CSS imports don't seem to apply — the first thing to try
is the cache nuke + restart sequence above. Don't waste time on
hard-refresh / DevTools network reset / Vite-specific config
flags; Vite's stale-cache failure mode is silent and the only
reliable cure is the nuclear option.

**For DEV-ENVIRONMENTS.md** (M4.x followup): document this in the
"Things that go wrong in Env 1" section so future contributors
don't burn time on it.

The user did NOT delete the saved settings during this — localStorage
is per-browser and unaffected by Vite cache state. Settings tests
can resume without re-doing renames.

---

## 2026-05-13 — M4.x — /settings/house restructure (device grouping + smart hiding)

### Why

After the Vite cache fix, Alfie tested /settings/house and surfaced
the real UX problem: a flat list of entities with Rename + Hide
buttons is unusable when one physical thing produces 6 entities and
the user has no way to tell which are real, which are duplicates,
and which are system plumbing.

Specific example from his FRONT door: 6 entities (`lock.front_door`,
`lock.front_door_2`, `binary_sensor.front_door_door`,
`binary_sensor.front_door_door_2`, `button.front_door_wake`,
`sensor.front_door_operator`) all named "FRONT DOOR" — homework, not
curation.

### JTBD framing

We renamed the screen's job from "rename and hide entities" to:
**"Make my dashboard show only the things I care about, in the rooms
they belong to, with a way to know what each thing actually does."**

Three sub-jobs nested:
1. **Identify** — what is this entity, and is it the live one?
2. **Place** — this thing is in this room (Unsorted entities)
3. **Suppress** — I don't need to see this because [reason]

### Decisions

**Smart defaults at the discovery layer**, not just UI hints. The
heuristic decision lives in `heuristics.ts` (`looksLikeSystemEntity`)
+ `domain.ts` (duplicate detection during projection). When an entity
is auto-hidden, it carries an `autoHideReason: 'duplicate' | 'system'
| 'integration' | null` field that flows through to:
- Pages: just don't render hidden entities (no change needed)
- Settings UI: surface the reason as a chip, offer a "force visible"
  override

This means the auto-hide affects the actual editorial pages too —
not just the Settings preview. `/door` will show 2 lock entities
becoming 1 visible lock + 1 hidden duplicate, matching the physical
reality. Same for `binary_sensor.front_door_door_2`.

**Curation `unhide: true` is the universal override.** Wins over HA's
`hidden_by`, over user's previous `hidden`, over broadsheet's
auto-hide. One mental model: "I want to see this regardless of any
hide source."

**Device grouping is a UI-layer concern.** The discovery layer
exposes `entity.deviceId` + a small `entity.device` summary
(`{id, name, model, manufacturer}`); the Settings page does the
grouping by `deviceId` at render time. Pages that don't care about
device grouping (everyone except Settings) ignore the field.

**Two parallel buckets per area: visible + hidden.**
`DomainArea.lights/switches/etc` are visible-only (pages render
these directly). `DomainArea.hiddenEntities` is a flat list of
HA-hidden + auto-hidden + user-hidden, sorted with duplicates first.
Pages don't read `hiddenEntities`; only `/settings/house` does.

### Heuristics in detail

**`looksLikeSystemEntity(entity)`** in `heuristics.ts` — pattern
matchers for HA's per-integration plumbing:
```ts
const SYSTEM_PATTERNS = [
  /^button\..*_(?:wake|identify|restart|update|reboot|reset|refresh|reload)$/i,
  /^sensor\..*_(?:battery|signal_strength|rssi|link_quality|connectivity|last_seen|last_updated|operator|esp_temperature|node_status|cpu_usage|memory_usage|wifi_strength)$/i,
  /^update\./i,
  /^select\..*_(?:log_level|profile|notification_action)$/i,
  /^number\..*_(?:polling_interval|update_interval|timeout|brightness_calibration|color_temp_calibration)$/i,
  /^binary_sensor\..*_(?:problem|update_available|connectivity)$/i
];
```

Caught against the Yale: `button.front_door_wake` (wake the radio),
`sensor.front_door_operator` (who last operated). Both correctly
hidden + tagged as 'system'.

**Duplicate detection** in `projectDomain` — a pre-pass over all
entities builds a `Map<\`${device_id}:${domain}\`, count>`. The FIRST
entity in registry order is treated as primary; subsequent ones get
`autoHideReason='duplicate'`. Caught the Yale's `lock.front_door_2`
+ `binary_sensor.front_door_door_2` immediately.

### Verified live against production HA via Chrome MCP

FRONT door cluster after the changes:

```
FRONT DOOR · Yale/August · MD-04I · 2 entities
  [LOCK]    FRONT DOOR    unlocked
  [CONTACT] FRONT DOOR    off

+ 4 hidden (2 duplicate · 2 system)
   FRONT DOOR · 4 hidden
    [CONTACT] front_door_door_2   duplicate    off
    [LOCK]    front_door_2        duplicate    unlocked
    [BUTTON]  front_door_wake     system       2026-04-19T08:27:31...
    [SENSOR]  front_door_operator system       alfie dennen
```

The `sensor.front_door_operator` showing "alfie dennen" as its state
is itself a teaching moment for the design: that's literally
metadata about who last operated the lock — exactly the kind of
thing that doesn't belong on the user-facing /door page but is
useful debug info if the user explicitly looks for it.

6 confusing rows → 1 device with 2 useful + 4 informatively-hidden.

### Files touched

- `lib/discovery/heuristics.ts` — added `looksLikeSystemEntity` + SYSTEM_PATTERNS
- `lib/discovery/domain.ts` — added `autoHideReason` + `device` summary to DomainEntity, added `hiddenEntities` to DomainArea, duplicate-detection pre-pass, visibility update
- `routes/settings/house/+page.svelte` — full rebuild for device grouping, domain badges, state-inline display, hidden-collapsed expander, per-entity unhide

### Lesson burned: Svelte 5 root-level snippets get exported

**Problem**: defining `{#snippet entityRow(entity)}` at the root of
the component template (direct child of the page's root) caused
svelte-check to complain `'entityRow' does not exist in type
'$$ComponentProps'` — Svelte 5 treats root-level snippets as named
slot props that the parent might pass.

**Fix**: wrap the snippet + its consumers in any HTML element
(I used a `<div class="house-area-block">`) so the snippet is
nested inside an element rather than at template root. Then it's
local-scope.

**Lesson**: when you want a re-usable snippet local to a single
component, define it inside an HTML element wrapper. Defining it as
a direct template-root child makes it a public component slot prop.

### Followups carried into M4.x.NEXT (still pending)

1. **Move-to-area for Unsorted** — the third leg of the original
   design proposal. Per-entity dropdown of areas + Move button that
   calls HA's `entity_registry/update_entity` to set the area. This
   is a real write against HA's registry, so it needs to flow
   through the safety wrapper. ~half a session of work.
2. **What's actually in the /settings/house entities for Unsorted?**
   Worth a check after the auto-hide changes — likely many of the
   482 unsorted entities are now auto-hidden (system noise, etc),
   making the "Unsorted" bucket smaller and more curatable.
3. **Show domain badges + state on the editorial pages too?** Right
   now /lights shows light names without domain. Probably overkill
   for editorial pages — they're for usage, not curation. Skip.

### M4.x considered closed at design level

Settings is now genuinely usable for the FRONT DOOR class of
problem. The next design test is: does the rest of Alfie's house
(Unsorted-heavy, lots of TRVs, lots of switches) read cleanly with
the same patterns?

---

## 2026-05-13 — M4.x Leg 3 — Move-to-area for Unsorted entities

### Why

The third leg of the original three-leg design plan from earlier
in M4. With Legs 1+2 done (device grouping, smart hiding) the
"identify" + "suppress" sub-jobs of /settings/house were solved.
The "place" sub-job — moving Unsorted entities into the right rooms
— still required manually editing in HA. This leg closes that loop
by writing area assignments directly to HA's entity registry from
the broadsheet UI.

Alfie's confirmation: tested Legs 1+2 against the rest of his house
("all really hold up and make all the difference"). Green-lit Leg 3.

### Decisions

**New module: `lib/ha/registry.ts`** — separate from `actions.ts`
because registry writes are conceptually different from service
calls. Service calls actuate hardware (turn on a light, unlock a
door); registry writes change metadata (area assignment, friendly
name). They share the same WS connection but warrant distinct
safety thinking.

**Registry writes are NOT gated by the readonly flag.** Setting an
entity's `area_id` can't unlock your front door. The hard-ban list
is service-call-specific (lock.unlock); it doesn't apply to registry
writes. Audit-log captures every registry write for observability,
but `?allow-writes=true` isn't required.

If a future case warrants gating (e.g. a hypothetical "delete
entity" action), add a separate flag rather than overloading the
service-call readonly. Keep the mental models distinct.

**WS message used**: `config/entity_registry/update` with
`{entity_id, area_id}`. Pass `area_id: null` to clear the
assignment (entity returns to Unsorted).

**Discovery picks up the change automatically.** The `entity_registry_updated`
event subscription that's been wired since M2 fires when HA writes
the new area_id; debounced 500ms re-pull of the entity registry
brings the change into broadsheet's domain model. End-to-end
latency in our tests: ~1.5 seconds from button click to UI
migration.

**UI: picker auto-visible for Unsorted, toggle for others.**
- Entities in `area.id === '__unsorted__'` (or anywhere their
  `entity.areaId === null`) show the Move picker inline by default.
  The "place" job is one click away — no extra tap to reveal.
- Entities already in a room show a "Move…" mini button alongside
  Rename/Hide. Clicking opens the picker. Default-collapsed because
  most entities don't need re-placing.
- Picker is a chip-row of all visible (non-curation-hidden) areas
  + "(no area)" pill for entities that ARE in a room (clicks send
  them back to Unsorted).
- The "current" area chip is shown faded + non-clickable so the
  user can see where the entity already is.

**Curation renames flow through to the picker.** The dropdown
shows your renamed area names ("Alfie's office", "Library"),
not the raw HA forms (`alfies_office`, `library`). One source of
truth for area display names — the picker uses the same Layer 2/3
projection.

### Verified live against production HA via Chrome MCP

Round-trip test using `light.hallway_pendant` (a Z2M group of 3
Third Reality pendants per Alfie's CLAUDE.md, sitting in Unsorted
because the entity has no area_id even though the device is
known to belong in the hallway):

| Step | Result |
|---|---|
| Pre-state: `light.hallway_pendant.areaId` | `null` (Unsorted) |
| Click "Front Hallway" in the picker UI | Calls `updateEntityArea` |
| `entity_registry/update` WS reply | `success: true` |
| Wait 1.5s for entity_registry_updated → debounced re-pull | |
| Post-move: entity.areaId | `"front_hallway"` ✓ |
| Visible in `area('front_hallway').lights` | true ✓ |
| Removed from Unsorted bucket | true ✓ |
| Visible in DOM under Front Hallway | confirmed ✓ |
| Reverted via API for test cleanup | `success: true` |

The picker correctly shows curation-renamed area names ("Alfie's
office", "Library") — same source of truth as the editorial pages.

### Files added in Leg 3

- `lib/ha/registry.ts` — `updateEntityArea(entityId, areaId)` +
  `updateAreaName(areaId, name)` (the latter unused in v0.1 but
  available for power users via dev console)
- `routes/+layout.svelte` — registry exposed on dev handle
- `routes/settings/house/+page.svelte` — entity-shell wrapper,
  move picker, movableAreas $derived, toggleMovePicker /
  moveEntity handlers, picker styles

### What this enables

- The "place" job for the 315 visible Unsorted entities (down from
  482 after auto-hide) is now a one-click affordance per entity
- Entities moved via broadsheet are persisted to HA's registry —
  visible to every HA frontend, every automation, every other tool.
  Not a broadsheet-private override.
- Reversible — clicking "(no area)" on a placed entity sends it
  back to Unsorted

### Followups beyond Leg 3 (deferred)

1. **Bulk move** — for users with many similar Unsorted entities
   (`sensor.kitchen_*` × N → all to Kitchen at once). v0.2.
2. **Smart suggestions** — heuristic that says "broadsheet thinks
   this entity belongs in Kitchen because (a) device is in
   Kitchen-area device-pile, (b) entity_id contains 'kitchen', (c)
   the same integration's other entities are mostly in Kitchen."
   Surface as a one-click "Accept suggestion" pill. v0.2.
3. **Search / filter the Unsorted list** — when there are 315
   entities, scrolling to find one is hard. Add a search box at
   the top of the Unsorted section. v0.2.
4. **Move at the device level** — if a device has 4 entities in
   Unsorted, "move whole device to Kitchen" should be one action.
   Requires adding `device_registry/update` to registry.ts. v0.2.

### M4.x Leg 3 closed; M4.x considered done overall

The full /settings/house design loop is now complete:
- **Identify** ✓ — device grouping + domain badges + state inline
- **Suppress** ✓ — auto-hide for duplicates + system entities
- **Place** ✓ — move-to-area picker

Next gate: M5 (HA add-on packaging) — what makes broadsheet
installable from the HA add-on store.

### M4.x.fix — duplicate-detection over-flagging (caught by Alfie testing)

**Symptom**: Alfie asked "why is the esp32 presence node we use
for trilateration in the bedroom hidden?" and pointed at
`sensor.presence_node_bedroom_watch_rssi` +
`sensor.presence_node_bedroom_phone_rssi`. Both flagged as
`autoHideReason: 'duplicate'` despite being separate functional
sensors (one tracking the watch beacon, one tracking the phone
beacon — both required for Bermuda trilateration).

**Root cause**: M4.x duplicate detection grouped on
`${device_id}:${domain}`. ANY second-or-later entity sharing a
device + domain was flagged duplicate. Worked correctly for the
Yale lock case (`lock.front_door` + `lock.front_door_2` — the `_2`
IS an orphan), but failed for any multi-purpose device that
legitimately produces many sensor entities — ESP32 BLE proxies,
multi-sensor TRVs (current_temp + setpoint + valve_position),
weather stations, etc.

**Magnitude**: ~168 functional sensors across the install were
incorrectly hidden. The "315 visible Unsorted" celebrated as
M4.x cleanup was partly this — auto-hide was sweeping real data
under the rug. Fix restores visible count to 483, with truly
conservative auto-hide (6 entities total: 3 duplicate + 3 system).

**Fix**: dedupe heuristic now requires entity_id base-name match
after stripping a trailing numeric suffix:

```ts
const stripNumSuffix = (id: string) => id.replace(/_(\d+)$/, '');
const key = `${e.device_id}:${stripNumSuffix(e.entity_id)}`;
// Two entities are duplicates iff they share device + this key
```

Examples:
- `lock.front_door` + `lock.front_door_2` → DUPLICATE
  (suffix-stripped both = `lock.front_door`)
- `sensor.bedroom_watch_rssi` + `sensor.bedroom_phone_rssi` → NOT
  duplicate (different base names)
- `sensor.weather_temp` + `sensor.weather_humidity` → NOT
  duplicate (different functional sensors on one weather station)

Plus removed bare `_rssi` and `_link_quality` from system patterns
(they were catching tracker RSSI sensors, which are functional
not system noise). Added `_uptime`, `_loop_time`, `_free_memory`
to system patterns to keep ESPHome diagnostic-style sensors
suppressed (those usually lack `entity_category: diagnostic`).

**Lesson**: heuristic over-aggression is silent and easy to miss.
Smart-hide MUST default to false-negative-biased (let some noise
through) rather than false-positive-biased (hide real data). The
"315 unsorted" win was illusory — accuracy beats perceived cleanup.

**Lesson 2 — diagnostic does most of the work**: 6 entities total
auto-hidden by broadsheet's heuristics across the entire install.
The reason isn't that broadsheet's heuristic is weak; it's that
HA's `entity_category: diagnostic` on integrations is doing 95% of
the noise suppression already. The smart-hide is a small fallback
for entities integrations forgot to mark, not the main mechanism.

**Verified post-fix**:
- bedroom presence_node RSSI sensors visible in Bedroom area
- FRONT DOOR cluster still de-dupes correctly (the actual `_2`
  orphans flagged, the `_wake` button + `_operator` sensor still
  system-flagged)
- Aggregate hidden count: 6 (was ~170)

### M4.x.fix3 — platform display + device-level hide/rename + Unsorted reframe (caught by user testing)

**Catalysts (all from one session of Alfie testing the live UI)**:

1. Office Heater Plug device shows mixed entity names because the
   user renamed `switch.office_heater_plug` to "Pixel 6 Plug" via
   HA's friendly_name but other 8 sub-entities + the device itself
   still display "Office Heater Plug." User asked: how do I rename
   the device?

2. Living Room TV Plug (10 entities, Sonoff Zigbee) was physically
   pulled but is still alive on the Z2M network reporting voltage.
   User can't remove it from HA because HA only deletes unreachable
   devices. User asked: how do I get it out of broadsheet's view?

3. Living Room shows 4 media_player entities for the TCL TV — same
   physical TV, four integrations representing it (androidtv_remote
   canonical + cast + homekit_controller + dlna_dmr shadows). Three
   different device_ids (one per integration), so duplicate-detection
   doesn't catch them. User asked: are these duplicates? How do I
   know which is the real one?

4. Unsorted bucket of 483 entities feels overwhelming. Many are
   legitimately place-less (helpers, automations, scripts, template
   sensors) but broadsheet was framing them as "things you should
   place." User said: "things in there are entirely opaque to the
   average user, and ultimately are not really tethered to place."

### What landed

**A. Platform shown inline on every entity row.** `DomainEntity`
gains `platform` field (mirrored from `Entity.platform`). Renders
as a small italic mono tag next to the entity_id. Now the user can
see at a glance: `media_player.living_room_tv_2 · cast` vs
`media_player.living_room_tv · androidtv_remote` — the integration
source disambiguates same-named entities from different sources.

**B. Device-level rename** (broadsheet curation). New
`DeviceOverride` type in curation schema, new
`curation.devices: Record<string, DeviceOverride>` map, new
`renameDevice(id, name)` mutator. Applied at the device-header
level in /settings/house — the Office Heater Plug case is now a
5-second fix ("Office Heater Plug" → "Pixel 6 Charger"). Doesn't
touch HA — keeps HA's authority over the underlying name in case
the user wants to fix it there separately.

**C. Device-level hide** (broadsheet curation). New
`hideDevice(id, hidden)` mutator. When a device is hidden, its
sub-entities get `autoHideReason: 'device-hidden'` and disappear
from area visible buckets (move into hiddenEntities). One click
sweeps all 10 Living Room TV Plug entities out of view. Doesn't
remove from HA (correct — the plug is still alive on the network);
just stops cluttering broadsheet.

**D. Unsorted reframe** — split into two cohorts inside the
expanded Unsorted area:
- **"Devices needing placement"** (entities with `deviceId !== null`):
  shown by default, with the "Place in" picker available per
  entity. 190 of the 483 are in this cohort.
- **"Helpers, automations & system"** (entities with
  `deviceId === null`): collapsed under a toggle "+ 250 helpers...
  (no physical place — broadsheet doesn't render these on pages)."
  Surfaces them for visibility but doesn't nag the user to act.

The reframe changes the Unsorted user's mental model from "I have
483 things to fix" to "I have 190 devices to place + 250 system
entities that legitimately have no place." Same data, much clearer
where attention belongs.

### Verified live against production HA via Chrome MCP

| Test | Result |
|---|---|
| Platform tag | TVs show `cast` / `homekit_controller` / `dlna_dmr` / `androidtv_remote` |
| Device rename + hide buttons | Present on every multi-entity device card |
| Unsorted "Devices needing placement" | 190 entities |
| Unsorted "Helpers + system" toggle | "+ 250 helpers, automations & system" (collapsed by default) |

### Lesson — Svelte 5 TS narrowing doesn't propagate through `@const` chains

`{@const isDeviceGroup = group.device && group.entities.length > 1}`
followed by `{#if isDeviceGroup} ... group.device.id ...` failed
TypeScript checks because Svelte 5's compiler doesn't narrow
`group.device` from `RawDevice | null` to `RawDevice` based on the
intermediate `@const`. Fix: introduce a non-null asserted local
const `{@const dev = group.device!}` immediately inside the if
block, then use `dev` everywhere. Slightly less elegant than
implicit narrowing, but works reliably.

### M4.x.fix3 considered done. Settings is now substantially
better:

- Identify: device grouping + domain badges + state inline +
  PLATFORM source + collapsed-by-default
- Suppress: smart auto-hide + device-level hide
- Place: move-to-area picker + Unsorted reframed into actionable
  vs-ignore cohorts
- Rename: at entity-level AND device-level

Next gate: M5 (HA add-on packaging).

### M4.x.fix4 — iBeacon environmental noise (caught by user testing)

**Catalyst**: Alfie spotted `DP_2_1_TORNY100680  7D51` in
Unsorted and asked if it was an iBeacon. Investigation surfaced a
~57-entity cohort: HACS iBeacon Tracker creates a device + 4
entities (Signal strength, Power, Estimated distance, Vendor) for
every BLE advertisement it sees. Most aren't user beacons — they're
neighbours' AirTags, fitness trackers, road-safety devices (Ooono),
lithium-battery monitors (QMHConnect), etc. broadcasting in range.

**Where the noise lives**: in the DEVICE name, not the entity name.
First heuristic attempt checked `entity.name` / `original_name`,
which are generic ("Signal strength" etc.) — no match. Second
attempt checked `device.name` directly — caught 28 of 57.
Refined further with a trailing-hex pattern.

**Final heuristic** (`isBleAdvertisementNoise(entity, device)`):
1. `entity.platform === 'ibeacon'`
2. AND any of:
   - device.name contains control chars (`\x00-\x1f`) — mis-decoded
     BLE payload
   - device.name ends in ` HHHH` (space + 4 hex chars) — MAC-suffix
     pattern. Catches "Ooono F358", "QMHConnect-0184 9A59", etc.
   - device.name has no lowercase + has a digit + length ≥ 5 —
     all-caps manufacturer codes ("DP_2_1_TORNY100680", "GVH5075_1042")

Real user beacons (named Pixel Watch, iPhone, named Bermuda
trackers, IRK-resolved Private BLE Devices) are on different
platforms (`bermuda`, `private_ble_device`, `mobile_app`) so they
don't trip the platform check. Even iBeacon-platform user beacons
named with human words ("Car Keys Tag") have lowercase letters and
no MAC-suffix tail — pass through visible.

**Verified**: 14 → 28 → expected ~57 hidden after the trailing-hex
extension. User can un-hide any false-positive via the per-device
"Show device" button (M4.x.fix3) or per-entity unhide button.

**Lesson — heuristic data lives where you don't expect**. First
try checked the entity's friendly_name; the noise was in the parent
device's name. Always inspect the actual data structure, don't
assume the obvious field is the source. Burned 30 min on the wrong
heuristic before the data check revealed it.

---

## 2026-05-13 — M5 — HA add-on packaging (foundation; verification deferred)

### What landed

A second repo (`alfiedennen/broadsheet-addon`) packaging the SPA
as an installable HA add-on. End-state user experience is what
PUBLIC-README-DRAFT promised: add the repo URL, click Install,
click Open Web UI, no token paste required.

### broadsheet/core changes

**`auth.ts`**: addon-mode credentials shape extended to include
`supervisorToken` (separate from URL). Pulled from
`window.__BROADSHEET_ENV__` set by the addon's `run.sh`.
`detectAuthMode()` now requires both `ingressEntry` AND
`supervisorToken` to return `'addon'`. `getAuthCredentials()` builds
the full URL as `window.location.origin + ingressEntry`.

**`client.ts`**: removed the M1 stub error for addon mode.
`connect()` now accepts addon credentials and routes through the
same `createLongLivedTokenAuth()` path as LLAT — the difference is
just which URL + which token. The library handles the WS auth
handshake; nginx adds the Supervisor bearer as belt-and-braces on
the upgrade request.

**`app.html`**: `<script src="./runtime-env.js" defer onerror="void 0">`
added before SvelteKit boots. The script populates
`window.__BROADSHEET_ENV__`. 404 in dev / standalone is fine
(`onerror="void 0"` swallows it) — auth.ts falls through to LLAT.

### broadsheet-addon repo (new)

Structure:

```
broadsheet-addon/
├── repository.yaml              HA recognises this as an addon repo
├── README.md                    repo-level docs
├── LICENSE                      MIT
├── .gitignore                   ignores broadsheet/www/ (CI-populated)
├── broadsheet/
│   ├── config.yaml              addon manifest (ingress, perms, options)
│   ├── Dockerfile               multi-arch (hass-base + nginx + Python)
│   ├── run.sh                   entrypoint
│   ├── nginx.conf.tpl           SPA + supervisor-bearer-injected proxy
│   ├── sidecar.py               curation API on localhost:8100
│   ├── DOCS.md                  shown in HA's add-on store
│   ├── README.md                addon-internal notes
│   ├── translations/en.yaml     options panel labels
│   └── www/                     SPA bundle (gitignored, CI populates)
└── .github/workflows/
    └── builder.yaml             multi-arch CI [aarch64, amd64]
```

### Auth flow (zero user-paste)

1. HA's Supervisor injects `SUPERVISOR_TOKEN` as an env var at
   container start
2. `run.sh` reads it + `bashio::addon.ingress_entry`, writes
   `runtime-env.js` populating `window.__BROADSHEET_ENV__`
3. SPA reads the env at boot, addon-mode detected by `auth.ts`
4. Connection client builds WS URL as `<origin><ingress-entry>` and
   passes `SUPERVISOR_TOKEN` as the auth credential
5. Browser opens WS to `wss://<ha-host>/api/hassio_ingress/<token>/api/websocket`
6. HA's ingress strips the prefix → addon's nginx receives
   `/api/websocket` → `proxy_pass http://supervisor/core/api/websocket`
   with `Authorization: Bearer ${SUPERVISOR_TOKEN}`
7. HA Core accepts the bearer (or the JS lib's auth handshake using
   the same token, whichever fires first)

The SUPERVISOR_TOKEN is intentionally exposed to the SPA. It's
scoped to addon-level permissions (`hassio_role: default`) and the
user implicitly trusts the addon they installed. Same model as
every other HA add-on with a web UI.

### Curation persistence (addon mode)

`/data/broadsheet.json` is in HA's snapshot map (`addon_config:rw`)
— survives container restarts AND travels with HA backups.

Sidecar (`sidecar.py`) is a tiny aiohttp service on `127.0.0.1:8100`:
- `GET /curation` → returns the file
- `PUT /curation` → atomic write (tmp + rename), schema-validates
  (top-level keys + version), stamps `lastModifiedAt` server-side
- `GET /health` → diagnostic

nginx proxies `/api/broadsheet/*` → sidecar. The SPA's curation
backend (`pickBackend()` in `lib/curation/persistence.ts`) detects
addon mode via `window.__BROADSHEET_ENV__` and routes through the
sidecar; localStorage backend takes over in dev / standalone.

### CI: multi-arch builder

`.github/workflows/builder.yaml`. On tag push (`v*.*.*`) or main
push, matrix `[aarch64, amd64]` runs:

1. Checkout addon repo at workspace root
2. Checkout `alfiedennen/broadsheet` (SPA source) at `.broadsheet-source/`
3. pnpm install + build the SPA
4. Copy `packages/core/build/` into `broadsheet/www/`
5. Login to GHCR
6. Invoke `home-assistant/builder@2024.08.2` action with
   `--target broadsheet --image broadsheet-{arch} --docker-hub
   ghcr.io/<owner> --addon`
7. Image pushed to `ghcr.io/alfiedennen/broadsheet-{aarch64|amd64}`

HA's add-on Supervisor pulls from GHCR when the user installs.
Updates flow via `version:` bump in `config.yaml` + tag push.

### Verification — DEFERRED to next session

I did NOT install + verify in HA OS this session. That requires
Env 2 (VirtualBox HA OS) which is Alfie's track. The full
verification path documented in DEV-ENVIRONMENTS.md § Env 2:

1. Stand up `broadsheet-test.local` HA OS VM in VirtualBox
2. Add `https://github.com/alfiedennen/broadsheet-addon` as a
   custom add-on repository in HA → Settings → Add-ons → ⋮ →
   Repositories
3. Find broadsheet in the store, click Install (waits for CI to
   produce the first GHCR image)
4. Click Start, watch logs (`Starting sidecar... broadsheet ready
   at ingress entry /api/hassio_ingress/...`)
5. Click Open Web UI, expect zero token-paste, expect /lights / /heat /
   /door pages to populate from the test HA's entities
6. Open /settings/house, rename an area, restart the addon, verify
   curation survived
7. Verify update flow: bump `version: 0.1.0` → `0.1.1` in config.yaml,
   push, wait for CI, HA shows update badge, apply update succeeds

If any step fails, this commit is the iteration target.

### Local build sanity (Env 1)

Docker engine wasn't running on the dev machine, so the local
`docker build` sanity check was skipped. svelte-check passed for
broadsheet/core changes. The addon files weren't structurally
verified beyond manual review.

Risks:
- HA's `hass-base` doesn't have `py3-aiohttp` available via apk in
  some arches — Dockerfile may need `pip install aiohttp` instead.
  Check on first CI run.
- `tempio` template substitution syntax is `%%VAR%%` — verified
  against the standard pattern but not tested in CI yet.
- The HA WS server's behaviour on bearer-on-upgrade vs auth-handshake
  is documented but not personally verified for SUPERVISOR_TOKEN
  specifically. May need adjustment if Env 2 testing reveals an
  auth-handshake-only requirement.

### Next session priorities

1. Stand up Env 2 (VirtualBox HA OS, hostname `broadsheet-test`)
2. Verify CI builds the first GHCR image successfully
3. Install in Env 2, walk through the verification checklist above
4. Iterate on whatever breaks first
5. Close out M5 once the install-to-working-page path is proven

After M5 verification: M6 (production canary in real HA) → M7 (public
release prep + flip both repos to public).

---

## 2026-05-14 — M5 + M6 + the plugin-system track (P0–P4)

A long session. M5 closed, M6 stood up, and the whole plugin system
got built and proven live. Addon went 0.1.0 → 0.1.31 across it.

### M5 — add-on packaging, closed

Verified end-to-end in Env 2 (VirtualBox HAOS). ~13 fixes burned in;
the load-bearing ones:

- **`init: false` in config.yaml.** THE root-cause fix. The hass-base
  image's ENTRYPOINT is s6-overlay's `/init`. Supervisor's default
  `init: true` wraps the container with `tini` as PID 1, demoting
  s6-overlay to PID 2 → `s6-overlay-suexec: fatal: can only run as
  pid 1` and the addon dies on every start.
- **tempio CLI** is `echo '{}' | tempio -template <tpl> -out <out>`;
  template syntax `{{ env "VAR" }}` (not `%%VAR%%` as the M5-prep
  note guessed). `export INGRESS_ENTRY` so tempio sees it.
- **nginx `sub_filter` + `sendfile off`.** SvelteKit's built SPA emits
  absolute `/_app/` asset paths and bakes `base: ""`. nginx
  `sub_filter` rewrites both to the ingress entry — but sub_filter
  lives in the user-space filter chain that `sendfile()` bypasses, so
  `sendfile off` is mandatory.
- **`/_app/` must 404, not SPA-fallback.** A stale tab requesting old
  chunk hashes after an addon update would otherwise get index.html
  (200, text/html) and choke with "expected a JS module". Dedicated
  `location /_app/ { try_files $uri =404; }`.
- CI: addon repo at workspace root + sibling checkout of the private
  `broadsheet` SPA repo via a fine-grained PAT (`BROADSHEET_SOURCE_PAT`).

### M6 — production canary on the real ProDesk HA

Installed on the live HA (addon slug `68fa04fc_broadsheet`). Bugs
caught + fixed against the real house:

- **`read_only` addon option.** Defaulted true → broadsheet couldn't
  control anything. Now `read_only: false` default; `run.sh` injects
  it into `runtime-env.js` as `window.__BROADSHEET_ENV__.readOnly`;
  `initSafety` branches addon-mode on it.
- **camera_proxy 403 → base-prefix.** `/door`'s `<img src="/api/
  camera_proxy/…">` was root-absolute → hit HA's origin-root frontend
  → 403. Fixed with `{base}` prefix so it rides the addon's
  bearer-injecting `/api/` proxy. (Then 500 — that camera genuinely
  can't serve a still; added a graceful "No snapshot" fallback.)
- **`image.*` entities discovered as cameras.** Battery/P2P cams
  expose a working `image.*` still while their `camera.*` sibling
  500s. Discovery now buckets `image.*` with `camera.*`; `/door`
  renders via the entity's `entity_picture` (correct proxy path per
  domain).
- **stale-sub `Uncaught (in promise)`.** The HA lib's unsubscribe fns
  are `() => Promise<void>` (mistyped `() => void`); they reject with
  "Subscription not found" post-reconnect. `teardownDiscovery`'s
  synchronous try/catch couldn't catch the async rejection — wrapped
  in `Promise.resolve(fn()).catch()`.

### v0.1 broadsheet HA theme + core curation parity

- HA theme (`broadsheet-addon/.../theme/broadsheet.yaml`) styles HA's
  own chrome to the editorial register. v0.1 of the replacement
  vision: HA's sidebar stays, just re-skinned; v0.2 inverts the
  iframe. The HA token migration burned a lesson — `--mdc-*` (oldest)
  → `--input-*` (mid) → `--ha-color-*` (current); `ha-select` reads
  `ha-picker-field` reads `--ha-color-form-background`.
- Core curation parity applied to the live HA via the sidecar
  curation API: 5 area renames (`alfies_office`→Office etc — display
  overrides only, HA's registry untouched so Harold's voice-intent
  matching is unaffected), camera hides, people/presence verified.

### Plugin system — P0–P4

The headline work. The whole plugin system, built in five phases,
each ending with a deploy + live verification (browser MCP from M6
onward). The frozen `BroadsheetPlugin` contract needed **zero
breaking changes** to ship `@broadsheet/emanations` as the proof
plugin — P4's bar, met.

**P0 — contract freeze.** `packages/core/src/lib/plugins/types.ts` is
the machine-readable source of truth; `RENDERER-CONTRACT.md` promoted
sketch → spec. The `@broadsheet/core` barrel (`src/lib/index.ts`) +
`package.json` `exports` so plugins `import type` from it.

**P1 — loader + registry + routing.**
- `registry.ts` is THE bundling-aware module — the single seam v0.2's
  runtime-install extends. Everything downstream is bundling-agnostic.
- `loader.svelte.ts` — static validation (id/slug collisions) +
  reactive `PluginStatus`.
- `[pluginSlug]` catch-all route; static core routes win by
  specificity. Plugin component rendered in `<svelte:boundary>`.

**P2 — `/settings/plugins` + `useRenderer`.** The honesty escape
hatch (status + working enable/disable toggle) and the opportunistic
renderer hook (core's `/` upgrades its `ProceduralPainting` to a
plugin renderer when active).

**P3 — static-asset pipeline.** `pluginAssetUrl` + CI staging plugin
`static/` dirs into `www/plugin-assets/<id>/` + nginx
`location /plugin-assets/`. NOT `/local/<id>/` — the addon's nginx
already owns `/local/` (HA-Core proxy); plugin assets get their own
namespace.

**P4 — emanations ported.** Every contract surface exercised by one
plugin: page, renderer (procedural + painting-capable), settingsPanel
(`useCurationField` + `SettingsRow` + `[pluginId]/config` route),
discoveryContributor (sandboxed fetch → `discovery.plugins.<id>`),
static painting assets. The chain works end to end: contributor finds
the painting manifest → `pluginAssetUrl` resolves it → a settings
field gates it → the renderer paints.

### Gotchas burned in (P0–P4)

- **`return $derived(...)` is illegal.** `$derived` may only be a
  variable-declaration initializer / class field. And a Svelte 5
  function can't return a reactive primitive at all — `useRenderer`
  returns a `{ get current }` handle; the getter is the reactive
  access point.
- **`LazyComponent` must be `Component<any>`.** `Component<Props>` is
  contravariant in `Props`, so no concrete props type accepts *every*
  component (a no-props component is `Component<Record<string,
  never>>`). `Component<any>` is the deliberate escape hatch for a
  heterogeneous registry.
- **Reactive-churn restarting `{#await}`.** The `[pluginSlug]` route
  awaited `activePage.component()` — but `activePage` is rebuilt on
  every discovery tick (the loader's derived chain produces fresh
  wrapper objects per HA state delta). Each tick handed `{#await}` a
  new promise → the import restarted forever, "Loading…" with no
  error. Fix: pull the stable `.component` thunk into its own
  `$derived` — Svelte's `===` dedup keeps it stable across ticks.
- **The contributor debounce starved by the state-delta stream.** Same
  family of bug, worse. The contributor `$effect` tracked
  `discovery.areas/persons/floors` — derived projections that
  recompute on EVERY entity-state delta, which a live HA streams many
  times a second. The 400ms debounce was reset forever;
  `runContributors` (almost) never fired — `/emanations` was flaky,
  painting only when it caught a rare quiet window. First fix
  (track `pluginLoader.registry` instead) was ALSO wrong — `registry`'s
  `$derived` reads the discovery snapshot for `visibleWhen`, so it
  churns too. **Final trigger set: `discovery.booted` +
  `discovery.lastRefreshAt` + `curationStore.tick`** — none move on
  state deltas. Lesson: when an effect must run "on structural change,
  not on live data", audit the FULL `$derived` dependency chain of
  every signal you track — a derived that *looks* structural can
  transitively read a high-churn source.
- **The discovery↔contributor import cycle.** `discovery` exposes
  `.plugins`; the contributor runner reads `discovery`. Broke the
  cycle with `contributorStore.svelte.ts` — an importless module
  holding just the `$state` stores; discovery imports the store, the
  runner imports the store + discovery.
- **`/local/<id>/` collision.** The contract sketch said plugin
  assets serve at `/local/<id>/`, but the addon's nginx already
  proxies `/local/` to HA Core. Moved to `/plugin-assets/<id>/`;
  `pluginAssetUrl` abstracts the URL so it's not a contract break.

### Process notes

- From M6 on, verification moved to the Chrome MCP — screenshotting
  the live addon, reading its console, driving its toggles. Two of
  the P-track bugs above (route churn, contributor starvation) are
  runtime-only — build + `svelte-check` are both green on them. Live
  verification is not optional for this kind of work.
- Addon deploys go via the HA WS `supervisor/api` `/addons/<slug>/
  update` endpoint after a `/store/reload`, then a hard-gate verify
  (`version`/`state`/`update_available`). The update call drops the
  ingress WS mid-operation — it reports failure but the update
  succeeds; always re-verify rather than trusting the call's return.

### State at end of session

- Addon **0.1.31** live on the real ProDesk HA (M6 canary).
- Plugin system complete + verified; `@broadsheet/emanations` is the
  working proof plugin.

### Deferred items — cleaned

- **White hover states on HA chrome — RESOLVED.** The
  `ha-color-fill-neutral-*` family in `theme/broadsheet.yaml` fixes
  it; verified live via Chrome MCP — sidebar items and config-page
  list rows both hover to a dark warm `#2a261e`, not white. The
  earlier "still white" report predated those tokens landing.
- **aarch64 — known gap, not a bug.** The multi-arch CI matrix builds
  amd64 + aarch64 every release and pushes both to GHCR; aarch64 has
  built clean throughout. But it has NEVER run on real ARM hardware —
  the only HA hosts here (ProDesk + the VirtualBox env) are amd64.
  This is an explicit **M7 gate**: before public release, the aarch64
  image must be installed + smoke-tested on a real ARM HA host (a Pi
  or equivalent), or v0.1 ships amd64-only with the aarch64 image
  marked experimental. Nothing actionable without the hardware.

### Still open

- Post-v0.1: the ghost-cloud (The Long Take) + tmdb-tv renderer ports
  against the now-proven contract.
- M7: public release prep (incl. the aarch64 hardware gate above).

---

## 2026-05-14 (later) — the plugin trio completed + M7 prep

The two remaining first-class plugins ported, `/tv` finished, and the
M7 public-release prep started. Addon 0.1.31 → 0.1.36.

### The Long Take — `@broadsheet/ghost-cloud` (0.1.32)

Ported harold-home's v22 radar time-tube renderer against the proven
contract. A page-only plugin — no `useRenderer`, no settings panel.

- **Iframe model.** `ghost-cloud.js` (the ~46 KB Three.js renderer)
  + a `view.html` harness ship as plugin static assets; the
  `/long-take` page is a thin Svelte wrapper that iframes
  `pluginAssetUrl('ghost-cloud','view.html')?r=<room>`. The v22
  renderer is ported verbatim — the ONLY change is `DATA_URL`
  (harold-home's 3-way path branching → one plugin-asset-relative
  `./data/<room>.json`).
- **Three.js vendored, not CDN'd.** harold-home CDN-loads Three r169
  via importmap; an offline-capable add-on can't. Vendored
  `three.module.js` + the 6 imported addons + their transitive deps
  (cherry-picked from `examples/jsm/`, ~1.4 MB — `examples/jsm/`
  whole is 14 MB). Import graph verified closed.
- **Demo data, not a precompute service.** harold-home's data comes
  from a MariaDB-reading systemd service — broadsheet can't inherit
  that. Decision: v0.1 ships **bundled demo data** (one captured day
  per room, ~1.9 MB, scp'd from the real HA), so the plugin works for
  any user with zero hardware/setup. The live-radar-pull path is an
  explicit deferred follow-on. The discoveryContributor reads the
  bundled room manifest.

### tmdb-tv — `@broadsheet/tmdb-tv` (0.1.33→0.1.34)

The third plugin, and the leanest contract-surface combination: a
renderer + a settings panel, nothing else (no page, no static assets,
no contributor).

- Ported harold-home's `tmdb.ts` — the one structural change: a
  `createTmdbClient(token, region)` factory, because the token is
  user-supplied (`curation.integrations.tmdb.apiKey`) not bundle-baked.
- `PosterRow.svelte` re-tokenised to broadsheet's design system,
  browse-only.
- `ContentRows.svelte` is the renderer core's `/tv` slots in via
  `useRenderer('tmdb-content-rows')` — three states: no-key CTA /
  loading / Trending + New rows. Settings panel binds the API key +
  region via `useCurationField`.

### `/tv` Apps launcher (0.1.34→0.1.36)

`/tv`'s own header comment promised an "app launcher" never built.
Added it — and learned the shape over two iterations:

- A `media_player` only exposes `source_list` while it's ON. v1 hid
  the section when the TV was off; v2 showed a "turn the TV on" note —
  still not "streamer buttons". **Final: 3-tier sourcing** — live
  `source_list` (TV on) → a per-TV-entity localStorage cache (TV off
  but seen-on) → a small default streamer set (never seen on). So the
  buttons are ALWAYS present. Tapping wakes the TV first (select_source
  on a cold set is a no-op), then switches. The moment the TV reports
  its real list, that replaces the default and caches.
- Lesson: "ship with X" means X is there out of the box — a
  correct-but-absent feature reads as unbuilt. The general-purpose
  instinct (read `source_list`) was right but incomplete; the cache +
  default tiers make it both general AND always-present.

### M7 prep started

- Promoted `PUBLIC-README-DRAFT.md` → `README.md` — resolved the
  `<TBD>` URLs, corrected the stale status (Settings UI IS built; the
  plugins are bundled + curation-gated, not "install if"), added the
  amd64-supported / aarch64-experimental note.
- Added `CONTRIBUTING.md` (dev setup + doc reading order + the
  plugin-authoring pointer, moved off the README) and
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, adopted by
  reference) and `CHANGELOG.md` (v0.1.0 release notes).
- **aarch64 gate decided**: v0.1 ships amd64-supported, aarch64
  marked experimental in the README + changelog — unblocks the
  release; the first Pi install becomes the de-facto aarch64 test.

### State at end of session

- Addon **0.1.36** live on the real ProDesk HA.
- All three first-class plugins ported + verified live; `/tv`
  complete (remote + always-present Apps launcher + content rows).
- M7 prep: README / CONTRIBUTING / CODE_OF_CONDUCT / CHANGELOG done.

### M7 — remaining release gates

- **Screenshots** for the README — the live captures show the real
  Harold-Road setup (names, presence, room layout); needs a call on
  real-setup-vs-sanitised before they go in a public repo.
- **Repo visibility** — flip `broadsheet` + `broadsheet-addon` public
  (maintainer action). When `broadsheet` is public, the addon CI's
  `BROADSHEET_SOURCE_PAT` can be dropped.
- **Tag v0.1.0** on both repos (after the above).
- **GitHub Discussions** enabled + the soft launch (maintainer
  actions).

---

## 2026-05-14 (evening) — replacement vision refined: the v0.2 deep-HA design

A design conversation, not a build session. M7's public push is
**parked** — the canary needs a real dogfooding soak first, and the
repos stay private until then. Eight canary screenshots captured for
the README (real-data — names, rooms, presence — so a blur pass is
needed before they go anywhere public). Two dogfooding findings logged
in passing: `/body` renders raw sensor values (`6120000.0 ms`,
unconverted durations — the renderer isn't humanising units), and
`/settings` reports 278 un-auto-grouped + 1363 hidden entities on the
real install — worth a look at whether discovery's grouping heuristics
leave too much in Unsorted.

The substance: scoping the v0.2 "deep HA" work — how broadsheet reaches
the nooks and crannies HA's UI covers that broadsheet's 8 surfaces
don't (integrations, automation editor, logbook, backups, dev tools).

### Where "primarily styling" works — and where it breaks

HA's UI splits three ways, and the styling instinct only carries two:

- **Chrome** (sidebar, header, frame) — the v0.1 broadsheet HA theme
  already reaches this.
- **Data surfaces** (logbook, history, energy stats, the
  device/entity/area registries, system health, the backup list) —
  not a "wheel" to recreate; just data over the same stable WS/REST
  API broadsheet already consumes. broadsheet can render these
  natively in-register.
- **Genuine editors** (automation/script editor, integration
  config-flow wizards, add-on store, Z2M/ZHA panels) — styling cannot
  reach these and shouldn't try. Their information architecture is the
  opposite of editorial. The honest choice is binary: rebuild (recreate
  the wheel — rejected) or **doorway** to them.

### The brittleness firewall — the governing rule

> broadsheet only ever consumes the stable contract — the WS/REST API,
> the theme system, Ingress. It never reaches into HA's rendered DOM.

The WS API (states, services, registries, config, logbook, history,
energy) is versioned and stable. HA's frontend DOM — Lit components,
shadow DOM, panel internals — is not. Any approach that styles or wraps
*that* is the brittle overlay. So: anything buildable on the API gets a
native broadsheet surface; anything that can't becomes a **doorway**,
never a wrap. A doorway is a broadsheet-register index page that frames
the handoff — in panel mode it navigates the parent HA frame, in
standalone mode it's a link/tab. An honest seam, stable across HA
releases because it's just navigation.

So the v0.2 tiering is: **native surfaces → natively-rendered data →
doorways to editors.** Dogfooding the 8 surfaces is what ranks the
middle tier — which nooks are actually reached for.

### Extensibility — three things, not two

"Users can add whatever they want, styled in the broadsheet paradigm"
resolves into three distinct mechanisms:

1. **Custom-pages builder** — user pins their own entities/areas into
   named pages that render in-register automatically. The curation
   model generalised. Confirmed for v0.2.
2. **Lovelace importer** — an on-ramp that parses a Lovelace view,
   maps each *built-in* card type to a broadsheet-register rendering,
   and emits a custom page. Feeds *into* (1) — not a separate channel.
   What doesn't map is dropped with an honest "N cards couldn't be
   imported" notice (the `/settings` honesty pattern). One-time import,
   not a live link — broadsheet curation becomes the source of truth.
3. **Plugin contract** — the supported path for anything needing custom
   code. A **rewrite** contract, not a wrap contract, by design.

Ruled out: **hosting third-party custom cards** (the compiled JS web
components from HACS). There's no transpile path from a compiled web
component to a broadsheet-register Svelte component, and *running* one
means impersonating HA's `hass` frontend contract — which is the
brittle overlay back through the side door, breaking on every HA
frontend release and rendering in the card's own style. The plugin
contract (a deliberate rewrite) is the answer for bespoke rendering;
there is no auto-conversion.

### The v0.9 production gate

The Lovelace importer carries a measurable acceptance criterion for the
v0.9 production milestone: **~80% of cards-in-the-wild render
in-register, frequency-weighted** — measured by running the importer
over a corpus of real Lovelace configs (Harold Road's, harold-home's
old dashboards, community examples) and counting covered vs dropped
cards, weighted by how often each card type appears. Frequency-weighting
also tells us *which* ~20 built-in card types to build mappings for
first. The metric is "render in register" (not "card types covered",
not "whole dashboards clean") because that's the one that reflects
actual user experience.

v0.9 is read as the feature-complete pre-1.0 production milestone; the
importer gate is one of its acceptance criteria, not the only one.
v0.2–v0.8 are the incremental build-up (the custom-pages builder lands
early — the importer needs it as a destination).

`REPLACEMENT-VISION.md` updated with the firewall rule, the three-tier
surface model, and the extensibility section; `BUILD-PLAN.md`'s "What's
NOT in v0.1" + scope guards extended with the two new v0.2 items.

### Settings omission: create rooms via the House tab

`/settings/house` lets you rename / hide / move-to-area, but every
target area has to already exist in HA — and `SETTINGS-UI.md`'s "Assign"
popup punted "Create new area" to a deep-link into HA's own
`/config/areas`. That deep-link IS the "ejected back into HA's chrome"
failure the replacement vision exists to kill. Closed:

- **A created room is a real HA area** — `config/area_registry/create`
  over the stable WS contract — not a broadsheet-local construct. The
  House tab already writes HA's registries (move-to-area is a device
  `area_id` write); creating an area is the same write-class one step
  earlier. It honours "discovery, not configuration": a new room is a
  new room *everywhere*, not a parallel concept only broadsheet knows.
- **Distinct from the v0.2 custom-pages builder**: a room is a spatial
  HA area that flows through discovery; a custom page is an authored
  view that pins things.
- **Cheap mechanically** — discovery already subscribes to
  `area_registry_updated`, so a created area flows Layer 1 → 2 → the
  House list with no extra plumbing. The work is the "+ New room"
  affordance, the readonly-gate respect, and teaching the audit
  envelope (currently service-call-scoped) about registry-mutation
  commands as a class.
- **Near-term, not v0.2** — a present-tense omission in a screen that
  already ships; belongs on the dogfooding-pass punch list.

`SETTINGS-UI.md` updated: new *Creating rooms* subsection under
`/settings/house`, and the Assign popup's "Create new room" now creates
in-place instead of deep-linking out.

---

## 2026-05-14 (later) — dogfooding punch list: /body humanising + create-room

First two punch-list items built.

### /body — raw values humanised

The canary `/body` showed `Sleep segment 6120000.0 ms` — a raw
millisecond integer. `valueFor()` had a one-off `sleep_duration`
minutes→hours branch but nothing general. Replaced with a
`humanizeDuration(seconds)` helper + a per-sensor `kind` field on the
`Meta` table (`'duration-min'` for sleep_duration, `'duration-ms'` for
sleep_segment). Now both render as `Xh Ym`. Keyed on the sensor's
`kind`, deliberately **not** on the unit string — `heart_rate_variability`
is also in ms but ms IS its natural unit, so a blind unit-based
converter would have mangled HRV.

### /settings/house — "+ New room"

The create-rooms omission, closed:

- **`lib/ha/registry.ts` → `createArea(name, floorId?)`** — sends
  `config/area_registry/create`, returns the new `area_id`. Discovery's
  `area_registry_updated` subscription re-projects the new area into the
  House list within the debounce window, so the caller just creates +
  toasts; the row appears on its own.
- **Audit envelope learned registry mutations as a class** — added a
  dedicated `registry-write` `AuditEntry` kind (`types.ts`), wired its
  console colour + format (`audit.ts`), and retrofitted
  `updateEntityArea` / `updateDeviceArea` / `updateAreaName` off the
  overloaded `auth-event` kind onto it. Registry writes are now a
  first-class, self-describing audit category.
- **`/settings/house` affordance** — a "+ New room" trigger under the
  Areas rule expands to an inline form (name + optional floor picker,
  populated from `discoveryStore.floors`). Enter commits, Escape
  cancels, focus auto-lands on the name field.

**Correction to the plan entry above**: that entry said the create
would "respect the readonly gate." On implementation, `registry.ts`
turned out to already carry a settled, well-reasoned convention —
registry writes are audit-logged + `not-connected`-checked but **not**
readonly-gated, because they're metadata not actuation ("setting an
area_id can't unlock your front door"). `createArea` follows that
convention: an empty area actuates nothing, and gating create while
`updateEntityArea` (which moves *existing* things) stays ungated would
be backwards. `SETTINGS-UI.md` corrected to match.

`pnpm --filter @broadsheet/core check` + `build` both clean.

### Deployed + verified (addon 0.1.37)

Shipped both fixes to the canary and verified live: `/body` renders
`Sleep segment 1h 42m` (was `6120000.0 ms`); `/settings/house` "+ New
room" opens its inline form and `createArea` writes a real HA area
end-to-end (created a throwaway `Verification Test` area, confirmed it
landed in the registry, deleted it via `area_registry/delete` — zero
residue). Deploy is now scripted: `broadsheet-addon/scripts/deploy.py`
drives the WS `supervisor/api` cycle + poll-verifies. Confirmed the old
warning: the update call reports `False` while succeeding — the poll
loop is the source of truth.

### Discovery investigation — it's an alert-framing bug, not heuristics

"278 un-auto-grouped" on the real install is **not** a discovery bug —
`resolveAreaId` is deterministic, broadsheet can't place what HA hasn't
placed. The bug is in `/settings`'s alerts:

- **Alert #1 over-counted.** It showed the whole Unsorted bucket as
  "couldn't be auto-grouped" — but only the *device-backed* cohort is
  actionable (helpers / automations / scripts / scenes / template
  sensors are legitimately place-less and never hit editorial pages).
  Rewritten: counts the device-backed cohort → *"N devices need a
  room"*, with a parenthetical noting the place-less ones are normal.
- **Alert #4 used a heuristic the code itself flagged "rough".** It did
  `rawCounts.entities − sum(visible per area)` — which swept in
  *skipped* config/diagnostic/disabled entities and miscalled them all
  "hidden". Rewritten to `sum(area.hiddenEntities.length)` — the
  genuinely-hidden set.

Both fixed in `alerts.svelte.ts`.

### Mojibake repair (623 runs, 9 files)

Dogfooding surfaced double-encoded UTF-8 baked into the source bytes —
a cp1252 misdecode (with the 5 cp1252-hole bytes passed through as
latin-1). `Â·` for `·`, `â€"` for `—`, `â–£` for `▣`, box-art borders,
arrows. User-visible in `/settings/house`. Repaired via per-run
cp1252→UTF-8 round-trip classification (genuine chars fail the
round-trip → left untouched, so it was safe on the one file mixing old
mojibake with fresh edits). 1 source file + 8 docs; verified every
distinct mapping; zero mojibake remains. Shipped as 0.1.38, verified.

### Alerts-framing fix + the stale-app-shell bug (0.1.39, 0.1.40)

The alerts fix shipped as 0.1.39 and verified live: the over-counting
"278 couldn't be auto-grouped" alert now correctly **suppresses
itself** (zero device-backed entities are unsorted on the real
install — the whole 278 was place-less helpers/automations), and the
"hidden" alert reads an accurate **69** instead of the bogus 1363.

Then dogfooding caught a sharp one: *the canary's ingress URL showed a
different app than the sidebar-panel URL*. Root cause — the add-on's
`nginx.conf.tpl` sent **no `Cache-Control` on anything**. No service
worker; just unmanaged nginx defaults → browsers heuristically cached
the whole app (shell + content-hashed `_app/immutable/*` chunks) as a
frozen snapshot and never re-checked. A browser that first loaded an
early build kept showing it across every add-on update; a fresh
browser saw current. **Methodology lesson**: the verification browser's
cache state is not the user's — "verified live" against one cache
proves nothing about another. Fixed in 0.1.40:

- `index.html` (`location /`) → `Cache-Control: no-cache` — always
  revalidate the shell; nginx 304s when unchanged, so it stays cheap.
- `/_app/immutable/` → `public, max-age=31536000, immutable` — these
  are content-hashed, the filename *is* the version.
- `/_app/` (version.json, env.js — not hashed) → `no-cache`.

Verified post-deploy via the browser's own fetch context: `index.html`
+ `version.json` return `no-cache`, immutable chunks return the
far-future header, and a reload correctly pulled the new build's entry
hash. **One-time cost**: an already-stale browser needs a single hard
refresh to escape its current heuristic cache; from then on it
self-heals on every load.

---

## v0.2 — extensibility

The substantial arc that turns broadsheet from a fixed-shape SPA
into something users can extend without code. Three phases: a typed
substrate of rendering primitives, a builder UI to compose pages
from them, and a Lovelace importer to migrate existing dashboards
into the same shape.

### M4 dogfooding pass — per-person cards, register drift, manifest enrichment (0.1.41 → 0.1.50)

Used the live canary to catch what the spec had missed. Specifics:

**Per-person presence cards on `/emanations`** then on `/`. Each
person gets one card with the solo painting of their current room,
or their per-person away image, or a procedural fallback. The
underlying contract added a `personImages.<slug>.away` slot to the
emanations curation schema so "Elena away" was first-class instead
of misappropriating a per-room variant cell. Drag-drop upload, per-
room/per-person mapping, drop unused area mappings (utility room,
upstairs bathroom, front hallway — we don't render those as
paintings), drop the orb-name overlay (let the painting carry the
room), drop the renderer marker text. The bulk-import path lifted
17 paintings from harold-home into the canary in one pass.

**Register drift fix.** Lifted harold.local's cross-page Explainer
prose mesh (the italic-muted footer linking sibling pages) onto
all 8 broadsheet pages. New core component `Explainer.svelte` so
plugin pages get the same affordance.

**Moment manifest mirrors harold.local.** Reshaped `/` from "single
contemplative procedural painting" to harold.local's newspaper
shape: multi-clause headline (time-of-day · presence · indoor temp
· electricity rate · outside) + per-person cards + quick-reach
chips (lights off / TV / unlock) + Explainer. Closed four parity
gaps in one round: explicit "Elena out" clause when one is home,
`<em>` italic-amber pop on numerical values, three-band rate
descriptor (cheap / ordinary / expensive), GBP/kWh conversion for
Octopus tariffs.

**`/emanations` dropped from the kebab nav.** The route stays live
for permalinks but the moment view absorbs its imagery, so a nav
entry is redundant. New plugin contract field `hiddenFromNav` —
authors can ship a routable page that doesn't earn nav real estate.

**Settings deepening (0.1.51–0.1.56).** Moment-sensor pickers on
`/settings/house` (auto-discovered indoor temp + electricity rate
sensors with curation-pin overrides). Shared `PresenceCards` core
component (deduplicates `/` and `/emanations` card grids, exported
to plugins via the package entry). People creation form on
`/settings/people` (calls HA's stable `person/create` WS API; lets
fresh installs build their first person without leaving broadsheet).
"Other entity…" expansion on the per-person sensor picker (opens to
ANY plausible presence carrier — `binary_sensor` / `sensor` /
`device_tracker` / `person` — for users with custom-template
presence the heuristic ranks miss).

**HA OS reboot cascade diagnosed and mitigated.** Two ProDesk
reboots in 4 hours during this arc — ended with no shutdown
sequence, fsck recovered journals = hard cut. Root cause: Proxmox
HA cluster's softdog watchdog was armed via `watchdog-mux`, fed by
`pve-ha-lrm`'s heartbeat. On IO wedge from the mechanical HDD
(`FSYNCS/SECOND: 11.18`) the heartbeat missed → softdog forced
reboot. Mitigation: disabled `pve-ha-lrm` / `pve-ha-crm` /
`watchdog-mux` (single-node Proxmox doesn't need cluster failover),
blacklisted softdog, added `bwlimit: 40000` to `/etc/vzdump.conf`.
Not a broadsheet bug per se but a deployment-environment finding
worth recording.

### Phase 1 — substrate (0.1.57 → 0.1.58)

The typed primitives that custom pages compose from. Nine block
types in this initial drop, plus the shell that orchestrates them.

**Block contract.** `lib/blocks/types.ts` holds the discriminated
union: `BlockDef = { type: 'hero', config: HeroBlockConfig } |
{ type: 'markdown', config: MarkdownBlockConfig } | …`. Each block
type has a typed config schema; the union is JSON-serialisable so
curation persistence is direct. `defaultBlockConfig(type)` returns
a sensible starter for each type (used by the builder's "+ Add
block").

**Lazy renderer registry.** `lib/blocks/registry.ts` maps each
`BlockType` to a thunk that dynamic-imports the renderer module.
Same pattern as the plugin renderer registry — chunks load on first
use, shared across pages. `BLOCK_META` exports a label + description
per type so the builder's "+ Add block" picker can list options
without loading every renderer.

**RenderedPage shell.** `lib/blocks/RenderedPage.svelte` takes
`{ blocks }` or `{ page }`, resolves each block's renderer from the
registry on mount, renders them in order. Per-block error chip for
unknown types; loading placeholder reservation while chunks resolve.

**Nine starter primitives.** `hero` (eyebrow + headline + dek),
`markdown` (paragraph prose with `{{entity_id}}` shorthand),
`explainer` (italic-muted footer with cross-page links), `outline`
(section divider), `macro-grid` (the three house-wide macros: lights
off / boost heat / TVs off), `room-toggle-grid` (per-area light
toggle from areasForPage('lights')), `scene-row` (auto-discovered
scenes), `boost-row` (per-climate-area boost tile),
`presence-cards` (the existing component re-exported as a
plugin-consumable surface).

**`customPages` curation field.** `customPages: CustomPageDef[]`
on the curation root, defaults to empty. `mergeWithDefault`
preserves the array shape on legacy curation files. Catch-all
route `[pluginSlug]` resolution adds custom-page lookup as the
second resolver after plugin pages (plugin precedence — builder
prevents collisions at write-time). `KebabNav` surfaces them
filtered by `hiddenFromNav`, sorted by `navOrder`.

**Dogfooded against `/wall`.** Refactored the existing 345-line
inline composition to a 52-line declarative `RenderedPage` with
6 blocks (hero, macro-grid, room-toggle-grid, scene-row, boost-row,
explainer). Same surface, same behaviour — proves the substrate
against a real page rather than just a demo.

**Markdown link prefix bug fix.** Both `markdown` and `explainer`
renderers' link transformer was returning bare `<a href="/lights">`
which 404'd under HA Ingress (where the SPA is served from
`/api/hassio_ingress/<token>/`). Fixed by prefixing the SvelteKit
`base` to relative URLs in the regex callback. Caught during
substrate smoke-test on the canary by injecting a custom page via
the live curation API, navigating to its slug, verifying the
links worked.

### Phase 2 — builder UI (0.1.59)

Lets users compose custom pages from typed primitives without
touching JSON or writing Svelte.

**`/settings/pages` list.** + New page form with auto-derived
slug from label (slugify on label input until the user manually
edits the slug field, then leave the manual edit alone). Slug
validation against `RESERVED_ROUTE_SLUGS` + active plugin pages +
existing custom-page slugs. On create, redirects straight into
the editor with a starter Hero block. Per-row up/down reorder,
edit link, delete with inline confirmation.

**`/settings/pages/[slug]` editor.** Two-column on wide
viewports, stacked on narrow. Left: page-meta fields (label /
icon / width / hide-from-nav) + block list with per-block
move/remove + click-to-expand inline editor. Right: live preview
pane using `RenderedPage` so what authors see IS the page.

**Per-block-type editors.** Each block type gets its own small
form bound to the block's config. Hero: 3 text + 1 number + 1
size dropdown. Markdown / Explainer: textarea. Outline: text.
Macro-grid / room-toggle-grid: optional inline label. Scene-row:
label + maxScenes number. Boost-row: label + temperature number.
Action-grid (and entity-list later) launched with raw-JSON
textareas; replaced with structured editors in Phase A.

**Block-config edits debounce at ~400ms.** The preview updates
synchronously via direct in-memory mutation of the curation store;
only the persistence layer is debounced. Saves users from hammering
the sidecar on every keystroke without making them feel the wait.

**+ Add block menu** lists every registered block type from
`BLOCK_META` with description. Selecting one appends a
`defaultBlockConfig(type)` and auto-expands its editor.

**Settings landing page** gains a "Pages" section card with a
custom-page count.

End-to-end flow from this commit: name a page, add blocks visually,
see live preview, page is live at `/<slug>` immediately + appears
in the kebab nav.

### Phase 3 — Lovelace importer (0.1.60 → 0.1.67)

The v0.9 80% gate. Translates user's existing Lovelace dashboards
into broadsheet custom pages via stable WS API calls + a per-card
translator framework. 27 registered translators across HA built-ins
+ Mushroom + popular HACS cards.

**`lib/lovelace/reader.ts`.** Thin WS wrapper around HA's
`lovelace/dashboards/list` + `lovelace/config`. Splices a synthetic
default-Overview entry at the head of the dashboard list so users
can import from the default even when HA hasn't stored a customised
version of it. Defensive on shape variations.

**`lib/lovelace/translate.ts`.** Translator framework that walks a
view's cards, dispatches each to its registered translator (or null
for unsupported), and aggregates a coverage report. Three coverage
classes: `clean` (1:1 translation), `partial` (translates with
caveats — chrome dropped, history dropped, etc.), `unsupported` (no
translator yet). Per-card `note` surfaces what specifically was
lost. `translateDashboard` rolls up totals across all views.

**Recursive wrappers.** `vertical-stack`, `horizontal-stack`,
`conditional`, `custom:layout-card`, `custom:stack-in-card` all
recurse into their child cards. `horizontal-stack` flattens to
vertical with a note. `conditional` drops the condition gate
(no conditional-block primitive yet) but surfaces the wrapped card.
The recursive translators were the gate-clearing breakthrough —
once they were in, the canary's "22 visible cards" became "88
actually translated" because layout-card + stack-in-card had been
hiding most of the dashboard's content behind their wrappers.

**27 translators total** across 6 commits. Final list:

  Built-in HA: `markdown`, `entity`, `entities`, `vertical-stack`,
  `horizontal-stack`, `glance`, `gauge`, `sensor`, `weather-forecast`,
  `picture`, `picture-glance`, `picture-entity`, `button`, `light`,
  `tile`, `media-control`, `conditional`, `iframe`, `heading`.

  HACS: `custom:mushroom-template-card`, `custom:mushroom-chips-card`,
  `custom:mushroom-light-card`, `custom:mushroom-entity-card`,
  `custom:layout-card`, `custom:stack-in-card`, `custom:button-card`,
  `custom:calendar-card-pro`, `custom:mini-graph-card`.

**`lib/jinja/index.ts` — minimal Jinja-subset evaluator** (~470
lines). Supports `{{ expression }}`, `{% set var = expr %}`,
`{% if … %}…{% elif … %}…{% else %}…{% endif %}` with arbitrary
nesting. Operators: `+ - * / %`, `== != > < >= <=`, `and / or /
not`, conditional expression `value if cond else other`. Filter
pipe with built-ins: `upper`, `lower`, `title`, `round`, `default`,
`int`, `float`, `string`, `length`, `replace`. HA functions in
scope: `states('id')`, `state_attr('id', 'attr')`, `is_state('id',
'value')`, `is_state_attr('id', 'attr', 'value')`, `now()`. NOT
supported: `{% for %}`, macros, blocks, includes, custom filter
authoring (deferred).

`MarkdownBlockRenderer` two-stage interpolate: legacy
`{{entity.id}}` shorthand first (broadsheet's authoring register),
Jinja-subset evaluator on remaining content (only when
`looksLikeJinja` cheap check passes, so plain text takes the fast
path). Errors swallow back to raw template — broken Jinja never
crashes a page.

**Quality lift from Jinja:** every `mushroom-template-card` with
`{% set %}` / `{% if %}` / `states()` calls now renders the actual
computed text instead of literal Jinja source. On the canary, the
washer's first markdown went from
`"Washer {% set mode = states('sensor.wash_dryer_mode') %} {% set modes = {'1': 'Ready', '2': 'Running"`
to `"Washer · Care 30 · 2 min"`. The classification stays `partial`
(card chrome — icon + grid layout — is still dropped) but the
content is real.

**Sparkline primitive — first historical-data block** (0.1.68).
Inline SVG line chart of one entity's recent history, pulled lazily
on mount via HA's `history/history_during_period` WS API. Refetches
when entity_id / hours change (so live editor preview stays
synced). Live current value sits prominent next to the chart so
the register reads as 'trend + now', not 'chart'. Custom 40-line
SVG renderer — no Chart.js / D3 dependency. Bundle cost: ~1KB vs
80–150KB for a chart library. Editorial register: no axes, no
grid, no tooltips, no zoom. Single entity per sparkline (multi-line
charts translate to a stack of sparklines). `mini-graph-card`
translator now emits real sparklines instead of markdown stubs;
single-entity goes from `partial` to `clean`.

**Coverage on the canary's 88-card real-world dashboard:**

| Version | Visible | Clean | Partial | Skipped | Rendered |
|---|---|---|---|---|---|
| 0.1.62 (start of Phase 3) | 22 | 5 | 0 | 17 | 23% |
| 0.1.63 (+10 translators) | 22 | 5 | 9 | 8 | 64% |
| 0.1.64 (+Jinja) | 22 | 5 | 9 | 8 | 64% (quality fix) |
| 0.1.65 (+8 translators) | 34 | 7 | 20 | 7 | 79% |
| 0.1.66 (+stack-in-card) | 88 | 25 | 49 | 14 | 84% |
| 0.1.67 (+heading + mini-graph + icon-only) | 88 | 27 | 57 | 4 | 95% |

Total card count grew from 22 to 88 between 0.1.65 → 0.1.66 because
the recursive wrappers revealed children previously hidden behind
their wrapper failures. The 95% figure is the meaningful one — on a
heavily-customised Mushroom-and-HACS dashboard, broadsheet renders
84/88 cards with at least partial fidelity.

### Phase A polish (0.1.69)

Tighten the new surfaces while findings from the dogfooding pass
were fresh. Five paired UX cleanups in two commits:

- **Structured per-action editor for action-grid blocks** — the
  raw-JSON textarea was the single biggest builder pain point.
  Each action is now a card with label / detail / icon text inputs,
  a service-call fieldset (domain / service / target entity_id),
  an optional state-binding fieldset, and per-action move / remove
  controls. + Add action button appends a sensible default.
- **Drag-to-reorder blocks** — header is the drag handle (whole
  row is the drop target), ⋮⋮ grip signals draggability, dragging
  row dims to opacity 0.4, drop target gets dashed accent border.
- **Slug rename on existing pages** — inline form with the same
  validation as create. On commit, updates curation in place +
  redirects the editor URL. Old URL 404s — flagged in the hint.
- **Page duplicate** — deep-clones the source page (JSON
  round-trip) with a new slug + label, slots into the array with
  a fresh navOrder. Redirects into the new page's editor.
- **Save-status indicator** — persistent strip near the editor
  head: editing… / saving… / ✓ saved (auto-fades after 1.6s) / ⚠
  save failed. Border + text colour reflect status. Closes the
  "did my edit land?" gap from the 400ms debounce.
- **Importer Retry button** on `getLovelaceConfig` failure (was
  "Pick another dashboard" only).

### v0.2 status

| Phase | Status |
|---|---|
| 1 Substrate | Shipped — 11 primitives (incl. sparkline) |
| 2 Builder UI | Shipped — list + editor + per-block forms + live preview |
| 3 Importer | Shipped — 27 translators + Jinja evaluator |
| Polish | Shipped — structured action editor + drag-reorder + rename + duplicate + save indicator |
| Docs | In progress |

Remaining v0.2 work:
- Docs: translator matrix, plugin author quickstart, custom-page +
  importer end-user guides
- HA-user-landscape research → epics → automated rubric tests →
  gap analysis → ship-readiness synthesis artefact (precedes
  v0.1.0 release-prep gates)

---

## v0.1.0 scope expansion — frontend takeover + voice (2026-05-16)

After the V2 fresh-user dogfood cleared the 17-bug burst (3 blockers
fixed, 5/6 seriouses fixed + 1 reclassified, 7/8 minors fixed + 1
deferred, 188/188 tests pass, factory-fresh re-walk clean), a design
review surfaced two product-shaped omissions the V1 landscape research
had missed. Both are now v0.1.0 ship-blockers:

### 1. Frontend takeover

**Omission**: broadsheet shipped as a peer frontend alongside HA's
native Lovelace UI. Pain point #6 from `HA-USER-LANDSCAPE.md` ("config
tree, not UI") became "two config trees" for broadsheet users — they
had to remember to bounce between broadsheet (for the editorial
surfaces) and HA's sidebar (for settings, integrations, devices,
logs). Worst-of-both-worlds.

**Fix in v0.1.0**:
- Addon `sidebar_takeover: true` by default — on first install, HA's
  sidebar collapses globally and broadsheet's ingress becomes the
  user's landing surface.
- Broadsheet-native UIs for the 6-8 most-touched HA settings —
  People / Areas / Entities / Voice (already half-done) plus
  Integrations / Add-ons / Devices / Logs (new). Each lives at
  `/settings/*` inside broadsheet, talks to HA's WS APIs directly,
  reads in the editorial register rather than the config tree.
- "Open HA settings →" affordance in the kebab nav drops the user
  into HA's own UI for the unusual flows (initial integration setup
  wizards, debug snapshots, advanced YAML).
- Roll-back path: `sidebar_takeover: false` keeps HA's sidebar in
  place and runs broadsheet as a peer frontend (V0.0 behaviour).

Design plans: `docs/plans/plan-sidebar-takeover.md` +
`docs/plans/plan-ha-settings-native-uis.md`.

Rubric: new Epic 7 (5 stories: P7-S1 through P7-S5).

### 2. Voice + Harold

**Omission**: V1 landscape's "Voice PE cohort" line was a single
bullet under "Where broadsheet misses". But every HA install above
2024.x has STT/TTS + a conversation pipeline + Atom Echo / Wyoming-
protocol satellites in the wild. Shipping a visual-only home dashboard
in a voice-aware era is shipping with eyes closed. broadsheet's
editorial register is uniquely well-shaped for the moment-of-spoken-
response surface (italic display + concise prose = legible at glance).

**Fix in v0.1.0**:
- `@broadsheet/voice` generic plugin — discovers your HA conversation
  agents (HA-native intent matcher, Whisper, OpenAI Conversation,
  Anthropic, custom) + your TTS providers (HA Cloud, Piper,
  ElevenLabs, OpenAI). HA-native intent gets first attempt on every
  utterance (sub-200ms, free); only unmatched intents fall through to
  the user-configured LLM.
- Voice transcript pane visible inside broadsheet — slim chrome,
  editorial register, last N utterances + replies.
- `@broadsheet/harold-preset` opinionated bundle — one-tap install of
  the Hitchcock prompt suffix, meeting-mode hard-mute, Italian
  detection, garbled-input filter, "Hey Harold" wakeword model + Atom
  Echo config, conversational memory layer, Claude Haiku + ElevenLabs
  Flash v2.5 wiring with user-supplied keys.
- Local-only path supported by design: pair voice substrate with
  Ollama + Piper (both free, both run locally) for a working voice
  pipeline without paid subscriptions.

Design plans: `docs/plans/plan-voice-substrate.md` +
`docs/plans/plan-harold-preset.md`.

Rubric: new Epic 8 (5 stories: P8-S1 through P8-S5).

### Ship timeline

Target ship 2026-06-06 (~3 weeks from now). v0.1.0 scope locked at:
- All 8 core surfaces (shipped)
- All 3 first-class plugins (shipped)
- Lovelace importer (shipped)
- Full markdown renderer (shipped 2026-05-15)
- 12 fixes from V2 dogfood burst (shipped 2026-05-15)
- Frontend takeover + 6-8 native HA settings UIs (in flight)
- Voice substrate + Harold preset (in flight)

What v0.1.0 explicitly does NOT include (v0.1.x or v0.2):
- Per-user dashboard variants (E3-S1)
- Conditional visibility primitives
- Slider primitive
- Multi-series chart
- eInk render mode
- Pop-up / modal navigation
- Re-import to update an existing custom page

## 2026-05-17 — 0.9.1 — things-first wall builder

After the 0.9.0 wall-builder ship (which kept the typed-block-picker
editor and just added the kiosk URL + surface dimensions field), user
feedback was immediate:

> The pick a block section isn't actually what's needed, people want
> to add a thing, drag and drop a functional thing. They don't care/
> want to bother with how that thing renders per se, that's our job.

The mismatch is straightforward. broadsheet's prior editor surface
was "pick a block primitive, then configure it with domain / service /
entity_id strings". The user's mental model is "I have an Edifier
speaker in the living room — put a button on the wall for it." So
0.9.1 replaces the primitive-picker UX with a things-first surface
while leaving the underlying block contract untouched.

**Two new primitives** under the existing `BlockDef` discriminated
union (additive, no migrations, old pages render unchanged):

- `thing` — wraps a single HA `entity_id`. The renderer reads the
  entity's domain at render time and dispatches to the right widget
  (light → toggle, scene → tap-to-fire, climate → temp+slider,
  lock → unlock, media_player[tv] → media-tv, sensor → value-pill,
  etc.). User picks the entity; broadsheet picks the widget. Override
  is one-line if needed.
- `macro` — composed action tile built in-editor: pick a thing → pick
  an action ("turn on / activate / set temp / unlock / next option"
  from `defaultActionsFor(entityId)`) → repeat → save. Tap on the
  rendered tile fires every step in order. Distinct from the existing
  hardcoded `macro-grid` block.

The domain → widget map lives in `thing-mapping.ts` alongside
`defaultActionsFor()` so future surfaces (TUI? voice?) can reuse it.

**New editor surface** at `/settings/pages/[slug]/`, gated on
`customPage.editorMode`:

- **Browser** (`ThingsBrowser.svelte`): the user's controllable things
  organised by area (sorted alphabetically; "Unsorted" pushed to the
  end + collapsed) plus cross-area buckets for scenes / scripts /
  automations / status sensors / other. Per-area buckets show only
  controllable domains (light, switch, climate, lock, cover, camera,
  media_player); cross-area buckets pool scene/script/sensor/etc.
  across every area, dedup'd by entity_id. Search filters across
  name / entity_id / area name; matches expand their groups. Each
  thing renders as a tap-OR-drag row — tap appends to the canvas;
  HTML5 drag sets `application/x-broadsheet-entity` for the canvas
  drop handlers. "✓ on canvas" badge on already-placed entities.
- **Canvas** (`ThingsCanvas.svelte`): the page being built, with drop
  seams BETWEEN rows (drop to insert at that position), drag-to-
  reorder, inline thing/macro/outline editors, "switch to advanced
  to edit" hint for non-native block types (action-grid, sparkline,
  entity-list, etc. still render correctly in the preview — they
  just aren't tap-editable from this surface). "+ Section divider"
  and "+ Macro" footer buttons.
- **Composer** (`MacroComposer.svelte`): modal walking the user
  through name → pick-thing → pick-action → repeat. The picker
  reuses `buildBrowserTree` so it looks like the main browser. No
  service.domain typing anywhere.
- **Preview** (`SurfacePreview.svelte`): when `customPage.surface` is
  set (1280×800 Fire HD, 1340×800 Galaxy Tab A9, etc.), renders the
  page at the target device's native CSS dimensions and scales it to
  fit the editor pane via CSS transform. The user sees what the wall
  will actually show — not a phone-sized representation that's
  misleading on a 1280×800 surface. Falls back to natural-flow render
  when no surface is set (parity with the legacy preview).

**Default behaviour change**: new pages — both blank and preset-built
— default to `editorMode: 'things-first'`. Legacy pages without the
field render with the advanced editor via the `editorMode ?? 'advanced'`
fallback in the editor. The toggle in page meta flips either way per
page; the underlying block list is the same shape both ways, so
flipping doesn't lose work.

**Ship-readiness gates** all green:
- svelte-check: 0 errors, 0 warnings across 512 files.
- vitest: 270 tests pass (added 4 new tests for `thing` + `macro`
  registry coverage + default-config invariants).
- production build: clean.

**Deferred** (per the locked spec): `row` + `grid` primitives so
things-first can express two-up tiles and grid arrangements
(currently still vertical-only), plus the Lovelace import path
landing imported pages directly in the things-first canvas with
masonry/coverage report + the two-layer escape hatch (pre-import
"Skip review" toggle + in-canvas "Save as-is" button). Originally
scheduled as 0.9.2 — reslotted to **0.9.3** after dogfood of 0.9.1
surfaced a more urgent miss: the browser was showing atomic entities
when the user thinks in accomplishments ("can I add a TV on/off
button? can I add an all-lights-in-this-room panel?"). The browser
rethink became 0.9.2 — spec at
`docs/plans/plan-9.2-browser-accomplishments.md`. Layout work
follows at `docs/plans/plan-9.3-lovelace-import-layout.md`.

Plan: `docs/plans/plan-9.1-wall-builder-things-first.md` (full
decision-set + sequenced impl plan, locked then marked
IMPLEMENTED with file inventory).

## 2026-05-17 — 0.9.2 — browser as accomplishments, not atoms

Same-day dogfood of 0.9.1 against the live HA install surfaced the
same shape of mistake as 0.9.0 → 0.9.1, one layer in. User feedback:

> When I look in the living room set, whilst I see tv, speaker, those
> mean nothing. What can I *do* with them? Can I add a 'TV on / OFF'
> button? Great, that's what I want. Can I add a quick 'all lights in
> this space with controls' panel? See what I mean? You are showing
> atomic units, we need "what can I accomplish" units.

0.9.1 fixed "the editor asks me to pick a block primitive when I
think in things". 0.9.2 fixes "the browser shows me HA entities when
I think in accomplishments". Sequencing impact: the previously-
planned 0.9.2 work (row + grid primitives + Lovelace import landing)
is reslotted to 0.9.3 — the browser is the front door, it had to
stop misframing the task first.

**The new data model**: `AccomplishmentRecipe` replaces 0.9.1's
`BrowserThing`. Each recipe is a named verb ("All Living Room
lights — off", "Living Room TV — full remote", "Activate Cinema")
that produces ≥ 1 blocks when added to the canvas. Some recipes are
atomic (one entity → one `thing` block); others are composed (a
panel of N lights, a one-tap macro across N TRVs). Each carries a
`referencedEntityIds[]` so the placed-badge can fire when every
referenced entity is already on the canvas.

**Per-area sub-groups** (only emitted when the relevant bucket is
non-empty):

- **Lights** — when ≥ 2 lights: `<area> lights — panel` (section
  divider + N thing tiles), `<area> lights — off` (1-tap macro with
  N `turn_off` steps), `<area> lights — toggle` (1-tap macro with N
  `toggle` steps). Always: one atomic per light.
- **TV** — per TV: `full remote` (widget=`media-tv`), `power toggle`
  (widget=`toggle`), `turn on` (1-tap macro), `turn off` (1-tap
  macro). Single-entity but 4 distinct accomplishments — different
  jobs, different tiles.
- **Speakers** (non-TV media) — per device: `full control`,
  `play / pause`, `turn on`, `turn off`.
- **Climate** — when ≥ 2 TRVs: `<area> heating — boost to 21°` +
  `<area> heating — off (5°)`. Always: per-TRV atomic.
- **Switches** — atomic per switch.
- **Locks** — per lock: `unlock` (1-tap macro) + `status tile`
  (widget=`lock`).
- **Cameras** — atomic snapshot tile.
- **Sensors** — atomic value pill ("Show <sensor>" — deliberately
  framed as a verb).

**Cross-area buckets** stay (scenes / scripts / automations /
status / other) but each row becomes a recipe: "Activate <scene>",
"Run <script>", "Trigger <automation>", etc.

**ThingsBrowser** rewrite renders groups → sub-groups → recipes;
sub-group headers appear only when a group has > 1 sub-group (cross-
area buckets render flat). Tap + drag both work. Recipe drag carries
the full payload in `application/x-broadsheet-recipe`; 0.9.1's
`application/x-broadsheet-entity` MIME is still recognised as a
fallback for any in-flight legacy drag. The `▸` glyph marks composed
recipes, `·` marks atoms.

**ThingsCanvas** drop handler parses recipe payloads and inserts
every block in order at the drop position via a single atomic
`onInsertBlocks(index, blocks)` write. The legacy
`onAppendBlock`/`onInsertBlock` props were renamed to
`onAppendBlocks`/`onInsertBlocks` (always-arrays); a single-block
convenience `appendBlock(b)` wraps `appendBlocks([b])` for the
"+ Section divider" footer button.

**MacroComposer** picker switched from `buildBrowserTree` (now
accomplishment-led) to a new `buildEntityPicker` helper that returns
the simpler atomic-entity-by-area shape the composer needs.
Composing the macro IS what produces the composition; the picker
should not pre-compose.

**Ship-readiness** all green:
- svelte-check: 0 errors, 0 warnings across 513 files.
- vitest: 292 tests pass (+22 new in
  `tests/unit/things-browser.spec.ts` covering recipe generators,
  cross-area dedup, default-collapsed flags, filter, count, and
  entity-picker shape).
- production build: clean.

**Deferred** (per the locked plan): the 0.9.3 row + grid + Lovelace
import work at `docs/plans/plan-9.4-lovelace-import-layout.md`
(reslotted from 0.9.3 after 0.9.2 dogfood surfaced this work as
a higher priority).

Plan: `docs/plans/plan-9.2-browser-accomplishments.md` (full
recipe enumeration + sequenced impl plan, locked then marked
IMPLEMENTED with file inventory).

## 2026-05-17 — 0.9.3 — composite area-panels + inline plugin blocks

Same-day dogfood of 0.9.2 against the live HA install surfaced two
related misses. User feedback:

> Really good, the only thing missing would be to add any components
> already built. For example I don't really want an on button for
> the tv, I want the remote. If I want the remote, I might also want
> to add the TMDB component. If I want to add all lights in a room,
> I want a component if it exists, not a bunch of single bulbs, etc.

Same shape as 0.9.0 → 0.9.1 and 0.9.1 → 0.9.2 — one layer in each
time, the surface keeps reflecting broadsheet's internal mental
model when the user thinks in something coarser. 0.9.3 fixes the
two specific shapes:

1. **"Panel" recipes were dropping atoms.** 0.9.2's "Living Room
   lights — panel" emitted `outline + N thing blocks` — the user
   had to delete N tiles to remove a panel, and the panel didn't
   grow when they added a 5th light to the area. The right shape is
   ONE block that internally enumerates entities at render-time.
2. **Plugin renderers were page-bound.** TMDB rows lived at `/tv`;
   no way to drop them on the same wall surface as a TV remote,
   even though every piece needed already existed.

Both fixes are additive. Old pages keep rendering; the contract is
preserved.

### A. Composite area-panel blocks (core)

Three new core block types — `area-lights-panel`,
`area-climate-panel`, `area-media-panel`. Each takes just an
`areaId` and renders an inline grid of one widget per entity in
that area, at render-time. One block, one drop, one remove, one
undo. Grows + shrinks with discovery:

| Block type | Renders | Recipe verb |
|---|---|---|
| `area-lights-panel` | One toggle per light in the area | `<area> lights — panel` |
| `area-climate-panel` | One climate tile per TRV in the area | `<area> heating — panel` |
| `area-media-panel` | TV remote(s) + speaker(s), correct widget per device | `<area> media — panel` |

The 0.9.2 "panel" recipe now emits ONE composite block instead of
the section + N atoms. Two NEW recipes: `<area> heating — panel`
(missing from 0.9.2) and `<area> media — panel` (only emitted when
the area has ≥ 2 media devices OR mixed TV + speaker — single-TV
areas keep the more-useful per-TV recipes uncluttered).

### B. Plugin block contributions (contract extension)

One new optional field on the FROZEN-at-v0.1 `BroadsheetPlugin`
contract: `extraBlocks?: PluginBlockContribution[]`. Each
contribution declares a colon-prefixed block type id
(`tmdb-tv:rows`, `emanations:painting`), a lazy renderer thunk, a
default config + label + description (for the legacy advanced
picker), and an optional `suggestRecipes(discovery)` that surfaces
the block as one or more recipes in the things-first browser at
specific sub-group placements.

The block registry's `blockRenderer(type)` now consults
`pluginLoader.activePluginBlocks` after the static core REGISTRY;
unknown types render a "missing renderer" placeholder rather than
crashing (a plugin disabled after authoring still leaves the page
viewable). `ThingsBrowser.svelte` feeds `activePluginBlocks` into
`buildBrowserTree`, which calls each contribution's
`suggestRecipes` and slots returned suggestions into the right
per-area sub-group or cross-area bucket (lazy-creating a
`Components` bucket if a plugin lands there). A misbehaving plugin
that throws inside `suggestRecipes` is caught with a `console.warn`
— the rest of the browser still builds.

**The plugin-block host context.** Plugin block renderers can't
runtime-import `@broadsheet/core` (the contract forbids it; runtime
back-imports would close the execution cycle). They need curation +
discovery to render correctly. Solution: core's `RenderedPage`
publishes a `PluginBlockHostContext` via Svelte's `setContext` at
a stable string key `PLUGIN_BLOCK_HOST_CONTEXT_KEY =
'broadsheet:plugin-block-host'`. Plugin block renderers read it via
`getContext`. The host object is GETTER-shaped, so Svelte 5
reactivity flows through every access — the block re-renders when
curation or discovery updates. Type imports are compile-time only
and erased at runtime; the cycle never closes.

**Proof contribution: `@broadsheet/tmdb-tv`** (bumped to 0.2.0).
Declares one `extraBlocks` entry (`tmdb-tv:rows`) whose
`suggestRecipes` walks the discovery snapshot and returns one
recipe per area with TVs:

```
▼ Living Room
   …
   ├─ TV ──────────────────────────────────
   │  ▸ Living Room media — panel
   │  ▸ Living Room TV — full remote
   │  ▸ Living Room TV — TMDB show & movie rows  ← NEW (plugin)
   │  ▸ Living Room TV — power toggle
   │  …
```

New `RowsBlock.svelte` wraps the existing `ContentRows.svelte`
renderer, reads `curation.integrations.tmdb` via the host context.
No runtime core import — types only. The `/tv` page continues to
work unchanged.

**Ship-readiness** all green:
- svelte-check: 0 errors, 0 warnings across 517 files.
- vitest: 306 tests pass (+14 new across `things-browser.spec.ts`
  + `blocks.spec.ts` covering panel-composites + plugin recipe
  slotting + lazy cross-area bucket creation + misbehaving-plugin
  graceful handling + missing-placement graceful drop).
- production build: clean.

**Deferred** (per the locked plan): `row` + `grid` primitives + the
Lovelace import landing-in-things-first work. Spec at
`docs/plans/plan-9.4-lovelace-import-layout.md`.

Plan: `docs/plans/plan-9.3-composites-and-plugin-blocks.md`
(full recipe enumeration + sequenced impl plan, locked then
marked IMPLEMENTED with file inventory).

## 2026-05-17 — 0.9.4 — row + grid + Lovelace import that respects layout

The last major chunk on the wall-builder arc. 0.9.1 → 0.9.3.x
delivered the things-first editor + accomplishments browser +
composite area-panels + plugin block contributions; 0.9.4 closes
the loop with layout container primitives + a Lovelace importer
that actually preserves layout signals instead of flattening
everything to a vertical strip.

Plan: `docs/plans/plan-9.4-lovelace-import-layout.md` (originally
0.9.2; reslotted to 0.9.3 then 0.9.4 as later dogfood added
intermediate priorities, locked across the renumbering — same
decisions). User feedback the plan responded to:

> We can technically import most things, but then when we create
> a page it's just a huge vertical list of things which no
> thought given to arrangement on a page.

### Two complementary fixes

**A. `row` + `grid` block primitives**

Three new core block types:

- `row` — horizontal flex container. Children get `flex-grow:
  child.colSpan ?? 1`, so equal-share by default + weighted by
  `colSpan`. Stacks to a column below 640px.
- `grid` — CSS-grid container with `columns: N` (default 12,
  matching Lovelace's sections-layout convention). Children take
  1 column by default; `colSpan: N` spans N columns. Responsive
  collapse: 12 → 6 → 3 → 1 at 1024/640/480px. The `BlockSlot`
  wrapper clamps colSpan to the effective column count so nothing
  overflows.
- `colSpan?: number` as an OPTIONAL top-level field on every
  `BlockDef` (intersected onto the discriminated union — TypeScript
  narrows on `type` correctly because the discriminator is at the
  same level). Layout property, not a per-config field.

New `BlockSlot.svelte` factors out the "look up renderer in the
registry, lazy import, render with `{config}`" dance — used by
RenderedPage at the top level + Row and Grid for their children.
Plugin block host context (set by RenderedPage via `setContext`)
propagates to every descendant so plugin blocks render correctly
when placed inside containers.

**B. Translator upgrades that honour layout signals**

`$lib/lovelace/translate.ts` got a substantial upgrade:

| Lovelace shape | broadsheet emits (was → now) |
|---|---|
| `horizontal-stack` | flat-flattened with note → **row block wrapping children** |
| `vertical-stack` | flat sequence | (unchanged — page is already vertical) |
| `type: 'grid'` card | flat sequence (no translator) → **grid block with same column count + per-child `colSpan` from `grid_options.columns`** |
| `type: 'sections'` view | not read at all → **one grid per section with 12-col scale; section title → outline above; per-card colSpan from grid_options** |
| `type: 'panel'` view | flat sequence → **translate single card without wrapper** |
| Default / masonry view | flat sequence (every card vertical) → **tiered heuristic: 3-col >12 cards, 2-col 6-12, 1-col <6** — wrap requires ≥ 1 small card type (chip/glance/sensor/tile/button) to avoid bunching tall graphs side-by-side |

New `partial-layout` coverage status distinguishes "data through,
layout approximated by heuristic" from "fields dropped". Stamped
on every report when the masonry heuristic wraps the view.
`partialLayout` count added to the dashboard totals.

### Post-import draft semantic

Imported pages no longer commit directly. They land as drafts in
the things-first canvas:

- New `draft?: boolean` field on `CustomPageDef`. Drafts default
  to `hiddenFromNav: true` so half-reviewed imports don't clutter
  the kebab.
- `/settings/pages/import/` defaults imports to `draft: true,
  hiddenFromNav: true, editorMode: 'things-first'`.
- `/settings/pages/[slug]/` shows a draft banner when
  `customPage.draft === true` — clear prose ("Draft from Lovelace
  import. Review the canvas, rearrange anything you'd like, then
  commit so it appears in your nav.") + two affordances.

**Two escape hatches** per the locked plan:

1. **Pre-import** — "Skip review, save directly" checkbox on the
   import review step. Commit button flips between "Import + save"
   (skip) and "Import as draft → review" (default).
2. **Post-import** — "Save as-is" button in the draft banner.

Both call the same `commitDraft()` (flips `draft: false` +
`hiddenFromNav: false`). Discard triggers the existing delete-
confirmation flow.

### Things-first canvas inline editor for row + grid

Tapping a row/grid block in the canvas opens an inline editor
with section label override + gap + (for grid) columns. Children-
editing routes to "switch to advanced" for now — containers are
treated as atomic in things-first. Nested DnD inside containers
is a real UX problem worth a dedicated patch.

### Worked example

A Lovelace dashboard with a `type: 'sections'` view containing:

```yaml
sections:
  - title: Lights
    cards:
      - { type: light, entity: light.pendant, grid_options: { columns: 6 } }
      - { type: light, entity: light.lamps, grid_options: { columns: 6 } }
  - title: Cinema
    cards:
      - { type: button, ..., grid_options: { columns: 4 } }
      - { type: media-control, ..., grid_options: { columns: 8 } }
```

**Pre-0.9.4** translated to a flat vertical strip — five blocks
stacked, layout completely lost.

**0.9.4** translates to:

```
outline · 'Lights'
grid (columns: 12, children: [
  action-grid (pendant, colSpan: 6),
  action-grid (lamps, colSpan: 6)
])
outline · 'Cinema'
grid (columns: 12, children: [
  action-grid (scene.movie, colSpan: 4),
  entity-list (TV, colSpan: 8)
])
```

Lands in the things-first canvas as a draft. User reviews,
optionally rearranges, taps "Save as-is" or "Commit as wall
surface". Done.

### Ship-readiness all green

- svelte-check: 0 errors, 0 warnings across 521 files.
- vitest: 333 tests pass (+27 new) across 17 files:
  - `blocks.spec.ts` (+5): row/grid in `ALL_BLOCK_TYPES` + default-
    config defaults
  - `translate.spec.ts` (+19): horizontal-stack → row, vertical-
    stack still flat, grid card, sections view + section titles +
    empty sections, panel view, masonry tiered heuristic across
    all 4 tiers (no-wrap / 2-col / 3-col / no-wrap-when-all-tall)
  - `fresh-curation.spec.ts`: block-type count bumped 16 → 18
- production build: clean.

### Deferred to follow-on patches

- Editing children of a row/grid INSIDE the things-first canvas
  (today: "flip to advanced to nest-edit"). Real DnD between
  containers is a substantial UX problem and not blocking ship.
- The plan's "coverage report at the FOOTER of the imported page
  editor" — currently the report shows on the import-review step
  only; moving it to the editor footer is a smaller follow-up.
- Per-block colSpan override surface in the things-first canvas
  inline editor for blocks placed inside a grid container.

Plan: `docs/plans/plan-9.4-lovelace-import-layout.md` (full
decision-set + sequenced impl plan, locked then marked
IMPLEMENTED with file inventory).

## 2026-05-17 — 0.9.4.1 — tabs primitive + multi-view Lovelace import

Same-day dogfood of 0.9.4 against a real wall-tablet dashboard
surfaced the next gap. User imported their `wall-tablet`
dashboard (8 views, ~130 cards). Result: 1 broadsheet page with
34 blocks (16 markdown / 17 single-action action-grids / 1 row
/ 0 grids), and the other 7 views never arrived. Feedback:

> I picked wall tablet, which has home, heating, door, lights,
> remote, nearness, immaterials and presence history. I can only
> import one view?

My initial proposal was to split multi-view imports into N
broadsheet pages, slug-prefixed (`wall-tablet-home`,
`wall-tablet-heating`, etc.). User flagged the framing was wrong:

> Absolutely no to multi page creation from one lovelace page
> import, that defeats the entire purpose. Lets think this through
> from the users pov before proceeding.

Right call. The wall-tablet ISN'T 8 things — it's ONE wall surface
with tab navigation between sections. Each Lovelace view is HA's
implementation of "tab", not "page". The chip-bar at the top of
every view IS the tab-bar — the user designed it as one cohesive
interface. Splitting on import throws away that mental model +
forces the user to either rebuild navigation from scratch or
accept 8 isolated walls.

The actual gap: broadsheet had no `tabs` primitive yet.

### What 0.9.4.1 ships

**`tabs` block primitive**. New BlockDef variant with
`config: { tabs: TabDef[]; paramName? }`. Each TabDef carries an
id (URL-stable), label, optional icon, and `blocks: BlockDef[]`
for that tab's content. Composable as a block (not page-level)
so a page can have hero + tabs + explainer, same authoring
metaphor as every other primitive.

**TabsBlockRenderer**. Chip-bar at the top, active tab's content
via BlockSlot below. **URL-bound** active tab via `?tab=<id>` —
refresh stays on the tab, deep-links work, browser-back swaps
tabs. Uses `goto` (push) so each switch adds a history entry.
Critical for cast displays + kiosk tablets that may reload.

**Multi-view Lovelace import → ONE page with tabs**. New
`translateDashboardAsTabs(config, dashboardUrlPath)` walks every
view, wraps results in a single tabs block, one TabDef per view.
View `path` becomes the tab id (so deep-links land right);
`title` becomes the chip label. The aggregated `reports` list
covers every view's per-card translation status, so the user
sees one coverage report for the whole dashboard.

The import flow defaults to "Import all N views as tabbed page"
when the dashboard has > 1 view; the per-view "pick a single
view" option stays as an override. The pick-view step gets a
recommended tile at the top showing the tab labels + a one-tap
accept path.

**Chip-bar dedup**. The translator recognises the hand-authored
view-nav chip-bar at the top of each Lovelace view and DROPS it
before per-view translation runs (otherwise the imported page
shows the tabs block AND a redundant chip-bar both doing the
same job). Pattern: a top-level card is a "view-nav chip-bar"
when it's a `horizontal-stack` / `vertical-stack` of cards whose
`tap_action: { action: navigate, navigation_path: '/<…>' }`
points at a sibling view's path, OR a `custom:mushroom-chips-card`
whose chips all carry such tap_actions. The detection is
conservative: only top-level removal, only when EVERY child of
the candidate matches the pattern. Mixed chip-bars (some chips
go elsewhere) are kept.

**Inline editor for tabs in the things-first canvas**. Per-tab
label override + id editor + per-tab block count + reorder +
remove + add. Editing the BLOCKS inside each tab routes to
advanced mode (same pattern as row + grid in 0.9.4 — container
children are atomic in things-first).

### Worked example — the wall-tablet import after 0.9.4.1

User picks "Wall Tablet" → pick-view step shows:

```
┌──────────────────────────────────────────────────────────────┐
│ Import all 8 views as one tabbed page                      ›  │
│ One broadsheet page · 8 tabs · chip-bar nav at the top ·     │
│ matches your wall-tablet's mental model                      │
│ Tabs: Home · Heating · Door · Lights · Remote · Here · …    │
└──────────────────────────────────────────────────────────────┘
                          — Or —
            (single-view list as before, below)
```

One tap → ONE broadsheet page (`wall-tablet`) with a tabs block
at the top + 8 tabs. Lands as a draft in the things-first canvas;
user reviews + commits.

### Ship-readiness

- svelte-check: 0 errors, 0 warnings (522 files).
- vitest: 341 tests pass (+8 new across blocks/translate/fresh-
  curation covering tabs default, multi-view shape, chip-bar
  dedup for stacks + mushroom-chips, mixed-bar preservation,
  single-view safety).
- production build: clean.

### Deferred to 0.9.4.2

The four translator-coverage fixes flagged in the dogfood:
- Coalesce chip rows into a single action-grid (today: N single-
  action grids inside a row)
- `custom:layout-card` + `custom:grid-layout` → broadsheet grid
- Mushroom-template-card without tap_action → state-pill thing
- `type: template` Lovelace card → dedicated translator

These are orthogonal to the tabs work. Shipping tabs gets the
USER-FACING MODEL right; the coverage improvements then fill in
the body of each tab.

Plan: `docs/plans/plan-9.4.1-tabs-and-multiview.md` (full
decision-set + sequenced impl plan, locked then marked
IMPLEMENTED with file inventory).

## 2026-05-18 — 0.9.4.2 — lovelace-embed escape hatch + honest import scoping

After 0.9.4.1's tabbed-multi-view import landed, dogfood against
a real card-mod-heavy wall-tablet dashboard made the translator's
structural ceiling clear. Tab-by-tab assessment of the imported
result (8 views, ~130 cards): 0/8 tabs were usable as control
surfaces. The honest verdict:

> Wait a second, absolutely no to multi page creation from one
> lovelace page import, that defeats the entire purpose. […]
> Check all the tabs, we might need to admit defeat as really
> it's just not usable, what do you think?

After looking at every tab via Chrome MCP, the honest assessment
landed as: yes, for THIS dashboard, defeat. The structural gap:

> The wall-tablet is built in card-mod + mushroom + custom HACS
> components. Those are not just card TYPES — they're an entire
> rendering language broadsheet doesn't speak. card-mod is
> CSS-injection on top of HA's Lovelace; mushroom is a tile-
> shaped visual register with its own primary/secondary/icon/
> colour stack; custom:room-presence-card is a stateful component
> with its own data pipeline. A static AST translator can't
> reproduce any of that.

The dashboards the translator handles well (51 tests passing)
are those built with HA's NATIVE primitives. Card-mod-heavy /
mushroom-heavy / HACS-heavy dashboards are at the other end of
the spectrum. The previously-planned 0.9.4.2 translator fixes
(chip coalescing / grid-layout / mushroom state-pill /
type:template) would tidy specific symptoms but not bridge that
gap.

The decision: accept the constraint, ship an escape hatch, be
honest in docs.

### What 0.9.4.2 ships

**`lovelace-embed` block**. A thin iframe wrapping an HA Lovelace
URL. Perfect fidelity to the source dashboard; zero translation
gaps. Config is just `{ url, height?, label? }`. The renderer
surfaces a placeholder when URL is empty + a hint after a 5s
no-load timeout pointing at the TROUBLESHOOTING X-Frame-Options
recipe. `color-scheme: dark light` on the iframe so HA's theme
renders consistently inside.

**Import flow gains embed options at every level**:

- **"Embed the whole dashboard (don't translate)"** tile at the
  top of the pick-view step, for both multi-view and single-view
  dashboards. Creates one broadsheet page with a single
  lovelace-embed block pointing at the dashboard's URL.
- **Per-view "Embed instead" button** next to each translated
  view in the picker list. For the one view in your dashboard
  that's too custom-heavy to translate cleanly.

`embedHaUrl(dashUrlPath, viewIdx)` composes the embed URL:
`http://<broadsheet's host>:8123/<dashboard>/<view>?kiosk=true`.
The `?kiosk=true` suffix suppresses HA's sidebar + header for a
chrome-free render. User can edit per-block via the inline editor.

**Things-first canvas gains a `+ Lovelace embed` footer button**
alongside `+ Section divider` and `+ Macro`. Users can drop an
embed into a hand-authored page (e.g. one tab is broadsheet-
native, another embeds a complex HA Lovelace view).

**Honest docs**:

- `CUSTOM-PAGES-GUIDE.md` gains a "When translation works well
  vs when to embed" section with explicit per-card-type notes for
  the known gaps (mushroom-*, card-mod, custom HACS, layout-card
  grid-template-areas).
- `TROUBLESHOOTING.md` gains two new sections: "Imported page is
  mostly markdown / dead labels" → the embed escape hatch is the
  answer; "Lovelace embed shows blank" → the HA-side
  X-Frame-Options DENY / `use_x_forwarded_for` config recipe.
- The import flow's intro now scopes honestly: best-effort for
  HA-native primitives; embed for the complex ones.

### Why this is the right shape

The temptation after seeing the wall-tablet dogfood was to keep
iterating the translator — add a translateMushroomTemplate state-
pill variant, add grid-layout parsing, add chip coalescing. Each
fix would have been real engineering for marginal value on the
specific dashboard that broke. Six versions of "almost" doesn't
beat one honest "here's the escape hatch + here's when to use
it."

Translation still leads the import flow — it's the default for
multi-view dashboards (one page with tabs, per 0.9.4.1) AND the
first option for single-view ones. Embed is the explicit
fallback, surfaced clearly when translation isn't the right
answer. Users with simple Lovelace dashboards get a clean
broadsheet-native render; users with custom-heavy ones get
perfect fidelity via embed; nobody gets stuck with an unusable
half-translation.

### Ship-readiness

- svelte-check: 0 errors, 0 warnings across 523 files.
- vitest: 343 tests pass (+2 new — lovelace-embed in
  `ALL_BLOCK_TYPES` + default-config defaults).
- production build: clean.

### Deferred (likely skipped)

The four translator-coverage fixes flagged in 0.9.4.1's deferred
list:

- Chip-row coalescing into a single action-grid
- `custom:layout-card` + `custom:grid-layout` → broadsheet grid
- Mushroom-template-card without tap_action → state-pill thing
- `type: template` Lovelace card translator

Real value for the people with simpler dashboards but the dogfood
evidence is they wouldn't have bridged the wall-tablet gap. Won't
ship absent a specific user request.

Plan: `docs/plans/plan-9.4.2-lovelace-embed-escape-hatch.md`
(full decision-set + sequenced impl plan, locked then marked
IMPLEMENTED with file inventory).

## 2026-05-18 — 0.9.4.3 — embed proxy strips X-Frame-Options

Dogfood of 0.9.4.2's lovelace-embed against the wall-tablet
produced the predicted browser error:

```
Refused to display 'http://homeassistant.local:8123/' in a frame
because it set 'X-Frame-Options' to 'sameorigin'.
```

Diagnosis: HA serves `X-Frame-Options: SAMEORIGIN` (verified via
`curl -I`). broadsheet's addon is configured with `ingress: false`
— runs on port 8124 (direct). ALWAYS cross-origin to HA's 8123 →
SAMEORIGIN always blocks. The fix in 0.9.4.2's docs ("configure
HA to allow framing") works in theory but requires user-side HA
config; broadsheet should solve this itself.

### What 0.9.4.3 ships

**Addon-side: same-origin proxy in nginx.** New routes in
`nginx.conf.tpl`:

- `location ~ ^/embed/(.*)$` — proxies arbitrary paths to HA
  Core via the Supervisor + strips `X-Frame-Options` AND
  `Content-Security-Policy` (Lovelace sets CSP that would also
  block framing). Auth via Supervisor token.
- `/static/`, `/frontend_latest/`, `/auth/`, `/manifest.json`,
  `/service_worker.js` — auxiliary HA-asset proxy routes that
  the embedded Lovelace's frontend needs at the root level
  (XHR/fetch / module loads / auth flow / PWA). All authenticate
  via the Supervisor token.

`/api/` + `/api/websocket` were already proxied before 0.9.4.3 —
embedded Lovelace's REST + WebSocket inherit that plumbing.

**SPA-side: URL rewriting in the renderer + import flow.**
`LovelaceEmbedBlockRenderer.svelte` rewrites the user's `url`
config on render:

- Bare paths (`/wall-tablet/home?kiosk=true`) → `/embed/wall-tablet/home?kiosk=true`
- Absolute URLs on same-host:8123 → path extracted + prepended
  with `/embed`
- Cross-host URLs → left as-is (user-side HA config needed)
- Already-`/embed/`-prefixed URLs → left as-is (idempotent)

The import flow's `embedHaUrl()` now produces same-origin proxy
URLs directly. Pages saved via 0.9.4.2's cross-origin format keep
working because the renderer's rewrite is idempotent + handles
both forms.

**Honest caveats** (documented in TROUBLESHOOTING):

- The proxy authenticates as the addon's Supervisor user (admin).
  Embedded Lovelace renders with full admin visibility — fine for
  wall-tablet use; worth knowing for multi-user installs.
- Cross-host embeds (broadsheet on host A iframing HA on host B)
  still need user-side HA framing config. The addon's proxy only
  routes to the local HA Core via the Supervisor.

### Worked example — wall-tablet embed before vs after

**Before (0.9.4.2)**: iframe SRC = `http://homeassistant.local:8123/wall-tablet?kiosk=true`
→ browser refuses per SAMEORIGIN → `chrome-error://chromewebdata/`.

**After (0.9.4.3)**: iframe SRC = `/embed/wall-tablet?kiosk=true`
(resolves to `http://homeassistant.local:8124/embed/wall-tablet?kiosk=true`)
→ broadsheet's nginx proxies to HA Core, strips X-Frame-Options,
returns to browser → same-origin frame → renders the actual
wall-tablet dashboard.

### Ship-readiness

- svelte-check: 0 errors, 0 warnings (523 files).
- vitest: 343 tests pass (no test changes — this is a runtime
  nginx + URL-rewrite change with no public-contract additions).
- production build: clean.

Plan: `docs/plans/plan-9.4.3-embed-proxy-strip-xframe.md`
(full decision-set + sequenced impl plan, locked then marked
IMPLEMENTED with file inventory).
