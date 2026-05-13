<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';

	import { initSafety } from '$lib/stores/safety.svelte';
	import { connection } from '$lib/stores/connection.svelte';
	import { wireAuditReactivity } from '$lib/stores/audit.svelte';
	import { restoreAuditFromStorage, audit, getAuditLog } from '$lib/ha/audit';
	import { detectAuthMode, getAuthCredentials } from '$lib/ha/auth';
	import { connect, getConnection } from '$lib/ha/client';
	import { callService } from '$lib/ha/actions';
	import { discovery, bootDiscovery } from '$lib/discovery';
	import WriteAllowedBanner from '$lib/components/WriteAllowedBanner.svelte';
	import KebabNav from '$lib/components/KebabNav.svelte';

	let { children } = $props();

	let booted = $state(false);

	onMount(async () => {
		// 1. Restore audit-log tail (so reload preserves the last hour)
		restoreAuditFromStorage();

		// 2. Wire audit log → reactive tick so UI dl/audit lists re-render
		wireAuditReactivity();

		// 3. Initialise safety state from env + URL
		initSafety({
			readonly: env.PUBLIC_BROADSHEET_READONLY !== 'false'
		});

		// 3. Detect auth mode + try to connect
		const mode = detectAuthMode();
		audit({ kind: 'auth-event', note: `boot — auth mode = ${mode}` });

		if (mode === 'none') {
			// No credentials — redirect to setup unless already there.
			// trailingSlash: 'always' is set in svelte.config.js, so paths
			// always end with '/' — only one form to check.
			if (page.url.pathname !== '/setup/') {
				await goto('/setup');
			}
			booted = true;
			return;
		}

		const creds = getAuthCredentials();
		if (!creds) {
			await goto('/setup');
			booted = true;
			return;
		}

		try {
			await connect(creds);
		} catch (err) {
			// connect() already audited the failure + set connection.lastError
			// eslint-disable-next-line no-console
			console.error('[broadsheet] initial connect failed', err);
			booted = true;
			return;
		}

		// Connect succeeded — run discovery boot. Failures here aren't
		// fatal (UI can still render with empty domain model); we just
		// surface them via discovery.lastError.
		try {
			await bootDiscovery();
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('[broadsheet] discovery boot failed', err);
		}

		booted = true;

		// Dev-only test handle. Exposes the SAME module bindings the
		// layout is using, so DevTools / E2E tests can hit the live
		// connection rather than a fresh dynamic-import instance. Vite
		// dev mode + dynamic imports can return separate module instances
		// in some cases — this avoids the dual-instance trap.
		// Stripped from production builds via tree-shaking on
		// `import.meta.env.DEV`.
		if (import.meta.env.DEV && typeof window !== 'undefined') {
			(window as Window & { __broadsheet_dev__?: object }).__broadsheet_dev__ = {
				callService,
				getConnection,
				getAuditLog,
				connection,
				audit,
				discovery
			};
			audit({ kind: 'auth-event', note: 'window.__broadsheet_dev__ exposed (dev only)' });
		}
	});
</script>

<WriteAllowedBanner />

<!--
	KebabNav is sticky top-right on every page except /setup/. It needs
	the connection to be live (it links to pages that read from
	discovery), so we only mount once booted.
-->
{#if booted && page.url.pathname !== '/setup/'}
	<KebabNav />
{/if}

<div class="app">
	{#if booted}
		{@render children()}
	{:else}
		<div class="bootscreen">
			<p class="loading">Connecting to the house…</p>
		</div>
	{/if}
</div>

<!-- Subtle status pill bottom-right, always visible during dev -->
{#if booted && connection.status !== 'connected' && page.url.pathname !== '/setup/'}
	<aside class="status-pill" data-status={connection.status}>
		{#if connection.status === 'connecting'}
			Connecting…
		{:else if connection.status === 'reconnecting'}
			Reconnecting to the house
		{:else if connection.status === 'fatal'}
			Connection failed — {connection.lastError ?? 'unknown'}
		{:else if connection.status === 'idle'}
			Idle
		{/if}
	</aside>
{/if}

<style>
	.app {
		min-height: 100vh;
	}

	.bootscreen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	.loading {
		color: var(--muted);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.85rem;
		letter-spacing: 0.05em;
	}

	.status-pill {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		padding: 0.4rem 0.8rem;
		background: rgba(26, 24, 20, 0.92);
		border: 1px solid var(--rule);
		border-radius: 999px;
		color: var(--muted);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		backdrop-filter: blur(8px);
	}

	.status-pill[data-status='reconnecting'] {
		color: var(--accent);
		border-color: var(--accent);
	}

	.status-pill[data-status='fatal'] {
		color: #bf3a30;
		border-color: #bf3a30;
	}
</style>
