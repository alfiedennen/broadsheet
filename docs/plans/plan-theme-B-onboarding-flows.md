# Plan — Theme B: onboarding flows

**Status**: Drafted 2026-05-17 after Themes F + H landed (0.4.1). User
sequenced "F then H then through to B"; B is now next.
**Sequence**: B → ship 0.5.0 → manual dogfood → C (presence-aware
routing) OR D (content filtering) per user direction.
**Reference**: `.dogfood/V3-PIVOT-TO-V02.md` § B (the originating
observation); `docs/plans/plan-theme-H-inline-overrides.md` (the
attention-hub surface that hosts a flow's "start" CTA); the
harold-preset `<p class="hint">Pairs with @broadsheet/voice…</p>`
that motivated the whole pattern.

## Why this exists

The Theme H plugin-dep deeplink that just shipped is a one-step flow:
"to use harold-preset you need voice — here's the link". It works for
a single dependency but breaks down when a useful outcome takes 5–7
steps spanning multiple plugins.

The originating example: "Add Harold to your house". To get a working
voice assistant in broadsheet you must, in order:

1. Enable `@broadsheet/voice`
2. Enable `@broadsheet/harold-preset`
3. Paste an Anthropic key (link to console.anthropic.com/settings/keys)
4. Paste an ElevenLabs key (link to elevenlabs.io/app/settings/api-keys)
5. Install the meeting-mode HA blueprint (optional but recommended)
6. Download the `hey_harold.tflite` wakeword + ESPHome snippet
7. Flash the wakeword to a satellite, test the mic on `/`

Today the user has to discover each step independently, leave broadsheet
to fetch keys + flash firmware, and re-find their place each time. The
hint-text on harold-preset says "pairs with @broadsheet/voice — enable
that first" but nothing actually walks them through. Each step is a
separate hunt.

A **flow** is a sequence of steps the user moves through with clear
"this is what you're configuring + here's the next step" guidance. Not
modal wizards (a flow can be paused mid-step + resumed later). In-line
guidance that reads like prose — same register as the rest of broadsheet.

## Decisions to lock

| Decision | Choice | Rationale |
|---|---|---|
| Flow contribution mechanism | New optional `flows?: PluginFlow[]` field on the FROZEN `BroadsheetPlugin` contract | Optional, additive — doesn't break the v0.1 contract; plugins opt in by declaring flows |
| Composition | broadsheet aggregates declared flows + the addon ships a small set of "well-known" flow definitions that REFERENCE plugin steps | Plugins own their own step content; the addon owns the cross-plugin orchestration |
| Flow surface | New `/settings/setup/<flow-id>/` route — one page per flow, step-by-step view | A flow is editorial. It belongs in settings, not as a modal. Resumable by URL |
| Discovery / start CTA | "WHAT NEEDS YOUR ATTENTION" hub (Theme H surface) lists incomplete flows | Reuses the surface the user already learned in 0.3.1 |
| Step state | Each step is *idempotent* — re-running it is safe; broadsheet computes completion live from curation/discovery, not from a separate "completed" flag | A flow can be partially done by the user outside the flow UI; on re-entry the flow should pick up where they actually are, not where they last clicked |
| Step types | `enable-plugin`, `set-curation-field`, `external-link`, `custom` (renders a plugin-provided component) | Covers ~90% of onboarding without needing arbitrary code-in-config |
| Resumability | URL fragment carries step index; flow autoscrolls + flashes the active step | Same hash-navigate primitive Theme H ships |
| Skipping | Optional steps marked `optional: true` can be skipped with a single "Skip this →" affordance | Some steps (blueprint, wakeword) genuinely don't apply to every install |

## Implementation breakdown

### 1. Contract additions

```typescript
// packages/core/src/lib/plugins/types.ts — ADDITIVE to the frozen contract.

export interface BroadsheetPlugin {
  // ... existing fields ...

  /**
   * Onboarding flow steps this plugin contributes. broadsheet
   * aggregates these across all enabled plugins and exposes them in
   * /settings/setup/<flow-id>/. Each step is referenced by stable id
   * from the flow definition.
   */
  flows?: PluginFlowStep[];
}

export interface PluginFlowStep {
  /** Stable id — flow definitions reference steps by `<plugin-id>:<step-id>`. */
  id: string;
  /** Short imperative title — "Paste your Anthropic key". */
  title: string;
  /** One-paragraph dek explaining what + why. Same register as page deks. */
  description: string;
  /** Optional — render as "Optional · " prefix and surface a skip button. */
  optional?: boolean;
  /** What kind of step this is. Determines the affordance shape. */
  kind: PluginFlowStepKind;
  /** Live completion check. broadsheet calls this each render. */
  isComplete: (ctx: FlowStepContext) => boolean;
  /**
   * Optional inline component the step renders BELOW its title/dek.
   * For 'custom' steps this is required; for 'set-curation-field' it
   * can host a curated input; for others it's optional supplementary UI.
   */
  component?: () => Promise<{ default: SvelteComponent }>;
  /** External link href + label, when kind === 'external-link'. */
  link?: { href: string; label: string };
  /** Curation path + value description, when kind === 'set-curation-field'. */
  curationField?: { path: string; valueHint: string };
}

export type PluginFlowStepKind =
  | 'enable-plugin'          // step is complete when the named plugin is enabled
  | 'set-curation-field'     // step is complete when curation path is non-empty
  | 'external-link'          // step is complete when user clicks (via localStorage flag)
  | 'custom';                // step renders a plugin component + provides its own isComplete
```

### 2. Flow definitions (addon-shipped)

```typescript
// packages/core/src/lib/flows/definitions.ts

export interface FlowDefinition {
  id: string;
  title: string;
  description: string;
  /** When this flow is "incomplete" — drives the attention hub. */
  whenIncomplete: 'always' | 'plugin-enabled:<id>' | 'never';
  /** Ordered list of step refs in the form `<plugin-id>:<step-id>` */
  steps: string[];
}

export const FLOWS: FlowDefinition[] = [
  {
    id: 'add-harold',
    title: 'Add Harold to your house',
    description:
      'A 5-7 step setup to bring the Hitchcock-register voice assistant ' +
      'online. You can pause mid-flow and resume any time.',
    whenIncomplete: 'always', // suggest it on every install until completed
    steps: [
      'voice:enable',
      'harold-preset:enable',
      'harold-preset:anthropic-key',
      'harold-preset:elevenlabs-key',
      'harold-preset:meeting-blueprint',  // optional
      'harold-preset:wakeword-download',  // optional
      'voice:test-mic'
    ]
  },
  // Future: 'add-emanations', 'add-tmdb', etc.
];
```

### 3. `/settings/setup/<flow-id>/` page

Single SvelteKit dynamic route. Renders:

- Hero with flow title + description + progress ("3 of 7 done")
- Vertical step list, each step a `<section>` with:
  - Eyebrow: "STEP N · " + (optional "· OPTIONAL")
  - Title (Instrument Serif italic + amber, like Hero headlines)
  - Description (Newsreader body, snug leading)
  - Affordance based on `kind`:
    - `enable-plugin` → toggle (same UI as /settings/plugins row)
    - `set-curation-field` → text input bound via `useCurationField`
    - `external-link` → button "Open <label> ↗" + "I've done this →"
    - `custom` → renders the plugin's component
  - Completion indicator: `✓` when `isComplete(ctx)` returns true
- Footer: "Skip to step N" if multiple incomplete steps; "Done — return to /" CTA when all complete

### 4. Attention-hub integration

Extend the alerts engine (`packages/core/src/lib/curation/alerts.svelte.ts`)
to surface incomplete flows:

```typescript
// New alert: incomplete-flows
function incompleteFlows(): Alert[] {
  return FLOWS
    .filter(f => f.whenIncomplete === 'always' /* or matches gate */)
    .filter(f => !isFlowComplete(f, ctx))
    .map(f => ({
      id: `flow-${f.id}`,
      title: f.title,
      detail: `${countDone(f, ctx)} of ${f.steps.length} done`,
      cta: { label: 'Resume setup →', href: `/settings/setup/${f.id}/` }
    }));
}
```

Flows whose start condition is "plugin-enabled" only surface once that
plugin is on. E.g. an "Add TMDB content" flow only suggests itself
after the user enables `@broadsheet/tmdb-tv`.

### 5. Step authoring — `@broadsheet/voice` + `@broadsheet/harold-preset` updates

`packages/voice/src/index.ts`:

```typescript
const VOICE_FLOW_STEPS: PluginFlowStep[] = [
  {
    id: 'enable',
    title: 'Enable @broadsheet/voice',
    description:
      'The voice plugin wires HA Assist into broadsheet — STT, TTS, ' +
      'and conversation routing. Harold rides on top of it.',
    kind: 'enable-plugin',
    isComplete: (ctx) => ctx.curation.plugins?.voice?.enabled === true
  },
  {
    id: 'test-mic',
    title: 'Test the mic on /',
    description:
      "Tap the mic pill on the moment page. If you hear yourself echo " +
      "back in Harold's voice, everything's wired.",
    kind: 'external-link',
    link: { href: '/', label: 'the moment' },
    isComplete: (ctx) => ctx.localFlags.get('voice:test-mic-done') === true
  }
];

export default {
  id: 'voice',
  // ... existing fields ...
  flows: VOICE_FLOW_STEPS
};
```

Same shape in `packages/harold-preset/src/index.ts` for the four steps
contributed there.

### 6. Plugin-dep deeplinks → flow-start deeplinks (upgrade Theme H 0.4.1)

The `<a href="/settings/plugins/#plugin-voice">@broadsheet/voice — enable</a>`
link shipped in 0.4.1 becomes more useful as a flow entry:

```svelte
<a href="/settings/setup/add-harold/">Set up Harold step-by-step →</a>
```

Keep the direct enable link too for users who know what they're doing.

## Risks + open questions

- **Flow vs settings panel boundary**: harold-preset's settings panel
  already exposes Anthropic key + ElevenLabs key + blueprint install.
  The flow should NOT duplicate those inputs — it should DEEPLINK into
  the settings panel for that field. Hash-navigate via Theme H already
  supports `#anthropic-key`-style targets. Confirm the panel adds the
  needed ids.
- **"I've done this" flag for `external-link` steps**: stored in
  localStorage. Sync across browsers is out of scope for v0.5.
  Re-running the flow on a fresh browser shows the step as not-done;
  fine — the user re-clicks once + we move on. Cheaper than syncing.
- **Step ordering vs partial completion**: if a user has already done
  steps 3+5 manually, the flow should let them jump straight to step 2
  (the first incomplete). Use the same hash-navigate to land them
  there on entry.
- **Plugin disabled mid-flow**: e.g. user disables voice while
  setting up Harold. Flow re-evaluates isComplete on every render
  via curation tick → step 1 flips back to incomplete + progress
  rewinds. User sees a clear "you turned voice off — re-enable to
  resume" prompt.
- **Custom step components and the FROZEN contract**: `custom` step
  kind lets plugins ship arbitrary Svelte components in flows. This
  is the only extension point that could break the contract. Mitigate
  by lazy-loading + wrapping in an error boundary; a broken custom
  step shows "(step failed to load — skip to next?)" rather than
  crashing the whole flow page.
- **Discoverability of /settings/setup/**: with Theme H attention-hub
  it's automatic for incomplete-by-default flows; gated flows
  (`plugin-enabled:<id>`) are less discoverable. Consider a "Setup"
  tab on /settings/ root that lists all flows regardless of state.
- **Internationalisation**: titles + descriptions are English-only in
  v0.5. The same wash-out as the rest of broadsheet's editorial copy.

## Test plan

- Unit: FLOWS registry → `isFlowComplete` + `countDone` for each step
  kind; alerts emit one incomplete-flows alert per incomplete flow
- Integration: fresh curation + voice plugin disabled → attention-hub
  surfaces "Add Harold" flow as incomplete; enabling voice in the flow
  advances progress from 0/7 to 1/7 within a render tick
- E2E (manual on canary): walk the entire "Add Harold" flow end-to-end
  on a real HA install with real Anthropic + ElevenLabs keys; confirm
  resumability across browser-close + return; confirm flow disappears
  from attention hub after final step completes
- Contract: a malformed `flows: [...]` field (missing `isComplete`,
  bogus kind) is reported as `load-error` on /settings/plugins, plugin
  still loads but flow is dropped from the registry with a logged
  warning

## Ship signal

v0.5.0 ships when:

1. `BroadsheetPlugin.flows?` field + `PluginFlowStep` type live in
   `lib/plugins/types.ts` with full doc comments
2. `lib/flows/` module exports FLOWS registry + completion helpers
3. `/settings/setup/<flow-id>/` route renders the full step list with
   progress + per-step affordances + hash-navigate jump-to-step
4. Attention-hub surfaces incomplete flows as cards with "Resume →"
   CTAs (extending the alerts engine from Theme H 0.3.1)
5. `@broadsheet/voice` + `@broadsheet/harold-preset` contribute their
   step definitions; the "Add Harold" flow is fully populated
6. harold-preset settings panel's "Pairs with @broadsheet/voice" hint
   adds a "Or run the full setup ↗" link beside the direct enable
7. Manual canary dogfood: a fresh-install user can land on `/settings/`,
   see "Add Harold is 0 of 7 done", click through, and end at a
   working Harold without leaving broadsheet for any step that broadsheet
   could host

## Out of scope for Theme B

- **Cross-device sync of `external-link` "done" flags** — localStorage
  only in v0.5; Turso-backed sync deferred to v0.5.x
- **Editor for flow definitions** — flows are code-shipped, not user-
  authored. A future v0.6+ could expose flow authoring as a power-user
  surface, but for v0.5 the addon + plugin authors own them
- **Multi-flow simultaneous progress** — the UI assumes one flow at a
  time. Multiple flows can be in progress in parallel but the user
  navigates between them through the attention hub
- **Backwards-compat for "I did it by hand" detection** — v0.5 relies
  on idempotent isComplete checks; if the user already pasted an
  Anthropic key before the flow shipped, the flow correctly shows that
  step as `✓` on first entry. No migration needed
