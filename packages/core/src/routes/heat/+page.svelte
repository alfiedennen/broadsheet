<script lang="ts">
	/**
	 * `/heat` — every climate entity (TRVs, thermostats).
	 *
	 * Composition:
	 *   1. Hero with prose state ("two warm rooms, three at frost")
	 *   2. Three macro buttons: Boost (1h all 21°C), All warm (20°),
	 *      All frost (5°)
	 *   3. Per-area RoomReveal — current temp / setpoint, ±0.5° nudges
	 *   4. Unsorted section — climate entities without area
	 */

	import { base } from '$app/paths';
	import { discovery } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import { callService } from '$lib/ha/actions';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import Explainer from '$lib/components/Explainer.svelte';
	import RoomReveal from '$lib/components/RoomReveal.svelte';
	import UnsortedSection from '$lib/components/UnsortedSection.svelte';
	import VerticalSlider from '$lib/components/VerticalSlider.svelte';

	const climateAreas = $derived(discovery.areasForPage('heat'));

	const allClimates = $derived(climateAreas.flatMap((a) => a.climates));

	const unsortedClimates = $derived(discovery.unsorted ? discovery.unsorted.climates : []);

	const FROST = 5;
	const WARM = 20;
	const BOOST = 21;

	const proseState = $derived.by(() => {
		const warm = allClimates.filter((c) => {
			const t = c.state?.attributes?.temperature as number | undefined;
			return typeof t === 'number' && t >= 18;
		}).length;
		const frost = allClimates.filter((c) => {
			const t = c.state?.attributes?.temperature as number | undefined;
			return typeof t === 'number' && t <= 6;
		}).length;
		const total = allClimates.length;

		if (total === 0) return 'No climate entities discovered.';
		if (warm === 0 && frost === total) return 'Every radiator at frost.';
		if (warm === total) return 'Every radiator warm.';
		if (warm === 0) return `All ${total} cool. ${frost === total ? 'At frost.' : ''}`;
		return `${warm} warm, ${total - warm} cool.`;
	});

	function summaryFor(area: DomainArea): string {
		if (area.climates.length === 0) return 'No radiators here.';
		const setpoints = area.climates
			.map((c) => c.state?.attributes?.temperature as number | undefined)
			.filter((t): t is number => typeof t === 'number');
		const currents = area.climates
			.map((c) => c.state?.attributes?.current_temperature as number | undefined)
			.filter((t): t is number => typeof t === 'number');

		if (setpoints.length === 0) return `${area.climates.length} radiator(s).`;
		const avgSet = setpoints.reduce((a, b) => a + b, 0) / setpoints.length;
		const avgCur = currents.length ? currents.reduce((a, b) => a + b, 0) / currents.length : null;
		const setStr = `${avgSet.toFixed(1)}°`;
		const curStr = avgCur !== null ? `, ${avgCur.toFixed(1)}° now` : '';
		return `${setStr} set${curStr}.`;
	}

	async function setTemp(entity: DomainEntity, temp: number) {
		await callService(
			'climate',
			'set_temperature',
			{ entity_id: entity.id },
			{ temperature: Number(temp.toFixed(1)) }
		);
	}

	async function nudge(entity: DomainEntity, delta: number) {
		const current = (entity.state?.attributes?.temperature as number | undefined) ?? WARM;
		await setTemp(entity, Math.max(5, Math.min(28, current + delta)));
	}

	async function setAllInArea(area: DomainArea, temp: number) {
		for (const c of area.climates) {
			await setTemp(c, temp);
		}
	}

	async function setAll(temp: number) {
		for (const c of allClimates) {
			await setTemp(c, temp);
		}
	}

	let boosting = $state(false);
	async function boost() {
		boosting = true;
		try {
			await setAll(BOOST);
		} finally {
			boosting = false;
		}
	}
</script>

<svelte:head>
	<title>Heat · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Heat" number={3} />
		{/snippet}
		{#snippet headline()}
			{proseState}
		{/snippet}
	</Hero>

	{#if allClimates.length > 0}
		<OutLine label="Macros" />
		<div class="macros">
			<button class="macro boost" type="button" onclick={boost} disabled={boosting}>
				<span class="macro-label">Boost</span>
				<span class="macro-detail">Every radiator to {BOOST}°</span>
			</button>
			<button class="macro" type="button" onclick={() => setAll(WARM)}>
				<span class="macro-label">All warm</span>
				<span class="macro-detail">{WARM}° everywhere</span>
			</button>
			<button class="macro" type="button" onclick={() => setAll(FROST)}>
				<span class="macro-label">All frost</span>
				<span class="macro-detail">{FROST}° everywhere</span>
			</button>
		</div>
	{/if}

	{#if climateAreas.length > 0}
		<OutLine label="Rooms" />
		<div class="rooms">
			{#each climateAreas as area (area.id)}
				<RoomReveal {area}>
					{#snippet summary(a)}
						{summaryFor(a)}
					{/snippet}

					{#snippet controls(a)}
						<div class="actions">
							<button class="link" type="button" onclick={() => setAllInArea(a, WARM)}>
								Warm
							</button>
							<span class="sep" aria-hidden="true">·</span>
							<button class="link" type="button" onclick={() => setAllInArea(a, FROST)}>
								Frost
							</button>
						</div>

						<ul class="trv-list">
							{#each a.climates as c (c.id)}
								{@const setpoint = c.state?.attributes?.temperature as number | undefined}
								{@const current = c.state?.attributes?.current_temperature as
									| number
									| undefined}
								{@const action = c.state?.attributes?.hvac_action as string | undefined}
								<li class="trv-row">
									<!-- Polish patch: vertical slider replaces ±0.5°
									     buttons. Drag-during is local; commit on
									     release fires the set_temperature call. -->
									<div class="trv-meta">
										<div class="trv-name">{c.name}</div>
										<div class="trv-temps">
											{#if typeof current === 'number'}
												<span class="current">{current.toFixed(1)}° now</span>
											{/if}
											{#if action && action !== 'idle' && action !== 'off'}
												<span class="action">· {action}</span>
											{/if}
										</div>
									</div>
									<VerticalSlider
										value={typeof setpoint === 'number' ? setpoint : 5}
										min={5}
										max={28}
										step={0.5}
										unit="°"
										tone="warm"
										label="Setpoint {c.name}"
										onCommit={(v) => setTemp(c, v)}
									/>
								</li>
							{/each}
						</ul>
					{/snippet}
				</RoomReveal>
			{/each}
		</div>
	{:else}
		<p class="empty">No climate areas discovered yet.</p>
	{/if}

	<UnsortedSection
		entities={unsortedClimates}
		kind="climate entities"
		hint="Most likely TRVs that haven't been assigned to rooms in HA."
	/>

	<Explainer>
		Heat follows <a href="{base}/">who's home</a> and the cost of electricity. The
		bedroom cools to its night setting before sleep.
	</Explainer>
</PageShell>

<style>
	.macros {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-2);
	}

	@media (min-width: 540px) {
		.macros {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	.macro {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-4) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		text-align: left;
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.macro:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.macro:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.macro-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--accent);
	}

	.macro-detail {
		font-family: var(--font-caption);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-caption);
		color: var(--fg-muted);
	}

	.macro.boost {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.actions {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
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

	.trv-list {
		display: flex;
		flex-direction: column;
	}

	/* Polish patch: trv-row reorganised. Meta on left (name + current
	 * temp + action), vertical slider on right replacing ±-buttons. */
	.trv-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--rule);
	}

	.trv-row:last-child {
		border-bottom: none;
	}

	.trv-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.trv-name {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.trv-temps {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-caption);
		color: var(--fg-muted);
	}

	.current {
		font-size: var(--text-caption);
		color: var(--fg-muted);
	}

	.action {
		font-size: var(--text-caption);
		color: var(--state-on);
		font-style: italic;
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}
</style>
