<script lang="ts">
	/**
	 * 0.9.1 — things-first editor: LEFT pane.
	 *
	 * The user's controllable things, grouped by room (then cross-area
	 * buckets for scenes / scripts / etc). Search at the top filters
	 * the tree case-insensitively across name / entity_id / area name.
	 *
	 * Two affordances per thing:
	 *   - Tap the row → onAddThing(entityId) → parent appends a `thing`
	 *     block to the canvas. Fast path for "I just want this on the
	 *     wall, broadsheet figures out the widget."
	 *   - Drag the row → HTML5 DnD with the entityId in dataTransfer.
	 *     ThingsCanvas listens for these drops to insert at a specific
	 *     position rather than just appending.
	 *
	 * Already-placed things show a small "✓ on canvas" badge so the
	 * user isn't surprised when the same entity ends up on the wall
	 * multiple times (which is sometimes deliberate — e.g. a scene
	 * tile near the lights AND in a "favourites" row).
	 *
	 * Spec: docs/plans/plan-9.1-wall-builder-things-first.md.
	 */

	import { discovery } from '$lib/discovery';
	import {
		buildBrowserTree,
		filterBrowserTree,
		type BrowserGroup,
		type BrowserThing
	} from '$lib/blocks/things-browser';

	interface Props {
		/** Append `{type:'thing', config:{entityId}}` to the canvas. */
		onAddThing: (entityId: string) => void;
		/**
		 * entityIds currently placed on the canvas — drives the "already
		 * here" badge so duplicate placements aren't surprising.
		 */
		placedIds?: Set<string>;
	}

	let { onAddThing, placedIds = new Set() }: Props = $props();

	let query = $state('');

	// Build the tree from discovery's areas (reactive — areas change
	// when curation renames/hides/floors-resort or HA refreshes
	// registries). Filter folds in the search query.
	const tree = $derived(buildBrowserTree(discovery.areas));
	const filtered = $derived(filterBrowserTree(tree, query));

	/**
	 * Per-group collapsed state, keyed by group.id. Lazy semantics:
	 * if a group hasn't been toggled by the user, its collapsed
	 * value comes from group.defaultCollapsed. Toggling overrides.
	 *
	 * Searching forces all matching groups expanded (the filter
	 * function sets defaultCollapsed: false on every result group),
	 * but we still consult our override map so the user's manual
	 * collapse-state persists for non-matching searches.
	 */
	let collapsedOverride = $state<Record<string, boolean>>({});

	function isCollapsed(g: BrowserGroup): boolean {
		const o = collapsedOverride[g.id];
		return o === undefined ? g.defaultCollapsed : o;
	}

	function toggleCollapsed(g: BrowserGroup) {
		const cur = isCollapsed(g);
		collapsedOverride = { ...collapsedOverride, [g.id]: !cur };
	}

	function handleDragStart(e: DragEvent, thing: BrowserThing) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'copy';
		// Custom MIME type so the canvas can distinguish "browser
		// thing drop" from "block-row reorder drop".
		e.dataTransfer.setData('application/x-broadsheet-entity', thing.entityId);
		// Fallback for browsers that drop the custom MIME on drag-leave.
		e.dataTransfer.setData('text/plain', thing.entityId);
	}

	function handleTap(thing: BrowserThing) {
		onAddThing(thing.entityId);
	}

	/** Convert mdi:foo-bar to a short text chip for the row icon column. */
	function iconChip(icon: string | null | undefined): string {
		if (!icon) return '·';
		// Strip mdi: prefix; truncate at ~3 chars so the column stays narrow.
		return icon.replace(/^mdi:/, '').slice(0, 3);
	}

	function domainTag(domain: string): string {
		// Short uppercase tag — light → LIGHT, media_player → MEDIA, etc.
		if (domain === 'media_player') return 'MEDIA';
		if (domain === 'binary_sensor') return 'BINSEN';
		if (domain === 'input_boolean') return 'BOOL';
		if (domain === 'input_select') return 'SEL';
		if (domain === 'input_number') return 'NUM';
		return domain.toUpperCase().slice(0, 6);
	}
</script>

<aside class="things-browser" aria-label="Things browser">
	<header class="browser-head">
		<strong class="browser-title">Things</strong>
		<span class="browser-count">
			{tree.reduce((n, g) => n + g.things.length, 0)} total
		</span>
	</header>

	<input
		type="search"
		class="browser-search"
		placeholder="Search things, rooms, entity_ids…"
		bind:value={query}
		aria-label="Search things"
	/>

	{#if filtered.length === 0}
		<p class="browser-empty">
			{#if query}
				No things match "<em>{query}</em>". Try a shorter word, a
				room name, or an entity_id fragment.
			{:else}
				No things discovered yet. Open <a href="settings/house">house
				settings</a> to make sure broadsheet has the entities you
				expect, or check the Home Assistant connection.
			{/if}
		</p>
	{:else}
		<ol class="browser-groups">
			{#each filtered as group (group.id)}
				{@const collapsed = isCollapsed(group)}
				<li class="browser-group" class:collapsed>
					<button
						class="group-head"
						type="button"
						onclick={() => toggleCollapsed(group)}
						aria-expanded={!collapsed}
					>
						<span class="group-caret" aria-hidden="true">
							{collapsed ? '▸' : '▾'}
						</span>
						<span class="group-label">{group.label}</span>
						<span class="group-count">{group.things.length}</span>
					</button>
					{#if !collapsed}
						<ul class="group-things">
							{#each group.things as thing (thing.entityId)}
								{@const placed = placedIds.has(thing.entityId)}
								<li class="thing-row" class:placed>
									<button
										type="button"
										class="thing-tap"
										onclick={() => handleTap(thing)}
										draggable="true"
										ondragstart={(e) => handleDragStart(e, thing)}
										title="Tap to add — or drag onto the canvas"
									>
										<span class="thing-icon" aria-hidden="true">
											{iconChip(thing.icon)}
										</span>
										<span class="thing-text">
											<span class="thing-name">{thing.name}</span>
											<span class="thing-meta">
												<span class="thing-domain">{domainTag(thing.domain)}</span>
												<span class="thing-id">{thing.entityId}</span>
											</span>
										</span>
										{#if placed}
											<span class="thing-placed" title="Already on the canvas">
												✓
											</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</aside>

<style>
	.things-browser {
		display: flex;
		flex-direction: column;
		min-height: 0;
		font-family: var(--font-body);
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 4px;
		overflow: hidden;
	}

	.browser-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.75rem 1rem 0.5rem;
		border-bottom: 1px solid var(--border, #2a261e);
	}
	.browser-title {
		font-family: var(--font-display, var(--font-body));
		font-style: italic;
		color: var(--accent);
		font-size: 1.05rem;
	}
	.browser-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}

	.browser-search {
		margin: 0.5rem 1rem 0.5rem;
		padding: 0.4rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
	}
	.browser-search:focus {
		outline: none;
		border-color: var(--accent);
	}

	.browser-empty {
		margin: 1rem;
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.browser-empty a {
		color: var(--accent);
	}

	.browser-groups {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		flex: 1 1 auto;
	}

	.browser-group {
		border-top: 1px solid var(--border, #2a261e);
	}
	.browser-group:first-child {
		border-top: none;
	}

	.group-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 1rem;
		background: transparent;
		border: none;
		color: var(--fg);
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		cursor: pointer;
	}
	.group-head:hover {
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
		color: var(--accent);
	}
	.group-caret {
		font-family: var(--font-mono);
		color: var(--fg-muted);
		width: 1ch;
	}
	.group-label {
		flex: 1 1 auto;
	}
	.group-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}

	.group-things {
		list-style: none;
		margin: 0;
		padding: 0 0 0.25rem;
	}

	.thing-row {
		display: block;
	}
	.thing-row.placed .thing-tap {
		background: var(--accent-glow, rgba(192, 138, 74, 0.04));
	}

	.thing-tap {
		display: grid;
		grid-template-columns: 2.25rem 1fr auto;
		gap: 0.5rem;
		align-items: center;
		width: 100%;
		padding: 0.4rem 1rem 0.4rem 1.5rem;
		background: transparent;
		border: none;
		text-align: left;
		color: var(--fg);
		font-family: var(--font-body);
		cursor: grab;
	}
	.thing-tap:hover {
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}
	.thing-tap:active {
		cursor: grabbing;
	}

	.thing-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.25rem;
		height: 1.6rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--fg-muted);
		border: 1px solid var(--border, #2a261e);
		border-radius: 2px;
		text-transform: uppercase;
	}

	.thing-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.thing-name {
		font-size: 0.88rem;
		line-height: 1.25;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.thing-meta {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		min-width: 0;
	}
	.thing-domain {
		color: var(--accent);
		letter-spacing: 0.03em;
		flex: 0 0 auto;
	}
	.thing-id {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.thing-placed {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--accent);
	}
</style>
