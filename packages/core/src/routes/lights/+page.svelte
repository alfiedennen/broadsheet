<script lang="ts">
	/**
	 * `/lights` — every light + lighting-class switch in the house.
	 *
	 * Composition:
	 *   1. Hero with prose state ("library and office are on")
	 *   2. Scene chips row (any scene.* discovered)
	 *   3. Per-area RoomReveal — collapsed shows "X on, Y off"; expanded
	 *      shows individual light controls
	 *   4. Unsorted section — lights without resolved area, with
	 *      assign-to-area CTA → /settings/house (M4)
	 */

	import { discovery, PAGES } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import { callOn, callOff, callToggle } from '$lib/ha/actions';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import RoomReveal from '$lib/components/RoomReveal.svelte';
	import UnsortedSection from '$lib/components/UnsortedSection.svelte';

	const lightingAreas = $derived(discovery.areasForPage('lights'));
	const allScenes = $derived(
		discovery.areas
			.flatMap((a) => a.scenes)
			.filter((e) => e.id.startsWith('scene.'))
			.slice(0, 12)
	);

	// Unsorted lights (entities with no resolvable area)
	const unsortedLights = $derived(
		discovery.unsorted
			? [...discovery.unsorted.lights, ...discovery.unsorted.switches]
			: []
	);

	/**
	 * Prose state for the hero — composes from which areas have any
	 * lights on. The sentence shape changes based on count.
	 */
	const proseState = $derived.by(() => {
		const onAreas = lightingAreas.filter((a) =>
			a.lights.some((l) => l.state?.state === 'on')
		);
		if (onAreas.length === 0) return 'Every light is off.';
		if (onAreas.length === 1)
			return `${onAreas[0].name} is on. Everything else is dark.`;
		if (onAreas.length === 2)
			return `${onAreas[0].name} and ${onAreas[1].name} are on.`;
		const last = onAreas[onAreas.length - 1].name;
		const others = onAreas
			.slice(0, -1)
			.map((a) => a.name)
			.join(', ');
		return `${others}, and ${last} are on.`;
	});

	function summaryFor(area: DomainArea): string {
		const onCount = area.lights.filter((l) => l.state?.state === 'on').length;
		const total = area.lights.length;
		if (onCount === 0) return `${total} ${total === 1 ? 'light' : 'lights'}, all off.`;
		if (onCount === total) return `All ${total} on.`;
		return `${onCount} of ${total} on.`;
	}

	async function toggle(e: DomainEntity) {
		await callToggle(e.id);
	}

	async function turnAllOn(area: DomainArea) {
		for (const light of area.lights) {
			await callOn(light.id);
		}
	}

	async function turnAllOff(area: DomainArea) {
		for (const light of area.lights) {
			await callOff(light.id);
		}
	}

	async function activateScene(scene: DomainEntity) {
		await callOn(scene.id);
	}
</script>

<svelte:head>
	<title>Lights · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Lights" number={2} />
		{/snippet}
		{#snippet headline()}
			{proseState}
		{/snippet}
	</Hero>

	{#if allScenes.length > 0}
		<OutLine label="Scenes" />
		<div class="scenes">
			{#each allScenes as scene (scene.id)}
				<button
					class="scene-chip"
					type="button"
					onclick={() => activateScene(scene)}
					title={scene.id}
				>
					{scene.name}
				</button>
			{/each}
		</div>
	{/if}

	{#if lightingAreas.length > 0}
		<OutLine label="Rooms" />
		<div class="rooms">
			{#each lightingAreas as area (area.id)}
				<RoomReveal {area}>
					{#snippet summary(a)}
						{summaryFor(a)}
					{/snippet}

					{#snippet controls(a)}
						<div class="actions">
							<button class="link" type="button" onclick={() => turnAllOn(a)}>
								All on
							</button>
							<span class="sep" aria-hidden="true">·</span>
							<button class="link" type="button" onclick={() => turnAllOff(a)}>
								All off
							</button>
						</div>

						<ul class="light-list">
							{#each a.lights as light (light.id)}
								<li class="light-row">
									<button
										class="light-toggle"
										type="button"
										onclick={() => toggle(light)}
										data-state={light.state?.state ?? 'unknown'}
										aria-label="Toggle {light.name}"
									>
										<span class="indicator" aria-hidden="true"></span>
										<span class="light-name">{light.name}</span>
										<span class="light-state">
											{#if light.state?.state === 'on'}
												on
												{#if typeof light.state?.attributes?.brightness === 'number'}
													· {Math.round(
														(light.state.attributes.brightness as number) * (100 / 255)
													)}%
												{/if}
											{:else if light.state?.state === 'off'}
												off
											{:else}
												—
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/snippet}
				</RoomReveal>
			{/each}
		</div>
	{:else}
		<p class="empty">No lighting areas discovered yet.</p>
	{/if}

	<UnsortedSection
		entities={unsortedLights}
		kind="lights"
		hint="Assign them to rooms in Home Assistant or via Settings."
	/>
</PageShell>

<style>
	.scenes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.scene-chip {
		font-family: var(--font-caption);
		font-size: var(--text-caption);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg);
		background: var(--bg-card);
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.scene-chip:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.rooms {
		display: flex;
		flex-direction: column;
	}

	.actions {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		font-size: var(--text-caption);
	}

	.link {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		padding: var(--space-1) 0;
	}

	.link:hover {
		color: var(--accent-soft);
	}

	.sep {
		color: var(--fg-dim);
	}

	.light-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.light-row {
		border-bottom: 1px solid var(--rule);
	}

	.light-row:last-child {
		border-bottom: none;
	}

	.light-toggle {
		width: 100%;
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-3) 0;
		text-align: left;
		color: var(--fg);
		transition: color var(--ease-quick);
	}

	.light-toggle:hover {
		color: var(--accent);
	}

	.indicator {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--fg-dim);
		transition: background var(--ease-quick), box-shadow var(--ease-quick);
	}

	.light-toggle[data-state='on'] .indicator {
		background: var(--state-on);
		box-shadow: 0 0 12px var(--state-on);
	}

	.light-toggle[data-state='unavailable'] .indicator,
	.light-toggle[data-state='unknown'] .indicator {
		background: transparent;
		border: 1px dashed var(--fg-dim);
	}

	.light-name {
		font-family: var(--font-body);
		font-size: var(--text-body);
	}

	.light-state {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.light-toggle[data-state='on'] .light-state {
		color: var(--accent);
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}
</style>
