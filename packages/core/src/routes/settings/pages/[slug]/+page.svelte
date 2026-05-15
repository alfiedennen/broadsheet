<script lang="ts">
	/**
	 * /settings/pages/[slug] — the per-page block editor.
	 *
	 * Two columns on wide viewports, stacked on narrow:
	 *   Left  — block list with up / down / delete + the per-block
	 *           config editor opens inline when a block is clicked
	 *   Right — preview pane (live RenderedPage rendering the current
	 *           block list, so authors see edits as they make them)
	 *
	 * Each block type has its own small editor — a switch on
	 * block.type dispatches to the right one. Editors write through
	 * setCustomPageBlocks via a debounced effect so typing in a text
	 * field doesn't fire a curation save on every keystroke.
	 */

	import { page as pageState } from '$app/state';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		curationStore,
		setCustomPageBlocks,
		updateCustomPage,
		deleteCustomPage
	} from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { ALL_BLOCK_TYPES, BLOCK_META } from '$lib/blocks/registry';
	import { defaultBlockConfig, type BlockDef, type BlockType } from '$lib/blocks/types';
	import RenderedPage from '$lib/blocks/RenderedPage.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const slug = $derived(pageState.params.slug ?? '');
	const customPage = $derived(
		curationStore.current.customPages?.find((p) => p.slug === slug) ?? null
	);

	let expandedIdx = $state<number | null>(null);
	let addingBlock = $state(false);

	function toggleExpanded(i: number) {
		expandedIdx = expandedIdx === i ? null : i;
	}

	async function addBlock(type: BlockType) {
		if (!customPage) return;
		const next = [...customPage.blocks, defaultBlockConfig(type)];
		const ok = await setCustomPageBlocks(slug, next);
		if (ok) {
			expandedIdx = next.length - 1;
			addingBlock = false;
			showToast(`Added ${BLOCK_META[type].label}`, 'success');
		}
	}

	async function removeBlock(i: number) {
		if (!customPage) return;
		const next = customPage.blocks.filter((_, idx) => idx !== i);
		const ok = await setCustomPageBlocks(slug, next);
		if (ok) {
			if (expandedIdx === i) expandedIdx = null;
			else if (expandedIdx !== null && expandedIdx > i) expandedIdx--;
		}
	}

	async function moveBlock(i: number, delta: -1 | 1) {
		if (!customPage) return;
		const target = i + delta;
		if (target < 0 || target >= customPage.blocks.length) return;
		const next = customPage.blocks.slice();
		const [b] = next.splice(i, 1);
		next.splice(target, 0, b);
		const ok = await setCustomPageBlocks(slug, next);
		if (ok && expandedIdx === i) expandedIdx = target;
	}

	/**
	 * Patch a block's config in place. Debounced via a short timer so
	 * typing in a text field doesn't fire a curation save on every
	 * keystroke. Keep the in-memory page reactive immediately — the
	 * preview pane shows changes synchronously.
	 */
	let pendingTimer: ReturnType<typeof setTimeout> | null = null;
	async function patchBlockConfig(i: number, patch: Record<string, unknown>) {
		if (!customPage) return;
		const next = customPage.blocks.slice() as BlockDef[];
		const target = next[i];
		next[i] = { ...target, config: { ...target.config, ...patch } } as BlockDef;
		// Optimistic in-memory write (RenderedPage preview updates)
		const cur = curationStore.current.customPages ?? [];
		const pageIdx = cur.findIndex((p) => p.slug === slug);
		if (pageIdx >= 0) {
			const arr = [...cur];
			arr[pageIdx] = { ...arr[pageIdx], blocks: next };
			curationStore.current = { ...curationStore.current, customPages: arr };
			curationStore.tick++;
		}
		// Debounced persistence
		if (pendingTimer) clearTimeout(pendingTimer);
		pendingTimer = setTimeout(() => {
			setCustomPageBlocks(slug, next);
			pendingTimer = null;
		}, 400);
	}

	/* ─────────────── page meta editing ─────────────── */
	async function updateMeta(patch: Record<string, unknown>) {
		await updateCustomPage(slug, patch);
	}

	async function deleteThisPage() {
		const ok = await deleteCustomPage(slug);
		if (ok) {
			showToast('Page deleted', 'success');
			goto(`${base}/settings/pages/`);
		}
	}

	let pendingDelete = $state(false);
</script>

<svelte:head>
	<title>
		{customPage ? `${customPage.label} · Edit` : 'Not found'} · Settings · broadsheet
	</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · Pages · Edit" />
		{/snippet}
		{#snippet headline()}
			{customPage?.label ?? 'Page not found'}
		{/snippet}
		{#snippet dek()}
			{#if customPage}
				URL: <code>/{customPage.slug}/</code> · {customPage.blocks.length} block{customPage
					.blocks.length === 1
					? ''
					: 's'}
				· <a href="{base}/{customPage.slug}/" target="_blank" rel="noopener">View live</a>
			{:else}
				No page with slug <code>{slug}</code>. Maybe deleted, or the URL is wrong.
				<a href="{base}/settings/pages/">Back to pages</a>.
			{/if}
		{/snippet}
	</Hero>

	{#if customPage}
		<div class="editor-grid">
			<!-- LEFT: meta + block list editor -->
			<section class="editor-pane">
				<OutLine label="Page meta" />
				<div class="meta-grid">
					<label class="field">
						<span class="field-label">Label</span>
						<input
							type="text"
							class="field-input"
							value={customPage.label}
							oninput={(e) =>
								updateMeta({ label: (e.target as HTMLInputElement).value })}
						/>
					</label>
					<label class="field">
						<span class="field-label">Icon (mdi:*)</span>
						<input
							type="text"
							class="field-input mono"
							value={customPage.icon ?? ''}
							placeholder="mdi:home"
							oninput={(e) =>
								updateMeta({ icon: (e.target as HTMLInputElement).value || null })}
						/>
					</label>
					<label class="field">
						<span class="field-label">Width</span>
						<select
							class="field-input"
							value={customPage.pageWidth ?? 'default'}
							onchange={(e) =>
								updateMeta({
									pageWidth: (e.target as HTMLSelectElement).value as
										| 'narrow'
										| 'default'
										| 'wide'
								})}
						>
							<option value="narrow">Narrow</option>
							<option value="default">Default</option>
							<option value="wide">Wide</option>
						</select>
					</label>
					<label class="field checkbox-field">
						<input
							type="checkbox"
							checked={!!customPage.hiddenFromNav}
							onchange={(e) =>
								updateMeta({ hiddenFromNav: (e.target as HTMLInputElement).checked })}
						/>
						<span class="field-label">Hide from nav (route stays live)</span>
					</label>
				</div>

				<OutLine label="Blocks" />
				<ol class="block-list">
					{#each customPage.blocks as block, i (i)}
						<li class="block-row" class:expanded={expandedIdx === i}>
							<header class="block-head">
								<button
									type="button"
									class="block-title"
									onclick={() => toggleExpanded(i)}
								>
									<span class="block-num">{String(i + 1).padStart(2, '0')}</span>
									<span class="block-type">{BLOCK_META[block.type].label}</span>
									<span class="block-summary">{summarise(block)}</span>
								</button>
								<div class="block-actions">
									<button
										type="button"
										class="mini"
										disabled={i === 0}
										onclick={() => moveBlock(i, -1)}
										aria-label="Move up"
									>
										↑
									</button>
									<button
										type="button"
										class="mini"
										disabled={i === customPage.blocks.length - 1}
										onclick={() => moveBlock(i, 1)}
										aria-label="Move down"
									>
										↓
									</button>
									<button
										type="button"
										class="mini danger"
										onclick={() => removeBlock(i)}
									>
										Remove
									</button>
								</div>
							</header>
							{#if expandedIdx === i}
								<div class="block-editor">
									{@render blockEditor(block, i)}
								</div>
							{/if}
						</li>
					{/each}
				</ol>

				<div class="add-block">
					{#if addingBlock}
						<div class="add-block-list">
							<header class="add-block-header">
								<strong>Pick a block</strong>
								<button
									type="button"
									class="mini"
									onclick={() => (addingBlock = false)}
								>
									Cancel
								</button>
							</header>
							{#each ALL_BLOCK_TYPES as t (t)}
								<button class="add-block-row" type="button" onclick={() => addBlock(t)}>
									<span class="add-block-label">{BLOCK_META[t].label}</span>
									<span class="add-block-desc">{BLOCK_META[t].description}</span>
								</button>
							{/each}
						</div>
					{:else}
						<button
							type="button"
							class="add-block-trigger"
							onclick={() => (addingBlock = true)}
						>
							+ Add block
						</button>
					{/if}
				</div>

				<OutLine label="Danger zone" />
				<div class="danger-zone">
					{#if pendingDelete}
						<p class="danger-confirm">
							Delete <strong>{customPage.label}</strong>?
							This removes the route — links to <code>/{customPage.slug}/</code> will 404.
						</p>
						<div class="actions">
							<button class="action danger" type="button" onclick={deleteThisPage}>
								Delete page
							</button>
							<button class="action" type="button" onclick={() => (pendingDelete = false)}>
								Cancel
							</button>
						</div>
					{:else}
						<button
							class="action danger"
							type="button"
							onclick={() => (pendingDelete = true)}
						>
							Delete page…
						</button>
					{/if}
				</div>
			</section>

			<!-- RIGHT: live preview -->
			<aside class="preview-pane">
				<header class="preview-head">
					<span class="preview-label">Preview</span>
					<a href="{base}/{customPage.slug}/" target="_blank" rel="noopener" class="mini">
						Open live
					</a>
				</header>
				<div class="preview-frame">
					<RenderedPage blocks={customPage.blocks} />
				</div>
			</aside>
		</div>
	{/if}
</PageShell>

<!--
	Per-block-type editor. Each branch is a small form bound to the
	block's config; patchBlockConfig debounces persistence to ~400ms
	so typing doesn't hammer the sidecar.
-->
{#snippet blockEditor(block: BlockDef, i: number)}
	{#if block.type === 'hero'}
		<label class="field">
			<span class="field-label">Eyebrow</span>
			<input
				type="text"
				class="field-input"
				value={block.config.eyebrow ?? ''}
				oninput={(e) =>
					patchBlockConfig(i, {
						eyebrow: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Number (in eyebrow)</span>
			<input
				type="number"
				class="field-input mono"
				value={block.config.number ?? ''}
				placeholder="e.g. 7"
				oninput={(e) => {
					const v = (e.target as HTMLInputElement).value;
					patchBlockConfig(i, { number: v ? Number(v) : null });
				}}
			/>
		</label>
		<label class="field">
			<span class="field-label">Headline</span>
			<input
				type="text"
				class="field-input"
				value={block.config.headline}
				oninput={(e) =>
					patchBlockConfig(i, { headline: (e.target as HTMLInputElement).value })}
			/>
		</label>
		<label class="field">
			<span class="field-label">Dek (sub-headline)</span>
			<input
				type="text"
				class="field-input"
				value={block.config.dek ?? ''}
				oninput={(e) =>
					patchBlockConfig(i, {
						dek: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Size</span>
			<select
				class="field-input"
				value={block.config.size ?? 'md'}
				onchange={(e) =>
					patchBlockConfig(i, {
						size: (e.target as HTMLSelectElement).value as 'md' | 'lg' | 'xl'
					})}
			>
				<option value="md">Medium</option>
				<option value="lg">Large</option>
				<option value="xl">Extra large</option>
			</select>
		</label>
	{:else if block.type === 'markdown'}
		<label class="field">
			<span class="field-label">Body (markdown + <code>{`{{entity_id}}`}</code>)</span>
			<textarea
				class="field-input textarea"
				rows="6"
				value={block.config.body}
				oninput={(e) =>
					patchBlockConfig(i, { body: (e.target as HTMLTextAreaElement).value })}
			></textarea>
			<span class="field-hint">
				Supports **bold**, *italic*, `code`, [link](/path). Use
				<code>{`{{entity_id}}`}</code>
				to interpolate live state — e.g. <code>{`{{weather.forecast_home}}`}</code>.
			</span>
		</label>
	{:else if block.type === 'explainer'}
		<label class="field">
			<span class="field-label">Body (italic-muted footer)</span>
			<textarea
				class="field-input textarea"
				rows="3"
				value={block.config.body}
				oninput={(e) =>
					patchBlockConfig(i, { body: (e.target as HTMLTextAreaElement).value })}
			></textarea>
			<span class="field-hint">
				Cross-page links work the same as Markdown blocks. Renders as a single
				short italic paragraph.
			</span>
		</label>
	{:else if block.type === 'outline'}
		<label class="field">
			<span class="field-label">Label</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label}
				oninput={(e) =>
					patchBlockConfig(i, { label: (e.target as HTMLInputElement).value })}
			/>
		</label>
	{:else if block.type === 'macro-grid' || block.type === 'room-toggle-grid'}
		<label class="field">
			<span class="field-label">Inline section label (optional)</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label ?? ''}
				placeholder="Leave blank to skip the header"
				oninput={(e) =>
					patchBlockConfig(i, {
						label: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
	{:else if block.type === 'scene-row'}
		<label class="field">
			<span class="field-label">Inline label</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label ?? ''}
				oninput={(e) =>
					patchBlockConfig(i, {
						label: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Max scenes shown</span>
			<input
				type="number"
				class="field-input mono"
				value={block.config.maxScenes ?? 8}
				min="1"
				max="50"
				oninput={(e) =>
					patchBlockConfig(i, {
						maxScenes: Number((e.target as HTMLInputElement).value) || 8
					})}
			/>
		</label>
	{:else if block.type === 'boost-row'}
		<label class="field">
			<span class="field-label">Inline label</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label ?? ''}
				oninput={(e) =>
					patchBlockConfig(i, {
						label: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Target temperature (°C)</span>
			<input
				type="number"
				class="field-input mono"
				value={block.config.temperature ?? 21}
				min="5"
				max="30"
				step="0.5"
				oninput={(e) =>
					patchBlockConfig(i, {
						temperature: Number((e.target as HTMLInputElement).value) || 21
					})}
			/>
		</label>
	{:else if block.type === 'entity-list'}
		<label class="field">
			<span class="field-label">Inline label</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label ?? ''}
				oninput={(e) =>
					patchBlockConfig(i, {
						label: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Entities (one per line)</span>
			<textarea
				class="field-input textarea"
				rows="6"
				value={block.config.entities.join('\n')}
				oninput={(e) =>
					patchBlockConfig(i, {
						entities: (e.target as HTMLTextAreaElement).value
							.split('\n')
							.map((s) => s.trim())
							.filter(Boolean)
					})}
			></textarea>
			<span class="field-hint">
				One <code>domain.entity_id</code> per line.
				e.g. <code>sensor.hallway_temperature</code>.
			</span>
		</label>
		<label class="field checkbox-field">
			<input
				type="checkbox"
				checked={block.config.showIcon !== false}
				onchange={(e) =>
					patchBlockConfig(i, { showIcon: (e.target as HTMLInputElement).checked })}
			/>
			<span class="field-label">Show icon column</span>
		</label>
	{:else if block.type === 'sparkline'}
		<label class="field">
			<span class="field-label">Entity ID</span>
			<input
				type="text"
				class="field-input mono"
				value={block.config.entityId}
				placeholder="sensor.electricity_consumption"
				oninput={(e) =>
					patchBlockConfig(i, { entityId: (e.target as HTMLInputElement).value })}
			/>
			<span class="field-hint">
				Must be a sensor with a numeric state. History pulled from HA's
				<code>history/history_during_period</code> on render.
			</span>
		</label>
		<label class="field">
			<span class="field-label">Inline label</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label ?? ''}
				placeholder="Optional"
				oninput={(e) =>
					patchBlockConfig(i, {
						label: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Hours of history</span>
			<input
				type="number"
				class="field-input mono"
				min="1"
				max="168"
				value={block.config.hours ?? 24}
				oninput={(e) =>
					patchBlockConfig(i, {
						hours: Number((e.target as HTMLInputElement).value) || 24
					})}
			/>
			<span class="field-hint">
				1–168 hours (1 week). Larger windows take longer to fetch.
			</span>
		</label>
	{:else if block.type === 'action-grid'}
		<label class="field">
			<span class="field-label">Inline label</span>
			<input
				type="text"
				class="field-input"
				value={block.config.label ?? ''}
				oninput={(e) =>
					patchBlockConfig(i, {
						label: (e.target as HTMLInputElement).value || null
					})}
			/>
		</label>
		<label class="field">
			<span class="field-label">Tile size</span>
			<select
				class="field-input"
				value={block.config.size ?? 'medium'}
				onchange={(e) =>
					patchBlockConfig(i, {
						size: (e.target as HTMLSelectElement).value as 'small' | 'medium' | 'large'
					})}
			>
				<option value="small">Small (chip pills)</option>
				<option value="medium">Medium (default tile)</option>
				<option value="large">Large (chunky tile)</option>
			</select>
		</label>
		<label class="field">
			<span class="field-label">Actions (JSON)</span>
			<textarea
				class="field-input textarea"
				rows="10"
				value={JSON.stringify(block.config.actions, null, 2)}
				oninput={(e) => {
					try {
						const parsed = JSON.parse((e.target as HTMLTextAreaElement).value);
						if (Array.isArray(parsed)) patchBlockConfig(i, { actions: parsed });
					} catch {
						/* ignore parse errors mid-edit; user will fix */
					}
				}}
			></textarea>
			<span class="field-hint">
				One action per array entry. Required:
				<code>{`{ label, service: { domain, service, target?: { entity_id }, data? } }`}</code>.
				Optional: <code>icon</code>, <code>detail</code>,
				<code>stateBinding: {`{ entityId, activeStates? }`}</code>.
				Hand-editing for now — a structured editor lands in a future commit.
			</span>
		</label>
	{/if}
{/snippet}

<script lang="ts" module>
	import type { BlockDef as _BlockDef } from '$lib/blocks/types';

	/**
	 * One-line summary of a block's content, shown next to the type
	 * name in the collapsed list view. Picks the most-identifying
	 * field per block type — e.g. the headline for hero, the label
	 * for outline. Keeps the list scannable on dense pages.
	 */
	export function summarise(block: _BlockDef): string {
		switch (block.type) {
			case 'hero':
				return block.config.headline.slice(0, 60);
			case 'markdown':
			case 'explainer':
				return block.config.body.replace(/\s+/g, ' ').slice(0, 60);
			case 'outline':
				return block.config.label;
			case 'macro-grid':
			case 'room-toggle-grid':
			case 'scene-row':
			case 'boost-row':
				return block.config.label ?? '(no label)';
			case 'entity-list': {
				const n = block.config.entities.length;
				const lbl = block.config.label;
				return lbl ? `${lbl} — ${n} entit${n === 1 ? 'y' : 'ies'}` : `${n} entit${n === 1 ? 'y' : 'ies'}`;
			}
			case 'action-grid': {
				const n = block.config.actions.length;
				const lbl = block.config.label;
				const head = lbl ? `${lbl} — ` : '';
				return `${head}${n} action${n === 1 ? '' : 's'}`;
			}
			case 'sparkline': {
				const id = block.config.entityId || '(no entity)';
				const lbl = block.config.label;
				const hours = block.config.hours ?? 24;
				return lbl ? `${lbl} — ${id} · ${hours}h` : `${id} · ${hours}h`;
			}
		}
	}
</script>

<style>
	.editor-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-6);
	}

	@media (min-width: 1100px) {
		.editor-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}

	/* ── shared field styles (echo /settings/pages list) ─── */
	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
	}

	.field-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.field-input {
		font-family: var(--font-body);
		font-size: var(--text-body);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 40px;
	}

	.field-input.mono {
		font-family: var(--font-mono);
	}

	.field-input.textarea {
		font-family: var(--font-mono);
		min-height: 80px;
		resize: vertical;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-hint {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-dim);
		font-style: italic;
		line-height: var(--leading-snug);
	}

	.checkbox-field {
		flex-direction: row;
		align-items: center;
		gap: var(--space-2);
		grid-column: 1 / -1;
	}

	/* ── Block list ────────────────────────────────────────── */
	.block-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: 0;
	}

	.block-row {
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		transition: border-color var(--ease-quick);
	}

	.block-row:hover {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--rule));
	}

	.block-row.expanded {
		border-color: var(--accent);
	}

	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.block-title {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex: 1;
		min-width: 0;
		text-align: left;
	}

	.block-num {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-dim);
	}

	.block-type {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--accent);
	}

	.block-summary {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.block-actions {
		display: flex;
		gap: var(--space-2);
	}

	.block-editor {
		padding: 0 var(--space-4) var(--space-4);
		border-top: 1px solid var(--rule);
	}

	/* ── Add block ─────────────────────────────────────────── */
	.add-block {
		margin: var(--space-3) 0 var(--space-6);
	}

	.add-block-trigger {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.add-block-trigger:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.add-block-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		background: var(--bg-card);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
	}

	.add-block-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.add-block-header strong {
		color: var(--accent);
		font-weight: 500;
	}

	.add-block-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		transition: border-color var(--ease-quick);
	}

	.add-block-row:hover {
		border-color: var(--accent);
	}

	.add-block-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--accent);
	}

	.add-block-desc {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}

	/* ── Danger zone ───────────────────────────────────────── */
	.danger-zone {
		margin-bottom: var(--space-12);
	}

	.danger-confirm {
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		max-width: 60ch;
		margin: 0 0 var(--space-3);
	}

	.danger-confirm strong {
		color: var(--accent);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}

	.action {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-2) var(--space-4);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.action:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.action.danger {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	.mini {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg-muted);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 32px;
		text-decoration: none;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.mini:hover:not(:disabled) {
		color: var(--accent);
		border-color: var(--accent);
	}

	.mini:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.mini.danger {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	/* ── Preview pane ──────────────────────────────────────── */
	.preview-pane {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	.preview-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.preview-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.preview-frame {
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		background: var(--bg);
		overflow: hidden;
	}
</style>
