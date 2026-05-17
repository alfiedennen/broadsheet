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
import { pluginLoader } from '$lib/plugins/loader.svelte';
import { FLOWS } from '$lib/flows/definitions';
import { buildFlowStepContext, countDone, isFlowComplete, firstIncompleteIndex } from '$lib/flows/context';

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

	// Theme H: auto-inference gaps. The "everything broadsheet
	// auto-decided that the user might want to override" inventory.
	// Each surfaces with a CTA that navigates to the relevant
	// settings surface with the right row pre-flashed
	// (via hash-navigate target ids).

	// 4a. Areas auto-humanized from raw HA slugs (low confidence).
	const slugAreas = discovery.areas.filter(
		(a) => a.id !== '__unsorted__' && a.wasHumanized
	);
	if (slugAreas.length > 0) {
		const one = slugAreas.length === 1;
		const sample = slugAreas
			.slice(0, 3)
			.map((a) => a.name)
			.join(', ');
		out.push({
			id: 'slug-area-names',
			severity: 'info',
			title: `${slugAreas.length} ${one ? 'room could use a friendlier name' : 'rooms could use friendlier names'}`,
			body: `${sample}${slugAreas.length > 3 ? ` + ${slugAreas.length - 3} more` : ''}. broadsheet's title-cased the underlying slugs; rename in House for the editorial register.`,
			cta: {
				label: one ? 'Rename in House' : 'Browse rooms',
				href: href('/settings/house/')
			}
		});
	}

	// 4b. Persons home but in-room with no painting mapped, when
	// emanations is enabled. Encourages users to actually populate
	// the painting set after enabling the plugin.
	const emanationsEnabled =
		curationStore.current.plugins?.['emanations']?.enabled === true;
	if (emanationsEnabled && discovery.persons.length > 0) {
		// Reuse paintingSets curation shape from the home page logic.
		// Best-effort lookup; if curation is missing the field, treat
		// as "no paintings".
		const paintingSets = (curationStore.current.plugins?.['emanations']?.config
			?.paintingSets ?? {}) as {
			active?: string;
			sets?: Record<string, Record<string, Record<string, string | null>>>;
		};
		const active = paintingSets.active ?? 'default';
		const sets = paintingSets.sets?.[active] ?? {};
		// paintingSets shape (per home-page paintingForPerson):
		//   sets.<setName>.<areaId>.<personSlug> = filename | null
		// Outer Object.values iterates setName → areaMap;
		// Inner Object.values iterates areaId → personMap;
		// personMap[personSlug] is the filename (or null/undefined).
		let missing = 0;
		for (const p of discovery.persons) {
			const personSlug = p.id.replace(/^person\./, '');
			let hasAny = false;
			outer: for (const areaMap of Object.values(sets)) {
				for (const personMap of Object.values(areaMap ?? {})) {
					const pm = personMap as Record<string, string | null> | null | undefined;
					if (pm?.[personSlug]) {
						hasAny = true;
						break outer;
					}
				}
			}
			if (!hasAny) missing++;
		}
		if (missing > 0) {
			const one = missing === 1;
			out.push({
				id: 'missing-paintings',
				severity: 'info',
				title: `${missing} ${one ? 'person has' : 'people have'} no paintings yet`,
				body: `@broadsheet/emanations is enabled but no per-room paintings are mapped. Procedural orange fields render as a fallback; upload paintings to give each room its own face.`,
				cta: {
					label: 'Configure Emanations',
					href: href('/settings/plugins/emanations/config/')
				}
			});
		}
	}

	// 4c. Plugin enabled but missing required config — keyed by
	// well-known fields. Catches: harold-preset (Anthropic key),
	// tmdb-tv (TMDB API key).
	const plugins = curationStore.current.plugins ?? {};
	if (plugins['harold-preset']?.enabled) {
		const hpCfg = (plugins['harold-preset'].config ?? {}) as Record<string, unknown>;
		if (!hpCfg.anthropicKey) {
			out.push({
				id: 'harold-preset-no-key',
				severity: 'attention',
				title: 'Harold needs an Anthropic API key',
				body: 'The @broadsheet/harold-preset plugin is enabled but won\'t reach Claude until you paste a key (sk-ant-…) in its settings.',
				cta: {
					label: 'Add the key',
					href: href('/settings/plugins/harold-preset/config/')
				}
			});
		}
	}
	if (plugins['tmdb-tv']?.enabled) {
		const tmdbIntegration = curationStore.current.integrations?.tmdb;
		if (!tmdbIntegration?.apiKey) {
			out.push({
				id: 'tmdb-no-key',
				severity: 'attention',
				title: 'TMDB needs an API key',
				body: 'The @broadsheet/tmdb-tv plugin is enabled but Trending + New content rows on /tv won\'t populate without a free TMDB v4 read token.',
				cta: {
					label: 'Add the key',
					href: href('/settings/plugins/tmdb-tv/config/')
				}
			});
		}
	}

	// 4b. Theme B: incomplete onboarding flows.
	//
	// For every flow whose gate condition is met (`always` always
	// fires; `plugin-enabled:<id>` only fires when that plugin is on)
	// and which isn't fully complete, surface a "Resume setup →" card
	// with progress + a hash-link to the first incomplete step.
	const loadedPlugins = pluginLoader.registry.map((r) => r.plugin);
	const flowCtx = buildFlowStepContext(curationStore.current, {
		floors: discovery.floors,
		areas: discovery.areas,
		persons: discovery.persons
	});
	for (const flow of FLOWS) {
		// Evaluate gate first — cheaper than running every isComplete.
		if (flow.whenIncomplete === 'never') continue;
		if (flow.whenIncomplete.startsWith('plugin-enabled:')) {
			const gateId = flow.whenIncomplete.slice('plugin-enabled:'.length);
			const enabled = curationStore.current.plugins?.[gateId]?.enabled === true;
			if (!enabled) continue;
		}
		if (isFlowComplete(flow, loadedPlugins, flowCtx)) continue;

		const done = countDone(flow, loadedPlugins, flowCtx);
		const total = flow.steps.length;
		const next = firstIncompleteIndex(flow, loadedPlugins, flowCtx);
		// Hash-navigate the user straight to the first step that
		// actually needs them — landing them at the top would force a
		// scroll past completed steps every time they resume.
		const target = next >= 0 ? `#step-${next + 1}` : '';
		out.push({
			id: `flow-incomplete-${flow.id}`,
			severity: 'attention',
			title: flow.title,
			body: `${done} of ${total} done — ${flow.description}`,
			cta: {
				label: done > 0 ? 'Resume setup →' : 'Start setup →',
				href: href(`/settings/setup/${flow.id}/${target}`)
			}
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
