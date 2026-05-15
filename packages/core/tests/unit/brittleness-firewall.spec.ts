/**
 * Brittleness firewall — guard against the forbidden patterns that
 * would tie broadsheet to HA's unstable surfaces.
 *
 * Rubric coverage: E6-S1 (only stable HA contracts).
 *
 * Forbidden patterns (per PLUGIN-AUTHOR-QUICKSTART, RENDERER-CONTRACT,
 * ARCHITECTURE):
 *   1. No `<home-assistant>` shadow-DOM scraping
 *   2. No hardcoded HA frontend chunk URLs (e.g. /frontend_latest/, /api/hassio/<addon>/)
 *   3. No dependence on HA's CSS class names (.mdc-, .ha-card)
 *   4. No `document.querySelector('home-assistant ...')` patterns
 *
 * Scans the entire src/ tree under packages/core/src + every
 * packages/<plugin>/src tree. Fails if any forbidden pattern is
 * found in a runtime path.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..'); // up to broadsheet/
const SCAN_DIRS = [
	'packages/core/src',
	'packages/emanations/src',
	'packages/ghost-cloud/src',
	'packages/tmdb-tv/src'
];

/**
 * Patterns forbidden in runtime code. Each entry is:
 *   - regex: what to grep for
 *   - rationale: human-readable reason
 *
 * Excluded paths (allowed despite matching):
 *   - test files (*.spec.ts, *.test.ts) — they explicitly test the
 *     forbidden patterns
 *   - this file itself
 */
const FORBIDDEN: { regex: RegExp; rationale: string }[] = [
	{
		regex: /document\.querySelector\(['"]home-assistant\b/,
		rationale: 'HA shadow-DOM scraping is forbidden — use stable WS API instead.'
	},
	{
		regex: /\bhass-main\b|\bhass-router\b|\bhass-tabs-subpage\b/,
		rationale:
			'HA frontend internal class names are unstable across HA versions — do not depend on them.'
	},
	{
		regex: /\/frontend_latest\//,
		rationale:
			'HA frontend chunk URLs are version-specific — never hardcode them.'
	},
	{
		regex: /\bmdc-[a-z-]+/,
		rationale:
			'HA uses Material Design Components (mdc-*) class names which are not a stable contract.'
	}
];

/** Walk a directory tree, yielding relative paths to source files. */
function* walk(dir: string, baseDir: string): Generator<string> {
	let entries: string[] = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		let stats;
		try {
			stats = statSync(full);
		} catch {
			continue;
		}
		if (stats.isDirectory()) {
			if (entry === 'node_modules' || entry === '.svelte-kit' || entry === 'build')
				continue;
			yield* walk(full, baseDir);
		} else if (stats.isFile()) {
			if (/\.(ts|svelte|js)$/.test(entry) && !/\.(spec|test)\.ts$/.test(entry)) {
				yield relative(baseDir, full).replace(/\\/g, '/');
			}
		}
	}
}

describe('brittleness firewall', () => {
	it('no forbidden HA-internal patterns in runtime source', () => {
		const violations: { file: string; pattern: string; rationale: string }[] = [];

		for (const scanDir of SCAN_DIRS) {
			const fullDir = join(REPO_ROOT, scanDir);
			for (const relPath of walk(fullDir, REPO_ROOT)) {
				const content = readFileSync(join(REPO_ROOT, relPath), 'utf8');
				for (const { regex, rationale } of FORBIDDEN) {
					if (regex.test(content)) {
						violations.push({
							file: relPath,
							pattern: regex.source,
							rationale
						});
					}
				}
			}
		}

		if (violations.length > 0) {
			const msg = violations
				.map(
					(v) =>
						`  ${v.file}\n    pattern: /${v.pattern}/\n    rationale: ${v.rationale}`
				)
				.join('\n\n');
			throw new Error(
				`Brittleness firewall violations (${violations.length}):\n\n${msg}\n\n` +
					`These patterns tie broadsheet to HA's unstable surfaces. ` +
					`Use stable WS / REST / theme contracts instead.`
			);
		}
		expect(violations).toHaveLength(0);
	});
});
