/**
 * Curation reactive store + write-through pattern.
 *
 * Pages + Settings UI both read from `curationStore.current` (a
 * `$state` reactive object). Mutations go through the helper
 * functions which:
 *
 *   1. Update `curationStore.current` optimistically (UI re-renders)
 *   2. Bump `curationStore.tick` (signals dependents)
 *   3. Persist via the active backend (localStorage or sidecar)
 *   4. On persist failure: revert + audit + surface a toast event
 *
 * Spec: ../../../docs/SETTINGS-SCHEMA.md
 */

import { audit } from '$lib/ha/audit';
import {
	defaultCuration,
	type Curation,
	type AreaOverride,
	type DeviceOverride,
	type EntityOverride,
	type PersonOverride
} from './types';
import { pickBackend, type CurationBackend } from './persistence';

class CurationStore {
	current = $state<Curation>(defaultCuration());
	loaded = $state<boolean>(false);
	lastError = $state<string | null>(null);
	/** Bumps on every successful save. UI consumers can $derived on this. */
	tick = $state<number>(0);
}

export const curationStore = new CurationStore();

let _backend: CurationBackend | null = null;

/** Boot — load curation from the active backend, settle state. */
export async function bootCuration(): Promise<void> {
	_backend = pickBackend();
	audit({ kind: 'auth-event', note: `curation backend = ${_backend.id}` });

	try {
		curationStore.current = await _backend.load();
		curationStore.lastError = null;
	} catch (err) {
		const msg = String(err);
		curationStore.lastError = msg;
		audit({ kind: 'auth-event', note: 'curation load failed', error: msg });
		curationStore.current = defaultCuration();
	}
	curationStore.loaded = true;
	curationStore.tick++;
}

/* ─────────────── mutators ─────────────── */

/**
 * Apply a curation update with optimistic write + revert on failure.
 * `updater` receives a deep-cloned copy of the current curation and
 * should return the mutated copy.
 */
async function update(updater: (c: Curation) => Curation): Promise<boolean> {
	if (!_backend) {
		audit({ kind: 'auth-event', note: 'curation update before boot — ignored' });
		return false;
	}

	// Use $state.snapshot() to get a plain object — structuredClone
	// can't clone Svelte 5's reactive proxies. snapshot() unwraps them.
	const before = $state.snapshot(curationStore.current) as Curation;
	const next = updater($state.snapshot(curationStore.current) as Curation);

	// Optimistic — UI re-renders now
	curationStore.current = next;
	curationStore.tick++;

	try {
		await _backend.save(next);
		curationStore.lastError = null;
		return true;
	} catch (err) {
		const msg = String(err);
		audit({ kind: 'auth-event', note: 'curation save failed', error: msg });
		curationStore.lastError = msg;
		// Revert optimistic update
		curationStore.current = before;
		curationStore.tick++;
		return false;
	}
}

/* ─────────────── area mutators ─────────────── */

export async function setAreaOverride(areaId: string, patch: Partial<AreaOverride>): Promise<boolean> {
	return update((c) => {
		const existing = c.areas[areaId] ?? {};
		c.areas[areaId] = { ...existing, ...patch };
		return c;
	});
}

export async function renameArea(areaId: string, name: string | null): Promise<boolean> {
	return setAreaOverride(areaId, { rename: name });
}

export async function hideArea(areaId: string, hidden: boolean): Promise<boolean> {
	return setAreaOverride(areaId, { hidden });
}

/* ─────────────── device mutators ─────────────── */

export async function setDeviceOverride(
	deviceId: string,
	patch: Partial<DeviceOverride>
): Promise<boolean> {
	return update((c) => {
		const existing = c.devices[deviceId] ?? {};
		c.devices[deviceId] = { ...existing, ...patch };
		return c;
	});
}

export async function renameDevice(deviceId: string, name: string | null): Promise<boolean> {
	return setDeviceOverride(deviceId, { rename: name });
}

export async function hideDevice(deviceId: string, hidden: boolean): Promise<boolean> {
	return setDeviceOverride(deviceId, { hidden });
}

/* ─────────────── entity mutators ─────────────── */

export async function setEntityOverride(
	entityId: string,
	patch: Partial<EntityOverride>
): Promise<boolean> {
	return update((c) => {
		const existing = c.entities[entityId] ?? {};
		c.entities[entityId] = { ...existing, ...patch };
		return c;
	});
}

export async function hideEntity(entityId: string, hidden: boolean): Promise<boolean> {
	return setEntityOverride(entityId, { hidden });
}

export async function renameEntity(entityId: string, name: string | null): Promise<boolean> {
	return setEntityOverride(entityId, { rename: name });
}

export async function unhideEntity(entityId: string, unhide: boolean): Promise<boolean> {
	return setEntityOverride(entityId, { unhide });
}

/* ─────────────── moment-sensor mutators ─────────────── */

/**
 * Pin one of the moment-view manifest sensor sources.
 *
 *   value === undefined → delete the override → resume auto-discovery
 *   value === ''        → explicitly off → no clause renders
 *   value === '<id>'    → pin to this entity
 */
export async function setMomentSensor(
	key: 'primaryIndoorTempSensorId' | 'primaryElectricityRateSensorId',
	value: string | null | undefined
): Promise<boolean> {
	return update((c) => {
		c.momentSensors = { ...c.momentSensors };
		if (value === undefined) {
			delete c.momentSensors[key];
		} else {
			c.momentSensors[key] = value;
		}
		return c;
	});
}

/* ─────────────── pin mutators ─────────────── */

export async function pinEntityToPage(
	entityId: string,
	pageSlug: string | null
): Promise<boolean> {
	return update((c) => {
		if (pageSlug === null) {
			delete c.pagePins[entityId];
		} else {
			c.pagePins[entityId] = pageSlug;
		}
		return c;
	});
}

/* ─────────────── person mutators ─────────────── */

export async function setPersonPresenceSensor(
	personId: string,
	sensorId: string | null,
	deviceClass: 'android' | 'ios' | 'unknown'
): Promise<boolean> {
	return update((c) => {
		const existing = c.people.find((p) => p.personId === personId);
		if (existing) {
			existing.presenceSensorId = sensorId;
			existing.deviceClass = deviceClass;
		} else {
			c.people.push({
				personId,
				presenceSensorId: sensorId,
				deviceClass
			});
		}
		return c;
	});
}

/* ─────────────── voice mutators ─────────────── */

export async function setVoiceString(stringId: string, value: string): Promise<boolean> {
	return update((c) => {
		if (value.trim() === '') {
			delete c.voice[stringId];
		} else {
			c.voice[stringId] = value;
		}
		return c;
	});
}

/* ─────────────── plugin mutators ─────────────── */

/**
 * Enable / disable a plugin. Writes `plugins.<id>.enabled` — the
 * single flag the plugin loader gates registration on. Preserves any
 * existing `config` blob for the plugin.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<boolean> {
	return update((c) => {
		const existing = c.plugins[pluginId] ?? { enabled: false, config: {} };
		c.plugins[pluginId] = { ...existing, enabled };
		return c;
	});
}

/* ─────────────── generic path access (plugin settings panels) ─────────────── */

/** Read a dotted path (`plugins.x.config.fadeMs`) out of an object. */
function getByPath(obj: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((acc, key) => {
		if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
		return undefined;
	}, obj);
}

/** Write `value` at a dotted path, creating intermediate objects. */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
	const keys = path.split('.');
	let cur: Record<string, unknown> = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i];
		if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
		cur = cur[k] as Record<string, unknown>;
	}
	cur[keys[keys.length - 1]] = value;
}

/** Write `value` at a dotted curation path, optimistic + revert-on-fail. */
export async function setCurationPath(path: string, value: unknown): Promise<boolean> {
	return update((c) => {
		setByPath(c as unknown as Record<string, unknown>, path, value);
		return c;
	});
}

/**
 * Reactive two-way binding to a dotted curation path — the binding
 * primitive for plugin settings panels (`@broadsheet/core` re-exports
 * this as `useCurationField`). Read `field.value` in a reactive
 * context to track it; assign `field.value = …` (or `bind:value`) to
 * persist through the optimistic-write path.
 *
 *   const fade = useCurationField<number>('plugins.emanations.config.fadeMs');
 *   <input type="number" bind:value={fade.value} />
 */
export function useCurationField<T = unknown>(path: string): { value: T | undefined } {
	return {
		get value(): T | undefined {
			// Reactive dep on curation mutations — the curation object is
			// replaced on every save; the tick guarantees recompute.
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			curationStore.tick;
			return getByPath(curationStore.current, path) as T | undefined;
		},
		set value(v: T | undefined) {
			void setCurationPath(path, v);
		}
	};
}

/* ─────────────── reset ─────────────── */

/** Wipe all curation back to defaults. Persists immediately. */
export async function resetCuration(): Promise<boolean> {
	return update(() => defaultCuration());
}

/** Manual export — returns a JSON string of the current curation. */
export function exportCurationJson(): string {
	return JSON.stringify(curationStore.current, null, 2);
}

/** Import — replaces current curation with the supplied JSON. Validates shape. */
export async function importCurationJson(jsonText: string): Promise<boolean> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		curationStore.lastError = 'import failed: invalid JSON';
		return false;
	}
	if (!parsed || typeof parsed !== 'object') {
		curationStore.lastError = 'import failed: top-level must be object';
		return false;
	}
	// Round-trip through migrate by saving + reloading
	return update(() => parsed as Curation);
}
