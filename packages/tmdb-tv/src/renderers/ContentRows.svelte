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

	// Theme E — depth knobs flow in as props alongside apiKey + region.
	// All optional with sensible defaults; the /tv page passes them
	// through from curation.integrations.tmdb.*.
	let {
		apiKey = null,
		region = 'GB',
		providers = [],
		trendingWindow = 'week',
		newReleasesWindowDays = 45
	}: {
		apiKey?: string | null;
		region?: string;
		providers?: number[];
		trendingWindow?: 'day' | 'week';
		newReleasesWindowDays?: number;
	} = $props();

	interface RowState {
		items: TmdbItem[];
		loading: boolean;
		error: string | null;
	}
	const fresh = (): RowState => ({ items: [], loading: true, error: null });

	let trending = $state<RowState>(fresh());
	let recent = $state<RowState>(fresh());

	// Fetch whenever the key, region, OR depth knobs change. The TMDB
	// client caches in localStorage (1h TTL) keyed by region+path+query
	// so changing providers / window invalidates only the relevant cache
	// keys, not the whole store.
	$effect(() => {
		const key = apiKey;
		const reg = region || 'GB';
		// Bind reactive deps so $effect re-runs on changes
		const provs = providers;
		const win = trendingWindow;
		const windowDays = newReleasesWindowDays;
		if (!key) return;

		const client = createTmdbClient(key, reg, {
			providers: provs,
			trendingWindow: win,
			newReleasesWindowDays: windowDays
		});
		let cancelled = false;
		trending = fresh();
		recent = fresh();

		const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

		client
			.trending()
			.then((items) => {
				if (!cancelled) trending = { items, loading: false, error: null };
			})
			.catch((e) => {
				if (!cancelled) trending = { items: [], loading: false, error: fail(e) };
			});

		client
			.newReleases()
			.then((items) => {
				if (!cancelled) recent = { items, loading: false, error: null };
			})
			.catch((e) => {
				if (!cancelled) recent = { items: [], loading: false, error: fail(e) };
			});

		return () => {
			cancelled = true;
		};
	});

	// Subtitle reflects the active depth knobs so the user knows what
	// they're looking at. "Trending this week" → "Trending on Netflix +
	// Disney+ this week" when providers are set.
	const providerLabels = $derived(providers.length);
	const trendingSubtitle = $derived(
		(providerLabels > 0 ? `on ${providerLabels} provider${providerLabels === 1 ? '' : 's'} ` : 'across film + TV ') +
			`(${trendingWindow === 'day' ? 'today' : 'this week'})`
	);
	const newSubtitle = $derived(
		`released in the last ${newReleasesWindowDays} day${newReleasesWindowDays === 1 ? '' : 's'}`
	);
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
		<PosterRow
			title={trendingWindow === 'day' ? 'Trending today' : 'Trending this week'}
			subtitle={trendingSubtitle}
			items={trending.items}
			loading={trending.loading}
			error={trending.error}
		/>
		<PosterRow
			title="New"
			subtitle={newSubtitle}
			items={recent.items}
			loading={recent.loading}
			error={recent.error}
		/>
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
</style>
