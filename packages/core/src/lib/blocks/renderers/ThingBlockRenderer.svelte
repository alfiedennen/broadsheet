<script lang="ts">
	/**
	 * 0.9.1 — the things-first primitive renderer.
	 *
	 * Wraps ONE HA entity_id, dispatches to the right widget visual
	 * based on the entity's domain via the domain→widget map in
	 * `thing-mapping.ts`. The user picks a thing from the things
	 * browser; broadsheet picks the rendering.
	 *
	 * Widgets shipped in the first cut:
	 *   toggle        — light, switch, input_boolean
	 *   fire          — scene, script, automation (one-shot tap)
	 *   climate       — temp + setpoint (slider inline)
	 *   lock          — state + unlock action
	 *   cover         — open / close
	 *   media-tv      — power + source
	 *   media-speaker — play/pause
	 *   camera        — snapshot tile
	 *   state-pill    — binary_sensor (read-only)
	 *   value-pill    — sensor (read-only)
	 *   pick          — input_select / select (dropdown)
	 *
	 * The widget cases live INLINE here for the first cut — keeps the
	 * dispatch tight and the chunk count low. Split into per-widget
	 * files in a follow-up if/when this gets unwieldy.
	 */

	import { base } from '$app/paths';
	import { discovery } from '$lib/discovery';
	import { callService, callOn, callOff, callToggle } from '$lib/ha/actions';
	import VerticalSlider from '$lib/components/VerticalSlider.svelte';
	import { resolveWidget } from '../thing-mapping';
	import type { ThingBlockConfig } from '../types';

	let { config }: { config: ThingBlockConfig } = $props();

	// Live entity lookup — discovery.byEntityId is reactive on state
	// changes so the tile reflects current state without polling.
	// `entityState` (not `state`) because `state` clashes with Svelte's
	// store auto-subscribe shorthand at compile time.
	const entity = $derived(discovery.byEntityId(config.entityId));
	const entityState = $derived(entity?.state ?? null);
	const widget = $derived(resolveWidget(config.widget, config.entityId, entityState));

	const displayName = $derived(
		config.label ??
			entity?.name ??
			(entityState?.attributes?.friendly_name as string | undefined) ??
			config.entityId
	);

	const stateStr = $derived(entityState?.state ?? '—');

	function isOnLike(s: string): boolean {
		return ['on', 'playing', 'paused', 'idle', 'home', 'open', 'unlocked', 'active'].includes(s);
	}
	const isActive = $derived(typeof stateStr === 'string' && isOnLike(stateStr));

	/* ── widget action handlers ────────────────────────────────── */

	async function fireToggle() {
		await callToggle(config.entityId);
	}
	async function fireOneShot() {
		await callOn(config.entityId);
	}
	async function fireUnlock() {
		await callService('lock', 'unlock', { entity_id: config.entityId });
	}
	async function fireCover(action: 'open_cover' | 'close_cover') {
		await callService('cover', action, { entity_id: config.entityId });
	}
	async function fireMediaToggle() {
		await callService('media_player', 'media_play_pause', { entity_id: config.entityId });
	}
	async function fireMediaPower() {
		if (isActive) await callOff(config.entityId);
		else await callOn(config.entityId);
	}
	async function setClimateTemp(temp: number) {
		await callService(
			'climate',
			'set_temperature',
			{ entity_id: config.entityId },
			{ temperature: Number(temp.toFixed(1)) }
		);
	}
	async function setBrightness(pct: number) {
		if (pct <= 0) await callOff(config.entityId);
		else
			await callService(
				'light',
				'turn_on',
				{ entity_id: config.entityId },
				{ brightness_pct: pct }
			);
	}
	async function pickOption(value: string) {
		await callService(
			'input_select',
			'select_option',
			{ entity_id: config.entityId },
			{ option: value }
		);
	}

	/* ── widget-specific derived values ─────────────────────────── */

	const brightness = $derived.by(() => {
		const b = entityState?.attributes?.brightness as number | undefined;
		if (typeof b !== 'number') return 0;
		return Math.round(b * (100 / 255));
	});

	const setpoint = $derived(entityState?.attributes?.temperature as number | undefined);
	const currentTemp = $derived(entityState?.attributes?.current_temperature as number | undefined);

	const options = $derived((entityState?.attributes?.options as string[] | undefined) ?? []);
	const currentOption = $derived(typeof stateStr === 'string' ? stateStr : null);

	const cameraSrc = $derived.by(() => {
		const pic = entityState?.attributes?.entity_picture as string | undefined;
		if (pic) return `${base}${pic}`;
		if (config.entityId.startsWith('camera.')) return `${base}/api/camera_proxy/${config.entityId}`;
		return null;
	});

	const unit = $derived(entityState?.attributes?.unit_of_measurement as string | undefined);
	let expanded = $state(false);
</script>

{#if !entity}
	<div class="thing-tile missing" title={config.entityId}>
		<span class="thing-name">{config.label ?? config.entityId}</span>
		<span class="thing-state">not in HA</span>
	</div>
{:else}
	<div class="thing-tile" class:active={isActive} data-widget={widget}>
		{#if widget === 'toggle'}
			<button class="thing-action" type="button" onclick={fireToggle}>
				<span class="thing-icon" aria-hidden="true">{isActive ? '●' : '○'}</span>
				<span class="thing-meta">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">
						{stateStr}{#if widget === 'toggle' && config.entityId.startsWith('light.') && isActive && brightness > 0}
							· {brightness}%
						{/if}
					</span>
				</span>
			</button>
			{#if config.entityId.startsWith('light.') && isActive}
				<button
					class="thing-expand"
					type="button"
					aria-label="Brightness for {displayName}"
					onclick={() => (expanded = !expanded)}
				>{expanded ? '−' : '+'}</button>
				{#if expanded}
					<div class="thing-slider-wrap">
						<VerticalSlider
							value={brightness}
							min={0}
							max={100}
							step={1}
							unit="%"
							tone="cool"
							label="Brightness {displayName}"
							onCommit={setBrightness}
						/>
					</div>
				{/if}
			{/if}
		{:else if widget === 'fire'}
			<button class="thing-action fire" type="button" onclick={fireOneShot}>
				<span class="thing-icon" aria-hidden="true">▶</span>
				<span class="thing-meta">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">tap to fire</span>
				</span>
			</button>
		{:else if widget === 'climate'}
			<div class="thing-stack">
				<header class="thing-row">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">
						{typeof setpoint === 'number' ? `${setpoint.toFixed(1)}°` : '—'}
						{#if typeof currentTemp === 'number'}
							<span class="dim">· {currentTemp.toFixed(1)}° now</span>
						{/if}
					</span>
				</header>
				<button
					class="thing-expand-inline"
					type="button"
					onclick={() => (expanded = !expanded)}
				>{expanded ? '− hide slider' : '+ adjust'}</button>
				{#if expanded}
					<div class="thing-slider-wrap">
						<VerticalSlider
							value={typeof setpoint === 'number' ? setpoint : 5}
							min={5}
							max={28}
							step={0.5}
							unit="°"
							tone="warm"
							label="Setpoint {displayName}"
							onCommit={setClimateTemp}
						/>
					</div>
				{/if}
			</div>
		{:else if widget === 'lock'}
			<button class="thing-action lock" type="button" onclick={fireUnlock}>
				<span class="thing-icon" aria-hidden="true">{stateStr === 'locked' ? '🔒' : '🔓'}</span>
				<span class="thing-meta">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">{stateStr}</span>
				</span>
			</button>
		{:else if widget === 'cover'}
			<div class="thing-stack">
				<header class="thing-row">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">{stateStr}</span>
				</header>
				<div class="thing-cover-actions">
					<button type="button" class="thing-mini" onclick={() => fireCover('open_cover')}>
						Open
					</button>
					<button type="button" class="thing-mini" onclick={() => fireCover('close_cover')}>
						Close
					</button>
				</div>
			</div>
		{:else if widget === 'media-tv'}
			<div class="thing-stack">
				<header class="thing-row">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">{stateStr}</span>
				</header>
				<button type="button" class="thing-mini full" onclick={fireMediaPower}>
					{isActive ? 'Turn off' : 'Turn on'}
				</button>
			</div>
		{:else if widget === 'media-speaker'}
			<button class="thing-action" type="button" onclick={fireMediaToggle}>
				<span class="thing-icon" aria-hidden="true">{stateStr === 'playing' ? '⏸' : '▶'}</span>
				<span class="thing-meta">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">{stateStr}</span>
				</span>
			</button>
		{:else if widget === 'camera'}
			<figure class="thing-camera">
				{#if cameraSrc}
					<img src={cameraSrc} alt={displayName} loading="lazy" />
				{:else}
					<div class="thing-camera-fallback">no snapshot</div>
				{/if}
				<figcaption>{displayName}</figcaption>
			</figure>
		{:else if widget === 'pick'}
			<div class="thing-stack">
				<header class="thing-row">
					<span class="thing-name">{displayName}</span>
					<span class="thing-state">{currentOption ?? '—'}</span>
				</header>
				<select
					class="thing-select"
					value={currentOption ?? ''}
					onchange={(e) => pickOption((e.target as HTMLSelectElement).value)}
				>
					{#each options as opt (opt)}
						<option value={opt}>{opt}</option>
					{/each}
				</select>
			</div>
		{:else if widget === 'state-pill'}
			<div class="thing-pill" data-state={stateStr}>
				<span class="thing-name">{displayName}</span>
				<span class="thing-state">{stateStr}</span>
			</div>
		{:else}
			<div class="thing-pill" data-state={stateStr}>
				<span class="thing-name">{displayName}</span>
				<span class="thing-state">
					{stateStr}{#if unit} {unit}{/if}
				</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.thing-tile {
		display: flex;
		flex-direction: column;
		min-height: 96px;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		transition: border-color var(--ease-quick), background var(--ease-quick);
		position: relative;
	}

	.thing-tile:hover {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--rule));
	}

	.thing-tile.active {
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}

	.thing-tile.missing {
		opacity: 0.55;
		border-style: dashed;
	}

	.thing-action {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: center;
		width: 100%;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		color: var(--fg);
		cursor: pointer;
		min-height: 60px;
	}

	.thing-icon {
		display: inline-grid;
		place-items: center;
		font-size: 1.4rem;
		color: var(--accent);
		min-width: 1.4em;
	}

	.thing-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.thing-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--fg);
	}

	.thing-tile.active .thing-name {
		color: var(--accent);
	}

	.thing-state {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.thing-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 100%;
	}

	.thing-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		margin: 0;
	}

	.dim {
		color: var(--fg-dim);
	}

	.thing-expand {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: transparent;
		color: var(--fg-muted);
		border: 1px solid var(--rule);
		font-family: var(--font-mono);
		cursor: pointer;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.thing-expand:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.thing-expand-inline {
		align-self: flex-start;
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		background: transparent;
		border: none;
		padding: var(--space-1) 0;
		cursor: pointer;
		transition: color var(--ease-quick);
	}

	.thing-expand-inline:hover {
		color: var(--accent);
	}

	.thing-slider-wrap {
		display: flex;
		justify-content: center;
		padding: var(--space-2) 0;
	}

	.thing-cover-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	.thing-mini {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		cursor: pointer;
		min-height: 36px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.thing-mini:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.thing-mini.full {
		width: 100%;
	}

	.thing-camera {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
	}

	.thing-camera img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: var(--radius-card);
		background: var(--bg-raised);
	}

	.thing-camera-fallback {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: var(--bg-raised);
		border-radius: var(--radius-card);
		color: var(--fg-dim);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		text-transform: uppercase;
	}

	.thing-camera figcaption {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		text-align: center;
	}

	.thing-select {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		cursor: pointer;
	}

	.thing-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.thing-pill {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
