<script lang="ts">
	/**
	 * 0.9.1 — Macro composer modal.
	 *
	 * Reached from the canvas footer ("+ Macro") or from the row
	 * editor of an existing `macro` block ("Edit macro…"). Walks the
	 * user through:
	 *
	 *   1. Name the macro + (optional) icon
	 *   2. Pick a thing → pick an action → step added
	 *   3. Repeat (and/or reorder/remove steps)
	 *   4. Save
	 *
	 * On save the parent persists the macro as a `macro` block. New
	 * macros append to the end of the canvas; edits replace in place.
	 *
	 * The composer is intentionally tap-only — no service.domain
	 * typing, no JSON pasting. If the user wants something exotic
	 * they fall back to the action-grid block in advanced mode.
	 *
	 * Spec: docs/plans/plan-9.1-wall-builder-things-first.md.
	 */

	import { discovery } from '$lib/discovery';
	import { defaultActionsFor, type DefaultAction } from '$lib/blocks/thing-mapping';
	import type { MacroBlockConfig, MacroStep } from '$lib/blocks/types';
	import {
		buildBrowserTree,
		filterBrowserTree,
		type BrowserGroup,
		type BrowserThing
	} from '$lib/blocks/things-browser';

	interface Props {
		/**
		 * Existing macro to edit, or null for a new macro. The composer
		 * starts the form pre-filled in edit mode; the title flips to
		 * "Edit macro" vs "Compose macro".
		 */
		initial: MacroBlockConfig | null;
		/** Called when the user clicks Save. Parent persists. */
		onSave: (macro: MacroBlockConfig) => void;
		/** Called when the user dismisses without saving. */
		onClose: () => void;
	}

	let { initial, onSave, onClose }: Props = $props();

	// Working copy — everything edits in-memory until Save fires.
	// The modal is mounted with a fresh `initial` and unmounted on
	// close; re-opening creates a new instance, so capturing `initial`
	// only at construction is the intended semantic. The svelte-ignore
	// comments below acknowledge that one-shot init pattern.

	// svelte-ignore state_referenced_locally
	let label = $state(initial?.label ?? '');
	// svelte-ignore state_referenced_locally
	let detail = $state(initial?.detail ?? '');
	// svelte-ignore state_referenced_locally
	let icon = $state(initial?.icon ?? '');
	// svelte-ignore state_referenced_locally
	let steps = $state<MacroStep[]>(initial?.steps ? [...initial.steps] : []);

	// svelte-ignore state_referenced_locally
	const isEditing = initial !== null;

	/* ── Step picker: a thin browser → action menu flow ────────────── */

	let pickerOpen = $state(false);
	let pickerQuery = $state('');
	/** When non-null, the user picked a thing; we show its actions next. */
	let pendingThing = $state<BrowserThing | null>(null);

	const tree = $derived(buildBrowserTree(discovery.areas));
	const filtered = $derived(filterBrowserTree(tree, pickerQuery));

	function openPicker() {
		pickerOpen = true;
		pickerQuery = '';
		pendingThing = null;
	}

	function closePicker() {
		pickerOpen = false;
		pendingThing = null;
	}

	function selectThing(thing: BrowserThing) {
		const actions = defaultActionsFor(thing.entityId);
		if (actions.length === 0) {
			// Read-only entity (sensor, binary_sensor) — no actions to
			// compose. Surface this so the user isn't confused why
			// nothing happens.
			alert(
				`"${thing.name}" is a ${thing.domain} — read-only, can't fire actions. Pick a controllable thing instead.`
			);
			return;
		}
		if (actions.length === 1) {
			// Only one sensible action (scene, script) — skip the menu
			// and add directly.
			addStepFromAction(thing, actions[0]);
			return;
		}
		// Multiple actions — show the inline action menu.
		pendingThing = thing;
	}

	function addStepFromAction(thing: BrowserThing, action: DefaultAction) {
		const desc = `${action.label} — ${thing.name}`;
		steps = [
			...steps,
			{
				description: desc,
				service: action.service
			}
		];
		pendingThing = null;
		// Keep picker open so the user can add another step quickly.
	}

	function removeStep(i: number) {
		steps = steps.filter((_, idx) => idx !== i);
	}

	function moveStep(i: number, delta: -1 | 1) {
		const to = i + delta;
		if (to < 0 || to >= steps.length) return;
		const next = steps.slice();
		const [moved] = next.splice(i, 1);
		next.splice(to, 0, moved);
		steps = next;
	}

	function save() {
		if (!label.trim()) {
			alert('Macro needs a label.');
			return;
		}
		if (steps.length === 0) {
			alert('Macro needs at least one step.');
			return;
		}
		onSave({
			label: label.trim(),
			detail: detail.trim() || null,
			icon: icon.trim() || null,
			steps
		});
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (pickerOpen) closePicker();
			else onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="composer-backdrop"
	onclick={handleBackdropClick}
	role="presentation"
>
	<div
		class="composer"
		role="dialog"
		aria-modal="true"
		aria-labelledby="composer-title"
	>
		<header class="composer-head">
			<h2 id="composer-title">
				{isEditing ? 'Edit macro' : 'Compose macro'}
			</h2>
			<button type="button" class="composer-close" onclick={onClose} aria-label="Close">
				✕
			</button>
		</header>

		<div class="composer-body">
			<!-- Meta -->
			<label class="field">
				<span class="field-label">Label</span>
				<input
					type="text"
					class="field-input"
					bind:value={label}
					placeholder="Cinema, Goodnight, Movie night…"
				/>
			</label>
			<label class="field">
				<span class="field-label">Sub-label (optional)</span>
				<input
					type="text"
					class="field-input"
					bind:value={detail}
					placeholder="→ 3 actions"
				/>
			</label>
			<label class="field">
				<span class="field-label">Icon (mdi:*, optional)</span>
				<input
					type="text"
					class="field-input mono"
					bind:value={icon}
					placeholder="mdi:movie-outline"
				/>
			</label>

			<!-- Steps -->
			<div class="steps-section">
				<header class="steps-head">
					<strong>Steps</strong>
					<span class="steps-count">
						{steps.length} step{steps.length === 1 ? '' : 's'}
					</span>
				</header>

				{#if steps.length === 0}
					<p class="steps-empty">
						No steps yet. Add a thing from your house, pick an action
						(turn on / activate / set temp / …), and it lands here.
					</p>
				{:else}
					<ol class="steps-list">
						{#each steps as step, i (i)}
							<li class="step-row">
								<span class="step-num">{i + 1}.</span>
								<span class="step-desc">{step.description}</span>
								<span class="step-call mono">
									{step.service.domain}.{step.service.service}
								</span>
								<div class="step-actions">
									<button
										type="button"
										class="mini"
										disabled={i === 0}
										onclick={() => moveStep(i, -1)}
										aria-label="Move up">↑</button
									>
									<button
										type="button"
										class="mini"
										disabled={i === steps.length - 1}
										onclick={() => moveStep(i, 1)}
										aria-label="Move down">↓</button
									>
									<button
										type="button"
										class="mini danger"
										onclick={() => removeStep(i)}>✕</button
									>
								</div>
							</li>
						{/each}
					</ol>
				{/if}

				<button type="button" class="action add-step-btn" onclick={openPicker}>
					+ Add step
				</button>
			</div>
		</div>

		<footer class="composer-foot">
			<button type="button" class="action" onclick={onClose}>Cancel</button>
			<button type="button" class="action confirm" onclick={save}>
				{isEditing ? 'Save macro' : 'Create macro'}
			</button>
		</footer>
	</div>

	{#if pickerOpen}
		<!--
		   Inline thing-picker overlay. Lives inside the composer
		   backdrop so the Escape handler unwinds in the right order
		   (picker first, then composer). Visually layered on top.
		-->
		<div class="picker-overlay" role="presentation">
			<div class="picker" role="dialog" aria-label="Pick a thing">
				<header class="picker-head">
					{#if pendingThing}
						<button
							type="button"
							class="picker-back"
							onclick={() => (pendingThing = null)}
							aria-label="Back to thing picker"
						>
							← Back
						</button>
						<h3>Pick action for {pendingThing.name}</h3>
					{:else}
						<h3>Pick a thing</h3>
						<input
							type="search"
							class="picker-search"
							placeholder="Search…"
							bind:value={pickerQuery}
						/>
					{/if}
					<button
						type="button"
						class="picker-done"
						onclick={closePicker}
					>
						Done
					</button>
				</header>

				{#if pendingThing}
					{@const actions = defaultActionsFor(pendingThing.entityId)}
					<ul class="action-list">
						{#each actions as action (action.id)}
							<li>
								<button
									type="button"
									class="action-row"
									onclick={() =>
										pendingThing && addStepFromAction(pendingThing, action)}
								>
									<span class="action-label">{action.label}</span>
									<span class="action-call mono">
										{action.service.domain}.{action.service.service}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else if filtered.length === 0}
					<p class="picker-empty">
						No matches. Try a shorter query.
					</p>
				{:else}
					<ol class="picker-groups">
						{#each filtered as group (group.id)}
							<li class="picker-group">
								<header class="picker-group-head">
									{group.label}
									<span class="picker-group-count">{group.things.length}</span>
								</header>
								<ul class="picker-things">
									{#each group.things as thing (thing.entityId)}
										<li>
											<button
												type="button"
												class="picker-thing"
												onclick={() => selectThing(thing)}
											>
												<span class="picker-thing-name">{thing.name}</span>
												<span class="picker-thing-id mono">{thing.entityId}</span>
											</button>
										</li>
									{/each}
								</ul>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.composer-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.composer {
		width: min(720px, 100%);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--font-body);
		border: 1px solid var(--border, #2a261e);
		border-radius: 4px;
		overflow: hidden;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
	}

	.composer-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--border, #2a261e);
	}
	.composer-head h2 {
		margin: 0;
		font-family: var(--font-display, var(--font-body));
		font-style: italic;
		color: var(--accent);
		font-size: 1.3rem;
		font-weight: normal;
	}
	.composer-close {
		background: none;
		border: none;
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--fg-muted);
		cursor: pointer;
		padding: 0.2rem 0.5rem;
	}
	.composer-close:hover {
		color: var(--accent);
	}

	.composer-body {
		padding: 1rem;
		overflow-y: auto;
		flex: 1 1 auto;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0 0 0.75rem;
	}
	.field-label {
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.72rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.field-input {
		padding: 0.4rem 0.6rem;
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
	}
	.field-input.mono {
		font-family: var(--font-mono);
	}
	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.steps-section {
		margin-top: 1.25rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border, #2a261e);
	}
	.steps-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.steps-head strong {
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg);
	}
	.steps-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}

	.steps-empty {
		margin: 0.5rem 0 0.75rem;
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.steps-list {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.step-row {
		display: grid;
		grid-template-columns: 1.5rem 1fr auto auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
		background: var(--bg);
	}
	.step-num {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}
	.step-desc {
		font-size: 0.88rem;
		color: var(--fg);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.step-call {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--fg-muted);
	}
	.step-actions {
		display: flex;
		gap: 0.25rem;
	}

	.add-step-btn {
		width: 100%;
	}

	.composer-foot {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border, #2a261e);
	}

	/* Buttons */
	.mini {
		font-size: 0.75rem;
		padding: 0.2rem 0.4rem;
		font-family: var(--font-mono);
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 2px;
		cursor: pointer;
	}
	.mini:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.mini:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mini.danger:hover:not(:disabled) {
		border-color: var(--state-warn, #c08a4a);
		color: var(--state-warn, #c08a4a);
	}

	.action {
		font-size: 0.85rem;
		padding: 0.45rem 0.85rem;
		font-family: var(--font-body);
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
		cursor: pointer;
	}
	.action:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.action.confirm {
		background: var(--accent);
		color: var(--bg, #1a1814);
		border-color: var(--accent);
	}
	.action.confirm:hover {
		background: var(--accent);
		color: var(--bg, #1a1814);
		filter: brightness(1.08);
	}

	/* ── Picker overlay ──────────────────────────────────────────── */

	.picker-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 110;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.picker {
		width: min(560px, 100%);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--font-body);
		border: 1px solid var(--accent);
		border-radius: 4px;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
	}

	.picker-head {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--border, #2a261e);
	}
	.picker-head h3 {
		margin: 0;
		font-family: var(--font-display, var(--font-body));
		font-style: italic;
		color: var(--accent);
		font-size: 1rem;
		font-weight: normal;
		grid-column: 2;
	}
	.picker-back {
		background: none;
		border: none;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		cursor: pointer;
	}
	.picker-back:hover {
		color: var(--accent);
	}
	.picker-search {
		grid-column: 2;
		padding: 0.3rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
	}
	.picker-done {
		background: none;
		border: 1px solid var(--border, #2a261e);
		color: var(--fg);
		padding: 0.25rem 0.6rem;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		cursor: pointer;
	}
	.picker-done:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.picker-empty {
		margin: 1rem;
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.85rem;
	}

	.picker-groups {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		flex: 1 1 auto;
	}
	.picker-group {
		border-top: 1px solid var(--border, #2a261e);
	}
	.picker-group:first-child {
		border-top: none;
	}
	.picker-group-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.4rem 0.75rem;
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-muted);
		background: var(--bg);
	}
	.picker-group-count {
		font-family: var(--font-mono);
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}
	.picker-things {
		list-style: none;
		margin: 0;
		padding: 0 0 0.25rem;
	}
	.picker-thing {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		align-items: baseline;
		width: 100%;
		padding: 0.35rem 1rem;
		background: transparent;
		border: none;
		text-align: left;
		font: inherit;
		color: var(--fg);
		cursor: pointer;
	}
	.picker-thing:hover {
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}
	.picker-thing-name {
		font-size: 0.88rem;
		color: var(--fg);
	}
	.picker-thing-id {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--fg-muted);
	}

	.action-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem 0;
		overflow-y: auto;
		flex: 1 1 auto;
	}
	.action-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		align-items: baseline;
		width: 100%;
		padding: 0.6rem 1rem;
		background: transparent;
		border: none;
		border-top: 1px solid var(--border, #2a261e);
		text-align: left;
		font: inherit;
		color: var(--fg);
		cursor: pointer;
	}
	.action-row:first-child {
		border-top: none;
	}
	.action-row:hover {
		background: var(--accent-glow, rgba(192, 138, 74, 0.08));
	}
	.action-label {
		font-size: 0.95rem;
		color: var(--fg);
	}
	.action-call {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
	}

	.mono {
		font-family: var(--font-mono);
	}
</style>
