# Wall builder — build your first kiosk surface in 5 minutes

A walkthrough for the single most common broadsheet job: take a
spare tablet, mount it on a wall, point it at a broadsheet page
shaped for that tablet's screen.

Works on Fire HD 10, Galaxy Tab A9, iPad, Pixel Tablet, or any
device that runs a browser. We'll use Fire HD 10 as the example —
adjust dimensions for your hardware.

---

## Before you start

You'll need:

- broadsheet running in HA. If you haven't installed it yet, see
  [`broadsheet-addon/README.md`](https://github.com/alfiedennen/broadsheet-addon/blob/main/README.md).
- A tablet on the same Wi-Fi as HA, with a browser. Fully Kiosk
  Browser is the recommended app for a real kiosk install; any
  browser works for first-pass testing.
- The tablet's intended location (so you know if it'll be
  landscape or portrait, sofa-distance or wall-mounted).

---

## Step 1 — Create the page

1. Open broadsheet → click the kebab (⋮) → **Settings → Pages**.
2. Tap **+ New page**.
3. Label it after the room: e.g. **"Living Room Wall"**.
4. The slug auto-derives (`living-room-wall`). Edit if you'd like
   something shorter (`wall`, `lr`, `sofa`).
5. **Wall device** dropdown: pick your tablet's preset.

   | Preset | Landscape px |
   |---|---|
   | Fire HD 10 | 1280×800 |
   | Fire HD 8 | 1280×800 |
   | Galaxy Tab A9 / A9+ | 1340×800 |
   | Galaxy Tab S6 / S7 | 1600×1000 |
   | iPad 10.2" | 1080×810 |
   | iPad Pro 11" | 1668×1124 |
   | Pixel Tablet | 2560×1600 |
   | Generic 7" tablet | 1024×600 |
   | Generic phone landscape | 800×480 |

   Picking the preset sizes the editor's preview pane to the
   tablet's actual dimensions (scaled to fit your laptop screen).
   What you see in the preview is what'll appear on the tablet.

6. Width: **Default** is fine — the wall page sizes itself to the
   surface.

7. Tap **Create + edit**. You're in the things-first editor.

---

## Step 2 — Pick the right verbs

The browser on the left lists every controllable thing in your
HA, grouped by room. For a living-room wall surface you typically
want **rooms-worth of controls**, not individual entities. So
look for the `▸` composed recipes first:

### Most-common wall layout (≈ 4 taps)

In the **Living Room** group:

1. *"Living Room media — panel"* — TV remote + speakers together
2. *"Living Room lights — panel"* — every light tile inline
3. *"Living Room heating — panel"* — every TRV inline

In the **Scenes** group at the bottom:

4. *"Activate Cinema"* / *"Activate Warm Evening"* — pick one or
   two for tap-to-mood.

Four taps = a working wall page with browse-and-control for a
whole room. Watch the preview pane on the right update with each
tap; it's already sized to your target tablet.

### Adding TMDB content

If you've enabled `@broadsheet/tmdb-tv` (with an API key in
Settings → Plugins → TMDB Content), every TV-having area gets an
extra recipe under the TV sub-group:

> *"Living Room TV — TMDB show & movie rows"*

Drop it right after the media panel. You now have a remote + a
browse-and-tap-to-play interface side-by-side. Same content as
`/tv` — just on YOUR wall page.

### Other useful additions

- *"Front Door — unlock"* — a 1-tap macro for the lock (under the
  Hallway → Locks sub-group)
- A camera snapshot tile (under any area with a camera)
- *"Show <sensor>"* recipes for ambient sensors you care about
  (temperature, humidity)
- *"+ Section divider"* footer button for visual breaks between
  groups

---

## Step 3 — Arrange + tune

### Reorder

Drag the `⋮⋮` handle on any block to move it up or down. On
touch, tap the ↑ / ↓ buttons.

### Tweak individual blocks

Click a block's title row to expand its inline editor:

- **Area panels** — change which area, override the section label
- **Thing** — override the label / icon, change the widget
- **Macro** — opens the Macro Composer to edit
- **Section divider** — rename the label

### Add a custom macro

Tap **+ Macro** at the bottom of the canvas:

1. Name it ("Cinema", "Goodnight", "Bedtime")
2. Optional icon (`mdi:movie-open`, `mdi:moon-waxing-crescent`)
3. **+ Add step** → pick a thing → pick an action → repeat
4. Reorder steps with ↑ / ↓
5. **Create macro**

Tap the tile on the wall to fire all steps in order.

### Preview at actual size

The preview pane shows your page at the tablet's native CSS
dimensions, scaled to fit. The badge near the preview header
shows the scale (e.g. *"@ 78%"*). Resize the editor pane and
the scale adjusts.

---

## Step 4 — Point a tablet at the page

Below page meta in the editor you'll find the **"Point a wall
here"** panel:

```
Kiosk URL
http://homeassistant.local:8123/<your-prefix>/<slug>/?kiosk=true   [Copy]
```

`?kiosk=true` suppresses the kebab nav, the install banner, and
the connection indicator — the page fills the screen.

### Using Fully Kiosk Browser (recommended)

1. Install [Fully Kiosk Browser](https://www.fully-kiosk.com/) on
   your tablet (free version is fine).
2. **Start URL** → paste the kiosk URL.
3. Recommended Fully Kiosk settings:
   - **Web Auto Reload** → off (lets broadsheet handle its own
     reconnects)
   - **Kiosk Mode** → on
   - **Hide Status Bar** → on
   - **Keep Screen On** → on (under Display Settings)
   - **Reduce screen brightness in dark room** → on (saves the
     OLED panel + your eyes)
   - **Motion Detection** → **off** (it false-triggers the
     screensaver-exit on broadsheet's own animations; if you want
     screensaver behaviour use `clearCache` not
     `clearWebstorage` — the latter wipes the HA token)
4. Launch.

### Using any browser

Just navigate to the kiosk URL. For a "real" kiosk experience:
fullscreen the browser, disable the screensaver on the tablet,
plug it in.

### Quick test from your phone

Paste the kiosk URL into your phone's browser to sanity-check
before mounting the tablet. The page will render at phone size
(it's responsive); you're just verifying it loads + the things
you expect are there.

---

## Step 5 — Battery / power management

Wall-mounted tablets need their charge cycled or they'll cook
their batteries (charging continuously to 100% degrades fast).

### Samsung Galaxy Tab A9 / A9+

Built-in. **Settings → Battery and device care → Battery →
Protect battery → On**. Caps charge at 85%. Done.

### Fire HD / older Android

No built-in option. You'll need to gate the charger via a smart
plug. broadsheet doesn't include this automation — set it up in
HA itself:

- Battery sensor: install the **Fully Kiosk Browser** HA
  integration (gives you `sensor.<tablet>_battery`).
- Charger plug: any Zigbee / WiFi smart plug.
- Automation: when battery hits 80%, turn plug off; when battery
  hits 40%, turn plug on. Safety kick: if telemetry stops for 30
  min, turn plug ON (covers "tablet crashed mid-discharge").

### iPad

Built-in. **Settings → Battery → Charging → Optimised Battery
Charging** + **Limit to 80%** (iOS 17+).

---

## Step 6 — When you change the page later

Saves are automatic — every edit you make in the broadsheet editor
debounces at 400ms and persists. The tablet picks up changes on
its next page load.

For tablets that should always show the very latest:
- Fully Kiosk has a periodic auto-reload (default off; turn on
  with a reasonable interval like 30 min if you edit often).
- Or use Fully Kiosk's `loadUrl` REST API from HA to force a
  reload after an automation.

---

## Common variants

### "Just the remote" — minimal TV wall

For a tablet next to the TV:

1. *"Living Room TV — full remote"*
2. *"Living Room TV — TMDB show & movie rows"* (if you have a key)
3. A couple of media-playback scenes
4. *"+ Section divider"* "Lights"
5. *"Living Room lights — panel"* (so you can dim during a movie)

That's it. Five blocks, designed for sofa-distance taps.

### "Hallway control" — entry-point tablet

For a Fire HD by the door:

1. *"Front Door — unlock"*
2. *"Front Door — status tile"* (so you can see lock state at a
   glance)
3. A camera snapshot tile (front porch)
4. *"+ Section divider"* "Light & heat"
5. *"Hallway lights — panel"*
6. *"All lights — off"* macro
7. *"All heating — off (5°)"* macro (for "leaving the house")

### "Kitchen sticky" — for a Nest Hub or wall iPad

Wide tablet near the cooker:

1. *"Show <sensor.kitchen_temperature>"*
2. *"Kitchen lights — panel"*
3. *"Activate Warm Evening"*
4. *"Kitchen TRV"* (atomic — single TRV in the kitchen)
5. A timer / countdown (use the Sparkline block on a timer
   sensor — advanced editor)

---

## Troubleshooting

### "I added the recipe but it doesn't render anything"

Most likely the entity it references is hidden in
`/settings/house` or hasn't been discovered yet. The recipe still
shows because broadsheet knew about the entity at recipe-
generation time. Check the area in `/settings/house`; un-hide if
needed.

### "The Galaxy Tab / Fire HD shows up as a media player"

It shouldn't — broadsheet filters them out of media surfaces (the
heuristic matches "galaxy tab", "fire hd", "ipad", "kiosk", "wall
pixel", and similar names + device models). If yours slips
through, the device model probably doesn't match the regex —
open an issue at https://github.com/alfiedennen/broadsheet/issues
with the device model from `/settings/house` so we can extend the
filter.

### "The kiosk URL works but the page looks wrong on the tablet"

Verify the **Wall device** preset matches the tablet's actual
native dimensions. The preview pane uses these dimensions; if
they're wrong, what you author won't match what renders.

### "Settings changes don't reach the tablet"

Saves are debounced ~400ms in the editor. After "✓ saved"
appears, the curation is persisted. The tablet still won't show
the change until its page reloads. Either:
- Pull-to-refresh on the tablet
- Use Fully Kiosk's auto-reload interval
- Trigger Fully Kiosk's `loadUrl` REST endpoint from HA when you
  publish

### "The whole addon doesn't show new versions after a CI push"

The HA Supervisor caches each addon repository's `config.yaml`.
After a new version is pushed to the addon repo + built by CI +
published to GHCR, you may need to force the store to re-read:

```bash
ssh root@homeassistant.local "ha store reload && ha addons update 68fa04fc_broadsheet"
```

`ha addons reload` (without "store") doesn't re-pull the remote —
use `ha store reload`. With `auto_update: true` the Supervisor
checks on its scheduled cadence (roughly daily); the manual
command picks up changes immediately.

See [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) for more.

---

## Where to go next

- **[`CUSTOM-PAGES-GUIDE.md`](CUSTOM-PAGES-GUIDE.md)** — full
  reference for every block type + the things-first browser
  shape + the advanced editor.
- **[`IMPORTER-GUIDE.md`](IMPORTER-GUIDE.md)** — if you have an
  existing Lovelace dashboard you want to bring across.
- **[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)** — operational
  gotchas, including the supervisor-cache + tablet-filter cases.
- **[`PLUGIN-AUTHOR-QUICKSTART.md`](PLUGIN-AUTHOR-QUICKSTART.md)**
  — if you want to write a plugin that contributes blocks.
