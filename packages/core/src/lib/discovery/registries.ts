/**
 * Boot pulls + live subscriptions for HA's registries.
 *
 * Boot sequence (per DISCOVERY-CONTRACT.md):
 *  1. Pull all six registries in parallel — stable snapshots
 *  2. Pull person entities
 *  3. Open subscribe_entities (compressed delta protocol)
 *  4. Subscribe to *_registry_updated events
 *  5. Hook the connection's `ready` event so future reconnects re-pull
 *
 * Refresh patterns:
 *  - subscribe_entities: handled by the lib, auto-resubscribes on reconnect
 *  - *_registry_updated events: trigger a debounced re-pull of the
 *    affected registry (500ms trailing edge — handles mass renames)
 *  - ready event (reconnect): re-pull all registries (no auto-resub for
 *    the one-shot list calls)
 */

import { subscribeEntities } from 'home-assistant-js-websocket';
import type { Connection, UnsubscribeFunc } from 'home-assistant-js-websocket';
import { audit } from '$lib/ha/audit';
import { getConnection } from '$lib/ha/client';
import { discoveryStore } from './store.svelte';
import type {
	Floor,
	Area,
	Device,
	Entity,
	Label,
	Category,
	Person,
	State
} from '$lib/ha/types';

const REFRESH_DEBOUNCE_MS = 500;

/**
 * HA's `person/list` returns objects keyed by `id` (e.g. "alfie_dennen"),
 * NOT by `entity_id`. The entity_id is constructed as `person.<id>`.
 * Normalise on read so the rest of broadsheet sees a stable Person shape.
 */
interface RawPersonResponse {
	id: string;
	name?: string;
	user_id?: string | null;
	device_trackers?: string[];
	picture?: string | null;
}

function normalisePersons(raw: RawPersonResponse[]): Person[] {
	return raw.map((p) => ({
		entity_id: `person.${p.id}`,
		name: p.name ?? p.id,
		user_id: p.user_id ?? null,
		device_trackers: p.device_trackers ?? [],
		picture: p.picture ?? null
	}));
}

// NB: the HA library's unsubscribe functions are `() => Promise<void>`,
// NOT `() => void`. The promise REJECTS with "Subscription not found"
// when the sub id is stale (e.g. teardown runs after the socket
// reconnected with fresh ids). teardownDiscovery must catch that
// rejection or it surfaces as an Uncaught (in promise) console error.
let _unsubEntities: UnsubscribeFunc | null = null;
let _unsubRegistryEvents: UnsubscribeFunc[] = [];
let _readyListener: (() => void) | null = null;
let _connectionRef: Connection | null = null;

const _refreshTimers: Partial<Record<RegistryName, ReturnType<typeof setTimeout>>> = {};

type RegistryName = 'floor' | 'area' | 'device' | 'entity' | 'label' | 'category' | 'person';

/**
 * Boot Layer 1 discovery against the active HA connection.
 *
 * Idempotent — safe to call multiple times. The first call wires
 * subscriptions; subsequent calls re-pull registries (used by future
 * re-connects).
 */
export async function bootDiscovery(): Promise<void> {
	const conn = getConnection();
	if (!conn) {
		throw new Error('bootDiscovery: no active HA connection');
	}

	// First-time setup: wire subscriptions
	if (_connectionRef !== conn) {
		await teardownDiscovery();
		_connectionRef = conn;

		// Entity-state subscription — compressed delta, lib handles cache + reconnect
		_unsubEntities = subscribeEntities(conn, (entities) => {
			// `entities` is the full state map keyed by entity_id
			discoveryStore.states = entities as Record<string, State>;
		});

		// Registry-update subscriptions — debounced re-pull on each event
		const wireRegistryEvent = (eventType: string, registry: RegistryName) => {
			conn
				.subscribeEvents(() => scheduleRefresh(registry), eventType)
				.then((unsub) => _unsubRegistryEvents.push(unsub))
				.catch((err) =>
					audit({
						kind: 'auth-event',
						note: `failed to subscribe to ${eventType}`,
						error: String(err)
					})
				);
		};

		wireRegistryEvent('area_registry_updated', 'area');
		wireRegistryEvent('device_registry_updated', 'device');
		wireRegistryEvent('entity_registry_updated', 'entity');
		wireRegistryEvent('floor_registry_updated', 'floor');
		wireRegistryEvent('label_registry_updated', 'label');
		wireRegistryEvent('category_registry_updated', 'category');
		// Person changes ride on entity_registry_updated + state changes for person.X

		// Hook future reconnects — the lib's reconnect re-establishes
		// subscriptions automatically, but the one-shot registry list
		// calls aren't auto-replayed. We re-pull them manually.
		_readyListener = () => {
			audit({ kind: 'auth-event', note: 'connection ready event — re-pulling all registries' });
			refreshAll().catch((err) =>
				audit({
					kind: 'auth-event',
					note: 'registry refresh on reconnect failed',
					error: String(err)
				})
			);
		};
		conn.addEventListener('ready', _readyListener);
	}

	// Initial pull (or re-pull on subsequent calls)
	await refreshAll();
	discoveryStore.booted = true;
	audit({
		kind: 'auth-event',
		note: `discovery booted: ${discoveryStore.areas.length} areas, ${discoveryStore.devices.length} devices, ${discoveryStore.entities.length} entities, ${discoveryStore.persons.length} persons, ${discoveryStore.floors.length} floors, ${discoveryStore.labels.length} labels`
	});
}

/** Tear down all subscriptions + reset state. Used on disconnect / hot-reload. */
export async function teardownDiscovery(): Promise<void> {
	// Each unsub returns a Promise that can reject with "Subscription
	// not found" if the connection already reconnected (stale sub id).
	// Catch the async rejection — a bare try/catch only guards the
	// synchronous call, letting the rejection escape as Uncaught.
	const swallowUnsub = (fn: UnsubscribeFunc) => {
		try {
			Promise.resolve(fn()).catch(() => {
				/* stale sub id post-reconnect — expected, ignore */
			});
		} catch {
			/* ignore synchronous throw too */
		}
	};

	if (_unsubEntities) {
		swallowUnsub(_unsubEntities);
		_unsubEntities = null;
	}
	for (const u of _unsubRegistryEvents) {
		swallowUnsub(u);
	}
	_unsubRegistryEvents = [];

	if (_readyListener && _connectionRef) {
		try {
			_connectionRef.removeEventListener('ready', _readyListener);
		} catch {
			/* ignore */
		}
	}
	_readyListener = null;
	_connectionRef = null;

	for (const k of Object.keys(_refreshTimers) as RegistryName[]) {
		const t = _refreshTimers[k];
		if (t) clearTimeout(t);
		delete _refreshTimers[k];
	}

	discoveryStore.booted = false;
}

/** Re-pull all six registries + persons in parallel. */
async function refreshAll(): Promise<void> {
	const conn = getConnection();
	if (!conn) {
		discoveryStore.lastDiscoveryError = 'no connection during refreshAll';
		return;
	}

	try {
		const [floors, areas, devices, entities, labels, categories, persons] = await Promise.all([
			conn
				.sendMessagePromise<Floor[]>({ type: 'config/floor_registry/list' })
				.catch(() => [] as Floor[]),
			conn.sendMessagePromise<Area[]>({ type: 'config/area_registry/list' }),
			conn.sendMessagePromise<Device[]>({ type: 'config/device_registry/list' }),
			conn.sendMessagePromise<Entity[]>({ type: 'config/entity_registry/list' }),
			conn
				.sendMessagePromise<Label[]>({ type: 'config/label_registry/list' })
				.catch(() => [] as Label[]),
			conn
				.sendMessagePromise<Category[]>({ type: 'config/category_registry/list' })
				.catch(() => [] as Category[]),
			conn
				.sendMessagePromise<{ storage: RawPersonResponse[]; config: RawPersonResponse[] }>({
					type: 'person/list'
				})
				.then((res) => normalisePersons([...(res.storage || []), ...(res.config || [])]))
				.catch(() => [] as Person[])
		]);

		discoveryStore.floors = floors;
		discoveryStore.areas = areas;
		discoveryStore.devices = devices;
		discoveryStore.entities = entities;
		discoveryStore.labels = labels;
		discoveryStore.categories = categories;
		discoveryStore.persons = persons;
		discoveryStore.lastRefreshAt = new Date().toISOString();
		discoveryStore.lastDiscoveryError = null;
	} catch (err) {
		const msg = String(err);
		discoveryStore.lastDiscoveryError = msg;
		audit({ kind: 'auth-event', note: 'refreshAll threw', error: msg });
		throw err;
	}
}

/** Re-pull a single registry. Used on its `*_registry_updated` event. */
async function refreshOne(name: RegistryName): Promise<void> {
	const conn = getConnection();
	if (!conn) return;

	try {
		switch (name) {
			case 'floor': {
				const data = await conn.sendMessagePromise<Floor[]>({
					type: 'config/floor_registry/list'
				});
				discoveryStore.floors = data;
				break;
			}
			case 'area': {
				const data = await conn.sendMessagePromise<Area[]>({
					type: 'config/area_registry/list'
				});
				discoveryStore.areas = data;
				break;
			}
			case 'device': {
				const data = await conn.sendMessagePromise<Device[]>({
					type: 'config/device_registry/list'
				});
				discoveryStore.devices = data;
				break;
			}
			case 'entity': {
				const data = await conn.sendMessagePromise<Entity[]>({
					type: 'config/entity_registry/list'
				});
				discoveryStore.entities = data;
				break;
			}
			case 'label': {
				const data = await conn.sendMessagePromise<Label[]>({
					type: 'config/label_registry/list'
				});
				discoveryStore.labels = data;
				break;
			}
			case 'category': {
				const data = await conn.sendMessagePromise<Category[]>({
					type: 'config/category_registry/list'
				});
				discoveryStore.categories = data;
				break;
			}
			case 'person': {
				const data = await conn.sendMessagePromise<{
					storage: RawPersonResponse[];
					config: RawPersonResponse[];
				}>({
					type: 'person/list'
				});
				discoveryStore.persons = normalisePersons([
					...(data.storage || []),
					...(data.config || [])
				]);
				break;
			}
		}
	} catch (err) {
		audit({
			kind: 'auth-event',
			note: `refreshOne(${name}) threw`,
			error: String(err)
		});
	}
}

/**
 * Schedule a debounced refresh of one registry. Multiple events
 * within 500ms collapse into one re-pull (handles mass renames /
 * bulk imports without N+1 round-trips).
 */
function scheduleRefresh(name: RegistryName): void {
	const existing = _refreshTimers[name];
	if (existing) clearTimeout(existing);
	_refreshTimers[name] = setTimeout(() => {
		delete _refreshTimers[name];
		refreshOne(name);
	}, REFRESH_DEBOUNCE_MS);
}
