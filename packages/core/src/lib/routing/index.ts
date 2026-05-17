/**
 * Theme C — presence-aware routing.
 *
 * The V3 dogfood report surfaced a repeating pattern: actions are
 * addressed to ENTITIES (a specific media_player, a specific
 * dashboard) when really they want a PERSON ("speak to Alfie, wherever
 * Alfie is"). broadsheet already knows where each person is via the
 * unified presence resolver in `$lib/presence`. This layer turns that
 * into a routing primitive plugins can consume:
 *
 *   const target = routeTo(alfie, 'audio', ctx);
 *   if (target) await callService('tts', 'speak', { entity_id: target.entityId });
 *
 * Three modalities for v0.6:
 *   - 'audio'        → first media_player in the person's current room
 *   - 'screen'       → first TV / cast device in their current room
 *   - 'notification' → mobile_app notify service derived from their
 *                       device_trackers
 *
 * Plugins consume; they don't pick endpoints directly. Future v0.6.x:
 * a per-person `routingOverrides` curation field for the cases where
 * the heuristic picks wrong (parallel to the `presenceSensorId`
 * override on PersonOverride).
 *
 * Spec: .dogfood/V3-PIVOT-TO-V02.md § C (presence-aware routing).
 */

import type { DomainArea, DomainPerson } from '$lib/discovery';
import type { State } from '$lib/ha/types';
import { resolvePersonPresence } from '$lib/presence';

export type RouteModality = 'audio' | 'screen' | 'notification';

export interface RouteTarget {
	entityId: string;
	/**
	 * Short human-readable explanation of WHY this endpoint was
	 * picked. Surfaced in logs + (eventually) in /settings/routing
	 * for transparency. E.g. "in their current room (Office)",
	 * "household fallback — no in-room media_player".
	 */
	reason: string;
	/**
	 * How confident the router is. 'in-room' is the strong case;
	 * 'fallback' fires when the in-room sweep finds nothing and we
	 * picked a household-wide default; 'guess' is the last-resort
	 * "we have to pick something — try this".
	 */
	confidence: 'in-room' | 'fallback' | 'guess';
}

export interface RouteContext {
	/** Reactive snapshot of HA entity states. */
	states: Record<string, State>;
	/** All discovered areas (used for the in-room sweep). */
	areas: DomainArea[];
	/**
	 * Per-person presence-sensor overrides — same shape as the manifest
	 * resolver expects. Forwards to resolvePersonPresence so routing
	 * sees the SAME room the home tile + manifest line see.
	 */
	personOverrides?: Record<string, string | null>;
}

/**
 * Route an action to a person via the given modality.
 *
 * Returns null when no target can be found — callers MUST handle this
 * case (silent fail, fallback to a default, or surface the gap to the
 * user). Routing never throws.
 */
export function routeTo(
	person: DomainPerson,
	modality: RouteModality,
	ctx: RouteContext
): RouteTarget | null {
	// 1. Find the person's current area via the unified resolver.
	const presence = resolvePersonPresence(person, {
		personOverrides: ctx.personOverrides ?? {},
		states: ctx.states,
		areas: ctx.areas
	});

	const currentArea = presence.home ? presence.area : null;

	// 2. Modality-specific routing.
	switch (modality) {
		case 'audio':
			return routeAudio(person, currentArea, ctx);
		case 'screen':
			return routeScreen(person, currentArea, ctx);
		case 'notification':
			return routeNotification(person, ctx);
	}
}

/* ── Audio routing ─────────────────────────────────────────────────── */

function routeAudio(
	person: DomainPerson,
	currentArea: DomainArea | null,
	ctx: RouteContext
): RouteTarget | null {
	// In-room media_player wins.
	if (currentArea && currentArea.media.length > 0) {
		const e = currentArea.media[0];
		return {
			entityId: e.id,
			reason: `in their current room (${currentArea.name})`,
			confidence: 'in-room'
		};
	}

	// Fallback: any media_player anywhere in the house. Better than
	// silence — the user can hear it from another room.
	for (const a of ctx.areas) {
		if (a.media.length > 0) {
			return {
				entityId: a.media[0].id,
				reason: `household fallback — no in-room media_player (using ${a.name})`,
				confidence: 'fallback'
			};
		}
	}

	// Last-resort guess: first media_player entity in any state.
	const anyMedia = Object.keys(ctx.states).find((id) => id.startsWith('media_player.'));
	if (anyMedia) {
		return {
			entityId: anyMedia,
			reason: 'guess — no in-room or in-house media_player found',
			confidence: 'guess'
		};
	}

	// Genuinely nothing. Tell the caller.
	void person; // satisfy lint
	return null;
}

/* ── Screen routing ────────────────────────────────────────────────── */

function routeScreen(
	person: DomainPerson,
	currentArea: DomainArea | null,
	ctx: RouteContext
): RouteTarget | null {
	// In-room TV / cast device wins.
	if (currentArea && currentArea.tvs.length > 0) {
		const e = currentArea.tvs[0];
		return {
			entityId: e.id,
			reason: `in their current room (${currentArea.name})`,
			confidence: 'in-room'
		};
	}

	// Fallback: any TV in the house.
	for (const a of ctx.areas) {
		if (a.tvs.length > 0) {
			return {
				entityId: a.tvs[0].id,
				reason: `household fallback — no in-room screen (using ${a.name})`,
				confidence: 'fallback'
			};
		}
	}

	void person;
	return null;
}

/* ── Notification routing ──────────────────────────────────────────── */

/**
 * `mobile_app_<device_id>` is HA's Companion App notify service
 * pattern. We extract the device_id slug from the person's
 * device_trackers, where iOS / Android Companion apps register as
 * `device_tracker.<device_id>` AND `notify.mobile_app_<device_id>`.
 */
function routeNotification(
	person: DomainPerson,
	ctx: RouteContext
): RouteTarget | null {
	// Walk the person's device_trackers, looking for one with a
	// matching notify.mobile_app_<id> in the state machine.
	for (const trackerId of person.deviceTrackers ?? []) {
		if (!trackerId.startsWith('device_tracker.')) continue;
		const slug = trackerId.slice('device_tracker.'.length);
		const notifyId = `notify.mobile_app_${slug}`;
		// notify.* services don't have a 1-1 entity state; instead we
		// check that the device_tracker itself exists + is reporting
		// (proxy for "the Companion App is alive on that device").
		const trackerState = ctx.states[trackerId];
		if (trackerState && trackerState.state !== 'unavailable') {
			return {
				entityId: notifyId,
				reason: `${person.name}'s Companion App (${slug})`,
				confidence: 'in-room'
			};
		}
	}

	// No working Companion App found. The caller should fall back to
	// audio or just skip the notification.
	return null;
}

/* ── Convenience helper for households ─────────────────────────────── */

/**
 * Route to every person in a list. Returns one entry per person
 * (null included when routing failed for them); callers iterate +
 * dispatch as needed.
 */
export function routeToAll(
	persons: readonly DomainPerson[],
	modality: RouteModality,
	ctx: RouteContext
): Array<{ person: DomainPerson; target: RouteTarget | null }> {
	return persons.map((person) => ({
		person,
		target: routeTo(person, modality, ctx)
	}));
}

/**
 * Build a RouteContext from the live broadsheet stores. Convenience
 * for plugin code that doesn't want to thread states + areas + the
 * personOverrides map by hand. Plugin code should call this once per
 * dispatch (cheap — just a snapshot read), not store the result.
 */
export function buildRouteContext(
	personOverrides: Record<string, string | null>,
	states: Record<string, State>,
	areas: DomainArea[]
): RouteContext {
	return { personOverrides, states, areas };
}
