# broadsheet — Settings UI sketch

The visual layer over `broadsheet.json`. Editing-by-file always works
as a fallback; this UI is for everyone who wouldn't.

The hard test: can a non-technical person who just installed broadsheet
make their `/lights` page look right in under 5 minutes? If yes, this
ships. If no, the file fallback becomes the de facto interface and we
lose 80% of the audience.

---

## Surface

`Settings` lives in the kebab-nav drawer (alongside "Open Home Assistant"
and "Forget token"). Tapping it pushes a route — `/settings/...` — so
back-button works and deep-links work. NOT a modal. Settings is a real
page.

### Top-level routes

```
/settings              ← landing — section cards + "what's wrong now" alerts
/settings/house        ← areas + entities curation
/settings/people       ← person → presence sensor mapping
/settings/voice        ← editorial string overrides
/settings/paintings    ← per-area image upload + procedural fallback
/settings/integrations ← TMDB key, Health Connect bridge config, etc.
/settings/plugins      ← enable/disable installed plugins
/settings/about        ← version, link to docs, "report an issue", export config
```

Each is its own page that wears the standard PageShell — full editorial
register inside Settings too. Not a control-panel-shaped escape hatch
that ruins the rest of the design.

---

## `/settings` landing

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings                              │
│                                                      │
│  Make broadsheet your shape.                         │
│                                                      │
│  ⚠ What needs your attention                         │
│    ┌─────────────────────────────────────────────┐   │
│    │ 3 entities couldn't be auto-grouped         │   │
│    │ — they're in your "Unsorted" sections.      │   │
│    │ → Fix in House                              │   │
│    └─────────────────────────────────────────────┘   │
│    ┌─────────────────────────────────────────────┐   │
│    │ Elena's presence sensor isn't picked yet    │   │
│    │ — defaulting to person.elena (may be wrong) │   │
│    │ → Fix in People                             │   │
│    └─────────────────────────────────────────────┘   │
│                                                      │
│  ─────────────────────────────────                   │
│                                                      │
│  ◯ House          ◯ People        ◯ Voice            │
│  ◯ Paintings      ◯ Integrations  ◯ Plugins          │
│                                                      │
│  ◯ About + export + reset                            │
└──────────────────────────────────────────────────────┘
```

Two zones: **alerts** (proactive — broadsheet noticed something; the
landing tells you before you have to dig) and **section cards**
(declarative entry points to each area).

The alerts are the behaviour-shaping piece. They're how broadsheet
*pulls* the user into curation. Without them, Settings is a thing nobody
opens. With them, it's a thing that asks for attention politely.

Alert classes (the pre-defined set; broadsheet is responsible for
generating them, not the user):

| Trigger | Alert |
|---|---|
| ≥1 entity in any Unsorted bucket | "N entities couldn't be auto-grouped" |
| Person has no chosen presence sensor | "X's presence sensor isn't picked yet" |
| Person.X mismatch with chosen sensor (e.g. iOS GPS stuck, BLE says away) | "X's presence is contradictory — check sensor choice" |
| Plugin installed but disabled | "@broadsheet/emanations is installed but not enabled" |
| TMDB key missing on `/tv` | "Add TMDB key to surface streamer content" |
| HA version is old (< broadsheet's tested-against floor) | "Tested against HA ≥ 2026.4 — yours is 2025.11. May misbehave." |
| Connection has been flapping (5+ reconnects in 10 min) | "Connection unstable. Diagnose." → opens a tiny network diagnostic |

---

## `/settings/house`

The hardest screen. Where every entity in the user's HA shows up and
they shape it.

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · house                      │
│                                                      │
│  Areas (12)                              [Sort by ▾] │
│  ┌─────────────────────────────────────────────┐     │
│  │ ⌜ Office              13 entities    ✓ on  │ ▸   │
│  │   light × 2  switch × 3  climate × 1        │     │
│  │   sensor × 7                                │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ ⌜ Living Room         9 entities     ✓ on  │ ▸   │
│  │   light × 2  switch × 1  climate × 1        │     │
│  │   media_player × 1  remote × 1  sensor × 3  │     │
│  └─────────────────────────────────────────────┘     │
│  ...                                                 │
│  ┌─────────────────────────────────────────────┐     │
│  │ ⌜ Cellar              0 entities     ─ off │ ▸   │
│  │   (empty area in your HA — hidden by default│     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  Unsorted (3)                                        │
│  ┌─────────────────────────────────────────────┐     │
│  │ ⌜ light.0xa4c138...   "Spot 1"     [Assign]│     │
│  │ ⌜ switch.boiler        "Boiler"    [Assign]│     │
│  │ ⌜ climate.cellar       "Cellar"    [Assign]│     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

### Per-area expanded view

Tap an area row to expand:

```
┌─────────────────────────────────────────────┐
│ Office                                      │
│ Display name: [Office_____________________] │
│ Icon:         [mdi:pencil___________] ▾     │
│ Page order:   [1 ▾]                         │
│ Hidden:       ◯                             │
│                                             │
│ Entities:                                   │
│ ┌────────────────────────────────────────┐  │
│ │ ✓ light.office_table_lamp              │  │
│ │   "Table Lamp"   [pin → /lights ▾]    │  │
│ │ ✓ light.office_pendant                 │  │
│ │   "Pendant"      [pin → /lights ▾]    │  │
│ │ ✓ switch.office_plug                   │  │
│ │   "Office Plug"  [pin → none ▾]       │  │
│ │   ⚠ Hidden — protected from accidental │  │
│ │     toggle. Reason: [desk compute_____]│  │
│ │ ✗ sensor.office_temperature  (hidden)  │  │
│ │ ...                                    │  │
│ └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Behaviours on this screen

- **Sort by**: Name (default) / Page (groups by which page they appear
  on) / Entity count (busiest first) / Recently changed (debug aid)
- **Drag-to-reorder** within the Areas list — pageOrder updates per
  drop
- **Tap-to-toggle hidden** — strikethrough rendering when hidden
- **The Assign affordance on Unsorted entities** opens a popup with all
  Areas + a "Create new room" option that creates a real HA area
  in-place (see *Creating rooms* below) and assigns the entity to it —
  no leaving broadsheet
- **No save button** — every change writes through to `broadsheet.json`
  immediately. Visible toast: "Saved" in the bottom-right, dismisses in 1s

### Creating rooms

A **"+ New room"** affordance on the Areas list header. Creating a room
makes a **real HA area** via the `config/area_registry/create` WS
command — name + optional floor; icon and aliases are HA's area
editor's job, reached as a doorway. It is *not* a broadsheet-local
construct:

- A created room is a real HA area. It flows back through Layer 1
  discovery (broadsheet already subscribes to `area_registry_updated`),
  so it appears everywhere — every broadsheet page, and HA itself —
  with no extra plumbing.
- Distinct from the v0.2 custom-pages builder: **a room is a spatial HA
  area; a custom page is an authored view that pins things.**
- Safety model: like broadsheet's other registry mutations
  (`updateEntityArea` / `updateDeviceArea` in `lib/ha/registry.ts`),
  the create is audit-logged under a dedicated `registry-write` kind
  and `not-connected`-checked, but *not* readonly-gated — an empty
  area actuates nothing, and gating create while the move operations
  stay ungated would be backwards. `registry.ts` is the single home
  for this convention.

Rationale (real area, not local construct) in `REPLACEMENT-VISION.md`
and `BUILD-LOG.md` 2026-05-14 (evening).

### Hard cases

**Entity has no friendly name** (just hex like `light.0xa4c138b33a932eb2`):
- Show entity_id in code-mono as the headline
- Suggest a default rename based on area + domain + index ("Hallway Spot 2")
- The user can accept the suggestion or override

**Entity exists in registry but is disabled in HA**:
- Show greyed out with "(disabled in HA)" label
- "Enable in HA" button deep-links to HA's entity registry page

**Same entity has TWO valid pages it could go on** (e.g. `switch.living_room_floor_lamp`
is technically a switch but represents a lamp — should it be on `/lights`?):
- Show in both pages by default
- The pin affordance lets the user force it to one page only

---

## `/settings/people`

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · people                     │
│                                                      │
│  Found 2 people in your HA.                          │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ Alfie Dennen                                │     │
│  │ person.alfie_dennen                         │     │
│  │                                             │     │
│  │ Presence sensor [auto-detected]             │     │
│  │   ◉ sensor.alfie_committed_room    ★ best  │     │
│  │   ◯ device_tracker.phone        (gps)       │     │
│  │   ◯ device_tracker.alfie_phone_ble (ble)    │     │
│  │   ◯ device_tracker.alfie_watch_ble (ble)    │     │
│  │   ◯ person.alfie_dennen     ⚠ aggregates    │     │
│  │     all of the above; can lie if any        │     │
│  │     stuck. Not recommended.                 │     │
│  │                                             │     │
│  │ Device class:  ◉ Android   ◯ iOS   ◯ Auto   │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ Elena                                       │     │
│  │ person.elena                                │     │
│  │                                             │     │
│  │ Presence sensor [auto-detected]             │     │
│  │   ◉ sensor.elena_committed_room    ★ best  │     │
│  │   ⚠ device_tracker.iphone_elena (gps)       │     │
│  │     iOS Companion App suspends; not safe   │     │
│  │   ◯ device_tracker.elena_iphone_ble  (ble)  │     │
│  │   ◯ device_tracker.elena_watch_ble  (ble)   │     │
│  │   ◯ person.elena            ⚠ aggregates   │     │
│  │                                             │     │
│  │ Device class:  ◯ Android   ◉ iOS   ◯ Auto   │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

### The picking heuristic, surfaced

The `★ best` badge is broadsheet's recommendation. Algorithm:
1. Prefer `sensor.<name>_committed_room` if it exists (server-side
   templates are canonical)
2. Else prefer BLE trackers OR'd over GPS trackers (BLE more reliable)
3. Avoid `person.*` aggregations (the iOS-stuck-GPS problem)
4. If iOS device class detected via tracker entity: warn aggressively

The `★ best` is just a recommendation — the user picks. We surface our
opinion + reasons but don't force it. **The reason for each entity in
the list is the most important UX detail** — without it, the user is
picking blind.

---

## `/settings/voice`

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · voice                      │
│                                                      │
│  Override the editorial strings broadsheet uses.     │
│  Leave blank to use defaults. Variables: {a} {b} {n} │
│                                                      │
│  Manifest                                            │
│  ────────                                            │
│  Empty house          [The house is empty._________] │
│  One home             [{a} home in the {room}.____]  │
│  Both home, same room [Both in the {room}._______]   │
│  Both home, different [Alfie in the {a-room},       │
│                        Elena in the {b-room}.____]   │
│                                                      │
│  Light page                                          │
│  ──────────                                          │
│  Nothing on            [Every light is off._______]  │
│  One area on           [{area} is on. Everything    │
│                        else is dark.____________]    │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

Each editable string is a templated phrase. Variables documented inline.
Defaults visible as placeholder text.

### Hard case: pluralisation + i18n

Day 1: English-only, no pluralisation logic. Strings ship as templates
with hand-tuned defaults for the common cases.

Day 2 (post-v0.1): proper i18n via Svelte's i18n stores. ICU MessageFormat
for plurals + gender. Defer.

---

## `/settings/paintings`

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · paintings                  │
│                                                      │
│  Default: subtle ambient gradients per area.         │
│  Optional: upload your own per-area image.           │
│                                                      │
│  ┌─────────────┬─────────────┬─────────────┐         │
│  │ Office      │ Library     │ Living Room │         │
│  │             │             │             │         │
│  │ [gradient]  │ [your.png]  │ [gradient]  │         │
│  │             │             │             │         │
│  │ [Upload]    │ [Replace]   │ [Upload]    │         │
│  │             │ [Remove]    │             │         │
│  └─────────────┴─────────────┴─────────────┘         │
│  ...                                                 │
│                                                      │
│  ─────────────────────────────────                   │
│                                                      │
│  Multi-person paintings                              │
│  Requires @broadsheet/emanations plugin.             │
│  ◯ Not installed   [Install instructions →]          │
└──────────────────────────────────────────────────────┘
```

Image uploads write to the data volume at
`/data/paintings/<area-id>.png`. Served by nginx as
`/local/broadsheet/paintings/<area-id>.png`.

The procedural fallback: a soft animated CSS gradient seeded by
`hash(area-id)` so each area gets a distinct but consistent palette.
Done; ships as the default.

---

## `/settings/integrations`

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · integrations               │
│                                                      │
│  TMDB (for /tv content rows)                         │
│  ───────────────────────────                         │
│  Get a free token at themoviedb.org/settings/api     │
│  Token (v4 Read Access): [eyJh...___________]   ✓    │
│  Region: [GB ▾]                                      │
│                                                      │
│  Health Connect (Pixel)                              │
│  ──────────────────────                              │
│  ✓ Detected sensor.pixel_*. Permissions are the     │
│  responsibility of HA Companion App + Health        │
│  Connect on the device. [Diagnose pipeline →]       │
│                                                      │
│  Apple Health                                        │
│  ────────────                                        │
│  Not detected. Coming in v0.2.                       │
└──────────────────────────────────────────────────────┘
```

Per-integration: detection state, config inputs, and a diagnose link
when relevant (the link opens the corresponding
`/settings/integrations/<id>/diagnose` page that runs the same recorder
queries we ran today by hand).

---

## `/settings/plugins`

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · plugins                    │
│                                                      │
│  Installed                                           │
│  ─────────                                           │
│  ✓ @broadsheet/emanations  v0.1.0   ✓ enabled        │
│    Multi-person presence painting                    │
│    Adds: /emanations page                            │
│                                                      │
│  ✓ @broadsheet/ghost-cloud v0.1.0   ◯ disabled       │
│    24h radar event playback (mmWave only)            │
│    Adds: /long-take page                             │
│    ⚠ No radar entities detected — won't work yet     │
│                                                      │
│  Available                                           │
│  ─────────                                           │
│  ◯ @broadsheet/tmdb-tv  v0.1.0      [Install]        │
│    Streamer content rows on /tv                      │
│                                                      │
│  ◯ @broadsheet/calendar v0.1.0      [Install]        │
│    Today + tomorrow calendar on /                    │
│                                                      │
│  Browse all → broadsheet.dev/plugins                 │
└──────────────────────────────────────────────────────┘
```

Each plugin: id, version, status (enabled / disabled / not installed),
short description, what pages/components it adds, and any "won't work
without X" warnings detected from the user's HA install.

Install / uninstall fires a fetch to a thin server-side endpoint that
runs `pnpm add @broadsheet/<id>` in the data volume + reloads the SPA.
**For the HA add-on path**: ships with the trio (emanations, ghost-cloud,
tmdb-tv) preinstalled and toggleable; new plugins require an add-on
update or a one-line edit.

---

## `/settings/about`

```
┌──────────────────────────────────────────────────────┐
│  harold-home · settings · about                      │
│                                                      │
│  broadsheet v0.1.0                                   │
│  Connected to Home Assistant 2026.5.3                │
│                                                      │
│  Resources                                           │
│  ─────────                                           │
│  → Documentation                                     │
│  → Report an issue                                   │
│  → Discord                                           │
│  → GitHub                                            │
│                                                      │
│  Configuration                                       │
│  ─────────────                                       │
│  → Export current config (broadsheet.json)           │
│  → Import config from file                           │
│  → Reset all curation to discovery defaults          │
│                                                      │
│  Diagnostics                                         │
│  ────────────                                        │
│  → Run connection diagnostic                         │
│  → View raw discovery state                          │
│  → Generate support bundle                           │
└──────────────────────────────────────────────────────┘
```

The "support bundle" is the killer for getting good bug reports:
generates a zip with the current `broadsheet.json`, the discovery
state (areas + entity registry), connection log for the last hour,
HA version. PII-redacted (entity friendly names anonymised, tokens
stripped). One-click attach to a GitHub issue.

---

## What this commits the architecture to

- **Routing for `/settings/*`** — already SvelteKit, basically free
- **Reactive write-through** to `broadsheet.json` — every UI change
  immediately persists; no save button. Means the curation layer must
  be writable from the SPA, which means either localStorage (PWA) or
  a tiny server-side endpoint (Docker / add-on)
- **A "support bundle" generator** — pulls discovery state + a redacted
  config snapshot. Bounded engineering work but real
- **A "diagnose pipeline" page per integration** — surfaces the
  recorder-query / state-audit work we did manually today as a button
- **The "alerts" generator** — a system that watches the discovery
  + curation state and surfaces things that need attention. Five-ish
  alert classes shipped at v0.1
- **Procedural area gradients** — design + implement the fallback so
  paintings aren't required for the UI to feel complete

---

## What I'm worried about

- **The Hidden vs Pinned distinction**. Hidden = "don't render anywhere
  by default". Pinned = "render here even though I wouldn't otherwise".
  These are orthogonal but easy to confuse in UI copy. Test with one
  non-technical reader before shipping.
- **The Unsorted bucket can become a graveyard**. If users dismiss
  alerts and leave entities Unsorted forever, the UI degrades silently.
  Solution: surface the bucket count in the kebab nav permanently if > 0.
- **Plugin install via UI is an attack surface**. If we let
  `/settings/plugins/install` arbitrarily `pnpm add` from the SPA, we've
  built a remote code execution vector. The first version probably
  shouldn't auto-install — it should give one-line CLI instructions and
  the user runs them. Auto-install can come later behind a
  signed-plugin allowlist.
- **The "no save button" pattern requires reliable writes**. If the
  API call to persist fails, the UI shows changes that aren't saved
  and the user gets confused after refresh. Need optimistic-with-revert
  pattern + clear failure surface.
