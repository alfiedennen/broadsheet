# For early testers

> broadsheet is in a small private soak — a few trusted Home Assistant
> users running it on real installs and telling me what breaks before
> it goes wider. If you're reading this, you're probably one of them.
> Thank you. Here's what to expect, and what's useful to send back.

---

## What's going on

broadsheet shipped its first installable add-on on 2026-05-13. The
codebase is days old, not months. The architecture and the eight core
surfaces have been thought through carefully; everything past that
hasn't soaked yet. Production = my (Alfie's) HA. That's it.

You're the difference between "works on one weird HA" and "works on
several real ones."

## What I'd love you to do

1. **Install it** alongside whatever your current frontend is. The
   add-on doesn't displace anything — both run in parallel. Install
   instructions in the [README](../README.md#install).
2. **Open the eight pages** (`/`, `/lights`, `/heat`, `/door`, `/tv`,
   `/body`, `/wall`, `/settings`) and let yourself react. Half-formed
   reactions are gold at this stage.
3. **Tell me what you noticed** — via
   [GitHub Issues](https://github.com/alfiedennen/broadsheet/issues) for
   anything that looks broken,
   [GitHub Discussions](https://github.com/alfiedennen/broadsheet/discussions)
   for everything else.

## What's stable vs what's fresh

| Area | Bake | Translation |
|---|---|---|
| Discovery (reading your HA) | Most-bake | Validated against my HA; novel device combos will surface things |
| The eight core pages | Mid-bake | Render-tested across the standard HA setups; novel cards / HACS pieces may not translate |
| Things-first wall builder | Mid-bake | Works for hallway-tablet sizes; sit-and-control layouts less tested |
| Lovelace importer | Mid-bake | Translation covers HA-native cards well; card-mod / mushroom / custom-HACS may need the embed fallback |
| `lovelace-embed` block | Least-bake | Shipped 2026-05-18 across six rapid iterations. The auth-injection and chrome-hide paths went live hours before your install |
| `/settings` (in-app curation) | Mid-bake | Most flows wired; some edge-case states render plainly |
| Plugins (`emanations`, `ghost-cloud`, `tmdb-tv`) | Mid-bake | All three implement the frozen contract; tmdb-tv needs your free TMDB key |

If something feels wrong but isn't crashing, **it's probably real and
worth flagging** — broadsheet's design choices are unusual enough that
"this isn't a bug but I expected X" is the single most useful signal.

## What I'd love to hear in particular

- **First-five-minutes texture.** What confused you on first install?
  What worked surprisingly well? What did you click that didn't
  respond?
- **The painting on `/`** — does it make sense? Does it tell you
  something? Does it feel like decoration or like information?
- **The `/wall` page on whatever tablet you have.** Sizing right?
  Tap targets right? Layout breakage?
- **The discovery story** — broadsheet should know your areas + people
  + devices without you telling it anything. Where does it get this
  wrong?
- **Lovelace import** if you have a dashboard you care about. What
  translated cleanly? What landed as markdown or empty?
- **Things you wanted to do but couldn't find.** Even if it's "I
  wanted X and gave up."

## What's known broken / known-shape

The honest list lives in
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) — worth a skim before filing.
The biggest known limits:

- **Lovelace embeds**: refreshing inside the iframe after tapping
  an HA view tab loses the embed (documented).
- **Per-user dashboards** aren't a thing yet — broadsheet renders the
  same surface for everyone in the household.
- **`aarch64` (Pi 4/5)** image builds in CI but hasn't been verified
  on hardware. If you're on a Pi, your report = my first ARM data
  point.
- **Browser support** is Chromium-tested. Firefox + Safari should
  mostly work; novel breakage is interesting.

## What to expect from me

- **Bug reports**: I'll triage within a few days. Real bugs get fixed
  in days; design questions might take a week of thinking.
- **Feedback** / Discussions: I'll engage but won't action everything.
  At T2 soak the goal is to *hear* feedback, not to ship every
  request — some asks land in the v0.2 backlog, some clarify what
  v0.1 should be.
- **No SLA.** This is a side project. I'll be quick when I can and
  honest when I can't.
- **Roughly weekly summary** in Discussions — what I heard, what I'm
  fixing, what I'm deferring + why. Sets the tone for when broadsheet
  goes more public.

## What's NOT useful right now

- **Code PRs against architecture.** The plugin contract is frozen
  for v0.1 (see [`docs/RENDERER-CONTRACT.md`](RENDERER-CONTRACT.md));
  the architecture I'm aiming for is in
  [`docs/PRODUCT-VISION.md`](PRODUCT-VISION.md). Tiny PRs for typo /
  doc / obvious bug fixes welcome anytime; larger refactors please
  chat first in Discussions.
- **"Add this card type" requests** for HA's complete Lovelace card
  ecosystem — the `lovelace-embed` block exists precisely so you can
  reach for it when translation isn't the right answer. Card-by-card
  translator coverage isn't where v0.1 is investing.
- **Promises this stays as-is**. v0.1 is locked-down on plugin
  contract + page set. Visual register and discovery shape may shift
  based on what I hear from you.

## How to file what

| You found… | File it as |
|---|---|
| A crash, wrong content, broken layout, unresponsive UI | [Issue → Bug report](https://github.com/alfiedennen/broadsheet/issues/new?template=bug_report.yml) |
| "This confused me", "this surprised me", "I expected X" | [Issue → Early-tester feedback](https://github.com/alfiedennen/broadsheet/issues/new?template=feedback.yml) |
| "broadsheet doesn't do X and I wish it did" | [Issue → Feature request](https://github.com/alfiedennen/broadsheet/issues/new?template=feature_request.yml) |
| "How do I…?" / "Has anyone tried…?" / general chat | [Discussions](https://github.com/alfiedennen/broadsheet/discussions) |
| You'd rather DM me | The address that invited you to test |

---

Thank you. Genuinely. Five days ago this was 3,000 commits I'd
written into the void; tonight there's a chance of it becoming
something a household-not-mine uses every day. That's because of you
spending half an evening on it.

— Alfie
