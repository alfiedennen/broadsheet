/**
 * emanations' discoveryContributor — discovers which painting sets
 * are available.
 *
 * It fetches the painting-set manifest shipped as a plugin static
 * asset. The runner merges the return value into
 * `discovery.plugins.emanations`, so the page reads the available
 * paintings via `discovery.plugins.emanations?.paintingSets`.
 *
 * Contract notes:
 *  - `import type` from @broadsheet/core only — this module is
 *    eagerly bundled (the contributor object must exist at boot).
 *  - It NEVER throws: missing/204/bad-JSON manifest yields
 *    `{ paintingSets: null }` so emanations stays `active`, not
 *    `errored`. The `errored` path is for genuine contributor bugs.
 *  - `ctx.fetch` is the sandboxed, same-origin, ingress-aware fetch.
 */

import type { DiscoveryContributor } from '@broadsheet/core';

/** Shape of static/paintings/manifest.json. */
export interface PaintingManifest {
	version: number;
	/** area-slug → asset path (relative to the plugin's static root). */
	paintings: Record<string, string>;
}

export const paintingSetsContributor: DiscoveryContributor = {
	id: 'emanations-painting-sets',

	async contribute(ctx) {
		try {
			const res = await ctx.fetch('/plugin-assets/emanations/paintings/manifest.json');
			if (!res.ok) return { paintingSets: null };
			const manifest = (await res.json()) as PaintingManifest;
			if (!manifest || typeof manifest.paintings !== 'object') {
				return { paintingSets: null };
			}
			return { paintingSets: manifest };
		} catch {
			// Missing manifest / network error — graceful empty. The
			// page falls back to the procedural renderer.
			return { paintingSets: null };
		}
	}
};
