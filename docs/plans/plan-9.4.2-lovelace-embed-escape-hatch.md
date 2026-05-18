# Plan — 0.9.4.2: lovelace-embed escape hatch + honest import scoping

**Status**: IMPLEMENTED 2026-05-18. svelte-check clean (523 files,
0 errors, 0 warnings), 343 tests pass (+2 new), production build
clean. Files shipped:

- `packages/core/src/lib/blocks/types.ts` — `LovelaceEmbedBlockConfig`
  type, `lovelace-embed` added to `BlockDef` union,
  `defaultBlockConfig('lovelace-embed')` returns `{ url: '', height: 800 }`.
- `packages/core/src/lib/blocks/registry.ts` — lovelace-embed in
  CORE_REGISTRY + BLOCK_META.
- `packages/core/src/lib/blocks/renderers/LovelaceEmbedBlockRenderer.svelte`
  (NEW) — iframe at the user-provided URL, with placeholder when
  URL is empty + hint after 5s no-load timeout pointing at the
  TROUBLESHOOTING X-Frame-Options recipe. `color-scheme: dark light`
  so HA's theme renders consistently inside.
- `packages/core/src/lib/blocks/editor/ThingsCanvas.svelte` —
  inline editor for the embed block (URL + height + label) + new
  `+ Lovelace embed` footer button.
- `packages/core/src/routes/settings/pages/import/+page.svelte` —
  multi-view AND single-view dashboards both gain an "Embed the
  whole dashboard" tile on the pick-view step. Per-view "Embed
  instead" button next to each translated view in the picker
  list. New `embedMode` + `embedViewIdx` state + `pickEmbed`
  action + `embedHaUrl(dashUrlPath, viewIdx)` helper that
  composes `http://<host>:8123/<dashboard>/<view>?kiosk=true`.

Tests:
- `blocks.spec.ts` (+1): lovelace-embed in `ALL_BLOCK_TYPES`,
  default-config exercised (empty URL, 800px height).
- `fresh-curation.spec.ts`: block-type count bumped 19 → 20.

Docs:
- `CUSTOM-PAGES-GUIDE.md` — new "When translation works well vs
  when to embed" section + dedicated "Lovelace embed" reference
  + block-type table updated.
- `TROUBLESHOOTING.md` — new "Imported page is mostly markdown /
  dead labels" section pointing at the embed escape hatch + new
  "Lovelace embed shows blank" section with the HA-side
  X-Frame-Options config recipe.

Deferred (likely skipped):
- Chip-row coalescing → action-grid
- `custom:layout-card` + `custom:grid-layout` → broadsheet grid
- Mushroom-template-card without tap_action → state-pill thing
- `type: template` Lovelace card translator

Dogfood evidence is these wouldn't have bridged the wall-tablet
gap. Won't ship absent a specific user request from someone with
a simpler dashboard.

---

**Status (pre-impl)**: LOCKED 2026-05-17 after dogfood of 0.9.4.1's tabbed
multi-view import against a real card-mod-heavy wall-tablet
dashboard. After seeing every tab rendered, the verdict was honest:

> Wait a second, absolutely no to multi page creation from one
> lovelace page import, that defeats the entire purpose. […]
> Check all the tabs, we might need to admit defeat as really
> it's just not usable, what do you think?

Tab-by-tab assessment confirmed the diagnosis: 0/8 tabs were
usable as control surfaces, and the previously-planned 0.9.4.2
translator fixes (chip coalescing / grid-layout / mushroom
state-pill / type:template) would tidy specific symptoms but not
bridge the structural gap.

The structural gap is honest:

> The wall-tablet is built in card-mod + mushroom + custom HACS
> components. Those are not just card TYPES — they're an entire
> rendering language broadsheet doesn't speak. card-mod is
> CSS-injection on top of HA's Lovelace; mushroom is a tile-
> shaped visual register with its own primary/secondary/icon/
> colour stack; custom:room-presence-card is a stateful component
> with its own data pipeline. A static AST translator can't
> reproduce any of that.

The dashboards the translator handles well (51 tests passing)
are those built with HA's NATIVE primitives. Card-mod-heavy /
mushroom-heavy / HACS-heavy dashboards are at the other end of
the spectrum.

---

## What 0.9.4.2 ships

1. **`lovelace-embed` block** — a thin iframe to an HA Lovelace
   URL. One block, one config (URL + optional height + optional
   label). Perfect fidelity — it IS the original HA Lovelace
   rendering. The escape hatch for complex dashboards broadsheet
   can't translate cleanly.

2. **Import flow gains an "Embed this view (don't translate)"
   option** on the pick-view step. When the user knows a view
   is too custom-heavy to translate well, one tap creates a
   page with a single `lovelace-embed` block pointing at the
   source URL. Skips the translator entirely.

3. **"+ Lovelace embed" footer button** on the things-first
   canvas — for users who want to drop an embed into a hand-
   authored page (e.g. one tab is broadsheet-native, another
   embeds a complex HA Lovelace view).

4. **Honest docs**:
   - `CUSTOM-PAGES-GUIDE.md` gets a clear "When to translate vs
     when to embed" section.
   - `TROUBLESHOOTING.md` gets:
     - "Imported page is mostly markdown / dead labels" — what
       it means + the embed escape hatch
     - "Lovelace embed shows blank / X-Frame-Options" — how to
       configure HA's `http: use_x_forwarded_for` + Ingress to
       allow framing
   - Import flow's intro changes from "translates Lovelace cards
     into broadsheet primitives" to "best-effort translation
     for dashboards built with HA's native cards; for custom-
     heavy dashboards, the embed option preserves the original
     intact."

---

## What 0.9.4.2 does NOT ship

The four originally-planned translator-coverage fixes from the
older 0.9.4.2 scope are **deferred to 0.9.4.3** (or skipped
entirely). The dogfood evidence is that they wouldn't have made
the wall-tablet usable; the structural gap is the rendering-
language one, not the four card-type gaps. Real value to people
with simpler dashboards; low priority absent a user request.

- Coalesce chip rows into a single action-grid
- `custom:layout-card` + `custom:grid-layout` → grid block
- Mushroom-template-card without tap_action → state-pill thing
- `type: template` Lovelace card translator

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Block shape | One block per embed (iframe + URL + optional height + label) | Composable as a block — can sit inside a tab, a row, a grid. Honest about being a portal back to HA Lovelace. |
| Iframe source | User-provided URL (full URL, e.g. `http://homeassistant.local:8123/wall-tablet/home`) | No magic. Users can use `?kiosk=true` to suppress HA chrome. Cross-origin / X-Frame-Options is the user's HA config concern; we document the workaround. |
| Auto-embed on import | Per-view option ("Embed this view instead of translating") + a footer button on the canvas | Not the default — translation still leads. Embed is the explicit fallback for views the user knows are too custom-heavy. |
| Translator scope reposition | Be honest in docs: works for HA-native primitives; falls back for card-mod / mushroom / HACS-heavy | The 0.9.4.x ship taught us where the bar realistically is. Better to be honest than oversell. |
| Defer translator fixes | Yes, 0.9.4.3 (or skip) | Wall-tablet dogfood proves they wouldn't bridge the structural gap. Worth doing only if a simpler-dashboard user asks. |

---

## Worked example

User opens import flow, picks "Wall Tablet" (their card-mod-heavy
dashboard). Pick-view step shows:

```
┌──────────────────────────────────────────────────────────┐
│ Import all 8 views as one tabbed page                  ›  │
│ One broadsheet page · 8 tabs · chip-bar nav at the top   │
│ Tabs: Home · Heating · Door · Lights · Remote · …       │
└──────────────────────────────────────────────────────────┘
                          — Or —
┌──────────────────────────────────────────────────────────┐
│ Embed the whole dashboard (don't translate)            ›  │
│ One broadsheet page with the original HA Lovelace        │
│ embedded inline as an iframe. Perfect fidelity, zero    │
│ translation gaps. Use this if your dashboard uses lots  │
│ of card-mod / mushroom / custom HACS components.        │
└──────────────────────────────────────────────────────────┘
                          — Or —
            (single-view list as before)
            [✓ Embed this view (don't translate)] per row
```

Three tiers: tabbed-translation default → embed-the-whole-thing
fallback → per-view picker with embed-instead-of-translate option.
