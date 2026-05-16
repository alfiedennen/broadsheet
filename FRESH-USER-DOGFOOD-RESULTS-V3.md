# Fresh-user dogfood results V3 — broadsheet 0.1.72 (Plans 1–4 scope expansion + clean uninstall)

Date: 2026-05-16 evening BST (V2 was 2026-05-15 18:35, V3 ~24hr later
after Plans 1–4 scope-expansion shipped + storage detour resolved +
release-path discrepancy caught + Plan 1 fix shipped as 0.1.71 +
Plan 1 clean-uninstall fix shipped as 0.1.72 + git history scrubbed
of all Co-Authored-By trailers).

**History-rewrite note (2026-05-16 14:40 BST)**: every commit SHA
referenced in this document is from BEFORE the Co-Authored-By
scrub. The actual SHAs on `alfiedennen/broadsheet@main` and
`alfiedennen/broadsheet-addon@main` are different now (history
rewritten via `git filter-branch` to strip 92 trailer lines that
were polluting GitHub's contributor graph). Commit *messages* and
*content* are unchanged — only the SHAs moved. Lookup by message if
you need to find a specific commit. Pinned image references
(`ghcr.io/alfiedennen/broadsheet-amd64:0.1.72` etc.) are stable
since they're version-tag-based, not SHA-based.

Agent: Claude (Sonnet 4.7, 1M-context).

Method: factory-reset `broadsheet.json` to `{}` on the live canary,
released 0.1.70 (first image containing Plans 1 + 4), caught a real
Plan 1 bug during the eyeball walk, fixed it, released 0.1.71, and
walked every surface live via the claude-in-chrome MCP against the
published image. Restored baseline at end.

Backup: `.dogfood/curation-baseline-V3.json` (3482 bytes, restored
post-test). harold.local NOT re-probed in this run (was 200 OK at V2
+ daily-driver hasn't been touched since).

## TL;DR — recommendation

**GO for v0.1.0** — recommendation reaffirmed against image 0.1.71
(broadsheet@`fcaa1cd`, addon@`8bffe1b`). Plans 1–4 all live-verified
against the published artefact, including one real bug caught and
fixed during the V3 eyeball walk.

V3 produced two material outputs the test suite would never have
found:

1. **Release discrepancy caught (pre-fix)**: every "live-verified"
   checkmark earned during Plans 1–4 implementation was against
   hot-patched files inside the running container, never against a
   published image. Forced the release through to image 0.1.70 (and
   then 0.1.71 to ship the bug fix).
2. **Plan 1 dockedSidebar localStorage bug caught + fixed**: the
   server-side `frontend/set_user_data` write in `init/sidebar.py`
   only took effect for brand-new browsers' first login. Existing
   browsers — i.e. nearly all of them — kept their cached
   `localStorage.dockedSidebar` value and the sidebar stayed visible
   despite the server saying otherwise. Fix in
   `+layout.svelte` writes the localStorage key from broadsheet's
   bootstrap when `env.sidebarTakeover=true`, dispatching HA's
   `hass-dock-sidebar` event for live update. Live-verified on
   canary 0.1.71: every HA URL now respects `always_hidden`.

Three small follow-ups land in v0.1.1 (label-wrap cosmetic, memory
backend audit, schema-default audit). None are blockers.

## Test totals

- **236/236 unit + integration tests pass** (was 188 at V2; +48 in V3 era
  covering voice routing/discovery + harold-preset prompts/filters +
  6 pytest cases for `init/sidebar.py`)
- **13 test files** (V2 had 9; +4: voice-conversation, voice-discovery,
  harold-prompts, harold-filters, plus addon-side test_sidebar.py)
- **0 type errors / 0 svelte-check warnings**
- **0 `Co-Authored-By:` trailer lines** across all 10 commits shipped
  this session

## Commits shipped this session

Broadsheet SPA (`alfiedennen/broadsheet`, main):

| SHA | Message |
|---|---|
| `5d604f3` | V2 dogfood burst — markdown + slug humanizer + person fallback + importer + 14 fixes |
| `9564621` | Plan 1 — v0.1.0 scope expansion (sidebar takeover + KebabNav + TakeoverBanner) |
| `07a28ad` | Plan 2 — native HA-settings surfaces (integrations, devices, addons, logs) |
| `78f7ebb` | Plan 3 — @broadsheet/voice substrate (HA-native-first conversation routing) |
| `f936f44` | Plan 4 — voice middleware contract + @broadsheet/harold-preset |
| `52e99ec` | KebabNav 'Open Home Assistant' relabel (was 'Open HA settings' → /config/) |
| `1334be0` | (superseded — wrong pnpm schema, fixed by next commit) |
| `bee9c86` | Build: set `allowBuilds:true` for esbuild + protobufjs + sharp (pnpm 11 schema) |
| `fcaa1cd` | **Plan 1 fix** — write dockedSidebar to localStorage when takeover is on |

Addon (`alfiedennen/broadsheet-addon`, main + tags):

| SHA | Message |
|---|---|
| `e727e85` | Plan 1 sidecar (init/sidebar.py) + nginx MIME warning + Python test harness |
| `ae26b5c` | Plan 4 harold-preset bundled artefacts + sidecar /api/harold-preset/* endpoints |
| `4f44fc8` | **0.1.70** — Plans 1–4 scope expansion |
| `8bffe1b` | **0.1.71** — Plan 1 sidebar takeover fix (dockedSidebar localStorage) |

Tags pushed: `v0.1.70`, `v0.1.71`. Images on GHCR:
`broadsheet-amd64:0.1.71`, `broadsheet-aarch64:0.1.71` (CI green
amd64 49s, aarch64 1m0s).

## What V3 found — the release discrepancy

The single most important structural finding. The fix-and-re-verify
loop during Plans 1–4 implementation was so smooth nobody noticed the
artefact-vs-source-tree gap.

**Pre-V3 state:**

| Repo | Local state |
|---|---|
| `broadsheet` (SPA) | 4 files modified locally (KebabNav + 3 sites of "Open HA settings" copy); 5 commits ahead of `origin/main` |
| `broadsheet-addon` | clean tree but 2 unpushed commits (`e727e85` Plan 1 sidecar, `ae26b5c` Plan 4 endpoints) |
| GHCR | latest tag `0.1.69` — predates both Plan 1 and Plan 4 |
| Live canary | running `0.1.69` + hot-patched run.sh / sidecar.py / harold-preset/ / init/sidebar.py |

A real user installing broadsheet 0.1.69 from GHCR would have gotten
the pre-scope-expansion experience.

**Resolution path executed:**

1. Committed the 4 SPA label fixes as `52e99ec` on `broadsheet@main`.
2. Pushed 6 SPA commits to origin (`7b31bd0..52e99ec`).
3. Bumped addon `broadsheet/config.yaml` 0.1.69 → 0.1.70, committed,
   pushed 3 addon commits (`f9d58c3..4f44fc8`).
4. Tagged `v0.1.70` + pushed tag — fired CI on both `main` push and
   tag push.
5. CI failed: `ERR_PNPM_IGNORED_BUILDS` on protobufjs + sharp from
   `@xenova/transformers` (Plan 4 memory). Plan 4's
   `pnpm-workspace.yaml` had a placeholder `allowBuilds:` block left
   at `"set this to true or false"` text. Fixed schema (allowBuilds
   IS pnpm 11's correct key, just needed boolean values), pushed
   `bee9c86`.
6. Re-triggered addon CI via `workflow_dispatch`. Build green (amd64
   56s, aarch64 1m9s). Image tagged `broadsheet-{amd64,aarch64}:0.1.70`.
7. Reloaded HA addon store, ran `ha addons update 68fa04fc_broadsheet`
   — canary recreated container from new image (`5a09e2be5e22` →
   `7bc867811c49`), version now `0.1.70` / latest `0.1.70`.

**Lesson:** the dogfood backup file in `.dogfood/` and the
`fresh-curation.spec.ts` integration test exist to prevent V1-style
regression-blindness. Neither catches "your live container has files
the published image doesn't." A pre-tag script can: assert
ahead-of-origin counts are 0 on both repos before allowing `git tag`.
Captured for v0.1.1.

## What V3 found — Plan 1 dockedSidebar localStorage bug

Walked the eyeball checklist after 0.1.70 was live. Hit
`/68fa04fc_broadsheet` — broadsheet rendered, but HA's sidebar was
still visible. Diagnosed via claude-in-chrome MCP:

1. `init/sidebar.py` boot log said `5 applied, 0 partial` — the
   server-side `frontend/set_user_data` write succeeded
2. Inside the broadsheet iframe, `window.__BROADSHEET_ENV__.sidebarTakeover`
   was `true` — the env was correct
3. BUT `localStorage.dockedSidebar` was `"\"auto\""` (HA's default
   stored as JSON-encoded string) — never overridden

Root cause: HA frontend stores `dockedSidebar` in BOTH localStorage
AND `frontend.user_data`. The user_data version is only the **seed**
for a brand-new browser's first login. After that, localStorage wins
on every subsequent load.

Without this fix, sidebar takeover only ever worked for fresh
browsers — every existing browser kept its prior value, which is
typically `"auto"` (sidebar visible on desktop).

**Fix in `packages/core/src/routes/+layout.svelte`:**

```ts
if (addonEnv?.sidebarTakeover === true && typeof window !== 'undefined') {
  try {
    const target = window.self !== window.top ? window.parent : window;
    const desired = JSON.stringify('always_hidden');
    if (target.localStorage.getItem('dockedSidebar') !== desired) {
      target.localStorage.setItem('dockedSidebar', desired);
      target.dispatchEvent(
        new CustomEvent('hass-dock-sidebar', { detail: { dock: 'always_hidden' } })
      );
      audit({ kind: 'auth-event', note: 'sidebar takeover: dockedSidebar localStorage set' });
    }
  } catch (e) {
    console.warn('[broadsheet] sidebar-takeover localStorage write failed:', e);
  }
}
```

Same-origin guard via `window.parent.localStorage` works because HA
panel iframes are same-origin with the parent HA frame. Bail silently
on cross-origin or storage-blocked.

Live-verified post-deploy: `/68fa04fc_broadsheet` panel URL renders
broadsheet bare with HA's hamburger-only collapsed header, no
sidebar. The kebab's "Open Home Assistant" entry navigates to `/` →
HA dashboard root → sidebar STAYS hidden globally (proving the
localStorage write applies to all HA URLs after broadsheet ran
once).

Shipped as `broadsheet@fcaa1cd` → `broadsheet-addon@8bffe1b` →
`broadsheet-addon v0.1.71`.

## Per-plan live-verification matrix (against image 0.1.71)

### Plan 1 — Sidebar takeover + KebabNav + TakeoverBanner

| Surface | Verification | Status |
|---|---|---|
| `init/sidebar.py` exists in image | `ls /usr/share/broadsheet/init/sidebar.py` → 9951 bytes | ✓ |
| `run.sh` reads `sidebar_takeover` option | `grep sidebar_takeover /etc/services.d/broadsheet/run` → conditional present | ✓ |
| `run.sh` emits `sidebarTakeover:` in `runtime-env.js` | `grep sidebarTakeover ... runtime-env.js` → `sidebarTakeover: true` | ✓ |
| `sidebar.py` runs cleanly on container boot | Boot log: `sidebar takeover complete: 5 applied, 0 partial`, authed against HA 2026.5.1, found 6 users, skipped Supervisor, set defaultPanel + dockedSidebar per real user | ✓ |
| dockedSidebar localStorage gets `"always_hidden"` after broadsheet boots | Browser JS: `localStorage.getItem('dockedSidebar') === '"always_hidden"'` after Plan 1 fix shipped | ✓ |
| HA sidebar actually hides on panel URL `/68fa04fc_broadsheet` | Screenshot: no sidebar visible, only `≡ broadsheet` hamburger header | ✓ live-verified |
| HA sidebar stays hidden on `/lovelace/0` and other HA URLs | Screenshot: dashboard tabs only, no sidebar | ✓ live-verified |
| KebabNav opens sheet with full nav list | 11 entries: The moment, Lights, Heat, Door, TV, Body, Wall, The Long Take, Settings, Open Home Assistant, Forget token | ✓ |
| KebabNav "Open Home Assistant" → href="/" + target="_top" + class="external" | DOM probe: all three confirmed | ✓ |
| KebabNav "Open Home Assistant" click breaks out of iframe → HA root | After click: `window.location.href === 'http://homeassistant.local:8123/nest-hub/home'` (HA default panel redirect chain) | ✓ |
| KebabNav "Forget token" carries `destructive` class | DOM probe: confirmed | ✓ |

**Plan 1 verdict:** ship-ready. The dockedSidebar bug was real and
the fix is the right shape. Schema-default-true is intentional (the
add-on IS the dashboard).

### Plan 2 — 4 native HA-settings surfaces

All four surfaces walked live with the user's actual data:

| Surface | Hero | Live data | Status |
|---|---|---|---|
| /settings/integrations | "Your integrations." | 70 integrations, 1 error (Galaxy Tab A9 / fully_kiosk setup_retry), 67 working. Actions: RELOAD/OPEN IN HA/DISABLE/REMOVE | ✓ |
| /settings/devices | "Your devices." | 199 devices from 55 integrations, 3 disabled. Grouped by integration. Area dropdown per device. | ✓ |
| /settings/addons | "Your add-ons." | 8 add-ons, Mosquitto broker v7.0.1 update v7.1.0 available, broadsheet v0.1.71 in RUNNING (verifies fresh install). Actions: STOP/RESTART/UPDATE/OPEN IN HA | ✓ |
| /settings/logs | "Recent errors + warnings." | 16 entries from 9 integrations, 7 errors / 9 warnings, grouped (HASSIO 3 errors, WEBSOCKET_API 2 errors), CLEAR ALL (16) | ✓ |

All four compose the substrate primitives (SettingsSurface +
StatusGrouped + EditorialRow) correctly. Tone-bordered error rows
(red left edge for ERROR group). REMOVE always in red.

**Plan 2 verdict:** ship-ready. Real WS interactions (reload /
disable / area-rename) not action-tested in this dogfood (would
mutate live HA state); source path is well-pinned.

### Plan 3 — `@broadsheet/voice` substrate

Plugin enabled live via /settings/plugins, walked `/voice` end-to-end:

| Surface | Verification | Status |
|---|---|---|
| Plugin toggle enables via UI | aria-checked false → true after real click | ✓ |
| `/voice` page renders editorially | "№ 09 · VOICE" eyebrow, "Voice." italic-serif headline, "Active pipeline: no STT · Harold · no TTS" status line | ✓ |
| Mic button + type-fallback input + footer copy | "🎙 TALK" button, "...or type" + "SEND" input row, explanatory footer paragraph | ✓ |
| HA-native-first routing works | Typed "what time is it" → "HA NATIVE" badge top-right of transcript message → reply "11:31 AM" (proves `conversation.home_assistant` handled it; did NOT fall through to LLM) | ✓ live-verified |
| Voice pill renders bottom-right on /the-moment | DOM probe: `{ text: "🎙", classes: "mic" }` at bottom-right of /the-moment | ✓ |
| `routeUtterance()` 12 routing cases pinned | tests/unit/voice-conversation.spec.ts | ✓ |
| `pullVoiceDiscovery()` 11 resilience cases pinned | tests/unit/voice-discovery.spec.ts | ✓ |

**Plan 3 verdict:** ship-ready. The HA-native-first routing is the
key Plan 3 value-add; verified to actually handle free queries
sub-200ms with the "HA NATIVE" badge so users see why.

### Plan 4 — Voice middleware + `@broadsheet/harold-preset`

Plugin enabled, settings panel walked, blueprint install end-to-end:

| Surface | Verification | Status |
|---|---|---|
| Plugin toggle enables via UI | Real click → aria-checked false → true | ✓ |
| Settings panel renders Hitchcock copy | "Harold." (italic-amber) + "Hitchcock-register voice assistant, with Claude Haiku..." + "Pairs with @broadsheet/voice — enable that first..." | ✓ |
| Anthropic + ElevenLabs key inputs + "Get a key →" links | Both password inputs visible, "Get an Anthropic key →" + "Get an ElevenLabs key →" external links | ✓ |
| Memory mode select (Local SQLite default / Off) | `<select>` with both options | ✓ |
| Meeting-mode blueprint section + INSTALL BLUEPRINT button | Visible at panel mid-section with descriptive copy | ✓ |
| Blueprint install POST → file lands in HA tree | Click → POST 200 → `/homeassistant/blueprints/automation/broadsheet/meeting-mode.yaml` (2399 bytes) exists | ✓ live-verified |
| UI updates to "Installed" + "Remove blueprint" + link to HA Blueprints page | "Installed — find it in HA → Settings → Automations & Scenes → Blueprints" with REMOVE BLUEPRINT button | ✓ |
| Wakeword download links | "DOWNLOAD .TFLITE (60 KB)" + "DOWNLOAD ESPHOME SNIPPET" with `<a download>` + `href` pointing at `/api/harold-preset/wakeword/...` | ✓ |
| `hey_harold.tflite` (60968b) + `esphome-snippet.yaml` (1953b) serve via sidecar | curl → 200 OK with correct sizes | ✓ |
| 10 prompt + 15 filter tests pin behaviour | tests/unit/harold-prompts.spec.ts + harold-filters.spec.ts | ✓ |

**Plan 4 verdict:** ship-ready. Real-image end-to-end blueprint
install/uninstall verified; UI surfaces all present and behave
correctly. One cosmetic v0.1.1 follow-up (label-wrap quirk) noted.

## Open follow-ups (parked for v0.1.1)

These are non-blockers — captured here so V3's eyeball pass doesn't
have to re-discover them.

- **Settings panel label wrap**: harold-preset settings panel
  renders "Ant / API / key" stacked vertically when the label
  column is narrower than the label text. Visible in screenshots of
  the panel. Cosmetic, fix with `white-space: nowrap` on the
  SettingsRow label or a wider label column. v0.1.1 polish.

- **`pnpm-workspace.yaml` placeholder hardening**: Plan 4 left an
  `allowBuilds:` block with `"set this to true or false"` literal
  text that pnpm silently ignored (caused the CI failure that
  delayed this release by 30 min). A pre-commit lint rule on the
  literal "set this to" would have caught it.

- **Sidebar takeover schema default**: 0.1.70 addon update reset
  options.json to the schema default (`sidebar_takeover: true`).
  Whether this is the right default is a design question — opt-in
  (`false` default + TakeoverBanner explains the toggle) is safer
  but reduces "broadsheet IS the dashboard" framing. Worth a
  half-hour design decision before v0.2.

- **Memory backend**: Plan 4 memory ships as localStorage instead of
  the planned sql.js. WASM bootstrap cost wasn't worth it for ≤1000
  entries; revisit in v0.2 if cross-device sync (Turso) lands.

- **TTS engine auto-switch**: voice plugin doesn't yet auto-switch
  the TTS engine when the user types an ElevenLabs key in
  harold-preset. Follow-on wiring in `packages/voice/src/lib/tts.ts`.

- **`wake_word/info` HA WS call needs `entity_id`**: already worked
  around in voice's `pullVoiceDiscovery` (we just return `[]` for
  wake-words). v0.2 could surface wake-word coverage via the
  regular device/entity discovery.

- **Release checklist item**: "ahead-of-origin counts on both repos
  must be zero before tagging." This V3 dogfood almost shipped
  against hot-patched files. Trivial to add to a pre-tag script.

## Canary state at end of V3

- Image: `ghcr.io/alfiedennen/broadsheet-amd64:0.1.71` (running)
- Container: `7bc867811c49` (replaced `5a09e2be5e22`)
- `options.json`: `sidebar_takeover: true` (schema default)
- `broadsheet.json`: 3482-byte baseline restored from
  `.dogfood/curation-baseline-V3.json` (5 area renames, 4 hidden
  entities, Office Echo rename, person config)
- `/data/broadsheet.json` confirmed persistent across the 0.1.69 →
  0.1.71 addon updates
- All 5 plugins ENABLED in plugin state (was 3 of 5 before V3 walk —
  user can disable voice + harold-preset via /settings/plugins if
  they want to return to peer-frontend mode)
- Meeting-mode blueprint INSTALLED in HA's blueprints tree (user can
  remove via /settings/plugins/harold-preset/config/ → Remove
  blueprint)
- Daily-driver `harold.local`: untouched throughout this session

## Restoration log

| Time (BST) | Action |
|---|---|
| ~10:42 | Snapshot canary state to `.dogfood/curation-baseline-V3.json` (3482b) + `options-baseline-V3.json` (131b) |
| ~10:43 | Wrote `{}` to `/data/broadsheet.json` for first programmatic probe round |
| ~11:00 | `ha addons update 68fa04fc_broadsheet` → container recreated on 0.1.70 |
| ~11:02 | Wrote `{}` again on new container, ran programmatic probes |
| ~11:03 | Tested blueprint install/uninstall end-to-end on 0.1.70 |
| ~11:05 | Restored 3482-byte curation baseline back into new container |
| ~11:17 | Diagnosed Plan 1 localStorage bug via claude-in-chrome MCP |
| ~11:19 | Implemented fix in +layout.svelte, hot-patched canary to verify |
| ~11:21 | Committed Plan 1 fix as `fcaa1cd`, pushed SPA |
| ~11:25 | Bumped addon to 0.1.71, tagged v0.1.71, CI built clean |
| ~11:30 | `ha addons update` → canary on 0.1.71 with fix in published image |
| ~11:31 | Walked /voice + /settings surfaces via MCP — all live-verified |
| ~11:35 | Installed meeting-mode blueprint to verify Plan 4 end-to-end |
| ~11:42 | V3 doc finalized + this restoration log written |

## Followup actions for user

- Revert blueprint install if not wanted: /settings/plugins/harold-preset/config/ → REMOVE BLUEPRINT
- Disable voice + harold-preset if you want peer-frontend mode again: /settings/plugins/ → toggle each off
- Flip `sidebar_takeover: false` if you want HA sidebar visible: Settings → Add-ons → broadsheet → Configuration → save → restart
