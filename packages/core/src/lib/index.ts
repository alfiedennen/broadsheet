/**
 * Public exports of `@broadsheet/core` — the surface plugin packages
 * consume via `import … from '@broadsheet/core'`.
 *
 * Resolution: `package.json → exports` points here. Plugin packages
 * `import type` from this barrel; the types are erased at compile so
 * there is no runtime dependency from a plugin back into core (see
 * the FROZEN note in `./plugins/types.ts`).
 *
 * Export surface grows by build phase:
 *  - P0 (contract freeze)  — the plugin contract types + the
 *    discovery domain types the contract references. ← we are here
 *  - P1 (loader + routing) — `discovery` singleton, UI primitives
 *    (`PageShell`, `Hero`, `Eyebrow`, `OutLine`).
 *  - P2 (settings + renderers) — `useRenderer`.
 *  - P3 (static-asset pipeline) — `pluginAssetUrl`.
 *  - P4 (settings panels + discovery contributors) — `useCurationField`,
 *    `SettingsRow`, and the discoveryContributor runtime, all landing
 *    with emanations as their proving consumer.
 */

export const VERSION = '0.1.0';

/* ── Plugin contract (P0) ────────────────────────────────────────── */
export type {
	BroadsheetPlugin,
	PluginPage,
	PluginRenderers,
	PluginSettingsPanel,
	DiscoveryContributor,
	DiscoveryContributorContext,
	PluginActivationContext,
	PluginDiscoverySnapshot,
	PluginStatus,
	RegisteredPlugin,
	LazyComponent
} from './plugins/types';
export { RESERVED_ROUTE_SLUGS } from './plugins/types';

/* ── Discovery domain types the contract references (P0) ─────────── */
export type { DomainArea, DomainEntity, DomainFloor, DomainPerson, PageSlug } from './discovery';

/* ── HA primitives a plugin's components may need (P0) ───────────── */
export type { State } from './ha/types';

/* ── Runtime surface for plugin pages + components (P1) ──────────── */
// The reactive discovery façade. Plugin pages read `discovery.areas`,
// `discovery.persons`, etc. — never core internals.
export { discovery } from './discovery';
// Editorial layout primitives. Plugin pages compose with the same
// shell as core pages, so they inherit the register for free.
export { default as PageShell } from './components/PageShell.svelte';
export { default as Hero } from './components/Hero.svelte';
export { default as Eyebrow } from './components/Eyebrow.svelte';
export { default as OutLine } from './components/OutLine.svelte';
export { default as Explainer } from './components/Explainer.svelte';
export { default as PresenceCards } from './components/PresenceCards.svelte';
export type { PresenceCard } from './components/PresenceCards.types';

/* ── Renderer hook for plugin-aware core pages (P2) ──────────────── */
// `useRenderer(id)` returns a plugin's renderer component when its
// plugin is active, else null — so a core page can opportunistically
// upgrade to a plugin renderer with its own fallback.
export { useRenderer } from './plugins/renderers.svelte';

/* ── Plugin static-asset URL resolver (P3) ───────────────────────── */
// `pluginAssetUrl(id, path)` resolves a plugin's bundled static asset
// to a URL that works under HA Ingress and direct serving alike.
export { pluginAssetUrl } from './plugins/assets';

/* ── Plugin DATA — user-uploaded persistent files (P5) ───────────── */
// `pluginDataUrl(id, filename)` mirrors `pluginAssetUrl` but resolves
// to /plugin-data/<id>/<filename> — the addon's persistent /data/
// volume, where files uploaded via `uploadPluginData()` land. Survives
// add-on updates. emanations is the proving consumer (per-room +
// per-person paintings); the API is generic so any plugin can use it.
export { pluginDataUrl } from './plugins/assets';
export {
	listPluginData,
	uploadPluginData,
	deletePluginData,
	type PluginDataFile,
	type PluginDataUploadResult
} from './plugins/pluginData';

/* ── Settings-panel surface for plugin config UIs (P4) ───────────── */
// A plugin's `settingsPanel` component binds curation fields with
// `useCurationField` and lays them out with `SettingsRow`.
export { useCurationField } from './curation/store.svelte';
export { default as SettingsRow } from './components/SettingsRow.svelte';
// Theme H: inline-pin primitive + hash-navigate helper. Plugins use
// InlinePin to surface "this was auto-decided" affordances on their
// own pages/renderers; wireHashHighlight is for settings surfaces
// that should flash the right row when a navigate-with-context link
// arrives. Spec: docs/plans/plan-theme-H-inline-overrides.md
export { default as InlinePin } from './components/InlinePin.svelte';
export { wireHashHighlight } from './utils/hashNavigate';

/* ── HA connection surface (for plugins that need WS access) ─────── */
// Most plugins read state via discovery + curation. The @broadsheet/voice
// substrate needs WS-level access to discover HA's assist_pipeline +
// conversation agents + TTS engines, AND to drive conversation/process
// + tts/get_url calls at runtime. Exporting the connection accessor here
// keeps the access path explicit + documented; plugin lazy-thunk
// components import it; plugin index.ts files MUST NOT (per
// import-type-only rule for the eager-loaded plugin object).
export { getConnection } from './ha/client';
export { audit } from './ha/audit';
