<script lang="ts">
	/**
	 * VoiceSettings — the unified Voice + Harold configurator.
	 *
	 * 0.8.x rewrite: this used to be the voice-substrate-only settings
	 * panel. Harold-preset had its own separate panel at
	 * /settings/plugins/harold-preset/config — same surface, but split
	 * across two URLs, which made the "is my voice setup actually
	 * coherent?" question hard to answer.
	 *
	 * The user's feedback after the 0.8.0 walk: "/voice needs to be a
	 * settings page, so that /voice and harold-preset can be aided with
	 * this sense making. I also think merging voice and harold-preset
	 * might make sense given harold-preset ships with broadsheet, using
	 * the same configurator screen to help users make better workflow
	 * based decisions on what to use/not given their current home setup."
	 *
	 * So this panel now has three sections:
	 *
	 *   1. Explainer — the 6-step pipeline walkthrough that used to
	 *      live on /voice. Live config reflected back ("your TTS is
	 *      ElevenLabs", "presence routing falls back because surface
	 *      area isn't set").
	 *   2. Voice substrate — pipeline picker, HA-native toggle, TTS
	 *      target, surface area, push-to-talk visibility.
	 *   3. Harold (optional) — when @broadsheet/harold-preset is in
	 *      the bundled plugin registry AND enabled, its settings
	 *      panel is lazy-loaded inline so users don't have to bounce
	 *      between screens.
	 *
	 * harold-preset's standalone panel still exists for hash-deeplink
	 * targets from Theme B flow steps (curationField.settingsHref)
	 * but renders a thin redirect → here.
	 */

	import { onMount } from 'svelte';
	import {
		SettingsRow,
		useCurationField,
		getConnection,
		discovery as coreDiscovery,
		pluginLoader,
		type LazyComponent
	} from '@broadsheet/core';
	import { pullVoiceDiscovery, pipelineSummary, resolveActivePipeline } from '../lib/discovery';
	import { DEFAULT_VOICE_CONFIG, type VoiceConfig, type VoiceDiscovery } from '../lib/types';

	const activePipelineId = useCurationField<string | null>(
		'plugins.voice.config.activePipelineId'
	);
	const pillOnMoment = useCurationField<boolean>('plugins.voice.config.pillOnMoment');
	const ttsTarget = useCurationField<string>('plugins.voice.config.ttsTarget');
	const haNativeFirst = useCurationField<boolean>('plugins.voice.config.haNativeFirst');
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

	type MediaPlayerOption = { id: string; name: string; area: string | null };

	const mediaPlayerOptions = $derived.by<MediaPlayerOption[]>(() => {
		const out: MediaPlayerOption[] = [];
		for (const area of coreDiscovery.areas) {
			for (const e of [...area.media, ...area.tvs]) {
				out.push({ id: e.id, name: e.name, area: area.name });
			}
		}
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

	/* ── Explainer-section derived state (live config reflected) ──── */

	const pipeline = $derived(resolvedActive);
	const haNativeOn = $derived(haNativeFirst.value !== false);
	const ttsTargetVal = $derived(ttsTarget.value ?? 'browser');
	const isPresenceOriginator = $derived(ttsTargetVal === 'presence:originator');
	const isPresencePerson = $derived(
		ttsTargetVal.startsWith('presence:') && ttsTargetVal !== 'presence:originator'
	);
	const presencePersonName = $derived.by(() => {
		if (!isPresencePerson) return null;
		const id = ttsTargetVal.slice('presence:'.length);
		const p = coreDiscovery.persons.find((x) => x.id === id);
		return p?.name ?? id;
	});

	const sttName = $derived(
		discovery && pipeline
			? discovery.stt.find((e) => e.id === pipeline.stt_engine)?.name ?? 'no STT'
			: '—'
	);
	const agentName = $derived(
		discovery && pipeline
			? discovery.agents.find((a) => a.id === pipeline.conversation_engine)?.name ??
					'no conversation agent'
			: '—'
	);
	const ttsName = $derived(
		discovery && pipeline
			? discovery.tts.find((e) => e.id === pipeline.tts_engine)?.name ?? 'no TTS'
			: '—'
	);

	const surfaceAreaName = $derived.by(() => {
		const sa = surfaceArea.value;
		if (!sa) return null;
		return coreDiscovery.areas.find((a) => a.id === sa)?.name ?? sa;
	});

	/* ── Harold-preset section (conditional inline-render) ────────── */

	/**
	 * Resolve the harold-preset settings component via the plugin
	 * loader registry. Voice doesn't take a runtime dep on the
	 * harold-preset package — it discovers it through the loader,
	 * then lazy-imports the settings component when the plugin is
	 * active. When harold-preset isn't bundled at all OR is bundled
	 * but disabled, this derives null + the section short-circuits
	 * to a thin CTA pointing at /settings/plugins/.
	 */
	interface HaroldStatus {
		bundled: boolean;
		enabled: boolean;
		settingsThunk: LazyComponent | null;
	}
	const haroldStatus = $derived.by((): HaroldStatus => {
		// Reactive deps — re-run when plugins change OR curation toggles
		// the enabled flag.
		const entry = pluginLoader.registry.find((r) => r.plugin.id === 'harold-preset');
		if (!entry) return { bundled: false, enabled: false, settingsThunk: null };
		// 'active' = bundled + enabled + activation checks pass.
		// 'enabled-inactive' = enabled but something's not ready —
		// still render the panel so the user can configure the
		// missing bit (typically the API key).
		const enabled =
			entry.status === 'active' || entry.status === 'enabled-inactive';
		return {
			bundled: true,
			enabled,
			settingsThunk: enabled ? entry.plugin.settingsPanel?.component ?? null : null
		};
	});
</script>

<div class="panel">
	<!-- ─── Top intro — sense-making for the whole surface ──────── -->
	<section class="intro">
		<p>
			<em>Voice + Harold.</em> One configurator for both the voice substrate
			(STT, TTS, intent routing) and the opinionated Hitchcock-register
			Harold bundle that rides on top of it. The walkthrough below maps
			every spoken request through your live HA pipeline; the controls
			that follow are what you can change.
		</p>
	</section>

	<!-- ─── Explainer — the 6-step pipeline walkthrough ──────────── -->
	<section class="explainer">
		<h2 class="section-heading">The path of a sentence</h2>
		<ol class="flow-steps">
			<li class="flow-step">
				<span class="step-num">1</span>
				<div class="step-body">
					<h3>Wake</h3>
					<p>
						A wake-word detector (on a satellite — Atom Echo, M5Stack,
						ESPHome — or in this browser tab) listens locally for "Hey
						Harold" or whichever phrase you've trained. <em>No audio leaves
						the device until the wake fires.</em>
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">2</span>
				<div class="step-body">
					<h3>Listen <span class="step-aside">— Speech-to-text</span></h3>
					<p>
						<code class="pipeline-bit">{sttName}</code> transcribes the
						audio into text. HA Cloud STT is the typical pick (free with
						Nabu Casa, en-GB-aware); Whisper is the local alternative for
						privacy-first setups.
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">3</span>
				<div class="step-body">
					<h3>Understand <span class="step-aside">— Intent matching</span></h3>
					{#if haNativeOn}
						<p>
							<strong>HA-native intent matching runs first.</strong> A
							fast deterministic matcher built into Home Assistant —
							sub-200ms, free, no LLM call. ~80% of household requests
							("turn off the office lights", "what's the temperature
							upstairs") get handled here, with HA's canned response,
							before Harold ever sees them.
						</p>
					{:else}
						<p class="step-warn">
							<strong>HA-native intent matching is OFF.</strong> Every
							utterance goes straight to the conversation agent — slower
							+ more expensive. Toggle on under <em>HA-native intent
							first</em> below unless you have a specific reason to skip it.
						</p>
					{/if}
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">4</span>
				<div class="step-body">
					<h3>Converse <span class="step-aside">— Fall-through LLM</span></h3>
					<p>
						When HA-native doesn't match, the request falls through to
						<code class="pipeline-bit">{agentName}</code>. This is where
						Claude / GPT / Gemini / a local LLaMA / etc. takes the
						question. Harold-preset (the opinionated section below) wraps
						this with Hitchcock register + conversational memory.
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">5</span>
				<div class="step-body">
					<h3>Reply <span class="step-aside">— Text-to-speech</span></h3>
					<p>
						The agent's reply gets handed to
						<code class="pipeline-bit">{ttsName}</code>. ElevenLabs Flash
						v2.5 is the typical Harold pick (custom Hitchcock-baritone
						voice, sub-second latency). HA Cloud TTS is the free fallback.
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">6</span>
				<div class="step-body">
					<h3>Route <span class="step-aside">— Where it plays</span></h3>
					{#if ttsTargetVal === 'browser'}
						<p>
							Audio plays in <strong>this browser tab</strong>. Simple +
							testable. To send replies through HA media_players or follow
							a person around the house, change <em>TTS target</em> below.
						</p>
					{:else if isPresenceOriginator}
						<p>
							<strong>Presence routing: originator.</strong> The reply
							plays through whichever speaker is nearest to whoever's
							currently in
							<code class="pipeline-bit">{surfaceAreaName ?? '(surface area not set)'}</code>.
						</p>
						{#if !surfaceAreaName}
							<p class="step-warn">
								Surface area isn't configured. Originator routing falls
								back to browser. Set it under <em>Surface area</em> below.
							</p>
						{/if}
					{:else if isPresencePerson && presencePersonName}
						<p>
							<strong>Presence routing: {presencePersonName}.</strong> The
							reply follows {presencePersonName} around the house — moves
							room, next utterance lands in the new room.
						</p>
					{:else}
						<p>
							Reply plays through fixed media_player
							<code class="pipeline-bit">{ttsTargetVal}</code>. Static
							routing; doesn't follow you around. Switch to a presence
							target below to make it dynamic.
						</p>
					{/if}
				</div>
			</li>
		</ol>
	</section>

	<!-- ─── Voice substrate config ──────────────────────────────────── -->
	<section class="config-section">
		<h2 class="section-heading">Voice substrate</h2>

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
						Resolved at speak time from <em>this broadsheet instance's
						surface area</em> (set below). Falls back to browser if no person
						is in that room.
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
				hint="Which HA area THIS broadsheet instance lives in (the wall tablet's area, the office desktop's area). Powers 'presence:originator' routing: voice replies route to whoever's currently in this area."
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
				hint="Whether the moment view shows the mic pill bottom-right. The mic uses the same pipeline as the voice satellites."
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
	</section>

	<!-- ─── Harold-preset (conditional inline-render) ───────────────── -->
	{#if haroldStatus.bundled}
		<section class="config-section harold-section">
			<h2 class="section-heading">Harold</h2>
			{#if !haroldStatus.enabled}
				<div class="enable-cta">
					<p>
						<em>@broadsheet/harold-preset</em> is bundled but not enabled.
						Toggle it on in
						<a href="/settings/plugins/#plugin-harold-preset">
							Settings → Plugins
						</a>
						to expose Harold's settings here.
					</p>
				</div>
			{:else if haroldStatus.settingsThunk}
				{#await haroldStatus.settingsThunk()}
					<p class="loading">Loading Harold settings…</p>
				{:then mod}
					{@const HaroldPanel = mod.default}
					<HaroldPanel />
				{:catch err}
					<p class="error">
						Couldn't load Harold settings panel: {String(err)}
					</p>
				{/await}
			{:else}
				<p class="error">
					Harold is enabled but exposes no settings panel. (This is a
					packaging bug — please file an issue.)
				</p>
			{/if}
		</section>
	{:else}
		<section class="config-section harold-section">
			<h2 class="section-heading">Harold</h2>
			<div class="enable-cta">
				<p>
					<em>@broadsheet/harold-preset</em> isn't bundled in this broadsheet
					build. Without it, Voice runs in plain substrate mode — your
					configured conversation agent + TTS, no Hitchcock register, no
					Italian detection, no memory loop. Builds shipped via the official
					addon include harold-preset by default.
				</p>
			</div>
		</section>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.intro {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
		max-width: 70ch;
	}

	.intro p {
		margin: 0;
		line-height: var(--leading-snug);
	}

	.intro em {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
	}

	.section-heading {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--rule);
	}

	/* ─── Explainer section ───────────────────────────────────────── */
	.explainer {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.flow-steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.flow-step {
		display: grid;
		grid-template-columns: 2.5rem 1fr;
		gap: var(--space-3);
		align-items: flex-start;
	}

	.step-num {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.8rem;
		color: var(--accent);
		line-height: 1;
		font-feature-settings: 'tnum';
	}

	.step-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.step-body h3 {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.15rem;
		font-weight: 400;
		color: var(--fg);
		margin: 0;
		line-height: 1.2;
	}

	.step-aside {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		font-style: normal;
		margin-left: var(--space-2);
	}

	.step-body p {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
		line-height: var(--leading-snug);
		margin: 0;
		max-width: 72ch;
	}

	.step-body p strong {
		color: var(--accent);
		font-weight: 500;
	}

	.step-body p em {
		font-style: italic;
		color: var(--accent);
	}

	.step-warn {
		padding: var(--space-2) var(--space-3);
		background: rgba(191, 58, 48, 0.06);
		border-left: 2px solid var(--state-alert, #bf3a30);
		border-radius: 0 var(--radius-card) var(--radius-card) 0;
	}

	.pipeline-bit {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
		padding: 1px var(--space-1);
		border-radius: var(--radius-pill);
	}

	/* ─── Config sections ─────────────────────────────────────────── */
	.config-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.harold-section {
		padding-top: var(--space-3);
	}

	.enable-cta {
		padding: var(--space-4);
		background: var(--bg-card);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
	}

	.enable-cta p {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body);
		line-height: var(--leading-snug);
		color: var(--fg);
		max-width: 72ch;
	}

	.enable-cta em {
		font-family: var(--font-mono);
		font-style: normal;
		color: var(--accent);
	}

	.enable-cta a {
		color: var(--accent);
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

	@media (max-width: 720px) {
		.flow-step {
			grid-template-columns: 2rem 1fr;
		}
		.step-num {
			font-size: 1.4rem;
		}
	}
</style>
