/**
 * Hash-navigate helper — Theme H navigate-with-context support.
 *
 * When a user clicks an InlinePin's "navigate" variant, the target
 * URL carries a fragment identifying the row/field they want to
 * land on (e.g. `/settings/people#person.alfie_dennen`). The
 * destination page calls `wireHashHighlight()` in onMount to:
 *
 *   1. Find the element with `id` matching the fragment (after
 *      stripping the `#`)
 *   2. Scroll it into view
 *   3. Add the `.bs-highlighted` class for a flash effect
 *   4. Remove the class after 2.5s so the page returns to rest
 *
 * Page-side requirement: render each target with a matching `id`
 * attribute. E.g. /settings/people renders `<section id="person.alfie_dennen">`.
 *
 * Style requirement: the page's stylesheet defines `.bs-highlighted`
 * with a brief warm-accent treatment (typically a transient
 * background tint + ring). See the per-page styles for details.
 *
 * Spec: docs/plans/plan-theme-H-inline-overrides.md.
 */

const HIGHLIGHT_CLASS = 'bs-highlighted';
const HIGHLIGHT_MS = 2500;
const SCROLL_DELAY_MS = 50; // wait one rAF tick for the page to settle

/**
 * Wire hash-navigate highlight on the current page. Call from
 * onMount. Idempotent — safe to call multiple times; only the
 * latest call's hash applies.
 *
 * @returns A cleanup function (no-op currently — kept for symmetry
 *          with Svelte's onMount → return cleanup pattern).
 */
export function wireHashHighlight(): () => void {
	if (typeof window === 'undefined') return () => {};
	const hash = window.location.hash;
	if (!hash || hash.length < 2) return () => {};
	const targetId = decodeURIComponent(hash.slice(1));

	// Defer one tick so the page has fully rendered any reactive
	// children that the fragment might address.
	setTimeout(() => {
		const el = document.getElementById(targetId);
		if (!el) {
			// Not necessarily an error — the user may have bookmarked
			// a fragment for an element that's no longer there (e.g.
			// a person they removed, a plugin they uninstalled).
			// eslint-disable-next-line no-console
			console.debug(
				`[broadsheet] hash-navigate: no element with id ${JSON.stringify(targetId)}`
			);
			return;
		}
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		el.classList.add(HIGHLIGHT_CLASS);
		setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
	}, SCROLL_DELAY_MS);

	return () => {};
}
