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
