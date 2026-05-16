# Plan: Native HA settings UIs in broadsheet

**Scope**: v0.1.0 (added 2026-05-16 alongside sidebar takeover)
**Severity**: Product-shaping — the missing half of the takeover
story. Without native settings, the takeover sends users back to
HA's UI for every settings interaction.
**Rubric**: Epic 7 (P7-S3, P7-S4) plus P7-S5 fallback.

## Goal

After the sidebar takeover lands, the user's primary nav is
broadsheet. But they still need to do the things HA's settings UI
does — add an integration, see what's installed, rename an entity,
read logs to debug. Those flows should live INSIDE broadsheet, in the
editorial register, talking to HA's WS APIs directly.

The remaining 5-10% of unusual flows (initial setup wizards for
exotic integrations, advanced YAML, debug snapshots) drop into HA's
own UI via the "Open HA settings →" affordance.

## What lands native vs what stays in HA

### Native in broadsheet (8 surfaces)

| Surface | HA WS API | Editorial shape | Status |
|---|---|---|---|
| `/settings/house` | `config/area_registry/list,update,create,delete` + `config/entity_registry/*` + `config/device_registry/*` | Areas + entities, rename / hide / move (existing) | Half-shipped, write-side gaps |
| `/settings/people` | `person/list,update,create,delete` + `config/auth/list` | People + presence-sensor pairing (existing) | Half-shipped, write-side gaps |
| `/settings/voice` | `assist_pipeline/pipeline/list` + `conversation/agent/list` + `tts/engine/list` + `stt/engine/list` | Voice agents + TTS providers + pipelines | NEW — overlaps with `@broadsheet/voice` plugin |
| `/settings/plugins` | broadsheet curation only | Plugins enable/disable/configure (existing) | Shipped |
| `/settings/integrations` | `config_entries/get,subscribe,reload,disable,remove,setup_flow/*` | Browse installed integrations, reconfigure, remove. ADD-NEW drops into HA flow (it's a wizard) | NEW — biggest single build |
| `/settings/devices` | `config/device_registry/list,update` + `config/area_registry/list` | Devices grouped by integration + area, rename, assign area, disable | NEW |
| `/settings/addons` | `supervisor/api` proxied (`/addons/list`, `/addons/<slug>/info,start,stop,update,uninstall`) | Add-on list, status, update, start/stop. NEW-install drops into HA store (browsing the catalogue is HA's job) | NEW |
| `/settings/logs` | `system_log/list,clear` + `error_log/get` | Recent errors + warnings, filtered by integration, clear/dismiss | NEW |

### Stays in HA (deep-link via "Open HA settings →")

- New-integration setup wizards (config flows are HA-specific UI)
- Advanced YAML editing (HA's own tools are the right surface)
- Backup / snapshot management (HA's UI handles edge cases well)
- User account management (security-sensitive, leave with HA)
- Network configuration
- Hardware-specific config (HA OS settings)

## Approach — incremental + WS-thin

Each native settings surface is a SvelteKit route at `/settings/<name>/+page.svelte`
that:
1. Subscribes to the relevant HA WS API on mount
2. Renders the data in broadsheet's editorial register
3. Writes back via HA WS calls on user mutations

No new HA permissions needed — supervisor token already has admin
access. No new HA APIs needed — every surface uses existing,
documented WS calls.

### Pattern (for each surface)

```ts
// /settings/integrations/+page.svelte
import { discovery } from '$lib/discovery';
import { haWs } from '$lib/ha/ws';

const entries = $state<ConfigEntry[]>([]);

onMount(() => {
  haWs.send({ type: 'config_entries/get' });
  haWs.subscribe('config_entries_updated', (msg) => {
    // update entries on add/remove/reload
  });
});

async function reload(entry: ConfigEntry) {
  await haWs.send({ type: 'config_entries/reload', entry_id: entry.entry_id });
}

async function remove(entry: ConfigEntry) {
  await haWs.send({ type: 'config_entries/remove', entry_id: entry.entry_id });
}
```

### Editorial register treatment per surface

The point isn't "render HA's config tree in italic". It's "compose a
narrative paragraph + reveal-on-tap details + one editorial CTA per
row".

Example for `/settings/integrations`:

```
SETTINGS · INTEGRATIONS

You have 23 integrations.

Mostly working — 21 quiet, 2 reporting errors.

[grouped by status: ERRORS, WORKING, DISABLED]

ERRORS
  Sonos (since Tuesday afternoon)
  → "WebSocket connection refused"
  RELOAD  ·  CONFIGURE  ·  REMOVE
  Yale Smart Lock (since this morning)
  → "Authentication expired"
  RELOAD  ·  RE-AUTH IN HA →  ·  REMOVE

WORKING
  21 integrations · expand for the full list →

DISABLED
  2 integrations · expand to re-enable →

──
For adding a new integration, [open HA settings →]
```

That's the shape. Same pattern for /settings/devices, /settings/addons,
/settings/logs.

## What needs implementing

### Phase 1 — read-only surfaces (shippable independently)

Each is a 1-3 day build:
1. `/settings/integrations` — read entries, group by status, render
   the editorial integration list
2. `/settings/devices` — read devices, group by integration + area,
   render with rename affordance
3. `/settings/addons` — proxy `supervisor/api` (already proxied for
   the broadsheet addon's own data writes), render addon list
4. `/settings/logs` — read system_log, group by integration, filter

### Phase 2 — write surfaces

For each Phase 1 surface, add the mutation calls:
1. Integrations: reload / disable / remove
2. Devices: rename / assign area / disable
3. Add-ons: start / stop / update / uninstall (with confirmation)
4. Logs: clear / dismiss

### Phase 3 — voice settings (overlaps with plan-voice-substrate.md)

`/settings/voice` extends to discover + list HA's conversation agents
and TTS providers. This LANDS with the voice substrate plugin and is
specified in detail in `plan-voice-substrate.md`.

## Editorial substrate to extract

Each settings surface follows the same shape. Pull these into
reusable primitives:

| Primitive | Purpose |
|---|---|
| `<SettingsSurface>` | Hero + body + footer pattern for every settings page |
| `<StatusGrouped>` | "21 quiet, 2 reporting errors" → grouped section list |
| `<EditorialRow>` | A row with primary label + secondary status + CTA chips |
| `<RowReveal>` | Tap-to-expand details (the integration's error string, device's entities) |
| `<HaFallbackLink>` | "Open in HA →" link with `target="_top"` for deep-linking out |

These would live under `packages/core/src/lib/components/settings/`
and be importable for any new settings surface (including v0.1.x
additions).

## Test plan

| Test | How |
|---|---|
| Unit: WS request shape per surface | Mock WS, assert outgoing messages match HA's documented payloads |
| Integration: synthetic HA snapshot | Mount each settings page against a fixture HA snapshot (23 integrations, 47 devices, 5 add-ons, mixed log levels). Assert editorial register renders correctly |
| E2E: real canary | Read-only sweep on the live canary. Mutations behind a guard (don't actually disable real integrations during test runs) |
| Brittleness firewall | Each new surface goes through the same forbidden-pattern lint (no DOM-scraping HA frontend, no MDC classes) |

## Risks

| Risk | Mitigation |
|---|---|
| HA's WS APIs are documented but version-sensitive — `config_entries/get` payload could change between HA versions | Pin to HA 2024.4+ schema; surface "this surface needs HA X.Y" graceful degradation when API differs |
| The 20% of integrations that NEED their setup wizard can't be added natively | Explicit "open HA settings →" for "Add integration" — broadsheet doesn't try to re-implement HA's config-flow stepper |
| Add-on store browsing is rich — broadsheet shouldn't try to re-implement the store | `/settings/addons` is "your installed add-ons" only; "Browse add-on store →" deep-links to HA |
| User has a custom HA dashboard they're attached to — takeover breaks their flow | Already addressed by `sidebar_takeover: false` roll-back path; document loudly |
| Permissions: supervisor token has full admin — broadsheet COULD do anything | Document the trust model explicitly in PUBLIC-README; broadsheet's safety rails (lock writes hard-banned, read-only mode) extend to settings writes |

## Open questions for user

1. Should `/settings/addons` allow `start` / `stop` / `update` /
   `uninstall` of OTHER add-ons (not just broadsheet itself)? My
   instinct: yes for start/stop/update (low risk, recoverable), NO
   for uninstall (require user to do it in HA's UI as a friction
   gate, since uninstall is destructive + irreversible).
2. Should `/settings/logs` be filterable by severity (warning vs
   error)? Filterable by integration? Searchable? My pick: all
   three — but ship with the integration filter as primary and
   defer severity-filter + search to v0.1.1 polish.
3. Native vs iframe for the FIRST-TIME `add new integration` flow?
   My pick: iframe of HA's config flow embedded inside broadsheet's
   chrome (so the user doesn't feel like they're leaving the app).
   But this is the riskiest pattern — could feel janky. v0.1
   default = deep-link out; v0.1.x evaluate the iframe option.

## Estimated effort

- Phase 1 (4 read-only surfaces): ~3 days
- Phase 2 (write surfaces): ~3 days
- Phase 3 (voice settings, captured in plan-voice-substrate): see that plan
- Editorial substrate extraction: ~1 day
- Tests: ~2 days
- Docs: ~half day

**Total: ~9-10 days of work.** Biggest of the four v0.1.0 scope
additions.
