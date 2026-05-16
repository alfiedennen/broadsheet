<script lang="ts">
	/**
	 * StatusGrouped — "21 quiet, 2 reporting errors" prose summary +
	 * grouped section list.
	 *
	 * Renders the count-shaped section headers each native HA-settings
	 * surface uses (errors / working / disabled, or whatever the
	 * surface's status partition is).
	 *
	 * Each group renders its own list of rows; the caller passes a
	 * snippet that yields the per-item content. Sections with zero
	 * items collapse to a single italic line ("0 disabled — nothing to
	 * show") rather than empty space.
	 *
	 * Spec: docs/plans/plan-ha-settings-native-uis.md.
	 */

	import type { Snippet } from 'svelte';

	export interface StatusGroup<T = unknown> {
		/** UPPERCASE section label, e.g. "ERRORS" / "WORKING" / "DISABLED" */
		label: string;
		/** Items in this group; renders one row per item via `row` snippet */
		items: T[];
		/** Optional tone signalling — colours the count chip */
		tone?: 'alert' | 'positive' | 'muted' | 'default';
		/** What to say when items.length === 0; defaults to "Nothing to show." */
		emptyText?: string;
	}

	let {
		summary,
		groups,
		row,
		emptyAll
	}: {
		/** Prose summary line, e.g. "You have 23 integrations. Mostly working — 21 quiet, 2 reporting errors." */
		summary: string;
		groups: StatusGroup[];
		/** Snippet rendered per item; receives the item as parameter */
		row: Snippet<[unknown]>;
		/** Optional text shown when every group is empty */
		emptyAll?: string;
	} = $props();

	const totalItems = $derived(groups.reduce((acc, g) => acc + g.items.length, 0));
</script>

<section class="status-grouped">
	<p class="summary">{summary}</p>

	{#if totalItems === 0 && emptyAll}
		<p class="empty-all">{emptyAll}</p>
	{:else}
		{#each groups as group (group.label)}
			<div class="group">
				<header class="group-head">
					<span class="group-label" data-tone={group.tone ?? 'default'}>
						{group.label}
					</span>
					<span class="group-count">{group.items.length}</span>
				</header>
				{#if group.items.length === 0}
					<p class="group-empty">{group.emptyText ?? 'Nothing to show.'}</p>
				{:else}
					<ul class="group-list">
						{#each group.items as item, i (i)}
							<li>{@render row(item)}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	{/if}
</section>

<style>
	.status-grouped {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.summary {
		font-family: var(--font-body);
		font-size: var(--text-body);
		line-height: var(--leading-snug);
		color: var(--fg);
		max-width: 60ch;
		margin: 0;
	}

	.empty-all {
		font-family: var(--font-body);
		font-size: var(--text-body);
		font-style: italic;
		color: var(--fg-muted);
		text-align: center;
		padding: var(--space-6);
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.group-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--rule);
	}

	.group-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.group-label[data-tone='alert'] {
		color: var(--state-alert, #bf3a30);
	}
	.group-label[data-tone='positive'] {
		color: var(--state-positive, #6a8a4d);
	}
	.group-label[data-tone='muted'] {
		opacity: 0.55;
	}

	.group-count {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}

	.group-empty {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--fg-muted);
		margin: 0;
		padding: var(--space-2) var(--space-3);
	}

	.group-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
</style>
