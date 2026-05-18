# Troubleshooting — broadsheet

The operational gotchas — things that have actually broken in real
installs, with the fix that worked. Ordered by frequency.

If your problem isn't here, open an issue at
https://github.com/alfiedennen/broadsheet/issues with:

- What you tried
- What broadsheet showed (screenshots help)
- Anything from your HA logs that looks relevant (Supervisor →
  System → Logs → broadsheet)

---

## Imported page is mostly markdown / dead labels

**Symptom**: you imported a Lovelace dashboard, the page renders
but looks broken — long sections of italic-amber text that look
like labels, controls that should be tappable are dead text,
custom widgets show as placeholders.

**Cause**: your Lovelace dashboard is built with `custom:mushroom-*`
cards, `card-mod` CSS injection, and/or custom HACS components
(`custom:room-presence-card`, `custom:button-card`, etc.). These
aren't card TYPES the translator can convert — they're an entire
rendering language broadsheet doesn't speak. The translator
preserves the DATA but can't reproduce the visual register.

**Fix — embed instead of translate**: open Settings → Pages →
⇣ Import from Lovelace, pick your dashboard, then pick **"Embed
the whole dashboard (don't translate)"** (the second option
below the tabbed-import default). This creates a broadsheet page
that iframes the original HA Lovelace dashboard — perfect
fidelity. Or pick a single view + "Embed instead" if only some
views are too custom.

**Or — re-author in broadsheet things-first**: the wall-builder
(`Settings → Pages → + New page` then drop things from the
browser) is the canonical way to build a wall surface in
broadsheet's register. If you want broadsheet's editorial look
+ behaviour, this is the path. The Lovelace import is best-
effort, not perfect translation.

See [`CUSTOM-PAGES-GUIDE.md`](CUSTOM-PAGES-GUIDE.md#when-translation-works-well-vs-when-to-embed)
for the honest "when each path works" list.

## Lovelace embed shows blank

**Symptom**: you added a `lovelace-embed` block (or used the
"Embed the whole dashboard" import option), but the iframe
shows blank / empty / a refused-connection message.

**Cause**: HA defaults to `X-Frame-Options: DENY` in its HTTP
response headers — a security default that prevents HA's UI from
being framed by other origins. broadsheet's iframe gets the
DENY header back from HA and the embedded content never renders.

**Fix — allow framing in HA's configuration.yaml**:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
    # add any reverse-proxy IPs you have
```

If you're running broadsheet as an add-on through HA Ingress,
that's same-origin and should "just work" once `use_x_forwarded_for`
is on. For cross-origin embeds (broadsheet at port 8124 → HA
Lovelace at port 8123), you also need to allow your hostname
as a frame ancestor. The cleanest way is HA's
[`http.cors_allowed_origins`](https://www.home-assistant.io/integrations/http/#cors_allowed_origins)
config, but the X-Frame-Options DENY is set elsewhere — depending
on your HA version you may need an `add_header` rule in a
reverse-proxy in front of HA. There's no universal recipe; the
HA setup varies.

**Workaround**: use Ingress URLs rather than port-direct URLs
for the embed. broadsheet's addon ingress runs same-origin as
HA's frontend, so iframing a Lovelace path under the same
ingress chain avoids X-Frame-Options entirely.

**Honest caveat**: this is one of the few things broadsheet can't
fix entirely from its side. The framing decision is HA's; we
just consume whatever HA serves.

## The addon shows the old version after I push a new one

**Symptom**: you publish a new addon version via the CI pipeline.
The GHCR registry has the new image. HA's addon info page still
shows the old version + "Auto-update" is on but doesn't fire.

**Cause**: HA Supervisor caches each addon repository's
`config.yaml` in a local git clone. `ha addons reload` (the older
command) doesn't re-pull the git remote. The auto-update flag only
checks on Supervisor's scheduled cadence (roughly daily) — it
won't pick up a fresh CI push immediately.

**Fix**: SSH to HA and force a store reload + manual update:

```bash
ssh root@homeassistant.local "ha store reload && ha addons update <slug>"
```

`ha store reload` (the newer command, not `ha addons reload`) does
the git pull. After that, `ha addons info <slug>` should show the
new `version_latest`. The update command actually pulls the new
image.

For broadsheet specifically:

```bash
ssh root@homeassistant.local "ha store reload && ha addons update 68fa04fc_broadsheet"
```

---

## Tablets / kiosks appear in media panels

**Symptom**: A Galaxy Tab, Fire HD, iPad, or "wall pixel" device
shows up in the things-first browser's Speakers sub-group, or
appears inside an `area-media-panel` block alongside the TV.

**Cause**: HA classifies these devices as `media_player` because
the protocol works that way — they can receive cast streams. But
they're SURFACES (broadsheet often runs on them), not media
SOURCES.

**Fix (0.9.3.1 onwards)**: broadsheet filters them out by name +
device-model match — Galaxy Tab / Fire HD / Fire Tablet / iPad /
iPhone / Pixel / Chromebook / Fully Kiosk / "wall pixel" / "wall
display" / Kindle / Nexus all match the heuristic.

**If yours slips through**: the device probably has a name or
model the regex doesn't match. Open an issue with the entity name
+ device model (from `/settings/house`) and the heuristic gets
extended. Workaround in the meantime: hide the entity in
`/settings/house` so it doesn't appear in discovery at all.

---

## "Unknown block type" placeholder on a custom page

**Symptom**: A custom page renders most of its blocks but one
shows a red error chip: `Unknown block type: tmdb-tv:rows` (or
similar).

**Cause**: The page was authored when a plugin was enabled, then
the plugin got disabled in `/settings/plugins`. The block stays
in the page's saved JSON; broadsheet won't crash on it but it
can't render without the plugin's renderer.

**Fix**: re-enable the plugin in `/settings/plugins`. Or remove
the block from the page in advanced-editor mode (the things-first
canvas shows the same hint and lets you ✕ remove).

---

## Settings changes don't reach the wall tablet

**Symptom**: you edit a custom page in broadsheet's editor on
your laptop. The "✓ saved" indicator fires. But the tablet
mounted in the hallway still shows the old version.

**Cause**: edits are persisted server-side immediately (after the
400ms debounce), but the tablet doesn't know to reload until its
page does.

**Fix options** (in order of cleanness):

1. **Pull-to-refresh on the tablet** — fastest for one-off edits.
2. **Fully Kiosk auto-reload interval** — Settings → Web Content
   Settings → "Reload page every N minutes". Set to 30 or 60 for
   pages you edit occasionally; off for stable ones.
3. **Fully Kiosk `loadUrl` REST trigger** — script your HA to call
   Fully Kiosk's REST API after a publish action. Useful for
   "publish wall changes via a button".

---

## "Pardon?" or no response from "Hey Harold" / wall voice

This is voice-pipeline specific, not broadsheet — but worth
documenting since broadsheet shows the symptom.

**Symptom**: speaking to an Atom Echo near the kitchen produces
"Pardon?" replies for short utterances, or no reply at all on the
office Echo / wall Pixel during meetings.

**Cause**:
- Office surfaces (the office Atom Echo + the wall-mounted Pixel
  6) have a TIGHTER misfire filter than the other Echos. They
  ignore short ambient noise that would prompt a response
  elsewhere. This is deliberate — they're in spaces with
  podcasts / calls / meetings audible.
- The wall display filter additionally requires `"harold"`, an
  imperative verb, a question word, or a house noun in the
  input — anything ambient is silently dropped (returns `~` to
  HA, no TTS).

**Fix**: not a bug. If you genuinely want a wall reply, prefix
with "Harold" or start with a clear verb / question word.

---

## broadsheet shows "no entities discovered" or empty rooms

**Symptom**: you open `/lights` or the things-first browser and
no rooms / no entities appear.

**Causes (in order of likelihood)**:

1. **Areas aren't assigned in HA.** Areas are the unit broadsheet
   organises around. Open HA → **Settings → Areas & Zones** —
   you need at least a few rooms named, with devices assigned
   to them. broadsheet's Unsorted area catches anything without
   an area assignment but it's the fallback, not the goal.
2. **The HA WebSocket isn't connected.** Check the connection
   indicator (a dot at the top of the broadsheet page). If it's
   not green, broadsheet can't fetch state. Refresh the page;
   check HA itself is up; check the addon log for WebSocket
   errors.
3. **Entities are auto-hidden.** `/settings/house` shows the
   smart auto-hide reasons per entity. If broadsheet decided
   something was system / diagnostic / duplicate it's not in
   the things-first browser. Un-hide in `/settings/house` if you
   actually want it.

---

## The "Open Web UI" button does nothing / loads a blank page

**Symptom**: after installing broadsheet, clicking "Open Web UI"
in HA's addon info page either does nothing or loads a blank
panel.

**Causes**:

1. **Addon hasn't fully started yet.** First start downloads the
   image + runs the sidecar's first-boot setup. Wait 30 seconds
   and try again.
2. **Browser cached an old version.** Hard-refresh (Ctrl+F5 /
   Cmd+Shift+R) the HA tab.
3. **Sidebar takeover sometimes confuses HA's panel cache.**
   The addon ships with `sidebar_takeover: true` by default. If
   the broadsheet ingress link looks broken, restart the addon
   (Settings → Addons → broadsheet → Restart). Last resort: flip
   `sidebar_takeover: false` in the addon's Configuration tab.

---

## TMDB rows show "configure it" CTA instead of content

**Symptom**: enabled `@broadsheet/tmdb-tv` but every TMDB row
shows "Set your TMDB API key" or similar CTA instead of posters.

**Cause**: the plugin needs a free TMDB API key in
`/settings/plugins/tmdb-tv/config` to fetch content. No key = no
fetch.

**Fix**:

1. Get a free TMDB key at https://www.themoviedb.org/settings/api.
2. Open broadsheet → Settings → Plugins → TMDB Content → Config.
3. Paste the key. Region defaults to `GB` — change to your
   country code for accurate streamer-provider filtering.

The next reload of `/tv` (or any page with the `tmdb-tv:rows`
block) will fetch + render.

---

## Front door lock control doesn't work from broadsheet

**Symptom**: the `lock` widget in broadsheet shows the lock's
state but tapping does nothing.

**Cause**: broadsheet hard-bans `lock.lock` and `lock.unlock`
writes regardless of the `read_only` addon setting. A UI bug
near a lock is too expensive.

**Fix**: not fixable — by design. Lock control stays in HA proper
(or via a physical button / voice). broadsheet shows state
correctly; control happens elsewhere.

---

## Custom pages disappear after addon update / backup restore

**Symptom**: you authored a few custom pages, restored a backup
or updated the addon, the pages are gone.

**Cause**: broadsheet stores curation (custom pages + house
overrides + people picks + plugin enable flags) in
`/data/broadsheet.json` inside the addon's data volume. The data
volume travels with HA's snapshot/backup system, so a snapshot
backup includes it; a fresh addon install without restore
doesn't.

**Fix**:
- **Export**: Settings → About → "Export current config" gives
  you a copy of `broadsheet.json`.
- **Backup**: HA's normal snapshot includes the addon data
  volume; ensure broadsheet is in the snapshot scope.
- **Restore**: HA snapshot restore restores broadsheet's data
  volume. The curation is reloaded on next addon start.

---

## Things-first editor crashes on a specific page

**Symptom**: opening a specific custom page in the editor causes
a Svelte error or empty editor body.

**Cause**: most often a malformed block config in the page's
saved JSON — could be from a previous broadsheet version, a
Lovelace import edge case, or a manual edit.

**Fix**:

1. SSH to HA and inspect `/addon_configs/68fa04fc_broadsheet/broadsheet.json`
   (or wherever your install stores it).
2. Find the problematic page under `customPages[].slug ===
   "<your-slug>"`.
3. Either fix the block manually or delete the page's entry from
   the JSON.
4. Restart broadsheet's addon.

Better fix: open an issue with the broken page's JSON snippet so
the editor's error handling can be hardened.

---

## "claude" appears as a contributor on the GitHub repo

This is a GitHub stale-cache thing, not a broadsheet issue.
GitHub's contributor sidebar widget reads from `/stats/contributors`
which is heavily cached and recomputed asynchronously. After a
history rewrite (or just naturally over time) the cache can lag
24-72h behind the actual git log.

The local git log + GitHub's `/contributors` API both correctly
show only `alfiedennen` as the contributor. No action needed —
the sidebar cache will refresh on GitHub's own cadence.

---

## Where logs live

- **broadsheet addon log** — Settings → Addons → broadsheet →
  Log. Shows the nginx reverse-proxy log + the sidecar Python
  process log.
- **broadsheet SPA console** — open broadsheet, open your
  browser's DevTools, console tab. WebSocket events + block
  rendering + plugin loading all log here.
- **HA Core log** — Settings → System → Logs. WebSocket reconnect
  failures + auth issues + service-call errors show up here.
- **HA Supervisor log** — only visible via SSH:
  `ssh root@homeassistant.local "ha supervisor logs --follow"`.
  Useful for addon install / startup / image-pull issues.
