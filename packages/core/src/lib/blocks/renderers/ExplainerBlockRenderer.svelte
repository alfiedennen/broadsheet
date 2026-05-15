<script lang="ts">
	/**
	 * ExplainerBlockRenderer — wraps the existing core Explainer in
	 * the block-renderer interface. Same inline-md syntax as the
	 * markdown block, but rendered with the muted-italic explainer
	 * register: a single paragraph, accent-bordered links, smaller
	 * size, intended as the page's footer prose.
	 */
	import { base } from '$app/paths';
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
			.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]*)\)/g, (_m, label, url) => {
				const href = url.startsWith('/') ? `${base}${url}` : url;
				return `<a href="${href}">${label}</a>`;
			})
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
