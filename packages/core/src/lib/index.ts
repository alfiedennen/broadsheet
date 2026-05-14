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
 *  - P2 (settings + renderers) — `useRenderer`, `useCurationField`,
 *    `SettingsRow`.
 *  - P3 (contributors + assets) — `pluginAssetUrl`.
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
