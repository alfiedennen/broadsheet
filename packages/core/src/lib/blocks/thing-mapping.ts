/**
 * 0.9.1 — domain → widget mapping for the `thing` block.
 *
 * The things-first editor lets users add ANY HA entity to a wall
 * surface. broadsheet picks the right visual representation
 * automatically based on the entity's domain (light → toggle,
 * scene → tap-to-fire, climate → temp+slider, etc.). The user
 * never names a widget type unless they want to override the
 * default — light-as-scene-trigger, sensor-as-tile, etc.
 *
 * The mapping is intentionally defensive — an unknown domain
 * falls back to a name+state pill rather than blank-screening.
 *
 * Adding a new mapping:
 *   1. Add a domain → widget entry in DOMAIN_WIDGET below
 *   2. Make sure the widget exists in ThingWidget (types.ts)
 *   3. Add a renderer case in ThingBlockRenderer.svelte
 *
 * Spec: docs/plans/plan-9.1-wall-builder-things-first.md.
 */

import type { ThingWidget } from './types';
import type { State } from '$lib/ha/types';

/**
 * Coarse domain → default widget. Some domains (`media_player`)
 * have sub-cases keyed off entity state attributes — handled in
 * `pickWidget()` below, not here.
 */
const DOMAIN_WIDGET: Record<string, ThingWidget> = {
	light: 'toggle',
	switch: 'toggle',
	input_boolean: 'toggle',
	scene: 'fire',
	script: 'fire',
	automation: 'fire', // automations are triggered/fired; treat as one-shot
	climate: 'climate',
	lock: 'lock',
	cover: 'cover',
	camera: 'camera',
	image: 'camera',
	binary_sensor: 'state-pill',
	sensor: 'value-pill',
	input_select: 'pick',
	input_number: 'pick', // numeric picker; reuse pick widget for v1
	select: 'pick',
	number: 'pick'
};

/**
 * Pick the right widget for an entity. Reads the domain from
 * entity_id and falls back to a defensive 'value-pill' for
 * anything unknown so the tile renders SOMETHING rather than
 * blank-screening on an unrecognised domain.
 *
 * Special case: media_player — TV class gets 'media-tv' (compact
 * power+source), everything else gets 'media-speaker' (play/pause).
 */
export function pickWidget(entityId: string, state: State | null): ThingWidget {
	const dot = entityId.indexOf('.');
	if (dot < 0) return 'value-pill';
	const domain = entityId.slice(0, dot);

	if (domain === 'media_player') {
		const dc = state?.attributes?.device_class as string | undefined;
		if (dc === 'tv') return 'media-tv';
		return 'media-speaker';
	}

	return DOMAIN_WIDGET[domain] ?? 'value-pill';
}

/**
 * Resolve a widget pick — when the user picks 'auto', call the
 * domain heuristic; otherwise honour their explicit override.
 */
export function resolveWidget(
	widget: ThingWidget | undefined,
	entityId: string,
	state: State | null
): ThingWidget {
	if (!widget || widget === 'auto') return pickWidget(entityId, state);
	return widget;
}

/**
 * Human-readable widget label for the editor's "Override widget"
 * dropdown. Order matches the typical mental model of how users
 * categorise wall tiles (action shapes first, status shapes last).
 */
export const WIDGET_LABELS: { value: ThingWidget; label: string; hint: string }[] = [
	{ value: 'auto', label: 'Auto (recommended)', hint: 'broadsheet picks based on the entity domain' },
	{ value: 'toggle', label: 'Toggle', hint: 'on/off button — works for any toggleable entity' },
	{ value: 'fire', label: 'Tap to fire', hint: 'one-shot trigger — for scene-like and script-like wiring' },
	{ value: 'climate', label: 'Climate', hint: 'current temp + setpoint + tap-expand slider' },
	{ value: 'lock', label: 'Lock', hint: 'state + unlock-on-tap' },
	{ value: 'cover', label: 'Cover', hint: 'open / close' },
	{ value: 'media-tv', label: 'TV', hint: 'power + source picker' },
	{ value: 'media-speaker', label: 'Speaker', hint: 'play/pause + source toggle' },
	{ value: 'camera', label: 'Camera', hint: 'snapshot tile, tap-expand for live feed' },
	{ value: 'state-pill', label: 'State pill', hint: 'read-only status (open/closed, motion/clear)' },
	{ value: 'value-pill', label: 'Value pill', hint: 'read-only numeric value' },
	{ value: 'pick', label: 'Pick-list', hint: 'dropdown selector (input_select, etc.)' }
];

/**
 * Human-readable label for a DOMAIN — used by the things browser
 * to group + classify entities. Mirrors the WIDGET_LABELS but
 * organised by what the user RECOGNISES ("Lights, Scenes, Heating,
 * Locks") rather than by widget type.
 */
export const DOMAIN_LABELS: Record<string, { label: string; pluralLabel: string }> = {
	light: { label: 'Light', pluralLabel: 'Lights' },
	switch: { label: 'Switch', pluralLabel: 'Switches' },
	scene: { label: 'Scene', pluralLabel: 'Scenes' },
	script: { label: 'Script', pluralLabel: 'Scripts' },
	automation: { label: 'Automation', pluralLabel: 'Automations' },
	climate: { label: 'Heating', pluralLabel: 'Heating' },
	lock: { label: 'Lock', pluralLabel: 'Locks' },
	cover: { label: 'Cover', pluralLabel: 'Covers' },
	camera: { label: 'Camera', pluralLabel: 'Cameras' },
	image: { label: 'Image', pluralLabel: 'Images' },
	media_player: { label: 'Media player', pluralLabel: 'Media players' },
	binary_sensor: { label: 'Sensor', pluralLabel: 'Sensors' },
	sensor: { label: 'Sensor', pluralLabel: 'Sensors' },
	input_boolean: { label: 'Toggle', pluralLabel: 'Toggles' },
	input_select: { label: 'Picker', pluralLabel: 'Pickers' },
	input_number: { label: 'Number', pluralLabel: 'Numbers' },
	person: { label: 'Person', pluralLabel: 'People' }
};

/**
 * Compose the right HA service call for a given entity + a default
 * action. The macro composer uses this when the user picks "Turn
 * on / off / toggle / fire" from a dropdown for a picked thing —
 * no manual domain.service typing.
 *
 * Returns null when the domain has no obvious default action
 * (sensors, binary_sensors — read-only).
 */
export interface DefaultAction {
	id: string;
	label: string;
	service: { domain: string; service: string; target?: { entity_id: string } };
}

export function defaultActionsFor(entityId: string): DefaultAction[] {
	const dot = entityId.indexOf('.');
	if (dot < 0) return [];
	const domain = entityId.slice(0, dot);
	const target = { entity_id: entityId };

	switch (domain) {
		case 'light':
		case 'switch':
		case 'input_boolean':
			return [
				{ id: 'toggle', label: 'Toggle', service: { domain, service: 'toggle', target } },
				{ id: 'on', label: 'Turn on', service: { domain, service: 'turn_on', target } },
				{ id: 'off', label: 'Turn off', service: { domain, service: 'turn_off', target } }
			];
		case 'scene':
			return [{ id: 'fire', label: 'Activate', service: { domain: 'scene', service: 'turn_on', target } }];
		case 'script':
			return [{ id: 'fire', label: 'Run', service: { domain: 'script', service: 'turn_on', target } }];
		case 'automation':
			return [
				{ id: 'fire', label: 'Trigger', service: { domain: 'automation', service: 'trigger', target } },
				{ id: 'on', label: 'Enable', service: { domain: 'automation', service: 'turn_on', target } },
				{ id: 'off', label: 'Disable', service: { domain: 'automation', service: 'turn_off', target } }
			];
		case 'cover':
			return [
				{ id: 'open', label: 'Open', service: { domain: 'cover', service: 'open_cover', target } },
				{ id: 'close', label: 'Close', service: { domain: 'cover', service: 'close_cover', target } }
			];
		case 'lock':
			return [{ id: 'unlock', label: 'Unlock', service: { domain: 'lock', service: 'unlock', target } }];
		case 'media_player':
			return [
				{ id: 'play_pause', label: 'Play / pause', service: { domain, service: 'media_play_pause', target } },
				{ id: 'on', label: 'Turn on', service: { domain, service: 'turn_on', target } },
				{ id: 'off', label: 'Turn off', service: { domain, service: 'turn_off', target } }
			];
		case 'climate':
			return [{ id: 'set_temp', label: 'Set temperature', service: { domain, service: 'set_temperature', target } }];
		case 'input_select':
		case 'select':
			return [{ id: 'next', label: 'Next option', service: { domain, service: 'select_next', target } }];
		default:
			return [];
	}
}
