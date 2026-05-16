# Plan: @broadsheet/voice — generic voice substrate

**Scope**: v0.1.0 (added 2026-05-16)
**Severity**: Product-shaping — broadsheet had no voice story.
**Rubric**: Epic 8 (P8-S1, P8-S2, P8-S3, P8-S5).

## Goal

A first-class plugin (`@broadsheet/voice`) that gives broadsheet a
working voice surface — push-to-talk in browser, wake-word on Atom
Echo, transcript visible inside broadsheet — without locking the
user into any specific LLM or TTS provider.

The plugin DOES:
- Discover HA's installed conversation agents (HA-native intent
  matcher, Whisper, OpenAI Conversation, Anthropic, custom)
- Discover HA's installed TTS providers (HA Cloud, Piper,
  ElevenLabs, OpenAI)
- Discover HA's installed STT providers (HA Cloud, Whisper)
- Wire the standard HA conversation pipeline (STT → conversation
  agent → TTS → media_player target)
- HA-native intent matcher gets first attempt on every utterance
  (sub-200ms, free); only unmatched utterances fall through to the
  configured LLM
- Render a transcript pane inside broadsheet (kebab nav `/voice`
  or a chat pill on `/`)
- Push-to-talk in browser via Web Speech API for STT + the
  configured HA TTS provider for speech output

The plugin does NOT:
- Pre-bundle any LLM or TTS provider (user picks)
- Re-implement HA's conversation pipeline (we use HA's API, not
  parallel infrastructure)
- Train wake-word models (those are integrations the user
  already has — broadsheet just lists them)
- Persist conversation memory (Harold preset adds this on top)

## Constraints we're working within

- **HA's `assist_pipeline` is the stable API.** Available since HA
  2023.5, well-documented. Pipeline = STT engine + conversation agent
  + TTS engine + wake-word engine, all chained. Multiple pipelines
  can exist; one is the "preferred" pipeline.
- **`conversation/process` is the WS call to send an utterance.**
  Takes `agent_id` (which agent to ask) + `text` + optional
  `language` + `conversation_id` (for multi-turn). Returns a
  response with `speech_slots`, intent, and an optional speech
  string to TTS.
- **HA-native intent matching = `conversation.home_assistant`
  agent_id.** This is the built-in agent that does fast local
  device-control matching. Costs zero, returns sub-200ms.
- **Wyoming-protocol satellites (Atom Echo, etc) are HA's own
  domain.** broadsheet doesn't need to drive them directly — HA
  handles wake-word + STT + TTS routing if the user has them
  configured. broadsheet just LISTS them in /settings/voice + lets
  the user pick which pipeline runs.
- **Browser-side voice uses Web Speech API** for STT (no third-party
  service required) + HTML5 `<audio>` for TTS playback (HA returns
  TTS audio as a URL or stream).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│                                                                  │
│   ┌─────────────────────────┐    ┌──────────────────────────┐  │
│   │ Push-to-talk button     │    │ Transcript pane          │  │
│   │ (mic icon on /)         │    │ (/voice or pill on /)    │  │
│   │   Web Speech API STT    │    │  Last N exchanges        │  │
│   └─────────┬───────────────┘    └────────────▲─────────────┘  │
│             │ text                                │              │
└─────────────┼────────────────────────────────────┼──────────────┘
              │                                    │
              ▼                                    │
┌─────────────────────────────────────────────────────────────────┐
│  HA WebSocket                                                    │
│                                                                  │
│   conversation/process { agent_id, text, conversation_id }      │
│                                                                  │
│        ├─► HA-native intent (conversation.home_assistant)       │
│        │     fires service call, returns silent or short        │
│        │                                                         │
│        └─► User's LLM agent (e.g. anthropic_conversation)       │
│              returns speech + intent + actions taken            │
│                                                                  │
│   tts/speak { engine_id, message, target: media_player.x }      │
│        ├─► HA's TTS pipeline                                    │
│        └─► browser plays via <audio> if target is browser       │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Atom Echo / Wyoming satellite (already in user's HA)            │
│                                                                  │
│   Wake-word fires → STT → conversation/process → TTS → speaker   │
│   (broadsheet doesn't drive this — HA handles it natively)      │
└─────────────────────────────────────────────────────────────────┘
```

## What's in the plugin

### `packages/voice/src/`

| File | Responsibility |
|---|---|
| `index.ts` | Plugin contract — pages, renderers, settings, discovery contributors |
| `pages/VoicePage.svelte` | `/voice` — transcript pane + push-to-talk + which pipeline is active |
| `renderers/VoicePillRenderer.svelte` | Kebab-pill on `/` — small mic + last-utterance + tap to expand |
| `settings/VoiceSettings.svelte` | `/settings/plugins/voice/config/` — list HA conversation agents + TTS providers + wake-word engines, pick the broadsheet-active pipeline |
| `lib/conversation.ts` | Wraps HA's `conversation/process` WS call, routes to HA-native first |
| `lib/tts.ts` | Wraps HA's `tts/speak` WS call + handles browser audio playback |
| `lib/stt.ts` | Web Speech API wrapper for browser push-to-talk |
| `lib/discovery.ts` | Plugin discovery contributor — surfaces HA's pipelines + agents + engines into `discovery.plugins.voice.*` |

### `/settings/voice` overlap

The voice plugin's settings panel (`/settings/plugins/voice/config/`)
shows the broadsheet-active pipeline picker. But there's also a
top-level `/settings/voice` route in core that surfaces editorial
override strings (defaults to plugin off, plugin can light it up).

When the voice plugin is enabled, `/settings/voice` extends to
include:
- Active pipeline picker (re-uses the plugin's settings panel)
- Per-page voice settings: which surfaces have a push-to-talk button,
  which have a passive transcript pill, which surfaces voice replies
  fire on (which speaker)
- A "test the pipeline" mic record button that runs an end-to-end
  utterance through and shows where it lands

## Editorial register treatment

The voice surface is uniquely well-shaped for broadsheet's editorial
register. Examples:

### Transcript pane (`/voice`)

```
NO 09 · VOICE

You said: "turn on the kitchen lights"
Broadsheet replied: (silent — HA-native intent, command fired)
3:42 pm

You said: "what's the weather"
Broadsheet replied: "Eleven degrees, partly cloudy. Light rain by six."
3:38 pm

You said: "send a message to Elena saying I'll be late"
Broadsheet replied: "Sent to Elena."
2:15 pm

──
Active pipeline: Whisper STT + Claude Haiku + ElevenLabs Harold
Wake word: "Hey Harold" on 4 satellites
```

### Pill renderer on `/`

A small `🎙` icon bottom-right that pulses softly when the wake word
fires, expands to show last exchange + a push-to-talk button.

## What needs implementing

### Plugin scaffold (1 day)

- New `packages/voice/` workspace package
- `package.json`, `tsconfig.json`, `index.ts` shell
- Hooked into `pnpm-workspace.yaml`

### Discovery layer (2 days)

- WS subscriptions for `assist_pipeline/pipeline/list` +
  `conversation/agent/list` + `tts/engine/list` + `stt/engine/list`
- Discovery contributor surfaces these into `discovery.plugins.voice.*`
- Reactive — pipelines added/removed in HA show up in broadsheet
  within seconds

### Conversation routing (2 days)

- `lib/conversation.ts` — sends `conversation/process` with HA-native
  `agent_id` first, falls through to user-configured LLM agent only
  if HA-native returns `no_intent_match`
- Conversation memory (per-tab + persisted via localStorage) so
  multi-turn works without server state
- Transcript event-bus that the transcript pane + pill renderer
  both subscribe to

### Browser STT + TTS plumbing (2 days)

- `lib/stt.ts` — Web Speech API wrapper with fallback message if
  browser doesn't support it (Safari mostly)
- `lib/tts.ts` — call `tts/speak` with `target: media_player.broadsheet_browser`
  (a synthetic target the plugin registers; speech URL returns to
  browser for `<audio>` playback)

### `/voice` page + pill renderer (2 days)

- VoicePage.svelte — transcript + push-to-talk + active-pipeline strip
- VoicePillRenderer.svelte — kebab-pill renderer for `/` (via `useRenderer`)

### Settings panel + /settings/voice integration (1 day)

- VoiceSettings.svelte — pipeline picker, per-surface voice toggle,
  test-utterance button

### Documentation + tests (1 day)

- README + RENDERER-CONTRACT update (voice as a new renderer hook)
- Tests for conversation routing, discovery, transcript event-bus

## Test plan

| Test | How |
|---|---|
| Unit: HA-native-first routing logic | Mock `conversation/process` returning various agent responses, assert HA-native is tried first, fall-through happens only on `no_intent_match` |
| Unit: Discovery contributor surfaces pipelines | Mock HA WS, assert `discovery.plugins.voice.pipelines.length` updates on changes |
| Integration: full pipeline against fixture HA | Mock HA WS + Web Speech API, drive an utterance through STT → conversation → TTS → playback, assert the right text lands in transcript |
| Browser smoke: Web Speech API + audio playback | Manual; document that Chrome + Edge work, Safari/Firefox have caveats |
| Canary integration | Test against the real Harold Road HA install (which has Whisper + Anthropic + ElevenLabs + Atom Echos all configured). HA-native intent fires on "turn on kitchen lights" with sub-200ms. Fall-through fires on "what's the weather" |

## Risks

| Risk | Mitigation |
|---|---|
| Web Speech API browser support is uneven (Safari sub-par, Firefox basically nonexistent) | Document. Fall back to "type your message" textarea on unsupported browsers — voice surface stays available even without mic |
| HA's `assist_pipeline` API may change between HA versions | Pin to HA 2024.4+; version-detect on plugin load; graceful degradation message if older |
| User has no conversation agent installed — plugin enabled but nothing to route to | Empty-state UI: "You don't have a conversation agent installed yet. Open HA settings → Add Integration → search 'conversation' to pick one" |
| LLM costs spiral if HA-native routing breaks | Telemetry: log per-day count of HA-native-matched vs LLM-fallback. Surface in `/settings/voice` "today: 47 HA-native, 3 LLM". User sees runaway cost emerging early |
| Conversational memory is per-tab + per-browser — clear cookies = lose history | This is the v0.1 design (no server state). v0.2: optional Turso/Postgres backing if user opts in. Harold preset adds this on top |

## Open questions for user

1. Default-on vs default-off? My instinct: default-OFF (consistent
   with other plugins). User enables in `/settings/plugins`. The
   first-launch onboarding flags voice as a high-value plugin worth
   enabling.
2. Push-to-talk button visible on `/` by default, or only when the
   user enables it? My pick: visible on `/` only when the voice
   plugin is enabled AND at least one TTS provider + conversation
   agent are configured. Stays out of the way otherwise.
3. Should the voice plugin try to register a "browser media player"
   target with HA so HA can stream TTS directly to the browser? My
   pick: yes — it's the cleanest way to handle "user is at the wall
   tablet, voice fires there". Alternative is broadcasting to nearest
   physical speaker via Wyoming, but that requires a presence
   inference broadsheet doesn't own.

## Estimated effort

- Plugin scaffold: 1 day
- Discovery layer: 2 days
- Conversation routing: 2 days
- Browser STT + TTS plumbing: 2 days
- `/voice` page + pill renderer: 2 days
- Settings + /settings/voice integration: 1 day
- Documentation + tests: 1 day

**Total: ~11 days of work.** Second-biggest of the four v0.1.0 scope
additions.
