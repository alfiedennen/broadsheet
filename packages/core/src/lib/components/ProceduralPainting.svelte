<script lang="ts">
	/**
	 * ProceduralPainting — hash-seeded animated CSS gradient as the
	 * default visual centre per area. Ships in core (no plugin
	 * required).
	 *
	 * The @broadsheet/emanations plugin (v0.1.x) replaces this with
	 * actual axonometric paintings + multi-person presence rendering.
	 * This component is the always-works fallback.
	 *
	 * Algorithm: hash(seed) → HSL palette anchored in warm range.
	 * Animated via slow CSS keyframes — gives the page motion without
	 * requiring an image.
	 */

	let {
		seed = 'default',
		mood = 'warm' as 'warm' | 'cool' | 'neutral'
	}: {
		seed?: string;
		mood?: 'warm' | 'cool' | 'neutral';
	} = $props();

	// Tiny, deterministic string hash (xorshift-ish)
	function hash(s: string): number {
		let h = 2166136261;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return Math.abs(h);
	}

	const palette = $derived.by(() => {
		const h = hash(seed);
		// Mood anchors the hue range
		const anchor = mood === 'warm' ? 30 : mood === 'cool' ? 220 : 60;
		const spread = 40;
		const hue1 = anchor + ((h >> 0) % spread) - spread / 2;
		const hue2 = anchor + ((h >> 8) % spread) - spread / 2 + 20;
		const hue3 = anchor + ((h >> 16) % spread) - spread / 2 - 10;
		// Saturation kept low (8-18%) so the gradient reads as ambient,
		// not poster-paint
		const sat = 8 + ((h >> 4) % 10);
		// Lightness deliberately low — sits behind text
		const l1 = 12 + ((h >> 12) % 8);
		const l2 = 8 + ((h >> 20) % 6);
		const l3 = 15 + ((h >> 28) % 6);

		return {
			c1: `hsl(${hue1} ${sat}% ${l1}%)`,
			c2: `hsl(${hue2} ${sat + 4}% ${l2}%)`,
			c3: `hsl(${hue3} ${sat - 2}% ${l3}%)`,
			drift: 30 + ((h >> 6) % 60) // 30-90 second drift loop
		};
	});

	const style = $derived(
		`--c1: ${palette.c1}; --c2: ${palette.c2}; --c3: ${palette.c3}; --drift: ${palette.drift}s;`
	);
</script>

<div class="painting" {style} aria-hidden="true">
	<div class="layer layer-1"></div>
	<div class="layer layer-2"></div>
	<div class="layer layer-3"></div>
</div>

<style>
	.painting {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--c1);
	}

	.layer {
		position: absolute;
		inset: -10%;
		background-repeat: no-repeat;
		background-size: 60% 60%;
		filter: blur(50px);
		opacity: 0.7;
	}

	.layer-1 {
		background-image: radial-gradient(circle at 30% 40%, var(--c2), transparent 70%);
		animation: drift1 var(--drift) ease-in-out infinite alternate;
	}

	.layer-2 {
		background-image: radial-gradient(circle at 70% 60%, var(--c3), transparent 65%);
		animation: drift2 calc(var(--drift) * 1.3) ease-in-out infinite alternate;
	}

	.layer-3 {
		background-image: radial-gradient(circle at 50% 30%, var(--c1), transparent 60%);
		animation: drift3 calc(var(--drift) * 0.8) ease-in-out infinite alternate;
	}

	@keyframes drift1 {
		from {
			transform: translate(-5%, -5%) scale(1);
		}
		to {
			transform: translate(8%, 5%) scale(1.2);
		}
	}
	@keyframes drift2 {
		from {
			transform: translate(5%, 5%) scale(1.1);
		}
		to {
			transform: translate(-8%, -3%) scale(1);
		}
	}
	@keyframes drift3 {
		from {
			transform: translate(0, 0) scale(0.9);
		}
		to {
			transform: translate(-5%, 8%) scale(1.1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.layer {
			animation: none;
		}
	}
</style>
