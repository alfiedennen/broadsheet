<script lang="ts">
	/**
	 * /settings/pages — list of custom pages with create / edit /
	 * reorder / delete affordances.
	 *
	 * Custom pages are the v0.2 extensibility hatch. Authored here
	 * via typed primitives (Phase 1 substrate), or imported from
	 * Lovelace (Phase 3). Each page is stored in
	 * curationStore.current.customPages and dispatched by the
	 * `[pluginSlug]` catch-all route at render time.
	 *
	 * Slug rules enforced at create-time:
	 *   - lowercase letters / digits / hyphens only
	 *   - not in RESERVED_ROUTE_SLUGS (core routes)
	 *   - not used by an active plugin page (precedence: plugin wins)
	 *   - not already used by another custom page
	 */

	import { tick } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		curationStore,
		createCustomPage,
		deleteCustomPage,
		moveCustomPage
	} from '$lib/curation/store.svelte';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import { RESERVED_ROUTE_SLUGS } from '$lib/plugins';
	import { showToast } from '$lib/stores/toast.svelte';
	import { discovery } from '$lib/discovery';
	import { applicablePresets, type PresetBuilder } from '$lib/presets';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	const pages = $derived(curationStore.current.customPages ?? []);

	/* ─────────────── + New page form ─────────────── */
	let creating = $state(false);
	let newLabel = $state('');
	let newSlug = $state('');
	let newWidth = $state<'narrow' | 'default' | 'wide'>('default');
	let labelEl = $state<HTMLInputElement | null>(null);
	let submitting = $state(false);
	// Preset selection — the form starts in 'pick-preset' mode if any
	// presets are applicable, then falls through to label/slug after pick.
	let pickedPreset = $state<PresetBuilder | null>(null);
	let pickedPersonId = $state<string | null>(null);
	const presets = $derived(
		applicablePresets({ persons: discovery.persons, areas: discovery.areas })
	);
	// Auto-derive slug from label as the user types — but only until
	// they manually edit the slug field, so a deliberate slug isn't
	// clobbered by a label tweak.
	let slugEdited = $state(false);

	function openCreate() {
		creating = true;
		newLabel = '';
		newSlug = '';
		newWidth = 'default';
		slugEdited = false;
		pickedPreset = null;
		pickedPersonId = null;
		tick().then(() => labelEl?.focus());
	}
	function cancelCreate() {
		creating = false;
		pickedPreset = null;
	}

	function selectPreset(preset: PresetBuilder | null) {
		pickedPreset = preset;
		if (preset) {
			// Auto-fill label + slug + width from preset metadata
			newLabel = preset.meta.label;
			newSlug = slugify(preset.meta.label);
			slugEdited = false;
			// Person preset prompts for which person; default to first
			if (preset.meta.requiresPerson) {
				pickedPersonId = discovery.persons[0]?.id ?? null;
			}
		}
		tick().then(() => labelEl?.focus());
	}
	function slugify(s: string): string {
		return s
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.slice(0, 64);
	}
	$effect(() => {
		if (creating && !slugEdited) newSlug = slugify(newLabel);
	});

	function slugError(): string | null {
		const s = newSlug.trim();
		if (!s) return 'Slug required';
		if (!/^[a-z0-9-]+$/.test(s)) return 'Lowercase letters / digits / hyphens only';
		if (RESERVED_ROUTE_SLUGS.includes(s)) return `"${s}" is a core route`;
		if (pluginLoader.activePluginPages.some((p) => p.slug === s))
			return `"${s}" is used by an active plugin`;
		if (pages.some((p) => p.slug === s)) return `"${s}" already exists`;
		return null;
	}

	const slugErr = $derived(creating ? slugError() : null);

	async function commitCreate() {
		const err = slugError();
		if (err) {
			showToast(err, 'error');
			return;
		}
		const label = newLabel.trim();
		if (!label) {
			showToast('Label required', 'error');
			return;
		}
		submitting = true;
		try {
			// If a preset is picked, build the page def from its template;
			// otherwise fall back to the blank-Hero starter.
			let pageDef;
			if (pickedPreset) {
				const built = pickedPreset.build(
					{ persons: discovery.persons, areas: discovery.areas },
					{ label, personId: pickedPersonId ?? undefined }
				);
				pageDef = {
					...built,
					slug: newSlug,
					label,
					pageWidth: newWidth, // honour user override
					navOrder: 100 + pages.length
				};
			} else {
				pageDef = {
					slug: newSlug,
					label,
					navOrder: 100 + pages.length,
					pageWidth: newWidth,
					blocks: [
						{
							type: 'hero' as const,
							config: { eyebrow: label, headline: label, size: 'md' as const }
						}
					]
				};
			}
			const ok = await createCustomPage(pageDef);
			if (ok) {
				showToast(`Created "${label}"`, 'success');
				cancelCreate();
				// Jump straight into the editor
				goto(`${base}/settings/pages/${newSlug}/`);
			} else {
				showToast('Save failed', 'error');
			}
		} finally {
			submitting = false;
		}
	}

	/* ─────────────── delete with confirmation ─────────────── */
	let pendingDelete = $state<string | null>(null);

	async function confirmDelete(slug: string) {
		const ok = await deleteCustomPage(slug);
		if (ok) showToast('Deleted', 'success');
		pendingDelete = null;
	}

	async function reorder(slug: string, delta: -1 | 1) {
		await moveCustomPage(slug, delta);
	}
</script>

<svelte:head>
	<title>Pages · Settings · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · Pages" />
		{/snippet}
		{#snippet headline()}
			Your custom pages.
		{/snippet}
		{#snippet dek()}
			Compose pages from typed primitives. Each page becomes a real route
			under <code>/&lt;slug&gt;</code> and appears in the kebab nav. Same surface
			as the core pages — written in the same editorial register.
		{/snippet}
	</Hero>

	<div class="new-page">
		{#if creating}
			<div class="new-page-form">
				{#if presets.length > 0}
					<div class="preset-picker">
						<span class="field-label">Start from</span>
						<div class="preset-row">
							<button
								type="button"
								class="preset-chip"
								class:active={pickedPreset === null}
								onclick={() => selectPreset(null)}
							>
								<span class="preset-name">Blank</span>
								<span class="preset-desc">Start with a single Hero block.</span>
							</button>
							{#each presets as p (p.meta.id)}
								<button
									type="button"
									class="preset-chip"
									class:active={pickedPreset?.meta.id === p.meta.id}
									onclick={() => selectPreset(p)}
								>
									<span class="preset-name">{p.meta.label}</span>
									<span class="preset-desc">{p.meta.description}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if pickedPreset?.meta.requiresPerson}
					<label class="field">
						<span class="field-label">For which person</span>
						<select class="field-input" bind:value={pickedPersonId}>
							{#each discovery.persons as person (person.id)}
								<option value={person.id}>{person.name}</option>
							{/each}
						</select>
					</label>
				{/if}

				<label class="field">
					<span class="field-label">Label</span>
					<input
						type="text"
						class="field-input"
						bind:value={newLabel}
						bind:this={labelEl}
						placeholder="e.g. Garage"
						onkeydown={(e) => {
							if (e.key === 'Enter' && !submitting) commitCreate();
							if (e.key === 'Escape') cancelCreate();
						}}
					/>
				</label>
				<label class="field">
					<span class="field-label">Slug</span>
					<input
						type="text"
						class="field-input mono"
						bind:value={newSlug}
						oninput={() => (slugEdited = true)}
						placeholder="auto"
					/>
					{#if slugErr}
						<span class="field-error">{slugErr}</span>
					{:else}
						<span class="field-hint">URL: <code>/{newSlug || '…'}</code></span>
					{/if}
				</label>
				<label class="field">
					<span class="field-label">Width</span>
					<select class="field-input" bind:value={newWidth}>
						<option value="narrow">Narrow — focused reading</option>
						<option value="default">Default — most pages</option>
						<option value="wide">Wide — tablet / dense grids</option>
					</select>
				</label>

				<div class="actions">
					<button
						class="action confirm"
						type="button"
						disabled={submitting || !!slugErr || !newLabel.trim()}
						onclick={commitCreate}
					>
						{submitting ? 'Creating…' : 'Create + edit'}
					</button>
					<button class="action" type="button" disabled={submitting} onclick={cancelCreate}>
						Cancel
					</button>
				</div>
			</div>
		{:else}
			<div class="new-page-actions">
				<button class="new-page-trigger" type="button" onclick={openCreate}>
					+ New page
				</button>
				<a class="new-page-trigger" href="{base}/settings/pages/import/">
					⇣ Import from Lovelace
				</a>
			</div>
		{/if}
	</div>

	<OutLine label="Existing pages" />

	{#if pages.length === 0}
		<p class="empty">
			No custom pages yet. Tap <strong>+ New page</strong> above to compose your first.
		</p>
	{:else}
		<ul class="page-list">
			{#each pages as p, i (p.slug)}
				<li class="page-row">
					<div class="page-meta">
						<a class="page-name" href="{base}/{p.slug}/">{p.label}</a>
						<div class="page-detail">
							<code>/{p.slug}/</code>
							<span class="sep" aria-hidden="true">·</span>
							<span>{p.blocks.length} block{p.blocks.length === 1 ? '' : 's'}</span>
							{#if p.hiddenFromNav}
								<span class="sep" aria-hidden="true">·</span>
								<span class="page-flag">hidden from nav</span>
							{/if}
						</div>
					</div>
					<div class="page-actions">
						<button
							type="button"
							class="mini"
							disabled={i === 0}
							onclick={() => reorder(p.slug, -1)}
							aria-label="Move up"
						>
							↑
						</button>
						<button
							type="button"
							class="mini"
							disabled={i === pages.length - 1}
							onclick={() => reorder(p.slug, 1)}
							aria-label="Move down"
						>
							↓
						</button>
						<a class="mini" href="{base}/settings/pages/{p.slug}/">Edit</a>
						{#if pendingDelete === p.slug}
							<button class="mini danger" type="button" onclick={() => confirmDelete(p.slug)}>
								Confirm
							</button>
							<button class="mini" type="button" onclick={() => (pendingDelete = null)}>
								Cancel
							</button>
						{:else}
							<button class="mini" type="button" onclick={() => (pendingDelete = p.slug)}>
								Delete
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>

<style>
	/* ── Preset picker ─────────────────────────────────────────── */
	.preset-picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.preset-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-2);
	}

	@media (min-width: 540px) {
		.preset-row {
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		}
	}

	.preset-chip {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		min-height: 64px;
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.preset-chip:hover {
		border-color: var(--accent);
	}

	.preset-chip.active {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.preset-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--accent);
	}

	.preset-desc {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
	}

	/* ── + New page ─────────────────────────────────────────────── */
	.new-page {
		margin-bottom: var(--space-6);
	}

	.new-page-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.new-page-trigger {
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

	.new-page-trigger:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	a.new-page-trigger {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.new-page-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
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

	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-hint {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-dim);
	}

	.field-hint code {
		color: var(--fg-muted);
	}

	.field-error {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--state-alert);
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

	.action:hover:not(:disabled) {
		color: var(--accent);
		border-color: var(--accent);
	}

	.action.confirm {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Page list ──────────────────────────────────────────────── */
	.page-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
	}

	.page-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		transition: border-color var(--ease-quick);
	}

	.page-row:hover {
		border-color: var(--accent);
	}

	.page-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.page-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.3rem;
		color: var(--accent);
		text-decoration: none;
	}

	.page-name:hover {
		text-decoration: underline;
	}

	.page-detail {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.page-detail .sep {
		color: var(--fg-dim);
	}

	.page-flag {
		color: var(--state-alert);
		opacity: 0.85;
	}

	.page-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
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

	.empty {
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
	}

	.empty strong {
		font-style: normal;
		color: var(--accent);
	}
</style>
