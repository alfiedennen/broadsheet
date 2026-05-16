<script lang="ts">
	/**
	 * VoicePillRenderer — bottom-right floating mic + last-utterance
	 * preview pill, mounted on `/` (the moment view).
	 *
	 * The minimal voice surface: tap to push-to-talk, see what was
	 * just said + the start of the reply, tap through to /voice for
	 * the full transcript pane.
	 *
	 * Three states:
	 *   - idle: small mic glyph only
	 *   - listening: pulsing mic + interim transcript
	 *   - shortly-after-reply: shows last utterance + reply for 8s
	 *     then collapses back to idle
	 *
	 * Gated on the user's pillOnMoment curation flag. If they've
	 * hidden it, the renderer returns null (component renders nothing).
	 * The voice plugin's `useRenderer` consumer on `/` always asks for
	 * the renderer; the gate happens inside, where the curation is
	 * already reactive.
	 *
	 * Rubric: P8-S3 (the pill half).
	 */

	import { getConnection, useCurationField } from '@broadsheet/core';
	import { transcriptBus } from '../lib/transcript-bus.svelte';
	import { routeUtterance } from '../lib/conversation';
	import { speak } from '../lib/tts';
	import { startCapture, isSupported as isSttSupported, type SttHandle } from '../lib/stt';
	import { pullVoiceDiscovery, resolveActivePipeline } from '../lib/discovery';
	import { DEFAULT_VOICE_CONFIG, type AssistPipeline } from '../lib/types';
	import { onMount } from 'svelte';

	const pillOnMoment = useCurationField<boolean>('plugins.voice.config.pillOnMoment');
	const activePipelineId = useCurationField<string | null>(
		'plugins.voice.config.activePipelineId'
	);
	const ttsTarget = useCurationField<string>('plugins.voice.config.ttsTarget');
	const haNativeFirst = useCurationField<boolean>('plugins.voice.config.haNativeFirst');

	let pipeline = $state<AssistPipeline | null>(null);
	let sttHandle = $state<SttHandle | null>(null);
	let interim = $state('');
	let collapsedTimer: ReturnType<typeof setTimeout> | null = null;
	let showRecent = $state(false);
	const sttOk = isSttSupported();

	const visible = $derived(pillOnMoment.value !== false);
	const latest = $derived(transcriptBus.latest);

	async function bootPipeline() {
		const conn = getConnection();
		if (!conn) return;
		const disc = await pullVoiceDiscovery(conn);
		pipeline = resolveActivePipeline(disc, activePipelineId.value ?? null);
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
			onError: () => {
				interim = '';
				sttHandle = null;
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
		if (result.speech && pipeline.tts_engine) {
			await speak(conn, {
				text: result.speech.text,
				engine: pipeline.tts_engine,
				language: pipeline.tts_language ?? pipeline.conversation_language,
				voice: pipeline.tts_voice,
				target: ttsTarget.value || DEFAULT_VOICE_CONFIG.ttsTarget
			});
		}
		// Expand the pill briefly to show what was said + the reply
		showRecent = true;
		if (collapsedTimer) clearTimeout(collapsedTimer);
		collapsedTimer = setTimeout(() => {
			showRecent = false;
			collapsedTimer = null;
		}, 8000);
	}

	onMount(() => {
		void bootPipeline();
		return () => {
			sttHandle?.abort();
			if (collapsedTimer) clearTimeout(collapsedTimer);
		};
	});
</script>

{#if visible}
	<aside
		class="voice-pill"
		class:expanded={showRecent || transcriptBus.inFlight || interim.length > 0}
		data-active={sttHandle !== null ? 'true' : 'false'}
	>
		{#if showRecent && latest && !transcriptBus.inFlight}
			<div class="recent">
				<p class="recent-utterance"><em>{latest.utterance}</em></p>
				{#if latest.reply}
					<p class="recent-reply">{latest.reply}</p>
				{:else if latest.error}
					<p class="recent-reply error">— {latest.error}</p>
				{/if}
			</div>
		{/if}
		{#if transcriptBus.inFlight && interim}
			<p class="recent-utterance interim"><em>{interim}…</em></p>
		{/if}
		{#if sttOk}
			<button
				type="button"
				class="mic"
				class:active={sttHandle !== null}
				onclick={() => (sttHandle ? stopMic() : startMic())}
				disabled={!pipeline}
				aria-label={sttHandle ? 'Stop' : 'Push to talk'}
			>
				{sttHandle ? '◼' : '🎙'}
			</button>
		{/if}
	</aside>
{/if}

<style>
	.voice-pill {
		position: fixed;
		bottom: var(--space-4);
		right: var(--space-4);
		z-index: 110;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		transition: max-width var(--ease-normal), border-color var(--ease-quick);
		max-width: 56px;
		overflow: hidden;
	}

	.voice-pill.expanded {
		max-width: min(420px, 90vw);
		padding: var(--space-2) var(--space-3);
	}

	.voice-pill[data-active='true'] {
		border-color: var(--state-alert, #bf3a30);
	}

	.recent {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.recent-utterance,
	.recent-reply {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
		color: var(--fg);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.recent-utterance em {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
	}

	.recent-utterance.interim {
		opacity: 0.7;
	}

	.recent-reply {
		color: var(--fg-muted);
	}

	.recent-reply.error {
		color: var(--state-alert, #bf3a30);
	}

	.mic {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--bg);
		border-radius: 999px;
		font-size: 1rem;
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
</style>
