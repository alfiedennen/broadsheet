# broadsheet â€” v0.1 build plan

The committed sequence from "scaffold the repo" to "ship v0.1.0". Each
milestone has hard exit criteria so we know when to stop and move on.

Read alongside:
- `ARCHITECTURE.md` â€” three-layer design
- `DEV-ENVIRONMENTS.md` â€” how we test safely
- `DISCOVERY-CONTRACT.md` â€” Layer 1 spec
- `SETTINGS-SCHEMA.md` â€” broadsheet.json shape
- `RENDERER-CONTRACT.md` â€” plugin API sketch
- `ADDON-MOCK.md` â€” packaging
- `SETTINGS-UI.md` â€” Settings screens
- `PREMORTEM-DIFF.md` â€” research findings
- `PUBLIC-README-DRAFT.md` â€” public pitch (the v0.1 readme)

---

## v0.1 goal in one sentence

A Home Assistant add-on that, on first install, renders a usable
editorial dashboard for whatever HA tells it about â€” areas, entities,
people â€” with a Settings UI for hide/pin/rename curation, no
configuration required to feel complete on first paint.

---

## What's IN v0.1

- **Distribution**: HA add-on only (custom Supervisor repository)
- **Discovery**: areas, devices, entities, floors, labels, people via
  registry pulls + `subscribe_entities` for state
- **Pages**: `/` (landing manifest), `/lights`, `/heat`, `/door`, `/tv`
  (without TMDB content rows â€” those are a v0.1 plugin), `/body`,
  `/wall` (dense action grid for tablets)
- **Curation**: `/settings/*` UI for hide / pin / rename / reorder /
  page-pin / people-presence picking
- **Settings persistence**: `/data/broadsheet.json` via sidecar API
- **Auth**: zero-credential via Supervisor token at the nginx layer
- **WebSocket robustness**: heartbeat, auto-reconnect, audit logging
- **Responsive**: phone, desktop, wall tablet â€” three width axes
- **PWA**: manifest, icons, iOS apple-touch-icon, theme-color
- **Three responsive axes**: width, height, hover-vs-touch
- **broadsheet HA theme**: an HA theme file the add-on drops into
  `/config/themes/` on first boot, restyling HA's own chrome + native
  config pages into the editorial register. The add-on *offers* it;
  the user opts in via their HA profile. This is the v0.1 half of the
  replacement vision â€” see `REPLACEMENT-VISION.md`. (Generalises
  Harold Road's existing `themes/harold-road.yaml` recipe.)

## What's NOT in v0.1

- **Docker / standalone path** (deferred to v0.2 gated on demand signal)
- **OAuth flow** (only needed for the deferred Docker path)
- **`@broadsheet/ghost-cloud` plugin** (radar event playback) — the
  plugin contract + system shipped in v0.1; ghost-cloud's *renderer*
  is a post-v0.1 port.
- **`@broadsheet/tmdb-tv` plugin** (TMDB content rows on `/tv`) — same:
  contract in v0.1, renderer port post-v0.1.
- _(NOTE — superseded: `@broadsheet/emanations` WAS ported in v0.1 as
  the proof plugin during the P0–P4 plugin-system track. The bundling
  model also changed — see the corrected section below + BUILD-LOG
  "P0–P4" + RENDERER-CONTRACT.md.)_
- **Lovelace strategy facade** (the v0.2 channel for using broadsheet
  renderers inside HA's own dashboards)
- **Theme inheritance from HA** â€” i.e. broadsheet *adopting HA's*
  theme tokens. broadsheet's editorial register is the point in v0.1;
  a toggleable HA-theme overlay is deferred. (Note: this is the
  opposite direction from the *broadsheet HA theme* in the IN list
  above, which pushes broadsheet's register onto HA. Both can't be
  confused â€” one is broadsheet wearing HA's clothes, the other is HA
  wearing broadsheet's.)
- **broadsheet as the outer shell** (HA's chrome never seen, HA config
  pages embedded inside broadsheet) â€” the structural half of the
  replacement vision, committed to v0.2. See `REPLACEMENT-VISION.md`.
- **i18n beyond English** (templated strings shipped, but no other
  languages bundled)
- **Apple Health bridge for `/body`** (Health Connect / Pixel only in v0.1)
- **Per-device sync of curation** (single source of truth in `/data/`,
  no input_text mirror)
- **Plugin auto-install via UI** (security risk â€” Settings UI shows
  available plugins with "install via add-on update" instructions, no
  remote `pnpm add`)
- **Multi-instance HA support** (one HA per broadsheet install)

## Plugins — how they actually ship (corrected post-P0–P4)

> The original plan said the trio would be "published to npm, install
> via add-on config option `enable_plugins`". The P0–P4 plugin-system
> build track revised this — `RENDERER-CONTRACT.md` § "Bundling model"
> is the authoritative spec. Summary of the real model:

- The three first-class plugins are **`workspace:*` dependencies of
  `@broadsheet/core`**, statically imported by `registry.ts`, and
  **bundled into the add-on image** — heavy code lazy-chunked so a
  disabled plugin's chunks are present but never fetched.
- A plugin is enabled per **`broadsheet.json → plugins.<id>.enabled`**
  (toggled in `/settings/plugins`), NOT an `enable_plugins` add-on
  option. Default install ships them all **disabled**.
- `@broadsheet/emanations` shipped fully in v0.1 as the proof plugin
  (page + renderer + settings panel + discoveryContributor + static
  assets). `@broadsheet/ghost-cloud` + `@broadsheet/tmdb-tv` are
  contract-ready stubs; their renderers are post-v0.1 ports.
- v0.2 adds runtime install of *third-party* plugins — `registry.ts`
  is the single seam that changes; the first-class trio stays bundled.

---

## Milestones

Eight stages, in dependency order. Each milestone has exit criteria
that must be met before the next starts.

### M0 â€” Documentation freeze + scaffolding

**Duration**: 1 day

**Tasks**:
1. All eight documentation files in `harold-home/docs/` are complete
   and self-consistent (PUBLIC-README-DRAFT, ARCHITECTURE,
   PREMORTEM-DIFF, DEV-ENVIRONMENTS,
   BUILD-PLAN, DISCOVERY-CONTRACT,
   SETTINGS-SCHEMA, RENDERER-CONTRACT,
   ADDON-MOCK, SETTINGS-UI). â† we are here
2. Create `D:\Visual Studio Code Projects\broadsheet\` as a fresh
   repo (NOT a fork of harold-home â€” clean room).
3. Scaffold pnpm workspace: `package.json`, `pnpm-workspace.yaml`,
   `packages/core/`, `packages/emanations/`, `packages/ghost-cloud/`,
   `packages/tmdb-tv/`, `apps/addon/`.
4. Initialise SvelteKit 2 + Svelte 5 in `packages/core/` with
   `adapter-static`.
5. Copy the eight docs from `harold-home/docs/` into
   `broadsheet/docs/` (rename: drop `` prefix, since
   they're now in-repo).
6. `git init`, first commit, push to private GitHub repo
   (`<user>/broadsheet`).

**Exit criteria**:
- `pnpm install && pnpm -r build` succeeds with no errors
- Empty SvelteKit app loads at `localhost:5173`
- All docs in `broadsheet/docs/` reference each other correctly
- VirtualBox VM `test` exists, snapshot taken, hostname set

### M1 â€” Safety rails + WebSocket client

**Duration**: 2 days

**Tasks**:
1. Stand up `src/lib/ha/client.ts` based on
   `home-assistant-js-websocket` library (don't roll our own â€” see
   PREMORTEM-DIFF Read 2). Heartbeat, auto-reconnect, compressed
   delta protocol all delegated to the library.
2. Implement `src/lib/ha/actions.ts` with the readonly + dry-run +
   audit-log wrappers from DEV-ENVIRONMENTS.
3. Hard-ban `lock.*` writes regardless of unlock flag.
4. Wire `BROADSHEET_READONLY=true` as env-var default; `?allow-writes=true`
   URL flag opt-in.
5. Write a setup form (`/setup`) for the dev path: paste HA URL +
   LLAT, persist to localStorage. Add-on path skips this entirely.
6. Visible warning banner in the chrome whenever writes are allowed.

**Exit criteria**:
- Connect to production HA, see entity states reach the SPA
- Try to call `light.turn_on` from dev console â†’ blocked + audit logged
- Add `?allow-writes=true` â†’ call succeeds, light toggles, audit logged
- Try to call `lock.unlock` even with `?allow-writes=true` â†’ blocked
- Force HA restart via Proxmox â†’ broadsheet detects disconnect within
  ~40s (heartbeat) and reconnects within ~10s of HA being back
- Audit log file shows expected `blocked-write` / `call-service` /
  `hard-banned` entries

### M2 â€” Discovery layer (Layer 1 + Layer 2)

**Duration**: 4 days

**Tasks**:
1. Implement `src/lib/discovery/registries.ts` â€” pull area, device,
   entity, floor, label, category registries. Subscribe to all
   `*_registry_updated` events.
2. Implement `src/lib/discovery/domain.ts` â€” Layer 2 projection. The
   `Floor â†’ Area â†’ Entity` hierarchy with the entity-area-fallback
   rule (entity's own `area_id` > device's `area_id`).
3. Implement `src/lib/discovery/heuristics.ts`:
   - Lighting-switch detection (which `switch.*` entities are
     actually lights based on name + area + device class)
   - Presence-sensor picking per person (the `â˜… best` recommendation
     from SETTINGS-UI)
   - TV detection (`media_player.*` with device class `tv`)
   - Health-Connect sensor pattern matching for `/body`
4. Implement `src/lib/discovery/page-map.ts` â€” domain â†’ page routing.
5. Build the `Unsorted` bucket synthesis for entities without
   `area_id`.
6. Verify against production HA: the discovery model produces a
   sensible `Area[]` matching what harold-home renders today.

**Exit criteria**:
- Print discovered Areas to console at boot â€” count matches HA's
  area count
- Each Area's `lights / climates / locks / etc.` arrays populated
  correctly for at least 3 known rooms (Office, Living Room, Hallway)
- Floor â†’ Area mapping correct (Ground / Upstairs / Unassigned)
- Labels surfaced as orthogonal tags
- Adding a new area in HA â†’ broadsheet reflects it within 5s without
  refresh
- Renaming an area in HA â†’ broadsheet's domain model picks up the
  rename within 5s
- All entities accounted for: every entity in registry either appears
  in an Area, in `Unsorted`, or is intentionally skipped (disabled,
  hidden_by integration, entity_category != null)

### M3 â€” Page templates (the six core pages)

**Duration**: 6 days (1 day per page, with shared shell work upfront)

**Tasks**:
1. Build `PageShell.svelte`, `Hero.svelte`, `Eyebrow.svelte`,
   `OutLine.svelte`, `KebabNav.svelte`, `RoomReveal.svelte`,
   `PinnedSection.svelte`, `UnsortedSection.svelte` â€” the layout
   primitives, copied from harold-home but generalised.
2. `/` â€” landing manifest. Procedural ambient gradient per detected
   area (no plugin dependency for v0.1 default). One-line manifest
   string. Default copy "[Person] is home in the [Room]." composable.
3. `/lights` â€” prose state, scene chips, per-area reveal with sliders
   + per-bulb sub-reveal.
4. `/heat` â€” three macros (Boost / All warm / All frost), per-room
   TRV reveal with Â±0.5Â° nudges.
5. `/door` â€” lock state hero (read-only-display in dev) + Unlock
   action (gated). Camera image below if paired camera detected.
6. `/tv` â€” remote on left, app launcher on right. Content browser
   surface (TMDB section is a plugin slot â€” empty in core v0.1).
7. `/body` â€” health-data panels with honest sub-labels, stale banner.
8. `/wall` â€” dense action grid for hallway tablet (3 BIG primary
   tiles + per-room light toggles + scenes + heat boost).
9. Eyebrow + OutLine on each page, surface-aware.

**Exit criteria**:
- Each page renders against production HA with no hardcoded entity
  IDs, only discovery results
- A page is empty when no entities of its domain exist (e.g. `/door`
  when no `lock.*` discovered) â€” shows a graceful empty state, not
  a crash
- Touch targets meet 44pt floor on the wall tablet's render
- Hover effects scoped to pointer-capable devices (mediaqueries)
- All six pages navigable from KebabNav

### M4 â€” Curation (Layer 3) + Settings UI

**Duration**: 7 days

**Tasks**:
1. Define `broadsheet.json` schema v1 (see SETTINGS-SCHEMA.md)
2. Implement `src/lib/discovery/curation.ts` â€” Layer 3 overrides
   applied to Layer 2 output
3. Build `/settings` landing with alerts panel (the 7+3 alert classes
   from SETTINGS-UI + PREMORTEM-DIFF)
4. Build `/settings/house` â€” areas + entities curation (the hardest
   screen)
5. Build `/settings/people` â€” presence sensor picking with `â˜… best`
   recommendation
6. Build `/settings/voice` â€” editorial string overrides
7. Build `/settings/paintings` â€” per-area image upload + procedural
   fallback
8. Build `/settings/integrations` â€” TMDB key, Health Connect detection
9. Build `/settings/plugins` â€” list installed plugins, enable/disable
   (no auto-install in v0.1)
10. Build `/settings/about` â€” version, support bundle generator
11. Reactive write-through: every UI change persists to
    `broadsheet.json` immediately, "Saved" toast, no save button
12. Optimistic-with-revert pattern for write failures

**Exit criteria**:
- Hide an entity in Settings â†’ it disappears from its page within 1s
- Pin an entity to a non-default page â†’ it appears there within 1s
- Rename an area in Settings â†’ header updates everywhere within 1s
- Pick a different presence sensor for a person â†’ landing manifest
  updates within 5s
- Edit a voice string â†’ renders new copy within 1s
- Stop the SPA, restart, reload â†’ all curation persists
- Support bundle generates a downloadable zip with discovery state +
  redacted config + connection log

### M5 â€” HA add-on packaging

**Duration**: 3 days

**Tasks**:
1. Create `addon` repo (separate from `broadsheet`)
2. Implement `repository.yaml`, `broadsheet/config.yaml`, `Dockerfile`,
   `run.sh`, `nginx.conf.tpl`, `sidecar.py` per ADDON-MOCK
3. Apply PREMORTEM-DIFF corrections: `ingress_port: 0`,
   `panel_admin: true`, `ingress_stream: true` confirmed
4. Solve the `paths.base` / `X-Ingress-Path` problem (relative paths
   served at nginx root, ingress prefix transparently prepended)
5. Multi-arch CI workflow (`.github/workflows/builder.yaml`)
   targeting at minimum amd64 + aarch64
6. Sidecar curation API: GET / PUT for `broadsheet.json`,
   bound to localhost
7. Test in Env 2 (VirtualBox HA OS): install, start, ingress URL
   loads, WebSocket auth via Supervisor token works, sidecar API
   reachable, curation persists across container restart

**Exit criteria**:
- Add `addon` repo URL to Env 2's HA â†’ addon appears in
  store
- Install completes in <60s
- Open Web UI â†’ broadsheet loads with live state, no token paste
- Toggle a (non-banned) entity â†’ service call fires, state updates
- Restart the add-on container â†’ curation file survives, SPA
  reconnects
- Bump `version: "0.1.0"` â†’ "0.1.1" â†’ push â†’ HA shows update badge,
  apply update succeeds
- aarch64 image builds in CI (test via QEMU at minimum)

### M6 â€” Production canary (Env 3)

**Duration**: 7 days minimum (real life soak)

**Tasks**:
1. Snapshot production HA OS in Proxmox
2. Add addon (private at this point) to production HA
3. Install and Start
4. Verify side-by-side coexistence with harold-home
5. Use broadsheet personally for â‰¥7 days (open from sidebar, navigate,
   curate, control devices)
6. Watch for: regressions in harold-home, HA CPU/recorder lag,
   service call anomalies, settings persistence issues, reconnect
   handling during HA restarts
7. Migrate the wall tablet's Fully Kiosk start URL on day 8 if clean
8. Continue another 7 days
9. Migrate phone PWA on day 15 if still clean

**Exit criteria**:
- 7 consecutive days with zero crashes / zombie reconnects /
  regressions in harold-home or production HA
- All six core pages used in real life without falling back to
  harold-home
- Settings UI used for at least 3 distinct curations without bugs
- Wall tablet survives 7 days on broadsheet alone
- Phone PWA survives 7 days on broadsheet alone

### M7 â€” Public release prep

**Duration**: 4 days

**Tasks**:
1. Write public README from `PUBLIC-README-DRAFT.md` â€” strip
   Harold-Road specifics, add real screenshots from Env 3
2. Take screenshots: landing, /lights, /heat, /door, /tv, /body,
   /wall, /settings on phone + desktop + wall
3. Add LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md
4. Create release notes for v0.1.0
5. Make `broadsheet` repo public on GitHub
6. Make `addon` repo public on GitHub
7. Tag v0.1.0 on both repos â†’ CI publishes images to GHCR
8. Test the public install flow from a fresh VM (Env 2 reset to
   clean state, point at public repo URL)
9. Soft launch: post to r/homeassistant, community.home-assistant.io
   forum, Discord channels
10. GitHub Discussions enabled for community feedback

**Exit criteria**:
- A stranger could read the README, click the "Add repository"
  badge, install, and have broadsheet running against their HA in
  under 5 minutes
- All public-facing surfaces (README, repo description, release
  notes) consistent on the add-on-only positioning
- v0.1.0 tagged, images on GHCR, custom add-on repository URL
  resolvable

### Total v0.1 effort estimate

Sum of milestones: **34 days of focused work**

Phased over evenings + weekends: realistically **~3 months elapsed**.

This matches the original ARCHITECTURE estimate (~5-6 weeks focused
+ ~3 months elapsed). Add-on-only decision saves the Docker work
that was implicit in the original estimate (~4-5 days), but the
DEV-ENVIRONMENTS safety-rail work + dedicated discovery contract
spec adds ~3 days back. Net wash.

---

## Dependency graph

```
M0 (docs + scaffolding)
  â†“
M1 (safety rails + WS client)
  â†“
M2 (discovery layer)        â†â”€â”€â”
  â†“                            â”‚
M3 (page templates)            â”‚ both block on M2
  â†“                            â”‚
M4 (curation + Settings UI) â†â”€â”€â”˜
  â†“
M5 (add-on packaging)
  â†“
M6 (production canary)
  â†“
M7 (public release)
```

M3 + M4 can overlap once M2 is done. M5 can start as soon as M3 has
*any* page rendering (doesn't need all six). Everything else is
strictly sequential.

---

## Hard scope guards

If during the build we feel pressure to add something that isn't in
the v0.1 IN list above, the answer is **defer to v0.2** unless it's
a security or correctness issue. Specifically:

- **No new pages.** Six core + wall, that's it.
- **No new plugins until the trio works.** Emanations + Ghost Cloud
  + TMDB-TV first. Anything new can be a v0.2 demo.
- **No theming engine.** broadsheet's editorial register is the point.
- **No multi-language.** English only. i18n is a v0.2 concern.
- **No Apple Health bridge.** Pixel-only `/body` in v0.1.
- **No multi-instance HA.** One HA per broadsheet.
- **No auto-install of plugins.** Security risk, deferred.
- **No Lovelace strategy facade.** v0.2 channel.
- **No Docker path.** v0.2 gated on demand.

The discipline is: write v0.2 issues for everything we want but don't
build, then ship v0.1. Every "while we're here" addition delays
launch by more than its own scope because of integration cost.

---

## Risk register

What could derail v0.1, ranked by likelihood Ã— impact:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `paths.base` / ingress URL routing breaks navigation | Medium | High | Solve in M5 with VirtualBox testing; defer M6 if not solved |
| Sidecar curation API has security bugs | Low | High | Bound to localhost, schema-validate input, no shell calls |
| `home-assistant-js-websocket` library missing a feature we need | Low | Medium | Fork or copy the relevant module â€” library is MIT |
| Production canary surfaces a regression bug late in M6 | Medium | Medium | 7+ day soak before each migration step, harold-home stays installed as fallback |
| Discovery layer's heuristics get wrong for a real-world install we test against later | High | Low-Medium | "Unsorted" bucket as honest escape hatch, manual pin-to-page in Settings always available |
| Multi-arch CI build fails for aarch64 | Medium | Medium | Test early in M5 via QEMU, document amd64-only fallback if needed |
| Take longer than 3 months elapsed | High | Low | Doesn't matter â€” there's no external deadline. Ship when ready. |
| HA itself releases a breaking change to area_registry / entity_registry between M2 and M7 | Low | High | Subscribe to HA release notes, test on each new HA release in Env 2 |
| `lock.*` write fires during dev despite hard-ban | Very Low | Very High | Triple-checked in M1; even with bug, only prod HA can be affected, snapshots available |

---

## Anti-patterns to avoid

Things we've seen go wrong in similar projects:

1. **Doc theatre**: writing planning docs forever, never starting
   the build. Mitigation: this plan caps doc-writing at M0; M1
   starts code on day 2.
2. **Premature optimisation**: spending three weeks on perfect
   discovery heuristics instead of getting six pages rendering.
   Mitigation: M2 has bounded exit criteria â€” "sensible Area[]
   matching what harold-home renders today" not "perfect for every
   conceivable HA install."
3. **"Just one more feature" before launch**: M7 is launch. Anything
   not in the IN list as of M7 ships in v0.2.
4. **Big-bang migration**: replacing harold-home before broadsheet
   has soaked. M6's 30-day rule prevents this.
5. **Skipping the canary**: thinking Env 2 testing is enough.
   It isn't â€” the test HA has no real entities, no real life
   patterns, no Elena's iPhone weirdness.
6. **Fork instead of clean room**: copying harold-home wholesale and
   "stripping the personal stuff." That's how Harold Road specifics
   leak into v1.0. Clean-room scaffold + deliberate code copy in
   M3+ is the discipline.

---

## What success looks like

End of M7:
- broadsheet installed on Env 3 production for 30+ days, no
  regressions
- Wall tablet + phone PWA both pointing at broadsheet, harold-home
  archived
- Public repo at `github.com/<user>/broadsheet`, README polished
- Public addon repo at `github.com/<user>/addon`,
  multi-arch images on GHCR
- v0.1.0 tag pushed, release notes published
- â‰¥1 external user (friend, beta tester) successfully installed
  broadsheet against their HA
- Issue tracker open, Discussions enabled, response cadence
  established (commit to â‰¤72h triage)
