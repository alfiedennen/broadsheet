<script lang="ts">
	/**
	 * /settings/logs — broadsheet-native view of HA's system_log.
	 *
	 * Reads via system_log/list. Groups by integration (extracted from
	 * the log entry's `name` field). Per-row reveal shows the full
	 * exception + line metadata.
	 *
	 * Clear-all is the v0.1 mutation; per-integration filter is a
	 * client-side group-by (HA's clear endpoint doesn't take a filter
	 * argument). Per design decision Q5: integration filter is the
	 * primary axis; severity-filter + search defer to v0.1.1.
	 *
	 * Rubric: P7-S3 (logs variant).
	 */

	import { onMount } from 'svelte';
	import SettingsSurface from '$lib/components/settings/SettingsSurface.svelte';
	import StatusGrouped, {
		type StatusGroup
	} from '$lib/components/settings/StatusGrouped.svelte';
	import EditorialRow from '$lib/components/settings/EditorialRow.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import {
		listSystemLog,
		clearSystemLog,
		logsByIntegration,
		logSummary,
		integrationFromLog,
		type SystemLogEntry
	} from '$lib/ha/admin/logs';

	let entries = $state<SystemLogEntry[]>([]);
	let loading = $state(true);
	let pendingClear = $state(false);

	const byIntegration = $derived(logsByIntegration(entries));
	const groups = $derived.by(() => {
		const out: StatusGroup<SystemLogEntry>[] = [];
		const sorted = [...byIntegration.entries()].sort((a, b) => {
			// Errors first, then by count desc
			const aErrors = a[1].filter((e) => e.level === 'ERROR' || e.level === 'CRITICAL').length;
			const bErrors = b[1].filter((e) => e.level === 'ERROR' || e.level === 'CRITICAL').length;
			if (bErrors !== aErrors) return bErrors - aErrors;
			return b[1].length - a[1].length;
		});
		for (const [integ, items] of sorted) {
			const errors = items.filter((e) => e.level === 'ERROR' || e.level === 'CRITICAL').length;
			const warnings = items.filter((e) => e.level === 'WARNING').length;
			const counts: string[] = [];
			if (errors > 0) counts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
			if (warnings > 0) counts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
			out.push({
				label: `${integ} · ${counts.join(', ') || `${items.length} info`}`,
				items,
				tone: errors > 0 ? 'alert' : warnings > 0 ? 'default' : 'muted'
			});
		}
		return out;
	});

	const summary = $derived(logSummary(entries));

	async function refresh() {
		entries = await listSystemLog();
		loading = false;
	}

	async function onClear() {
		if (!pendingClear) {
			pendingClear = true;
			return;
		}
		const r = await clearSystemLog();
		pendingClear = false;
		showToast(
			r.success ? `Cleared ${entries.length} log ${entries.length === 1 ? 'entry' : 'entries'}` : `Clear failed — ${r.error}`,
			r.success ? 'success' : 'error'
		);
		if (r.success) await refresh();
	}

	function formatTime(unix: number): string {
		const d = new Date(unix * 1000);
		const now = Date.now();
		const ageMs = now - d.getTime();
		if (ageMs < 60_000) return 'just now';
		if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
		if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h ago`;
		return d.toLocaleString();
	}

	onMount(() => {
		void refresh();
	});
</script>

<svelte:head>
	<title>Logs · Settings · broadsheet</title>
</svelte:head>

<SettingsSurface
	section="Settings · Logs"
	headline="Recent errors + warnings."
	dek="HA's system_log — what Python noticed it didn't like over the last hour or so. Grouped by integration; tap to read the full exception."
	haPath="/config/logs"
	haLabel="Open HA's full log viewer →"
>
	{#if loading}
		<p class="loading">Reading the system log…</p>
	{:else}
		<div class="actions-bar">
			<button
				type="button"
				class="clear-button"
				class:pending={pendingClear}
				disabled={entries.length === 0}
				onclick={onClear}
			>
				{pendingClear ? 'Confirm clear' : `Clear all (${entries.length})`}
			</button>
		</div>

		<StatusGrouped
			{summary}
			{groups}
			emptyAll="The system log is empty — HA hasn't logged any warnings or errors recently."
		>
			{#snippet row(item)}
				{@const e = item as SystemLogEntry}
				{@const isErr = e.level === 'ERROR' || e.level === 'CRITICAL'}
				<EditorialRow
					tone={isErr ? 'alert' : e.level === 'WARNING' ? 'default' : 'muted'}
				>
					{#snippet label()}
						{e.message?.[0]?.slice(0, 120) ?? '(no message)'}
					{/snippet}
					{#snippet status()}
						{e.level} · {formatTime(e.timestamp)}
						{#if e.count > 1} · ×{e.count}{/if}
					{/snippet}
					{#snippet details()}
						<dl class="log-details">
							<dt>Source</dt>
							<dd><code>{e.name}</code></dd>
							<dt>File</dt>
							<dd>
								<code>{e.source?.[0] ?? '—'}</code>
								{#if e.source?.[1]}:<code>{e.source[1]}</code>{/if}
							</dd>
							<dt>Integration</dt>
							<dd>{integrationFromLog(e)}</dd>
							{#if e.first_occurred && e.first_occurred !== e.timestamp}
								<dt>First seen</dt>
								<dd>{formatTime(e.first_occurred)}</dd>
							{/if}
							{#if e.exception}
								<dt>Exception</dt>
								<dd><pre class="exception">{e.exception}</pre></dd>
							{/if}
							{#if e.message && e.message.length > 1}
								<dt>Full message</dt>
								<dd>
									{#each e.message as line, i (i)}
										<p class="msg-line">{line}</p>
									{/each}
								</dd>
							{/if}
						</dl>
					{/snippet}
				</EditorialRow>
			{/snippet}
		</StatusGrouped>
	{/if}
</SettingsSurface>

<style>
	.loading {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		text-align: center;
		padding: var(--space-6);
	}

	.actions-bar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--space-3);
	}

	.clear-button {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
		transition:
			border-color var(--ease-quick),
			color var(--ease-quick);
	}

	.clear-button:not(:disabled):hover {
		border-color: var(--state-alert, #bf3a30);
		color: var(--state-alert, #bf3a30);
	}

	.clear-button.pending {
		border-color: var(--state-alert, #bf3a30);
		color: var(--state-alert, #bf3a30);
	}

	.log-details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}

	.log-details dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.log-details dd {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.log-details code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}

	.exception {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		white-space: pre-wrap;
		max-height: 240px;
		overflow-y: auto;
		padding: var(--space-2);
		background: var(--bg-raised);
		border-radius: var(--radius-card);
		margin: 0;
	}

	.msg-line {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
		margin: 0 0 var(--space-1);
		line-height: var(--leading-snug);
	}
</style>
