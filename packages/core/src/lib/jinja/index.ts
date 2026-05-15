/**
 * Tiny Jinja-subset evaluator for Lovelace template content.
 *
 * Scoped to the patterns common in mushroom-template-card and
 * similar HA cards:
 *   - `{{ expression }}` — evaluate + interpolate
 *   - `{% set var = expr %}` — local variable assignment
 *   - `{% if cond %}...{% elif %}...{% else %}...{% endif %}` —
 *     conditional rendering
 *
 * NOT a full Jinja2:
 *   - No `{% for %}` loops (yet)
 *   - No macros, blocks, includes, extends
 *   - No custom filter authoring (5 built-in: upper, lower, title,
 *     round, default)
 *   - Limited operator set
 *
 * HA built-in functions exposed:
 *   - states(entity_id) → string state value
 *   - state_attr(entity_id, attr) → attribute value
 *   - is_state(entity_id, value) → boolean
 *
 * Errors are SWALLOWED — a broken template renders the original
 * source text rather than crashing the page. The MarkdownBlockRenderer
 * catches its own evaluation errors with the same fallback.
 *
 * Usage:
 *   render(template, { states: stateLookup, ...locals })
 */

import type { State } from '$lib/ha/types';

export interface JinjaContext {
	/** Lookup function for the `states('entity_id')` HA function. */
	stateLookup?: (id: string) => State | undefined;
	/** Plain variables addressable as `{{ varname }}`. */
	[key: string]: unknown;
}

/* ── Tokenizer ─────────────────────────────────────────────────────── */

type Token =
	| { kind: 'text'; value: string }
	| { kind: 'expr'; src: string }
	| { kind: 'stmt'; src: string };

function tokenize(src: string): Token[] {
	const out: Token[] = [];
	let i = 0;
	let textBuf = '';

	while (i < src.length) {
		// Look for {{ or {%
		if (src[i] === '{' && src[i + 1] === '{') {
			if (textBuf) {
				out.push({ kind: 'text', value: textBuf });
				textBuf = '';
			}
			const end = src.indexOf('}}', i + 2);
			if (end < 0) {
				// Unterminated; treat rest as text
				textBuf += src.slice(i);
				i = src.length;
				continue;
			}
			out.push({ kind: 'expr', src: src.slice(i + 2, end).trim() });
			i = end + 2;
			continue;
		}
		if (src[i] === '{' && src[i + 1] === '%') {
			if (textBuf) {
				out.push({ kind: 'text', value: textBuf });
				textBuf = '';
			}
			const end = src.indexOf('%}', i + 2);
			if (end < 0) {
				textBuf += src.slice(i);
				i = src.length;
				continue;
			}
			out.push({ kind: 'stmt', src: src.slice(i + 2, end).trim() });
			i = end + 2;
			continue;
		}
		textBuf += src[i];
		i++;
	}
	if (textBuf) out.push({ kind: 'text', value: textBuf });
	return out;
}

/* ── Expression parser (Pratt) + evaluator ───────────────────────── */

type ExprToken =
	| { kind: 'num'; value: number }
	| { kind: 'str'; value: string }
	| { kind: 'bool'; value: boolean }
	| { kind: 'none' }
	| { kind: 'ident'; value: string }
	| { kind: 'op'; value: string } // +, -, *, /, %, ==, !=, >, <, >=, <=, =
	| { kind: 'lparen' }
	| { kind: 'rparen' }
	| { kind: 'lbracket' }
	| { kind: 'rbracket' }
	| { kind: 'lbrace' }
	| { kind: 'rbrace' }
	| { kind: 'comma' }
	| { kind: 'colon' }
	| { kind: 'dot' }
	| { kind: 'pipe' }
	| { kind: 'kw'; value: string }; // and, or, not, in, if, else

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'if', 'else', 'true', 'false', 'none', 'True', 'False', 'None']);

function tokenizeExpr(src: string): ExprToken[] {
	const tokens: ExprToken[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		// Strings
		if (c === '"' || c === "'") {
			const quote = c;
			let j = i + 1;
			let val = '';
			while (j < src.length && src[j] !== quote) {
				if (src[j] === '\\' && j + 1 < src.length) {
					val += src[j + 1];
					j += 2;
				} else {
					val += src[j];
					j++;
				}
			}
			tokens.push({ kind: 'str', value: val });
			i = j + 1;
			continue;
		}
		// Numbers
		if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
			let j = i + 1;
			while (j < src.length && /[0-9.]/.test(src[j])) j++;
			tokens.push({ kind: 'num', value: Number(src.slice(i, j)) });
			i = j;
			continue;
		}
		// Operators
		const two = src.slice(i, i + 2);
		if (['==', '!=', '>=', '<='].includes(two)) {
			tokens.push({ kind: 'op', value: two });
			i += 2;
			continue;
		}
		if ('+-*/%=><'.includes(c)) {
			tokens.push({ kind: 'op', value: c });
			i++;
			continue;
		}
		if (c === '(') {
			tokens.push({ kind: 'lparen' });
			i++;
			continue;
		}
		if (c === ')') {
			tokens.push({ kind: 'rparen' });
			i++;
			continue;
		}
		if (c === '[') {
			tokens.push({ kind: 'lbracket' });
			i++;
			continue;
		}
		if (c === ']') {
			tokens.push({ kind: 'rbracket' });
			i++;
			continue;
		}
		if (c === '{') {
			tokens.push({ kind: 'lbrace' });
			i++;
			continue;
		}
		if (c === '}') {
			tokens.push({ kind: 'rbrace' });
			i++;
			continue;
		}
		if (c === ',') {
			tokens.push({ kind: 'comma' });
			i++;
			continue;
		}
		if (c === ':') {
			tokens.push({ kind: 'colon' });
			i++;
			continue;
		}
		if (c === '.') {
			tokens.push({ kind: 'dot' });
			i++;
			continue;
		}
		if (c === '|') {
			tokens.push({ kind: 'pipe' });
			i++;
			continue;
		}
		// Identifier / keyword / bool / none
		if (/[A-Za-z_]/.test(c)) {
			let j = i + 1;
			while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
			const word = src.slice(i, j);
			const lower = word.toLowerCase();
			if (lower === 'true') tokens.push({ kind: 'bool', value: true });
			else if (lower === 'false') tokens.push({ kind: 'bool', value: false });
			else if (lower === 'none') tokens.push({ kind: 'none' });
			else if (KEYWORDS.has(lower)) tokens.push({ kind: 'kw', value: lower });
			else tokens.push({ kind: 'ident', value: word });
			i = j;
			continue;
		}
		// Unknown char — skip to avoid infinite loops on bad input
		i++;
	}
	return tokens;
}

class Parser {
	pos = 0;
	constructor(public tokens: ExprToken[]) {}

	peek(): ExprToken | undefined {
		return this.tokens[this.pos];
	}
	eat(): ExprToken | undefined {
		return this.tokens[this.pos++];
	}
	match(kind: ExprToken['kind'], value?: string): boolean {
		const t = this.peek();
		if (!t || t.kind !== kind) return false;
		if (value !== undefined && (t as { value?: string }).value !== value) return false;
		this.pos++;
		return true;
	}
	expect(kind: ExprToken['kind']): ExprToken | undefined {
		const t = this.peek();
		if (t && t.kind === kind) {
			this.pos++;
			return t;
		}
		return undefined;
	}

	/** Top-level expression: ternary (`a if cond else b`) or pipe filter chain. */
	parseExpr(): ExprNode {
		const node = this.parseTernary();
		// Pipe filter chain
		let result = node;
		while (this.match('pipe')) {
			const fn = this.expect('ident');
			if (!fn) break;
			const args: ExprNode[] = [];
			if (this.match('lparen')) {
				if (!this.match('rparen')) {
					args.push(this.parseExpr());
					while (this.match('comma')) args.push(this.parseExpr());
					this.expect('rparen');
				}
			}
			result = { kind: 'filter', name: (fn as { value: string }).value, args, target: result };
		}
		return result;
	}

	parseTernary(): ExprNode {
		const a = this.parseOr();
		// {{ a if cond else b }} (Jinja's value-if-cond-else-other)
		const t = this.peek();
		if (t && t.kind === 'kw' && t.value === 'if') {
			this.eat();
			const cond = this.parseOr();
			if (this.peek()?.kind === 'kw' && (this.peek() as { value: string }).value === 'else') {
				this.eat();
				const b = this.parseOr();
				return { kind: 'ternary', cond, then: a, else: b };
			}
			return { kind: 'ternary', cond, then: a, else: { kind: 'literal', value: '' } };
		}
		return a;
	}

	parseOr(): ExprNode {
		let n = this.parseAnd();
		while (this.peek()?.kind === 'kw' && (this.peek() as { value: string }).value === 'or') {
			this.eat();
			const r = this.parseAnd();
			n = { kind: 'binop', op: 'or', left: n, right: r };
		}
		return n;
	}

	parseAnd(): ExprNode {
		let n = this.parseNot();
		while (this.peek()?.kind === 'kw' && (this.peek() as { value: string }).value === 'and') {
			this.eat();
			const r = this.parseNot();
			n = { kind: 'binop', op: 'and', left: n, right: r };
		}
		return n;
	}

	parseNot(): ExprNode {
		if (this.peek()?.kind === 'kw' && (this.peek() as { value: string }).value === 'not') {
			this.eat();
			return { kind: 'unop', op: 'not', operand: this.parseNot() };
		}
		return this.parseComparison();
	}

	parseComparison(): ExprNode {
		let n = this.parseAdditive();
		while (true) {
			const t = this.peek();
			if (
				t &&
				t.kind === 'op' &&
				['==', '!=', '>', '<', '>=', '<='].includes((t as { value: string }).value)
			) {
				const op = (this.eat() as { value: string }).value;
				const r = this.parseAdditive();
				n = { kind: 'binop', op, left: n, right: r };
			} else break;
		}
		return n;
	}

	parseAdditive(): ExprNode {
		let n = this.parseMultiplicative();
		while (true) {
			const t = this.peek();
			if (t && t.kind === 'op' && ['+', '-'].includes((t as { value: string }).value)) {
				const op = (this.eat() as { value: string }).value;
				const r = this.parseMultiplicative();
				n = { kind: 'binop', op, left: n, right: r };
			} else break;
		}
		return n;
	}

	parseMultiplicative(): ExprNode {
		let n = this.parseUnary();
		while (true) {
			const t = this.peek();
			if (t && t.kind === 'op' && ['*', '/', '%'].includes((t as { value: string }).value)) {
				const op = (this.eat() as { value: string }).value;
				const r = this.parseUnary();
				n = { kind: 'binop', op, left: n, right: r };
			} else break;
		}
		return n;
	}

	parseUnary(): ExprNode {
		const t = this.peek();
		if (t && t.kind === 'op' && (t.value === '-' || t.value === '+')) {
			const op = (this.eat() as { value: string }).value;
			return { kind: 'unop', op, operand: this.parseUnary() };
		}
		return this.parseCallChain();
	}

	parseCallChain(): ExprNode {
		let n = this.parsePrimary();
		while (true) {
			if (this.match('dot')) {
				const id = this.expect('ident');
				if (!id) break;
				n = { kind: 'attr', target: n, name: (id as { value: string }).value };
				continue;
			}
			if (this.match('lbracket')) {
				const key = this.parseExpr();
				this.expect('rbracket');
				n = { kind: 'index', target: n, key };
				continue;
			}
			if (this.match('lparen')) {
				const args: ExprNode[] = [];
				if (!this.match('rparen')) {
					args.push(this.parseExpr());
					while (this.match('comma')) args.push(this.parseExpr());
					this.expect('rparen');
				}
				n = { kind: 'call', target: n, args };
				continue;
			}
			break;
		}
		return n;
	}

	parsePrimary(): ExprNode {
		const t = this.peek();
		if (!t) return { kind: 'literal', value: '' };
		if (t.kind === 'num') {
			this.eat();
			return { kind: 'literal', value: t.value };
		}
		if (t.kind === 'str') {
			this.eat();
			return { kind: 'literal', value: t.value };
		}
		if (t.kind === 'bool') {
			this.eat();
			return { kind: 'literal', value: t.value };
		}
		if (t.kind === 'none') {
			this.eat();
			return { kind: 'literal', value: null };
		}
		if (t.kind === 'ident') {
			this.eat();
			return { kind: 'ident', name: t.value };
		}
		if (this.match('lparen')) {
			const inner = this.parseExpr();
			this.expect('rparen');
			return inner;
		}
		if (this.match('lbracket')) {
			const items: ExprNode[] = [];
			if (!this.match('rbracket')) {
				items.push(this.parseExpr());
				while (this.match('comma')) items.push(this.parseExpr());
				this.expect('rbracket');
			}
			return { kind: 'list', items };
		}
		if (this.match('lbrace')) {
			const entries: { key: ExprNode; value: ExprNode }[] = [];
			if (!this.match('rbrace')) {
				do {
					const k = this.parseExpr();
					this.expect('colon');
					const v = this.parseExpr();
					entries.push({ key: k, value: v });
				} while (this.match('comma'));
				this.expect('rbrace');
			}
			return { kind: 'dict', entries };
		}
		this.eat();
		return { kind: 'literal', value: '' };
	}
}

type ExprNode =
	| { kind: 'literal'; value: unknown }
	| { kind: 'ident'; name: string }
	| { kind: 'binop'; op: string; left: ExprNode; right: ExprNode }
	| { kind: 'unop'; op: string; operand: ExprNode }
	| { kind: 'attr'; target: ExprNode; name: string }
	| { kind: 'index'; target: ExprNode; key: ExprNode }
	| { kind: 'call'; target: ExprNode; args: ExprNode[] }
	| { kind: 'ternary'; cond: ExprNode; then: ExprNode; else: ExprNode }
	| { kind: 'filter'; name: string; args: ExprNode[]; target: ExprNode }
	| { kind: 'list'; items: ExprNode[] }
	| { kind: 'dict'; entries: { key: ExprNode; value: ExprNode }[] };

function isTruthy(v: unknown): boolean {
	if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
	if (Array.isArray(v) && v.length === 0) return false;
	if (typeof v === 'object' && Object.keys(v as object).length === 0) return false;
	return true;
}

function evalExpr(node: ExprNode, scope: Scope): unknown {
	switch (node.kind) {
		case 'literal':
			return node.value;
		case 'ident':
			return scope.lookup(node.name);
		case 'attr': {
			const t = evalExpr(node.target, scope);
			if (t && typeof t === 'object') return (t as Record<string, unknown>)[node.name];
			return undefined;
		}
		case 'index': {
			const t = evalExpr(node.target, scope);
			const k = evalExpr(node.key, scope);
			if (t && typeof t === 'object') return (t as Record<string, unknown>)[String(k)];
			if (typeof t === 'string' && typeof k === 'number') return t[k];
			return undefined;
		}
		case 'call': {
			const fn = evalExpr(node.target, scope);
			if (typeof fn !== 'function') return undefined;
			const args = node.args.map((a) => evalExpr(a, scope));
			try {
				return (fn as (...a: unknown[]) => unknown)(...args);
			} catch {
				return undefined;
			}
		}
		case 'unop': {
			const v = evalExpr(node.operand, scope);
			if (node.op === 'not') return !isTruthy(v);
			if (node.op === '-') return -Number(v);
			if (node.op === '+') return +Number(v);
			return undefined;
		}
		case 'binop': {
			if (node.op === 'and') return isTruthy(evalExpr(node.left, scope)) ? evalExpr(node.right, scope) : evalExpr(node.left, scope);
			if (node.op === 'or') return isTruthy(evalExpr(node.left, scope)) ? evalExpr(node.left, scope) : evalExpr(node.right, scope);
			const l = evalExpr(node.left, scope);
			const r = evalExpr(node.right, scope);
			switch (node.op) {
				case '+':
					if (typeof l === 'string' || typeof r === 'string') return String(l ?? '') + String(r ?? '');
					return Number(l) + Number(r);
				case '-':
					return Number(l) - Number(r);
				case '*':
					return Number(l) * Number(r);
				case '/':
					return Number(l) / Number(r);
				case '%':
					return Number(l) % Number(r);
				case '==':
					return l == r;
				case '!=':
					return l != r;
				case '>':
					return Number(l) > Number(r);
				case '<':
					return Number(l) < Number(r);
				case '>=':
					return Number(l) >= Number(r);
				case '<=':
					return Number(l) <= Number(r);
			}
			return undefined;
		}
		case 'ternary':
			return isTruthy(evalExpr(node.cond, scope)) ? evalExpr(node.then, scope) : evalExpr(node['else'], scope);
		case 'filter': {
			const v = evalExpr(node.target, scope);
			const args = node.args.map((a) => evalExpr(a, scope));
			return applyFilter(node.name, v, args);
		}
		case 'list':
			return node.items.map((it) => evalExpr(it, scope));
		case 'dict': {
			const obj: Record<string, unknown> = {};
			for (const e of node.entries) {
				const k = evalExpr(e.key, scope);
				obj[String(k)] = evalExpr(e.value, scope);
			}
			return obj;
		}
	}
}

function applyFilter(name: string, v: unknown, args: unknown[]): unknown {
	switch (name) {
		case 'upper':
			return String(v ?? '').toUpperCase();
		case 'lower':
			return String(v ?? '').toLowerCase();
		case 'title':
			return String(v ?? '').replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
		case 'round': {
			const n = Number(v);
			const places = typeof args[0] === 'number' ? args[0] : 0;
			const m = Math.pow(10, places);
			return Math.round(n * m) / m;
		}
		case 'default':
			if (v === null || v === undefined || v === '') return args[0] ?? '';
			return v;
		case 'int':
			return Math.trunc(Number(v));
		case 'float':
			return Number(v);
		case 'string':
			return String(v ?? '');
		case 'length':
			if (Array.isArray(v) || typeof v === 'string') return v.length;
			if (v && typeof v === 'object') return Object.keys(v).length;
			return 0;
		case 'replace':
			return String(v ?? '').replace(String(args[0] ?? ''), String(args[1] ?? ''));
	}
	// Unknown filter — pass through
	return v;
}

/* ── Scope (variable bindings) ───────────────────────────────────── */

class Scope {
	bindings: Record<string, unknown>;
	constructor(bindings: Record<string, unknown> = {}) {
		this.bindings = { ...bindings };
	}
	lookup(name: string): unknown {
		if (name in this.bindings) return this.bindings[name];
		return undefined;
	}
	set(name: string, value: unknown) {
		this.bindings[name] = value;
	}
}

/* ── HA helpers wired into the scope ─────────────────────────────── */

function buildHaContext(stateLookup?: (id: string) => State | undefined): Record<string, unknown> {
	return {
		states: (id: string): string => {
			const s = stateLookup?.(id);
			return s?.state ?? '';
		},
		state_attr: (id: string, attr: string): unknown => {
			return stateLookup?.(id)?.attributes?.[attr];
		},
		is_state: (id: string, value: string): boolean => {
			return stateLookup?.(id)?.state === value;
		},
		is_state_attr: (id: string, attr: string, value: unknown): boolean => {
			return stateLookup?.(id)?.attributes?.[attr] === value;
		},
		// Convenience: now() returns current Date
		now: (): Date => new Date()
	};
}

/* ── Statement execution ─────────────────────────────────────────── */

interface IfBlock {
	cond: ExprNode | null; // null for else
	tokens: Token[];
}

function parseStmtSrc(src: string): { kind: string; rest: string } {
	const trimmed = src.trim();
	const space = trimmed.indexOf(' ');
	const kind = space < 0 ? trimmed : trimmed.slice(0, space);
	const rest = space < 0 ? '' : trimmed.slice(space + 1).trim();
	return { kind, rest };
}

/**
 * Render the template — public entry point. Returns the rendered
 * string. Errors swallowed (returns whatever was rendered up to the
 * error point + the rest of the source as text).
 */
export function render(template: string, ctx: JinjaContext = {}): string {
	const tokens = tokenize(template);
	const scope = new Scope({
		...buildHaContext(ctx.stateLookup),
		...ctx
	});
	try {
		return renderTokens(tokens, scope);
	} catch {
		return template; // fall through to raw template
	}
}

function renderTokens(tokens: Token[], scope: Scope): string {
	let out = '';
	let i = 0;
	while (i < tokens.length) {
		const t = tokens[i];
		if (t.kind === 'text') {
			out += t.value;
			i++;
			continue;
		}
		if (t.kind === 'expr') {
			const node = parseExpression(t.src);
			if (node) {
				const v = evalExpr(node, scope);
				out += formatValue(v);
			}
			i++;
			continue;
		}
		// Statement
		const { kind, rest } = parseStmtSrc(t.src);
		if (kind === 'set') {
			// {% set name = expr %}
			const eq = rest.indexOf('=');
			if (eq > 0) {
				const name = rest.slice(0, eq).trim();
				const exprSrc = rest.slice(eq + 1).trim();
				const node = parseExpression(exprSrc);
				if (node) scope.set(name, evalExpr(node, scope));
			}
			i++;
			continue;
		}
		if (kind === 'if') {
			// Collect if/elif/else/endif blocks
			const blocks: IfBlock[] = [];
			let cond = parseExpression(rest);
			let bodyTokens: Token[] = [];
			let depth = 1;
			i++;
			while (i < tokens.length && depth > 0) {
				const tt = tokens[i];
				if (tt.kind === 'stmt') {
					const inner = parseStmtSrc(tt.src);
					if (inner.kind === 'if') {
						depth++;
						bodyTokens.push(tt);
					} else if (inner.kind === 'endif') {
						depth--;
						if (depth === 0) {
							blocks.push({ cond: cond, tokens: bodyTokens });
							i++;
							break;
						}
						bodyTokens.push(tt);
					} else if (inner.kind === 'elif' && depth === 1) {
						blocks.push({ cond: cond, tokens: bodyTokens });
						cond = parseExpression(inner.rest);
						bodyTokens = [];
					} else if (inner.kind === 'else' && depth === 1) {
						blocks.push({ cond: cond, tokens: bodyTokens });
						cond = null;
						bodyTokens = [];
					} else {
						bodyTokens.push(tt);
					}
				} else {
					bodyTokens.push(tt);
				}
				i++;
			}
			// Pick the first matching block
			for (const b of blocks) {
				if (b.cond === null || isTruthy(evalExpr(b.cond, scope))) {
					out += renderTokens(b.tokens, scope);
					break;
				}
			}
			continue;
		}
		// Unknown statement — skip
		i++;
	}
	return out;
}

function parseExpression(src: string): ExprNode | null {
	try {
		const tokens = tokenizeExpr(src);
		if (tokens.length === 0) return null;
		const parser = new Parser(tokens);
		return parser.parseExpr();
	} catch {
		return null;
	}
}

function formatValue(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'boolean') return v ? 'True' : 'False';
	if (typeof v === 'object') {
		try {
			return JSON.stringify(v);
		} catch {
			return String(v);
		}
	}
	return String(v);
}

/**
 * Quick check: does this string contain any Jinja syntax? Cheap pre-
 * check so callers can skip the evaluator entirely for plain text.
 */
export function looksLikeJinja(s: string): boolean {
	return /\{\{|\{%/.test(s);
}
