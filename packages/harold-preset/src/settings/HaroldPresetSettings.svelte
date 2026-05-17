<script lang="ts">
	/**
	 * Harold preset settings panel.
	 *
	 * Surfaces:
	 *   - Anthropic API key (Claude Haiku) — stored in
	 *     curation/plugins/harold-preset/config/anthropicKey
	 *   - ElevenLabs API key — fall back to HA Cloud TTS if blank
	 *   - Memory mode: Off / Local (default) — Turso path documented
	 *     but not selectable in v0.1 (deferred to v0.1.x)
	 *   - Meeting-mode auto-install — POSTs to the addon sidecar to
	 *     drop the HA blueprint into /homeassistant/blueprints/
	 *   - Wake-word download — link to the addon's bundled .tflite +
	 *     ESPHome snippet
	 *
	 * Spec: docs/plans/plan-harold-preset.md.
	 */

	import { onMount } from 'svelte';
	import { SettingsRow, useCurationField } from '@broadsheet/core';
	import { memory, type MemoryMode } from '../lib/memory';

	const anthropicKey = useCurationField<string>(
		'plugins.harold-preset.config.anthropicKey'
	);
	const elevenLabsKey = useCurationField<string>(
		'plugins.harold-preset.config.elevenLabsKey'
	);
	const memoryMode = useCurationField<MemoryMode>(
		'plugins.harold-preset.config.memoryMode'
	);
	const meetingModeInstalled = useCurationField<boolean>(
		'plugins.harold-preset.config.meetingModeInstalled'
	);

	// Theme H plugin-dep deeplink: track whether @broadsheet/voice is
	// enabled. When it isn't, surface the dep as a clickable enable
	// link (hash-flashes the voice row on /settings/plugins) rather than
	// bare descriptive text. When it is, replace the prompt with a quiet
	// "✓ Voice plugin enabled" so the section doesn't keep nagging.
	const voiceEnabled = useCurationField<boolean>('plugins.voice.enabled');

	let memorySize = $state(0);
	let blueprintBusy = $state(false);
	let blueprintMsg = $state('');

	function syncMemoryMode() {
		const mode = memoryMode.value ?? 'local';
		if (memory.currentMode !== mode) memory.setMode(mode);
		memorySize = memory.size;
	}

	async function installBlueprint() {
		blueprintBusy = true;
		blueprintMsg = 'Installing meeting-mode blueprint…';
		try {
			const env = (window as unknown as { __BROADSHEET_ENV__?: { ingressEntry?: string } })
				.__BROADSHEET_ENV__;
			const base = env?.ingressEntry ?? '';
			const r = await fetch(`${base}/api/harold-preset/blueprint/install`, {
				method: 'POST'
			});
			if (r.ok) {
				meetingModeInstalled.value = true;
				blueprintMsg = 'Installed — find it in HA → Settings → Automations & Scenes → Blueprints.';
			} else {
				blueprintMsg = `Install failed (${r.status}). The addon may need updating.`;
			}
		} catch (err) {
			blueprintMsg = err instanceof Error ? err.message : String(err);
		} finally {
			blueprintBusy = false;
		}
	}

	async function uninstallBlueprint() {
		blueprintBusy = true;
		blueprintMsg = 'Removing blueprint…';
		try {
			const env = (window as unknown as { __BROADSHEET_ENV__?: { ingressEntry?: string } })
				.__BROADSHEET_ENV__;
			const base = env?.ingressEntry ?? '';
			const r = await fetch(`${base}/api/harold-preset/blueprint/install`, {
				method: 'DELETE'
			});
			if (r.ok) {
				meetingModeInstalled.value = false;
				blueprintMsg = 'Removed.';
			} else {
				blueprintMsg = `Remove failed (${r.status}).`;
			}
		} catch (err) {
			blueprintMsg = err instanceof Error ? err.message : String(err);
		} finally {
			blueprintBusy = false;
		}
	}

	function clearMemory() {
		memory.clear();
		memorySize = 0;
	}

	function wakewordUrl(): string {
		const env = (window as unknown as { __BROADSHEET_ENV__?: { ingressEntry?: string } })
			.__BROADSHEET_ENV__;
		const base = env?.ingressEntry ?? '';
		return `${base}/api/harold-preset/wakeword/hey_harold.tflite`;
	}

	function esphomeSnippetUrl(): string {
		const env = (window as unknown as { __BROADSHEET_ENV__?: { ingressEntry?: string } })
			.__BROADSHEET_ENV__;
		const base = env?.ingressEntry ?? '';
		return `${base}/api/harold-preset/wakeword/esphome-snippet.yaml`;
	}

	onMount(() => {
		// Seed defaults
		if (memoryMode.value === undefined || memoryMode.value === null) {
			memoryMode.value = 'local';
		}
		syncMemoryMode();
	});

	$effect(() => {
		syncMemoryMode();
	});
</script>

<div class="panel">
	<section class="intro">
		<p>
			<em>Harold.</em> Hitchcock-register voice assistant, with Claude Haiku for
			conversation and ElevenLabs Flash v2.5 for speech. HA-native intent matching
			handles the routine device control (free, sub-200ms); only conversation +
			questions fall through to Claude.
		</p>
		{#if voiceEnabled.value === true}
			<p class="hint dep-ok">
				✓ Paired with <code>@broadsheet/voice</code>.
				<a class="flow-link" href="/settings/setup/add-harold/"
					>Or run the full setup ↗</a
				>
			</p>
		{:else}
			<p class="hint dep-missing">
				Pairs with <a class="dep-link" href="/settings/plugins/#plugin-voice"
					><code>@broadsheet/voice</code> — enable that first ↗</a
				>.
				<a class="flow-link" href="/settings/setup/add-harold/"
					>Or run the full setup ↗</a
				>
			</p>
		{/if}
	</section>

	<SettingsRow
		label="Anthropic API key"
		hint="Claude Haiku conversation. ~£3–6/month for typical use. Stored in broadsheet.json on your HA host."
	>
		<input
			class="text key"
			type="password"
			autocomplete="off"
			placeholder="sk-ant-…"
			value={anthropicKey.value ?? ''}
			onchange={(e) =>
				(anthropicKey.value = (e.currentTarget as HTMLInputElement).value.trim())}
		/>
		<a
			class="get-key"
			href="https://console.anthropic.com/settings/keys"
			target="_blank"
			rel="noopener noreferrer">Get an Anthropic key →</a
		>
	</SettingsRow>

	<SettingsRow
		label="ElevenLabs API key"
		hint="Voice synthesis with Harold's custom voice. Optional — falls back to HA Cloud TTS if blank. 10K chars/month free."
	>
		<input
			class="text key"
			type="password"
			autocomplete="off"
			placeholder="sk-…"
			value={elevenLabsKey.value ?? ''}
			onchange={(e) =>
				(elevenLabsKey.value = (e.currentTarget as HTMLInputElement).value.trim())}
		/>
		<a
			class="get-key"
			href="https://elevenlabs.io/app/settings/api-keys"
			target="_blank"
			rel="noopener noreferrer">Get an ElevenLabs key →</a
		>
	</SettingsRow>

	<SettingsRow
		label="Conversational memory"
		hint="Local: keeps the last ~1000 exchanges in your browser, semantically retrieves the top-5 relevant ones for each new conversation. ~25MB embedding model lazy-downloads on first use. Off: every conversation starts fresh."
	>
		<select
			class="picker"
			value={memoryMode.value ?? 'local'}
			onchange={(e) =>
				(memoryMode.value = (e.currentTarget as HTMLSelectElement).value as MemoryMode)}
		>
			<option value="local">Local SQLite (default)</option>
			<option value="off">Off</option>
		</select>
		<span class="memory-size">{memorySize} stored</span>
		{#if memorySize > 0}
			<button type="button" class="ghost" onclick={clearMemory}>Clear memory</button>
		{/if}
		<p class="memory-hint">
			Turso (cross-device sync) is planned for v0.1.x. Until then, memory is
			per-browser-profile.
		</p>
	</SettingsRow>

	<SettingsRow
		label="Meeting-mode blueprint"
		hint="Installs an HA automation blueprint that silences Harold on the office speaker when meeting-mode is on. Drops into /homeassistant/blueprints/automation/broadsheet/ — restartable + removable from this panel."
	>
		{#if meetingModeInstalled.value === true}
			<span class="installed">✓ Installed</span>
			<button
				type="button"
				class="ghost"
				disabled={blueprintBusy}
				onclick={uninstallBlueprint}>Remove blueprint</button
			>
		{:else}
			<button
				type="button"
				class="action"
				disabled={blueprintBusy}
				onclick={installBlueprint}>Install blueprint</button
			>
		{/if}
		{#if blueprintMsg}
			<p class="blueprint-msg">{blueprintMsg}</p>
		{/if}
	</SettingsRow>

	<SettingsRow
		label="Hey Harold wake-word"
		hint="Custom .tflite model + ESPHome config for Atom Echo / Wyoming satellites. Drop these into your ESPHome project and re-flash."
	>
		<a class="action download" href={wakewordUrl()} download>Download .tflite (60 KB)</a>
		<a class="action download" href={esphomeSnippetUrl()} download>
			Download ESPHome snippet
		</a>
		<p class="wakeword-hint">
			Note: model is trained primarily on a British male voice; results may vary
			for other voices. v0.2 will add a community-trained variant.
		</p>
	</SettingsRow>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.intro {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
		max-width: 60ch;
	}

	.intro p {
		margin: 0 0 var(--space-2);
		line-height: var(--leading-snug);
	}

	.intro em {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
	}

	.intro .hint {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.intro .hint code {
		font-family: var(--font-mono);
		font-style: normal;
		font-size: 0.9em;
		color: var(--accent);
	}

	.dep-ok {
		color: var(--state-positive, #6a8a4d) !important;
	}

	.dep-missing .dep-link {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
		transition: border-bottom-style var(--ease-quick), border-bottom-color var(--ease-quick);
	}

	.dep-missing .dep-link:hover,
	.dep-missing .dep-link:focus {
		border-bottom-style: solid;
		border-bottom-color: var(--accent);
		outline: none;
	}

	/* The "Or run the full setup ↗" link sits beside the dep-status —
	 * deliberately quieter than the dep-link itself, since for already-
	 * paired users it's just an alternative entry. */
	.flow-link {
		display: inline-block;
		margin-left: var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.75em;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		text-decoration: none;
		border-bottom: 1px dashed color-mix(in srgb, var(--fg-muted) 50%, transparent);
		transition: color var(--ease-quick), border-bottom-color var(--ease-quick), border-bottom-style var(--ease-quick);
	}

	.flow-link:hover,
	.flow-link:focus {
		color: var(--accent);
		border-bottom-style: solid;
		border-bottom-color: var(--accent);
		outline: none;
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

	.text.key {
		width: min(22rem, 60vw);
	}

	.picker {
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.action,
	.ghost,
	.download {
		display: inline-block;
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		border-radius: var(--radius-pill);
		text-decoration: none;
		cursor: pointer;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.action {
		background: var(--accent);
		color: var(--bg);
		border: 1px solid var(--accent);
	}

	.action:hover {
		opacity: 0.85;
	}

	.ghost {
		background: transparent;
		border: 1px solid var(--rule);
		color: var(--fg-muted);
	}

	.ghost:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.download {
		background: transparent;
		border: 1px solid var(--accent);
		color: var(--accent);
		margin-right: var(--space-2);
	}

	.get-key {
		display: inline-block;
		margin-top: var(--space-2);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
	}

	.get-key:hover {
		border-bottom-color: var(--accent);
	}

	.installed {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--state-positive, #6a8a4d);
		margin-right: var(--space-2);
	}

	.memory-size {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		margin: 0 var(--space-2);
	}

	.memory-hint,
	.wakeword-hint,
	.blueprint-msg {
		display: block;
		margin-top: var(--space-2);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--fg-muted);
		max-width: 60ch;
	}

	.blueprint-msg {
		color: var(--fg);
	}
</style>
