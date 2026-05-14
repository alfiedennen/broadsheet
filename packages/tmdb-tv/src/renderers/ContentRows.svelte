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

	let { apiKey = null, region = 'GB' }: { apiKey?: string | null; region?: string } = $props();

	interface RowState {
		items: TmdbItem[];
		loading: boolean;
		error: string | null;
	}
	const fresh = (): RowState => ({ items: [], loading: true, error: null });

	let trending = $state<RowState>(fresh());
	let recent = $state<RowState>(fresh());

	// Fetch whenever the key or region changes. The TMDB client caches
	// in localStorage (1h TTL), so a re-render with the same inputs is
	// effectively free.
	$effect(() => {
		const key = apiKey;
		const reg = region || 'GB';
		if (!key) return;

		const client = createTmdbClient(key, reg);
		let cancelled = false;
		trending = fresh();
		recent = fresh();

		const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

		client
			.trendingThisWeek()
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
			title="Trending this week"
			subtitle="across film + TV"
			items={trending.items}
			loading={trending.loading}
			error={trending.error}
		/>
		<PosterRow
			title="New"
			subtitle="released recently"
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
