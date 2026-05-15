# Casting broadsheet to a display

How to put broadsheet on a Google Cast device (Nest Hub, Nest Hub
Max, Chromecast, Cast-enabled TV) — step by step.

This is the documented workaround for the rubric's gap P5-S5
(Cast / e-ink / non-standard surfaces). broadsheet doesn't ship a
dedicated Cast mode yet — but Cast is just a browser, so a small
amount of glue makes it work.

## What you'll need

- A Google Cast device (Nest Hub Max recommended — it's the
  largest target with a hard-stop screensaver dimming policy)
- A Home Assistant install with the **Google Cast** integration
  enabled (Settings → Devices & Services → Add Integration)
- broadsheet running as an HA add-on
- The HACS integration **continuously_casting_dashboards**
  (b0mbays/continuously_casting_dashboards) — this is what
  defeats the 10-minute Cast session timeout that otherwise
  drops your dashboard back to the Cast device's home screen
  every few minutes

## The recipe

### Step 1 — Install continuously_casting_dashboards via HACS

In HA: HACS → Integrations → Search "continuously_casting_dashboards" →
Install. Restart HA.

This integration polls the Cast device every ~30s; if it sees
your broadsheet URL has been kicked off the screen, it re-casts
automatically.

### Step 2 — Configure the Cast target

Edit `configuration.yaml`:

```yaml
continuously_casting_dashboards:
  logging_level: info
  cast_delay: 30
  start_time: "07:00"
  end_time: "23:00"
  devices:
    "Living Room Hub":  # Your Cast device's friendly name
      - dashboard_url: "/api/hassio_ingress/<YOUR_BROADSHEET_INGRESS_TOKEN>/"
        dashboard_state_name: "broadsheet"
```

To find your ingress token: open broadsheet from HA, look at the
URL in your browser. It's the long string between `hassio_ingress/`
and the next `/`. Cast tokens are stable across HA restarts but
don't share them publicly — they're effectively a session secret.

Restart HA after editing.

### Step 3 — Pick which broadsheet page to cast

For Cast displays you usually want a wider, less-interactive page
than your phone view. Two good options:

- **`/wall`** — broadsheet's built-in dense action grid, sized
  for tablet portrait. Works well on Cast.
- **A custom page** built from the **"Wall tablet morning"** preset
  (Settings → Pages → + New page → pick the Wall tablet morning
  preset). Author once, cast forever.

To cast a specific page, append the slug to the dashboard_url:

```yaml
dashboard_url: "/api/hassio_ingress/<TOKEN>/wall/"
```

### Step 4 — Cast device settings

On the Cast device itself (Nest Hub):
- Settings → Display → Photo Frame → set to **Off** (otherwise
  Google Photos will keep stealing the screen back)
- Display → Brightness → set adaptive or to a comfortable level
- Sleep → keep it as-is (the continuous casting wakes it as needed)

### Step 5 — Verify

Restart HA + wait 30s. The Cast device should show your broadsheet
view. If it doesn't, check `home-assistant.log` for
`continuously_casting_dashboards` errors (most commonly a wrong
device name or a malformed ingress URL).

## Limits

- **Cast displays don't accept touch input** the same way browser
  tabs do. Action tiles render but don't respond to remote clicks.
  This is fine for read-only / status-board pages but means Cast
  is best for the "wall calendar" use case, not the "wall
  controller" one.
- **The 10-minute timeout** is a hard Cast session limit Google
  enforces — `continuously_casting_dashboards` works around it by
  re-casting on a poll, so you'll see a brief flicker every
  ~10 minutes.
- **Connection indicator** appears bottom-right when broadsheet
  loses its WS connection — useful for confirming the cast is
  healthy.
- **No Nest Hub-specific UI affordances** — no swipe-to-dismiss,
  no Assistant integration. Cast just streams the browser frame.

## Alternative: a wall tablet instead of Cast

For interactive use cases (controlling lights / boosting heat /
toggling scenes from the wall), a cheap Android tablet running
Fully Kiosk Browser is a much better target than Cast. Fully
Kiosk lets you:

- Pin the broadsheet URL as the start screen
- Disable the navigation chrome (full-screen)
- Set a screensaver / wake-on-motion / dim-at-night policy
- Touch input works normally

The HACS integration **fully_kiosk** lets HA control the tablet
(brightness, screen on/off, current URL). See HA docs for setup.

## Troubleshooting

- **Cast device shows the HA login screen instead of broadsheet** —
  the ingress token has expired or the URL is wrong. Re-fetch
  the URL from broadsheet in your browser, restart HA.
- **Cast keeps dropping back to the Cast home screen** —
  `continuously_casting_dashboards` isn't running, isn't configured
  correctly, or the cast_delay is too high. Set `logging_level:
  debug` temporarily to see what it's doing.
- **Page renders but fonts look wrong** — Cast device hit Google
  Fonts request limits or your network blocked them. broadsheet
  falls back to Iowan / Georgia / system fonts; the look will be
  slightly different but functional.
- **Connection indicator stays "Reconnecting…" forever** — the
  Cast device's network might not see HA. Check the Cast device's
  WiFi network matches HA's.

## Future

A dedicated Cast render mode (compact header, no nav chrome,
auto-cycling between custom pages) is on the v0.2+ roadmap.
The current recipe gets you Cast working today; the dedicated
mode would make it nicer.
