<script lang="ts">
	/**
	 * TMDB Content settings panel — rendered at
	 * /settings/plugins/tmdb-tv/config when the plugin is enabled.
	 *
	 * Binds `integrations.tmdb.apiKey` + `integrations.tmdb.region`
	 * via useCurationField. The /tv page reads the same curation
	 * fields and hands them to the ContentRows renderer. Each change
	 * persists immediately through the optimistic-write path.
	 */
	import { SettingsRow, useCurationField } from '@broadsheet/core';

	const apiKey = useCurationField<string | null>('integrations.tmdb.apiKey');
	const region = useCurationField<string>('integrations.tmdb.region');

	const DEFAULT_REGION = 'GB';
</script>

<div class="panel">
	<SettingsRow
		label="TMDB API key"
		hint="A free TMDB v4 read access token. Stored in broadsheet.json on your HA host."
	>
		<input
			class="text"
			type="password"
			autocomplete="off"
			placeholder="eyJhbGci…"
			value={apiKey.value ?? ''}
			onchange={(e) => (apiKey.value = e.currentTarget.value.trim() || null)}
		/>
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
		hint="ISO-3166-1 code — drives trending + availability (GB, US, DE, …)."
	>
		<input
			class="text region"
			type="text"
			maxlength="2"
			placeholder="GB"
			value={region.value ?? DEFAULT_REGION}
			onchange={(e) =>
				(region.value = e.currentTarget.value.trim().toUpperCase() || DEFAULT_REGION)}
		/>
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

	/* the API key field wants room; the region field is tiny */
	.text:not(.region) {
		width: min(22rem, 60vw);
	}

	.text.region {
		width: 4.5rem;
		text-transform: uppercase;
		text-align: center;
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
</style>
