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

{#if config.label && allScenes.length > 0}
	<OutLine label={config.label} />
{/if}
{#if allScenes.length > 0}
	<div class="scene-row">
		{#each allScenes as s (s.id)}
			<button class="scene-pill" type="button" onclick={() => activateScene(s)}>
				{s.name}
			</button>
		{/each}
	</div>
{/if}

<style>
	.scene-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}

	.scene-pill {
		padding: var(--space-3) var(--space-5);
		font-family: var(--font-caption);
		font-size: var(--text-body);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		background: var(--bg-card);
		min-height: 44px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.scene-pill:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
