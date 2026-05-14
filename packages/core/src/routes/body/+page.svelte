<script lang="ts">
	/**
	 * `/body` — Health-Connect (Pixel) sensors with stale banner +
	 * honest sub-labels.
	 *
	 * Composition:
	 *   1. Hero — "Sleeping" / "Resting heart 60bpm" prose
	 *   2. Per-sensor panel with current reading + sub-label explaining
	 *      WHY a panel might be empty (Health Connect updates are
	 *      event-driven and chunked, not continuous)
	 *   3. Stale banner if no sensor has reported recently
	 *
	 * Apple Health bridge → v0.2 plugin.
	 */

	import { discovery } from '$lib/discovery';
	import type { DomainEntity } from '$lib/discovery';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const sensors = $derived(discovery.crossAreaEntitiesForPage('body'));

	// Per-sensor metadata: pretty label + honest "why empty" sub-label
	type ValueKind = 'auto' | 'duration-min' | 'duration-ms';
	type Meta = { match: RegExp; label: string; subLabel: string; kind?: ValueKind };
	const META: Meta[] = [
		{ match: /sleep_duration/i, label: 'Sleep last night', subLabel: 'updated once daily', kind: 'duration-min' },
		{ match: /sleep_confidence/i, label: 'Sleep confidence', subLabel: 'paired with sleep duration' },
		{ match: /sleep_segment/i, label: 'Sleep segment', subLabel: 'most recent stage', kind: 'duration-ms' },
		{ match: /resting_heart_rate/i, label: 'Resting heart rate', subLabel: 'measured during sleep' },
		{ match: /heart_rate(?!_)/i, label: 'Heart rate', subLabel: 'most recent reading' },
		{ match: /heart_rate_variability|hrv/i, label: 'HRV', subLabel: 'measured during sleep' },
		{ match: /respiratory_rate/i, label: 'Respiratory rate', subLabel: 'measured during sleep' },
		{ match: /oxygen_saturation/i, label: 'Oxygen saturation', subLabel: 'most recent SpO2' },
		{ match: /body_temperature/i, label: 'Body temperature', subLabel: 'most recent reading' },
		{ match: /steps/i, label: 'Steps today', subLabel: 'updates throughout the day' },
		{ match: /calories/i, label: 'Calories', subLabel: 'estimated active energy' }
	];

	function metaFor(e: DomainEntity): Meta {
		for (const m of META) {
			if (m.match.test(e.id)) return m;
		}
		return { match: /./, label: e.name, subLabel: '' };
	}

	// "Xh Ym" from a raw second count — editorial, not a raw ms/min dump.
	function humanizeDuration(totalSeconds: number): string {
		if (!isFinite(totalSeconds) || totalSeconds < 0) return '—';
		const totalMin = Math.round(totalSeconds / 60);
		if (totalMin < 1) return '<1m';
		const h = Math.floor(totalMin / 60);
		const m = totalMin % 60;
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	function valueFor(e: DomainEntity): string {
		const s = e.state?.state;
		if (s === undefined || s === null || s === 'unknown' || s === 'unavailable') return '—';
		const n = Number(s);
		const unit = e.state?.attributes?.unit_of_measurement as string | undefined;
		const kind = metaFor(e).kind;

		// Duration sensors → humanised "Xh Ym". Health Connect ships
		// sleep_duration in minutes and sleep_segment in milliseconds;
		// both are raw integers without the conversion. (HRV is also in
		// ms but ms IS its natural unit — so this is keyed on the
		// sensor's kind, never blindly on the unit string.)
		if (!isNaN(n)) {
			if (kind === 'duration-min') return humanizeDuration(n * 60);
			if (kind === 'duration-ms') return humanizeDuration(n / 1000);
			return `${n.toFixed(unit && unit.includes('%') ? 0 : 1)}${unit ? ` ${unit}` : ''}`;
		}
		return s;
	}

	function ageFor(e: DomainEntity): string {
		if (!e.state?.last_updated) return 'never';
		const ageMs = Date.now() - new Date(e.state.last_updated).getTime();
		const mins = Math.round(ageMs / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.round(hours / 24);
		return `${days}d ago`;
	}

	// Stale: no sensor reported in last 6h
	const isStale = $derived.by(() => {
		if (sensors.length === 0) return false;
		const sixHoursMs = 6 * 60 * 60 * 1000;
		return sensors.every((s) => {
			if (!s.state?.last_updated) return true;
			return Date.now() - new Date(s.state.last_updated).getTime() > sixHoursMs;
		});
	});

	const proseState = $derived.by(() => {
		if (sensors.length === 0) return 'No Health Connect sensors discovered.';
		const hr = sensors.find((s) => /heart_rate(?!_)/.test(s.id));
		const hrv = sensors.find((s) => /heart_rate_variability|hrv/.test(s.id));
		const sleep = sensors.find((s) => /sleep_duration/.test(s.id));

		const parts: string[] = [];
		if (hr && hr.state && !['unknown', 'unavailable'].includes(hr.state.state)) {
			parts.push(`heart ${valueFor(hr)}`);
		}
		if (hrv && hrv.state && !['unknown', 'unavailable'].includes(hrv.state.state)) {
			parts.push(`HRV ${valueFor(hrv)}`);
		}
		if (sleep && sleep.state && !['unknown', 'unavailable'].includes(sleep.state.state)) {
			parts.push(`${valueFor(sleep)} of sleep`);
		}
		if (parts.length === 0) return 'Quiet — Health Connect hasn’t reported recently.';
		return parts.join(', ') + '.';
	});
</script>

<svelte:head>
	<title>Body · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Body" number={6} />
		{/snippet}
		{#snippet headline()}
			{proseState}
		{/snippet}
	</Hero>

	{#if isStale}
		<aside class="stale-banner">
			<strong>No fresh readings.</strong>
			<span>
				Health Connect ships data event-driven (5–15 min chunks). If this stays
				stale: open Companion App on the phone, check that Health Connect
				permissions are granted to the data sources you use (Fitbit, Pixel
				Health, etc.), and that those apps are set to write to Health Connect.
			</span>
		</aside>
	{/if}

	{#if sensors.length > 0}
		<OutLine label="Today" />
		<div class="panels">
			{#each sensors as s (s.id)}
				{@const meta = metaFor(s)}
				<section class="panel" data-empty={s.state?.state === 'unknown' || s.state?.state === 'unavailable' ? 'true' : 'false'}>
					<header class="panel-head">
						<h3 class="panel-label">{meta.label}</h3>
						{#if meta.subLabel}<span class="panel-sub">{meta.subLabel}</span>{/if}
					</header>
					<p class="panel-value">{valueFor(s)}</p>
					<p class="panel-age">
						<span class="panel-id">{s.id}</span>
						<span class="dot" aria-hidden="true">·</span>
						<span>{ageFor(s)}</span>
					</p>
				</section>
			{/each}
		</div>
	{:else}
		<p class="empty">
			No Health Connect sensors discovered yet. The pattern matches
			<code>sensor.*pixel*_(sleep|heart|hrv|...)</code>. If your sensors have
			a different name, this v0.1 heuristic won't pick them up — Apple Health
			bridge + custom-pattern overrides are on the v0.2 roadmap.
		</p>
	{/if}
</PageShell>

<style>
	.stale-banner {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
	}

	.stale-banner strong {
		color: var(--accent);
		font-weight: 500;
	}

	.stale-banner span {
		color: var(--fg-muted);
	}

	.panels {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-4);
	}

	@media (min-width: 540px) {
		.panels {
			grid-template-columns: 1fr 1fr;
		}
	}

	.panel {
		padding: var(--space-4) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.panel[data-empty='true'] {
		opacity: 0.6;
	}

	.panel-head {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.panel-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		font-weight: 400;
		color: var(--accent);
		margin: 0;
	}

	.panel-sub {
		font-family: var(--font-caption);
		font-size: var(--text-eyebrow);
		color: var(--fg-muted);
		text-transform: lowercase;
		letter-spacing: var(--track-caption);
	}

	.panel-value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 1.8rem;
		color: var(--fg);
		margin: 0;
	}

	.panel[data-empty='true'] .panel-value {
		color: var(--fg-dim);
	}

	.panel-age {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
		margin: 0;
	}

	.panel-id {
		font-size: 0.7rem;
		opacity: 0.7;
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
	}

	.empty code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--fg);
	}
</style>
