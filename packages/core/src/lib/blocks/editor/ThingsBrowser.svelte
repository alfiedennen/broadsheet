<script lang="ts">
	/**
	 * 0.9.2 — things-first editor: LEFT pane, accomplishments-led.
	 *
	 * The user's controllable things rendered as VERB rows, grouped
	 * by area and broken into sub-groups (Lights / TV / Climate /
	 * Locks / …). Cross-area buckets (Scenes / Scripts / etc.) come
	 * after the area groups.
	 *
	 * Each row is an `AccomplishmentRecipe`: a named verb that
	 * produces ≥ 1 blocks when tapped or dropped. Tap → onAddRecipe
	 * (parent appends all of recipe.blocks). Drag → DataTransfer
	 * carries `application/x-broadsheet-recipe-id` so the canvas can
	 * look up the recipe and insert its blocks at the drop position.
	 *
	 * Placed-tracking: a recipe shows "✓ placed" when every
	 * referencedEntityId already has a `thing` block on the canvas.
	 *
	 * Spec: docs/plans/plan-9.2-browser-accomplishments.md.
	 */

	import { discovery } from '$lib/discovery';
	import {
		buildBrowserTree,
		filterBrowserTree,
		countRecipes,
		type AccomplishmentRecipe,
		type BrowserGroup,
		type BrowserSubGroup
	} from '$lib/blocks/things-browser';

	interface Props {
		/** Append all of recipe.blocks to the canvas. */
		onAddRecipe: (recipe: AccomplishmentRecipe) => void;
		/**
		 * entity_ids currently placed as `thing` blocks on the canvas.
		 * Drives the "✓ placed" badge — a recipe is "placed" when every
		 * referenced entity is already there.
		 */
		placedIds?: Set<string>;
	}

	let { onAddRecipe, placedIds = new Set() }: Props = $props();

	let query = $state('');

	const tree = $derived(buildBrowserTree(discovery.areas));
	const filtered = $derived(filterBrowserTree(tree, query));
	const totalRecipes = $derived(countRecipes(tree));

	/**
	 * Per-group + per-subgroup collapsed override. Searching forces
	 * all matching groups expanded; user's manual toggles persist
	 * for non-matching searches.
	 */
	let groupCollapsedOverride = $state<Record<string, boolean>>({});
	let subGroupCollapsedOverride = $state<Record<string, boolean>>({});

	function isGroupCollapsed(g: BrowserGroup): boolean {
		const o = groupCollapsedOverride[g.id];
		return o === undefined ? g.defaultCollapsed : o;
	}
	function toggleGroup(g: BrowserGroup) {
		const cur = isGroupCollapsed(g);
		groupCollapsedOverride = { ...groupCollapsedOverride, [g.id]: !cur };
	}

	/** Sub-groups default-expanded; user can collapse a sub-group to hide its rows. */
	function isSubGroupCollapsed(sg: BrowserSubGroup): boolean {
		return !!subGroupCollapsedOverride[sg.id];
	}
	function toggleSubGroup(sg: BrowserSubGroup) {
		subGroupCollapsedOverride = {
			...subGroupCollapsedOverride,
			[sg.id]: !isSubGroupCollapsed(sg)
		};
	}

	function isRecipePlaced(recipe: AccomplishmentRecipe): boolean {
		if (recipe.referencedEntityIds.length === 0) return false;
		return recipe.referencedEntityIds.every((id) => placedIds.has(id));
	}

	function handleDragStart(e: DragEvent, recipe: AccomplishmentRecipe) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'copy';
		// Carry the recipe id; the canvas looks the recipe up in its own
		// derived tree on drop. Smaller than serialising the whole
		// recipe and survives the canvas-side dedup.
		e.dataTransfer.setData('application/x-broadsheet-recipe-id', recipe.id);
		// Also carry the full payload as a fallback — useful for cross-
		// frame drops where the canvas's `discovery` snapshot might be
		// briefly out of sync with the browser's.
		e.dataTransfer.setData('application/x-broadsheet-recipe', JSON.stringify(recipe));
		// Plain-text fallback — first entity_id so old drop handlers
		// degrade gracefully to single-thing inserts.
		if (recipe.referencedEntityIds[0]) {
			e.dataTransfer.setData('text/plain', recipe.referencedEntityIds[0]);
		}
	}

	function handleTap(recipe: AccomplishmentRecipe) {
		onAddRecipe(recipe);
	}

	/** Glyph for the row icon column: 3-char chip from mdi:* or '·'. */
	function iconChip(icon: string | null | undefined): string {
		if (!icon) return '·';
		return icon.replace(/^mdi:/, '').slice(0, 3);
	}

	/** ▸ for composed (multi-block) recipes; · for atomic (1-block). */
	function recipeGlyph(recipe: AccomplishmentRecipe): string {
		return recipe.blocks.length > 1 ? '▸' : '·';
	}

	/** True iff this group is a single-subgroup group (e.g. a cross-area bucket).
	 *  In that case we hide the sub-group header — it would just duplicate
	 *  the group label. */
	function shouldShowSubGroupHeader(g: BrowserGroup): boolean {
		return g.subGroups.length > 1;
	}
</script>

<aside class="things-browser" aria-label="Things browser">
	<header class="browser-head">
		<strong class="browser-title">Things</strong>
		<span class="browser-count">{totalRecipes} total</span>
	</header>

	<input
		type="search"
		class="browser-search"
		placeholder="Search: 'lights off', 'TV on', area name, entity_id…"
		bind:value={query}
		aria-label="Search things"
	/>

	{#if filtered.length === 0}
		<p class="browser-empty">
			{#if query}
				No accomplishments match "<em>{query}</em>". Try a shorter
				word, a room name, an entity_id fragment, or a verb like
				"off" / "toggle" / "boost".
			{:else}
				No things discovered yet. Open <a href="settings/house">house
				settings</a> to make sure broadsheet has the entities you
				expect, or check the Home Assistant connection.
			{/if}
		</p>
	{:else}
		<ol class="browser-groups">
			{#each filtered as group (group.id)}
				{@const groupCollapsed = isGroupCollapsed(group)}
				<li class="browser-group" class:collapsed={groupCollapsed}>
					<button
						class="group-head"
						type="button"
						onclick={() => toggleGroup(group)}
						aria-expanded={!groupCollapsed}
					>
						<span class="group-caret" aria-hidden="true">
							{groupCollapsed ? '▸' : '▾'}
						</span>
						<span class="group-label">{group.label}</span>
						<span class="group-count">
							{group.subGroups.reduce((n, sg) => n + sg.recipes.length, 0)}
						</span>
					</button>
					{#if !groupCollapsed}
						<div class="group-body">
							{#each group.subGroups as sg (sg.id)}
								{@const sgCollapsed = isSubGroupCollapsed(sg)}
								<div class="sub-group" class:collapsed={sgCollapsed}>
									{#if shouldShowSubGroupHeader(group)}
										<button
											class="sub-group-head"
											type="button"
											onclick={() => toggleSubGroup(sg)}
											aria-expanded={!sgCollapsed}
										>
											<span class="sub-group-caret" aria-hidden="true">
												{sgCollapsed ? '▸' : '▾'}
											</span>
											<span class="sub-group-label">{sg.label}</span>
											<span class="sub-group-count">{sg.recipes.length}</span>
										</button>
									{/if}
									{#if !sgCollapsed}
										<ul class="sub-group-recipes">
											{#each sg.recipes as recipe (recipe.id)}
												{@const placed = isRecipePlaced(recipe)}
												<li class="recipe-row" class:placed>
													<button
														type="button"
														class="recipe-tap"
														onclick={() => handleTap(recipe)}
														draggable="true"
														ondragstart={(e) => handleDragStart(e, recipe)}
														title="Tap to add — or drag onto the canvas"
													>
														<span class="recipe-glyph" aria-hidden="true">
															{recipeGlyph(recipe)}
														</span>
														<span class="recipe-icon" aria-hidden="true">
															{iconChip(recipe.icon)}
														</span>
														<span class="recipe-text">
															<span class="recipe-title">{recipe.title}</span>
															{#if recipe.description}
																<span class="recipe-description">
																	{recipe.description}
																</span>
															{/if}
														</span>
														{#if placed}
															<span class="recipe-placed" title="Already on the canvas">
																✓
															</span>
														{/if}
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{/each}
						</div>
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
		font-size: 0.85rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
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

	.group-body {
		padding: 0 0 0.25rem;
	}

	.sub-group {
		margin-top: 0.25rem;
	}
	.sub-group-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.25rem 1rem 0.25rem 1.5rem;
		background: transparent;
		border: none;
		color: var(--fg-muted);
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		text-align: left;
		cursor: pointer;
	}
	.sub-group-head:hover {
		color: var(--accent);
	}
	.sub-group-caret {
		font-family: var(--font-mono);
		color: var(--fg-muted);
		width: 1ch;
	}
	.sub-group-label {
		flex: 1 1 auto;
	}
	.sub-group-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}

	.sub-group-recipes {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.recipe-row {
		display: block;
	}
	.recipe-row.placed .recipe-tap {
		background: var(--accent-glow, rgba(192, 138, 74, 0.04));
	}

	.recipe-tap {
		display: grid;
		grid-template-columns: 1.25rem 2.25rem 1fr auto;
		gap: 0.5rem;
		align-items: center;
		width: 100%;
		padding: 0.4rem 1rem 0.4rem 1.75rem;
		background: transparent;
		border: none;
		text-align: left;
		color: var(--fg);
		font-family: var(--font-body);
		cursor: grab;
	}
	.recipe-tap:hover {
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}
	.recipe-tap:active {
		cursor: grabbing;
	}

	.recipe-glyph {
		font-family: var(--font-mono);
		color: var(--accent);
		font-size: 0.9rem;
		text-align: center;
	}

	.recipe-icon {
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

	.recipe-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.1rem;
	}
	.recipe-title {
		font-size: 0.88rem;
		line-height: 1.25;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.recipe-description {
		font-size: 0.72rem;
		font-style: italic;
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.recipe-placed {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--accent);
	}
</style>
