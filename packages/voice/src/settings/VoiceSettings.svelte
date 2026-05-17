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
	import { SettingsRow, useCurationField, getConnection, discovery as coreDiscovery } from '@broadsheet/core';
	import { pullVoiceDiscovery, pipelineSummary, resolveActivePipeline } from '../lib/discovery';
	import { DEFAULT_VOICE_CONFIG, type VoiceConfig, type VoiceDiscovery } from '../lib/types';

	const activePipelineId = useCurationField<string | null>(
		'plugins.voice.config.activePipelineId'
	);
	const pillOnMoment = useCurationField<boolean>('plugins.voice.config.pillOnMoment');
	const ttsTarget = useCurationField<string>('plugins.voice.config.ttsTarget');
	const haNativeFirst = useCurationField<boolean>('plugins.voice.config.haNativeFirst');
	// 0.7 fix #3 — surface-area picker for presence:originator routing.
	const surfaceArea = useCurationField<string | null>('view.surfaceArea');

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

	// V3 manual dogfood (BUG B-5): pull every media_player entity from
	// core's discovery so the TTS target is a real dropdown, not a free-text
	// input the user has to know the entity_id syntax to use. Reactive to
	// discovery — if a new media_player is added in HA it shows up here on
	// the next discovery tick without a panel reload.
	type MediaPlayerOption = { id: string; name: string; area: string | null };

	const mediaPlayerOptions = $derived.by<MediaPlayerOption[]>(() => {
		// Reading coreDiscovery.areas establishes the reactive dep — every
		// discovery refresh produces a fresh areas snapshot via $derived.
		// DomainArea pre-buckets media_player entities into .media (non-TV)
		// and .tvs (TV-class) — pull both since either is a valid TTS sink.
		const out: MediaPlayerOption[] = [];
		for (const area of coreDiscovery.areas) {
			for (const e of [...area.media, ...area.tvs]) {
				out.push({ id: e.id, name: e.name, area: area.name });
			}
		}
		// Alphabetical by display name
		out.sort((a, b) => a.name.localeCompare(b.name));
		return out;
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
			hint="Where broadsheet's voice replies play. 'browser' plays in this tab; pick a media_player to always route there; pick a presence option to route dynamically based on who's where."
		>
			<select
				class="picker"
				value={ttsTarget.value ?? 'browser'}
				onchange={(e) =>
					(ttsTarget.value =
						(e.currentTarget as HTMLSelectElement).value || 'browser')}
			>
				<option value="browser">Browser (this tab)</option>
				<!-- 0.7 fix #3 — presence-based routing options. Dynamic
				     targets resolved at speak time via routeTo(). -->
				{#if coreDiscovery.persons.length > 0}
					<optgroup label="Presence (dynamic)">
						<option value="presence:originator">
							Nearest speaker to whoever's in this room
						</option>
						{#each coreDiscovery.persons as p (p.id)}
							<option value="presence:{p.id}">
								Nearest speaker to {p.name}
							</option>
						{/each}
					</optgroup>
				{/if}
				{#if mediaPlayerOptions.length > 0}
					<optgroup label="HA media players ({mediaPlayerOptions.length})">
						{#each mediaPlayerOptions as opt (opt.id)}
							<option value={opt.id}>
								{opt.name}{opt.area ? ` — ${opt.area}` : ''}
							</option>
						{/each}
					</optgroup>
				{:else}
					<option disabled>(no media_player entities discovered)</option>
				{/if}
			</select>
			{#if ttsTarget.value === 'presence:originator'}
				<span class="summary-line">
					Resolved at speak time from <em>this broadsheet instance's surface area</em>
					(set below). Falls back to browser if no person is in that room.
				</span>
			{:else if ttsTarget.value?.startsWith('presence:')}
				<span class="summary-line">
					Resolved at speak time to whichever speaker is nearest the picked person.
				</span>
			{:else if ttsTarget.value && ttsTarget.value !== 'browser'}
				<span class="summary-line">Playing through <code>{ttsTarget.value}</code></span>
			{/if}
		</SettingsRow>

		<SettingsRow
			label="Surface area"
			hint="Which HA area THIS broadsheet instance lives in (the wall tablet's area, the office desktop's area, the phone's 'wherever I am'). Powers 'presence:originator' routing: voice replies route to whoever's currently in this area. Optional — set per-device by opening broadsheet on that device and picking here."
		>
			<select
				class="picker"
				value={surfaceArea.value ?? ''}
				onchange={(e) =>
					(surfaceArea.value = (e.currentTarget as HTMLSelectElement).value || null)}
			>
				<option value="">(no surface affinity)</option>
				{#each coreDiscovery.areas as a (a.id)}
					<option value={a.id}>{a.name}</option>
				{/each}
			</select>
			{#if surfaceArea.value}
				<span class="summary-line">
					Originator routing will pick whoever's in <code>{surfaceArea.value}</code>.
				</span>
			{/if}
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

	.picker {
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		width: min(28rem, 70vw);
	}

	.picker:focus {
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
