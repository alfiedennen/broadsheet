<script lang="ts">
	/**
	 * /voice — the voice substrate explainer.
	 *
	 * 0.8 rewrite: this used to be a transcript pane + push-to-talk
	 * surface. The user's dogfood feedback: "completely useless,
	 * nobody wants or needs this. This page should be about how HA
	 * intent and Harold/Custom voice+LLM work and interact in your
	 * home." So that's what it is now — an editorial page describing
	 * how voice flows through the house, gated by what's actually
	 * configured.
	 *
	 * The push-to-talk pill still lives on /` via VoicePillRenderer
	 * for users who want the mic affordance. /voice is reserved for
	 * understanding the system.
	 */

	import { onMount } from 'svelte';
	import {
		PageShell,
		Hero,
		Eyebrow,
		Explainer,
		useCurationField,
		getConnection,
		discovery as coreDiscovery
	} from '@broadsheet/core';
	import { pullVoiceDiscovery, resolveActivePipeline } from '../lib/discovery';
	import type { AssistPipeline, VoiceDiscovery } from '../lib/types';

	const activePipelineId = useCurationField<string | null>(
		'plugins.voice.config.activePipelineId'
	);
	const ttsTarget = useCurationField<string>('plugins.voice.config.ttsTarget');
	const haNativeFirst = useCurationField<boolean>('plugins.voice.config.haNativeFirst');
	const surfaceArea = useCurationField<string | null>('view.surfaceArea');

	let discovery = $state<VoiceDiscovery | null>(null);
	let booting = $state(true);
	let bootError = $state<string | null>(null);

	const pipeline = $derived<AssistPipeline | null>(
		discovery ? resolveActivePipeline(discovery, activePipelineId.value ?? null) : null
	);

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

	// What does the pipeline summary look like?
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

	async function refresh() {
		booting = true;
		const conn = getConnection();
		if (!conn) {
			bootError = 'No HA connection — open broadsheet from inside HA';
			booting = false;
			return;
		}
		discovery = await pullVoiceDiscovery(conn);
		bootError = discovery.lastError;
		booting = false;
	}

	onMount(() => {
		void refresh();
	});
</script>

<svelte:head>
	<title>Voice · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Voice" />
		{/snippet}
		{#snippet headline()}
			How the house listens.
		{/snippet}
		{#snippet dek()}
			broadsheet sits on top of Home Assistant's voice substrate.
			Every spoken request takes the same trip through the house —
			this page shows the trip, end-to-end, with whatever's
			installed today.
		{/snippet}
	</Hero>

	<section class="flow">
		<h2 class="flow-heading">The path of a sentence</h2>
		<ol class="flow-steps">
			<li class="flow-step">
				<span class="step-num">1</span>
				<div class="step-body">
					<h3>Wake</h3>
					<p>
						A wake-word detector (on a satellite — Atom Echo, M5Stack,
						ESPHome — or in this browser tab) listens locally for "Hey
						Harold" or whichever phrase you've trained. <em>No audio leaves
						the device until the wake fires.</em> When it does, the next 6
						seconds get streamed up to Home Assistant.
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">2</span>
				<div class="step-body">
					<h3>Listen <span class="step-aside">— Speech-to-text</span></h3>
					<p>
						<code class="pipeline-bit">{sttName}</code> transcribes the audio
						into text. HA Cloud STT is the typical pick (free with Nabu
						Casa, en-GB-aware); Whisper is the local alternative for
						privacy-first setups. The text shows up in your transcript
						feed.
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">3</span>
				<div class="step-body">
					<h3>Understand <span class="step-aside">— Intent matching</span></h3>
					{#if haNativeOn}
						<p>
							<strong>HA-native intent matching runs first.</strong> It's a
							fast deterministic matcher built into Home Assistant — sub-200ms,
							free, no LLM call. If the sentence matches a known intent
							("turn off the office lights", "what's the temperature
							upstairs"), HA executes the action AND returns the canned
							response. broadsheet speaks that response and the trip ends
							here.
						</p>
						<p class="step-quiet">
							The substrate skips an LLM call entirely for ~80% of household
							requests. Cheap + reliable + fast.
						</p>
					{:else}
						<p class="step-warn">
							<strong>HA-native intent matching is OFF.</strong> Every
							utterance goes straight to the conversation agent — slower +
							more expensive. Toggle on in
							<a href="/settings/plugins/voice/config/">Settings → Voice</a>
							unless you have a specific reason to skip it.
						</p>
					{/if}
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">4</span>
				<div class="step-body">
					<h3>Converse <span class="step-aside">— Fall-through LLM</span></h3>
					<p>
						If HA-native didn't match, the request falls through to your
						configured conversation agent:
						<code class="pipeline-bit">{agentName}</code>. This is where Claude
						/ GPT / Gemini / a local LLaMA / etc. takes the question.
						broadsheet ships
						<code class="pipeline-bit">@broadsheet/harold-preset</code> on
						top of this for opinionated Hitchcock-register replies with
						conversational memory; the substrate works fine with any
						conversation agent HA exposes.
					</p>
				</div>
			</li>

			<li class="flow-step">
				<span class="step-num">5</span>
				<div class="step-body">
					<h3>Reply <span class="step-aside">— Text-to-speech</span></h3>
					<p>
						The agent's reply gets handed to
						<code class="pipeline-bit">{ttsName}</code>. ElevenLabs Flash v2.5
						is the typical Harold pick (custom Hitchcock-baritone voice,
						sub-second latency). HA Cloud TTS is the free fallback. Piper /
						Festival / locally-hosted Whisper-TTS work too — the substrate
						doesn't care.
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
							testable; the right pick when you're configuring or
							diagnosing. Pick a speaker or a presence option in
							<a href="/settings/plugins/voice/config/">Settings → Voice</a>
							to route the reply through HA media_players instead.
						</p>
					{:else if isPresenceOriginator}
						<p>
							<strong>Presence routing: originator.</strong> The reply
							plays through whichever speaker is nearest to the person
							currently in
							<code class="pipeline-bit">{surfaceAreaName ?? '(surface area not set)'}</code>.
							The picker layer (<code class="pipeline-bit">routeTo(person, 'audio')</code>)
							resolves at speak time so the route adapts to whoever's
							actually in the room.
						</p>
						{#if !surfaceAreaName}
							<p class="step-warn">
								Surface area isn't configured for this broadsheet instance.
								Originator routing falls back to browser. Set it in
								<a href="/settings/plugins/voice/config/">Voice → Surface area</a>.
							</p>
						{/if}
					{:else if isPresencePerson && presencePersonName}
						<p>
							<strong>Presence routing: {presencePersonName}.</strong> The
							reply plays through whichever speaker is nearest to
							{presencePersonName} <em>right now</em> — wherever they happen
							to be in the house. Move room, the next utterance lands in
							the new room.
						</p>
					{:else}
						<p>
							The reply plays through
							<code class="pipeline-bit">{ttsTargetVal}</code> — a fixed
							media_player. Static routing; doesn't follow you around the
							house. To make it dynamic, switch to a presence target in
							<a href="/settings/plugins/voice/config/">Settings → Voice</a>.
						</p>
					{/if}
				</div>
			</li>
		</ol>
	</section>

	<section class="status">
		<h2 class="flow-heading">Your current pipeline</h2>
		{#if booting}
			<p class="status-line">Reading what HA has installed…</p>
		{:else if bootError}
			<p class="status-line warn">⚠ {bootError}</p>
		{:else if !pipeline}
			<p class="status-line warn">
				No assist_pipeline is active. Configure one in
				<a href="/settings/plugins/voice/config/">Voice settings</a>, or open
				Home Assistant's Voice Assistants panel.
			</p>
		{:else}
			<dl class="status-dl">
				<dt>Pipeline</dt>
				<dd><code>{pipeline.name}</code></dd>
				<dt>Wake word</dt>
				<dd>
					{#if pipeline.wake_word_entity}
						<code>{pipeline.wake_word_entity}</code>
					{:else}
						<em>none configured — using browser push-to-talk</em>
					{/if}
				</dd>
				<dt>STT</dt>
				<dd><code>{sttName}</code></dd>
				<dt>Conversation agent</dt>
				<dd>
					<code>{agentName}</code>
					{#if haNativeOn}<span class="status-aside">(HA-native runs first)</span>{/if}
				</dd>
				<dt>TTS</dt>
				<dd><code>{ttsName}</code></dd>
				<dt>Reply target</dt>
				<dd>
					{#if ttsTargetVal === 'browser'}
						<em>Browser tab</em>
					{:else if isPresenceOriginator}
						<em>Nearest speaker to whoever's in
							{surfaceAreaName ?? '(unset)'}</em>
					{:else if isPresencePerson && presencePersonName}
						<em>Nearest speaker to {presencePersonName}</em>
					{:else}
						<code>{ttsTargetVal}</code>
					{/if}
				</dd>
			</dl>
		{/if}
	</section>

	<Explainer>
		The push-to-talk pill bottom-right of <a href="/">the moment</a> uses
		this same pipeline; the picker on
		<a href="/settings/plugins/voice/config/">Voice settings</a>
		decides where replies land.
	</Explainer>
</PageShell>

<style>
	.flow {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.flow-heading {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 var(--space-2);
	}

	.flow-steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: step;
	}

	.flow-step {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: var(--space-4);
		align-items: flex-start;
	}

	.step-num {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 2.4rem;
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
		font-size: 1.4rem;
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
		max-width: 64ch;
	}

	.step-body p strong {
		color: var(--accent);
		font-weight: 500;
	}

	.step-body p em {
		font-style: italic;
		color: var(--accent);
	}

	.step-body p a {
		color: var(--accent);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		text-decoration: none;
	}

	.step-body p a:hover {
		border-bottom-color: var(--accent);
	}

	.step-quiet {
		font-style: italic;
		color: var(--fg-muted);
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

	.status {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.status-dl {
		display: grid;
		grid-template-columns: 12rem 1fr;
		gap: var(--space-2) var(--space-4);
		margin: 0;
	}

	.status-dl dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.status-dl dd {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.status-dl dd code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--accent);
	}

	.status-line {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		margin: 0;
	}

	.status-line.warn {
		color: var(--state-alert, #bf3a30);
	}

	.status-line a {
		color: var(--accent);
	}

	.status-aside {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-muted);
		margin-left: var(--space-2);
	}

	@media (max-width: 720px) {
		.flow-step {
			grid-template-columns: 2rem 1fr;
			gap: var(--space-3);
		}
		.step-num {
			font-size: 1.6rem;
		}
		.status-dl {
			grid-template-columns: 1fr;
			gap: var(--space-1) var(--space-2);
		}
		.status-dl dd {
			margin-bottom: var(--space-2);
		}
	}
</style>
