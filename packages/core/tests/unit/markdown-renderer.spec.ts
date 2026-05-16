/**
 * @vitest-environment jsdom
 *
 * MarkdownBlockRenderer parsing + sanitization contract.
 *
 * Regression test for BUG-008 — the previous hand-rolled inline-only
 * renderer dropped `#` headings and `_italic_` to literal characters.
 * Now that we ship marked + DOMPurify, the contract is:
 *
 * 1. CommonMark + GFM features render correctly (headings, lists,
 *    emphasis, links, tables, blockquotes, code, strikethrough).
 * 2. XSS-attempting input is stripped (script tags, event handlers,
 *    javascript: URLs).
 * 3. Allowlisted attributes only — href/src/alt/title/loading.
 *
 * The pipeline lives inside MarkdownBlockRenderer.svelte; this test
 * exercises an extracted pure function with the same dependencies so
 * we don't need a Svelte test runner.
 */

import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Mirror the renderer's config — keep these in sync with
// MarkdownBlockRenderer.svelte.
marked.setOptions({ gfm: true, breaks: true });
const SANITIZE_CONFIG = {
	ALLOWED_TAGS: [
		'p', 'br', 'strong', 'em', 'a', 'code', 'pre',
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'ul', 'ol', 'li',
		'blockquote', 'hr', 'img',
		'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del'
	],
	ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'loading'],
	ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/(?!\/)|#)/i
};

// Mirror the renderer's belt-and-braces URL scheme hook
const UNSAFE_URL_SCHEMES = /^(data|javascript|vbscript|file):/i;
DOMPurify.addHook('uponSanitizeAttribute', (_node, hookEvent) => {
	if (
		(hookEvent.attrName === 'src' || hookEvent.attrName === 'href') &&
		UNSAFE_URL_SCHEMES.test(hookEvent.attrValue.trim())
	) {
		hookEvent.keepAttr = false;
	}
});

function render(input: string): string {
	const parsed = marked.parse(input, { async: false }) as string;
	return DOMPurify.sanitize(parsed, SANITIZE_CONFIG);
}

describe('markdown headings', () => {
	it('renders # as h1', () => {
		expect(render('# Title')).toContain('<h1>Title</h1>');
	});
	it('renders ## as h2', () => {
		expect(render('## Subtitle')).toContain('<h2>Subtitle</h2>');
	});
	it('renders ### through ###### as h3-h6', () => {
		expect(render('### h3')).toContain('<h3>h3</h3>');
		expect(render('###### h6')).toContain('<h6>h6</h6>');
	});
});

describe('markdown emphasis', () => {
	it('renders **bold** as <strong>', () => {
		expect(render('**foo**')).toContain('<strong>foo</strong>');
	});
	it('renders *italic* as <em>', () => {
		expect(render('*foo*')).toContain('<em>foo</em>');
	});
	it('renders _italic_ as <em>', () => {
		expect(render('_foo_')).toContain('<em>foo</em>');
	});
	it('renders __bold__ as <strong>', () => {
		expect(render('__foo__')).toContain('<strong>foo</strong>');
	});
	it('renders ~~strike~~ as <del>', () => {
		expect(render('~~foo~~')).toContain('<del>foo</del>');
	});
});

describe('markdown lists + blockquotes', () => {
	it('renders unordered list', () => {
		const out = render('- one\n- two\n- three');
		expect(out).toContain('<ul>');
		expect(out).toContain('<li>one</li>');
		expect(out).toContain('<li>three</li>');
	});
	it('renders ordered list', () => {
		const out = render('1. first\n2. second');
		expect(out).toContain('<ol>');
		expect(out).toContain('<li>first</li>');
	});
	it('renders blockquote', () => {
		expect(render('> a quote')).toContain('<blockquote>');
	});
});

describe('markdown links + code', () => {
	it('renders inline links', () => {
		expect(render('[text](https://example.com)')).toContain(
			'<a href="https://example.com">text</a>'
		);
	});
	it('renders inline code', () => {
		expect(render('`foo`')).toContain('<code>foo</code>');
	});
	it('renders code blocks', () => {
		expect(render('```\nfoo\n```')).toContain('<pre>');
	});
});

describe('XSS hardening', () => {
	it('strips script tags', () => {
		const out = render('<script>alert(1)</script>');
		expect(out).not.toContain('<script');
		expect(out).not.toContain('alert');
	});
	it('strips iframes', () => {
		const out = render('<iframe src="evil.html"></iframe>');
		expect(out).not.toContain('<iframe');
	});
	it('strips onclick / onerror handlers', () => {
		const out = render('<img src=x onerror=alert(1)>');
		expect(out).not.toContain('onerror');
	});
	it('strips javascript: URLs in links', () => {
		// eslint-disable-next-line no-script-url
		const out = render('[click](javascript:alert(1))');
		expect(out).not.toContain('javascript:');
	});
	it('strips data: URLs in img src', () => {
		const out = render('![x](data:text/html,<script>alert(1)</script>)');
		expect(out).not.toContain('data:');
	});
	it('keeps http + https + relative + mailto + tel URLs', () => {
		expect(render('[a](http://x.com)')).toContain('href="http://x.com"');
		expect(render('[b](https://x.com)')).toContain('href="https://x.com"');
		expect(render('[c](/relative)')).toContain('href="/relative"');
		expect(render('[d](mailto:x@y.com)')).toContain('href="mailto:x@y.com"');
		expect(render('[e](tel:+44)')).toContain('href="tel:+44"');
	});
});

describe('GFM features', () => {
	it('renders tables', () => {
		const out = render('| a | b |\n|---|---|\n| 1 | 2 |');
		expect(out).toContain('<table>');
		expect(out).toContain('<th>a</th>');
		expect(out).toContain('<td>1</td>');
	});
	it('autolinks bare URLs', () => {
		const out = render('https://example.com');
		expect(out).toContain('href="https://example.com"');
	});
});

describe('escapes raw HTML in headings (no double-render of attacks)', () => {
	it('# <script>alert(1)</script> renders as escaped heading body', () => {
		const out = render('# <script>alert(1)</script>');
		expect(out).not.toContain('<script');
		// the heading itself is allowed
		expect(out).toContain('<h1>');
	});
});
