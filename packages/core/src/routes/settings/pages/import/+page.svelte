<script lang="ts">
	/**
	 * /settings/pages/import — Lovelace dashboard importer.
	 *
	 * Three-step flow:
	 *   1. Pick a Lovelace dashboard from the user's HA install
	 *   2. Pick a view (Lovelace tab) within that dashboard — each
	 *      view becomes one broadsheet custom page
	 *   3. Review the coverage report (per-card translation results),
	 *      tweak the slug + label, commit
	 *
	 * Coverage classification:
	 *   - clean      — translated 1:1
	 *   - partial    — translated but lost something (e.g. Jinja
	 *                  template fell through as text)
	 *   - unsupported — no translator for this card type; skipped
	 *
	 * On commit, the translated blocks land in curation.customPages
	 * + the user is redirected to the editor for further hand-tuning.
	 */

	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		listLovelaceDashboards,
		getLovelaceConfig,
		type LovelaceDashboardEntry,
		type LovelaceConfig
	} from '$lib/lovelace/reader';
	import {
		translateDashboard,
		translateDashboardAsTabs,
		slugifyForBroadsheet,
		type TranslatedDashboard,
		type TranslatedView
	} from '$lib/lovelace/translate';
	import {
		curationStore,
		createCustomPage
	} from '$lib/curation/store.svelte';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import { RESERVED_ROUTE_SLUGS } from '$lib/plugins';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import RenderedPage from '$lib/blocks/RenderedPage.svelte';

	type Step = 'pick-dashboard' | 'pick-view' | 'review';

	let step = $state<Step>('pick-dashboard');
	let loadingDashboards = $state(true);
	let dashboards = $state<LovelaceDashboardEntry[]>([]);
	let pickedDashboard = $state<LovelaceDashboardEntry | null>(null);

	let loadingConfig = $state(false);
	// `translated` holds the per-view translation (legacy single-view path).
	let translated = $state<TranslatedDashboard | null>(null);
	// 0.9.4.1 — when the user picks a multi-view dashboard the default
	// landing path is "Import all views as tabbed page". We translate
	// both ways at load time (cheap) so the user can flip between them
	// freely in the pick-view step.
	let translatedAsTabs = $state<TranslatedDashboard | null>(null);
	let pickedViewIdx = $state<number | null>(null);
	// 0.9.4.1 — true when the user is committing to a tabbed-page
	// import (the default for multi-view dashboards). False = single
	// view import (the legacy behaviour).
	let tabbedMode = $state(false);

	// Editable destination meta
	let destLabel = $state('');
	let destSlug = $state('');
	let slugEdited = $state(false);
	let submitting = $state(false);
	// 0.9.4: post-import canvas review escape hatch #1 — when checked,
	// the page is created with draft: false immediately and the user
	// lands in the regular editor (legacy behaviour). When unchecked
	// (the default since 0.9.4), the page is created as a draft and
	// the user can review + commit (or discard) in the things-first
	// canvas. The plan called this "Skip review, save directly".
	let skipReview = $state(false);

	onMount(async () => {
		dashboards = await listLovelaceDashboards();
		loadingDashboards = false;
	});

	let configError = $state<string | null>(null);

	async function pickDashboard(d: LovelaceDashboardEntry) {
		pickedDashboard = d;
		step = 'pick-view';
		loadingConfig = true;
		configError = null;
		translated = null;
		translatedAsTabs = null;
		tabbedMode = false;
		try {
			const cfg = await getLovelaceConfig(d.url_path);
			if (!cfg) {
				configError =
					d.url_path === null
						? 'HA returned no config for the default Overview. This usually means Overview is auto-generated and has never been saved as a customised dashboard — try one of your other dashboards instead.'
						: 'HA returned no config for this dashboard. It may be in a mode broadsheet can\'t read (e.g. an external lovelace integration), or the WS call timed out.';
				showToast('Could not load dashboard', 'error');
				return;
			}
			translated = translateDashboard(cfg);
			// 0.9.4.1 — also translate as tabs. Cheap (re-runs the
			// per-view translator) and the user gets both options on
			// the pick-view step. Multi-view dashboards default to the
			// tabbed path; single-view ones default to the legacy
			// single-page path (no point wrapping one view in tabs).
			translatedAsTabs = translateDashboardAsTabs(cfg, d.url_path);
			if (translated.views.length > 1) {
				tabbedMode = true;
			}
		} finally {
			loadingConfig = false;
		}
	}

	/** 0.9.4.1 — commit the whole dashboard as one tabbed broadsheet page. */
	function pickTabbed() {
		tabbedMode = true;
		pickedViewIdx = null;
		const dashTitle = (translated?.title ?? translatedAsTabs?.title) || 'Imported dashboard';
		destLabel = dashTitle;
		destSlug = slugifyForBroadsheet(
			pickedDashboard?.url_path || slugifyForBroadsheet(dashTitle)
		);
		slugEdited = false;
		step = 'review';
	}

	function pickView(idx: number) {
		tabbedMode = false;
		pickedViewIdx = idx;
		const view = translated?.views[idx];
		if (view) {
			destLabel = view.title ?? `Imported view ${idx + 1}`;
			destSlug = view.path
				? slugifyForBroadsheet(view.path)
				: slugifyForBroadsheet(destLabel);
			slugEdited = false;
		}
		step = 'review';
	}

	function back() {
		if (step === 'review') {
			step = 'pick-view';
			pickedViewIdx = null;
		} else if (step === 'pick-view') {
			step = 'pick-dashboard';
			pickedDashboard = null;
			translated = null;
			configError = null;
		}
	}

	$effect(() => {
		if (!slugEdited && step === 'review') destSlug = slugifyForBroadsheet(destLabel);
	});

	/**
	 * The view about to be committed.
	 *  - tabbedMode: the aggregated "all views as tabs" view
	 *    (single block, the tabs primitive).
	 *  - otherwise: the user's picked single view from the per-view
	 *    translation.
	 */
	const pickedView = $derived(
		tabbedMode
			? (translatedAsTabs?.views[0] ?? null)
			: pickedViewIdx !== null && translated
				? translated.views[pickedViewIdx]
				: null
	);

	function slugError(): string | null {
		const s = destSlug.trim();
		if (!s) return 'Slug required';
		if (!/^[a-z0-9-]+$/.test(s)) return 'Lowercase letters / digits / hyphens only';
		if (RESERVED_ROUTE_SLUGS.includes(s)) return `"${s}" is a core route`;
		if (pluginLoader.activePluginPages.some((p) => p.slug === s))
			return `"${s}" is used by an active plugin`;
		const existing = curationStore.current.customPages ?? [];
		if (existing.some((p) => p.slug === s)) return `"${s}" already exists`;
		return null;
	}

	const slugErr = $derived(step === 'review' ? slugError() : null);

	async function commitImport() {
		if (!pickedView) return;
		const err = slugError();
		if (err) {
			showToast(err, 'error');
			return;
		}
		if (!destLabel.trim()) {
			showToast('Label required', 'error');
			return;
		}
		submitting = true;
		try {
			const ok = await createCustomPage({
				slug: destSlug,
				label: destLabel.trim(),
				navOrder: 100 + (curationStore.current.customPages?.length ?? 0),
				pageWidth: 'default',
				blocks: pickedView.blocks,
				// 0.9.4: imported pages default to the things-first editor
				// so the post-import review surface is the same editor
				// the user uses for hand-authored pages. Skipping review
				// lands them in the regular editor; otherwise the page is
				// flagged `draft: true` and hidden from nav until they
				// commit.
				editorMode: 'things-first',
				draft: !skipReview,
				hiddenFromNav: !skipReview
			});
			if (ok) {
				showToast(
					skipReview
						? `Imported "${destLabel.trim()}"`
						: `Imported "${destLabel.trim()}" as draft — review + commit`,
					'success'
				);
				goto(`${base}/settings/pages/${destSlug}/`);
			} else {
				showToast('Save failed', 'error');
			}
		} finally {
			submitting = false;
		}
	}

	function viewSummary(v: TranslatedView): string {
		const c = v.reports.filter((r) => r.coverage === 'clean').length;
		const p = v.reports.filter((r) => r.coverage === 'partial').length;
		const pl = v.reports.filter((r) => r.coverage === 'partial-layout').length;
		const u = v.reports.filter((r) => r.coverage === 'unsupported').length;
		const parts = [
			`${v.blocks.length} block${v.blocks.length === 1 ? '' : 's'}`,
			`${c} clean`,
			...(p > 0 ? [`${p} partial`] : []),
			// 0.9.4: surface layout-only fidelity loss distinct from data loss
			...(pl > 0 ? [`${pl} layout-approx`] : []),
			...(u > 0 ? [`${u} skipped`] : [])
		];
		return parts.join(' · ');
	}
</script>

<svelte:head>
	<title>Import from Lovelace · Settings · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · Pages · Import" />
		{/snippet}
		{#snippet headline()}
			Import from Lovelace.
		{/snippet}
		{#snippet dek()}
			Pick one of your existing HA dashboards, pick a view (tab),
			review which cards translated cleanly + which need hand-editing,
			then commit. The imported page lands in the editor for further
			tuning.
		{/snippet}
	</Hero>

	<nav class="crumbs" aria-label="Steps">
		<span class:active={step === 'pick-dashboard'}>1 · Pick dashboard</span>
		<span class="sep" aria-hidden="true">›</span>
		<span class:active={step === 'pick-view'}>2 · Pick view</span>
		<span class="sep" aria-hidden="true">›</span>
		<span class:active={step === 'review'}>3 · Review + commit</span>
	</nav>

	{#if step === 'pick-dashboard'}
		<OutLine label="Your Lovelace dashboards" />
		{#if loadingDashboards}
			<p class="loading">Reading dashboards from HA…</p>
		{:else if dashboards.length === 0}
			<p class="empty">
				No Lovelace dashboards found. (You should at least see one default
				dashboard — if not, the WS API may not be available.)
			</p>
		{:else}
			<ul class="dash-list">
				{#each dashboards as d, i (d.id ? `${d.id}-${i}` : i)}
					<li>
						<button class="dash-row" type="button" onclick={() => pickDashboard(d)}>
							<div class="dash-meta">
								<span class="dash-title">{d.title}</span>
								<span class="dash-url">
									{d.url_path ? `/${d.url_path}` : 'default'}
									<span class="sep" aria-hidden="true">·</span>
									<span>{d.mode ?? 'storage'}</span>
								</span>
							</div>
							<span class="dash-arrow" aria-hidden="true">›</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if step === 'pick-view'}
		<div class="back-row">
			<button class="mini" type="button" onclick={back}>← Back</button>
			<span class="back-context">From <strong>{pickedDashboard?.title}</strong></span>
		</div>
		{#if loadingConfig}
			<p class="loading">Translating Lovelace cards…</p>
		{:else if configError}
			<p class="empty">{configError}</p>
			<div class="actions">
				<button
					class="action confirm"
					type="button"
					onclick={() => pickedDashboard && pickDashboard(pickedDashboard)}
				>
					Retry
				</button>
				<button class="action" type="button" onclick={back}>← Pick another dashboard</button>
			</div>
		{:else if translated && translated.views.length === 0}
			<p class="empty">This dashboard has no views. Nothing to import.</p>
		{:else if translated}
			{#if translated.views.length > 1}
				<!--
					0.9.4.1 — multi-view dashboards default to "import as
					tabbed page". This tile is the recommended path; the
					per-view list below is the override.
				-->
				<div class="tabbed-recommend">
					<button class="tabbed-row" type="button" onclick={pickTabbed}>
						<div class="tabbed-meta">
							<span class="tabbed-title">
								Import all {translated.views.length} views as one tabbed page
							</span>
							<span class="tabbed-summary">
								One broadsheet page · {translated.views.length} tabs · chip-bar
								nav at the top · matches your wall-tablet's mental model
							</span>
							<span class="tabbed-tabs">
								Tabs: {translated.views
									.map((v) => v.title ?? '(untitled)')
									.join(' · ')}
							</span>
						</div>
						<span class="dash-arrow" aria-hidden="true">›</span>
					</button>
					<p class="tabbed-hint">
						<em>Or</em> pick a single view below to import on its own.
					</p>
				</div>
				<OutLine label="Or import a single view" />
			{:else}
				<OutLine label="Pick a view to import" />
			{/if}
			<p class="totals">
				Across all views:
				<strong>{translated.totals.clean}</strong> clean,
				<strong>{translated.totals.partial}</strong> partial,
				<strong>{translated.totals.unsupported}</strong> skipped
				({translated.totals.total} total cards).
			</p>
			<ul class="view-list">
				{#each translated.views as v, i (i)}
					<li>
						<button class="view-row" type="button" onclick={() => pickView(i)}>
							<div class="view-meta">
								<span class="view-title">
									{v.title ?? `View ${i + 1}`}
								</span>
								<span class="view-summary">{viewSummary(v)}</span>
							</div>
							<span class="dash-arrow" aria-hidden="true">›</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if step === 'review' && pickedView}
		<div class="back-row">
			<button class="mini" type="button" onclick={back}>← Back</button>
			<span class="back-context">
				From <strong>{pickedDashboard?.title}</strong>
				{#if tabbedMode}
					· all
					<strong>{translated?.views.length ?? '?'} views</strong> as
					tabs
				{:else}
					· view <strong>{pickedView.title ?? 'untitled'}</strong>
				{/if}
			</span>
		</div>

		<OutLine label="Destination" />
		<div class="dest-grid">
			<label class="field">
				<span class="field-label">Label</span>
				<input
					type="text"
					class="field-input"
					bind:value={destLabel}
				/>
			</label>
			<label class="field">
				<span class="field-label">Slug</span>
				<input
					type="text"
					class="field-input mono"
					bind:value={destSlug}
					oninput={() => (slugEdited = true)}
				/>
				{#if slugErr}
					<span class="field-error">{slugErr}</span>
				{:else}
					<span class="field-hint">URL: <code>/{destSlug}/</code></span>
				{/if}
			</label>
		</div>

		<OutLine label="Coverage report" />
		<ul class="coverage-list">
			{#each pickedView.reports as r, i (i)}
				<li class="coverage-row" data-coverage={r.coverage}>
					<span class="cov-badge">{r.coverage}</span>
					<code class="cov-type">{r.type}</code>
					{#if r.note}
						<span class="cov-note">{r.note}</span>
					{/if}
				</li>
			{/each}
		</ul>

		<OutLine label="Preview" />
		<div class="preview-frame">
			{#if pickedView.blocks.length === 0}
				<p class="empty">
					Nothing translated to a renderable block. Either every card was
					unsupported, or the view was empty.
				</p>
			{:else}
				<RenderedPage blocks={pickedView.blocks} />
			{/if}
		</div>

		<!-- 0.9.4: post-import draft semantic + skip-review escape hatch. -->
		<label class="skip-review-row">
			<input type="checkbox" bind:checked={skipReview} />
			<span>
				<strong>Skip review</strong> — save directly as a finished
				page. Don't land in the draft canvas for arranging /
				rearranging first.
			</span>
		</label>

		<div class="commit-actions">
			<button
				class="action confirm"
				type="button"
				disabled={submitting || !!slugErr || !destLabel.trim() || pickedView.blocks.length === 0}
				onclick={commitImport}
			>
				{submitting
					? 'Importing…'
					: skipReview
						? 'Import + save'
						: 'Import as draft → review'}
			</button>
			<a class="action" href="{base}/settings/pages/">Cancel</a>
		</div>
	{/if}
</PageShell>

<style>
	.crumbs {
		display: flex;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
		margin-bottom: var(--space-6);
	}

	.crumbs .active {
		color: var(--accent);
	}

	.crumbs .sep {
		color: var(--fg-dim);
	}

	.back-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.back-context {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.back-context strong {
		font-style: normal;
		color: var(--accent);
	}

	.loading,
	.empty {
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
	}

	.totals {
		font-family: var(--font-body);
		color: var(--fg-muted);
		margin: 0 0 var(--space-4);
		font-style: italic;
	}

	.totals strong {
		color: var(--accent);
		font-style: normal;
		font-family: var(--font-mono);
	}

	/* ── Dashboard + view picker rows ──────────────────────────── */
	.dash-list,
	.view-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-6);
		padding: 0;
	}

	.dash-row,
	.view-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		width: 100%;
		transition: border-color var(--ease-quick);
	}

	.dash-row:hover,
	.view-row:hover {
		border-color: var(--accent);
	}

	.dash-meta,
	.view-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.dash-title,
	.view-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		color: var(--accent);
	}

	.dash-url,
	.view-summary {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.dash-arrow {
		font-size: 1.4rem;
		color: var(--fg-dim);
	}

	/* 0.9.4.1 — multi-view default tile (Import as tabbed page). */
	.tabbed-recommend {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-6);
	}
	.tabbed-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4);
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
		text-align: left;
		width: 100%;
		transition: filter var(--ease-quick);
		cursor: pointer;
	}
	.tabbed-row:hover {
		filter: brightness(1.08);
	}
	.tabbed-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.tabbed-title {
		font-family: var(--font-display, var(--font-body));
		font-style: italic;
		font-size: 1.2rem;
		color: var(--accent);
	}
	.tabbed-summary {
		font-family: var(--font-body);
		font-size: 0.85rem;
		color: var(--fg);
		line-height: var(--leading-snug);
	}
	.tabbed-tabs {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.tabbed-hint {
		font-family: var(--font-body);
		font-size: 0.82rem;
		color: var(--fg-muted);
		font-style: italic;
		margin: 0;
	}

	/* ── Destination meta + coverage rows ──────────────────────── */
	.dest-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.field-input {
		font-family: var(--font-body);
		font-size: var(--text-body);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 40px;
	}

	.field-input.mono {
		font-family: var(--font-mono);
	}

	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-hint {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-dim);
	}

	.field-error {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--state-alert);
	}

	.coverage-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0 0 var(--space-6);
		padding: 0;
	}

	.coverage-row {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.coverage-row[data-coverage='clean'] {
		border-color: color-mix(in srgb, var(--state-on, #7aa37a) 50%, var(--rule));
	}

	.coverage-row[data-coverage='partial'] {
		border-color: color-mix(in srgb, var(--accent) 35%, var(--rule));
	}

	/* 0.9.4: layout-fidelity gap (data made it through but the layout
	   was approximated by the masonry heuristic). Visually distinct
	   from partial (data loss) — softer accent border. */
	.coverage-row[data-coverage='partial-layout'] {
		border-color: color-mix(in srgb, var(--accent) 20%, var(--rule));
		border-style: dashed;
	}

	.coverage-row[data-coverage='unsupported'] {
		opacity: 0.7;
	}

	.cov-badge {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.coverage-row[data-coverage='clean'] .cov-badge {
		color: var(--state-on, #7aa37a);
	}

	.coverage-row[data-coverage='partial'] .cov-badge {
		color: var(--accent);
	}

	.coverage-row[data-coverage='partial-layout'] .cov-badge {
		color: color-mix(in srgb, var(--accent) 70%, var(--fg-muted));
	}

	.coverage-row[data-coverage='unsupported'] .cov-badge {
		color: var(--state-alert);
	}

	/* 0.9.4: skip-review escape hatch row */
	.skip-review-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		margin-bottom: var(--space-3);
		background: var(--bg-card);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		cursor: pointer;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}
	.skip-review-row input[type='checkbox'] {
		margin-top: 0.15rem;
	}
	.skip-review-row strong {
		color: var(--fg);
		font-style: normal;
	}

	.cov-type {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.cov-note {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.preview-frame {
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		background: var(--bg);
		overflow: hidden;
		margin-bottom: var(--space-6);
	}

	/* ── Commit actions ────────────────────────────────────────── */
	.commit-actions {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-12);
	}

	.action {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-2) var(--space-4);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.action:hover:not(:disabled) {
		color: var(--accent);
		border-color: var(--accent);
	}

	.action.confirm {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.mini {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg-muted);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 32px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.mini:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
</style>
