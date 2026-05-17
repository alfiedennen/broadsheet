<script lang="ts">
	/**
	 * ContentRows — tmdb-tv's renderer. Core's `/tv` page slots it in
	 * via `useRenderer('tmdb-content-rows')`, passing the API key +
	 * region from curation.
	 *
	 * A pure component: props in, render out. It fetches its own data
	 * from TMDB based on the props (that's the renderer's job — not a
	 * forbidden "side effect"; the contract's no-side-effects rule is
	 * about mutating shared state / reaching into discovery, neither
	 * of which this does).
	 *
	 * Three states:
	 *  - no `apiKey`        → a "configure it" CTA
	 *  - key, loading       → skeleton rows
	 *  - key, loaded        → "Trending this week" + "New" rows
	 */
	import { createTmdbClient, type TmdbItem } from '../lib/tmdb';
	import PosterRow from '../components/PosterRow.svelte';

	// 0.7 multi-row upgrade: trending + new-releases now accept arrays
	// of windows. We render one PosterRow per active window. Legacy
	// scalar curation values are normalised to single-element arrays
	// at the binding site so existing installs still read cleanly.
	let {
		apiKey = null,
		region = 'GB',
		providers = [],
		trendingWindows = ['week'],
		newReleasesWindowDays = [45]
	}: {
		apiKey?: string | null;
		region?: string;
		providers?: number[];
		trendingWindows?: ('day' | 'week')[];
		newReleasesWindowDays?: number[];
	} = $props();

	interface RowState {
		items: TmdbItem[];
		loading: boolean;
		error: string | null;
	}
	const fresh = (): RowState => ({ items: [], loading: true, error: null });

	// Row state keyed by window. Trending rows keyed by 'day' / 'week';
	// new-releases rows keyed by the day count. Reactive Maps would
	// be cleaner but Svelte 5 $state(Map) has spotty reactivity vs
	// plain Records, so use Records.
	let trendingByWindow = $state<Record<string, RowState>>({});
	let newByWindow = $state<Record<string, RowState>>({});

	// Fetch a fresh round whenever inputs change. We re-issue ALL queries
	// when ANY input changes; the TMDB client's 1h localStorage cache
	// makes unchanged-input refetches effectively free.
	$effect(() => {
		const key = apiKey;
		const reg = region || 'GB';
		const provs = providers;
		const tWins = trendingWindows;
		const nWins = newReleasesWindowDays;
		if (!key) return;

		let cancelled = false;
		trendingByWindow = {};
		newByWindow = {};
		for (const w of tWins) trendingByWindow[w] = fresh();
		for (const d of nWins) newByWindow[String(d)] = fresh();

		const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

		for (const w of tWins) {
			const client = createTmdbClient(key, reg, {
				providers: provs,
				trendingWindow: w,
				newReleasesWindowDays: 45 // unused for trending() calls
			});
			client
				.trending()
				.then((items) => {
					if (!cancelled)
						trendingByWindow = {
							...trendingByWindow,
							[w]: { items, loading: false, error: null }
						};
				})
				.catch((e) => {
					if (!cancelled)
						trendingByWindow = {
							...trendingByWindow,
							[w]: { items: [], loading: false, error: fail(e) }
						};
				});
		}

		for (const d of nWins) {
			const client = createTmdbClient(key, reg, {
				providers: provs,
				newReleasesWindowDays: d
			});
			client
				.newReleases(d)
				.then((items) => {
					if (!cancelled)
						newByWindow = {
							...newByWindow,
							[String(d)]: { items, loading: false, error: null }
						};
				})
				.catch((e) => {
					if (!cancelled)
						newByWindow = {
							...newByWindow,
							[String(d)]: { items: [], loading: false, error: fail(e) }
						};
				});
		}

		return () => {
			cancelled = true;
		};
	});

	// Subtitle helpers — bind to active providers + the specific
	// window the row represents.
	const providerCount = $derived(providers.length);
	function trendingSubtitle(win: 'day' | 'week'): string {
		const provLead =
			providerCount > 0
				? `on ${providerCount} provider${providerCount === 1 ? '' : 's'} `
				: 'across film + TV ';
		return provLead + (win === 'day' ? '(today)' : '(this week)');
	}
	function trendingTitle(win: 'day' | 'week'): string {
		return win === 'day' ? 'Trending today' : 'Trending this week';
	}
	function newSubtitle(days: number): string {
		if (days === 7) return 'released this week';
		if (days === 30) return 'released this month';
		if (days === 365) return 'released this year';
		return `released in the last ${days} day${days === 1 ? '' : 's'}`;
	}
	function newTitle(days: number, count: number): string {
		// Disambiguate when there's more than one New row, otherwise
		// just "New" reads cleanly.
		if (count <= 1) return 'New';
		if (days === 7) return 'New this week';
		if (days === 30) return 'New this month';
		if (days === 90) return 'New (90 days)';
		if (days === 180) return 'New (6 months)';
		if (days === 365) return 'New this year';
		return `New (last ${days} days)`;
	}
</script>

{#if !apiKey}
	<div class="no-key">
		<p class="no-key-title">Add a TMDB key to see what's on.</p>
		<p class="no-key-dek">
			tmdb-tv pulls <em>Trending</em> and <em>New</em> from TMDB's free API. Paste a v4 read
			access token in <strong>Settings → Plugins → TMDB Content → Configure</strong>.
		</p>
	</div>
{:else}
	<div class="rows">
		{#each trendingWindows as win (win)}
			{@const state = trendingByWindow[win] ?? { items: [], loading: true, error: null }}
			<PosterRow
				title={trendingTitle(win)}
				subtitle={trendingSubtitle(win)}
				items={state.items}
				loading={state.loading}
				error={state.error}
			/>
		{/each}
		{#each newReleasesWindowDays as days (days)}
			{@const state = newByWindow[String(days)] ?? { items: [], loading: true, error: null }}
			<PosterRow
				title={newTitle(days, newReleasesWindowDays.length)}
				subtitle={newSubtitle(days)}
				items={state.items}
				loading={state.loading}
				error={state.error}
			/>
		{/each}
		{#if trendingWindows.length === 0 && newReleasesWindowDays.length === 0}
			<p class="no-rows">
				No rows enabled. Pick at least one Trending window or one
				New-releases window in <em>Settings → Plugins → TMDB Content</em>.
			</p>
		{/if}
	</div>
{/if}

<style>
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.no-key {
		padding: var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.no-key-title {
		margin: 0 0 var(--space-2);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.3rem;
		color: var(--accent);
	}

	.no-key-dek {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
		color: var(--fg-muted);
	}

	.no-key-dek em {
		color: var(--accent);
		font-style: italic;
	}

	.no-key-dek strong {
		color: var(--fg);
		font-weight: 500;
	}

	.no-rows {
		padding: var(--space-4);
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		background: var(--bg-card);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
	}

	.no-rows em {
		color: var(--accent);
		font-style: italic;
	}
</style>
