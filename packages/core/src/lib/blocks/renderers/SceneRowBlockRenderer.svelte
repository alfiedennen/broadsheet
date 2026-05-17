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

	.scene-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		/* PageShell handles inter-block spacing; no margin-bottom
		 * here (was causing double-gap with shell gap). */
	}

	/* Polish patch: lozenges previously rendered with 0 horizontal
	 * padding because var(--space-5) was undefined → text-to-edge.
	 * Tokens now exist; this rule re-derived with explicit padding +
	 * stronger visual weight (subtle accent-glow on rest, full
	 * accent on hover) so it reads as a real affordance. */
	.scene-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-3) var(--space-5);
		font-family: var(--font-caption);
		font-size: var(--text-body);
		letter-spacing: 0.02em;
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		background: var(--bg-card);
		min-height: 44px;
		min-width: 80px;
		cursor: pointer;
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
