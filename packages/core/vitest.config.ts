import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

/**
 * Vitest config for broadsheet's core test suite.
 *
 * Scope (Phase E tight): unit + integration tests for the
 * substrate's pure-logic surfaces — Jinja evaluator, Lovelace
 * translators, slug validation, moment-sensor heuristic resolvers,
 * importer pipeline against synthetic fixtures.
 *
 * Out of scope for this config (deferred to Phase F follow-up):
 * Playwright e2e, visual regression, perf budget, axe a11y.
 *
 * The Svelte plugin is included so component imports parse;
 * actual component tests would need @testing-library/svelte +
 * jsdom, which we add later if needed.
 */
export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		alias: {
			$lib: resolve('./src/lib'),
			$app: resolve('./src/test-shims/app')
		}
	},
	test: {
		include: ['tests/**/*.{spec,test}.ts'],
		environment: 'node',
		globals: true,
		coverage: {
			reporter: ['text', 'html'],
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/**/*.svelte', 'src/lib/**/index.ts']
		}
	}
});
