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

	// 1. Unsorted bucket has entities → curation gap
	const unsorted = discovery.unsorted;
	if (unsorted && unsorted.entityCount > 0) {
		out.push({
			id: 'unsorted-entities',
			severity: 'attention',
			title: `${unsorted.entityCount} entities couldn't be auto-grouped`,
			body: `They're in your "Unsorted" sections. Assign them to rooms in HA, or pin them to pages here.`,
			cta: { label: 'Fix in House', href: '/settings/house/' }
		});
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
				cta: { label: 'Fix in People', href: '/settings/people/' }
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
					cta: { label: 'Pick a different sensor', href: '/settings/people/' }
				});
			}
		}
	}

	// 4. Many entities have hidden_by integration — info
	const hiddenByIntegrationCount = discovery.areas.reduce((acc, a) => {
		// Count visible+invisible per area is hard; this is a rough heuristic
		return acc + a.entityCount;
	}, 0);
	if (hiddenByIntegrationCount > 0 && discovery.rawCounts.entities - hiddenByIntegrationCount > 50) {
		out.push({
			id: 'integration-hidden',
			severity: 'info',
			title: `${discovery.rawCounts.entities - hiddenByIntegrationCount} entities are hidden`,
			body: `Most are hidden by their integrations (config, diagnostic, internal). You can unhide individually if needed.`,
			cta: { label: 'Browse all entities', href: '/settings/house/' }
		});
	}

	// 5. Connection unstable (5+ reconnects)
	if (connection.reconnectAttempts >= 5) {
		out.push({
			id: 'connection-flapping',
			severity: 'urgent',
			title: 'Connection has been unstable',
			body: `${connection.reconnectAttempts} reconnects detected. Check your HA + network.`,
			cta: { label: 'Diagnose', href: '/settings/about/' }
		});
	}

	// 6. Connection fatal
	if (connection.status === 'fatal') {
		out.push({
			id: 'connection-fatal',
			severity: 'urgent',
			title: 'Connection failed',
			body: connection.lastError ?? 'Unknown error.',
			cta: { label: 'Re-setup', href: '/setup/' }
		});
	}

	// 7. Last curation save error
	if (curationStore.lastError) {
		out.push({
			id: 'curation-save-error',
			severity: 'urgent',
			title: 'Last settings change failed to save',
			body: curationStore.lastError,
			cta: { label: 'Retry from About', href: '/settings/about/' }
		});
	}

	return out;
}
