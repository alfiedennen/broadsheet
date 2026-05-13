import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// adapter-static: pure-static output, no Node server.
		// fallback: 'index.html' makes it an SPA (any unknown route serves
		// index.html, client-side router picks up).
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),

		// paths.base: '' for now. Under HA Ingress at /api/hassio_ingress/<token>/
		// the path is dynamic — we serve at relative paths from nginx's root and
		// let the ingress proxy prepend its prefix transparently. See
		// docs/ADDON-MOCK.md and docs/PREMORTEM-DIFF.md for the detail.
		paths: {
			base: '',
			relative: true
		},

		// Don't pre-render — every page reads live HA state. Static SPA shell.
		prerender: {
			handleHttpError: 'warn'
		}
	}
};

export default config;
