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

	const apiKey = useCurationField<string | null>('integrations.tmdb.apiKey');
	const region = useCurationField<string>('integrations.tmdb.region');

	const DEFAULT_REGION = 'GB';

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
