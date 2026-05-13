# broadsheet

> *Home Assistant, rendered as a magazine.*

A front-end for Home Assistant shaped like a publication. Italic
display serif. Newsreader body. Pages, not screens. Prose, not specs.

**Status: pre-v0.1 — under active development.** This README is a
placeholder. The full public pitch is being drafted at
[`docs/PUBLIC-README-DRAFT.md`](docs/PUBLIC-README-DRAFT.md) and will
become this README at v0.1.0 release.

---

## For developers

This is a pnpm workspace.

```sh
pnpm install
pnpm dev          # serve packages/core at http://localhost:5173
pnpm build        # build all packages
```

### Workspace layout

```
broadsheet/
├── packages/
│   ├── core/           # the SPA (@broadsheet/core)
│   ├── emanations/     # multi-person painting plugin
│   ├── ghost-cloud/    # radar event playback plugin
│   └── tmdb-tv/        # TMDB content rows plugin
├── apps/
│   └── addon/          # HA add-on packaging (Dockerfile, config.yaml, ...)
└── docs/               # design + build documentation
```

### Documentation

Read in this order before contributing:

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — three-layer design
2. [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) — milestones + scope guards
3. [`docs/DEV-ENVIRONMENTS.md`](docs/DEV-ENVIRONMENTS.md) — how to test safely
4. [`docs/DISCOVERY-CONTRACT.md`](docs/DISCOVERY-CONTRACT.md) — Layer 1 spec
5. [`docs/SETTINGS-SCHEMA.md`](docs/SETTINGS-SCHEMA.md) — `broadsheet.json` shape
6. [`docs/RENDERER-CONTRACT.md`](docs/RENDERER-CONTRACT.md) — plugin API
7. [`docs/ADDON-MOCK.md`](docs/ADDON-MOCK.md) — packaging
8. [`docs/SETTINGS-UI.md`](docs/SETTINGS-UI.md) — Settings screens

[`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) is the running journal of
decisions, fixes, and lessons as the build progresses.

### License

MIT — see [LICENSE](LICENSE).
