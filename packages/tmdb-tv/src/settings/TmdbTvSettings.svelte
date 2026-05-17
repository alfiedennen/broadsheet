<script lang="ts">
	/**
	 * TMDB Content settings panel — rendered at
	 * /settings/plugins/tmdb-tv/config when the plugin is enabled.
	 *
	 * Binds `integrations.tmdb.apiKey` + `integrations.tmdb.region`
	 * via useCurationField. The /tv page reads the same curation
	 * fields and hands them to the ContentRows renderer. Each change
	 * persists immediately through the optimistic-write path.
	 *
	 * V3 manual dogfood (BUG B-4): the input previously used type="password"
	 * which masks the value — a user pasted a TMDB read-access JWT but the
	 * stored value was missing the leading "e" character. With the value
	 * masked they had no way to see the truncation; downstream TMDB calls
	 * returned 401. Switching to type="text" + light validation makes paste
	 * errors visible at the moment of saving. The TMDB key isn't a true
	 * secret (read-only, per-user, behind HA auth) so leaving it visible
	 * matches the threat model better.
	 */
	import { SettingsRow, useCurationField } from '@broadsheet/core';
	import {
		providersForRegion,
		TMDB_REGIONS,
		type ProviderCatalogueEntry
	} from '../lib/tmdb';

	// Sort regions alphabetically by name; GB pinned to the top because
	// it's the addon's primary author region + a sane default. Stable
	// shape — computed once, not reactively.
	const regionOptions = [...TMDB_REGIONS].sort((a, b) => {
		if (a.code === 'GB') return -1;
		if (b.code === 'GB') return 1;
		return a.name.localeCompare(b.name);
	});

	const apiKey = useCurationField<string | null>('integrations.tmdb.apiKey');
	const region = useCurationField<string>('integrations.tmdb.region');

	// Theme E depth knobs
	const providers = useCurationField<number[]>('integrations.tmdb.providers');
	// 0.7 multi-select upgrade: trendingWindows + newReleasesWindowDays
	// are now arrays. Curation may store legacy scalars from 0.6; the
	// derived sets below normalise both shapes.
	const trendingWindows = useCurationField<('day' | 'week')[] | 'day' | 'week'>(
		'integrations.tmdb.trendingWindows'
	);
	const newReleasesWindowDays = useCurationField<number[] | number>(
		'integrations.tmdb.newReleasesWindowDays'
	);

	const DEFAULT_REGION = 'GB';

	const currentRegion = $derived(region.value ?? DEFAULT_REGION);
	const availableProviders = $derived(providersForRegion(currentRegion));
	const selectedProviderIds = $derived(new Set(providers.value ?? []));

	function toggleProvider(entry: ProviderCatalogueEntry) {
		const next = new Set(selectedProviderIds);
		if (next.has(entry.id)) next.delete(entry.id);
		else next.add(entry.id);
		providers.value = [...next];
	}

	// Multi-select sets — derived from the (possibly-scalar) curation
	// values. Empty + falsy values fall to defaults so the user can't
	// accidentally end up with "no rows at all" the first time the
	// panel loads.
	const selectedTrendingWindows = $derived.by((): Set<'day' | 'week'> => {
		const v = trendingWindows.value;
		if (Array.isArray(v)) return new Set(v);
		if (v === 'day' || v === 'week') return new Set([v]);
		return new Set<'day' | 'week'>(['week']);
	});

	function toggleTrendingWindow(win: 'day' | 'week') {
		const next = new Set(selectedTrendingWindows);
		if (next.has(win)) next.delete(win);
		else next.add(win);
		trendingWindows.value = [...next];
	}

	const WINDOW_PRESETS: { label: string; days: number }[] = [
		{ label: 'This week', days: 7 },
		{ label: 'This month', days: 30 },
		{ label: '90 days', days: 90 },
		{ label: '6 months', days: 180 },
		{ label: 'This year', days: 365 }
	];

	const selectedWindowDays = $derived.by((): Set<number> => {
		const v = newReleasesWindowDays.value;
		if (Array.isArray(v)) return new Set(v);
		if (typeof v === 'number') return new Set([v]);
		return new Set([45]);
	});

	function toggleWindowDays(days: number) {
		const next = new Set(selectedWindowDays);
		if (next.has(days)) next.delete(days);
		else next.add(days);
		newReleasesWindowDays.value = [...next];
	}

	let saveBlink = $state<'saving' | 'saved' | null>(null);
	let blinkTimer: ReturnType<typeof setTimeout> | null = null;

	function flashSaved() {
		if (blinkTimer) clearTimeout(blinkTimer);
		saveBlink = 'saved';
		blinkTimer = setTimeout(() => {
			saveBlink = null;
		}, 1500);
	}

	// TMDB v4 read-access tokens are JWTs — every valid token starts with
	// "eyJ" (the base64-encoded "{\"" header opening). If the stored value
	// doesn't, the user almost certainly lost a character on paste — surface
	// that clearly rather than letting them discover it via a 401 in /tv.
	const apiKeyValid = $derived(
		!apiKey.value || apiKey.value.startsWith('eyJ')
	);
</script>

<div class="panel">
	<SettingsRow
		label="TMDB API key"
		hint="A free TMDB v4 read access token. Stored in broadsheet.json on your HA host. Shown in plain text — the TMDB key is read-only + behind HA auth, no secret-grade masking needed."
	>
		<div class="key-row">
			<input
				class="text"
				class:invalid={!apiKeyValid}
				type="text"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="eyJhbGci…"
				value={apiKey.value ?? ''}
				onchange={(e) => {
					// Don't .trim() — leading/trailing whitespace is a real
					// paste error the user should see, not silently strip.
					const v = e.currentTarget.value;
					apiKey.value = v || null;
					flashSaved();
				}}
			/>
			{#if saveBlink === 'saved'}
				<span class="save-indicator">Saved ✓</span>
			{/if}
		</div>
		{#if apiKey.value && !apiKeyValid}
			<span class="warn">
				This doesn't look like a TMDB v4 read-access token — should start with
				<code>eyJ</code>. Common cause: a character was dropped on paste. Try
				re-pasting from <code>themoviedb.org</code> → Settings → API → API Read
				Access Token.
			</span>
		{/if}
		<a
			class="get-key"
			href="https://www.themoviedb.org/settings/api"
			target="_blank"
			rel="noopener noreferrer"
		>
			Get a key from themoviedb.org →
		</a>
	</SettingsRow>

	<SettingsRow
		label="Region"
		hint="Drives trending + watch-provider availability. Switching region re-issues TMDB queries on next /tv visit + reshapes the provider chip list below."
	>
		<select
			class="picker"
			value={region.value ?? DEFAULT_REGION}
			onchange={(e) => (region.value = (e.currentTarget as HTMLSelectElement).value)}
		>
			{#each regionOptions as opt (opt.code)}
				<option value={opt.code}>{opt.name} ({opt.code})</option>
			{/each}
		</select>
	</SettingsRow>

	<!-- Theme E — depth knobs: providers + trending window + new-releases window. -->
	<SettingsRow
		label="Streaming services"
		hint={`Filter trending + new to only items available on the providers you ticked. Unticked = no filter (everything available in ${currentRegion}). Region-aware: GB / US-specific entries appear when you change Region.`}
	>
		<div class="provider-grid">
			{#each availableProviders as p (p.id)}
				<button
					type="button"
					class="provider-chip"
					class:on={selectedProviderIds.has(p.id)}
					onclick={() => toggleProvider(p)}
				>
					{p.name}
				</button>
			{/each}
		</div>
		{#if selectedProviderIds.size > 0}
			<button
				type="button"
				class="clear-providers"
				onclick={() => (providers.value = [])}
			>
				Clear ({selectedProviderIds.size} selected)
			</button>
		{/if}
	</SettingsRow>

	<SettingsRow
		label="Trending rows"
		hint="TMDB exposes two trending lenses — last 24 hours and last 7 days. Tick one or both; one PosterRow renders per ticked option. Untick both to drop trending from /tv entirely."
	>
		<div class="provider-grid">
			<button
				type="button"
				class="provider-chip"
				class:on={selectedTrendingWindows.has('day')}
				onclick={() => toggleTrendingWindow('day')}
			>
				Today
			</button>
			<button
				type="button"
				class="provider-chip"
				class:on={selectedTrendingWindows.has('week')}
				onclick={() => toggleTrendingWindow('week')}
			>
				This week
			</button>
		</div>
	</SettingsRow>

	<SettingsRow
		label="New rows"
		hint="One PosterRow per window ticked. Shorter windows are sharper; longer cover more catalogue. Tick several to get parallel sliding lenses (e.g. 'New this week' AND 'New this month' as two rows). Default: [45 days]."
	>
		<div class="provider-grid">
			{#each WINDOW_PRESETS as preset (preset.days)}
				<button
					type="button"
					class="provider-chip"
					class:on={selectedWindowDays.has(preset.days)}
					onclick={() => toggleWindowDays(preset.days)}
				>
					{preset.label}
				</button>
			{/each}
		</div>
		{#if selectedWindowDays.size === 0 && selectedTrendingWindows.size === 0}
			<span class="empty-warn">
				No rows enabled — /tv will show a "no rows" placeholder. Tick at
				least one above.
			</span>
		{/if}
	</SettingsRow>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
	}

	.text {
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.text:focus {
		outline: none;
		border-color: var(--accent);
	}

	.text.invalid {
		border-color: #bf3a30;
	}

	.key-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.save-indicator {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--state-positive, #6b8e5a);
		letter-spacing: 0.04em;
	}

	.warn {
		display: block;
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: #bf3a30;
		background: rgba(191, 58, 48, 0.08);
		border-left: 2px solid #bf3a30;
		border-radius: 0 var(--radius-card) var(--radius-card) 0;
		line-height: 1.5;
	}

	.warn code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--fg);
	}

	/* API key wants room. */
	.text {
		width: min(22rem, 60vw);
	}

	/* Region dropdown picker — matches Voice settings + HaroldPreset
	 * conventions: same height + padding + accent border on focus. */
	.picker {
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-width: 14rem;
	}

	.picker:focus {
		outline: none;
		border-color: var(--accent);
	}

	.get-key {
		display: inline-block;
		margin-top: var(--space-2);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		transition: border-color var(--ease-quick);
	}

	.get-key:hover {
		border-bottom-color: var(--accent);
	}

	/* Theme E depth-knob controls */
	.provider-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		max-width: 32rem;
	}

	.provider-chip {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		background: transparent;
		color: var(--fg-muted);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition: color var(--ease-quick), border-color var(--ease-quick),
			background var(--ease-quick);
	}

	.provider-chip:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.provider-chip.on {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}

	.clear-providers {
		display: inline-block;
		margin-top: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		background: transparent;
		color: var(--fg-muted);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.clear-providers:hover {
		color: var(--accent);
		border-color: var(--accent);
		border-style: solid;
	}

	/* 0.7: empty-rows warning when both row arrays are empty. */
	.empty-warn {
		display: block;
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--state-alert, #bf3a30);
		background: rgba(191, 58, 48, 0.06);
		border-left: 2px solid var(--state-alert, #bf3a30);
		border-radius: 0 var(--radius-card) var(--radius-card) 0;
	}
</style>
