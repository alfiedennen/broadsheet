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
	import {
		defaultBlockConfig,
		WALL_SURFACE_PRESETS,
		type BlockDef,
		type BlockType
	} from '$lib/blocks/types';
	import RenderedPage from '$lib/blocks/RenderedPage.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	// 0.9.1 things-first editor surface — used when customPage.editorMode === 'things-first'.
	import ThingsBrowser from '$lib/blocks/editor/ThingsBrowser.svelte';
	import ThingsCanvas from '$lib/blocks/editor/ThingsCanvas.svelte';
	import MacroComposer from '$lib/blocks/editor/MacroComposer.svelte';
	import SurfacePreview from '$lib/blocks/editor/SurfacePreview.svelte';
	import type { MacroBlockConfig } from '$lib/blocks/types';

	const slug = $derived(pageState.params.slug ?? '');
	const customPage = $derived(
		curationStore.current.customPages?.find((p) => p.slug === slug) ?? null
	);

	// 0.9.0 wall builder: full URLs the "Point a wall here" panel
	// surfaces. Reactive on window.location.origin + base + slug so
	// edits to the slug update the displayed URL live.
	const origin = $derived(typeof window === 'undefined' ? '' : window.location.origin);
	const kioskUrl = $derived(
		customPage ? `${origin}${base}/${customPage.slug}/?kiosk=true` : ''
	);
	const plainUrl = $derived(
		customPage ? `${origin}${base}/${customPage.slug}/` : ''
	);

	async function copyToClipboard(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			showToast(`${label} copied`, 'success');
		} catch {
			showToast('Copy failed — select + copy manually', 'error');
		}
	}

	let expandedIdx = $state<number | null>(null);
	let addingBlock = $state(false);
	// Picker filter (BUG-011) — types up to find the right block when
	// the list scrolls past the visible viewport. Cleared whenever the
	// picker reopens.
	let blockFilter = $state('');
	const filteredBlockTypes = $derived.by(() => {
		const q = blockFilter.trim().toLowerCase();
		if (!q) return ALL_BLOCK_TYPES;
		return ALL_BLOCK_TYPES.filter((t) => {
			const meta = BLOCK_META[t];
			return (
				t.toLowerCase().includes(q) ||
				meta.label.toLowerCase().includes(q) ||
				meta.description.toLowerCase().includes(q)
			);
		});
	});

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
		// Surface 'pending' state — debounce timer about to fire
		saveStatus = 'pending';
		if (savedFadeTimer) {
			clearTimeout(savedFadeTimer);
			savedFadeTimer = null;
		}
		// Debounced persistence
		if (pendingTimer) clearTimeout(pendingTimer);
		pendingTimer = setTimeout(async () => {
			pendingTimer = null;
			saveStatus = 'saving';
			const ok = await setCustomPageBlocks(slug, next);
			if (ok) {
				saveStatus = 'saved';
				savedFadeTimer = setTimeout(() => {
					saveStatus = 'idle';
					savedFadeTimer = null;
				}, 1600);
			} else {
				saveStatus = 'error';
			}
		}, 400);
	}

	/* ─────────────── 0.9.1 things-first editor helpers ───────────────
	 * The things-first surface is a controlled view — ThingsBrowser +
	 * ThingsCanvas don't touch the store directly. The parent (this
	 * file) routes their callbacks through the same persistence path
	 * the advanced editor uses (setCustomPageBlocks / patchBlockConfig).
	 *
	 * Effective editor mode: `editorMode` is optional on CustomPageDef
	 * so pages from before this field existed default to 'advanced'
	 * (their existing editor surface stays unchanged). New pages
	 * created via /settings/pages set editorMode: 'things-first' so
	 * the new surface is the default for fresh authoring.
	 */
	const effectiveEditorMode = $derived<'things-first' | 'advanced'>(
		customPage?.editorMode ?? 'advanced'
	);

	async function appendBlocks(toAppend: BlockDef[]) {
		if (!customPage || toAppend.length === 0) return;
		const next = [...customPage.blocks, ...toAppend];
		await setCustomPageBlocks(slug, next);
	}

	async function insertBlocksAt(index: number, toInsert: BlockDef[]) {
		if (!customPage || toInsert.length === 0) return;
		const safeIdx = Math.max(0, Math.min(index, customPage.blocks.length));
		const next = customPage.blocks.slice();
		next.splice(safeIdx, 0, ...toInsert);
		await setCustomPageBlocks(slug, next);
	}

	/** Single-block convenience that delegates to the bulk helper. */
	async function appendBlock(block: BlockDef) {
		return appendBlocks([block]);
	}

	async function removeBlockAt(index: number) {
		if (!customPage) return;
		const next = customPage.blocks.filter((_, idx) => idx !== index);
		await setCustomPageBlocks(slug, next);
	}

	async function moveBlockTo(from: number, to: number) {
		if (!customPage) return;
		if (from === to) return;
		const next = customPage.blocks.slice();
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		await setCustomPageBlocks(slug, next);
	}

	// MacroComposer modal state. composerOpenFor === null when closed;
	// === 'new' when composing a new macro (saving appends);
	// === number when editing an existing macro at that index.
	let composerOpenFor = $state<number | 'new' | null>(null);
	const composerInitial = $derived<MacroBlockConfig | null>(
		typeof composerOpenFor === 'number' && customPage
			? customPage.blocks[composerOpenFor]?.type === 'macro'
				? (customPage.blocks[composerOpenFor].config as MacroBlockConfig)
				: null
			: null
	);

	function openComposer(existingIndex: number | null) {
		composerOpenFor = existingIndex === null ? 'new' : existingIndex;
	}

	function closeComposer() {
		composerOpenFor = null;
	}

	async function saveComposer(macro: MacroBlockConfig) {
		if (composerOpenFor === 'new') {
			await appendBlock({ type: 'macro', config: macro });
		} else if (typeof composerOpenFor === 'number') {
			await patchBlockConfig(composerOpenFor, {
				label: macro.label,
				detail: macro.detail,
				icon: macro.icon,
				steps: macro.steps
			});
		}
		composerOpenFor = null;
	}

	// entityIds currently placed as `thing` blocks — drives the
	// "✓ on canvas" badge in the browser so duplicate placements
	// aren't surprising.
	const placedThingIds = $derived(
		new Set(
			(customPage?.blocks ?? [])
				.filter((b): b is BlockDef & { type: 'thing' } => b.type === 'thing')
				.map((b) => b.config.entityId)
				.filter((id) => id) // skip empties
		)
	);

	/**
	 * 0.9.4 — draft commit (the in-canvas "Save as-is" escape hatch).
	 *
	 * Imported pages land with `draft: true, hiddenFromNav: true`.
	 * Tapping "Commit as wall surface" flips both back so the page
	 * appears in the kebab nav alongside hand-authored pages.
	 *
	 * No data migration — the draft and the committed page are the
	 * SAME page (same slug, same blocks). The flag just toggles
	 * "this is still being reviewed" off.
	 */
	async function commitDraft() {
		if (!customPage) return;
		const ok = await updateCustomPage(slug, { draft: false, hiddenFromNav: false });
		if (ok) showToast('Committed — page is now in the nav', 'success');
		else showToast('Commit failed', 'error');
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

	/* ─────────────── block drag-to-reorder ─────────────────────────
	 * Header is the drag handle (draggable=true), whole row is the
	 * drop target. Dropping ON a row inserts the dragged block at
	 * that position, pushing the target down. Visual: dragging row
	 * dims; drop target shows a dashed accent border.
	 */
	let draggedBlockIdx = $state<number | null>(null);
	let dragOverBlockIdx = $state<number | null>(null);

	function handleBlockDragStart(e: DragEvent, idx: number) {
		draggedBlockIdx = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			// Set a payload so Firefox actually starts the drag
			e.dataTransfer.setData('text/plain', String(idx));
		}
	}

	function handleBlockDragOver(e: DragEvent, idx: number) {
		// Required to accept the drop
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (draggedBlockIdx !== null && draggedBlockIdx !== idx) dragOverBlockIdx = idx;
	}

	function handleBlockDragLeave() {
		// Don't clear immediately — dragover on the next row will overwrite,
		// but if we leave the list entirely the dragend handler clears.
	}

	function handleBlockDrop(e: DragEvent, idx: number) {
		e.preventDefault();
		const from = draggedBlockIdx;
		draggedBlockIdx = null;
		dragOverBlockIdx = null;
		if (from === null || from === idx || !customPage) return;
		const next = customPage.blocks.slice();
		const [moved] = next.splice(from, 1);
		next.splice(idx, 0, moved);
		setCustomPageBlocks(slug, next);
		// Keep the user's expanded block visible after the move
		if (expandedIdx === from) expandedIdx = idx;
		else if (expandedIdx !== null) {
			if (from < expandedIdx && idx >= expandedIdx) expandedIdx--;
			else if (from > expandedIdx && idx <= expandedIdx) expandedIdx++;
		}
	}

	function handleBlockDragEnd() {
		draggedBlockIdx = null;
		dragOverBlockIdx = null;
	}

	/* ─────────────── action-grid action mutators ───────────────────
	 * The structured per-action editor edits items inside an
	 * action-grid block. All routes go through patchBlockConfig() so
	 * we get the same optimistic-write + debounce-persist as every
	 * other block edit.
	 */

	import type { ActionGridItem, ActionServiceCall } from '$lib/blocks/types';

	function actionGridAt(blockIdx: number): ActionGridItem[] | null {
		if (!customPage) return null;
		const b = customPage.blocks[blockIdx];
		if (b?.type !== 'action-grid') return null;
		return [...b.config.actions];
	}

	function patchAction(blockIdx: number, actionIdx: number, patch: Partial<ActionGridItem>) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		arr[actionIdx] = { ...arr[actionIdx], ...patch };
		patchBlockConfig(blockIdx, { actions: arr });
	}

	function patchActionService(
		blockIdx: number,
		actionIdx: number,
		patch: Partial<ActionServiceCall>
	) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		arr[actionIdx] = {
			...arr[actionIdx],
			service: { ...arr[actionIdx].service, ...patch }
		};
		patchBlockConfig(blockIdx, { actions: arr });
	}

	function patchActionTarget(blockIdx: number, actionIdx: number, entityId: string) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		const id = entityId.trim();
		const target = id ? { entity_id: id } : undefined;
		arr[actionIdx] = {
			...arr[actionIdx],
			service: { ...arr[actionIdx].service, target }
		};
		patchBlockConfig(blockIdx, { actions: arr });
	}

	function patchActionBinding(blockIdx: number, actionIdx: number, entityId: string) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		const id = entityId.trim();
		arr[actionIdx] = {
			...arr[actionIdx],
			stateBinding: id ? { entityId: id } : undefined
		};
		patchBlockConfig(blockIdx, { actions: arr });
	}

	function addAction(blockIdx: number) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		arr.push({
			label: 'New action',
			service: { domain: 'light', service: 'toggle', target: {} }
		});
		patchBlockConfig(blockIdx, { actions: arr });
	}

	function removeAction(blockIdx: number, actionIdx: number) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		arr.splice(actionIdx, 1);
		patchBlockConfig(blockIdx, { actions: arr });
	}

	function moveAction(blockIdx: number, actionIdx: number, delta: -1 | 1) {
		const arr = actionGridAt(blockIdx);
		if (!arr) return;
		const target = actionIdx + delta;
		if (target < 0 || target >= arr.length) return;
		const [moved] = arr.splice(actionIdx, 1);
		arr.splice(target, 0, moved);
		patchBlockConfig(blockIdx, { actions: arr });
	}

	/* ─────────────── slug rename + page duplicate ──────────────────
	 * The slug is the route key, so renaming has to validate uniqueness
	 * against RESERVED_ROUTE_SLUGS + active plugin pages + every other
	 * custom page. After the rename, redirect the editor URL — the
	 * underlying customPage stays in place at the same array index, but
	 * its slug field changes, so the resolver finds it under the new key.
	 */
	import { duplicateCustomPage } from '$lib/curation/store.svelte';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import { RESERVED_ROUTE_SLUGS } from '$lib/plugins';

	let renameMode = $state(false);
	let renameSlug = $state('');
	let duplicateMode = $state(false);
	let duplicateSlug = $state('');
	let duplicateLabel = $state('');

	function slugErrorFor(candidate: string, ignoreSlug?: string): string | null {
		const s = candidate.trim();
		if (!s) return 'Slug required';
		if (!/^[a-z0-9-]+$/.test(s)) return 'Lowercase letters / digits / hyphens only';
		if (RESERVED_ROUTE_SLUGS.includes(s)) return `"${s}" is a core route`;
		if (pluginLoader.activePluginPages.some((p) => p.slug === s))
			return `"${s}" is used by an active plugin`;
		const others = (curationStore.current.customPages ?? []).filter(
			(p) => p.slug !== ignoreSlug
		);
		if (others.some((p) => p.slug === s)) return `"${s}" already exists`;
		return null;
	}

	function openRename() {
		renameSlug = customPage?.slug ?? '';
		renameMode = true;
	}
	function cancelRename() {
		renameMode = false;
	}
	async function commitRename() {
		const err = slugErrorFor(renameSlug, slug);
		if (err) {
			showToast(err, 'error');
			return;
		}
		const ok = await updateCustomPage(slug, { slug: renameSlug });
		if (ok) {
			showToast('Slug renamed', 'success');
			renameMode = false;
			// Redirect to the new slug so the editor URL matches
			goto(`${base}/settings/pages/${renameSlug}/`);
		} else {
			showToast('Rename failed', 'error');
		}
	}

	function openDuplicate() {
		duplicateLabel = `${customPage?.label ?? 'Page'} (copy)`;
		duplicateSlug = `${customPage?.slug ?? 'page'}-copy`;
		duplicateMode = true;
	}
	function cancelDuplicate() {
		duplicateMode = false;
	}
	async function commitDuplicate() {
		if (!customPage) return;
		const err = slugErrorFor(duplicateSlug);
		if (err) {
			showToast(err, 'error');
			return;
		}
		if (!duplicateLabel.trim()) {
			showToast('Label required', 'error');
			return;
		}
		const ok = await duplicateCustomPage(customPage.slug, duplicateSlug, duplicateLabel.trim());
		if (ok) {
			showToast('Page duplicated', 'success');
			duplicateMode = false;
			goto(`${base}/settings/pages/${duplicateSlug}/`);
		} else {
			showToast('Duplicate failed', 'error');
		}
	}

	/* ─────────────── unsaved-edit indicator ────────────────────────
	 * The block-config edits debounce at 400ms before persisting via
	 * setCustomPageBlocks. Surface that as a tiny saving/saved/error
	 * status near the page-meta header so authors don't wonder
	 * whether their typing has landed.
	 *
	 * State machine:
	 *   idle → patch fires → pending (debounce running) → saving
	 *     → saved (auto back to idle after 1.6s) | error
	 */
	let saveStatus = $state<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
	let savedFadeTimer: ReturnType<typeof setTimeout> | null = null;
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
		<!-- Save status indicator (persistent footer-of-hero band) -->
		<div class="save-status-row" data-status={saveStatus}>
			<span class="save-status">
				{#if saveStatus === 'pending'}
					editing…
				{:else if saveStatus === 'saving'}
					saving…
				{:else if saveStatus === 'saved'}
					✓ saved
				{:else if saveStatus === 'error'}
					⚠ save failed
				{:else}
					&nbsp;
				{/if}
			</span>
			<div class="save-status-actions">
				<button class="mini" type="button" onclick={openRename}>
					Rename slug
				</button>
				<button class="mini" type="button" onclick={openDuplicate}>
					Duplicate page
				</button>
			</div>
		</div>

		{#if customPage.draft}
			<!--
				0.9.4 — draft banner. Shown only for imported pages whose
				draft flag hasn't been flipped yet. The "Save as-is" /
				"Commit as wall surface" buttons both call commitDraft —
				they're labelled differently to map to the two mental
				models the plan called out (the plan called for two-layer
				escape hatches: pre-import "Skip review" checkbox + here-
				and-now "Save as-is"). Discard removes the page entirely.
			-->
			<div class="draft-banner" role="status">
				<div class="draft-banner-body">
					<strong>Draft from Lovelace import.</strong>
					Review the canvas, rearrange anything you'd like, then
					commit so it appears in your nav. Or save as-is if the
					import already looks right — you can always edit later.
				</div>
				<div class="draft-banner-actions">
					<button class="action" type="button" onclick={commitDraft}>
						Save as-is
					</button>
					<button class="action confirm" type="button" onclick={commitDraft}>
						Commit as wall surface
					</button>
					<button class="action danger" type="button" onclick={() => (pendingDelete = true)}>
						Discard
					</button>
				</div>
			</div>
		{/if}

		{#if renameMode}
			<div class="rename-form">
				<label class="field">
					<span class="field-label">New slug</span>
					<input
						type="text"
						class="field-input mono"
						bind:value={renameSlug}
						onkeydown={(e) => {
							if (e.key === 'Enter') commitRename();
							if (e.key === 'Escape') cancelRename();
						}}
					/>
					{#if slugErrorFor(renameSlug, slug)}
						<span class="field-error">{slugErrorFor(renameSlug, slug)}</span>
					{:else}
						<span class="field-hint">URL becomes <code>/{renameSlug}/</code> · old URL will 404.</span>
					{/if}
				</label>
				<div class="actions">
					<button
						class="action confirm"
						type="button"
						disabled={!!slugErrorFor(renameSlug, slug)}
						onclick={commitRename}
					>
						Rename
					</button>
					<button class="action" type="button" onclick={cancelRename}>Cancel</button>
				</div>
			</div>
		{/if}

		{#if duplicateMode}
			<div class="rename-form">
				<label class="field">
					<span class="field-label">Label of copy</span>
					<input type="text" class="field-input" bind:value={duplicateLabel} />
				</label>
				<label class="field">
					<span class="field-label">Slug of copy</span>
					<input type="text" class="field-input mono" bind:value={duplicateSlug} />
					{#if slugErrorFor(duplicateSlug)}
						<span class="field-error">{slugErrorFor(duplicateSlug)}</span>
					{:else}
						<span class="field-hint">URL: <code>/{duplicateSlug}/</code></span>
					{/if}
				</label>
				<div class="actions">
					<button
						class="action confirm"
						type="button"
						disabled={!!slugErrorFor(duplicateSlug) || !duplicateLabel.trim()}
						onclick={commitDuplicate}
					>
						Duplicate
					</button>
					<button class="action" type="button" onclick={cancelDuplicate}>Cancel</button>
				</div>
			</div>
		{/if}

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
					<!-- 0.9.0: wall-surface device picker. Stores
					     width/height/label on customPage.surface so the
					     "Point a wall here" panel below can suggest
					     correctly-sized Fully Kiosk Browser config. -->
					<label class="field">
						<span class="field-label">Wall device (optional)</span>
						<select
							class="field-input"
							value={customPage.surface?.label ?? ''}
							onchange={(e) => {
								const val = (e.target as HTMLSelectElement).value;
								if (!val) {
									updateMeta({ surface: undefined });
								} else {
									const preset = WALL_SURFACE_PRESETS.find((p) => p.label === val);
									if (preset) {
										updateMeta({
											surface: {
												width: preset.width,
												height: preset.height,
												label: preset.label
											}
										});
									}
								}
							}}
						>
							<option value="">— Not a wall surface</option>
							{#each WALL_SURFACE_PRESETS as preset (preset.label)}
								<option value={preset.label}>
									{preset.label} ({preset.width}×{preset.height})
								</option>
							{/each}
						</select>
					</label>
					<!-- 0.9.1 editor-mode toggle. things-first is the new
					     default for fresh pages. Advanced is the legacy
					     block-by-block surface; we keep it for parity with
					     pages authored before 0.9.1 + the more exotic block
					     types (action-grid, sparkline) that don't have a
					     things-first inline editor. -->
					<label class="field">
						<span class="field-label">Editor</span>
						<select
							class="field-input"
							value={effectiveEditorMode}
							onchange={(e) =>
								updateMeta({
									editorMode: (e.target as HTMLSelectElement).value as
										| 'things-first'
										| 'advanced'
								})}
						>
							<option value="things-first">Things-first (recommended)</option>
							<option value="advanced">Advanced (block-by-block)</option>
						</select>
					</label>
				</div>

				<!-- 0.9.0 wall builder: "Point a wall here" panel.
				     URL with optional kiosk-mode query param, copy
				     button, Fully Kiosk Browser one-liner hint. -->
				<OutLine label="Point a wall here" />
				<div class="share-panel">
					<p class="share-prose">
						Open this on any device on your network and it renders
						in <em>kiosk mode</em> — no kebab nav, no chrome, no
						connection indicator. Useful for wall-mounted tablets
						running Fully Kiosk Browser, Mr Robot, or any always-on
						display.
					</p>
					<div class="share-row">
						<label class="field share-field">
							<span class="field-label">Kiosk URL</span>
							<input
								type="text"
								readonly
								class="field-input mono share-input"
								value={kioskUrl}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
							/>
						</label>
						<button
							type="button"
							class="action share-copy"
							onclick={() => copyToClipboard(kioskUrl, 'Kiosk URL')}
						>
							Copy
						</button>
					</div>
					<details class="share-fkb">
						<summary>Fully Kiosk Browser quick config</summary>
						<dl class="fkb-dl">
							<dt>Start URL</dt>
							<dd><code>{kioskUrl}</code></dd>
							<dt>Hide browser chrome</dt>
							<dd>Toggle: <code>Web Content Settings → Web Auto Reload</code>:
								off; <code>Kiosk Mode</code>: on; <code>Hide Status Bar</code>: on.</dd>
							<dt>Keep screen on</dt>
							<dd><code>Display Settings → Keep Screen On</code>: on.
								Recommend <code>Reduce screen brightness in dark room</code> too.</dd>
							{#if customPage.surface}
								<dt>Resolution match</dt>
								<dd>
									Page is sized for <code>{customPage.surface.label}</code>
									({customPage.surface.width}×{customPage.surface.height}).
									Use landscape orientation on the device for best fit.
								</dd>
							{/if}
						</dl>
					</details>
					<details class="share-fkb">
						<summary>Plain URL (no kiosk mode)</summary>
						<div class="share-row">
							<input
								type="text"
								readonly
								class="field-input mono share-input"
								value={plainUrl}
								onfocus={(e) => (e.target as HTMLInputElement).select()}
							/>
							<button
								type="button"
								class="action share-copy"
								onclick={() => copyToClipboard(plainUrl, 'URL')}
							>
								Copy
							</button>
						</div>
						<p class="share-fine">
							The plain URL keeps the kebab nav + connection indicator —
							use it when opening on a phone or desktop for casual access.
						</p>
					</details>
				</div>

				{#if effectiveEditorMode === 'things-first'}
					<!-- 0.9.2 things-first surface: accomplishment-led
					     browser (verbs, grouped by area + sub-domain) +
					     canvas (multi-block recipe drops). Preview pane
					     uses SurfacePreview when customPage.surface is set. -->
					<OutLine label="Browse & build" />
					<div class="things-first-grid">
						<ThingsBrowser
							onAddRecipe={(recipe) => appendBlocks(recipe.blocks)}
							placedIds={placedThingIds}
						/>
						<ThingsCanvas
							blocks={customPage.blocks}
							onAppendBlocks={appendBlocks}
							onInsertBlocks={insertBlocksAt}
							onRemoveBlock={removeBlockAt}
							onMoveBlock={moveBlockTo}
							onPatchBlock={patchBlockConfig}
							onComposeMacro={openComposer}
						/>
					</div>
					<p class="things-first-hint">
						Need an action-grid, sparkline, or other advanced
						block? Switch the editor mode to <em>Advanced</em>
						in page meta above — your blocks remain in place
						either way.
					</p>
				{:else}
					<OutLine label="Blocks" />
					<ol class="block-list">
						{#each customPage.blocks as block, i (i)}
							<li
								class="block-row"
								class:expanded={expandedIdx === i}
								class:dragging={draggedBlockIdx === i}
								class:drop-target={dragOverBlockIdx === i && draggedBlockIdx !== null && draggedBlockIdx !== i}
								ondragover={(e) => handleBlockDragOver(e, i)}
								ondragleave={handleBlockDragLeave}
								ondrop={(e) => handleBlockDrop(e, i)}
							>
								<!--
									Header is the drag handle. Whole li is the drop
									target. Limiting `draggable` to the header keeps
									form interactions inside the expanded editor
									(text inputs, drag-to-select) working normally.
								-->
								<header
									class="block-head"
									role="group"
									aria-label="Block {i + 1} header (drag to reorder)"
									draggable="true"
									ondragstart={(e) => handleBlockDragStart(e, i)}
									ondragend={handleBlockDragEnd}
								>
									<span class="block-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
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
									<span class="add-block-count"
										>{filteredBlockTypes.length}/{ALL_BLOCK_TYPES.length} types</span
									>
									<button
										type="button"
										class="mini"
										onclick={() => {
											addingBlock = false;
											blockFilter = '';
										}}
									>
										Cancel
									</button>
								</header>
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									class="add-block-filter"
									placeholder="Filter — try 'action', 'list', 'chart'…"
									bind:value={blockFilter}
									autofocus
								/>
								{#each filteredBlockTypes as t (t)}
									<button class="add-block-row" type="button" onclick={() => addBlock(t)}>
										<span class="add-block-label">{BLOCK_META[t].label}</span>
										<span class="add-block-desc">{BLOCK_META[t].description}</span>
									</button>
								{:else}
									<p class="add-block-empty">
										No block types match "{blockFilter}". Try a shorter word.
									</p>
								{/each}
							</div>
						{:else}
							<button
								type="button"
								class="add-block-trigger"
								onclick={() => {
									addingBlock = true;
									blockFilter = '';
								}}
							>
								+ Add block
							</button>
						{/if}
					</div>
				{/if}

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
				{#if effectiveEditorMode === 'things-first'}
					<!-- Things-first preview uses SurfacePreview so a wall
					     surface renders at its actual target dims (scaled
					     to fit). Falls back to natural flow when no
					     customPage.surface is set. -->
					<SurfacePreview blocks={customPage.blocks} surface={customPage.surface} />
					<div class="preview-extras">
						<a
							href="{base}/{customPage.slug}/"
							target="_blank"
							rel="noopener"
							class="mini"
						>
							Open live
						</a>
					</div>
				{:else}
					<header class="preview-head">
						<span class="preview-label">Preview</span>
						<a href="{base}/{customPage.slug}/" target="_blank" rel="noopener" class="mini">
							Open live
						</a>
					</header>
					<div class="preview-frame">
						<RenderedPage blocks={customPage.blocks} />
					</div>
				{/if}
			</aside>
		</div>
	{/if}

	{#if composerOpenFor !== null}
		<MacroComposer
			initial={composerInitial}
			onSave={saveComposer}
			onClose={closeComposer}
		/>
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
				Full markdown — <strong>**bold**</strong>, <em>*italic*</em> or <em>_italic_</em>,
				`code`, # headings, - lists, &gt; blockquotes, [link](/path), tables. Use
				<code>{`{{entity_id}}`}</code>
				to interpolate live state — e.g. <code>{`{{weather.forecast_home}}`}</code>.
				For arithmetic / filters, use HA-style:
				<code>{`{{ (states('sensor.x') | float * 100) | round(0) }}`}</code>
				— the simple <code>{`{{sensor.x.state}}`}</code> shorthand is direct
				lookup only and won't combine with filters. Output that reads "NaN" or
				"undefined" usually means a typo'd entity_id or a filter on missing data.
				HTML is sanitized; only safe tags survive.
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
		<!--
			Structured per-action editor. Each tile is a card with label,
			detail, icon, service-call (domain.service + target entity_id),
			and optional state-binding. Add / remove / reorder per action.
			Replaces the raw-JSON textarea — biggest builder pain point
			from the dogfooding pass.
		-->
		<div class="action-editor">
			<header class="action-editor-head">
				<span class="field-label">Actions</span>
				<span class="action-count">
					{block.config.actions.length} action{block.config.actions.length === 1 ? '' : 's'}
				</span>
			</header>

			{#if block.config.actions.length === 0}
				<p class="action-empty">
					No actions yet. Tap <strong>+ Add action</strong> below — each becomes a tile.
				</p>
			{/if}

			{#each block.config.actions as a, ai (ai)}
				<article class="action-card">
					<header class="action-card-head">
						<span class="action-card-num">№ {String(ai + 1).padStart(2, '0')}</span>
						<span class="action-card-title">{a.label || '(no label)'}</span>
						<div class="action-card-controls">
							<button
								type="button"
								class="mini"
								disabled={ai === 0}
								onclick={() => moveAction(i, ai, -1)}
								aria-label="Move up"
							>↑</button>
							<button
								type="button"
								class="mini"
								disabled={ai === block.config.actions.length - 1}
								onclick={() => moveAction(i, ai, 1)}
								aria-label="Move down"
							>↓</button>
							<button
								type="button"
								class="mini danger"
								onclick={() => removeAction(i, ai)}
							>Remove</button>
						</div>
					</header>

					<div class="action-card-grid">
						<label class="field">
							<span class="field-label">Label</span>
							<input
								type="text"
								class="field-input"
								value={a.label}
								oninput={(e) =>
									patchAction(i, ai, { label: (e.target as HTMLInputElement).value })}
							/>
						</label>
						<label class="field">
							<span class="field-label">Detail (optional)</span>
							<input
								type="text"
								class="field-input"
								value={a.detail ?? ''}
								placeholder="e.g. → 21°"
								oninput={(e) =>
									patchAction(i, ai, {
										detail: (e.target as HTMLInputElement).value || null
									})}
							/>
						</label>
						<label class="field">
							<span class="field-label">Icon (mdi:*, optional)</span>
							<input
								type="text"
								class="field-input mono"
								value={a.icon ?? ''}
								placeholder="mdi:lightbulb"
								oninput={(e) =>
									patchAction(i, ai, {
										icon: (e.target as HTMLInputElement).value || null
									})}
							/>
						</label>
					</div>

					<fieldset class="action-card-fieldset">
						<legend>Service call</legend>
						<div class="action-card-grid">
							<label class="field">
								<span class="field-label">Domain</span>
								<input
									type="text"
									class="field-input mono"
									value={a.service.domain}
									placeholder="light"
									oninput={(e) =>
										patchActionService(i, ai, {
											domain: (e.target as HTMLInputElement).value
										})}
								/>
							</label>
							<label class="field">
								<span class="field-label">Service</span>
								<input
									type="text"
									class="field-input mono"
									value={a.service.service}
									placeholder="toggle"
									oninput={(e) =>
										patchActionService(i, ai, {
											service: (e.target as HTMLInputElement).value
										})}
								/>
							</label>
							<label class="field action-card-wide">
								<span class="field-label">Target entity_id (optional)</span>
								<input
									type="text"
									class="field-input mono"
									value={a.service.target?.entity_id ?? ''}
									placeholder="light.living_room"
									oninput={(e) =>
										patchActionTarget(i, ai, (e.target as HTMLInputElement).value)}
								/>
							</label>
						</div>
					</fieldset>

					<fieldset class="action-card-fieldset">
						<legend>State binding (optional)</legend>
						<p class="action-card-hint">
							Tile highlights when this entity's state matches one of <code>on</code> /
							<code>playing</code> / <code>home</code> / <code>open</code> /
							<code>unlocked</code>.
						</p>
						<div class="action-card-grid">
							<label class="field">
								<span class="field-label">Entity ID</span>
								<input
									type="text"
									class="field-input mono"
									value={a.stateBinding?.entityId ?? ''}
									placeholder="(none)"
									oninput={(e) =>
										patchActionBinding(i, ai, (e.target as HTMLInputElement).value)}
								/>
							</label>
						</div>
					</fieldset>
				</article>
			{/each}

			<button type="button" class="action-add-btn" onclick={() => addAction(i)}>
				+ Add action
			</button>
		</div>
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
			case 'thing': {
				const id = block.config.entityId || '(no entity)';
				const lbl = block.config.label;
				const widget = block.config.widget ?? 'auto';
				return lbl ? `${lbl} — ${id} (${widget})` : `${id} (${widget})`;
			}
			case 'macro': {
				const n = block.config.steps.length;
				return `${block.config.label} — ${n} step${n === 1 ? '' : 's'}`;
			}
			case 'area-lights-panel':
				return `Lights panel — area ${block.config.areaId || '(unset)'}`;
			case 'area-climate-panel':
				return `Heating panel — area ${block.config.areaId || '(unset)'}`;
			case 'area-media-panel':
				return `Media panel — area ${block.config.areaId || '(unset)'}`;
			case 'row': {
				const n = block.config.children.length;
				return `Row — ${n} child${n === 1 ? '' : 'ren'}`;
			}
			case 'grid': {
				const n = block.config.children.length;
				const cols = block.config.columns ?? 12;
				return `Grid — ${cols} cols, ${n} child${n === 1 ? '' : 'ren'}`;
			}
			case 'tabs': {
				const n = block.config.tabs.length;
				return `Tabs — ${n} tab${n === 1 ? '' : 's'}: ${block.config.tabs.map((t) => t.label).slice(0, 3).join(', ')}${n > 3 ? '…' : ''}`;
			}
			case 'lovelace-embed': {
				const url = block.config.url;
				return url ? `Lovelace embed — ${url}` : 'Lovelace embed — (no URL)';
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

	/* 0.9.1 things-first: browser + canvas split inside the LEFT
	   editor-pane. Stacks vertically on narrow viewports, splits
	   2-up on wider screens. The canvas wants more room because
	   it holds the row editor; the browser is denser. */
	.things-first-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		min-height: 480px;
	}

	@media (min-width: 720px) {
		.things-first-grid {
			grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
		}
	}

	.things-first-hint {
		margin: 0 0 var(--space-6);
		font-size: 0.82rem;
		font-style: italic;
		color: var(--fg-muted);
	}
	.things-first-hint em {
		color: var(--accent);
		font-style: italic;
	}

	.preview-extras {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-2);
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
		transition: border-color var(--ease-quick), opacity var(--ease-quick);
	}

	.block-row:hover {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--rule));
	}

	.block-row.expanded {
		border-color: var(--accent);
	}

	/* Drag-to-reorder visual states */
	.block-row.dragging {
		opacity: 0.4;
	}

	.block-row.drop-target {
		border-style: dashed;
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		/* draggable=true is on this header — show grab cursor on hover */
		cursor: grab;
	}

	.block-head:active {
		cursor: grabbing;
	}

	/* Drag handle (decorative — the whole header is draggable) */
	.block-grip {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-dim);
		letter-spacing: -2px;
		user-select: none;
		flex: 0 0 auto;
	}

	.block-row:hover .block-grip {
		color: var(--accent);
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
		max-height: 70vh;
		overflow-y: auto;
	}

	.add-block-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
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

	.add-block-count {
		flex: 1;
		text-align: right;
		font-size: 0.7rem;
		opacity: 0.7;
	}

	.add-block-filter {
		font-family: var(--font-body);
		font-size: var(--text-body);
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		color: var(--fg);
	}

	.add-block-filter:focus {
		outline: none;
		border-color: var(--accent);
	}

	.add-block-empty {
		padding: var(--space-3);
		font-family: var(--font-body);
		font-size: var(--text-caption);
		font-style: italic;
		color: var(--fg-muted);
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

	/* 0.9.0 wall builder — "Point a wall here" panel. */
	.share-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.share-prose {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body);
		line-height: var(--leading-snug);
		color: var(--fg);
		max-width: 72ch;
	}

	.share-prose em {
		font-style: italic;
		color: var(--accent);
	}

	.share-row {
		display: flex;
		gap: var(--space-2);
		align-items: flex-end;
	}

	.share-field {
		flex: 1;
		min-width: 0;
	}

	.share-input {
		font-size: var(--text-caption);
		padding: var(--space-2) var(--space-3);
	}

	.share-copy {
		flex: 0 0 auto;
	}

	.share-fkb {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.share-fkb > summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) 0;
		list-style: none;
		transition: color var(--ease-quick);
	}

	.share-fkb > summary::-webkit-details-marker {
		display: none;
	}

	.share-fkb > summary::before {
		content: '+ ';
		color: var(--accent);
	}

	.share-fkb[open] > summary::before {
		content: '− ';
	}

	.share-fkb > summary:hover {
		color: var(--accent);
	}

	.fkb-dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-2) var(--space-4);
		margin: var(--space-2) 0 0;
		font-size: var(--text-caption);
		line-height: var(--leading-snug);
	}

	.fkb-dl dt {
		font-family: var(--font-mono);
		color: var(--fg-muted);
	}

	.fkb-dl dd {
		margin: 0;
		color: var(--fg);
	}

	.fkb-dl code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--accent);
	}

	.share-fine {
		margin: var(--space-2) 0 0;
		font-style: italic;
		color: var(--fg-muted);
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

	/* ── Save-status indicator + slug rename / duplicate ─────────── */
	.save-status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.save-status-row[data-status='saving'] {
		border-color: color-mix(in srgb, var(--accent) 60%, var(--rule));
		color: var(--accent);
	}

	.save-status-row[data-status='pending'] {
		color: var(--fg-muted);
	}

	.save-status-row[data-status='saved'] {
		border-color: var(--state-on, #7aa37a);
		color: var(--state-on, #7aa37a);
	}

	.save-status-row[data-status='error'] {
		border-color: var(--state-alert);
		color: var(--state-alert);
	}

	.save-status {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
	}

	.save-status-actions {
		display: flex;
		gap: var(--space-2);
	}

	/* 0.9.4 draft banner — shown for freshly-imported Lovelace pages
	   that haven't been committed yet. Visually distinct (dashed
	   accent border, accent-glow tint) but not alarming. */
	.draft-banner {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		margin-bottom: var(--space-4);
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
		border: 1px dashed var(--accent);
		border-radius: var(--radius-card);
	}
	.draft-banner-body {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
		line-height: var(--leading-snug);
	}
	.draft-banner-body strong {
		font-family: var(--font-display, var(--font-body));
		font-style: italic;
		color: var(--accent);
		font-weight: normal;
		margin-right: var(--space-2);
	}
	.draft-banner-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.rename-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
	}

	.field-error {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--state-alert);
	}

	/* ── Action-grid structured editor ─────────────────────────── */
	.action-editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.action-editor-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.action-count {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
	}

	.action-empty {
		padding: var(--space-4);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		font-style: italic;
		color: var(--fg-muted);
		text-align: center;
		margin: 0;
	}

	.action-empty strong {
		color: var(--accent);
		font-style: normal;
	}

	.action-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.action-card-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px dashed var(--rule);
	}

	.action-card-num {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-dim);
	}

	.action-card-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--accent);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-card-controls {
		display: flex;
		gap: var(--space-2);
	}

	.action-card-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}

	@media (min-width: 540px) {
		.action-card-grid {
			grid-template-columns: 1fr 1fr;
		}
		.action-card-grid > .action-card-wide {
			grid-column: 1 / -1;
		}
	}

	.action-card-fieldset {
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		padding: var(--space-3) var(--space-4);
		margin: 0;
	}

	.action-card-fieldset legend {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: 0 var(--space-2);
	}

	.action-card-hint {
		font-family: var(--font-body);
		font-style: italic;
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: 0 0 var(--space-3);
	}

	.action-add-btn {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-3) var(--space-4);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		min-height: 44px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.action-add-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
</style>
