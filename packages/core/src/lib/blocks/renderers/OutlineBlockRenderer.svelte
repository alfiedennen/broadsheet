<script lang="ts">
	/**
	 * OutlineBlockRenderer — wraps OutLine in the block-renderer
	 * interface. Trivial adapter; the section header lives in the
	 * existing component.
	 */
	import OutLine from '$lib/components/OutLine.svelte';
	import type { OutlineBlockConfig } from '../types';

	let { config }: { config: OutlineBlockConfig } = $props();
</script>

<OutLine label={config.label} />
