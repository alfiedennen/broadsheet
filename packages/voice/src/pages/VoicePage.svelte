<script lang="ts">
	/**
	 * /voice — the transcript pane + push-to-talk surface.
	 *
	 * One scroll of the last N exchanges in editorial register
	 * ("You said: …" / "Broadsheet replied: …"), a big mic button at
	 * the bottom-right that grabs an utterance via Web Speech API,
	 * routes through the conversation module, and appends the result.
	 *
	 * If the active pipeline isn't picked or browser STT isn't
	 * supported, surface friendly empty states + a text-typing
	 * fallback so the page is never dead.
	 *
	 * Rubric: P8-S3.
	 */

	import { onMount } from 'svelte';
	import {
		PageShell,
		Hero,
		Eyebrow,
		Explainer,
		useCurationField,
		getConnection
	} from '@broadsheet/core';
	import {
		pullVoiceDiscovery,
		resolveActivePipeline,
		pipelineSummary
	} from '../lib/discovery';
	import { routeUtterance } from '../lib/conversation';
	import { startCapture, isSupported as isSttSupported, type SttHandle } from '../lib/stt';
	import { speak } from '../lib/tts';
	import { resolveTtsTarget } from '../lib/tts-target';
	import { transcriptBus } from '../lib/transcript-bus.svelte';
	import { DEFAULT_VOICE_CONFIG, type VoiceDiscovery } from '../lib/types';

	const activePipelineId = useCurationField<string | null>(
		'plugins.voice.config.activePipelineId'
	);
	const ttsTarget = useCurationField<string>('plugins.voice.config.ttsTarget');
	const haNativeFirst = useCurationField<boolean>('plugins.voice.config.haNativeFirst');

	let discovery = $state<VoiceDiscovery | null>(null);
	let booting = $state(true);
	let bootError = $state<string | null>(null);
	let sttHandle = $state<SttHandle | null>(null);
	let interim = $state('');
	let textBuffer = $state('');
	const sttOk = isSttSupported();

	const pipeline = $derived(
		discovery ? resolveActivePipeline(discovery, activePipelineId.value ?? null) : null
	);
	const summary = $derived(
		discovery && pipeline ? pipelineSummary(pipeline, discovery) : ''
	);

	async function boot() {
		const conn = getConnection();
		if (!conn) {
			bootError = 'No HA connection — open broadsheet from inside HA.';
			booting = false;
			return;
		}
		try {
			discovery = await pullVoiceDiscovery(conn);
			bootError = discovery.lastError;
		} catch (err) {
			bootError = err instanceof Error ? err.message : String(err);
		}
		booting = false;
	}

	function startMic() {
		if (sttHandle) return;
		const lang = pipeline?.conversation_language ?? 'en-GB';
		interim = '';
		sttHandle = startCapture(lang, {
			onInterim: (t) => (interim = t),
			onFinal: (t) => {
				interim = '';
				void send(t);
			},
			onError: (e) => {
				interim = '';
				sttHandle = null;
				// eslint-disable-next-line no-console
				console.warn('[@broadsheet/voice] STT error', e);
			},
			onEnd: () => {
				sttHandle = null;
			}
		});
	}

	function stopMic() {
		sttHandle?.stop();
		sttHandle = null;
	}

	async function send(text: string) {
		const conn = getConnection();
		if (!conn || !pipeline) return;
		const turn = transcriptBus.beginTurn(text);
		const result = await routeUtterance({
			conn,
			pipeline,
			text,
			turn,
			haNativeFirst: haNativeFirst.value ?? DEFAULT_VOICE_CONFIG.haNativeFirst
		});
		transcriptBus.finishTurn({
			reply: result.turn.reply,
			via: result.turn.via,
			spoke: result.turn.spoke,
			error: result.turn.error
		});

		// Play the speech (if any). Browser-target plays in-tab; entity
		// target streams to that media_player. tts engine + voice come
		// from the active pipeline.
		if (result.speech && pipeline.tts_engine) {
			// Fix #3 — presence-based target resolution. See
			// VoicePillRenderer for the same pattern.
			const resolved = resolveTtsTarget(ttsTarget.value || DEFAULT_VOICE_CONFIG.ttsTarget);
			await speak(conn, {
				text: result.speech.text,
				engine: pipeline.tts_engine,
				language: pipeline.tts_language ?? pipeline.conversation_language,
				voice: pipeline.tts_voice,
				target: resolved.target
			});
		}
	}

	function sendTyped() {
		const t = textBuffer.trim();
		if (!t) return;
		textBuffer = '';
		void send(t);
	}

	function formatTime(ms: number): string {
		const d = new Date(ms);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	onMount(() => {
		void boot();
		return () => sttHandle?.abort();
	});
</script>

<svelte:head>
	<title>Voice · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="№ 09 · Voice" />
		{/snippet}
		{#snippet headline()}
			{transcriptBus.inFlight ? 'Listening…' : 'Voice.'}
		{/snippet}
		{#snippet dek()}
			{#if booting}Discovering HA's voice pipeline…
			{:else if bootError}{bootError}
			{:else if !pipeline}No assist pipeline yet. Set one up in HA → Settings → Assist.
			{:else}Active pipeline: {summary}
			{/if}
		{/snippet}
	</Hero>

	{#if transcriptBus.turns.length === 0 && !booting}
		<p class="empty">Tap the mic and say something to your house. The transcript will land here.</p>
	{:else if transcriptBus.turns.length > 0}
		<section class="transcript">
			{#each [...transcriptBus.turns].reverse() as turn (turn.id)}
				<article class="turn" data-via={turn.via} data-spoke={turn.spoke}>
					<header class="turn-head">
						<span class="turn-time">{formatTime(turn.timestamp)}</span>
						<span class="turn-via">{turn.via === 'ha-native' ? 'HA native' : turn.via === 'llm' ? pipeline?.conversation_engine ?? 'LLM' : ''}</span>
					</header>
					<p class="you">You said:&nbsp;<em>{turn.utterance}</em></p>
					{#if turn.reply}
						<p class="reply">
							Broadsheet replied:&nbsp;{turn.reply}
						</p>
					{:else if turn.error}
						<p class="reply error">— {turn.error}</p>
					{:else if !turn.spoke && turn.via === 'ha-native' && turn.reply === ''}
						<p class="reply silent">— (silent: device control fired)</p>
					{/if}
				</article>
			{/each}
		</section>
	{/if}

	{#if !booting}
		<section class="control">
			{#if sttOk}
				<button
					type="button"
					class="mic"
					class:active={sttHandle !== null}
					onclick={() => (sttHandle ? stopMic() : startMic())}
					disabled={!pipeline}
				>
					{sttHandle ? '◼  Stop' : '🎙  Talk'}
				</button>
				{#if interim}
					<p class="interim">…{interim}</p>
				{/if}
			{:else}
				<p class="hint">Browser mic not supported — type a message instead.</p>
			{/if}
			<form
				class="typed"
				onsubmit={(e) => {
					e.preventDefault();
					sendTyped();
				}}
			>
				<input
					type="text"
					placeholder="…or type"
					bind:value={textBuffer}
					disabled={!pipeline}
				/>
				<button type="submit" disabled={!pipeline || !textBuffer.trim()}>
					Send
				</button>
			</form>
		</section>
	{/if}

	<Explainer>
		Voice runs through HA's existing assist pipeline — same conversation
		agent + TTS your Atom Echo satellites use. Routing tries
		<code>conversation.home_assistant</code> first (free, sub-200ms, knows
		your devices); only what HA-native doesn't recognise falls through to
		the configured LLM.
	</Explainer>
</PageShell>

<style>
	.empty {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		text-align: center;
		padding: var(--space-6);
	}

	.transcript {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: var(--space-4) 0;
	}

	.turn {
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.turn[data-via='ha-native'] {
		border-left: 3px solid var(--state-positive, #6a8a4d);
	}
	.turn[data-via='llm'] {
		border-left: 3px solid var(--accent);
	}

	.turn-head {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin-bottom: var(--space-2);
	}

	.you {
		font-family: var(--font-body);
		font-size: var(--text-body);
		margin: 0 0 var(--space-1);
		color: var(--fg);
	}

	.you em {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
	}

	.reply {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}

	.reply.error {
		color: var(--state-alert, #bf3a30);
	}
	.reply.silent {
		font-style: italic;
		opacity: 0.7;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: center;
		margin: var(--space-6) 0;
	}

	.mic {
		padding: var(--space-3) var(--space-6);
		font-family: var(--font-mono);
		font-size: 1.1rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		background: var(--accent);
		color: var(--bg);
		border-radius: var(--radius-pill);
		transition: opacity var(--ease-quick);
	}

	.mic:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.mic.active {
		background: var(--state-alert, #bf3a30);
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.65;
		}
	}

	.interim {
		font-family: var(--font-body);
		font-style: italic;
		color: var(--fg-muted);
		margin: 0;
	}

	.hint {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--fg-muted);
		margin: 0;
	}

	.typed {
		display: flex;
		gap: var(--space-2);
		width: min(28rem, 90vw);
	}

	.typed input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		color: var(--fg);
		font-family: var(--font-body);
	}

	.typed input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.typed button {
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		text-transform: uppercase;
		letter-spacing: var(--track-eyebrow);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
	}

	.typed button:not(:disabled):hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
