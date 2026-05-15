<script lang="ts">
	/**
	 * MarkdownBlockRenderer — prose with `{{entity_id}}` interpolation.
	 *
	 * Deliberately NOT a full markdown engine. Supports:
	 *   - Paragraphs (blank-line separated)
	 *   - **bold** *italic* `code`
	 *   - [link text](url)
	 *   - `{{entity.id}}` interpolation against discoveryStore.states
	 *
	 * Anything beyond this — tables, lists, code blocks, images —
	 * means the page wants a different primitive. Keeps the renderer
	 * tiny + the security model trivial (input is HTML-escaped before
	 * any inline syntax runs).
	 *
	 * Editorial register: body font, leading-snug, max-width 60ch so
	 * paragraphs don't sprawl across wide screens.
	 */
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import type { MarkdownBlockConfig } from '../types';

	let { config }: { config: MarkdownBlockConfig } = $props();

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

	/**
	 * Resolve `{{entity.id}}` substitutions FIRST against raw input
	 * (state values come pre-stringified, will get HTML-escaped in
	 * the next pass). Unknown entities pass through literally so
	 * authors notice typos.
	 */
	function interpolate(s: string): string {
		return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, id) => {
			const state = discoveryStore.states[id];
			if (!state) return `{{${id}}}`;
			return state.state ?? `{{${id}}}`;
		});
	}

	/** Tiny inline-markdown pass on already-HTML-escaped text. */
	function inlineMd(s: string): string {
		return (
			s
				// [text](url) — only http/https/relative paths to avoid
				// javascript: schemes; the URL is escaped inline already.
				// `[^)]*` (zero-or-more) so root href `(/)` still matches.
				.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]*)\)/g, '<a href="$2">$1</a>')
				// **bold**
				.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
				// *italic* — careful not to grab ** by re-running
				.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3')
				// `code`
				.replace(/`([^`]+)`/g, '<code>$1</code>')
		);
	}

	const html = $derived.by(() => {
		const interpolated = interpolate(config.body);
		const escaped = escapeHtml(interpolated);
		const paragraphs = escaped.split(/\n{2,}/);
		return paragraphs.map((p) => `<p>${inlineMd(p)}</p>`).join('\n');
	});
</script>

<!-- HTML is constructed from HTML-escaped input + a controlled
     inline-syntax pass. {@html} is safe under those constraints. -->
<div class="md-block">{@html html}</div>

<style>
	.md-block {
		color: var(--fg);
		font-family: var(--font-body);
		font-size: var(--text-body);
		line-height: var(--leading-snug);
		max-width: 60ch;
		margin: 0 0 var(--space-6);
	}

	.md-block :global(p) {
		margin: 0 0 var(--space-3);
	}

	.md-block :global(p:last-child) {
		margin-bottom: 0;
	}

	.md-block :global(a) {
		color: var(--accent);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		text-decoration: none;
		transition: border-color var(--ease-quick);
	}

	.md-block :global(a:hover) {
		border-bottom-color: var(--accent);
	}

	.md-block :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0 var(--space-1);
		background: var(--bg-card);
		border-radius: 2px;
	}

	.md-block :global(strong) {
		color: var(--accent);
		font-weight: 500;
	}

	.md-block :global(em) {
		color: var(--accent);
		font-style: italic;
	}
</style>
