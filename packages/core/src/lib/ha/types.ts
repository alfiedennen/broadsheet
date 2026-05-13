/**
 * Layer 1 raw types — mirror Home Assistant's own registry shapes.
 *
 * Types here intentionally match HA's TypeScript interfaces from
 * `home-assistant/frontend/src/data/{area,floor,label,entity,device}_registry.ts`.
 * Keeping them aligned means we can copy upstream changes verbatim and
 * never have to reason about field translation.
 *
 * Layer 2 (domain.ts) projects these into broadsheet-shaped types
 * (DomainArea, DomainEntity, etc). M2 implements that layer.
 *
 * Spec: ../../docs/DISCOVERY-CONTRACT.md
 */

export interface Floor {
	floor_id: string;
	name: string;
	level: number | null;
	icon: string | null;
	aliases: string[];
}

export interface Area {
	area_id: string;
	name: string;
	floor_id: string | null;
	icon: string | null;
	picture: string | null;
	aliases: string[];
	labels: string[];
}

export interface Device {
	id: string;
	name: string | null;
	name_by_user: string | null;
	model: string | null;
	manufacturer: string | null;
	area_id: string | null;
	config_entries: string[];
	connections: [string, string][];
	identifiers: [string, string][];
	via_device_id: string | null;
	disabled_by: 'user' | 'integration' | 'config_entry' | null;
	hidden_by: 'user' | 'integration' | null;
	entry_type: 'service' | null;
	labels: string[];
}

export interface Entity {
	entity_id: string;
	device_id: string | null;
	area_id: string | null;
	name: string | null;
	has_entity_name: boolean;
	original_name: string | null;
	icon: string | null;
	original_icon: string | null;
	device_class: string | null;
	unit_of_measurement: string | null;
	platform: string;
	hidden_by: 'user' | 'integration' | null;
	disabled_by: 'user' | 'integration' | 'config_entry' | 'device' | null;
	entity_category: 'config' | 'diagnostic' | null;
	translation_key: string | null;
	options: Record<string, unknown>;
	labels: string[];
	categories: Record<string, string>;
}

export interface Label {
	label_id: string;
	name: string;
	icon: string | null;
	color: string | null;
	description: string | null;
}

export interface Category {
	category_id: string;
	scope: string;
	name: string;
	icon: string | null;
}

export interface State {
	entity_id: string;
	state: string;
	attributes: Record<string, unknown>;
	last_changed: string;
	last_updated: string;
	context: { id: string; parent_id: string | null; user_id: string | null };
}

export interface Person {
	entity_id: string;
	name: string;
	user_id: string | null;
	device_trackers: string[];
	picture: string | null;
}

/**
 * Connection lifecycle status. Drives UI affordances:
 * - idle:         pre-connect, setup screen visible
 * - connecting:   first connection attempt in flight
 * - connected:    live, all reads + writes (subject to safety) work
 * - reconnecting: lost connection, retrying — pages render stale state
 * - fatal:        too many failures or auth rejected — user must intervene
 */
export type ConnectionStatus =
	| 'idle'
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'fatal';

/**
 * Service-call outcome — used by the actions wrapper to report what
 * happened (success, blocked, hard-banned, error).
 */
export interface ServiceCallResult {
	success: boolean;
	reason?: 'readonly' | 'hard-banned' | 'not-connected' | 'ha-error' | 'dry-run';
	error?: string;
}

/**
 * Audit log entry — every service call attempt produces one of these,
 * regardless of outcome. JSONL format on disk, ring buffer in memory.
 *
 * `id` is a monotonic per-session counter assigned by `audit()`.
 * Used as the stable key for reactive views — `timestamp` alone
 * collides when multiple events fire within the same millisecond
 * (which happens on boot every single time).
 */
export interface AuditEntry {
	id: number;
	timestamp: string; // ISO
	kind:
		| 'call-service' // the call was made
		| 'blocked-readonly' // blocked because readonly + no unlock
		| 'blocked-hard-banned' // blocked because domain is hard-banned (lock.*)
		| 'dry-run' // dry-run mode returned fake success
		| 'call-service-error' // call was made but HA returned error
		| 'connection-status' // connection lifecycle event
		| 'auth-event'; // setup, token saved, token cleared
	domain?: string;
	service?: string;
	target?: unknown;
	data?: unknown;
	error?: string;
	note?: string;
}
