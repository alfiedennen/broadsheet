/**
 * Curation persistence — reads + writes broadsheet.json.
 *
 * Two backends, abstracted behind a simple interface:
 *
 *  1. localStorage (dev / standalone) — `broadsheet:curation` key
 *  2. Sidecar API (add-on, M5) — GET/PUT /api/broadsheet/curation
 *
 * Writes happen on every change (no save button). Optimistic
 * pattern: caller updates the in-memory store first, then this
 * module persists. On failure, the curation store handles revert.
 *
 * Schema migration runs on every load — if the on-disk version is
 * older than CURRENT_CURATION_VERSION, run forward migrators.
 */

import {
	defaultCuration,
	type Curation,
	CURRENT_CURATION_VERSION
} from './types';

const STORAGE_KEY = 'broadsheet:curation';

/** Backend interface — both implementations satisfy this. */
export interface CurationBackend {
	readonly id: 'localStorage' | 'sidecar';
	load(): Promise<Curation>;
	save(curation: Curation): Promise<void>;
}

/* ─────────────── localStorage backend ─────────────── */

class LocalStorageBackend implements CurationBackend {
	readonly id = 'localStorage' as const;

	async load(): Promise<Curation> {
		if (typeof localStorage === 'undefined') return defaultCuration();
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return defaultCuration();
			const parsed = JSON.parse(raw);
			return migrate(parsed);
		} catch {
			// Corrupt storage — fall back to default + clear it
			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch {
				/* ignore */
			}
			return defaultCuration();
		}
	}

	async save(curation: Curation): Promise<void> {
		if (typeof localStorage === 'undefined')
			throw new Error('localStorage unavailable — cannot persist curation');
		const stamped = { ...curation, lastModifiedAt: new Date().toISOString() };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
	}
}

/* ─────────────── sidecar backend (M5 placeholder) ─────────────── */

class SidecarBackend implements CurationBackend {
	readonly id = 'sidecar' as const;

	async load(): Promise<Curation> {
		const res = await fetch('/api/broadsheet/curation', { cache: 'no-store' });
		if (!res.ok) throw new Error(`sidecar load failed: ${res.status}`);
		const parsed = await res.json();
		return migrate(parsed);
	}

	async save(curation: Curation): Promise<void> {
		const stamped = { ...curation, lastModifiedAt: new Date().toISOString() };
		const res = await fetch('/api/broadsheet/curation', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(stamped)
		});
		if (!res.ok) throw new Error(`sidecar save failed: ${res.status}`);
	}
}

/* ─────────────── backend selection ─────────────── */

/**
 * Pick a backend based on runtime environment.
 * - addon mode (window.__BROADSHEET_ENV__ present) → sidecar
 * - everything else → localStorage
 */
export function pickBackend(): CurationBackend {
	if (
		typeof window !== 'undefined' &&
		(window as Window & { __BROADSHEET_ENV__?: object }).__BROADSHEET_ENV__
	) {
		return new SidecarBackend();
	}
	return new LocalStorageBackend();
}

/* ─────────────── migration ─────────────── */

type MigrationFn = (input: any) => any;
const MIGRATIONS: Partial<Record<number, MigrationFn>> = {
	// 1: (v1) => ({ ...v1, version: 2, /* new field */ })
};

function migrate(input: unknown): Curation {
	if (!input || typeof input !== 'object') return defaultCuration();
	const obj = input as Record<string, unknown>;
	if (typeof obj.version !== 'number') return defaultCuration();

	let current = obj;
	while ((current.version as number) < CURRENT_CURATION_VERSION) {
		const fn = MIGRATIONS[current.version as number];
		if (!fn) {
			// No migrator — keep what we can, fall back to defaults for missing keys
			return mergeWithDefault(current);
		}
		current = fn(current);
	}
	return mergeWithDefault(current);
}

/** Defensive merge: if the on-disk shape is missing top-level keys
 * (older or hand-edited), fill them from the default. Never drop
 * known-good user data. */
function mergeWithDefault(input: Record<string, unknown>): Curation {
	const def = defaultCuration();
	return {
		version: CURRENT_CURATION_VERSION,
		createdAt: typeof input.createdAt === 'string' ? input.createdAt : def.createdAt,
		lastModifiedAt:
			typeof input.lastModifiedAt === 'string' ? input.lastModifiedAt : def.lastModifiedAt,
		people: Array.isArray(input.people) ? input.people : def.people,
		floors: typeof input.floors === 'object' && input.floors ? (input.floors as never) : def.floors,
		areas: typeof input.areas === 'object' && input.areas ? (input.areas as never) : def.areas,
		devices:
			typeof input.devices === 'object' && input.devices ? (input.devices as never) : def.devices,
		entities:
			typeof input.entities === 'object' && input.entities
				? (input.entities as never)
				: def.entities,
		labels:
			typeof input.labels === 'object' && input.labels ? (input.labels as never) : def.labels,
		pagePins:
			typeof input.pagePins === 'object' && input.pagePins
				? (input.pagePins as never)
				: def.pagePins,
		pages: typeof input.pages === 'object' && input.pages ? (input.pages as never) : def.pages,
		voice: typeof input.voice === 'object' && input.voice ? (input.voice as never) : def.voice,
		paintings:
			typeof input.paintings === 'object' && input.paintings
				? (input.paintings as never)
				: def.paintings,
		integrations:
			typeof input.integrations === 'object' && input.integrations
				? ({
						...def.integrations,
						...(input.integrations as object)
					} as Curation['integrations'])
				: def.integrations,
		plugins:
			typeof input.plugins === 'object' && input.plugins
				? ({ ...def.plugins, ...(input.plugins as object) } as Curation['plugins'])
				: def.plugins
	};
}
