<script lang="ts">
	/**
	 * Toast — bottom-right ephemeral notification.
	 *
	 * Used by Settings screens to confirm "Saved" / "Couldn't save".
	 * Lives in the layout (one instance), driven by the toastStore.
	 */

	import { toastStore } from '$lib/stores/toast.svelte';
</script>

{#if toastStore.current}
	<div class="toast" data-kind={toastStore.current.kind} role="status">
		{#if toastStore.current.kind === 'error'}
			<span class="icon" aria-hidden="true">✗</span>
		{:else}
			<span class="icon" aria-hidden="true">✓</span>
		{/if}
		<span class="text">{toastStore.current.text}</span>
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: var(--space-4);
		left: 50%;
		transform: translateX(-50%);
		z-index: 500;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		box-shadow: var(--shadow-card);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg);
		animation: toastIn 200ms ease-out;
	}

	.toast[data-kind='success'] {
		border-color: var(--state-on);
		color: var(--state-on);
	}

	.toast[data-kind='error'] {
		border-color: var(--state-alert);
		color: var(--state-alert);
	}

	.icon {
		font-weight: 700;
	}

	@keyframes toastIn {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
