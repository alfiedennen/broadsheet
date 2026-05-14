<script lang="ts">
	/**
	 * PosterRow — a horizontal scroll of TMDB posters with editorial
	 * chrome. Ported from harold-home, re-tokenised to broadsheet's
	 * design system and made BROWSE-ONLY: harold-home's two-click
	 * pattern existed to confirm a launch-the-app-on-the-TV action;
	 * broadsheet's tmdb-tv v0.1 just browses, so a tap simply toggles
	 * the overview overlay.
	 *
	 * States: loading (skeletons) / error / empty / loaded.
	 */
	import { posterUrl, titleOf, yearOf, type TmdbItem } from '../lib/tmdb';

	let {
		title,
		subtitle,
		items = [],
		loading = false,
		error = null
	}: {
		title: string;
		subtitle?: string;
		items?: TmdbItem[];
		loading?: boolean;
		error?: string | null;
	} = $props();

	// One expanded poster per row at a time; tap toggles its overview.
	let expandedId = $state<number | null>(null);
	function toggle(id: number) {
		expandedId = expandedId === id ? null : id;
	}
</script>

<section class="row">
	<header class="row-head">
		<h2 class="row-title">{title}</h2>
		{#if subtitle}<span class="row-sub">{subtitle}</span>{/if}
	</header>

	{#if loading}
		<div class="scroll" aria-busy="true">
			{#each Array(8) as _, i (i)}
				<div class="poster skeleton" aria-hidden="true"></div>
			{/each}
		</div>
	{:else if error}
		<p class="note"><em>Couldn't fetch — {error}</em></p>
	{:else if items.length === 0}
		<p class="note"><em>Nothing here right now.</em></p>
	{:else}
		<div class="scroll">
			{#each items as item (item.id)}
				{@const expanded = expandedId === item.id}
				{@const src = posterUrl(item.poster_path)}
				<button
					type="button"
					class="poster"
					class:expanded
					onclick={() => toggle(item.id)}
					aria-expanded={expanded}
					aria-label="{titleOf(item)}{yearOf(item) ? ` (${yearOf(item)})` : ''}"
				>
					<div class="art">
						{#if src}
							<img {src} alt="" loading="lazy" />
						{:else}
							<div class="no-art" aria-hidden="true"><span>{titleOf(item)}</span></div>
						{/if}
						{#if expanded}
							<div class="overview">
								<p>{item.overview || 'No description available.'}</p>
							</div>
						{/if}
					</div>
					<span class="meta">
						<span class="meta-title">{titleOf(item)}</span>
						{#if yearOf(item)}<span class="meta-year">{yearOf(item)}</span>{/if}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</section>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.row-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.row-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		font-weight: 400;
		color: var(--accent);
		margin: 0;
		line-height: 1;
	}

	.row-sub {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.note {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
	}

	.scroll {
		display: flex;
		gap: var(--space-3);
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
		scrollbar-color: var(--rule) transparent;
		padding-bottom: var(--space-2);
	}

	.scroll::-webkit-scrollbar {
		height: 6px;
	}
	.scroll::-webkit-scrollbar-thumb {
		background: var(--rule);
		border-radius: 3px;
	}

	.poster {
		flex: 0 0 auto;
		width: 130px;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
		scroll-snap-align: start;
		transition: width var(--ease-normal);
	}

	.poster.expanded {
		width: 260px;
	}

	.art {
		position: relative;
		width: 100%;
		height: 195px;
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		transition: border-color var(--ease-quick), height var(--ease-normal);
	}

	.poster.expanded .art {
		height: 260px;
		border-color: var(--accent);
	}

	@media (hover: hover) {
		.poster:hover .art {
			border-color: var(--accent);
		}
	}

	.art img,
	.no-art,
	.skeleton {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
	}

	.no-art {
		display: grid;
		place-items: center;
		padding: var(--space-3);
		text-align: center;
	}

	.no-art span {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.95rem;
		color: var(--fg-muted);
	}

	.skeleton {
		width: 130px;
		height: 195px;
		border-radius: var(--radius-card);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
	}

	.overview {
		position: absolute;
		inset: 0;
		padding: var(--space-3);
		display: flex;
		align-items: flex-end;
		background: linear-gradient(
			180deg,
			rgba(10, 9, 7, 0.55) 0%,
			rgba(10, 9, 7, 0.92) 65%,
			rgba(10, 9, 7, 0.97) 100%
		);
	}

	.overview p {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
		color: var(--fg);
		display: -webkit-box;
		-webkit-line-clamp: 8;
		line-clamp: 8;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.meta-title {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-year {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-muted);
	}
</style>
