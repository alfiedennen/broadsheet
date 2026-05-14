# Contributing to broadsheet

Issues, PRs, and screenshots of your install are all welcome. The
codebase is small and reasonably documented; this file gets you from
clone to a running local instance.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Repository layout

broadsheet is two repositories:

- **[`alfiedennen/broadsheet`](https://github.com/alfiedennen/broadsheet)**
  (this repo) — a pnpm workspace: the SPA and the plugin packages.
- **[`alfiedennen/broadsheet-addon`](https://github.com/alfiedennen/broadsheet-addon)**
  — the Home Assistant add-on packaging (Dockerfile, nginx config,
  sidecar, `config.yaml`). Its CI checks out this repo, builds the SPA,
  bundles it, and pushes multi-arch images to GHCR.

This repo's workspace:

```
broadsheet/
├── packages/
│   ├── core/           # the SPA (@broadsheet/core)
│   ├── emanations/     # multi-person painting plugin
│   ├── ghost-cloud/    # radar event playback plugin (The Long Take)
│   └── tmdb-tv/        # TMDB content rows plugin
└── docs/               # design + build documentation
```

The first-class plugins are `workspace:*` dependencies of `core` —
`core/src/lib/plugins/registry.ts` statically imports them, and that
is the *only* bundling-aware module in the codebase.

---

## Dev setup

A pnpm workspace. pnpm 11+ (the `packageManager` field pins the exact
version; corepack picks it up automatically).

```sh
pnpm install
pnpm --filter @broadsheet/core dev     # localhost:5173
pnpm --filter @broadsheet/core check   # svelte-check (typecheck)
pnpm --filter @broadsheet/core build   # static output in packages/core/build/
```

In dev mode the SPA talks to your HA over WebSocket with a long-lived
token — generate one in HA → Profile → Long-Lived Access Tokens, then
paste your HA URL + token into broadsheet's `/setup` form on first
load. Dev mode defaults to **read-only**; add `?allow-writes=true` to
the URL to enable service calls (and a visible warning banner appears).

The add-on bakes `packages/core/build/` into an nginx-fronted container
— there's no runtime dependency on Node or pnpm in production.

---

## Read these before contributing

In this order:

1. [`docs/PRODUCT-VISION.md`](docs/PRODUCT-VISION.md) — the north star:
   what broadsheet is *for*.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the three-layer
   design (registries → domain model → curation).
3. [`docs/DISCOVERY-CONTRACT.md`](docs/DISCOVERY-CONTRACT.md) — Layer 1
   spec: how broadsheet reads HA.
4. [`docs/SETTINGS-SCHEMA.md`](docs/SETTINGS-SCHEMA.md) — the
   `broadsheet.json` curation shape.
5. [`docs/RENDERER-CONTRACT.md`](docs/RENDERER-CONTRACT.md) — the
   **frozen** plugin API. Read this before writing a plugin.
6. [`docs/SETTINGS-UI.md`](docs/SETTINGS-UI.md) — the Settings screens.
7. [`docs/DEV-ENVIRONMENTS.md`](docs/DEV-ENVIRONMENTS.md) — how to test
   safely against a real HA.
8. [`docs/ADDON-MOCK.md`](docs/ADDON-MOCK.md) — add-on packaging.

[`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) is the running journal of
decisions, fixes, and lessons — the *why* behind the *what*. Skim it
when something seems oddly shaped; the reason is usually logged.

---

## Writing a plugin

The plugin contract (`packages/core/src/lib/plugins/types.ts`) is
**frozen at v0.1** — no field is removed and no new *required* field is
added within a semver-minor release. A plugin registers any of: pages,
renderers, a settings panel, static assets, discovery contributors.

The three first-class plugins are worked examples of distinct
contract-surface combinations:
- **emanations** — a page + a renderer + a settings panel + static
  assets + a discovery contributor (exercises everything).
- **ghost-cloud** — a page-only plugin with bundled static assets and
  a discovery contributor; no renderer slot, no settings panel.
- **tmdb-tv** — a renderer + a settings panel only; no page, no static
  assets, no contributor.

Two hard rules on a plugin's `index.ts`: no side effects at module-eval
time, and `import type` from `@broadsheet/core` only — never a runtime
import (core imports the plugin, so a runtime back-import cycles).

`docs/RENDERER-CONTRACT.md` is the full spec.

---

## Conventions

- **TypeScript strict.** `pnpm --filter @broadsheet/core check` must be
  clean before a PR.
- **Svelte 5 runes** throughout (`$state` / `$derived` / `$effect`).
- **The editorial register is the point.** New UI uses the design
  tokens in `packages/core/src/app.css` (the `--font-*`, `--space-*`,
  `--fg-*` families) — no hardcoded colours or font stacks.
- **Discovery, not configuration.** A new surface should render from
  what HA already exposes; curation is the escape hatch, not the
  setup step.
- Commits: imperative summary, the *why* in the body.

---

## License

MIT — see [LICENSE](LICENSE). Contributions are accepted under the same
license.
