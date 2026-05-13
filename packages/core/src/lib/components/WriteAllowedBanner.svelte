<script lang="ts">
	/**
	 * Persistent red ribbon at the top of the screen, visible whenever
	 * `?allow-writes=true` is in the URL. The whole point: you cannot
	 * forget that writes are armed.
	 *
	 * Disappears on next reload (the URL flag isn't persisted).
	 */
	import { safety } from '$lib/stores/safety.svelte';
</script>

{#if safety.writesAllowed && safety.readonly}
	<div class="banner" role="alert">
		<span class="icon">⚠</span>
		<span class="text">
			Writes <strong>allowed</strong> in this session — refresh to reset
		</span>
		<a class="reset" href={typeof window !== 'undefined' ? window.location.pathname : '/'}>
			Reset
		</a>
	</div>
{/if}

<style>
	.banner {
		position: sticky;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: #bf3a30;
		color: #fff;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.85rem;
		letter-spacing: 0.04em;
	}

	.icon {
		font-size: 1rem;
	}

	.text strong {
		font-weight: 700;
	}

	.reset {
		color: #fff;
		text-decoration: underline;
		font-weight: 500;
	}

	.reset:hover {
		color: #ffd9d6;
	}
</style>
