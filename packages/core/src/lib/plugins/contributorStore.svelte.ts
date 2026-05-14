/**
 * contributorStore.svelte.ts — the reactive stores discoveryContributor
 * outputs land in. Deliberately importless: both the discovery façade
 * (which exposes `discovery.plugins`) and the contributor runner (which
 * writes here) import this, and the runner also imports discovery — so
 * keeping the stores in their own importless module is what breaks the
 * cycle.
 */

/**
 * Per-plugin merged contributor output. A plugin's contributors run at
 * boot + on registry updates; their returned objects are Object.assign-
 * merged here under the plugin id. The discovery façade exposes this as
 * `discovery.plugins`, so a plugin reads its own slice via
 * `discovery.plugins[<id>]?.<key>`.
 */
export const pluginContributions = $state<Record<string, Record<string, unknown>>>({});

/**
 * Plugins whose contributor threw on the last run, keyed by plugin id →
 * human-readable reason. The loader factors this into `PluginStatus`:
 * a would-be-`active` plugin with an entry here becomes `errored`.
 */
export const contributorErrors = $state<Record<string, string>>({});
