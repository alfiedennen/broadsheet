<script lang="ts">
	/**
	 * ConnectionIndicator — small chip in the bottom-right corner that
	 * appears ONLY when broadsheet is disconnected from HA. Stays
	 * invisible during normal `connected` operation so it doesn't add
	 * chrome to the editorial register.
	 *
	 * State machine (mirrors $lib/stores/connection):
	 *   idle / connecting → "Connecting…"
	 *   reconnecting → "Reconnecting (attempt N)…"
	 *   fatal → "Connection lost — refresh to retry"
	 *   connected → no chip
	 *
	 * Rubric coverage: P5-S4 (ambient display falls back gracefully
	 * when offline). The chip alone doesn't disable action surfaces
	 * — that's a parallel hardening of the action handlers, separately
	 * addressed in `lib/ha/actions.ts`.
	 */
	import { connection } from '$lib/stores/connection.svelte';

	const visible = $derived(
		connection.status === 'connecting' ||
			connection.status === 'reconnecting' ||
			connection.status === 'fatal' ||
			connection.status === 'idle'
	);

	const label = $derived.by(() => {
		switch (connection.status) {
			case 'idle':
				return 'Connecting…';
			case 'connecting':
				return 'Connecting…';
			case 'reconnecting':
				return `Reconnecting${connection.reconnectAttempts ? ` (attempt ${connection.reconnectAttempts})` : ''}…`;
			case 'fatal':
				return 'Connection lost — refresh to retry';
			default:
				return '';
		}
	});

	const status = $derived(connection.status);
</script>

{#if visible}
	<div class="conn-chip" data-status={status} role="status" aria-live="polite">
		<span class="dot" aria-hidden="true"></span>
		<span class="label">{label}</span>
	</div>
{/if}

<style>
	.conn-chip {
		position: fixed;
		bottom: var(--space-4);
		right: var(--space-4);
		z-index: 100;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: rgba(26, 24, 20, 0.92);
		backdrop-filter: blur(8px);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: lowercase;
		color: var(--fg-muted);
		min-height: 32px;
		animation: slideIn 220ms ease-out;
	}

	.conn-chip[data-status='idle'],
	.conn-chip[data-status='connecting'] {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--rule));
		color: var(--accent);
	}

	.conn-chip[data-status='reconnecting'] {
		border-color: var(--accent);
		color: var(--accent);
	}

	.conn-chip[data-status='fatal'] {
		border-color: var(--state-alert);
		color: var(--state-alert);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.4s ease-in-out infinite;
	}

	.conn-chip[data-status='fatal'] .dot {
		animation: none;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes slideIn {
		from {
			transform: translateY(8px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
