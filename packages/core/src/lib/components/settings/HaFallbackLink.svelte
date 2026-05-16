<script lang="ts">
	/**
	 * HaFallbackLink — "Open in HA →" link with target=_top.
	 *
	 * The escape hatch every settings surface needs. Drops the user out
	 * of broadsheet's ingress iframe (target=_top) into HA's own UI for
	 * the unusual flow this surface doesn't render natively (initial
	 * integration setup wizards, advanced YAML, debug snapshots).
	 *
	 * target=_top is mandatory — without it the click happens INSIDE
	 * the ingress iframe and HA's frontend can't navigate cleanly.
	 *
	 * Spec: docs/plans/plan-ha-settings-native-uis.md (P7-S5).
	 */

	let {
		path,
		label = 'Open in HA →'
	}: {
		/** HA path to open. Always absolute, starts with / (e.g. /config/integrations) */
		path: string;
		label?: string;
	} = $props();
</script>

<a class="ha-fallback" href={path} target="_top" rel="noopener">
	{label}
</a>

<style>
	.ha-fallback {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		transition: border-color var(--ease-quick);
	}

	.ha-fallback:hover {
		border-bottom-color: var(--accent);
	}
</style>
