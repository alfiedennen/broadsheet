<script lang="ts">
	/**
	 * MarkdownBlockRenderer — prose with `{{entity_id}}` interpolation.
	 *
	 * Pipeline:
	 *   1. interpolate(body) — resolves `{{entity.id}}` shorthand + Jinja
	 *      templates against discoveryStore.states
	 *   2. marked.parse(...) — full CommonMark + GFM (headings, lists,
	 *      tables, blockquotes, code blocks, emphasis, links)
	 *   3. DOMPurify.sanitize(...) — strips any user-injected HTML that
	 *      could XSS (script tags, event handlers, javascript: URLs).
	 *      Only an allowlisted subset of tags survives.
	 *
	 * Relative URLs (starting with /) get the SvelteKit `base` prefix
	 * applied AFTER sanitize, so links work under the HA Ingress
	 * `/api/hassio_ingress/<token>/` mount point.
	 *
	 * Replaces a hand-rolled inline-only renderer (BUG-008): users who
	 * typed `# Heading` or `_italic_` got literal characters because the
	 * old surface was Deliberately Tiny. Now they get rendered headings.
	 */
	import { base } from '$app/paths';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { render as renderJinja, looksLikeJinja } from '$lib/jinja';
	import type { MarkdownBlockConfig } from '../types';

	let { config }: { config: MarkdownBlockConfig } = $props();

	// marked: enable GFM (tables, strikethrough, autolink) + breaks (single
	// newline → <br/> matches editorial expectation that one line is one
	// thought). Disable mangle/headerIds — they require DOM access we
	// don't need + bloat the output.
	marked.setOptions({
		gfm: true,
		breaks: true
	});

	/**
	 * Resolve template substitutions BEFORE the markdown pass. Two
	 * stages:
	 *
	 *   1. Legacy shorthand `{{entity.id}}` (a single entity_id with
	 *      no parens, no spaces, no operators). Direct state lookup.
	 *      Authored as broadsheet's own register; pass-through if no
	 *      such entity so authors notice typos.
	 *   2. Jinja-subset evaluator (lib/jinja). Handles HA-style
	 *      templates: `{{ states('entity_id') }}`, `{% if %}` blocks,
	 *      `{% set %}` bindings, common filters. Lovelace
	 *      mushroom-template-card content lands here.
	 *
	 * The legacy shorthand runs FIRST so `{{light.living_room}}`
	 * (which Jinja would parse as `light.living_room` member access)
	 * still resolves the obvious way.
	 */
	function interpolate(s: string): string {
		// Stage 1: legacy {{entity.id}} → state value
		const stage1 = s.replace(/\{\{\s*([a-z_]+\.[a-z0-9_.]+)\s*\}\}/g, (_, id) => {
			const state = discoveryStore.states[id];
			if (!state) return `{{${id}}}`;
			return state.state ?? `{{${id}}}`;
		});
		// Stage 2: Jinja eval (only if remaining content has Jinja syntax)
		if (!looksLikeJinja(stage1)) return stage1;
		return renderJinja(stage1, {
			stateLookup: (id: string) => discoveryStore.states[id]
		});
	}

	// DOMPurify config — allowlist what the editorial register supports.
	// Notable exclusions: <script>, <iframe>, <object>, <embed>, event
	// handler attrs (onload/onclick/etc), javascript: URLs, data: URLs.
	const SANITIZE_CONFIG = {
		ALLOWED_TAGS: [
			'p',
			'br',
			'strong',
			'em',
			'a',
			'code',
			'pre',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'ul',
			'ol',
			'li',
			'blockquote',
			'hr',
			'img',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td',
			'del'
		],
		ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'loading'],
		// Block dangerous URL schemes. Allowed: http(s), mailto, tel,
		// relative paths. Note: ALLOWED_URI_REGEXP applies to anchor href
		// reliably but img src needs the hook below for belt-and-braces.
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/(?!\/)|#)/i
	};

	// Belt-and-braces: explicitly nuke any src/href with data:, javascript:,
	// vbscript:, or file: schemes. DOMPurify's ALLOWED_URI_REGEXP catches
	// most cases but img src has historically been a soft spot.
	const UNSAFE_URL_SCHEMES = /^(data|javascript|vbscript|file):/i;
	DOMPurify.addHook('uponSanitizeAttribute', (_node, hookEvent) => {
		if (
			(hookEvent.attrName === 'src' || hookEvent.attrName === 'href') &&
			UNSAFE_URL_SCHEMES.test(hookEvent.attrValue.trim())
		) {
			hookEvent.keepAttr = false;
		}
	});

	/**
	 * Apply SvelteKit `base` prefix to relative URLs. Runs AFTER sanitize
	 * because DOMPurify normalizes attribute values; doing it pre-sanitize
	 * could leave unprefixed URLs in the output if sanitize strips/restyles.
	 */
	function rewriteRelativeUrls(html: string): string {
		if (!base) return html;
		return html
			.replace(/href="(\/[^"]*)"/g, `href="${base}$1"`)
			.replace(/src="(\/[^"]*)"/g, `src="${base}$1"`);
	}

	const html = $derived.by(() => {
		const interpolated = interpolate(config.body);
		const parsed = marked.parse(interpolated, { async: false }) as string;
		const sanitized = DOMPurify.sanitize(parsed, SANITIZE_CONFIG);
		return rewriteRelativeUrls(sanitized);
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

	.md-block :global(img) {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: var(--radius-card);
		border: 1px solid var(--rule);
		margin: var(--space-3) 0;
	}
</style>
