<script lang="ts">
	/**
	 * `/door` — locks + door/window contacts + paired cameras.
	 *
	 * Composition:
	 *   1. Hero — "All locked" / "{lockName} unlocked" prose
	 *   2. Lock hero per lock entity — big tile with current state +
	 *      Unlock button (safety-rail gated)
	 *   3. Door/window contact list per area
	 *   4. Paired camera image (if discovered)
	 *
	 * Note: lock writes are HARD-BANNED in dev mode regardless of any
	 * flag. The Unlock button calls callService which audit-logs +
	 * blocks. Visible-but-disabled is the design intent — the user
	 * sees the affordance + understands the safety floor.
	 */

	import { base } from '$app/paths';
	import { discovery } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import { callService, getHardBannedDomains } from '$lib/ha/actions';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const doorAreas = $derived(discovery.areasForPage('door'));
	const allLocks = $derived(doorAreas.flatMap((a) => a.locks));
	const allContacts = $derived(doorAreas.flatMap((a) => a.contacts));
	const allCameras = $derived(doorAreas.flatMap((a) => a.cameras));

	const hardBanned = $derived(getHardBannedDomains().includes('lock'));

	const proseState = $derived.by(() => {
		if (allLocks.length === 0) return 'No locks discovered.';
		const unlocked = allLocks.filter((l) => l.state?.state === 'unlocked');
		const locked = allLocks.filter((l) => l.state?.state === 'locked');

		if (unlocked.length === 0 && locked.length === allLocks.length) return 'All locked.';
		if (unlocked.length === allLocks.length) return 'All unlocked.';
		if (unlocked.length === 1) return `${unlocked[0].name}: unlocked.`;
		return `${unlocked.length} unlocked, ${locked.length} locked.`;
	});

	let lastAction: { id: string; result: string; at: Date } | null = $state(null);

	// Cameras whose camera_proxy snapshot failed to load. Some HA camera
	// integrations (battery P2P cams especially) expose a camera entity
	// that 500s on camera_proxy — there's no still to serve. A broken
	// <img> is exactly the kind of HA noise broadsheet should swallow:
	// on error we swap in a quiet "no snapshot" placeholder instead.
	let cameraErrors: Record<string, boolean> = $state({});
	function markCameraFailed(id: string) {
		cameraErrors = { ...cameraErrors, [id]: true };
	}

	async function unlock(lock: DomainEntity) {
		const result = await callService('lock', 'unlock', { entity_id: lock.id });
		lastAction = {
			id: lock.id,
			result: result.success ? 'unlocked' : (result.reason ?? 'failed'),
			at: new Date()
		};
	}

	// HA's `entity_picture` attribute is the canonical "how do I render
	// this entity's image" pointer — it already carries the correct
	// proxy path (`/api/camera_proxy/…` for camera.*, `/api/image_proxy/…`
	// for image.*) plus a fresh access token. Prefer it; fall back to
	// camera_proxy only for camera.* entities that don't expose one.
	// base-prefixed so the request rides broadsheet's nginx /api/ proxy
	// (bearer-injects the SUPERVISOR_TOKEN) rather than hitting origin
	// root — HA's own frontend — which 403s these without a signed token.
	function cameraSrc(cam: DomainEntity): string {
		const pic = cam.state?.attributes?.entity_picture as string | undefined;
		if (pic) return `${base}${pic}`;
		return `${base}/api/camera_proxy/${cam.id}`;
	}

	function describeContact(c: DomainEntity): string {
		const s = c.state?.state;
		if (s === 'on') return 'open';
		if (s === 'off') return 'closed';
		return '—';
	}
</script>

<svelte:head>
	<title>Door · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Door" number={4} />
		{/snippet}
		{#snippet headline()}
			{proseState}
		{/snippet}
	</Hero>

	{#if hardBanned}
		<aside class="ban-banner">
			<span class="ban-icon" aria-hidden="true">⚿</span>
			<div>
				<strong>Lock writes are hard-banned in dev mode.</strong>
				<span>The Unlock button is visible for shape, but every call is blocked + audit-logged. See <code>docs/DEV-ENVIRONMENTS.md</code>.</span>
			</div>
		</aside>
	{/if}

	{#if allLocks.length > 0}
		<OutLine label="Locks" />
		<div class="locks">
			{#each allLocks as lock (lock.id)}
				<section class="lock-tile" data-state={lock.state?.state ?? 'unknown'}>
					<header class="lock-head">
						<h3 class="lock-name">{lock.name}</h3>
						<span class="lock-state">
							{#if lock.state?.state === 'locked'}
								Locked
							{:else if lock.state?.state === 'unlocked'}
								Unlocked
							{:else if lock.state?.state === 'jammed'}
								Jammed
							{:else}
								{lock.state?.state ?? 'unknown'}
							{/if}
						</span>
					</header>

					{#if lock.state?.attributes?.battery_level !== undefined}
						<p class="lock-meta">
							Battery {lock.state.attributes.battery_level}%
						</p>
					{/if}

					<div class="lock-actions">
						<button
							type="button"
							class="unlock-btn"
							onclick={() => unlock(lock)}
						>
							Unlock
						</button>
					</div>

					{#if lastAction && lastAction.id === lock.id}
						<p class="last-action" data-result={lastAction.result}>
							Last attempt: {lastAction.result}
							at {lastAction.at.toLocaleTimeString()}
						</p>
					{/if}
				</section>
			{/each}
		</div>
	{/if}

	{#if allContacts.length > 0}
		<OutLine label="Contacts" />
		<ul class="contact-list">
			{#each allContacts as c (c.id)}
				<li class="contact-row" data-state={c.state?.state ?? 'unknown'}>
					<span class="contact-dot" aria-hidden="true"></span>
					<span class="contact-name">{c.name}</span>
					<span class="contact-state">{describeContact(c)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if allCameras.length > 0}
		<OutLine label="Camera" />
		<div class="cameras">
			{#each allCameras as cam (cam.id)}
				<figure class="camera">
					{#if cameraErrors[cam.id]}
						<div class="camera-fallback">
							<span class="camera-fallback-icon" aria-hidden="true">⃠</span>
							<span>No snapshot</span>
						</div>
					{:else}
						<img
							src={cameraSrc(cam)}
							alt={cam.name}
							loading="lazy"
							onerror={() => markCameraFailed(cam.id)}
						/>
					{/if}
					<figcaption>{cam.name}</figcaption>
				</figure>
			{/each}
		</div>
	{/if}

	{#if doorAreas.length === 0}
		<p class="empty">No door / lock entities discovered yet.</p>
	{/if}
</PageShell>

<style>
	.ban-banner {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--accent-glow);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
	}

	.ban-icon {
		font-size: 1.3rem;
		color: var(--accent);
		flex: 0 0 auto;
	}

	.ban-banner strong {
		display: block;
		color: var(--accent);
		font-weight: 500;
		margin-bottom: var(--space-1);
	}

	.ban-banner span {
		color: var(--fg-muted);
	}

	.ban-banner code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--fg);
	}

	.locks {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.lock-tile {
		padding: var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.lock-tile[data-state='unlocked'] {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.lock-tile[data-state='jammed'] {
		border-color: var(--state-alert);
	}

	.lock-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: var(--space-2);
	}

	.lock-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		font-weight: 400;
		color: var(--accent);
		margin: 0;
	}

	.lock-state {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.lock-tile[data-state='unlocked'] .lock-state {
		color: var(--accent);
	}

	.lock-tile[data-state='jammed'] .lock-state {
		color: var(--state-alert);
	}

	.lock-meta {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		margin: 0 0 var(--space-4);
	}

	.lock-actions {
		display: flex;
		gap: var(--space-2);
	}

	.unlock-btn {
		flex: 1;
		padding: var(--space-3) var(--space-6);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--bg);
		background: var(--accent);
		border-radius: var(--radius-card);
		font-weight: 500;
		min-height: 44px;
		transition: background var(--ease-quick);
	}

	.unlock-btn:hover {
		background: var(--accent-soft);
	}

	.last-action {
		margin: var(--space-3) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
	}

	.last-action[data-result='hard-banned'] {
		color: var(--state-alert);
	}

	.last-action[data-result='unlocked'] {
		color: var(--state-on);
	}

	.last-action[data-result='readonly'] {
		color: var(--accent);
	}

	.contact-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.contact-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--rule);
	}

	.contact-row:last-child {
		border-bottom: none;
	}

	.contact-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--state-on);
	}

	.contact-row[data-state='on'] .contact-dot {
		background: var(--state-alert);
		box-shadow: 0 0 8px var(--state-alert);
	}

	.contact-name {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.contact-state {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		text-transform: lowercase;
	}

	.contact-row[data-state='on'] .contact-state {
		color: var(--state-alert);
	}

	.cameras {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.camera {
		margin: 0;
	}

	.camera img {
		width: 100%;
		border-radius: var(--radius-card);
		border: 1px solid var(--rule);
		display: block;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		background: var(--bg-raised);
	}

	.camera-fallback {
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: var(--radius-card);
		border: 1px solid var(--rule);
		background: var(--bg-raised);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.camera-fallback-icon {
		font-size: 1.6rem;
		color: var(--rule-strong, var(--fg-muted));
	}

	.camera figcaption {
		margin-top: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}
</style>
