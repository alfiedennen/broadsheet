/**
 * Alerts engine — generates "what needs your attention" cards for
 * the /settings landing page.
 *
 * Pure function of (discovery, curation, connection). Reactive
 * via $derived in the consuming page.
 *
 * Spec: ../../../docs/SETTINGS-UI.md § "Alert classes"
 *       ../../../docs/PREMORTEM-DIFF.md § "Alert classes — add three more"
 */

import { discovery } from '$lib/discovery';
import { curationStore } from './store.svelte';
import { connection } from '$lib/stores/connection.svelte';
import { base } from '$app/paths';

// SvelteKit's $app/paths.base is the URL prefix all internal links must
// carry. Empty string in dev / standalone, but under HA Ingress it
// resolves to "/api/hassio_ingress/<token>". V3 manual dogfood (BUG B-2):
// every alert href below was a bare absolute path like "/settings/house/"
// which resolved against the HA-Core origin root instead of broadsheet's
// ingress prefix — 404 on every click. Prefix once via this helper.
const href = (path: string) => `${base}${path}`;

export type AlertSeverity = 'info' | 'attention' | 'urgent';

export interface Alert {
	id: string;
	severity: AlertSeverity;
	title: string;
	body: string;
	cta?: { label: string; href: string };
}

/**
 * Compute the active alert list. Order is deliberate: most-impactful
 * first. Pages that surface this should respect order.
 */
export function computeAlerts(): Alert[] {
	const out: Alert[] = [];

	// 1. Unsorted bucket — only the DEVICE-BACKED cohort is actionable.
	// Helpers, automations, scripts, scenes, template sensors etc. are
	// legitimately place-less; broadsheet never surfaces them on editorial
	// pages anyway. Counting the whole bucket (the old behaviour) made a
	// perfectly normal big install look broken.
	const unsorted = discovery.unsorted;
	if (unsorted) {
		const visible = [
			...unsorted.lights,
			...unsorted.switches,
			...unsorted.climates,
			...unsorted.locks,
			...unsorted.contacts,
			...unsorted.cameras,
			...unsorted.media,
			...unsorted.tvs,
			...unsorted.remotes,
			...unsorted.sensors,
			...unsorted.scenes,
			...unsorted.otherEntities
		];
		const needRoom = visible.filter((e) => e.deviceId !== null).length;
		const placeless = visible.length - needRoom;
		if (needRoom > 0) {
			const one = needRoom === 1;
			const helpers =
				placeless > 0
					? ` (${placeless} helpers, automations & scenes are also unsorted — that's normal, they have no physical place.)`
					: '';
			out.push({
				id: 'unsorted-entities',
				severity: 'attention',
				title: `${needRoom} ${one ? 'device needs' : 'devices need'} a room`,
				body:
					`${one ? 'A device-backed entity' : 'Device-backed entities'} HA hasn't been ` +
					`told a room for — assign ${one ? 'it' : 'them'} in House.${helpers}`,
				cta: { label: 'Fix in House', href: href('/settings/house/') }
			});
		}
	}

	// 2. Person without a presence sensor (suggested OR overridden)
	for (const p of discovery.persons) {
		const override = curationStore.current.people.find((x) => x.personId === p.id);
		const effective =
			override !== undefined ? override.presenceSensorId : p.suggestedPresenceSensor;
		if (!effective) {
			out.push({
				id: `person-no-sensor-${p.id}`,
				severity: 'attention',
				title: `${p.name}'s presence sensor isn't picked yet`,
				body: `broadsheet defaulted to nothing — pick a tracker or sensor for this person.`,
				cta: { label: 'Fix in People', href: href('/settings/people/') }
			});
		}
	}

	// 3. Person with iOS device class — gentle warning
	for (const p of discovery.persons) {
		if (p.deviceClass === 'ios') {
			const override = curationStore.current.people.find((x) => x.personId === p.id);
			const sensorId = override?.presenceSensorId ?? p.suggestedPresenceSensor;
			// Only warn if they're using an iOS GPS tracker (not a BLE / committed_room sensor)
			if (sensorId && /iphone|ipad/i.test(sensorId) && !/_ble$|_committed_room$/i.test(sensorId)) {
				out.push({
					id: `ios-gps-${p.id}`,
					severity: 'info',
					title: `${p.name}'s presence may go stale`,
					body: `iOS Companion App suspends GPS in deep-sleep — readings can stick on "home" for hours after leaving. Prefer a BLE tracker or server-side committed_room sensor.`,
					cta: { label: 'Pick a different sensor', href: href('/settings/people/') }
				});
			}
		}
	}

	// 4. Entities hidden — HA's own `hidden_by` + broadsheet's auto-hide
	// (duplicates, system plumbing). Counted from the per-area
	// `hiddenEntities` lists — the ACTUAL hidden set. The old version
	// subtracted visible-from-raw, which swept in skipped
	// config/diagnostic/disabled entities and badly over-counted.
	const hiddenCount = discovery.areas.reduce((acc, a) => acc + a.hiddenEntities.length, 0);
	if (hiddenCount > 20) {
		out.push({
			id: 'integration-hidden',
			severity: 'info',
			title: `${hiddenCount} entities are hidden`,
			body: `Hidden by their integration, or auto-hidden by broadsheet (duplicates, system plumbing). Unhide individually in House if needed.`,
			cta: { label: 'Browse all entities', href: href('/settings/house/') }
		});
	}

	// 5. Connection unstable (5+ reconnects)
	if (connection.reconnectAttempts >= 5) {
		out.push({
			id: 'connection-flapping',
			severity: 'urgent',
			title: 'Connection has been unstable',
			body: `${connection.reconnectAttempts} reconnects detected. Check your HA + network.`,
			cta: { label: 'Diagnose', href: href('/settings/about/') }
		});
	}

	// 6. Connection fatal
	if (connection.status === 'fatal') {
		out.push({
			id: 'connection-fatal',
			severity: 'urgent',
			title: 'Connection failed',
			body: connection.lastError ?? 'Unknown error.',
			cta: { label: 'Re-setup', href: href('/setup/') }
		});
	}

	// 7. Last curation save error
	if (curationStore.lastError) {
		out.push({
			id: 'curation-save-error',
			severity: 'urgent',
			title: 'Last settings change failed to save',
			body: curationStore.lastError,
			cta: { label: 'Retry from About', href: href('/settings/about/') }
		});
	}

	return out;
}
