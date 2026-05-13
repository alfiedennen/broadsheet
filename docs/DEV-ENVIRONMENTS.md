# broadsheet â€” development environments

How to build and test broadsheet without breaking the production house.

The non-negotiable: production HA OS at `192.168.1.11` runs the wall
tablet, the phone PWA, the front door automation, the heating, the
presence mesh, and Harold. A bug in broadsheet that fires a stray
service call against production is lights flicking on at 3am or the
front door auto-unlocking when it shouldn't. Everything below is
designed so that *can't happen by default* â€” writes require explicit,
ephemeral unlock.

---

## Three environments

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ENV 3 â€” Production canary                                       â”‚
â”‚  Production HA OS (192.168.1.11) with broadsheet add-on          â”‚
â”‚  installed alongside harold-home, sidebar entry "Broadsheet".    â”‚
â”‚  Runs in parallel for â‰¥7 days before the wall tablet migrates.   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â–² promotes to
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ENV 2 â€” Add-on integration                                      â”‚
â”‚  HA OS in VirtualBox on the Windows dev machine.                 â”‚
â”‚  Hostname `test.local`. Snapshotted clean state.      â”‚
â”‚  Tests packaging, Supervisor token flow, ingress, multi-arch.    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â–² promotes to
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ENV 1 â€” Local SvelteKit dev                                     â”‚
â”‚  pnpm dev at localhost:5173.                                     â”‚
â”‚  WebSocket points at production HA, READ-ONLY by default.        â”‚
â”‚  Settings file at ./dev.json, never touches HA.       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

95% of dev time is in Env 1. Env 2 fires up when we touch the add-on
manifest, packaging, or ingress integration. Env 3 starts once the
add-on builds clean against Env 2 and we want real-life soak.

---

## Env 1 â€” Local SvelteKit dev (read-only against production)

The fast inner loop. Reads from production HA over WebSocket so
discovery testing happens against your actual house shape; writes are
gated behind explicit unlock.

### Setup

```sh
cd D:\Visual Studio Code Projects\broadsheet
pnpm install
pnpm dev               # http://localhost:5173
```

`.env.development` (gitignored):

```
PUBLIC_HA_URL=http://192.168.1.11:8123
HA_TOKEN_DEV=<generate-fresh-LLAT-from-HA-Profile>
BROADSHEET_READONLY=true
BROADSHEET_SETTINGS_PATH=./dev.json
BROADSHEET_AUDIT_LOG=./dev-audit.jsonl
```

### Safety rails

**1. Default to read-only mode.** Every service-call path inside the
HA client routes through a wrapper:

```ts
// src/lib/ha/actions.ts
export async function callService(domain: string, service: string, target: any, data?: any) {
  if (env.BROADSHEET_READONLY === 'true' && !window.__BROADSHEET_ALLOW_WRITES__) {
    auditLog('blocked-write', { domain, service, target, data });
    console.warn(`[broadsheet:readonly] blocked: ${domain}.${service}`, { target, data });
    return { success: false, reason: 'readonly' };
  }
  auditLog('call-service', { domain, service, target, data });
  return client.send({ type: 'call_service', domain, service, target, service_data: data });
}
```

Reads (`subscribe_entities`, registry queries, history) are always
allowed. Writes (`light.turn_on`, `lock.unlock`, `climate.set_temperature`)
short-circuit to a console log + audit-log entry.

**2. Explicit ephemeral unlock for write testing.** When you genuinely
need to toggle a real light from dev, append `?allow-writes=true` to
the URL. The flag is *not* persisted in localStorage â€” it goes away on
refresh, so you can't accidentally leave it on for a week.

```ts
// src/routes/+layout.svelte
$effect(() => {
  const url = new URL(location.href);
  window.__BROADSHEET_ALLOW_WRITES__ = url.searchParams.get('allow-writes') === 'true';
  if (window.__BROADSHEET_ALLOW_WRITES__) {
    console.warn('[broadsheet] writes ALLOWED for this session');
  }
});
```

**3. Hard-banned entity classes, even with unlock.** `lock.*` is
read-only-always in dev mode, no override flag. Locks are the one
entity class where a bug is meaningfully expensive (lockouts, security
incidents). The wrapper checks the domain and refuses regardless of
the unlock flag.

```ts
const HARD_BANNED_DOMAINS = ['lock'];
if (HARD_BANNED_DOMAINS.includes(domain)) {
  auditLog('hard-banned', { domain, service, target });
  return { success: false, reason: 'hard-banned-in-dev' };
}
```

**4. Settings file lives in the project, not on HA.** Env 1 writes to
`./dev.json` (gitignored). Env 2 writes to `/data/broadsheet.json`
inside the VirtualBox HA's add-on volume. Env 3 (production) writes to
the real `/data/broadsheet.json`. Different paths means dev settings
can never accidentally overwrite prod settings.

**5. Service-call audit log.** Every call (blocked or fired) appends
to `./dev-audit.jsonl` with timestamp + domain + service +
target + data + outcome. JSONL so we can `jq` over it for post-mortems.
If something *does* fire unexpectedly, we can see exactly what.

**6. Dry-run service-call wrapper.** A separate mode (`BROADSHEET_DRYRUN=true`)
returns a plausible fake success response without hitting HA at all.
Lets us test UI flows that depend on success state without touching
the house. Default off in dev (we want real reads), available when
testing UI changes that depend on action outcomes.

### Env 1 fitness criteria

You're using Env 1 correctly when:
- Production HA never logs a service call from `dev` token
  unless you typed `?allow-writes=true` knowingly
- The `dev-audit.jsonl` file shows mostly `blocked-write`
  entries during normal dev, with `call-service` entries clustered
  around explicit test sessions
- No surprise state changes in the house during dev hours

If the audit log starts showing unexplained writes, stop and audit
the path that fired them.

---

## Env 2 â€” HA OS in VirtualBox (add-on integration)

For testing the add-on lifecycle: build, install, ingress, Supervisor
token injection, sidecar API, snapshot/restore, upgrade flow. Lives on
the Windows dev machine so the ProDesk stays untouched.

### Setup

1. Download `haos_ova-<latest>.vdi.zip` from
   [github.com/home-assistant/operating-system/releases](https://github.com/home-assistant/operating-system/releases)
   (pick the OVA build, not generic-x86-64)
2. Unzip to `D:\HAOS-test\` (or similar)
3. New VM in VirtualBox:
   - **Type**: Linux â†’ Other Linux (64-bit)
   - **CPU**: 2 cores
   - **RAM**: 4GB
   - **EFI**: enabled (System â†’ Motherboard â†’ Enable EFI). Without
     EFI, HA OS refuses to boot.
   - **Storage**: attach the `.vdi` as the SATA disk
   - **Network**: Bridged adapter â†’ gets its own IP on your LAN
4. Start VM, wait ~5 min for HA's first-boot provisioning
5. Find the IP from VirtualBox network info or your router's DHCP table
6. Browse to `http://<that-IP>:8123`, create owner account
7. **Critical first step**: Settings â†’ System â†’ Network â†’ Hostname â†’
   `test`. Otherwise mDNS collides with production HA at
   `homeassistant.local` and one of them silently wins.
8. **Snapshot immediately** in VirtualBox UI â€” this is your "clean
   state" to roll back to between add-on test cycles.

### Add-on dev workflow

The `addon` repo (separate from `broadsheet/core`) lives
at `D:\Visual Studio Code Projects\addon\`. To test changes:

1. Build the SPA in `broadsheet/`: `pnpm build` â†’ static output in `build/`
2. Copy `build/*` into `addon/broadsheet/www/`
3. Push the addon repo to a test branch on GitHub (or use a local file
   URL during early dev)
4. In `test.local:8123`:
   - Settings â†’ Add-ons â†’ â‹® â†’ Repositories â†’ add the test branch URL
   - Find broadsheet in store â†’ Install (~30s)
   - Start â†’ Open Web UI
5. Iterate. Each rebuild needs an Uninstall â†’ Reinstall cycle (or
   `ha addons rebuild` via SSH for faster cycles).
6. To reset between major changes: VirtualBox â†’ restore snapshot.

### What Env 2 specifically tests

- `repository.yaml` parses correctly
- `config.yaml` schema validates
- Multi-arch build matrix (initially just amd64 â€” aarch64 later via
  QEMU on CI)
- `SUPERVISOR_TOKEN` injection works end-to-end (the SPA's WS connects
  successfully without ever pasting a token)
- Ingress URL routing â€” the `X-Ingress-Path` quirk doesn't break
  navigation
- Sidecar curation API survives container restarts
- `addon_config` map persists `broadsheet.json` across `ha addons
  restart`
- Update flow: bump `version: "0.1.1"` in `config.yaml`, push, HA shows
  update badge, install applies cleanly

### What Env 2 doesn't test

- Real-house entity diversity (the test HA has no Zigbee dongle, no
  integrations, no devices). For "does broadsheet handle a messy real
  install" you have to fall back to Env 3 or to imported sanitised
  registries.

### Resource cost

~1-2GB RAM idle, ~5-10% of one CPU core, ~6-8GB disk initially (sparse,
grows to 32GB max). Negligible on a modern dev rig. Stop the VM when
not in use to free everything.

---

## Env 3 â€” Production canary (side-by-side install)

Once the add-on builds clean and behaves in Env 2, install it in
production HA OS. **Critical**: it lives alongside harold-home, not
replacing it.

### Setup

1. **Snapshot production HA OS in Proxmox before anything else.** Two
   minutes, one command via the Proxmox UI. Guaranteed rollback.
2. In production HA â†’ Settings â†’ Add-ons â†’ â‹® â†’ Repositories â†’ add the
   addon repository (private repo at this point â€” switch to
   public for v0.1.0 release)
3. Install broadsheet, Start, Open Web UI
4. Verify it appears in the sidebar as "Broadsheet" (icon
   `mdi:home-heart`)
5. **DO NOT** point the wall tablet, phone PWA, or any cast script at
   broadsheet yet. They keep going to harold-home.
6. Verify side-by-side coexistence:
   - harold-home still works at `harold.local`
   - broadsheet works at `homeassistant.local:8123 â†’ Broadsheet sidebar`
   - Both can be open simultaneously without WebSocket conflicts
7. Run broadsheet through real life for â‰¥7 days, watching for:
   - Service calls that fire correctly
   - State updates that arrive in real-time
   - Reconnect behaviour during HA restarts
   - Settings UI persisting across container restarts
   - No regressions in harold-home's behaviour
8. After 7+ days clean: migrate the wall tablet's Fully Kiosk start URL
   to broadsheet's ingress URL. Run another 7 days.
9. Then migrate the phone PWA. Then archive harold-home.

### What can go wrong in Env 3

- **Add-on container crash loop** â†’ HA Supervisor restarts it; if it
  loops, the sidebar entry just shows a 502. Doesn't affect HA itself.
- **Broadsheet hammering the WebSocket** â†’ could in theory affect HA
  responsiveness. Watch HA's CPU + recorder lag during the soak. If
  observed, add subscription debouncing.
- **Sidecar Python service segfault** â†’ curation reads/writes return
  500; SPA shows a "couldn't save" toast. Curation file unchanged on
  disk. Restart the add-on to recover.
- **Bug fires real service call** â†’ hopefully caught in Env 1's
  read-only mode, but if it slips: harold-home's existing automations
  + Harold's monitoring will surface anomalies. Production data is
  always one Proxmox snapshot away from rollback.

### When to stop calling Env 3 a canary

After 30 consecutive days of clean operation across all three surfaces
(wall, phone, dev) on broadsheet alone, harold-home gets archived. The
canary phase ends.

---

## Cross-cutting safeguards

### Separate LLAT for dev

Generate a dedicated long-lived access token in HA â†’ Profile â†’
Long-Lived Access Tokens â†’ Create Token â†’ name it
`dev-<machine>`. Use this only in Env 1's `.env.development`.
If something behaves weirdly, revoke this token without affecting any
other integration (harold-agent, hub-api, the wall tablet, etc.).

### `.gitignore` discipline

```
# In broadsheet/.gitignore
.env*
dev.json
dev-audit.jsonl
build/
node_modules/
```

The audit log can contain entity friendly names that leak house layout â€”
keep it out of the repo.

### Never test on the front door lock

`lock.*` is hard-banned in dev mode regardless of the unlock flag.
Env 2's HA has no locks anyway. Env 3 testing of lock interactions
should happen during waking hours with someone present, never
overnight, never while away.

### Snapshot before every Env 3 add-on update

Once broadsheet is installed in production, before every
`config.yaml` version bump that changes anything non-trivial:
1. Proxmox snapshot of HA OS VM
2. Apply update
3. Verify
4. If broken: restore snapshot, debug in Env 2

### Heartbeat must work before Env 3

The WebSocket heartbeat (30s ping / 10s pong-timeout / force-close on
zombie) that we built into harold-home's client.ts must be in
broadsheet's client too. Without it, a ProDesk restart leaves the SPA
in a silent zombie state â€” same bug we already burned a session on
in harold-home.

---

## Order of operations for next session

1. Stand up VM 110 in VirtualBox (HA OS, fresh, snapshot immediately)
2. Generate the dev LLAT in production HA
3. Scaffold `broadsheet/` in `D:\Visual Studio Code Projects\` as a
   fresh repo (NOT a fork of harold-home â€” clean room, copy code in
   deliberately as we extract it)
4. Get the readonly + dry-run + audit-log wrappers in place *before*
   the discovery layer goes in
5. Then start on Layer 1 (registry + entity discovery) against
   production HA, read-only
6. First Env 2 test happens after Layer 1 + minimal Layer 2 are
   working â€” that's when add-on packaging starts to matter

That order means by the time we're capable of breaking things, the
safety rails are already there.

---

## What I'm worried about

- **The audit log becoming noise.** If every render triggers a
  hundred reads, the log is too verbose to scan for unexpected writes.
  Mitigation: log writes always, log reads only on explicit
  `?audit-reads=true` flag.
- **Forgetting `?allow-writes=true` is in the URL.** Easy to leave it
  there for an entire dev session. Mitigation: visible banner in dev
  mode when writes are allowed, never miss it.
- **Env 2 falsely passing because the test HA is too clean.** No
  Zigbee, no integrations, no real devices = no real test. Need the
  "messy install" testing strategy: import sanitised production
  registries OR install random integrations to create synthetic
  diversity. Decide before Env 2's first add-on install.
- **Production canary masking real problems.** If broadsheet runs
  alongside harold-home and only the dev uses it, the wall tablet's
  Fully Kiosk + Elena's iPhone are the real test. Make sure the
  migration cadence happens (don't leave broadsheet installed but
  unused for months).
