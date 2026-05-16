<script lang="ts">
	/**
	 * VoiceSettings — the @broadsheet/voice plugin's settings panel.
	 *
	 * Rendered at /settings/plugins/voice/config. Lets the user:
	 *   - See what HA conversation agents + TTS / STT / wake-word
	 *     engines are installed (pulled fresh from HA on mount).
	 *   - Pick which assist_pipeline broadsheet's voice surfaces use.
	 *   - Decide whether HA-native intent matching gets first attempt
	 *     (default true — fast + free).
	 *   - Choose where browser-tab TTS plays (browser tab vs a physical
	 *     speaker).
	 *   - Toggle the push-to-talk pill on `/`.
	 *
	 * Spec: docs/plans/plan-voice-substrate.md (P8-S1).
	 */

	import { onMount } from 'svelte';
	import { SettingsRow, useCurationField, getConnection } from '@broadsheet/core';
	import { pullVoiceDiscovery, pipelineSummary, resolveActivePipeline } from '../lib/discovery';
	import { DEFAULT_VOICE_CONFIG, type VoiceConfig, type VoiceDiscovery } from '../lib/types';

	const activePipelineId = useCurationField<string | null>(
		'plugins.voice.config.activePipelineId'
	);
	const pillOnMoment = useCurationField<boolean>('plugins.voice.config.pillOnMoment');
	const ttsTarget = useCurationField<string>('plugins.voice.config.ttsTarget');
	const haNativeFirst = useCurationField<boolean>('plugins.voice.config.haNativeFirst');

	let discovery = $state<VoiceDiscovery | null>(null);
	let loading = $state(true);
	let pullError = $state<string | null>(null);

	async function refresh() {
		loading = true;
		const conn = getConnection();
		if (!conn) {
			pullError = 'No HA connection — open broadsheet from inside HA';
			loading = false;
			return;
		}
		discovery = await pullVoiceDiscovery(conn);
		pullError = discovery.lastError;
		loading = false;
	}

	const resolvedActive = $derived(
		discovery ? resolveActivePipeline(discovery, activePipelineId.value ?? null) : null
	);

	const summary = $derived(
		discovery && resolvedActive ? pipelineSummary(resolvedActive, discovery) : ''
	);

	const ttsTargetOptions = $derived.by(() => {
		// 'browser' always available. Otherwise: derived from HA's
		// media_player entities — but those live on the core's
		// discovery, not voice's. For v0.1 we accept user typing an
		// entity_id; v0.1.x adds a picker driven by core's media list.
		return ['browser'];
	});

	function asNumberOrEmpty(v: unknown): string {
		if (v === null || v === undefined) return '—';
		if (typeof v === 'number') return String(v);
		return '?';
	}

	onMount(() => {
		// Hydrate defaults if curation hasn't seeded them yet
		if (pillOnMoment.value === undefined || pillOnMoment.value === null) {
			pillOnMoment.value = DEFAULT_VOICE_CONFIG.pillOnMoment;
		}
		if (ttsTarget.value === undefined || ttsTarget.value === null || ttsTarget.value === '') {
			ttsTarget.value = DEFAULT_VOICE_CONFIG.ttsTarget;
		}
		if (haNativeFirst.value === undefined || haNativeFirst.value === null) {
			haNativeFirst.value = DEFAULT_VOICE_CONFIG.haNativeFirst;
		}
		void refresh();
	});
</script>

<div class="panel">
	<section class="intro">
		<p>
			broadsheet's voice substrate discovers your installed HA conversation agents,
			TTS engines, and assist pipelines, then routes utterances HA-native-first
			with your chosen LLM as fall-through.
		</p>
		<p class="hint">
			Voice talks to HA's existing pipeline — same one your Atom Echo
			satellites use. broadsheet doesn't run a parallel stack; it just adds an
			in-browser push-to-talk surface and a transcript pane.
		</p>
	</section>

	{#if loading}
		<p class="loading">Discovering HA's voice config…</p>
	{:else if pullError}
		<p class="error">Couldn't pull voice config from HA: {pullError}</p>
	{:else if discovery}
		<SettingsRow
			label="Active pipeline"
			hint="The assist_pipeline broadsheet uses. Defaults to HA's preferred pipeline."
		>
			<select
				class="picker"
				value={activePipelineId.value ?? ''}
				onchange={(e) =>
					(activePipelineId.value =
						(e.currentTarget as HTMLSelectElement).value || null)}
			>
				<option value="">
					— HA's preferred ({discovery.preferredPipelineId ?? 'none'})
				</option>
				{#each discovery.pipelines as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
			{#if summary}
				<span class="summary-line">{summary}</span>
			{/if}
		</SettingsRow>

		<SettingsRow
			label="HA-native intent first"
			hint="Try HA's built-in intent matcher (sub-200ms, free) before falling through to your LLM agent. Almost always what you want."
		>
			<label class="switch">
				<input
					type="checkbox"
					checked={haNativeFirst.value ?? true}
					onchange={(e) => (haNativeFirst.value = (e.currentTarget as HTMLInputElement).checked)}
				/>
				<span>{haNativeFirst.value ? 'On' : 'Off'}</span>
			</label>
		</SettingsRow>

		<SettingsRow
			label="TTS target"
			hint="Where broadsheet's voice replies play. 'browser' plays in this tab; or type an entity_id like media_player.kitchen_display."
		>
			<input
				class="text"
				type="text"
				value={ttsTarget.value ?? 'browser'}
				placeholder="browser"
				list="tts-targets"
				onchange={(e) =>
					(ttsTarget.value = (e.currentTarget as HTMLInputElement).value.trim() || 'browser')}
			/>
			<datalist id="tts-targets">
				{#each ttsTargetOptions as opt (opt)}
					<option value={opt}></option>
				{/each}
			</datalist>
		</SettingsRow>

		<SettingsRow
			label="Push-to-talk on /"
			hint="Whether the moment view shows the mic pill bottom-right. /voice is always reachable from the kebab nav."
		>
			<label class="switch">
				<input
					type="checkbox"
					checked={pillOnMoment.value ?? true}
					onchange={(e) => (pillOnMoment.value = (e.currentTarget as HTMLInputElement).checked)}
				/>
				<span>{pillOnMoment.value ? 'Visible' : 'Hidden'}</span>
			</label>
		</SettingsRow>

		<section class="discovery-strip">
			<h3>HA installed</h3>
			<dl>
				<dt>Pipelines</dt>
				<dd>{discovery.pipelines.length}</dd>
				<dt>Conversation agents</dt>
				<dd>{discovery.agents.length}</dd>
				<dt>TTS engines</dt>
				<dd>{discovery.tts.length}</dd>
				<dt>STT engines</dt>
				<dd>{discovery.stt.length}</dd>
				<dt>Wake-word providers</dt>
				<dd>{asNumberOrEmpty(discovery.wakeWords.length)}</dd>
			</dl>
		</section>
	{/if}
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

	.intro .hint {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.loading,
	.error {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		padding: var(--space-3);
		color: var(--fg-muted);
	}

	.error {
		color: var(--state-alert, #bf3a30);
	}

	.picker,
	.text {
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		width: min(28rem, 70vw);
	}

	.picker:focus,
	.text:focus {
		outline: none;
		border-color: var(--accent);
	}

	.summary-line {
		display: block;
		margin-top: var(--space-2);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--fg-muted);
	}

	.switch {
		display: inline-flex;
		gap: var(--space-2);
		align-items: center;
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
	}

	.discovery-strip {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
	}

	.discovery-strip h3 {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 var(--space-2);
	}

	.discovery-strip dl {
		display: grid;
		grid-template-columns: max-content max-content;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
	}

	.discovery-strip dt {
		color: var(--fg-muted);
	}

	.discovery-strip dd {
		margin: 0;
		color: var(--fg);
		font-feature-settings: 'tnum';
	}
</style>
