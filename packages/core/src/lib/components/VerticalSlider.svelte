<script lang="ts">
	/**
	 * VerticalSlider — chunky, tactile vertical input. The polish-
	 * patch replacement for ±-buttons on /heat and /lights brightness
	 * controls.
	 *
	 * Native `<input type="range" orient="vertical">` is finicky cross-
	 * browser (Firefox honours the orient attr; Chromium needs CSS
	 * appearance + writing-mode tricks; Safari ignores both). We use
	 * the writing-mode pattern from harold-home's TRV control which
	 * lands consistently on Chromium, Firefox + Safari iOS.
	 *
	 * Props:
	 *   value:   current numeric value
	 *   min/max: bounds (default 0–100)
	 *   step:    increment granularity (default 1)
	 *   label:   a11y label
	 *   unit:    suffix for the value display (e.g. '°', '%')
	 *   tone:    'warm' (heat) or 'cool' (lights) for thumb tint
	 *   onCommit: fired on release (drag) or change (keyboard)
	 *
	 * onCommit fires only when the user lets go — drag-during streaming
	 * would hammer HA with set_temperature calls. The visual updates
	 * live as the user drags so it FEELS responsive, but only the
	 * release sends the service call.
	 *
	 * Spec: harold-home/src/routes/heat (TRV control)
	 *      + .dogfood/0.7.0-manual-findings (the polish ask).
	 */

	let {
		value,
		min = 0,
		max = 100,
		step = 1,
		label,
		unit = '',
		tone = 'cool',
		onCommit
	}: {
		value: number;
		min?: number;
		max?: number;
		step?: number;
		label: string;
		unit?: string;
		tone?: 'warm' | 'cool';
		onCommit: (v: number) => void;
	} = $props();

	// Drag-time visual state (separate from `value` so the slider can
	// reflect the user's pointer position before the commit fires).
	// Initialised to 0 then synced from `value` in the $effect below;
	// the $state literal can't reference props directly without Svelte
	// warning about closure capture.
	let liveValue = $state(0);
	let dragging = $state(false);

	$effect(() => {
		// If the canonical value changes from outside while we're not
		// dragging, sync our local visual state. Also runs on first
		// mount to seed liveValue with the initial `value` prop.
		if (!dragging) liveValue = value;
	});

	function onInput(e: Event) {
		const t = e.currentTarget as HTMLInputElement;
		const v = Number(t.value);
		liveValue = v;
		dragging = true;
	}

	function onChange(e: Event) {
		const t = e.currentTarget as HTMLInputElement;
		const v = Number(t.value);
		liveValue = v;
		dragging = false;
		onCommit(v);
	}

	const displayValue = $derived(
		Number.isInteger(step) ? Math.round(liveValue) : liveValue.toFixed(1)
	);
	// 0..1 fill ratio for the visual track-fill
	const fillRatio = $derived((liveValue - min) / Math.max(max - min, 0.001));
</script>

<div class="vslider" data-tone={tone}>
	<div class="vslider-value" aria-hidden="true">{displayValue}{unit}</div>
	<div class="vslider-track">
		<div class="vslider-fill" style:--fill={fillRatio}></div>
		<input
			type="range"
			class="vslider-input"
			{min}
			{max}
			{step}
			value={liveValue}
			aria-label={label}
			oninput={onInput}
			onchange={onChange}
		/>
	</div>
</div>

<style>
	.vslider {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		width: 56px;
	}

	.vslider-value {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
		line-height: 1;
		min-height: 1em;
	}

	.vslider[data-tone='warm'] .vslider-value {
		color: var(--accent);
	}

	.vslider-track {
		position: relative;
		width: 100%;
		height: 160px;
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.vslider-fill {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(var(--fill) * 100%);
		background: linear-gradient(
			to top,
			color-mix(in srgb, var(--fg-muted) 70%, transparent),
			color-mix(in srgb, var(--fg-muted) 30%, transparent)
		);
		transition: height 80ms ease-out;
		pointer-events: none;
	}

	.vslider[data-tone='warm'] .vslider-fill {
		background: linear-gradient(
			to top,
			color-mix(in srgb, var(--accent) 70%, transparent),
			color-mix(in srgb, var(--accent) 30%, transparent)
		);
	}

	.vslider[data-tone='cool'] .vslider-fill {
		background: linear-gradient(
			to top,
			color-mix(in srgb, #f4d394 65%, transparent),
			color-mix(in srgb, #f4d394 25%, transparent)
		);
	}

	/* The actual input — invisible but interactive. Spans the whole
	 * track so the user can grab anywhere along it. writing-mode +
	 * direction trick gets cross-browser vertical behaviour. */
	.vslider-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: ns-resize;
		writing-mode: vertical-lr;
		direction: rtl;
		-webkit-appearance: slider-vertical;
		appearance: slider-vertical;
	}

	.vslider-input:focus {
		outline: none;
	}

	.vslider-track:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-glow, rgba(192, 138, 74, 0.2));
	}
</style>
