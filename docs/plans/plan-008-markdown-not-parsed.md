# Plan: BUG-008 — Markdown headers/emphasis render literal

**Severity**: BLOCKER
**Surface**: every Markdown block, both Lovelace-imported and
user-authored in the page builder.
**Symptom**: `# heading`, `**bold**`, `_italic_` render as literal
characters in the live page. `*italic*` works (asterisk italic is
implemented), `**bold**` works on clean input but fails on
real-world content (separate sub-bug).

## What we know (from investigation)

- Renderer: `packages/core/src/lib/blocks/renderers/MarkdownBlockRenderer.svelte`
  - L102-107 pipeline: `interpolate(body)` → `escapeHtml(...)` →
    `.split(/\n{2,}/)` → wrap `<p>...</p>` → `inlineMd(...)` →
    `{@html html}` at L112
  - `inlineMd` (L69-100) supports ONLY:
    - `![alt](url)` images
    - `[text](url)` links
    - `**bold**` via `/\*\*([^*]+)\*\*/g`
    - `*italic*` via `/(^|[^*])\*([^*]+)\*([^*]|$)/g`
    - `` `code` ``
  - Doc-comment L6-9: "Deliberately NOT a full markdown engine."
- Importer correctly emits raw markdown bodies (no pre-escaping):
  `packages/core/src/lib/lovelace/translate.ts:70-84`
- Jinja layer is innocent: `lib/jinja/index.ts:1-60` only consumes
  `{{ }}` and `{% %}`; markdown chars pass through.
- Zero markdown deps in `packages/core/package.json`.

## Root cause

**Two distinct bugs masquerading as one:**

### 8a — `#`/`##`/`###` and `_..._` render literal (BY DESIGN)

The hand-rolled `inlineMd` deliberately omits headings + underscore
italics. This is documented but not surfaced anywhere users see
(neither the editor's helper text nor the rendered output explains
it). User-authored `# Heading` and imported `# Schedule today` both
hit this gap.

### 8b — `**bold**` rendering literal in real content (UNCONFIRMED — SUSPECT)

The bold regex `/\*\*([^*]+)\*\*/g` IS correct on clean input. My
F4 test input was:

```
Washer **{{...attributes.machine_status | default('idle')}}**, ...
```

After Jinja eval: `Washer **idle**, ...` — should match the bold
regex and render `<strong>idle</strong>`. Live screenshot showed
"Washer idle" with NO visual bold weight. Possible explanations:
1. The bold regex IS running but the theme's `<strong>` style is so
   subtle it's invisible in the screenshot
2. `interpolate()` resolves the Jinja BEFORE the bold regex runs,
   but the Jinja-resolved string is then concatenated with `**` in
   a way that doesn't form a valid bold pair (e.g. whitespace breaks)
3. The block's `body` field in the editor has the `**`s stored as
   `\*\*` (escaped) due to a textarea round-trip

Need to confirm 8b via console probe before writing the fix.

## Fix plan

### Step 1 — confirm 8b root cause (10 min)

In a probe page on the canary, set body to literal `**bold** test`
(no Jinja), inspect the rendered HTML via `document.querySelector('.block-markdown').innerHTML`. Three outcomes:
- Renders `<strong>bold</strong> test` → 8b is theme-not-styling
  `<strong>` (CSS fix, 1 line)
- Renders `**bold** test` → bold regex isn't running (renderer
  skipped on this block-type variant?)
- Renders `\*\*bold\*\* test` → editor double-escapes (textarea
  → state mutator strips/escapes asterisks)

### Step 2 — pick the markdown surface

Two options for fixing 8a:

**Option A: tiny extension (~15 lines, no deps)** — keep the
hand-rolled renderer, add three rules:
1. Block-level heading rule applied BEFORE paragraph wrapping:
   ```ts
   // process headings first, line by line
   const headingRule = /^(#{1,6})\s+(.+)$/gm;
   text = text.replace(headingRule, (_, hashes, content) =>
     `<h${hashes.length}>${escapeHtml(content)}</h${hashes.length}>`
   );
   ```
2. Underscore italic alongside asterisk italic:
   ```ts
   /(^|[^_])_([^_]+)_([^_]|$)/g → '$1<em>$2</em>$3'
   ```
3. Skip paragraph wrapping for lines that already became `<h1-6>`.

Pros: zero new dependencies, security model unchanged (escapeHtml
still runs first), tiny diff.
Cons: still won't support lists, blockquotes, tables — users will
hit the next missing-feature gap.

**Option B: swap to a real parser (~60 lines, +1 dep)** — install
`marked` (16KB gzipped, popular, secure-by-default), pipe `interpolate(body)` through it, drop hand-rolled `inlineMd` +
`escapeHtml`:
```ts
import { marked } from 'marked';
const html = marked.parse(interpolate(config.body), { breaks: true });
```
Need a sanitizer pass since marked allows raw HTML by default. Use
DOMPurify (~22KB) or marked's renderer hook to strip dangerous tags.

Pros: full markdown support, lower future-bug-rate.
Cons: ~38KB gzipped extra in the bundle, need to vet sanitization,
breaks the "small surface, all readable" docstring claim.

**My recommendation: Option A for v0.1.0**, swap to Option B in
v0.2 when we can do it carefully with bundle-size budget + security
review. Option A clears BUG-008 in 30 min; Option B is a half-day +
audit.

### Step 3 — surface the limitation honestly

Whichever option, update the Markdown block's editor helper text
(line ~440 of `routes/settings/pages/[slug]/+page.svelte` or in the
block-meta description) to say what's supported:

> Supports `**bold**`, `*italic*` or `_italic_`, `` `code` ``,
> `[link](/path)`, `![alt](url)`, and `# Heading` to `###### Heading`.

Strip the misleading "supports markdown" generality.

### Step 4 — fix 8b based on Step 1 outcome

Most likely fix: 1-line CSS change in the markdown renderer's
scoped style, OR remove the editor's textarea-side escape if that's
the culprit.

### Step 5 — importer placeholder for unknown emphasis

When the importer encounters a Lovelace markdown card with content
the renderer can't fully express (e.g. tables, blockquotes), emit a
PARTIAL coverage note saying so. This stops users blaming
broadsheet for a Lovelace card with content broadsheet supports
only the inline subset of.

## Test fixture

```ts
// packages/core/tests/unit/markdown-renderer.spec.ts
test.each([
  ['# Heading 1', '<h1>Heading 1</h1>'],
  ['## Heading 2', '<h2>Heading 2</h2>'],
  ['**bold** word', '<p><strong>bold</strong> word</p>'],
  ['*italic*', '<p><em>italic</em></p>'],
  ['_italic_', '<p><em>italic</em></p>'],
  ['plain', '<p>plain</p>'],
])('renders %j → %j', (input, expected) => {
  expect(renderMarkdown(input)).toBe(expected);
});

// HTML escaping must still run first
test('escapes raw HTML in headings', () => {
  expect(renderMarkdown('# <script>alert(1)</script>'))
    .toBe('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>');
});
```

Add to `tests/integration/importer-coverage.spec.ts` an assertion
that imported markdown cards with `# Heading` lines render with
`<h1-6>` tags.

## Files touched

- `packages/core/src/lib/blocks/renderers/MarkdownBlockRenderer.svelte` — extend `inlineMd` per Option A; add heading rule
- `packages/core/src/lib/blocks/registry.ts` (BLOCK_META[markdown].description) — update help text
- `packages/core/src/routes/settings/pages/[slug]/+page.svelte` — update editor placeholder text
- `packages/core/tests/unit/markdown-renderer.spec.ts` — NEW
- (possibly) `packages/core/src/lib/lovelace/translate.ts` — emit PARTIAL note when imported markdown contains unsupported syntax (blockquote, list, table)

Estimated total: **30 min Option A + 30 min tests + 10 min for the
8b sub-bug = ~70 min**.

## Open questions for you

1. Option A (tiny extension) or Option B (marked + DOMPurify)? My
   strong vote is A for v0.1.0 — preserves the "no big deps"
   posture.
2. Should we add lists (`- item`) and blockquotes (`> quote`) too,
   or hold them for v0.2? My vote: HOLD; users who need full
   markdown have Lovelace.
3. OK to ship Option A AS THE FIX even if 8b's `**bold**` issue
   turns out to be a separate CSS bug? They share a renderer file.
