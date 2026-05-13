<script lang="ts">
	/**
	 * M1 landing — connection-aware status surface. Real editorial
	 * landing (live painting + manifest line) lands in M3 after the
	 * discovery layer (M2) is in place.
	 */
	import { connection } from '$lib/stores/connection.svelte';
	import { safety } from '$lib/stores/safety.svelte';
	import { auditStore } from '$lib/stores/audit.svelte';
	import { getHardBannedDomains } from '$lib/ha/actions';
	import { getAuditLog } from '$lib/ha/audit';

	// Read auditStore.tick to establish reactive dependency — every audit
	// write bumps tick, this re-runs, recent re-renders.
	const recent = $derived.by(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		auditStore.tick;
		return getAuditLog().slice(-8).reverse();
	});
</script>

<svelte:head>
	<title>broadsheet</title>
</svelte:head>

<main>
	<header>
		<p class="eyebrow">№ 01 · m1 — safety rails</p>
		<h1><em>broadsheet</em></h1>
		<p class="dek">An editorial frontend for Home Assistant. Under construction.</p>
	</header>

	<section class="card status">
		<h2>Connection</h2>
		<dl>
			<dt>Status</dt>
			<dd data-status={connection.status}>
				{connection.status}
				{#if connection.haVersion}<small>(HA {connection.haVersion})</small>{/if}
			</dd>
			{#if connection.lastConnectAt}
				<dt>Connected at</dt>
				<dd>{connection.lastConnectAt.toLocaleTimeString()}</dd>
			{/if}
			{#if connection.lastDisconnectAt}
				<dt>Last disconnect</dt>
				<dd>{connection.lastDisconnectAt.toLocaleTimeString()}</dd>
			{/if}
			{#if connection.reconnectAttempts > 0}
				<dt>Reconnect attempts</dt>
				<dd>{connection.reconnectAttempts}</dd>
			{/if}
			{#if connection.lastError}
				<dt>Last error</dt>
				<dd class="error">{connection.lastError}</dd>
			{/if}
		</dl>
	</section>

	<section class="card status">
		<h2>Safety</h2>
		<dl>
			<dt>Mode</dt>
			<dd>
				{safety.readonly ? 'readonly (default)' : 'writes-allowed (env)'}
			</dd>
			<dt>This session</dt>
			<dd data-status={safety.writesAllowed ? 'writes' : 'safe'}>
				{safety.writesAllowed ? 'WRITES ARMED' : 'reads only'}
			</dd>
			<dt>Hard-banned</dt>
			<dd>
				{getHardBannedDomains().join(', ') || '(none)'}
				<small>(blocked even with writes armed)</small>
			</dd>
		</dl>
	</section>

	<section class="card audit">
		<h2>Audit log <small>(last 8)</small></h2>
		{#if recent.length === 0}
			<p class="empty">No events yet.</p>
		{:else}
			<ol>
				{#each recent as entry (entry.id)}
					<li class="audit-entry" data-kind={entry.kind}>
						<time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
						<code>{entry.kind}</code>
						<span class="detail">
							{#if entry.domain && entry.service}
								{entry.domain}.{entry.service}
							{:else if entry.note}
								{entry.note}
							{:else if entry.error}
								{entry.error}
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<footer>
		<p>
			M1 ships safety rails + WS client. M2 (discovery layer) and M3 (the six
			editorial pages) are next. See <code>docs/BUILD-LOG.md</code> in the repo
			for the running journal.
		</p>
	</footer>
</main>

<style>
	main {
		max-width: 64ch;
		margin: 0 auto;
		padding: 4rem 2rem;
	}

	.eyebrow {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0 0 0.5rem;
	}

	h1 {
		font-family: 'Instrument Serif', Georgia, serif;
		font-size: clamp(3rem, 8vw, 5rem);
		font-weight: 400;
		line-height: 1;
		margin: 0 0 1rem;
		color: var(--accent);
	}

	h1 em {
		font-style: italic;
	}

	.dek {
		color: var(--muted);
		font-size: 1.1rem;
		margin: 0 0 3rem;
	}

	.card {
		margin-bottom: 2rem;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--rule);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.015);
	}

	.card h2 {
		margin: 0 0 1rem;
		font-family: 'Instrument Serif', Georgia, serif;
		font-style: italic;
		font-size: 1.4rem;
		font-weight: 400;
		color: var(--accent);
	}

	.card h2 small {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-style: normal;
		font-size: 0.7rem;
		color: var(--muted);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin-left: 0.5rem;
	}

	dl {
		display: grid;
		grid-template-columns: 12rem 1fr;
		gap: 0.5rem 1rem;
		margin: 0;
	}

	dt {
		color: var(--muted);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		letter-spacing: 0.04em;
	}

	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	dd small {
		color: var(--muted);
		font-size: 0.85em;
		margin-left: 0.4rem;
	}

	dd[data-status='connected'] {
		color: #7aa37a;
	}
	dd[data-status='reconnecting'] {
		color: var(--accent);
	}
	dd[data-status='fatal'] {
		color: #bf3a30;
	}
	dd[data-status='writes'] {
		color: #bf3a30;
		font-weight: 700;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	dd[data-status='safe'] {
		color: #7aa37a;
	}

	dd.error {
		color: #bf3a30;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.85rem;
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.audit-entry {
		display: grid;
		grid-template-columns: 5rem 12rem 1fr;
		gap: 0.75rem;
		padding: 0.4rem 0;
		font-size: 0.85rem;
		border-bottom: 1px solid var(--rule);
		align-items: baseline;
	}

	.audit-entry:last-child {
		border-bottom: none;
	}

	.audit-entry time {
		color: var(--muted);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	.audit-entry code {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--accent);
	}

	.audit-entry[data-kind='blocked-readonly'] code {
		color: var(--accent);
	}
	.audit-entry[data-kind='blocked-hard-banned'] code {
		color: #bf3a30;
	}
	.audit-entry[data-kind='call-service-error'] code {
		color: #bf3a30;
	}
	.audit-entry[data-kind='call-service'] code {
		color: #7aa37a;
	}

	.audit-entry .detail {
		color: var(--fg);
		font-size: 0.85rem;
	}

	.empty {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0;
	}

	footer {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid var(--rule);
		color: var(--muted);
		font-size: 0.85rem;
		line-height: 1.6;
	}

	footer code {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.9em;
		color: var(--fg);
	}
</style>
