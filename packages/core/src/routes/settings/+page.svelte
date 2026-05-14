<script lang="ts">
	/**
	 * /settings — landing.
	 *
	 * Two zones:
	 *  1. Alerts — proactive "here's what needs attention", surfaced
	 *     at the top so curation feels guided rather than stumbled into
	 *  2. Section cards — declarative entry points to each sub-page
	 */

	import { base } from '$app/paths';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import { computeAlerts } from '$lib/curation/alerts.svelte';
	import { discovery } from '$lib/discovery';
	import { curationStore } from '$lib/curation/store.svelte';

	const alerts = $derived.by(() => {
		// Reactive deps
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		discovery.booted, curationStore.tick;
		return computeAlerts();
	});

	const sections = [
		{
			slug: 'house',
			label: 'House',
			tagline: 'Areas + entities. Rename, hide, pin to pages.',
			count: () => `${discovery.areas.length} areas, ${discovery.rawCounts.entities} entities`
		},
		{
			slug: 'people',
			label: 'People',
			tagline: 'Who lives here, and which sensor tracks them.',
			count: () => `${discovery.persons.length} discovered`
		},
		{
			slug: 'voice',
			label: 'Voice',
			tagline: 'Override the editorial strings broadsheet uses.',
			count: () => `${Object.keys(curationStore.current.voice).length} overrides`
		},
		{
			slug: 'plugins',
			label: 'Plugins',
			tagline: 'What ships in the box. Opt in, opt out, see why.',
			count: () => {
				const enabled = Object.values(curationStore.current.plugins).filter(
					(p) => p.enabled
				).length;
				return `${enabled} enabled`;
			}
		}
	];
</script>

<svelte:head>
	<title>Settings · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings" number={0} />
		{/snippet}
		{#snippet headline()}
			Make broadsheet your shape.
		{/snippet}
		{#snippet dek()}
			Every change saves immediately. No save button.
		{/snippet}
	</Hero>

	{#if alerts.length > 0}
		<OutLine label="What needs your attention" />
		<ul class="alerts">
			{#each alerts as alert (alert.id)}
				<li class="alert" data-severity={alert.severity}>
					<div class="alert-body">
						<h3 class="alert-title">{alert.title}</h3>
						<p class="alert-text">{alert.body}</p>
					</div>
					{#if alert.cta}
						<a class="alert-cta" href={alert.cta.href}>{alert.cta.label} →</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<OutLine label="Sections" />
	<ul class="sections">
		{#each sections as s (s.slug)}
			<li>
				<a class="section-card" href="{base}/settings/{s.slug}/">
					<div class="section-head">
						<h3 class="section-name">{s.label}</h3>
						<span class="section-count">{s.count()}</span>
					</div>
					<p class="section-tagline">{s.tagline}</p>
					<span class="section-arrow" aria-hidden="true">→</span>
				</a>
			</li>
		{/each}
	</ul>

	<aside class="meta">
		<p>
			Settings persist to <code>broadsheet.json</code> in your browser's
			localStorage today. Once you install the HA add-on, the same file lives
			in <code>/data/</code> on your HA host (and gets backed up via HA
			snapshots).
		</p>
		{#if curationStore.current.lastModifiedAt}
			<p class="meta-time">
				Last modified
				{new Date(curationStore.current.lastModifiedAt).toLocaleString()}
			</p>
		{/if}
	</aside>
</PageShell>

<style>
	.alerts {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
	}

	.alert {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	@media (min-width: 540px) {
		.alert {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-4);
		}
	}

	.alert[data-severity='attention'] {
		border-color: var(--accent);
	}

	.alert[data-severity='urgent'] {
		border-color: var(--state-alert);
		background: rgba(191, 58, 48, 0.05);
	}

	.alert-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		font-weight: 400;
		color: var(--accent);
		margin: 0 0 var(--space-1);
	}

	.alert[data-severity='urgent'] .alert-title {
		color: var(--state-alert);
	}

	.alert-text {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: 0;
	}

	.alert-cta {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		flex: 0 0 auto;
		white-space: nowrap;
	}

	.sections {
		list-style: none;
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
	}

	@media (min-width: 768px) {
		.sections {
			grid-template-columns: 1fr 1fr;
		}
	}

	.section-card {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		text-decoration: none;
		color: var(--fg);
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.section-card:hover {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.section-head {
		grid-column: 1 / 2;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.section-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		font-weight: 400;
		color: var(--accent);
		margin: 0;
	}

	.section-count {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.section-tagline {
		grid-column: 1 / 2;
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: 0;
	}

	.section-arrow {
		grid-column: 2 / 3;
		grid-row: 1 / -1;
		align-self: center;
		font-family: var(--font-mono);
		font-size: 1.2rem;
		color: var(--accent);
	}

	.meta {
		margin-top: var(--space-12);
		padding-top: var(--space-6);
		border-top: 1px solid var(--rule);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.meta code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--fg);
	}

	.meta-time {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-dim);
	}
</style>
