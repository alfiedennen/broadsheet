<script lang="ts">
	/**
	 * ExplainerBlockRenderer — wraps the existing core Explainer in
	 * the block-renderer interface. Same inline-md syntax as the
	 * markdown block, but rendered with the muted-italic explainer
	 * register: a single paragraph, accent-bordered links, smaller
	 * size, intended as the page's footer prose.
	 */
	import Explainer from '$lib/components/Explainer.svelte';
	import type { ExplainerBlockConfig } from '../types';

	let { config }: { config: ExplainerBlockConfig } = $props();

	const HTML_ESCAPE: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	};
	function escapeHtml(s: string): string {
		return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]!);
	}

	function inlineMd(s: string): string {
		return s
			.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)/g, '<a href="$2">$1</a>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3');
	}

	const html = $derived.by(() => {
		const escaped = escapeHtml(config.body);
		return inlineMd(escaped);
	});
</script>

<Explainer>
	{@html html}
</Explainer>
