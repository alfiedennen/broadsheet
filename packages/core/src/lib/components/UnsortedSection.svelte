<script lang="ts">
	/**
	 * UnsortedSection — surfaces the entities broadsheet couldn't
	 * auto-bucket. Shown at the bottom of relevant pages with a
	 * "fix this" affordance pointing to /settings/house (M4).
	 *
	 * The honest escape hatch: instead of silently dropping
	 * unassignable entities, broadsheet shows them and prompts.
	 *
	 * Pattern from harold-home: missing curation is friction the
	 * user can see and resolve, not a hidden tax on every render.
	 */

	import type { DomainEntity } from '$lib/discovery';
	import OutLine from './OutLine.svelte';

	let {
		entities,
		kind = 'entities',
		hint = ''
	}: {
		entities: DomainEntity[];
		kind?: string;
		hint?: string;
	} = $props();
</script>

{#if entities.length > 0}
	<OutLine label="Unsorted" />

	<section class="unsorted">
		<header class="unsorted-head">
			<p class="dek">
				<strong>{entities.length} {kind}</strong> couldn't be auto-grouped into a room.
				{#if hint}<span class="hint">{hint}</span>{/if}
			</p>
			<a class="cta" href="/settings/house/">Assign rooms in Settings →</a>
		</header>

		<ul class="unsorted-list">
			{#each entities as e (e.id)}
				<li class="unsorted-row">
					<span class="entity-name">{e.name}</span>
					<code class="entity-id">{e.id}</code>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.unsorted {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.unsorted-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.dek {
		color: var(--fg-muted);
		font-size: var(--text-body);
		line-height: var(--leading-snug);
		margin: 0;
	}

	.dek strong {
		color: var(--accent);
		font-weight: 500;
	}

	.hint {
		display: block;
		margin-top: var(--space-1);
		font-size: var(--text-caption);
		color: var(--fg-dim);
	}

	.cta {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
	}

	.unsorted-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 18rem;
		overflow-y: auto;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.unsorted-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--rule);
	}

	.unsorted-row:last-child {
		border-bottom: none;
	}

	.entity-name {
		color: var(--fg);
		font-size: var(--text-caption);
	}

	.entity-id {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
		font-variant-numeric: tabular-nums;
	}
</style>
