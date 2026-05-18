<script lang="ts">
	/**
	 * 0.9.4.2 — Lovelace embed escape hatch.
	 *
	 * A thin iframe wrapping an HA Lovelace URL. Perfect fidelity
	 * to the source dashboard (it IS the source rendering); zero
	 * translation gaps. The escape hatch for dashboards built with
	 * card-mod / mushroom / custom HACS components that broadsheet's
	 * static translator can't reproduce.
	 *
	 * Honest about what it is — there's an OutLine label above (when
	 * set) but no styling of the iframe content; what you see inside
	 * is exactly what HA Lovelace renders at that URL.
	 *
	 * Cross-origin caveat: HA defaults to X-Frame-Options: DENY which
	 * blocks iframing. If the iframe shows blank, the user needs to
	 * configure HA to allow framing from broadsheet's origin. We
	 * surface a helpful hint when the iframe likely failed to load
	 * (load-event timeout heuristic).
	 *
	 * Spec: docs/plans/plan-9.4.2-lovelace-embed-escape-hatch.md.
	 */
	import OutLine from '$lib/components/OutLine.svelte';
	import { onMount } from 'svelte';
	import type { LovelaceEmbedBlockConfig } from '../types';

	let { config }: { config: LovelaceEmbedBlockConfig } = $props();

	const rawUrl = $derived((config.url ?? '').trim());
	const height = $derived(Math.max(120, config.height ?? 800));

	/**
	 * 0.9.4.5 — auth injection.
	 *
	 * The iframe is same-origin with broadsheet (both at :8124), so
	 * localStorage is shared. HA's frontend reads its auth tokens from
	 * localStorage["hassTokens"] on boot. If we pre-populate that
	 * BEFORE the iframe mounts, HA skips the OAuth login flow entirely
	 * and proceeds to render the dashboard.
	 *
	 * Token: broadsheet's runtime-env exposes the Supervisor token
	 * (`window.__BROADSHEET_ENV__.supervisorToken`). HA accepts it as
	 * a Bearer token for API calls (broadsheet's `/api/` proxy uses
	 * the same token successfully). Injecting it as `access_token` in
	 * hassTokens makes HA's frontend treat the session as
	 * authenticated.
	 *
	 * `expires` set to far-future so the frontend doesn't try to
	 * refresh via /auth/token (which would 400 — broadsheet's origin
	 * isn't a registered OAuth client). The Supervisor token actually
	 * rotates per container; we re-inject on every iframe mount so
	 * stale tokens never persist long.
	 *
	 * Risk: HA might reject the Supervisor token's signature for
	 * frontend purposes. If it does, the iframe will fall back to the
	 * OAuth login screen — no worse than 0.9.4.4. Empirical test on
	 * mount.
	 */
	function injectHaTokens() {
		if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
		const env = window.__BROADSHEET_ENV__;
		if (!env?.supervisorToken) return;
		try {
			const farFuture = Date.now() + 31536000 * 1000; // 1 year
			const hassTokens = {
				hassUrl: window.location.origin,
				clientId: window.location.origin + '/',
				access_token: env.supervisorToken,
				token_type: 'Bearer',
				refresh_token: '', // unused — expires is far-future
				expires_in: 31536000,
				expires: farFuture
			};
			localStorage.setItem('hassTokens', JSON.stringify(hassTokens));
		} catch (err) {
			// Best-effort. If injection fails, the iframe falls back to
			// the OAuth flow (login screen). User-visible but not fatal.
			// eslint-disable-next-line no-console
			console.warn('[lovelace-embed] auth injection failed:', err);
		}
	}

	// Inject tokens on mount + before every URL change so the iframe
	// always boots with valid auth state.
	onMount(injectHaTokens);
	$effect(() => {
		// re-inject when url changes (URL access triggers re-inject)
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		rawUrl;
		injectHaTokens();
	});

	/**
	 * 0.9.4.3 — rewrite same-host HA URLs to the same-origin embed
	 * proxy. HA serves X-Frame-Options: SAMEORIGIN which blocks the
	 * cross-origin frame (broadsheet at :8124, HA at :8123). The
	 * addon's nginx now exposes `/embed/<path>` which proxies to HA
	 * Core via the Supervisor + strips X-Frame-Options on the way
	 * back. By rewriting the iframe SRC to that path, the iframe is
	 * same-origin with broadsheet → renders fine.
	 *
	 * Rewrite rules:
	 *  - Empty / whitespace → return as-is (renders the empty-state
	 *    placeholder)
	 *  - Absolute URL on same hostname pointing at HA's port 8123 →
	 *    rewrite to `/embed/<path>` (relative; resolves to broadsheet's
	 *    own origin)
	 *  - Absolute URL on a DIFFERENT host → leave as-is (cross-host
	 *    embeds need user-side HA framing config; documented)
	 *  - Already-relative URL starting with `/embed/` → leave as-is
	 *  - Bare path like `/wall-tablet` → prepend `/embed`
	 *  - Other absolute URL not on the addon's host → leave as-is
	 */
	const url = $derived.by(() => {
		const v = rawUrl;
		if (!v) return '';
		if (typeof window === 'undefined') return v;
		// Bare path → assume HA path, route through proxy
		if (v.startsWith('/embed/')) return v;
		if (v.startsWith('/') && !v.startsWith('//')) return '/embed' + v;
		try {
			const parsed = new URL(v, window.location.origin);
			// Same hostname as broadsheet's own?
			if (parsed.hostname === window.location.hostname) {
				// HA on port 8123 specifically — rewrite to proxy.
				// (Other ports on the same host: leave alone — the user
				// might be running broadsheet behind a custom reverse
				// proxy with multiple services.)
				if (parsed.port === '8123' || parsed.port === '') {
					return '/embed' + parsed.pathname + parsed.search + parsed.hash;
				}
			}
			return v;
		} catch {
			return v;
		}
	});

	const proxied = $derived(url.startsWith('/embed'));

	// Hint when the iframe likely failed to load (most common cause:
	// HA's X-Frame-Options DENY blocks framing). The iframe's `load`
	// event fires for BOTH a successful render AND an X-Frame-blocked
	// load (a blocked iframe is still "loaded" from the parent's POV
	// — just with a refused empty document). So we can't actually
	// distinguish them reliably from the parent. The hint is shown
	// when no URL is configured OR after a timeout; users with a
	// blank iframe + a configured URL should consult TROUBLESHOOTING.md.
	let iframeLoadTimedOut = $state(false);
	let loadFired = $state(false);

	$effect(() => {
		if (!url) return;
		// Reset on URL change.
		loadFired = false;
		iframeLoadTimedOut = false;
		// Same-origin proxy responses load reliably; the timeout
		// hint is mainly for unproxied URLs (cross-host embeds).
		if (proxied) return;
		const t = setTimeout(() => {
			if (!loadFired) iframeLoadTimedOut = true;
		}, 5000);
		return () => clearTimeout(t);
	});

	function onLoad() {
		loadFired = true;
		iframeLoadTimedOut = false;
	}
</script>

{#if config.label}
	<OutLine label={config.label} />
{/if}

<section class="lovelace-embed-block">
	{#if !url}
		<div class="empty-state">
			<p class="empty-title">No URL configured.</p>
			<p class="empty-hint">
				Set the embed URL to a Lovelace dashboard path, e.g.
				<code>http://homeassistant.local:8123/wall-tablet/home?kiosk=true</code>.
				The <code>?kiosk=true</code> query parameter suppresses HA's
				sidebar + header for a chrome-free render.
			</p>
		</div>
	{:else}
		<iframe
			src={url}
			title="Embedded Lovelace dashboard"
			class="embed-iframe"
			style="height: {height}px;"
			loading="lazy"
			onload={onLoad}
		></iframe>
		{#if iframeLoadTimedOut}
			<p class="frame-hint">
				If the embed shows blank, HA may be blocking iframes via
				<code>X-Frame-Options: DENY</code> (the default). See
				<a href="https://github.com/alfiedennen/broadsheet/blob/main/docs/TROUBLESHOOTING.md#lovelace-embed-shows-blank">TROUBLESHOOTING.md</a>
				for the HA-side config that allows framing.
			</p>
		{/if}
	{/if}
</section>

<style>
	.lovelace-embed-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.embed-iframe {
		width: 100%;
		border: 1px solid var(--rule, var(--border, #2a261e));
		border-radius: var(--radius-card, 4px);
		background: var(--bg, #1a1814);
		/* `colorScheme: 'dark'` so HA's own theme renders consistently
		   inside the iframe even when broadsheet's outer theme is dark.
		   Won't help if HA itself is light-themed; that's the user's
		   HA-side config. */
		color-scheme: dark light;
	}

	.empty-state {
		padding: var(--space-4, 1rem);
		background: var(--bg-card, var(--bg));
		border: 1px dashed var(--rule, var(--border, #2a261e));
		border-radius: var(--radius-card, 4px);
		font-family: var(--font-body);
		color: var(--fg-muted);
	}
	.empty-title {
		margin: 0 0 var(--space-2, 0.5rem);
		font-style: italic;
		color: var(--accent);
	}
	.empty-hint {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.empty-hint code {
		font-family: var(--font-mono);
		font-size: 0.82em;
	}

	.frame-hint {
		font-family: var(--font-body);
		font-size: 0.82rem;
		font-style: italic;
		color: var(--fg-muted);
		line-height: 1.5;
		margin: 0;
	}
	.frame-hint a {
		color: var(--accent);
	}
	.frame-hint code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
