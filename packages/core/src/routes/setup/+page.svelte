<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { env } from '$env/dynamic/public';
	import { saveLLAT, isValidHaUrl, looksLikeLLAT, normaliseUrl } from '$lib/ha/auth';
	import { connect } from '$lib/ha/client';

	// Pre-fill from env in dev — env.PUBLIC_HA_URL points at production HA
	let url = $state(env.PUBLIC_HA_URL ?? '');
	let token = $state('');
	let submitting = $state(false);
	let urlError = $state<string | null>(null);
	let tokenError = $state<string | null>(null);
	let submitError = $state<string | null>(null);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		urlError = tokenError = submitError = null;

		if (!isValidHaUrl(url)) {
			urlError = 'That doesn’t look like a valid Home Assistant URL.';
			return;
		}
		if (!looksLikeLLAT(token)) {
			tokenError = 'That doesn’t look like a long-lived access token (expected JWT shape).';
			return;
		}

		submitting = true;
		try {
			saveLLAT(url, token);
			await connect({ mode: 'llat', url: normaliseUrl(url), token });
			await goto(`${base}/`);
		} catch (err) {
			submitError = err instanceof Error ? err.message : String(err);
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>broadsheet · setup</title>
</svelte:head>

<main>
	<header>
		<p class="eyebrow">First-time setup</p>
		<h1><em>broadsheet</em></h1>
		<p class="dek">
			Point me at your Home Assistant. This is the dev setup form — when you
			install the HA add-on instead, this step is automatic.
		</p>
	</header>

	<form onsubmit={handleSubmit}>
		<label class="field">
			<span class="label">Home Assistant URL</span>
			<input
				type="text"
				bind:value={url}
				placeholder="http://192.168.1.11:8123"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				disabled={submitting}
			/>
			<span class="hint">
				LAN address (with port) or `https://` URL. No trailing slash needed.
			</span>
			{#if urlError}<span class="error">{urlError}</span>{/if}
		</label>

		<label class="field">
			<span class="label">Long-lived access token</span>
			<textarea
				bind:value={token}
				placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				disabled={submitting}
				rows="3"
			></textarea>
			<span class="hint">
				Generate at <code>http://&lt;your-ha&gt;/profile/security</code> →
				Long-Lived Access Tokens → Create Token. HA only shows the token once
				— copy it before clicking OK.
			</span>
			{#if tokenError}<span class="error">{tokenError}</span>{/if}
		</label>

		{#if submitError}
			<div class="submit-error">
				<strong>Connection failed.</strong>
				<span>{submitError}</span>
			</div>
		{/if}

		<button type="submit" disabled={submitting}>
			{submitting ? 'Connecting…' : 'Connect'}
		</button>
	</form>

	<aside class="footer">
		<p>
			Your token is stored in this browser&rsquo;s localStorage only. It&rsquo;s
			never sent anywhere except your HA. Forget it any time at
			<code>/settings/about</code>.
		</p>
	</aside>
</main>

<style>
	main {
		max-width: 56ch;
		margin: 0 auto;
		padding: 4rem 2rem;
	}

	.eyebrow {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0 0 0.5rem;
	}

	h1 {
		font-family: 'Instrument Serif', Georgia, serif;
		font-size: clamp(2.5rem, 6vw, 4rem);
		font-weight: 400;
		line-height: 1;
		margin: 0 0 1rem;
		color: var(--accent);
	}

	h1 em {
		font-style: italic;
	}

	.dek {
		color: var(--muted);
		font-size: 1.05rem;
		line-height: 1.5;
		margin: 0 0 2.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		color: var(--fg);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	input,
	textarea {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.6rem 0.8rem;
		color: var(--fg);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.9rem;
		line-height: 1.4;
		transition: border-color 0.15s;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	input:disabled,
	textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	textarea {
		resize: vertical;
		font-size: 0.75rem;
		word-break: break-all;
	}

	.hint {
		font-size: 0.8rem;
		color: var(--muted);
		line-height: 1.4;
	}

	.hint code {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.85em;
		color: var(--fg);
	}

	.error {
		font-size: 0.8rem;
		color: #bf3a30;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	.submit-error {
		padding: 0.75rem 1rem;
		background: rgba(191, 58, 48, 0.1);
		border: 1px solid #bf3a30;
		border-radius: 4px;
		color: #bf3a30;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.submit-error strong {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	button {
		background: var(--accent);
		color: #1a1814;
		border: none;
		padding: 0.7rem 1.5rem;
		border-radius: 4px;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
		align-self: flex-start;
		transition: background 0.15s;
	}

	button:hover:not(:disabled) {
		background: #d4a05c;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.footer {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid var(--rule);
		color: var(--muted);
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.footer code {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.9em;
		color: var(--fg);
	}
</style>
