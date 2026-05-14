/**
 * ghost-cloud's discoveryContributor — discovers which rooms have
 * radar playback data available.
 *
 * It fetches the room manifest shipped as a plugin static asset. The
 * runner merges the return value into `discovery.plugins['ghost-cloud']`,
 * so the page reads the available rooms via
 * `discovery.plugins['ghost-cloud']?.rooms`.
 *
 * v0.1 ships static demo data (one captured day per room), so the
 * manifest is always present. When the live-radar-pull path lands,
 * this contributor is where it plugs in — it can additionally scan HA
 * for the LD2450 sensor pattern and report the radar-equipped rooms,
 * with the bundled demo set as the fallback.
 *
 * Contract notes: `import type` from @broadsheet/core only; eagerly
 * bundled (the contributor object must exist at boot); never throws —
 * a missing/bad manifest yields `{ rooms: null }` and the page shows
 * an empty state rather than crashing.
 */

import type { DiscoveryContributor } from '@broadsheet/core';

/** Per-room entry in static/data/index.json. */
export interface GhostCloudRoom {
	label: string;
	n_original: number;
	n_kept: number;
	size_kb: number;
}

/** Shape of static/data/index.json. */
export interface RoomManifest {
	generated_at: number;
	rooms: Record<string, GhostCloudRoom>;
}

export const roomsContributor: DiscoveryContributor = {
	id: 'ghost-cloud-rooms',

	async contribute(ctx) {
		try {
			const res = await ctx.fetch('/plugin-assets/ghost-cloud/data/index.json');
			if (!res.ok) return { rooms: null };
			const manifest = (await res.json()) as RoomManifest;
			if (!manifest || typeof manifest.rooms !== 'object') {
				return { rooms: null };
			}
			return { rooms: manifest };
		} catch {
			// Missing manifest / network error — graceful empty.
			return { rooms: null };
		}
	}
};
