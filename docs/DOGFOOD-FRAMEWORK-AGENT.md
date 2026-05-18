# Agent-executed dogfood framework

> **Status note (2026-05-18):** This doc was written during v0.1
> planning. Current shipped state is **0.9.4.6**, M0–M6 complete,
> add-on in **T2 friendly soak**. See [CHANGELOG.md](../CHANGELOG.md)
> and [BUILD-LOG.md](BUILD-LOG.md) for the actual ship history. The
> framing below describes planning-time thinking, not current
> reality — kept as a record of the path taken.

The MCP-driven, programmatically-executed variant of `DOGFOOD-FRAMEWORK.md`.
This is what I (the agent) follow when running the dogfood myself
using Chrome MCP + Bash + sidecar APIs.

The user-executed version (`DOGFOOD-FRAMEWORK.md`) tests
**first-time-user emotional response + wall-tablet surfaces +
human readability judgment**. This version tests **programmatic
correctness + bug discovery + regression detection + machine-
measurable surfaces**. They're complementary, not redundant. Run
both for full coverage.

## What I CAN do that the user can't (cheaply)

- **Capture every JS error / network 4xx-5xx / audit-log warning**
  across the full session deterministically
- **Programmatically inspect the DOM** for invariants (no
  entity_ids in render, friendly names present, no double-encoded
  unicode, etc.)
- **Run the same flow twice** to detect non-determinism
- **Compare to specs** — does the documented behaviour match what
  the page actually emits?
- **Time every action** to a millisecond, build a perf profile
- **Screenshot every page** at deterministic viewport sizes for
  baseline visual regression
- **Surface bugs immediately as I find them** — file as commits
  or as a structured bug list
- **Walk the entire 7 core + settings pages + builder + importer
  in 30-60 minutes** end to end

## What I CAN'T do that the user MUST do separately

- **First-time-user emotional response** — "is this beautiful?",
  "would I trust this?", "did this make sense?"
- **Wall tablet rendering** — I'm in Chrome on the desktop, not
  on a Fire HD 10
- **Cast / Nest Hub experience** — same reason
- **Pi4-class performance** — the canary runs on i5
- **Safari / Firefox compat** — Chrome MCP only
- **Family / partner usability** — n=1, me, technical
- **Subjective judgement** — "this preset is what I'd actually
  want" needs human taste

These remain the user-executed dogfood's territory. My findings
narrow what the user has to evaluate; they don't replace it.

## Hard safety boundaries (will not cross without explicit permission)

I will NOT:

1. **Make the broadsheet or broadsheet-addon repos public** — the
   user's call when v0.1.0 is ready
2. **Tag v0.1.0** — same
3. **Uninstall the canary's broadsheet** — daily-driver
4. **Persist destructive changes to curation** — every change I
   make, I either back up + restore OR document for manual review
5. **Ship a version bump (0.1.x)** — the dogfood is read + measure,
   not write + ship
6. **Run anything that mutates HA state** without explicit OK —
   no service calls against real entities, no scene activations,
   no door unlocks. Only state READS.

I WILL:

- Browse + inspect every page
- Read every config + curation field
- Compose + render custom pages temporarily, then delete them
- Run the importer's translation pipeline against real Lovelace
  configs (this is read-only — translation doesn't write to HA)
- Activate plugins if needed for a phase, then restore prior state
- Capture screenshots, network logs, console messages
- File findings as commits in this repo (additive — new docs, no
  destructive changes)

## Total time budget

Estimate: **30-60 minutes** for the active phases (1-6),
**~30 min** for synthesis (Phase 7), so **~60-90 min total**.
Order of magnitude faster than the user's framework because no
typing-into-forms friction.

## Phase 0 — Programmatic prep

**Goal**: get into a known state without destruction.

### 0.1 — Verify environment

```bash
# Confirm canary HA is reachable
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://homeassistant.local:8123/

# Confirm broadsheet addon is installed + version
HA_TOKEN=$(grep "^HA_TOKEN=" ".env" | cut -d= -f2-)
# WS query: supervisor/api → /addons/68fa04fc_broadsheet/info → record version
```

### 0.2 — Back up curation

```bash
# Curation file lives in addon's /data/broadsheet.json
ssh root@homeassistant.local "cat /addon_configs/68fa04fc_broadsheet/broadsheet.json" > /tmp/canary-curation-baseline.json
```

### 0.3 — Open Chrome MCP tab on canary broadsheet

Use `mcp__Claude_in_Chrome__tabs_context_mcp` + `select_browser` +
`navigate` to land on the canary's broadsheet ingress URL.

### 0.4 — Initialize results doc

Create `DOGFOOD-RESULTS-AGENT.md` at repo root from the template
at the bottom of this doc.

### Failure modes

- HA unreachable → abort, report the cause
- broadsheet not installed → abort, document
- Chrome MCP not connected → abort, request user opens browser
- Curation backup fails → continue but flag, every phase becomes
  read-only (no write tests)

## Phase 1 — Fresh install verification (LIMITED)

**Goal**: verify the install would work for a real first-time
user, without actually doing it (since I can't reset the canary).

### What I CAN measure

- Addon's last-deploy version + state via supervisor/api
- Addon's logs since last boot (via SSH `docker logs`)
- nginx config served (via the SPA's runtime-env.js)
- The SPA bundle's hashes (via fetch of /version.json)
- Connection state on cold-load (Phase 2 head-of-walk test)
- Time from page-navigate to discovery-booted (via console audit
  logs)

### What I CANNOT measure (defer to user)

- The "click + paste repo URL" UX in HA's addon store
- The install-progress feedback during pull
- The first-Open-Web-UI moment

### Output

Note in results: "Phase 1 measured indirectly. Direct fresh-install
test is part of the user-executed dogfood. Indirect signals from
this run: addon at version X, started Y minutes ago, no errors in
logs since boot, SPA bundle at hash Z, cold load to discovery-
booted in T seconds."

## Phase 2 — Discovery walk (programmatic)

**Goal**: visit every core + custom + plugin page, capture
machine-checkable invariants + screenshots.

### Per-page protocol

For each of `/`, `/lights`, `/heat`, `/door`, `/tv`, `/body`,
`/wall`, `/emanations`, `/long-take`:

```js
// Navigate
location.href = `${baseUrl}${pagePath}`;
// Wait for SPA to settle (discovery booted + first paint)
await new Promise(r => setTimeout(r, 4000));

// Capture invariants
const findings = {
  url: location.href,
  title: document.title,
  hasHero: !!document.querySelector('.hero-headline'),
  heroText: document.querySelector('.hero-headline')?.innerText,
  blockCount: document.querySelectorAll('.cards .card, .room-tile, .scene-pill, .boost-tile, .panel, .qr-chip, .md-block, .entity-list, .sparkline-block').length,
  // Critical: NO entity_ids should appear in rendered DOM
  // (only in /settings/* surfaces)
  entityIdLeaks: (document.body.innerText.match(/[a-z_]+\.[a-z_0-9]+/g) || []).filter(s => 
    /^(light|switch|sensor|binary_sensor|climate|lock|media_player|person|scene|script|automation|input_)\./.test(s)
  ),
  // Connection state
  connectionVisible: !!document.querySelector('.conn-chip'),
  // JS error count from Chrome MCP
  jsErrors: 'see read_console_messages',
};
```

Plus `screenshot` at the standard viewport (1280×800, the canary's
typical browser size).

### Quality gates

| Gate | Threshold |
|---|---|
| Each page renders without error | 0 JS errors per page |
| No entity_id leaks in render | `entityIdLeaks.length` = 0 per page (excluding /settings/*) |
| Each page has a Hero | `hasHero` = true |
| Each page renders > 0 content blocks | `blockCount` ≥ 1 (excluding /heat/door/etc when truly empty) |

### Output per page

Structured row in results: page URL, title, hero text, block count,
entity-id-leaks, JS errors, screenshot file path.

### Compare to RUBRIC.md

- P3-S3 (no entity_ids leaked): test invariant, pass/fail per page
- P1-S2 (familiar HA surfaces): tally entities discovered per page

## Phase 3 — Settings deepening (programmatic)

**Goal**: walk every settings sub-page, verify renders + edit flows.

### Pages to walk

- `/settings/` — alerts + section cards
- `/settings/house/` — area + entity tree, moment-sensor pickers
- `/settings/people/` — per-person + Other entity expansion + + New
  person form
- `/settings/voice/` — voice overrides
- `/settings/plugins/` — plugin states
- `/settings/plugins/<each>/config/` — each plugin's config panel
- `/settings/pages/` — empty list with + New page + Import buttons
- `/settings/pages/import/` — importer flow (Phase 5)

### Edit-flow tests (non-destructive)

- /settings/house Moment sensors — set to a non-default value, verify
  curation changes via sidecar API, set back to original
- /settings/people — open + close the "Other entity…" expansion,
  verify it shows entries
- /settings/pages — open + cancel the "+ New page" form
- Toast appearance, save indicator behaviour

### Output

Per-page: rendered without error, edit-flow worked, observed any
console errors.

### Compare to RUBRIC.md

- P1-S4 (find why entity isn't showing): can I navigate from a
  presumed-missing-entity to /settings/house in <3 clicks?
- P3-S4 (per-user dashboards): confirmed gap by inspection
- E6-S4 (curation persistence): write a curation field, refresh
  page, confirm it persisted

## Phase 4 — Plugin verification

**Goal**: for each of emanations / ghost-cloud / tmdb-tv, confirm
plugin state + config surface + page render. Non-destructive — read
current config, don't disable enabled plugins.

### Per-plugin protocol

```js
// Navigate to plugin's config page
location.href = `${baseUrl}/settings/plugins/${pluginId}/config/`;
await wait(2000);

// Capture
const findings = {
  pluginId,
  configPageRenders: !!document.querySelector('.hero-headline'),
  configFieldCount: document.querySelectorAll('input, select, textarea, button[type=button]').length,
  jsErrors,
};
```

If the plugin has a published page (e.g. /emanations, /long-take):
- Navigate to it
- Verify renders
- Capture block count + any JS errors

### Output

Per-plugin: enabled/disabled state, config page renders, page
renders, observed errors.

### Compare to RUBRIC.md

- P4-S1 (plugin contract): no plugin-related JS errors anywhere
- P5-S1 (ambient-first wall display): /emanations renders the
  per-person painting cards correctly
- E6-S1 (brittleness firewall): no plugin scrapes HA DOM

## Phase 5 — Lovelace import (read-only test)

**Goal**: walk the importer end-to-end against a real dashboard,
capture coverage, do NOT commit (don't pollute curation).

### Steps

1. Navigate to `/settings/pages/import/`
2. Wait for dashboard list, capture all dashboards listed
3. Pick a known-substantial one (e.g. "harold home" if available,
   or "Harold Road")
4. Click + capture per-view summary lines
5. Click into the most-substantial view
6. Capture per-card coverage report (full table)
7. Capture preview block count
8. Click ← Back (do NOT commit)
9. Try a second dashboard for variation

### Output

Per dashboard:
- Total cards, clean/partial/skipped counts
- List of skipped card types
- List of partial card types with notes
- Coverage % rendered

### Quality gate

- ≥80% rendered on at least one real dashboard (the rubric's P4-S4)

### Compare to RUBRIC.md

- P4-S4 directly verified

## Phase 6 — Custom page authoring (Elena page)

**Goal**: build a real Elena page using the Person preset, end to
end. NON-DESTRUCTIVE — page is created + tested + DELETED at the
end.

### Steps

1. Navigate to `/settings/pages/`
2. Capture initial customPages count
3. Click + New page
4. Verify preset picker shows ≥4 presets (Phase G shipped 4)
5. Pick "Person page" preset
6. Verify the "For which person" dropdown appears + populates
7. Pick Elena (or first person)
8. Customise label to "Elena (dogfood)"
9. Submit — verify redirect to editor
10. Capture editor state: blocks rendered, save indicator visible
11. Test the structured action editor:
    - Add an action-grid block via + Add block
    - Use the structured fields (label, domain, service, target,
      state-binding)
    - Verify save indicator transitions: editing → saving → ✓ saved
12. Test drag-reorder: drag block 2 to position 1, verify order
    updated in curation via sidecar GET
13. Test slug rename: change slug to "elena-test", verify URL
    redirect + page still loads at new slug
14. Test page duplicate: duplicate to "elena-test-copy"
15. Verify both pages live at their slugs
16. Visit both live pages, verify rendering matches editor preview
17. **CLEANUP**: delete both Elena (dogfood) pages via the danger
    zone, verify customPages count returns to initial

### Quality gates

- ≥4 presets shown in picker
- Person preset prompts for person
- Page is live within 5 min of + New page
- All editor surfaces (structured action editor, drag-reorder,
  slug rename, duplicate, save indicator) work without errors
- Cleanup leaves customPages at initial count

### Output

- Time from + New page to "page live" minutes
- Editor surface coverage: which surfaces tested, which passed
- Any JS errors during the flow
- Screenshots of: preset picker, editor, live page

### Compare to RUBRIC.md

- P1-S3 (build first custom page) directly verified
- P3-S2 (preset templates) directly verified
- The Phase A polish items (structured action editor, drag-reorder,
  slug rename, duplicate, save indicator) all functionally tested

## Phase 7 — Wall tablet / Cast (HUMAN-ONLY, document only)

I cannot render to a wall tablet or Cast device from MCP. Document
the canary's existing wall tablet config (if any) for the user's
reference; explicitly mark this phase as "user-executed only".

### Output

Note in results: "Wall / Cast testing is human-only. The canary's
existing wall tablet uses URL X, plugin Y enabled. The user should
verify Phase 7 in their own dogfood."

## Phase 8 — Synthesis + bug triage

**Goal**: aggregate Phase 1-6 observations into a structured
findings doc + bug list.

### Output

`DOGFOOD-RESULTS-AGENT.md` populated with:
- Per-phase findings (raw observations + assessment)
- Bug list with severity (blocker / serious / nice-to-have)
- New rubric updates (was-pass-now-partial, was-partial-now-gap, etc.)
- Recommendation: GO / GO-with-fixes / DEFER

Plus: a `BUGS.md` file at repo root listing every bug with:
- ID (BUG-001, etc.)
- Severity
- Phase + step where discovered
- Description
- Reproduction steps
- Where in code (if I can identify)
- Fix approach (if obvious)

### What I do with bugs I find

- **Blocker** (would prevent v0.1.0 launch) — file in BUGS.md +
  surface in synthesis as "must fix before launch"
- **Serious** (degrades experience but not blocking) — file in
  BUGS.md + suggest for Phase G+ polish
- **Nice-to-have** — note in BUGS.md + park

I do NOT auto-fix bugs during the dogfood — separating discovery
from fix-cycle keeps the test pure. Fixes happen in a separate
focused cycle after the user reviews the findings.

## Reproducibility

This framework is reproducible by anyone with:
- The Chrome MCP extension installed
- A working Bash shell
- SSH to the HA OS
- The HA Long-Lived Token in .env

Future runs (post-v0.1.0) follow the same structure → comparable
findings → trend analysis (is the dogfood getting better or
worse over time?).

---

## DOGFOOD-RESULTS-AGENT.md template

```markdown
# Agent-executed dogfood results — v0.X.Y

Date: <YYYY-MM-DD HH:MM>
Agent: Claude (Sonnet 4.5)
Tools: Chrome MCP + Bash + sidecar API
Canary install: HA <version> at homeassistant.local:8123
Broadsheet version measured: <version>

## Executive summary

<2-3 sentences: did the install work? coverage rate? any blockers?>

## Phase 0 — Prep

- HA reachable: <yes/no, latency>
- broadsheet version: <X.Y.Z>
- Curation backed up: <yes, N bytes>
- Chrome MCP browser connected: <yes>

## Phase 1 — Install (limited)

Indirect signals only:
- Last addon deploy: <when>
- Last container start: <when>
- Sidecar logs since boot: <quote any errors>
- nginx logs since boot: <quote any errors>
- Cold-load discovery boot time: <seconds>
- Direct first-install test: DEFERRED to user dogfood

## Phase 2 — Discovery walk

Per-page table:
| Page | Title | Hero | Blocks | EntityID leaks | JS errors |
|---|---|---|---|---|---|
| /     | ...   | ✓    | N      | 0              | 0         |
| ...

Quality gates:
- Pages without errors: N/9
- Entity-id leaks: 0 across rendered pages
- All pages have Hero: ✓

Findings:
- 

## Phase 3 — Settings deepening

Per-settings-page table:
| Page | Renders | Edit-flow | JS errors |
|---|---|---|---|
| /settings/         | ✓ | n/a | 0 |
| /settings/house/   | ✓ | ✓ | 0 |
| ...

Findings:
- 

## Phase 4 — Plugin verification

| Plugin | Enabled | Config renders | Page renders | JS errors |
|---|---|---|---|---|
| emanations  | ? | ✓ | ✓ | 0 |
| ghost-cloud | ? | ✓ | ✓ | 0 |
| tmdb-tv     | ? | ✓ | ✓ | 0 |

Findings:
- 

## Phase 5 — Lovelace import

Dashboard A: <name>
- Total cards: N
- Clean: X
- Partial: Y
- Skipped: Z
- Coverage rendered: P%
- Skipped card types: <list>

Dashboard B: <name>
- ... (same)

Quality gate: ≥80% rendered on at least one dashboard: <pass/fail>

Findings:
- 

## Phase 6 — Custom page authoring

- Time + New page → live: <minutes>
- Presets shown: N
- Person preset prompted for person: <yes/no>
- Editor surfaces tested:
  - Structured action editor: <pass/fail>
  - Drag-reorder: <pass/fail>
  - Slug rename: <pass/fail>
  - Page duplicate: <pass/fail>
  - Save indicator: <pass/fail>
- Cleanup successful (customPages back to initial): <yes/no>

Findings:
- 

## Phase 7 — Wall / Cast

DEFERRED to user. Notes for the user:
- 

## Bug list (see BUGS.md for full)

| ID | Severity | Area | Description |
|---|---|---|---|
| BUG-001 | ... | ... | ... |

## Rubric updates

| Story | Was | Now | Note |
|---|---|---|---|
| ... | pass | partial | ... |

## Recommendation

GO / GO with fixes / DEFER

Rationale: 

---

End of agent dogfood. User dogfood (DOGFOOD-FRAMEWORK.md) covers
the human-only surfaces.
```

## When to re-run

- After every minor version (v0.2.0, v0.3.0, ...)
- After any substantial primitive / translator addition
- After any major dependency upgrade (Svelte, SvelteKit, HA)
- Before any public-launch announcement

The cadence catches regressions in the machine-measurable surfaces
quickly + cheaply. The user-executed framework catches subjective
regressions on a slower cadence.
