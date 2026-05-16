# Plan — Theme H: inline overrides + needs-attention hub

**Status**: Drafted 2026-05-16 after Phase-3 dogfood landed and user observed
"we need to give users an easy way to map where automated mapping doesn't
work". Promoted to next theme after Theme G ship.
**Sequence**: H next, then F (foundations) or B (onboarding flows).
**Reference**: `.dogfood/AUTO-DOGFOOD-0.2.4.md` for the walk that surfaced this
pattern; `.dogfood/V3-PIVOT-TO-V02.md` for the broader v0.2 themes.

## Why this exists

Every walkthrough this session has surfaced the same shape of bug:
broadsheet auto-inferred something, the inference was wrong or
incomplete, but the user had to leave the page to fix it.

| Where the user hits it | Auto-inferred | What they wanted |
|---|---|---|
| Home tile: "Alfie AWAY" | person → suggested presence sensor | Pick the right sensor right here |
| /lights /heat /wall: "Alfies Office" | area display name from raw HA slug | Rename where I see it broken |
| Home tile: orange orb backdrop | "painting for this room is missing" | Upload it from this tile |
| Moment sensors picker | auto-pick worked but display was raw | (Now fixed but indirect — change happens in /settings/house) |
| /tv: "Living Room TV: off" | first-found TV entity | Pick which TV from here |
| Plugin enable: "Pairs with @broadsheet/voice" | implicit dependency | Send me to enable that one too |

Current fix affordances exist (/settings/house renames areas,
/settings/people pins sensors, /emanations settings uploads paintings)
but they're **far from where you see the problem**. The right pattern:
inline overrides + a meta hub.

## Decisions to lock

| Decision | Choice | Rationale |
|---|---|---|
| Affordance shape | Subtle pencil (✏️) icon to the right of the auto-inferred value, visible only on hover/focus | Editorial register stays clean by default; affordance reveals on engagement |
| Picker mechanism | Hybrid: inline popover for short lists (≤10), navigate-with-context for long lists | Sensor pickers + area pickers are short → popover. Entity pickers are 2000+ → navigate |
| "Low confidence" indicator | Subtle dotted underline on the auto-inferred value when broadsheet isn't sure | Tells the user "this might be wrong" without screaming |
| Navigate-with-context | Settings page receives a URL fragment + scroll/highlight target | E.g. `/settings/people#person.alfie_dennen` scrolls + highlights alfie's row |
| Hub location | Enhance `/settings/`'s existing "WHAT NEEDS YOUR ATTENTION" section rather than new page | Reuses established surface; user already knows where to look |

## Implementation breakdown

### 1. `InlinePin` primitive (NEW)

```svelte
<!-- packages/core/src/lib/components/InlinePin.svelte -->
<script lang="ts">
  let {
    value,           // What to display
    confidence,      // 'auto' | 'overridden' | 'low' — controls indicator
    children,        // Optional picker snippet (inline popover mode)
    onclick,         // Optional click handler (navigate mode)
    href,            // Optional href (navigate mode, target=_self)
    label            // a11y label for the pencil
  } = $props();
</script>

<span class="inline-pin" data-confidence={confidence}>
  <span class="value">{value}</span>
  {#if children}
    <details class="picker">
      <summary aria-label={label}>✏️</summary>
      {@render children()}
    </details>
  {:else if onclick}
    <button class="affordance" aria-label={label} {onclick}>✏️</button>
  {:else if href}
    <a class="affordance" aria-label={label} {href}>✏️</a>
  {/if}
</span>
```

Variants:
- **Inline popover** (`children` snippet) — picker UI drops below the value
- **Navigate** (`onclick` or `href`) — tap navigates somewhere with context

Confidence indicator:
- `auto` — no underline (default for working auto-picks)
- `low` — dotted underline ("this was a guess")
- `overridden` — solid underline ("you set this")

### 2. Surfaces to wire

**Home page (`/`)** — `routes/+page.svelte`:
- Person tile presence sensor: wrap `{slot.area.name}` in InlinePin →
  navigate to `/settings/people#person.<id>` with auto-pencil
- Person tile painting slot: when `paintingUrl === null`, surface
  InlinePin → navigate to `/settings/plugins/emanations/config#painting-<area>`
- Person tile when AWAY but discovery sees no sensor at all: low
  confidence + InlinePin → navigate to /settings/people

**/lights /heat /wall** — wrap each room name in InlinePin →
inline-popover with current rename + RENAME button → submits to
curation.areas[id].rename

**/tv** — if `discovery.allTvs.length > 1`, InlinePin on the active TV
name → inline-popover lists candidates with their states; pick one →
saves curation.tvOverride (new field)

**Moment-line clauses on `/`** — each clause (indoor temp, electricity
rate, weather) is already in the manifest. Wrap each in InlinePin →
navigate to `/settings/house#moment-sensors-<key>`

**/emanations** — each person tile gets InlinePin → navigate to
emanations config for that room/person combo

**/settings/plugins** — plugin "Disabled" / "Inactive" badges that
have a known dependency: surface the dep as a clickable chip ("Needs
@broadsheet/voice — enable") rather than just descriptive text

### 3. `/settings/` "WHAT NEEDS YOUR ATTENTION" enhancement

Currently shows a single card: "75 entities are hidden — BROWSE ALL
ENTITIES →". Extend to multiple cards based on real auto-inference
gaps detected at boot:

| Trigger | Card content | CTA |
|---|---|---|
| Any person has no presence sensor binding (curation.people missing) | "N people need a presence sensor" | → /settings/people |
| Any area has raw-slug display name | "N rooms could be renamed" | → /settings/house |
| Emanations enabled + persons exist + no paintings uploaded for their committed rooms | "N rooms have no painting yet" | → /settings/plugins/emanations |
| Plugin enabled but missing required config | "harold-preset needs an Anthropic key" | → /settings/plugins/harold-preset |
| TMDB enabled but tmdb_api_key empty | "TMDB needs an API key" | → /settings/plugins/tmdb-tv |
| /settings/devices has integrations marked as "device" | (deferred to Theme D) | — |

Order by impact: blockers first (presence missing → home page broken),
then polish items (room renames).

### 4. Navigate-with-context targets

Settings pages need to recognise URL fragments + scroll/highlight:

- `/settings/people#person.<id>` → scroll to person row + highlight
- `/settings/house#area-<id>` → scroll to area row + highlight + open
- `/settings/house#moment-sensors-<key>` → scroll to moment sensors
  section + flash the relevant picker
- `/settings/plugins/<id>/config#<field>` → scroll to + focus field

Implementation: `onMount` reads `location.hash`, finds the element by
id, scrolls to it, adds `.highlighted` class for 2s.

## Risks + open questions

- **Affordance discoverability vs visual quietness**: pencils are
  visible-on-hover/focus only. Touch devices have no hover. Need a
  mode toggle ("edit mode") OR always-visible-but-subtle. Lean
  always-visible-but-very-subtle (low opacity, picks up only on
  attention).
- **Inline-popover positioning**: popovers near page edges need
  collision detection. Use `<details>` element's default behaviour
  for v0.3.0; revisit if it's ugly on mobile.
- **Picker UX for sensor selection**: /settings/people already has a
  ranked-sensor picker with ★ BEST. Inline picker should reuse the
  same ranking logic, not reinvent.
- **"Low confidence" detection**: needs criteria. Initial heuristic —
  auto-pick is low-confidence when:
  - Person has multiple device_trackers AND no committed_room sensor
  - Area has a raw-slug name (lowercase + underscores)
  - Multiple TVs detected and we picked one
- **Mobile UX**: pencils may overlap content on narrow viewports.
  Keep them ≤24px + use `gap` carefully.

## Test plan

- Unit: InlinePin primitive renders all 3 variants; click handlers
  fire; href navigates; confidence indicator applies the right class
- Integration: dogfood the home page with a fresh curation, every
  auto-inferred value has a visible (on hover) pencil; clicking a
  pencil opens the right picker or navigates with context
- Visual: screenshot regression on the home page in 3 states
  (everything auto, some overridden, low-confidence visible)
- Hash-navigate: `/settings/people#person.alfie_dennen` scrolls +
  highlights; same for area + moment-sensors + plugin-field
  destinations

## Ship signal

v0.3.0 ships when:
1. InlinePin component lives in `lib/components/` with 3 variants
2. Home page (`/`) has inline pins on person presence + painting slots
3. /lights /heat /wall have inline-popover renames per room
4. Moment-line clauses on `/` have navigate-with-context pencils
5. `/settings/` "WHAT NEEDS YOUR ATTENTION" lists current
   auto-inference gaps with CTAs
6. Hash-navigate works on /settings/people + /settings/house
7. Manual dogfood walks the home page and never has to leave to fix
   anything auto-inferred

## Out of scope for Theme H

- Long-form picker for entity selection (Theme D content-filter
  territory)
- Plugin dependency graph auto-resolution (Theme B onboarding flows
  territory)
- Bulk rename UI ("rename all rooms" wizard) — could be a follow-up
- A11y deep work on the pencil pattern — first cut uses native
  `<details>` + button semantics; iterate if Lighthouse complains
