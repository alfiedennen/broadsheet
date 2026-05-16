<script lang="ts">
	/**
	 * TakeoverBanner — first-launch advisory after the addon's sidebar
	 * takeover has applied.
	 *
	 * Surfaces the FIRST time the user opens broadsheet on an install
	 * where the addon has changed their HA frontend defaults (sidebar
	 * collapsed + broadsheet as the default landing surface). Explains
	 * what happened + how to roll back. Dismissed forever via
	 * localStorage on close, OR via the "Got it" button.
	 *
	 * Heuristic for "addon has applied the takeover":
	 *   - window.__BROADSHEET_ENV__ exists (we're in addon mode, not dev)
	 *   - localStorage["broadsheet:takeover_banner_seen"] !== "true"
	 *
	 * Roll-back path: addon Configuration tab → `sidebar_takeover: false`
	 * → save → addon restarts → sidebar.py reverts each user's defaults
	 * to HA's standards. We surface this path inline in the banner so
	 * the user knows it exists without hunting.
	 *
	 * See docs/plans/plan-sidebar-takeover.md.
	 */

	import { onMount } from 'svelte';

	const STORAGE_KEY = 'broadsheet:takeover_banner_seen';

	let visible = $state(false);

	onMount(() => {
		// Only show in addon mode (env injected by run.sh's runtime-env.js).
		// In dev/standalone, the SPA boots without the env hook, the
		// takeover hasn't applied, and the banner has nothing to advise.
		if (typeof window === 'undefined') return;
		const env = (window as unknown as { __BROADSHEET_ENV__?: { sidebarTakeover?: boolean } })
			.__BROADSHEET_ENV__;
		if (!env) return;
		// Gate on the LIVE takeover state — if the user has rolled back
		// to peer-frontend mode via `sidebar_takeover: false`, the addon
		// never actually changed their HA UI and the banner advisory
		// would be misleading. run.sh writes this flag into runtime-env.
		if (env.sidebarTakeover !== true) return;
		try {
			if (localStorage.getItem(STORAGE_KEY) === 'true') return;
		} catch {
			// localStorage blocked (private browsing / kiosk lockdown) —
			// just don't show the banner. The user will figure it out.
			return;
		}
		visible = true;
	});

	function dismiss() {
		try {
			localStorage.setItem(STORAGE_KEY, 'true');
		} catch {
			// Same swallow as above
		}
		visible = false;
	}
</script>

{#if visible}
	<aside class="takeover-banner" role="status" aria-live="polite">
		<div class="banner-inner">
			<header class="banner-head">
				<span class="banner-eyebrow">№ 00 · A note from broadsheet</span>
				<button
					type="button"
					class="banner-close"
					aria-label="Dismiss"
					onclick={dismiss}
				>
					×
				</button>
			</header>
			<p class="banner-body">
				<em>broadsheet is now your Home Assistant frontend.</em>
				The HA sidebar has collapsed; broadsheet is your landing surface.
				For anything broadsheet doesn't render natively (initial
				integration setup, advanced YAML, debug snapshots, hardware
				config), tap <strong>Open Home Assistant</strong> in the kebab
				menu (top right) to drop into HA proper.
			</p>
			<p class="banner-body banner-revert">
				Not what you wanted? Settings → Add-ons → broadsheet → Configuration,
				flip <code>sidebar_takeover: false</code>, save. HA's sidebar
				returns on next addon restart.
			</p>
			<button type="button" class="banner-cta" onclick={dismiss}>Got it</button>
		</div>
	</aside>
{/if}

<style>
	.takeover-banner {
		position: fixed;
		bottom: var(--space-4);
		left: 50%;
		transform: translateX(-50%);
		z-index: 150;
		max-width: min(640px, 92vw);
		background: var(--bg-card);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
		padding: var(--space-4) var(--space-5);
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
		animation: slideUp var(--ease-normal);
	}

	.banner-inner {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.banner-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.banner-eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
	}

	.banner-close {
		font-family: var(--font-mono);
		font-size: 1.4rem;
		color: var(--fg-muted);
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
	}

	.banner-close:hover {
		color: var(--fg);
	}

	.banner-body {
		font-family: var(--font-body);
		font-size: var(--text-body);
		line-height: var(--leading-snug);
		color: var(--fg);
		margin: 0;
	}

	.banner-body em {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
	}

	.banner-body strong {
		color: var(--accent);
		font-weight: 500;
	}

	.banner-body code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0 var(--space-1);
		background: var(--bg-raised);
		border-radius: 2px;
	}

	.banner-revert {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.banner-cta {
		align-self: flex-end;
		padding: var(--space-2) var(--space-4);
		background: var(--accent);
		color: var(--bg);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		border-radius: var(--radius-pill);
		transition: opacity var(--ease-quick);
	}

	.banner-cta:hover {
		opacity: 0.85;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translate(-50%, 24px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	@media (max-width: 600px) {
		.takeover-banner {
			bottom: var(--space-2);
			left: var(--space-2);
			right: var(--space-2);
			transform: none;
			max-width: none;
		}

		@keyframes slideUp {
			from {
				opacity: 0;
				transform: translateY(24px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}
	}
</style>
