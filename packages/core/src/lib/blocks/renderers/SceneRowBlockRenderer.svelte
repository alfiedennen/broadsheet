<script lang="ts">
	/**
	 * SceneRowBlockRenderer — pill row of every discovered scene.
	 * Tap → scene.turn_on. Capped at config.maxScenes (default 8) to
	 * keep the row under one line on a tablet.
	 *
	 * Lifted from /wall.
	 */
	import { discovery } from '$lib/discovery';
	import type { DomainEntity } from '$lib/discovery';
	import { callOn } from '$lib/ha/actions';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { SceneRowBlockConfig } from '../types';

	let { config }: { config: SceneRowBlockConfig } = $props();

	const max = $derived(config.maxScenes ?? 8);
	const allScenes = $derived(discovery.areas.flatMap((a) => a.scenes).slice(0, max));

	async function activateScene(s: DomainEntity) {
		await callOn(s.id);
	}
</script>

{#if allScenes.length > 0}
	<!-- Polish patch: wrap label + grid in a single <section> so
	     PageShell.gap doesn't insert space BETWEEN the OutLine and
	     the content it labels. Same change applied across every
	     block renderer. -->
	<section class="block scene-block">
		{#if config.label}
			<OutLine label={config.label} />
		{/if}
		<div class="scene-row">
			{#each allScenes as s (s.id)}
				<button class="scene-pill" type="button" onclick={() => activateScene(s)}>
					{s.name}
				</button>
			{/each}
		</div>
	</section>
{/if}

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* 0.8.7 polish: scenes now lay out as a tile grid to match
	 * macros / rooms / boost on /wall — was a left-aligned pill row
	 * that looked orphaned next to the other tile rows. Same
	 * auto-fill grid as boost-row so columns align visually. */
	.scene-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-2);
	}

	.scene-pill {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-3) var(--space-4);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--fg);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 72px;
		cursor: pointer;
		text-align: center;
		transition: border-color var(--ease-quick),
			color var(--ease-quick),
			background var(--ease-quick);
	}

	.scene-pill:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}

	.scene-pill:active {
		transform: translateY(1px);
	}
</style>
