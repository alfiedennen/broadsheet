<script lang="ts">
	/**
	 * 0.9.1 — things-first editor: RIGHT pane (above the live preview).
	 *
	 * The canvas: an ordered list of blocks the user has placed on this
	 * page. Three block types dominate the things-first surface:
	 *   - `thing`  — one HA entity, widget auto-picked
	 *   - `macro`  — composed action tile (opens MacroComposer to edit)
	 *   - `outline`— section divider with caps label
	 *
	 * Other block types (sparkline, action-grid, entity-list, etc.) are
	 * still rendered (so a page imported from Lovelace, or edited in
	 * advanced mode then re-opened things-first, stays editable) — but
	 * we surface them with a "switch to advanced editor" hint rather
	 * than reproducing the entire advanced editor here.
	 *
	 * Affordances:
	 *   - Tap a row to expand the inline editor (label / widget / icon).
	 *   - Grip handle to drag-reorder.
	 *   - Drop a thing from the browser → insert at the drop position.
	 *   - "+ Section divider" / "+ Macro" buttons at the bottom.
	 *
	 * The parent owns persistence — this component is a controlled
	 * view + callbacks. No store reads, no debounced writes.
	 *
	 * Spec: docs/plans/plan-9.1-wall-builder-things-first.md.
	 */

	import { discovery } from '$lib/discovery';
	import type {
		BlockDef,
		ThingBlockConfig,
		MacroBlockConfig,
		OutlineBlockConfig,
		ThingWidget
	} from '$lib/blocks/types';
	import { resolveWidget, WIDGET_LABELS } from '$lib/blocks/thing-mapping';

	interface Props {
		/** The current ordered list of blocks on this page. */
		blocks: BlockDef[];
		/** Append one or more blocks to the end. */
		onAppendBlocks: (blocks: BlockDef[]) => void;
		/**
		 * Insert one or more blocks at a specific index (0 = top,
		 * blocks.length = end). Multi-block insertion is atomic — one
		 * setCustomPageBlocks call regardless of how many blocks land.
		 */
		onInsertBlocks: (index: number, blocks: BlockDef[]) => void;
		/** Remove the block at this index. */
		onRemoveBlock: (index: number) => void;
		/** Move a block from one index to another. */
		onMoveBlock: (from: number, to: number) => void;
		/** Patch a block's config in place. */
		onPatchBlock: (index: number, patch: Record<string, unknown>) => void;
		/**
		 * Called when the user taps "Compose macro" on a row, or
		 * the "+ Macro" footer button. The parent opens MacroComposer
		 * with either the existing macro (edit mode) or null (new).
		 */
		onComposeMacro: (existingIndex: number | null) => void;
	}

	let {
		blocks,
		onAppendBlocks,
		onInsertBlocks,
		onRemoveBlock,
		onMoveBlock,
		onPatchBlock,
		onComposeMacro
	}: Props = $props();

	let expandedIdx = $state<number | null>(null);

	function toggleExpanded(i: number) {
		expandedIdx = expandedIdx === i ? null : i;
	}

	function remove(i: number) {
		if (expandedIdx === i) expandedIdx = null;
		else if (expandedIdx !== null && expandedIdx > i) expandedIdx--;
		onRemoveBlock(i);
	}

	function move(i: number, delta: -1 | 1) {
		const to = i + delta;
		if (to < 0 || to >= blocks.length) return;
		// Keep the expanded row visible after the move.
		if (expandedIdx === i) expandedIdx = to;
		onMoveBlock(i, to);
	}

	/* ── Browser-drop wiring ───────────────────────────────────────
	 * The drop targets are the seam-zones between blocks (and one
	 * trailing seam after the last block). Each seam is a thin band;
	 * the user drops a recipe on a seam to insert its blocks at that
	 * position.
	 *
	 * A recipe drop carries:
	 *   - `application/x-broadsheet-recipe` — full JSON payload (use this)
	 *   - `application/x-broadsheet-recipe-id` — recipe id (informational)
	 *   - `text/plain` — first entity_id (fallback for legacy single-thing drops)
	 *
	 * Visual feedback: the active seam picks up a dashed accent
	 * border while a recipe is over it.
	 */
	let dragOverSeam = $state<number | null>(null);

	function readRecipeBlocksFromDataTransfer(dt: DataTransfer | null): BlockDef[] | null {
		if (!dt) return null;
		// Preferred: full recipe JSON.
		const json = dt.getData('application/x-broadsheet-recipe');
		if (json) {
			try {
				const recipe = JSON.parse(json) as { blocks: BlockDef[] };
				if (Array.isArray(recipe.blocks) && recipe.blocks.length > 0) {
					return recipe.blocks;
				}
			} catch {
				// fall through to legacy path
			}
		}
		// Legacy fallback: plain entity_id (drag from an older browser).
		const id = dt.getData('text/plain');
		if (/^[a-z_]+\.[a-z0-9_]+$/.test(id)) {
			return [{ type: 'thing', config: { entityId: id, widget: 'auto' } }];
		}
		return null;
	}

	function isRecipeDrag(dt: DataTransfer | null): boolean {
		if (!dt) return false;
		return (
			dt.types.includes('application/x-broadsheet-recipe') ||
			dt.types.includes('application/x-broadsheet-recipe-id') ||
			// Legacy 0.9.1 entity drag — still recognise it.
			dt.types.includes('application/x-broadsheet-entity')
		);
	}

	function handleSeamDragOver(e: DragEvent, seamIdx: number) {
		if (!isRecipeDrag(e.dataTransfer)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		dragOverSeam = seamIdx;
	}

	function handleSeamDragLeave() {
		// Sibling dragover overwrites; if the cursor exits the canvas
		// entirely, the dragend on the source clears state.
	}

	function handleSeamDrop(e: DragEvent, seamIdx: number) {
		const recipeBlocks = readRecipeBlocksFromDataTransfer(e.dataTransfer);
		dragOverSeam = null;
		if (!recipeBlocks) return;
		e.preventDefault();
		onInsertBlocks(seamIdx, recipeBlocks);
	}

	/* ── Block-row drag-to-reorder ────────────────────────────────
	 * Header is the drag handle. Whole row is the drop target. Drops
	 * are intra-canvas only — entity drops from the browser route
	 * through the seam handlers above.
	 */
	let draggedRow = $state<number | null>(null);
	let dragOverRow = $state<number | null>(null);

	function handleRowDragStart(e: DragEvent, idx: number) {
		draggedRow = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('application/x-broadsheet-block-idx', String(idx));
			e.dataTransfer.setData('text/plain', String(idx));
		}
	}

	function handleRowDragOver(e: DragEvent, idx: number) {
		// Only handle row-reorder drags; entity drops go to the seams.
		const isEntity = isRecipeDrag(e.dataTransfer);
		if (isEntity) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (draggedRow !== null && draggedRow !== idx) dragOverRow = idx;
	}

	function handleRowDrop(e: DragEvent, idx: number) {
		const isEntity = isRecipeDrag(e.dataTransfer);
		if (isEntity) return; // seam handler owns this
		const from = draggedRow;
		draggedRow = null;
		dragOverRow = null;
		if (from === null || from === idx) return;
		e.preventDefault();
		onMoveBlock(from, idx);
		if (expandedIdx === from) expandedIdx = idx;
	}

	function handleRowDragEnd() {
		draggedRow = null;
		dragOverRow = null;
	}

	/* ── Per-block summary text ───────────────────────────────────── */

	function summary(block: BlockDef): string {
		switch (block.type) {
			case 'thing': {
				const ent = discovery.byEntityId(block.config.entityId);
				const name = block.config.label ?? ent?.name ?? block.config.entityId;
				const widget = resolveWidget(
					block.config.widget,
					block.config.entityId,
					ent?.state ?? null
				);
				return `${name} — ${widget}`;
			}
			case 'macro': {
				const n = block.config.steps.length;
				return `${block.config.label} — ${n} step${n === 1 ? '' : 's'}`;
			}
			case 'outline':
				return block.config.label;
			case 'hero':
				return block.config.headline;
			case 'markdown':
				return block.config.body.slice(0, 60) + (block.config.body.length > 60 ? '…' : '');
			case 'explainer':
				return block.config.body.slice(0, 60) + (block.config.body.length > 60 ? '…' : '');
			case 'macro-grid':
				return 'House macros (lights off / boost / TVs off)';
			case 'room-toggle-grid':
				return 'Room toggle grid';
			case 'scene-row':
				return `Scene row (max ${block.config.maxScenes ?? 8})`;
			case 'boost-row':
				return `Boost row (→ ${block.config.temperature ?? 21}°)`;
			case 'entity-list':
				return `Entity list (${block.config.entities.length} entities)`;
			case 'action-grid':
				return `Action grid (${block.config.actions.length} actions)`;
			case 'sparkline':
				return `Sparkline — ${block.config.entityId || '(no entity)'}`;
		}
	}

	function blockTypeLabel(block: BlockDef): string {
		const labels: Record<BlockDef['type'], string> = {
			thing: 'Thing',
			macro: 'Macro',
			outline: 'Section',
			hero: 'Hero',
			markdown: 'Markdown',
			explainer: 'Explainer',
			'macro-grid': 'Macro grid',
			'room-toggle-grid': 'Room toggles',
			'scene-row': 'Scene row',
			'boost-row': 'Boost row',
			'entity-list': 'Entity list',
			'action-grid': 'Action grid',
			sparkline: 'Sparkline'
		};
		return labels[block.type];
	}

	function isThingsFirstNative(t: BlockDef['type']): boolean {
		// Block types the things-first editor has inline editors for.
		// Others get a "switch to advanced to edit" hint.
		return t === 'thing' || t === 'macro' || t === 'outline';
	}

	/* ── Footer "add" actions ──────────────────────────────────────── */

	function addSectionDivider() {
		onAppendBlocks([{ type: 'outline', config: { label: 'Section' } }]);
		expandedIdx = blocks.length; // new block index after append
	}

	function addMacro() {
		// Macros are composed via the modal — opening with null index
		// signals "new macro" mode. The parent appends on save.
		onComposeMacro(null);
	}
</script>

<section class="things-canvas" aria-label="Page canvas">
	<header class="canvas-head">
		<strong class="canvas-title">Canvas</strong>
		<span class="canvas-count">
			{blocks.length} block{blocks.length === 1 ? '' : 's'}
		</span>
	</header>

	{#if blocks.length === 0}
		<div
			class="canvas-empty"
			class:drop-target={dragOverSeam === 0}
			ondragover={(e) => handleSeamDragOver(e, 0)}
			ondragleave={handleSeamDragLeave}
			ondrop={(e) => handleSeamDrop(e, 0)}
			role="region"
		>
			<p>
				Empty canvas — <em>tap a thing</em> in the browser to add it,
				or <em>drag</em> one here.
			</p>
			<p class="canvas-empty-fine">
				Add a <button type="button" class="link-button" onclick={addSectionDivider}>section
				divider</button> or
				<button type="button" class="link-button" onclick={addMacro}>compose a macro</button>
				to start organising.
			</p>
		</div>
	{:else}
		<ol class="canvas-list">
			<!-- Top seam — drop here to insert at the top -->
			<li
				class="seam top"
				class:drop-target={dragOverSeam === 0}
				ondragover={(e) => handleSeamDragOver(e, 0)}
				ondragleave={handleSeamDragLeave}
				ondrop={(e) => handleSeamDrop(e, 0)}
				aria-hidden="true"
			></li>

			{#each blocks as block, i (i)}
				<li
					class="canvas-row"
					class:expanded={expandedIdx === i}
					class:dragging={draggedRow === i}
					class:drop-target={dragOverRow === i && draggedRow !== null && draggedRow !== i}
					ondragover={(e) => handleRowDragOver(e, i)}
					ondrop={(e) => handleRowDrop(e, i)}
				>
					<header
						class="row-head"
						role="group"
						aria-label="Block {i + 1} header (drag to reorder)"
						draggable="true"
						ondragstart={(e) => handleRowDragStart(e, i)}
						ondragend={handleRowDragEnd}
					>
						<span class="row-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
						<button class="row-title" type="button" onclick={() => toggleExpanded(i)}>
							<span class="row-num">{String(i + 1).padStart(2, '0')}</span>
							<span class="row-type">{blockTypeLabel(block)}</span>
							<span class="row-summary">{summary(block)}</span>
						</button>
						<div class="row-actions">
							<button
								type="button"
								class="mini"
								disabled={i === 0}
								onclick={() => move(i, -1)}
								aria-label="Move up">↑</button
							>
							<button
								type="button"
								class="mini"
								disabled={i === blocks.length - 1}
								onclick={() => move(i, 1)}
								aria-label="Move down">↓</button
							>
							<button
								type="button"
								class="mini danger"
								onclick={() => remove(i)}>✕</button
							>
						</div>
					</header>

					{#if expandedIdx === i}
						<div class="row-editor">
							{#if block.type === 'thing'}
								{@const cfg = block.config as ThingBlockConfig}
								{@const ent = discovery.byEntityId(cfg.entityId)}
								<div class="thing-editor">
									<dl class="thing-readout">
										<dt>Entity</dt>
										<dd class="mono">{cfg.entityId}</dd>
										{#if ent}
											<dt>From HA</dt>
											<dd>
												{ent.name}
												{#if ent.state?.state !== undefined}
													<span class="muted">— state {ent.state.state}</span>
												{/if}
											</dd>
										{:else}
											<dt>Status</dt>
											<dd class="muted">
												Entity not visible to broadsheet (hidden in /settings/house, or
												HA hasn't surfaced it yet).
											</dd>
										{/if}
									</dl>
									<label class="field">
										<span class="field-label">Label override</span>
										<input
											type="text"
											class="field-input"
											value={cfg.label ?? ''}
											placeholder={ent?.name ?? '(uses HA friendly_name)'}
											oninput={(e) =>
												onPatchBlock(i, {
													label: (e.target as HTMLInputElement).value || null
												})}
										/>
									</label>
									<label class="field">
										<span class="field-label">Icon override (mdi:*)</span>
										<input
											type="text"
											class="field-input mono"
											value={cfg.icon ?? ''}
											placeholder={ent?.icon ?? '(uses HA icon)'}
											oninput={(e) =>
												onPatchBlock(i, {
													icon: (e.target as HTMLInputElement).value || null
												})}
										/>
									</label>
									<label class="field">
										<span class="field-label">Widget</span>
										<select
											class="field-input"
											value={cfg.widget ?? 'auto'}
											onchange={(e) =>
												onPatchBlock(i, {
													widget: (e.target as HTMLSelectElement).value as ThingWidget
												})}
										>
											{#each WIDGET_LABELS as opt (opt.value)}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</select>
										<span class="field-hint">
											"Auto" picks the right widget from the entity's domain.
											Override only if you want something unusual.
										</span>
									</label>
								</div>
							{:else if block.type === 'macro'}
								{@const cfg = block.config as MacroBlockConfig}
								<div class="macro-editor">
									<dl class="macro-readout">
										<dt>Label</dt>
										<dd>{cfg.label}</dd>
										<dt>Steps</dt>
										<dd>
											{#if cfg.steps.length === 0}
												<span class="muted">no steps yet</span>
											{:else}
												<ol class="macro-steps">
													{#each cfg.steps as s, si (si)}
														<li>{s.description}</li>
													{/each}
												</ol>
											{/if}
										</dd>
									</dl>
									<button
										class="action"
										type="button"
										onclick={() => onComposeMacro(i)}
									>
										Edit macro…
									</button>
								</div>
							{:else if block.type === 'outline'}
								{@const cfg = block.config as OutlineBlockConfig}
								<label class="field">
									<span class="field-label">Section label</span>
									<input
										type="text"
										class="field-input"
										value={cfg.label}
										oninput={(e) =>
											onPatchBlock(i, {
												label: (e.target as HTMLInputElement).value
											})}
									/>
								</label>
							{:else if !isThingsFirstNative(block.type)}
								<p class="non-native-hint">
									This block type — <strong>{blockTypeLabel(block)}</strong>
									— is fully editable in the
									<em>advanced</em> editor. Flip the editor mode toggle in
									the page meta to switch. Things-first will still render it
									correctly in the preview below.
								</p>
							{/if}
						</div>
					{/if}
				</li>

				<!-- Seam BELOW each row — drop here to insert after row i -->
				<li
					class="seam"
					class:drop-target={dragOverSeam === i + 1}
					ondragover={(e) => handleSeamDragOver(e, i + 1)}
					ondragleave={handleSeamDragLeave}
					ondrop={(e) => handleSeamDrop(e, i + 1)}
					aria-hidden="true"
				></li>
			{/each}
		</ol>
	{/if}

	<footer class="canvas-foot">
		<button type="button" class="action" onclick={addSectionDivider}>
			+ Section divider
		</button>
		<button type="button" class="action" onclick={addMacro}>
			+ Macro
		</button>
		<span class="canvas-foot-hint">
			Add a thing from the browser on the left — tap or drag.
		</span>
	</footer>
</section>

<style>
	.things-canvas {
		display: flex;
		flex-direction: column;
		min-height: 0;
		font-family: var(--font-body);
		color: var(--fg);
		background: var(--bg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 4px;
		overflow: hidden;
	}

	.canvas-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.75rem 1rem 0.5rem;
		border-bottom: 1px solid var(--border, #2a261e);
	}
	.canvas-title {
		font-family: var(--font-display, var(--font-body));
		font-style: italic;
		color: var(--accent);
		font-size: 1.05rem;
	}
	.canvas-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}

	.canvas-empty {
		padding: 2rem 1rem;
		text-align: center;
		color: var(--fg-muted);
		font-style: italic;
		border: 1px dashed transparent;
		margin: 0.5rem;
		border-radius: 4px;
		transition: border-color 0.12s ease;
	}
	.canvas-empty.drop-target {
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
	}
	.canvas-empty p {
		margin: 0.25rem 0;
	}
	.canvas-empty-fine {
		font-size: 0.85rem;
	}

	.link-button {
		background: none;
		border: none;
		padding: 0;
		color: var(--accent);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.canvas-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem 0;
		overflow-y: auto;
		flex: 1 1 auto;
	}

	.seam {
		height: 6px;
		margin: 0 0.5rem;
		border-radius: 3px;
		border: 1px dashed transparent;
		transition: all 0.12s ease;
	}
	.seam.drop-target {
		height: 24px;
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.1));
	}

	.canvas-row {
		margin: 0 0.5rem;
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
		background: var(--bg);
		transition: border-color 0.12s ease;
	}
	.canvas-row.expanded {
		border-color: var(--accent);
	}
	.canvas-row.dragging {
		opacity: 0.4;
	}
	.canvas-row.drop-target {
		border-style: dashed;
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
	}

	.row-head {
		display: grid;
		grid-template-columns: 1.5rem 1fr auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		cursor: grab;
	}
	.row-head:active {
		cursor: grabbing;
	}

	.row-grip {
		font-family: var(--font-mono);
		color: var(--fg-muted);
		text-align: center;
	}

	.row-title {
		display: grid;
		grid-template-columns: 2.25rem 5.5rem 1fr;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0;
		background: transparent;
		border: none;
		text-align: left;
		font: inherit;
		color: var(--fg);
		cursor: pointer;
		min-width: 0;
	}
	.row-num {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--fg-muted);
		font-feature-settings: 'tnum';
	}
	.row-type {
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.75rem;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.row-summary {
		font-size: 0.85rem;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.row-actions {
		display: flex;
		gap: 0.25rem;
	}

	.row-editor {
		padding: 0.5rem 0.75rem 0.75rem;
		border-top: 1px dashed var(--border, #2a261e);
	}

	/* Per-type editor blocks */

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0.5rem 0;
	}
	.field-label {
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.7rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.field-input {
		padding: 0.35rem 0.5rem;
		font-family: var(--font-body);
		font-size: 0.88rem;
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
	.field-hint {
		font-size: 0.75rem;
		font-style: italic;
		color: var(--fg-muted);
	}

	.thing-readout,
	.macro-readout {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		gap: 0.25rem 0.75rem;
		margin: 0 0 0.5rem;
		font-size: 0.82rem;
	}
	.thing-readout dt,
	.macro-readout dt {
		font-family: var(--font-caption, var(--font-body));
		font-size: 0.7rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.thing-readout dd,
	.macro-readout dd {
		margin: 0;
		color: var(--fg);
		min-width: 0;
	}
	.thing-readout dd.mono {
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	.macro-steps {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
	}

	.muted {
		color: var(--fg-muted);
		font-style: italic;
	}

	.non-native-hint {
		font-size: 0.85rem;
		color: var(--fg-muted);
		font-style: italic;
		line-height: 1.5;
	}

	.canvas-foot {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid var(--border, #2a261e);
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	.canvas-foot-hint {
		font-style: italic;
		flex: 1 1 auto;
		text-align: right;
	}

	/* Mini + action button parity with the existing settings page */
	:global(.things-canvas .mini) {
		font-size: 0.75rem;
		padding: 0.25rem 0.45rem;
		font-family: var(--font-mono);
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 2px;
		cursor: pointer;
	}
	:global(.things-canvas .mini:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}
	:global(.things-canvas .mini:hover:not(:disabled)) {
		border-color: var(--accent);
		color: var(--accent);
	}
	:global(.things-canvas .mini.danger:hover:not(:disabled)) {
		border-color: var(--state-warn, #c08a4a);
		color: var(--state-warn, #c08a4a);
	}
	:global(.things-canvas .action) {
		font-size: 0.82rem;
		padding: 0.4rem 0.75rem;
		font-family: var(--font-body);
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--border, #2a261e);
		border-radius: 3px;
		cursor: pointer;
	}
	:global(.things-canvas .action:hover) {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
