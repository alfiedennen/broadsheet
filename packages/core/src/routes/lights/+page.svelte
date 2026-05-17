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

	import { base } from '$app/paths';
	import { discovery, PAGES } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import { callOn, callOff, callToggle, callService } from '$lib/ha/actions';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import Explainer from '$lib/components/Explainer.svelte';
	import RoomReveal from '$lib/components/RoomReveal.svelte';
	import UnsortedSection from '$lib/components/UnsortedSection.svelte';
	import VerticalSlider from '$lib/components/VerticalSlider.svelte';

	// Polish patch — per-light controls.
	//  brightness  : VerticalSlider 0-100% → light.turn_on { brightness_pct }
	//  color_temp  : 2200-6500K dropdown when the entity reports
	//                supported_color_modes ⊇ {color_temp}
	//  rgb         : compact swatch row of 8 named presets when
	//                supported_color_modes ⊇ {rgb|rgbw|hs|xy}
	function brightnessPct(light: DomainEntity): number {
		const b = light.state?.attributes?.brightness as number | undefined;
		if (typeof b !== 'number') return 0;
		return Math.round(b * (100 / 255));
	}

	function supportsColorTemp(light: DomainEntity): boolean {
		const modes = light.state?.attributes?.supported_color_modes as
			| string[]
			| undefined;
		return Array.isArray(modes) && modes.includes('color_temp');
	}

	function supportsRgb(light: DomainEntity): boolean {
		const modes = light.state?.attributes?.supported_color_modes as
			| string[]
			| undefined;
		if (!Array.isArray(modes)) return false;
		return modes.some((m) => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m));
	}

	function currentKelvin(light: DomainEntity): number | null {
		const k = light.state?.attributes?.color_temp_kelvin as number | undefined;
		if (typeof k === 'number') return k;
		// HA also exposes the legacy mireds field — fall back.
		const m = light.state?.attributes?.color_temp as number | undefined;
		if (typeof m === 'number' && m > 0) return Math.round(1_000_000 / m);
		return null;
	}

	async function setBrightness(light: DomainEntity, pct: number) {
		if (pct <= 0) {
			await callOff(light.id);
		} else {
			await callService(
				'light',
				'turn_on',
				{ entity_id: light.id },
				{ brightness_pct: pct }
			);
		}
	}

	async function setKelvin(light: DomainEntity, k: number) {
		await callService(
			'light',
			'turn_on',
			{ entity_id: light.id },
			{ color_temp_kelvin: k }
		);
	}

	async function setRgb(light: DomainEntity, rgb: [number, number, number]) {
		await callService(
			'light',
			'turn_on',
			{ entity_id: light.id },
			{ rgb_color: rgb }
		);
	}

	// Curated RGB presets — covers warm/cool whites + the most-asked-for
	// rainbow shortcuts. Users wanting precise hex picking can drop into
	// HA's own more-info; this is the "scene-ish" pick from broadsheet.
	const RGB_PRESETS: { name: string; rgb: [number, number, number] }[] = [
		{ name: 'Warm', rgb: [255, 182, 110] },
		{ name: 'Daylight', rgb: [255, 240, 220] },
		{ name: 'Cool', rgb: [200, 220, 255] },
		{ name: 'Red', rgb: [220, 60, 50] },
		{ name: 'Amber', rgb: [255, 140, 60] },
		{ name: 'Green', rgb: [80, 180, 100] },
		{ name: 'Blue', rgb: [70, 130, 220] },
		{ name: 'Magenta', rgb: [220, 70, 180] }
	];

	const KELVIN_PRESETS = [
		{ label: '2200K (warm)', k: 2200 },
		{ label: '2700K', k: 2700 },
		{ label: '3000K', k: 3000 },
		{ label: '3500K', k: 3500 },
		{ label: '4500K', k: 4500 },
		{ label: '5500K', k: 5500 },
		{ label: '6500K (cool)', k: 6500 }
	];

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

<PageShell width="wide">
	<Hero size="sm">
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
								{@const isOn = light.state?.state === 'on'}
								{@const pct = brightnessPct(light)}
								{@const hasColorTemp = supportsColorTemp(light)}
								{@const hasRgb = supportsRgb(light)}
								{@const k = currentKelvin(light)}
								<li class="light-row" data-on={isOn}>
									<!-- Polish patch: full per-light control row.
									     Toggle on left, vertical brightness slider
									     centre, colour controls on right when supported. -->
									<button
										class="light-toggle"
										type="button"
										onclick={() => toggle(light)}
										data-state={light.state?.state ?? 'unknown'}
										aria-label="Toggle {light.name}"
									>
										<span class="indicator" aria-hidden="true"></span>
										<span class="light-meta">
											<span class="light-name">{light.name}</span>
											<span class="light-state">
												{#if isOn}
													on{#if pct > 0} · {pct}%{/if}{#if k} · {k}K{/if}
												{:else if light.state?.state === 'off'}
													off
												{:else}
													—
												{/if}
											</span>
										</span>
									</button>

									<div class="light-controls">
										<VerticalSlider
											value={pct}
											min={0}
											max={100}
											step={1}
											unit="%"
											tone="cool"
											label="Brightness {light.name}"
											onCommit={(v) => setBrightness(light, v)}
										/>

										<div class="colour-controls">
											{#if hasColorTemp}
												<label class="ct-label">
													<span class="ct-eyebrow">Warmth</span>
													<select
														class="ct-select"
														value={k ?? 2700}
														onchange={(e) =>
															setKelvin(
																light,
																Number((e.currentTarget as HTMLSelectElement).value)
															)}
													>
														{#each KELVIN_PRESETS as preset (preset.k)}
															<option value={preset.k}>{preset.label}</option>
														{/each}
													</select>
												</label>
											{/if}

											{#if hasRgb}
												<div class="rgb-row" aria-label="RGB presets for {light.name}">
													{#each RGB_PRESETS as preset (preset.name)}
														<button
															type="button"
															class="rgb-swatch"
															style:background="rgb({preset.rgb[0]}, {preset.rgb[1]}, {preset.rgb[2]})"
															title={preset.name}
															onclick={() => setRgb(light, preset.rgb)}
															aria-label="Set {light.name} to {preset.name}"
														></button>
													{/each}
												</div>
											{/if}
										</div>
									</div>
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

	<Explainer>
		Light is decided by <a href="{base}/">who's home</a> and the hour of the day. For
		evenings specifically: <a href="{base}/tv">tonight's screen</a>, and
		<a href="{base}/heat">the heat that goes with it</a>.
	</Explainer>
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

	/* Polish patch: per-light row gains a 3-zone grid — toggle/meta
	 * (left, flex-grows), brightness slider (centre), colour controls
	 * (right). Collapses to stacked on narrow viewports. */
	.light-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--rule);
	}

	.light-row:last-child {
		border-bottom: none;
	}

	.light-toggle {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: center;
		padding: 0;
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

	.light-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
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

	.light-controls {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
	}

	.colour-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		max-width: 180px;
	}

	.ct-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.ct-eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.ct-select {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
	}

	.ct-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.rgb-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-1);
	}

	.rgb-swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid var(--rule);
		cursor: pointer;
		padding: 0;
		transition: transform var(--ease-quick), border-color var(--ease-quick);
	}

	.rgb-swatch:hover {
		transform: scale(1.12);
		border-color: var(--accent);
	}

	/* Mobile / narrow viewports — stack the controls vertically so
	 * the brightness slider stays usable. */
	@media (max-width: 720px) {
		.light-row {
			grid-template-columns: 1fr;
		}
		.light-controls {
			width: 100%;
			justify-content: space-between;
		}
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}
</style>
