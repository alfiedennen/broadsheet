# End-to-end dogfood test framework

The structured protocol for the v0.1.0 fresh-install dogfood. You
(the user) execute it solo. I'm not in the loop during the test —
the framework is what makes the findings comparable to the rubric
and reproducible by anyone else.

This complements the `RUBRIC.md` (which says what should pass) and
the `SHIP-READINESS-BASELINE.md` (which says where we stand on
paper). The dogfood is the ground-truth check: do real users
hitting broadsheet for the first time experience what the
synthesis artefact claims?

## What this is + isn't

**Is**:
- A pre-test setup checklist
- A 7-phase walkthrough with explicit success/fail criteria per phase
- An observation schema (what to capture, how to format it)
- A post-test debrief structure
- A template for the `DOGFOOD-RESULTS.md` artefact you produce
- Reproducible — anyone else with an HA install can follow it

**Isn't**:
- A test you watch passively (you act, observe, write)
- A pass/fail product validation (it produces signal, not a gate)
- An a11y / cross-browser audit (separate testing modes)
- A performance benchmark (separate testing mode)
- A multi-user / multi-install test (single install, single user — n=1)

## Total time budget

Estimate: **3-4 hours** end-to-end if everything works, **5-6 hours**
if you hit things that need debugging. Phase boundaries are natural
break points.

| Phase | What | Time box |
|---|---|---|
| **0** Pre-test setup | Public repos, tag, backup, uninstall | ~30 min |
| **1** Fresh install | Add repo, install, first boot | ~15 min |
| **2** Discovery walk | Visit every core page, observe | ~20 min |
| **3** Settings deepening | Walk every settings sub-page | ~30 min |
| **4** Plugin activation (3 plugins) | Enable + configure each | ~45 min |
| **5** Lovelace import | Import a real dashboard | ~30 min |
| **6** Custom page authoring (Elena page) | Build from preset | ~30 min |
| **7** Wall tablet / cast (optional) | Render on a non-phone surface | ~20 min |
| **8** Debrief + synthesis | Write up findings | ~45 min |

## Phase 0 — Pre-test setup

**Goal**: get into the genuine first-time-user posture.

### 0.1 — Make the repos public

- [ ] `broadsheet/` SPA repo: GitHub → Settings → Visibility → Public
- [ ] `broadsheet-addon/` repo: GitHub → Settings → Visibility → Public
- [ ] Verify both are accessible from a logged-out browser
- [ ] Push the latest tag `v0.1.0` so the addon's `version:` matches a release

### 0.2 — Tag v0.1.0

```bash
cd broadsheet-addon
git tag v0.1.0
git push origin v0.1.0
```

GitHub Release notes: pull from `BUILD-LOG.md`'s v0.2 section +
`SHIP-READINESS-BASELINE.md`'s recommended-position copy.

### 0.3 — Back up your existing curation

The dogfood includes uninstalling the canary's broadsheet, which
nukes `/data/broadsheet.json` + `/data/plugin-data/`. Back them up
first.

```bash
ssh root@homeassistant.local "tar czf /tmp/broadsheet-curation-backup.tar.gz /addon_configs/68fa04fc_broadsheet/" 
scp -O root@homeassistant.local:/tmp/broadsheet-curation-backup.tar.gz \
    "D:/Visual Studio Code Projects/Harold Road/broadsheet-curation-backup-$(date +%Y%m%d).tar.gz"
```

### 0.4 — Document the baseline HA snapshot

For comparison + reproducibility — write down (or screenshot):
- HA Core version
- Number of areas, entities, persons, devices, integrations
- Which HACS cards you have installed (so you know what your
  Lovelace dashboards reference)
- Which Lovelace dashboards you'll attempt to import

### 0.5 — Uninstall the canary broadsheet

HA → Settings → Add-ons → broadsheet → Uninstall. Confirm
"Remove all data" prompt — you'll restore from backup if you want
later.

### 0.6 — Open `DOGFOOD-RESULTS.md` template

Use the template at the bottom of this doc as your scratch pad for
the test. Fill in as you go.

## Phase 1 — Fresh install

**Goal**: install broadsheet from the public repo as a naive
first-time user would. Time-boxed at 15 minutes.

### Steps

1. HA → Settings → Add-ons → Add-on Store → 3-dot menu (top-right)
   → Repositories
2. Add: `https://github.com/alfiedennen/broadsheet-addon`
3. Close repo dialog → in the store, find broadsheet
4. Click → INSTALL → wait for download (~2 min for first amd64 pull)
5. Click START → wait for "Started" status
6. Click "Open Web UI"

### Observations to capture

- **Time from "click INSTALL" to "Open Web UI works"** — total seconds
- **Any error in the addon install logs** — copy verbatim
- **First-impression of the moment view** — what's the first thing you notice?
- **Are entity_ids exposed anywhere on the moment view?** — yes/no
- **Any visible JS errors** — open console, note any red

### Success criteria

- [ ] Install completes without errors
- [ ] Addon starts, no crash loop in logs
- [ ] Open Web UI loads broadsheet in <5 seconds
- [ ] Moment view shows your actual data (your name, your weather, your house's lights)
- [ ] No JS errors in browser console

### Failure modes to record

- Repo URL doesn't add → architecture mismatch / repo private?
- Install hangs > 5 min → GHCR pull failed
- "Start" fails → check addon logs for sidecar / nginx errors
- Open Web UI shows blank page → ingress token issue (recovery: HA restart)
- 401 Unauthorized → check supervisor token injection in run.sh

## Phase 2 — Discovery walk

**Goal**: visit every core page, see what's discovered + what's
missing. Time-boxed 20 minutes.

### Steps

Open the kebab nav (⋮ top-right). Walk each page in order:

1. The moment (`/`)
2. Lights (`/lights`)
3. Heat (`/heat`)
4. Door (`/door`)
5. TV (`/tv`)
6. Body (`/body`)
7. Wall (`/wall`)
8. Any plugin pages (Long Take, etc. — only if plugin auto-active)
9. Settings (`/settings`)

### Observations per page

For each page, capture:
- **What renders** — describe in one sentence
- **What's missing that should be there** — list specific entities
- **What's wrongly placed** — entities on the wrong page
- **What's labelled confusingly** — friendly names that don't read well
- **Any "wait, where's X?" moments** — entities you expect, can't find

### Success criteria

- [ ] All 7 core pages render without errors
- [ ] Your important entities appear on the page that matches their domain
- [ ] No entity_ids visible (only friendly names + area names)
- [ ] /wall preset is usable on a tablet-sized viewport (resize browser to ~800px to test)

### Quality gate

Score each page 1-5 on "would I show this to my partner without
explaining anything?":
- 5 = obvious + readable, partner would use it
- 3 = readable but they'd need a 1-sentence explanation
- 1 = confusing or misses obvious things

If average <3.5 → there's a category of polish work needed before launch.

## Phase 3 — Settings deepening

**Goal**: walk every settings sub-page; assess findability +
clarity. Time-boxed 30 minutes.

### Steps

1. /settings (landing) — read every alert, every section card
2. /settings/house — explore the area + entity tree, try the Moment sensor pickers
3. /settings/people — see existing people; click "Other entity…" expansion on one person
4. /settings/voice — note what's there
5. /settings/plugins — see the 3 bundled plugins + their statuses
6. /settings/pages — should be empty (no custom pages yet); see the + New page form

### Observations

- Which alerts (on /settings landing) are useful vs noise?
- Which settings are findable vs buried?
- Any settings you went looking for + couldn't find?
- Any settings whose copy is unclear?
- The "Other entity…" expansion on /settings/people — is it discoverable? useful?

### Success criteria

- [ ] Every settings page renders + lets you edit
- [ ] Edits persist (refresh + verify)
- [ ] Save indicators / toasts work (no silent saves)
- [ ] No JS errors

## Phase 4 — Plugin activation

**Goal**: enable all 3 bundled plugins + configure each against
your actual HA data. Time-boxed 45 minutes (15 per plugin).

### 4a — Emanations

1. /settings/plugins → toggle Emanations ON
2. /settings/plugins/emanations/config → upload your existing paintings
3. Map paintings to areas + per-person variants
4. Verify presence-cards on `/` use them
5. Verify `/emanations` (route still live in nav-hidden mode) renders

### 4b — Ghost Cloud

1. /settings/plugins → toggle Ghost Cloud ON
2. Configure radar data feed paths
3. Verify a Ghost Cloud time-tube view renders for at least one room
4. Note any setup pain (file paths, JSON format, etc.)

### 4c — TMDB TV

1. /settings/plugins → toggle TMDB TV ON
2. /settings/plugins/tmdb-tv/config → enter your TMDB API key
3. Pick region + lenses
4. Verify `/tv` shows TMDB content rows

### Observations per plugin

- **Time from "toggle ON" to "useful content showing"**
- **Configuration friction** — where you got stuck
- **Documentation gap** — what you wished was documented
- **Graceful degradation** — does the plugin fail noisily or silently when misconfigured?

### Success criteria

- [ ] All 3 plugins enable without errors
- [ ] Each plugin shows live state-driven content within its scope
- [ ] No plugin breaks core pages (verify /settings/plugins → everything still loaded)

## Phase 5 — Lovelace import

**Goal**: import one real Lovelace dashboard you actually use,
measure the coverage. Time-boxed 30 minutes.

### Steps

1. /settings/pages → ⇣ Import from Lovelace
2. Pick a real dashboard you have (start with one that's NOT critical)
3. Note the views' coverage summary lines
4. Click into a view → see the per-card coverage report
5. Edit destination label + slug as desired
6. Click "Import as custom page"
7. Land in editor, then visit the live page

### Observations

- **Per-view coverage** — record the clean / partial / skipped numbers per view
- **Total dashboard coverage** — record the dashboard total
- **Skipped card types** — list any that you wished broadsheet translated
- **Preview vs reality** — does the live page match the preview?
- **Live data** — are entity values populated correctly?

### Success criteria

- [ ] At least 60% of cards in a real dashboard render meaningfully (i.e. clean + partial)
- [ ] No translator crashes (verify dev console)
- [ ] The imported page renders identically to the preview
- [ ] The page appears in the kebab nav after import
- [ ] You can hand-edit the result via the structured editor

### Quality gate

If coverage is <60% on a Mushroom-and-HACS-heavy dashboard like
yours → there's a translator gap to address before public launch.

## Phase 6 — Custom page authoring (Elena page)

**Goal**: build a per-person custom page using the preset, then
hand-customise. Time-boxed 30 minutes.

### Steps

1. /settings/pages → + New page
2. Pick the **Person page** preset
3. Pick Elena from the "For which person" dropdown
4. Customise label (e.g. "Elena's day"), customise slug
5. Click "Create + edit"
6. In the editor:
   - Drag-reorder one block to test drag handle
   - Edit the markdown block to add a personal touch (her schedule, a calendar entity, anything)
   - Add a sparkline of a sensor relevant to her (if you have one)
   - Add an action-grid with one action that toggles a light in her area
   - Use the structured action editor (NOT raw JSON) — verify it's pleasant
7. Watch the save indicator: editing → saving → ✓ saved
8. Click "View live" — see the page on its actual route
9. (Optional) Try the Rename slug or Duplicate page button

### Observations

- **Time from "+ New page" to "live + useful page"**
- **Preset starting-point quality** — was it close to what you wanted? Or did you replace half of it?
- **Structured editor friction** — anywhere the form felt clunky vs natural
- **Drag-reorder** — works on desktop? does it work on touch (if you can test)?
- **Save indicator** — visible enough? confusing?
- **Things you wished broadsheet had** — a primitive that doesn't exist, an editor field that's missing, a preset shape that was missing

### Success criteria

- [ ] Page is live at `/elena/` (or your chosen slug) within 5 minutes of starting
- [ ] Page contains real data (her presence, her room's lights, etc.)
- [ ] You used at least 3 different block types in the page
- [ ] You modified at least one block via the structured editor
- [ ] No JS errors, no save failures

### Quality gate

If you finished this in <15 minutes + felt good about the result →
authoring works for the Family Wrangler persona. If it took >25
minutes or you bounced off the editor → there's UX work needed.

## Phase 7 — Wall tablet / cast (optional)

**Goal**: see broadsheet on a non-phone surface. Time-boxed 20
minutes (skip if no tablet/cast available).

### Option A — Wall tablet via Fully Kiosk

If you have a wall tablet running Fully Kiosk Browser:
1. Update the tablet's start URL to point at broadsheet's `/wall`
   route (or your custom Elena page)
2. Reload Fully Kiosk
3. Verify the page renders + is touch-responsive
4. Watch for the connection indicator if WiFi blips

### Option B — Cast to Nest Hub

Follow `CAST-WORKFLOW.md` end-to-end.

### Observations

- **Visual coherence on the larger surface** — does the editorial
  register hold up at tablet size?
- **Touch responsiveness** — do action tiles register taps?
- **Any layout breaks** — does anything overflow / clip / fail?
- **Connection indicator** — does it appear when network drops?

### Success criteria

- [ ] Broadsheet renders on the surface
- [ ] Action tiles respond to taps (Fully Kiosk; not applicable for Cast)
- [ ] No layout overflow at tablet portrait (1200×1920) or Cast (1280×720)

## Phase 8 — Debrief + synthesis

**Goal**: turn the raw observations into actionable findings + a
go/no-go decision for v0.1.0 launch. Time-boxed 45 minutes.

### Synthesis exercise

For each phase 1-7, write a single paragraph (~50 words) covering:
- What worked
- What didn't
- 1-2 concrete improvements to make before/after launch

### Map findings back to RUBRIC.md

For each rubric story you can speak to:
- **Confirmed pass**: still passing, no concerns
- **New partial**: was pass on paper, partial in practice
- **New gap**: was partial / pass on paper, gap in practice
- **Confirmed gap**: as expected, no surprise

Update the rubric scorecard in `SHIP-READINESS-BASELINE.md` with
the new numbers.

### New issues discovered

For each finding that's actionable, file it as:
- `severity:` blocker / serious / nice-to-have
- `area:` install / discovery / settings / plugins / import / authoring / wall / cast / docs
- `description:` 1-2 sentences
- `repro:` how to reproduce
- `where in code:` if you can identify

Open as GitHub issues OR add to a `BACKLOG.md` file at the repo root.

### Go / no-go decision

Based on the dogfood, decide one of:

- **GO — ship v0.1.0 now**: the experience is good enough; the
  remaining gaps are non-blocking + go in v0.1.1
- **GO with disclaimer**: ship v0.1.0 with the README explicitly
  flagging the friction points you hit
- **DEFER + fix N issues**: identify N specific blockers; fix them;
  re-test (a shorter dogfood, just the affected phases)
- **DEFER + bigger rework**: the dogfood revealed something
  fundamental; pause launch + redesign

Document the decision + rationale in the results doc.

---

## Reproducibility for someone else

Anyone else with an HA install + access to broadsheet's public
repos can run this dogfood by:

1. Clone broadsheet-addon into their own HA addon repo list
2. Follow Phases 1-7 (skip Phase 0 since they aren't replacing an
   existing install)
3. Use the same observation schema
4. Compare findings to this run's `DOGFOOD-RESULTS.md`

The intended cadence is **at least once per substantial release**
(v0.2, v0.3, etc.) and ideally on **at least 2 different installs**
(to wash out single-install bias).

---

## DOGFOOD-RESULTS.md — fillable template

Copy the below into a new `DOGFOOD-RESULTS.md` at the repo root
when you start the test. Fill as you go.

```markdown
# Dogfood results — v0.1.0 fresh-install run

Date: <YYYY-MM-DD>
Tester: Alfie
HA version: <fill>
HA install profile: <areas / entities / persons / integrations counts>
Lovelace dashboards attempted: <list>

## Phase 1 — Fresh install

Time taken: <minutes>
Result: PASS / PASS WITH FRICTION / FAIL

What worked:
- 

What didn't:
- 

Improvements identified:
- 

## Phase 2 — Discovery walk

Time taken: <minutes>
Result: PASS / PASS WITH FRICTION / FAIL

Page-by-page:
- /          score X/5  — <one-line note>
- /lights    score X/5  — <one-line note>
- /heat      score X/5  — <one-line note>
- /door      score X/5  — <one-line note>
- /tv        score X/5  — <one-line note>
- /body      score X/5  — <one-line note>
- /wall      score X/5  — <one-line note>

Average: X/5

Improvements identified:
- 

## Phase 3 — Settings deepening

Time taken: <minutes>
Result: PASS / PASS WITH FRICTION / FAIL

Findings:
- 

Improvements identified:
- 

## Phase 4 — Plugin activation

### 4a Emanations
Time: <min>  Result: <pass/fail>
Findings: <one paragraph>

### 4b Ghost Cloud
Time: <min>  Result: <pass/fail>
Findings: <one paragraph>

### 4c TMDB TV
Time: <min>  Result: <pass/fail>
Findings: <one paragraph>

## Phase 5 — Lovelace import

Time taken: <minutes>
Dashboard imported: <name>
Coverage measured: <X/Y cards rendered = Z%>

Per-view coverage:
- View A: clean/partial/skipped
- View B: clean/partial/skipped

Skipped card types I wish were translated:
- 

Findings:
- 

## Phase 6 — Custom page authoring (Elena page)

Time taken: <minutes>
Result: PASS / PASS WITH FRICTION / FAIL
Final page slug: /<slug>/
Number of blocks: <N>
Block types used: <list>

Findings:
- 

## Phase 7 — Wall / Cast (if attempted)

Surface: <wall tablet / Cast / N/A>
Result: <pass/fail>
Findings:
- 

## Synthesis

What worked overall:
- 

What didn't overall:
- 

New issues discovered (will file as tickets):
1. <severity> | <area> | <description>
2. ...

Rubric updates:
- <Story ID>: <was X, now Y because Z>

## Go / no-go decision

Decision: GO / GO with disclaimer / DEFER + fix N / DEFER + rework

Rationale (2-3 sentences):
- 

If GO: ship v0.1.0 + soft-launch as recommended in
SHIP-READINESS-BASELINE.md.

If DEFER: list the N issues to fix before re-test:
- 

```

## Notes on running this solo

- **Don't skim** — the framework's value is in the observation
  schema. Skipping the per-phase observations means you finish
  with just a "yeah it worked" feeling, which doesn't update the
  rubric.
- **Take screenshots** — drop them into a folder named
  `dogfood-screenshots/` alongside the results doc. They're
  invaluable when reviewing the findings.
- **Time yourself** — even rough timestamps illuminate which
  phases are quick vs grinding.
- **Capture friction events** — anything that took >30s of
  confusion is a signal. Note it even if you eventually figured
  it out.
- **Resist the urge to fix things mid-test** — note the issue,
  carry on. Fixes happen after Phase 8.

## What I'll do with the results

After you complete + share `DOGFOOD-RESULTS.md`:

1. Update the rubric scorecard
2. Update the synthesis artefact's gap inventory
3. Triage the new issues into v0.1.0 (must-fix-before-launch) vs
   v0.1.x (post-launch backlog)
4. If GO: ship v0.1.0 + write the soft-launch announcement copy
5. If DEFER: scope the fix work, re-test the affected phases

The framework is yours; the synthesis after is mine.
