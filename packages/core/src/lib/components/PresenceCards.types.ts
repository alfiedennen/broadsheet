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
}
