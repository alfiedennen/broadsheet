/**
 * Internal surface of the plugin system — what core's own modules
 * (`+layout`, the `[pluginSlug]` route, KebabNav, `/settings/plugins`)
 * import. The PUBLIC surface plugins consume is `$lib/index.ts`
 * (`@broadsheet/core`).
 */

export type { BroadsheetPlugin, RegisteredPlugin, PluginStatus, PluginPage } from './types';
export { RESERVED_ROUTE_SLUGS } from './types';
export { BUNDLED_PLUGINS } from './registry';
export { pluginLoader, bootPlugins, type ActivePluginPage } from './loader.svelte';
