<script lang="ts">
	/**
	 * SparklineBlockRenderer — inline SVG chart of one entity's history.
	 *
	 * The first historical-data-aware primitive in broadsheet. Pulls
	 * history via HA's stable `history/history_during_period` WS API
	 * on mount (and when entityId/hours changes), renders an inline
	 * SVG sparkline + the live current value.
	 *
	 * Why a tiny custom SVG renderer instead of pulling Chart.js or
	 * D3:
	 *   - Bundle size — the existing primitives are all sub-10KB.
	 *     Chart.js is ~150KB, D3 is ~80KB+. A 40-line SVG sparkline
	 *     adds ~1KB.
	 *   - Editorial register — a sparkline doesn't need axes, grids,
	 *     tooltips, or legends. Just the line. Chart libraries are
	 *     overkill for what's actually a paragraph-of-prose-shaped
	 *     visual element.
	 *   - Brittleness firewall — no extra runtime dep, no version
	 *     pinning across HA upgrades.
	 *
	 * The current value sits prominently next to the chart so the
	 * sparkline reads as "trend + now", not "chart"; the trend line
	 * is the supporting witness, not the headline.
	 *
	 * Limits:
	 *   - Numeric histories only. Non-numeric entities (e.g.
	 *     media_player state strings) render a "non-numeric" notice.
	 *   - Single entity per sparkline. Multi-line charts (mini-graph
	 *     with 2+ entities) translate to multiple sparklines.
	 *   - No tooltips, no zoom, no clickability. By design.
	 */
	import { onMount } from 'svelte';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { getConnection } from '$lib/ha/client';
	import OutLine from '$lib/components/OutLine.svelte';
	import type { SparklineBlockConfig } from '../types';

	let { config }: { config: SparklineBlockConfig } = $props();

	const hours = $derived(config.hours ?? 24);

	// One state-change row from history/history_during_period (the
	// `minimal_response: true, no_attributes: true` shape).
	type HistRow = { s: string; lu?: number };

	let points = $state<{ t: number; v: number }[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let isNumeric = $state(true);

	async function fetchHistory() {
		loading = true;
		errorMsg = null;
		const conn = getConnection();
		if (!conn) {
			errorMsg = 'No HA connection.';
			loading = false;
			return;
		}
		if (!config.entityId) {
			errorMsg = 'No entity_id configured.';
			loading = false;
			return;
		}
		try {
			const end = new Date();
			const start = new Date(end.getTime() - hours * 3600_000);
			const result = (await conn.sendMessagePromise({
				type: 'history/history_during_period',
				start_time: start.toISOString(),
				end_time: end.toISOString(),
				entity_ids: [config.entityId],
				minimal_response: true,
				no_attributes: true
			})) as Record<string, HistRow[]>;
			const rows = result?.[config.entityId] ?? [];
			const now = Date.now();
			const collected: { t: number; v: number }[] = [];
			let nonNumericCount = 0;
			for (const r of rows) {
				const v = Number(r.s);
				if (!isFinite(v)) {
					nonNumericCount++;
					continue;
				}
				// `lu` is unix-seconds (HA's compact format). Some HA versions
				// return ISO strings; handle both.
				const t =
					typeof r.lu === 'number' ? r.lu * 1000 : r.lu ? new Date(r.lu).getTime() : now;
				collected.push({ t, v });
			}
			isNumeric = nonNumericCount === 0 || collected.length > 0;
			if (!isNumeric) {
				errorMsg = 'Entity history is not numeric — sparkline only works for sensors with numeric state.';
			}
			points = collected;
		} catch (err) {
			errorMsg = String(err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchHistory();
	});

	// Refetch when the configured entity / window changes (editor live edits)
	$effect(() => {
		// reactive deps
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		config.entityId, config.hours;
		fetchHistory();
	});

	// Live current value from the regular state subscription.
	const currentState = $derived(discoveryStore.states[config.entityId]?.state ?? '—');
	const unit = $derived(
		config.unit ?? (discoveryStore.states[config.entityId]?.attributes?.unit_of_measurement as string | undefined) ?? ''
	);

	// SVG path for the sparkline. Fixed viewBox; scale points into it.
	const VIEW_W = 400;
	const VIEW_H = 60;
	const PAD = 4;

	const path = $derived.by(() => {
		if (points.length < 2) return '';
		const xs = points.map((p) => p.t);
		const ys = points.map((p) => p.v);
		const xMin = Math.min(...xs);
		const xMax = Math.max(...xs);
		const yMin = Math.min(...ys);
		const yMax = Math.max(...ys);
		const xRange = xMax - xMin || 1;
		const yRange = yMax - yMin || 1;
		const sx = (t: number) => PAD + ((t - xMin) / xRange) * (VIEW_W - 2 * PAD);
		const sy = (v: number) => VIEW_H - PAD - ((v - yMin) / yRange) * (VIEW_H - 2 * PAD);
		let d = `M ${sx(points[0].t)} ${sy(points[0].v)}`;
		for (let i = 1; i < points.length; i++) {
			d += ` L ${sx(points[i].t)} ${sy(points[i].v)}`;
		}
		return d;
	});

	const yMin = $derived(points.length ? Math.min(...points.map((p) => p.v)) : 0);
	const yMax = $derived(points.length ? Math.max(...points.map((p) => p.v)) : 0);
</script>

{#if config.label}
	<OutLine label={config.label} />
{/if}

<div class="sparkline-block">
	<header class="sparkline-meta">
		<span class="sparkline-id"><code>{config.entityId || '(no entity)'}</code></span>
		<span class="sparkline-current">
			<span class="now-value">{currentState}</span>
			{#if unit}<span class="now-unit">{unit}</span>{/if}
		</span>
	</header>

	<div class="sparkline-chart" aria-hidden="true">
		{#if loading}
			<span class="sparkline-status">loading {hours}h…</span>
		{:else if errorMsg}
			<span class="sparkline-status error">{errorMsg}</span>
		{:else if points.length < 2}
			<span class="sparkline-status">not enough history yet ({points.length} point{points.length === 1 ? '' : 's'})</span>
		{:else}
			<svg viewBox="0 0 {VIEW_W} {VIEW_H}" preserveAspectRatio="none" class="sparkline-svg">
				<path d={path} />
			</svg>
			<span class="sparkline-range">
				{Math.round(yMin * 10) / 10}–{Math.round(yMax * 10) / 10}{unit ? ` ${unit}` : ''} · last {hours}h
			</span>
		{/if}
	</div>
</div>

<style>
	.sparkline-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		margin-bottom: var(--space-4);
	}

	.sparkline-meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
	}

	.sparkline-id {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.sparkline-id code {
		color: var(--fg-muted);
	}

	.sparkline-current {
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}

	.now-value {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}

	.now-unit {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.sparkline-chart {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 80px;
		justify-content: center;
	}

	.sparkline-svg {
		display: block;
		width: 100%;
		height: 60px;
		stroke: var(--accent);
		stroke-width: 1.5;
		fill: none;
		vector-effect: non-scaling-stroke;
	}

	.sparkline-range {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
		text-align: right;
	}

	.sparkline-status {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		font-size: var(--text-caption);
	}

	.sparkline-status.error {
		color: var(--state-alert);
	}
</style>
