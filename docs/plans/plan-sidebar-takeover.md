# Plan: Sidebar takeover — broadsheet becomes the HA frontend

**Scope**: v0.1.0 (was a v0.0 omission, added 2026-05-16)
**Severity**: Product-shaping — changes broadsheet from a peer
frontend into THE frontend on install.
**Rubric**: Epic 7 (P7-S1 through P7-S5).

## Goal

On `broadsheet` install, the user's HA stops looking like "HA's
material-design Lovelace with broadsheet as an extra sidebar entry"
and starts looking like "broadsheet's editorial register with an
'open HA settings' affordance for the unusual flows".

Specifically:
1. HA's left sidebar collapses globally (across all dashboards, all
   user profiles).
2. Broadsheet's ingress URL becomes the user's landing surface — the
   URL the browser opens to when they navigate to `homeassistant.local:8123`.
3. The kebab nav inside broadsheet has an "Open HA settings →" entry
   that drops the user into HA's own UI (`/config/integrations`,
   `/config/devices`, etc) when needed.
4. The user can roll back to peer-frontend mode by flipping a single
   addon option (`sidebar_takeover: false`).

## Constraints we're working within

- **HA doesn't expose a "hide sidebar globally" API.** The closest
  things are per-user `sidebar_panel_order` + `hidden_panels` (via
  the `frontend/get_user_data` + `frontend/set_user_data` WS calls).
  These are PER USER, not global. So we'd need to apply them to every
  user account broadsheet can see.
- **HA's default landing surface is `lovelace` (the Overview dashboard).**
  Changing the default landing requires modifying `frontend.default_dashboard`
  in HA's `configuration.yaml`, OR setting a per-user `default_dashboard`
  via the same WS calls.
- **Ingress dashboards CAN be marked as default.** The addon's
  `panel_icon` + a `lovelace.dashboards` entry pointed at the ingress
  URL would make broadsheet a real first-class HA panel.
- **HA's sidebar can be collapsed (not hidden) via user profile** —
  `dock_sidebar: "always_hidden"`. This is per-user. With it, the
  sidebar only shows when the user mouse-hovers the left edge.
- **There's no way to remove HA's own URL bar / top header chrome
  from within broadsheet's iframe.** The iframe sits inside HA's
  `<ha-panel-iframe>` which always has the top chrome.

## Approach — three layers

### Layer 1 — Make broadsheet the default landing surface

On addon install / start, the sidecar makes these HA WS calls
(authenticated via the SUPERVISOR_TOKEN, which has full admin access
on the user's HA):

```
auth (already done via supervisor token)
→ config/auth/list           # list all user accounts
→ for each user:
    frontend/set_user_data {
      user_id: <id>,
      value: {
        defaultPanel: "broadsheet",          // landing surface
        dockedSidebar: "always_hidden"       // sidebar collapsed
      }
    }
→ lovelace/dashboards/list   # list existing dashboards
→ if no "broadsheet" panel entry: register it via supervisor/api
```

The supervisor already registers the addon as a panel via the
addon's `config.yaml` `panel_icon` + `ingress: true`. So step 3 is
already done at addon-install time. We just need the user-data writes
and the default-panel switch.

### Layer 2 — Add a panel-mode toggle to the addon config

`config.yaml` gets a new option:

```yaml
options:
  read_only: false
  sidebar_takeover: true   # NEW
schema:
  read_only: bool
  sidebar_takeover: bool
```

When `sidebar_takeover: true` and the addon's `run.sh` boots, the
sidecar applies the WS calls above. When `sidebar_takeover: false`,
the sidecar reverts: `defaultPanel: "lovelace"` + `dockedSidebar:
"docked"` for each user.

This means roll-back is one toggle + an addon restart.

### Layer 3 — Add "Open HA settings →" affordance inside broadsheet

In `KebabNav.svelte`, add a final entry above "Settings · broadsheet"
and "Forget token":

```svelte
<a href="/config/" class="kebab-item ha-link" target="_top">
  <span class="kebab-label">Open HA settings</span>
  <span class="kebab-hint">native HA UI for integrations, devices, logs, advanced YAML</span>
</a>
```

`target="_top"` breaks out of the ingress iframe so the user lands on
HA's own `/config/` page. Returning to broadsheet is a click on the
broadsheet panel in HA's sidebar (which now-hidden sidebar surfaces
on edge-hover when the user moves their cursor left).

## What needs implementing

### Sidecar (broadsheet-addon `broadsheet/run.sh` + companion Python)

| Component | What it does |
|---|---|
| `broadsheet/init/sidebar.py` (NEW) | On boot, if `OPTION_SIDEBAR_TAKEOVER == "true"`, opens a WS session against `homeassistant.local:8123`, lists users, applies `defaultPanel: "broadsheet"` + `dockedSidebar: "always_hidden"` to each |
| `broadsheet/init/sidebar.py` (NEW) | If `OPTION_SIDEBAR_TAKEOVER == "false"`, applies `defaultPanel: "lovelace"` + `dockedSidebar: "docked"` |
| `broadsheet/run.sh` | Calls `sidebar.py` before nginx starts |
| `broadsheet/config.yaml` | Adds `sidebar_takeover: true` to options + schema |

### Core SPA (`packages/core/`)

| Component | What it does |
|---|---|
| `KebabNav.svelte` | Adds "Open HA settings →" link with `target="_top"` |
| New `BackToBroadsheet.svelte` component | Renders a "← Back to broadsheet" bar when HA detects the user came from broadsheet (via referrer). NOT in scope for v0.1 — defer to v0.1.1 if it turns out to be a friction point |

### Documentation

| Doc | What it gains |
|---|---|
| README.md | Already updated — describes the takeover |
| `docs/plans/plan-sidebar-takeover.md` | THIS file |
| `docs/PUBLIC-README-DRAFT.md` | Update to emphasise the "one frontend" promise |
| `docs/DEV-ENVIRONMENTS.md` | Add a note on how local dev bypasses the takeover (since dev mode doesn't have supervisor access to write user_data) |

## Test plan

| Test | How |
|---|---|
| `e2e/takeover-install.spec.ts` | Mock supervisor + HA WS; on addon start with `sidebar_takeover: true`, assert WS calls `frontend/set_user_data` for every user with the correct payload |
| `e2e/takeover-rollback.spec.ts` | Same mock, flip to `sidebar_takeover: false`, assert reverse WS calls |
| Integration test | On the real canary: install addon with takeover on, verify HA sidebar collapses, verify broadsheet is the landing surface. Flip toggle, verify sidebar returns |
| Manual dogfood | Re-do the fresh-user dogfood with takeover on. The walk should now be "I install broadsheet, I open HA, I'm in broadsheet, I tap Open HA settings to debug an integration" |

## Risks

| Risk | Mitigation |
|---|---|
| User profile changes are PER USER — a household with 4 HA accounts means 4 writes; we miss one and that user still sees the old sidebar | Loop through `auth/list` deterministically; log each write; alert on partial failure |
| `dockedSidebar: "always_hidden"` may not exist on HA <2024.4 | README already requires HA 2024.4+; check supervisor's `core_version` before applying and degrade gracefully if older |
| The user adds a NEW HA account after broadsheet install — that account doesn't get the takeover applied | Run `sidebar.py` on every addon start (not just install); new accounts get fixed up at next addon restart. v0.1.1 could add a "Re-apply takeover" button in /settings |
| `frontend/set_user_data` overwrites the user's OTHER frontend preferences | Use `frontend/get_user_data` first, merge our keys on top, then `set_user_data` with the merged blob. Don't blow away `selectedTheme` etc |
| User hates the takeover but doesn't know they can roll it back | First-launch onboarding banner in broadsheet: "broadsheet has taken over your HA sidebar — change this in /settings or the addon config" |

## Open questions for user

1. Should the takeover require an explicit opt-in on first launch
   (banner: "Want broadsheet to take over your HA frontend? [Yes /
   Not now]"), OR should it be silent-on-by-default (addon config
   default `true`)? My instinct: silent-on-by-default with a
   first-launch banner explaining what happened + how to revert.
2. Should "Open HA settings" land at HA's `/config/` (the integrations
   page), at `/config/integrations`, or at HA's actual root `/`? My
   pick: `/config/` because it's the most likely intent.
3. Should we also try to suppress HA's "Updates available" sidebar
   badge / notifications panel when in takeover mode? My pick:
   NO — those are HA's actual events; surface them in broadsheet's
   own /settings panel instead (v0.1.x).

## Estimated effort

- Sidebar takeover sidecar Python: ~80 lines + 30 lines test = ~3 hours
- KebabNav update + first-launch banner: ~50 lines + tests = ~2 hours
- Config schema + supervisor wiring: ~30 lines = ~1 hour
- Integration test on canary: ~1 hour
- Documentation: already done

**Total: ~7-8 hours of work.** Lowest-effort of the four v0.1.0
scope additions.
