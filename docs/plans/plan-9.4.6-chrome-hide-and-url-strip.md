# Plan — 0.9.4.6: hide HA chrome + strip /embed/ prefix in the iframe

**Status**: IMPLEMENTED 2026-05-18. Addon-side only (nginx sub_filter
injections); no SPA changes. Files shipped:

- `broadsheet-addon/broadsheet/nginx.conf.tpl` — two `sub_filter`
  directives on the `/embed/` location:
  1. `<script>` injected at top of `<head>` that runs
     `history.replaceState` to strip the `/embed/` prefix from the
     URL before HA's frontend boots.
  2. `<style id="broadsheet-embed-chrome-hide">` injected in the
     same substitution, hiding HA's chrome host elements
     unconditionally.
  Plus two infrastructure-shape changes required by sub_filter:
  - `proxy_set_header Accept-Encoding ""` to force upstream to
    return uncompressed HTML (sub_filter operates on plain text)
  - Removed `proxy_buffering off` — sub_filter requires buffered
    responses
- `broadsheet-addon/broadsheet/config.yaml` — version `0.9.4.5` →
  `0.9.4.6`.

---

**Status (pre-impl)**: LOCKED 2026-05-18 after 0.9.4.5 live-verified
the auth injection but Alfie surfaced the actual UX problem:

> Hmm, kind of useless though as we lose the broadsheet menu and
> the HA sidebar loads...

## Diagnosis

Two compounding root causes for "HA sidebar loads":

1. **URL prefix collision**. The `/embed/` proxy means the iframe
   loads at `http://homeassistant.local:8124/embed/wall-tablet?kiosk=true`.
   HA's frontend reads `window.location.pathname` on boot — sees
   `/embed/wall-tablet`, tries to resolve "embed" as a dashboard
   slug, can't, falls back to Overview. Wrong dashboard renders.
2. **Kiosk mode is dashboard-opt-in**. `?kiosk=true` is honoured by
   the kiosk-mode HACS plugin, which only loads on dashboards that
   declare `kiosk_mode:` in YAML. wall-tablet has it; Overview
   doesn't. Even if URL resolution worked, only configured
   dashboards would hide chrome.

The "lose the broadsheet menu" complaint is a verification artefact
— I tested via direct `/embed/<path>` URLs because there were no
existing broadsheet pages with embed blocks. In production usage
(broadsheet page with a lovelace-embed block), broadsheet's nav is
on the parent page outside the iframe and is unaffected. Worth
calling out in the response narrative but doesn't drive a fix.

## What 0.9.4.6 ships

Both fixes via nginx `sub_filter` on the `/embed/` location.
sub_filter rewrites the response body before sending to the browser.
We use it to inject content into HA's `<head>` HTML:

### 1. URL-prefix strip script

```html
<script>(function(){try{
  var p = location.pathname;
  if (p.indexOf("/embed/") === 0) {
    history.replaceState(
      null, "",
      p.replace(/^\/embed\//, "/") + location.search + location.hash
    );
  }
} catch (e) {}})();</script>
```

Runs synchronously at the top of `<head>`, BEFORE any HA frontend
script tags. Strips the `/embed/` prefix from the URL via
`history.replaceState`. HA frontend's router then reads the
stripped URL on boot and resolves the right dashboard.

Why classic synchronous script (not async, not module): we need
this to run BEFORE HA's boot scripts. Classic scripts in document
order block parser progression; async/module scripts defer. Top-of-
head classic script is the earliest possible execution.

`try/catch` wrap because we'd rather fail silent and fall through
to Overview than throw and break HA frontend boot.

### 2. Chrome-hide stylesheet

```html
<style id="broadsheet-embed-chrome-hide">
  ha-sidebar,
  app-header-layout app-header,
  ha-app-layout app-header,
  ha-panel-lovelace app-header,
  paper-tabs.toolbar,
  .header-bar,
  mwc-top-app-bar-fixed,
  ha-top-app-bar-fixed {
    display: none !important;
  }
  ha-app-layout app-main,
  ha-app-layout main,
  ha-panel-lovelace > div,
  #view {
    padding-top: 0 !important;
    margin-top: 0 !important;
  }
  ha-drawer {
    --mdc-drawer-width: 0 !important;
  }
  partial-panel-resolver,
  home-assistant-main {
    margin-left: 0 !important;
  }
</style>
```

Hides HA's chrome host elements at the document level. Targets
the broadest known set of HA chrome elements across versions
(older `app-header-layout`, newer `ha-app-layout`, Lovelace-
specific `ha-panel-lovelace app-header`, the view-tabs bar
`paper-tabs.toolbar`, modern Material `mwc-top-app-bar-fixed`).

Works because Custom Elements have their host element in the
LIGHT DOM — `display: none` on `<ha-sidebar>` (the host)
removes the whole shadow-rooted tree. We can't pierce shadow
DOM with document-level CSS, but we don't need to: hiding the
host is enough.

The padding/margin resets ensure the dashboard content fills
the iframe viewport (without these, the content would render in
the area where the chrome used to be, with empty space at top
and left).

### 3. Infrastructure shape changes

sub_filter has two constraints we have to honour:

- **Operates on plain text bodies only.** HA serves text/html
  gzip-compressed by default based on the request's
  `Accept-Encoding`. We `proxy_set_header Accept-Encoding ""`
  to force the upstream to send uncompressed responses that
  sub_filter can rewrite.
- **Requires buffered responses.** We had `proxy_buffering off`
  on the `/embed/` proxy (carried over from 0.9.4.3+4) because
  it's the default-safe choice for streaming proxies. Removed
  for 0.9.4.6 — HA's index.html is ~30 KB, fitting in nginx's
  default 8 KB × 8 buffer pool with no issue.

`sub_filter_once on` so we only substitute the first `<head>` tag
(if HA's HTML ever contained `<head>` literally elsewhere, we
wouldn't re-inject). `sub_filter_types text/html` to scope.

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Where to fix routing | nginx sub_filter (transparent body rewrite) | Addon-side; no HA-side config; no SPA changes; works for all dashboards |
| When to fix routing | At the iframe's initial HTML response | `history.replaceState` early in head means HA frontend reads the stripped URL on first router init |
| Script vs preconnect-rewrite vs base | Synchronous classic script in head | Earliest execution; classic scripts block parser; runs before HA's defer/module scripts |
| Style injection target | Light-DOM host elements | Document-level CSS can't pierce Shadow DOM; hosts are in light DOM; hiding host removes whole tree |
| Buffering | Re-enable (default) | sub_filter requires it; HA index.html is small enough |
| Compression | Force off via Accept-Encoding "" | sub_filter can't operate on gzipped bodies |
| Other proxy routes (`/static`, `/auth`, etc) | Unchanged | They serve assets/JSON; no HTML to rewrite |

---

## Out of scope

- **Refresh inside the iframe**. After HA pushState's a new view
  URL (e.g. user taps a view tab), the URL is `/wall-tablet/<view>`
  (no `/embed/` prefix). If the user refreshes the iframe, the
  browser sends a request to `/wall-tablet/<view>` directly. There
  is no `^~ /wall-tablet/` route on broadsheet; the catch-all
  SPA fallback returns broadsheet's index.html. The iframe then
  shows broadsheet's homepage instead of the wall-tablet
  dashboard.
  - Acceptable for the target use case (users navigate via
    broadsheet's parent-page nav, not within the iframe).
  - Mitigations considered + rejected:
    - Trap `pushState`/`replaceState` to re-add `/embed/` to the
      browser URL — would mean HA frontend sees the prefixed URL,
      defeating the whole point of the strip.
    - Universal `^~ /wall-tablet/` route — broadsheet would need
      to know every HA dashboard slug ahead of time; doesn't scale.
    - `<base href>` injection — HA frontend uses absolute paths
      in many places that bypass base, doesn't actually help.
  - Documented in TROUBLESHOOTING. Users navigate at the
    broadsheet level.
- **Per-dashboard chrome variations**. Some HA dashboards have
  custom headers (e.g. custom cards in a header section). Our
  CSS hides the standard `<app-header>` but not custom in-content
  headers. If a user wants those hidden, they configure the
  source dashboard with `kiosk_mode:` and the HACS plugin handles
  it. Our CSS is the broad-strokes baseline.
- **HA frontend version drift**. Selectors target HA's current
  chrome element tree. If HA renames an element in a future
  release, our selector misses + chrome shows. We add new
  selectors as drift surfaces.

---

## Companion to 0.9.4.5

0.9.4.5 made the iframe **boot authenticated** (no login screen)
+ asset paths resolve. 0.9.4.6 makes the booted page **look right**
(right dashboard renders, no HA chrome). Together the lovelace-
embed block ships at production quality: paste a path into the
block config, get a chrome-free render of the intended dashboard,
no user-side HA config needed.
