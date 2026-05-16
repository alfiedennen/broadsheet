<script lang="ts">
	/**
	 * RoomReveal — per-area expansion with the entities that page cares
	 * about. Collapsed view shows the area name + a one-line state
	 * summary; expanded view reveals the controls.
	 *
	 * Pages pass entity selection via a `pick` snippet — RoomReveal
	 * doesn't know whether you're rendering lights, climate, etc.
	 *
	 * Pattern from harold-home: prose summary first, controls
	 * progressively disclosed. "library is on (3 lamps, 60%)" — you
	 * don't need to see sliders unless you want to change them.
	 *
	 * Theme H: area name carries an InlinePin → inline-popover with
	 * rename form. Wrapping the name in InlinePin meant restructuring
	 * the markup — area name is no longer INSIDE the toggle button
	 * (button-in-button is invalid HTML + breaks the pencil affordance),
	 * but a sibling of the toggle. Click area-name = rename popover;
	 * click toggle row = expand controls. Two affordances, two distinct
	 * targets.
	 */

	import type { Snippet } from 'svelte';
	import type { DomainArea } from '$lib/discovery';
	import { renameArea } from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { curationStore } from '$lib/curation/store.svelte';
	import InlinePin from './InlinePin.svelte';

	let {
		area,
		summary,
		controls
	}: {
		area: DomainArea;
		summary: Snippet<[DomainArea]>;
		controls: Snippet<[DomainArea]>;
	} = $props();

	let open = $state(false);
	function toggle() {
		open = !open;
	}

	// Theme H: rename-popover state
	let renameValue = $state('');
	$effect(() => {
		// Seed input with current display when popover opens
		renameValue = area.name;
	});
	async function commitRename(close: () => void) {
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === area.name) {
			close();
			return;
		}
		const ok = await renameArea(area.id, trimmed);
		if (ok) {
			showToast(`Renamed → ${trimmed}`, 'success');
			close();
		} else {
			showToast('Rename failed', 'error');
		}
	}
	async function clearRename(close: () => void) {
		const ok = await renameArea(area.id, null);
		if (ok) {
			showToast('Reverted to HA name', 'success');
			close();
		}
	}

	// Theme H: confidence indicator for area-name
	//   'overridden' → user has curated a rename
	//   'low'        → area.name looks like a raw HA slug (lowercase_with_underscores)
	//   'auto'       → friendly name from HA, looks human
	const curated = $derived(curationStore.current.areas[area.id]?.rename);
	const looksLikeSlug = $derived(
		!curated && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(area.name)
	);
	const confidence = $derived<'auto' | 'low' | 'overridden'>(
		curated ? 'overridden' : looksLikeSlug ? 'low' : 'auto'
	);
</script>

<section class="reveal" class:open data-area-id={area.id}>
	<div class="reveal-head">
		<div class="head-left">
			<h3 class="area-name">
				<InlinePin
					value={area.name}
					label="Rename {area.name}"
					{confidence}
				>
					{#snippet children(close: () => void)}
						<form
							class="rename-form"
							onsubmit={(e) => {
								e.preventDefault();
								commitRename(close);
							}}
						>
							<label class="rename-label" for="rename-{area.id}">
								Display name for <code>{area.id}</code>
							</label>
							<input
								id="rename-{area.id}"
								class="rename-input"
								type="text"
								bind:value={renameValue}
								placeholder={area.name}
							/>
							<div class="rename-actions">
								<button type="submit" class="rename-save">Save</button>
								{#if curated}
									<button
										type="button"
										class="rename-clear"
										onclick={() => clearRename(close)}
									>
										Revert to HA name
									</button>
								{/if}
								<button
									type="button"
									class="rename-cancel"
									onclick={() => close()}
								>
									Cancel
								</button>
							</div>
						</form>
					{/snippet}
				</InlinePin>
			</h3>
			<button
				type="button"
				class="summary-toggle"
				aria-expanded={open}
				onclick={toggle}
			>
				<span class="area-summary">{@render summary(area)}</span>
				<span class="chev" aria-hidden="true">{open ? '−' : '+'}</span>
			</button>
		</div>
	</div>

	{#if open}
		<div class="reveal-body">
			{@render controls(area)}
		</div>
	{/if}
</section>

<style>
	.reveal {
		border-bottom: 1px solid var(--rule);
	}

	.reveal:last-child {
		border-bottom: none;
	}

	.reveal-head {
		padding: var(--space-4) var(--space-2);
	}

	.head-left {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.area-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.6rem;
		font-weight: 400;
		line-height: 1.2;
		margin: 0;
		color: var(--fg);
	}

	.summary-toggle {
		width: 100%;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		text-align: left;
		color: var(--fg-muted);
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		transition: color var(--ease-quick);
	}

	.summary-toggle:hover {
		color: var(--accent);
	}

	.area-summary {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
	}

	.reveal.open .area-name {
		color: var(--accent);
	}

	.chev {
		font-family: var(--font-mono);
		font-size: 1.4rem;
		flex: 0 0 auto;
		line-height: 1;
		padding-top: 0.3rem;
	}

	.reveal-body {
		padding: var(--space-2) var(--space-2) var(--space-6);
		animation: revealOpen 200ms ease-out;
	}

	@keyframes revealOpen {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Theme H: rename-popover form */
	.rename-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.rename-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
	}
	.rename-label code {
		font-family: var(--font-mono);
		color: var(--accent);
	}
	.rename-input {
		font-family: var(--font-body);
		font-size: 1rem;
		padding: var(--space-2) var(--space-3);
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
	}
	.rename-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.rename-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.rename-save,
	.rename-clear,
	.rename-cancel {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		border: 1px solid var(--rule);
		background: transparent;
		color: var(--fg);
		cursor: pointer;
	}
	.rename-save {
		border-color: var(--accent);
		color: var(--accent);
	}
	.rename-clear {
		color: var(--fg-muted);
	}
</style>
