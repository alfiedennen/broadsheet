# Plan: @broadsheet/harold-preset — opinionated voice bundle

**Scope**: v0.1.0 (added 2026-05-16, depends on plan-voice-substrate)
**Severity**: Product-shaping — the "one-tap voice with a character"
moment.
**Rubric**: Epic 8 (P8-S4).

## Goal

Ship the Harold experience — Hitchcock-register British baritone,
Claude Haiku for the conversational layer, ElevenLabs Flash v2.5 for
TTS, the "Hey Harold" custom wake-word model, the meeting-mode hard-
mute, the Italian-when-spoken-Italian detection, the garbled-input
filter, conversational memory — as ONE plugin the user installs with
a tap.

Without the preset, voice substrate users have to make a dozen
configuration decisions: which LLM, which TTS voice, what's the
system prompt, what's the conversation memory backend, which speakers
to route to, when to be silent. Harold-as-preset removes those
decisions by being opinionated, while staying swappable for users who
want their own setup.

## What's in the preset (extracted from Harold Road's CLAUDE.md)

The Harold Road private install has spent ~9 months iterating on the
voice character + routing + safety. The preset packages those
learnings:

### Prompt + character

- Hitchcock-register system prompt (sardonic, measured, darkly witty,
  British understatement). Full prompt extracted to
  `prompts/hitchcock.md`.
- Voice/character convention: silent reply (`~`) for routine device
  control, one short sentence for status queries, full character for
  conversation/research.
- Per-surface prompt suffixes: voice/app/wall/panel — each has its
  own envelope describing the channel.
- Garbled-input rule (returns `Pardon?` or `~` on STT misfires).

### Routing (HA-native-first)

- Every utterance tries HA-native intent matcher first
  (`conversation.home_assistant` agent_id)
- HA-native `action_done` → silent reply (Harold convention)
- HA-native `query_answer` → speak the answer
- HA-native error with code other than `no_intent_match` → return
  HA's friendly error, DON'T fall through to LLM (refuses to invent
  workarounds for device-control failures)
- Only `no_intent_match` falls through to Claude Haiku

### Filters + safety rails

- **Echo-satellite filter** (`_looks_like_real_request`) — short
  jumbled STT bursts get short-circuited to `Pardon?` without an
  LLM call
- **Wall-specific filter** (`_looks_like_real_request_wall`) — tight
  rules for ambient call/meeting/podcast audio on the wall display;
  silent `~` reply on misfire (NOT audible Pardon, because office)
- **Meeting-mode** — three-layer hard-mute (intent gate + script
  gate + speaker-volume-0 gate) so an in-progress meeting doesn't
  get interrupted. Toggleable via Telegram `/hosting`-like commands
  or scheduled per the day's meetings
- **Italian detection** — heuristic on the input text; if Italian
  detected, prepends `[Sistema: rispondi sempre in italiano…]` to
  the prompt so Claude replies in Italian

### Conversational memory

- Vector DB (Turso libSQL with `vector_distance_cos` + ONNX
  all-MiniLM-L6-v2 embeddings)
- Per-exchange embedded + stored; retrieved top-5 most semantically
  similar past conversations injected into each prompt
- Weekly consolidation: entries older than 30 days are summarised
  via Claude into weekly digests

### Wake-word + STT

- Custom "Hey Harold" wake-word model (`.tflite`, ~60KB, trained on
  4774 positives + 1900 negatives)
- Deploys to Atom Echo / Wyoming satellites via ESPHome
  `micro_wake_word` component
- STT: HA Cloud (en-GB) or Whisper as fallback

### TTS

- ElevenLabs Flash v2.5 with a custom Harold voice (Voice Design v3,
  distinguished British male, deep baritone, Hitchcock gravitas)
- Italian TTS native via the same voice (ElevenLabs handles)

## What the user supplies

| Thing | Why |
|---|---|
| Anthropic API key | Claude Haiku for conversation. ~£3-6/month for typical Harold-shaped use |
| ElevenLabs API key (or HA Cloud TTS as fallback) | TTS. ElevenLabs free tier = 10K chars/month, plenty for the editorial register |
| Turso database URL + auth token (or skip → in-process SQLite) | Conversational memory backing. Skipping costs you cross-session memory persistence |

## Architecture

Harold preset is a thin wrapper around `@broadsheet/voice`:

```
@broadsheet/voice (substrate)
        ▲
        │ extends
        │
@broadsheet/harold-preset
    ├── system prompts (Hitchcock + per-surface suffixes)
    ├── routing rules (HA-native-first + action_done convention + error guard)
    ├── input filters (Echo + wall variants + Italian detection)
    ├── meeting-mode gates
    ├── conversational memory client (Turso, optional)
    ├── wake-word .tflite + ESPHome config snippet for Atom Echo
    └── HA blueprint(s) for meeting-mode automations
```

## What the user does on install

```
Settings → Plugins → @broadsheet/harold-preset → Enable

  ┌──────────────────────────────────────────────────────────┐
  │ Harold preset                                             │
  │                                                           │
  │ Hitchcock-register voice assistant. Sardonic. Measured.   │
  │ Powered by Claude Haiku + ElevenLabs.                     │
  │                                                           │
  │ Anthropic API key: [_____________________]                │
  │ ElevenLabs API key: [_____________________] (or HA Cloud) │
  │ Conversation memory: ( ) Off  (•) Local SQLite  ( ) Turso │
  │                                                           │
  │ Wake-word "Hey Harold":                                   │
  │   Download model (~60KB) and ESPHome snippet for your    │
  │   Atom Echos: [Download .tflite + snippet]                │
  │                                                           │
  │ Meeting mode: ( ) Off  (•) Telegram-driven  ( ) Calendar  │
  │                                                           │
  │                              [ Save and activate ]        │
  └──────────────────────────────────────────────────────────┘
```

That's it. Save activates the preset, swaps the voice substrate's
active pipeline to use Anthropic + ElevenLabs + the Hitchcock prompt,
and the user can start saying "Hey Harold" within minutes.

## What's NOT in the preset

Harold Road's full Harold stack has things that are too coupled to
Alfie's specific HA install to extract:

| Thing | Why not |
|---|---|
| 42 custom tools (Google Workspace, washer, energy, etc) | Each is a Harold Road-specific integration. Users would have their own |
| Telegram bot integration | Out of broadsheet's scope (voice is in scope) |
| HA caretaker / auto-updater | Operational tooling, not voice |
| AWS backups, persistence layer | Same |
| Daily briefings (morning / evening / events) | Could be a future Harold add-on plugin, not v0.1 |
| Email tracker, contact memory, life-admin memory files | Per-install personal data, can't ship as a preset |

These would be a separate `@broadsheet/harold-extras` plugin in
v0.2+ if there's demand. v0.1.0 preset is the VOICE bits only.

## What needs implementing

### Package scaffold (half day)

- New `packages/harold-preset/` workspace package
- `package.json`, `tsconfig.json`, `index.ts`
- Declares dependency on `@broadsheet/voice`

### Prompts (1 day)

- Extract Hitchcock system prompt from Harold Road into `prompts/hitchcock.md`
- Extract per-surface suffixes (voice/wall/panel/app) into
  `prompts/surfaces/*.md`
- Define a `PROMPT_VARIANT` registry so future presets can add their
  own characters

### Routing rules (1 day)

- Port `_async_handle_message` logic from Harold's HA custom
  component (HA-native-first, action_done convention, error guard)
- Re-implement in the voice substrate's routing layer (JS, not Python — the substrate is browser-side / addon-side, not in HA)

### Input filters (1 day)

- Port `_looks_like_real_request` + `_looks_like_real_request_wall`
  filters from Harold's `agent/channels/http.py`
- Italian detection heuristic

### Meeting-mode (1 day)

- HA blueprint for meeting-mode automation (`input_boolean.meeting_mode`
  + the three-layer hard-mute scripts)
- One-tap install: preset writes the blueprint into HA via
  `blueprints/api`

### Conversational memory (1.5 days)

- Embedding client (ONNX all-MiniLM-L6-v2 in browser via
  `@xenova/transformers` or similar)
- Storage: local SQLite via WASM in browser, OR Turso via REST
  client, with the same `format_memories_for_prompt` shape Harold
  Road uses
- Retrieval: per-prompt top-5 semantic similarity

### Wake-word distribution (half day)

- Bundle the `.tflite` model file + `manifest.json` as addon assets
- Provide a "Download wake-word for ESPHome" button that downloads
  the model + a customised ESPHome `wakewords/hey_harold/` block

### Settings panel (half day)

- HaroldPresetSettings.svelte — the install card mocked above

### Documentation + tests (1 day)

- README in `packages/harold-preset/` explaining install + license
  + which paid services are involved
- Tests for routing rules + input filters (port test cases from
  Harold Road's prompt-tuning test battery)

## Test plan

| Test | How |
|---|---|
| Unit: routing rules port | Port Harold Road's `voice_pipeline_battery.py` test cases — assert HA-native-first behaviour, action_done silent reply, error guard refuses LLM-escalation |
| Unit: input filters | Port Harold Road's filter test cases — same input strings, assert same `Pardon?` / `~` / pass-through decisions |
| Unit: Italian detection | Port the 2+ marker test cases |
| Integration: end-to-end with mocked Claude + mocked ElevenLabs | Drive a "turn on kitchen lights" utterance — assert HA-native fires, silent reply. Drive "what is the meaning of life" — assert fall-through to Claude, ElevenLabs synthesis, transcript update |
| Live: against the canary | Wire to the canary's actual Anthropic key (already provisioned) + an ElevenLabs test key. Verify end-to-end |

## Risks

| Risk | Mitigation |
|---|---|
| User without paid Anthropic/ElevenLabs subscriptions can't use the preset | Document loudly. Direct them at `@broadsheet/voice` + Ollama + Piper combo for a free-only path |
| The wake-word model is trained on Alfie's specific voice + accent — may not work well for other voices | Document that the model is "trained primarily on a British male voice; results may vary". v0.2 could add a community-trained variant or guide users through the `microWakeWord` training pipeline (Alfie's `microwakeword-trainer` repo) |
| The Hitchcock voice is opinionated and might not land for everyone | Make the preset SWAPPABLE — when active, the voice substrate uses Hitchcock prompts; disabling falls back to generic voice substrate behaviour with no prompt customisation. v0.2 could add OTHER character presets (Jeeves / HAL / Glados / etc) |
| Conversational memory needs an embedding model — ~25MB download for `all-MiniLM-L6-v2` | Lazy-load on first conversation. Document the one-time download. Or skip if user opts into "memory: off" |
| Italian detection has false positives (English words that look Italian) | Already battle-tested in Harold Road — needs 2+ markers OR 1 marker in a ≤4-word phrase. Port the same threshold |
| Meeting-mode HA blueprint may collide with the user's existing automations | Use a unique blueprint name (`broadsheet_harold_meeting_mode`) + write only on explicit user opt-in |

## Decisions locked

1. **Conversational memory default = Local SQLite.** Works without
   any account creation; cross-session memory is the magic. Turso
   stays as a documented opt-in path for users who want cross-device
   sync — the settings panel exposes the radio toggle (Off / Local
   SQLite / Turso) and the user-facing docs explain when Turso is
   worth the extra setup (multi-tablet households, multi-browser
   workflows, off-site backup of conversation history). Local SQLite
   uses sql.js or libSQL WASM bundled with the addon; no external
   service required.

## Original open questions (now answered)
2. Wake-word model — ship the `.tflite` directly in the addon, OR
   make it a one-click download? My pick: **Ship in the addon**
   (~60KB is nothing). User just downloads the ESPHome config snippet
   to wire to their Atom Echos.
3. Meeting-mode default — Off / Telegram-driven / Calendar-driven?
   My pick: **Off by default** — meeting-mode is a niche power-user
   feature. Document it as a v0.1.1 enhancement once we know which
   users want it.
4. Per-surface variants (voice / wall / panel / app) — ship all four
   from v0.1.0 even though only voice is in v0.1.0 scope, or just
   the voice variant? My pick: **just voice for v0.1.0**, ship the
   others when their surfaces land (wall variant when @broadsheet
   ships a dedicated wall-mode, etc).

## Estimated effort

- Package scaffold: 0.5 day
- Prompts extraction + registry: 1 day
- Routing rules port: 1 day
- Input filters port: 1 day
- Meeting-mode HA blueprint: 1 day
- Conversational memory: 1.5 days
- Wake-word distribution: 0.5 day
- Settings panel: 0.5 day
- Documentation + tests: 1 day

**Total: ~8 days of work.** Third-biggest of the four v0.1.0 scope
additions, but most of it is PORTS not new design.
