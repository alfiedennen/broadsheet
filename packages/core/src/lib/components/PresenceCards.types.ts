/**
 * Type contract for PresenceCards.svelte. Lives in a sibling .ts so
 * consumers (other core pages, plugins) can `import type` without
 * pulling in the Svelte component itself.
 */

import type { DomainPerson } from '$lib/discovery';

export interface PresenceCard {
	person: DomainPerson;
	paintingUrl: string | null;
	locationLabel: string;
	away: boolean;
	/**
	 * Theme H: optional InlinePin destination for the location label.
	 * When set, the tile wraps locationLabel in a pencil that
	 * navigate-with-context jumps to the override surface (typically
	 * /settings/people#person.<id>). Page populates this; component
	 * just renders.
	 */
	locationPinHref?: string;
	/**
	 * Theme H: optional InlinePin destination for the painting slot
	 * when paintingUrl is null. Surfaces "you can upload a painting
	 * for this room" affordance. Typically navigates to the
	 * emanations config for the current area.
	 */
	paintingPinHref?: string;
	/**
	 * Theme H: confidence indicator on the location label.
	 *   'auto'       — broadsheet's auto-pick (default, no underline)
	 *   'low'        — broadsheet guessed but isn't sure (dotted)
	 *   'overridden' — user has curated this binding (solid)
	 */
	locationConfidence?: 'auto' | 'low' | 'overridden';
}
