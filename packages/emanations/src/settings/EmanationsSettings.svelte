<script lang="ts">
	/**
	 * Emanations settings panel — rendered at
	 * /settings/plugins/emanations/config when the plugin is enabled.
	 *
	 * Three sections:
	 *   1. Behaviour — `usePaintings` + `fadeMs` (the existing v0.1 fields)
	 *   2. Painting library — upload / list / delete the user's images,
	 *      via the P5 plugin-data API. Files persist on the addon's
	 *      /data/ volume across updates.
	 *   3. Per-room paintings — the mapping. Rows = discovered areas,
	 *      cells = variants (one per combination of who's home, plus
	 *      `empty`). Persisted to plugins.emanations.config.paintingSets.
	 *
	 * Renderer (layer 3) consumes the mapping via
	 * curation.plugins.emanations.config.paintingSets — generalises the
	 * old harold-home Alfie/Elena hardcoding to N discovered persons.
	 */
	import {
		SettingsRow,
		useCurationField,
		discovery,
		listPluginData,
		uploadPluginData,
		deletePluginData,
		pluginDataUrl,
		type PluginDataFile,
		type DomainPerson
	} from '@broadsheet/core';
	import { onMount } from 'svelte';

	/* ── Behaviour fields (existing) ──────────────────────────────── */
	const usePaintings = useCurationField<boolean>('plugins.emanations.config.usePaintings');
	const fadeMs = useCurationField<number>('plugins.emanations.config.fadeMs');
	const DEFAULT_USE_PAINTINGS = true;
	const DEFAULT_FADE_MS = 800;

	/* ── Painting library (uploads) ───────────────────────────────── */
	let files = $state<PluginDataFile[]>([]);
	let listError = $state<string | null>(null);
	let uploading = $state<boolean>(false);
	let uploadError = $state<string | null>(null);
	let dragOver = $state<boolean>(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	async function refreshFiles() {
		try {
			files = await listPluginData('emanations');
			listError = null;
		} catch (e) {
			listError = (e as Error).message;
		}
	}

	onMount(refreshFiles);

	async function handleFiles(fileList: FileList | File[]) {
		const arr = Array.from(fileList);
		if (arr.length === 0) return;
		uploading = true;
		uploadError = null;
		try {
			for (const f of arr) {
				await uploadPluginData('emanations', f);
			}
			await refreshFiles();
		} catch (e) {
			uploadError = (e as Error).message;
		} finally {
			uploading = false;
		}
	}

	async function removeFile(filename: string) {
		if (!confirm(`Delete ${filename}? Any room mappings using it will be cleared.`)) return;
		try {
			await deletePluginData('emanations', filename);
			cleanupMappingFor(filename);
			await refreshFiles();
		} catch (e) {
			uploadError = (e as Error).message;
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
	}
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}
	function onDragLeave() {
		dragOver = false;
	}

	/* ── Person + variant derivation ──────────────────────────────── */
	function personSlug(p: DomainPerson): string {
		return p.id.replace(/^person\./, '');
	}
	function personLabel(p: DomainPerson): string {
		return p.name || personSlug(p);
	}

	const eligiblePersons = $derived(
		discovery.persons.filter((p) => p.suggestedPresenceSensor !== null)
	);

	/**
	 * All variant keys for the current eligible-person set: `empty` plus
	 * every non-empty subset, expressed as sorted-slugs joined by `+`.
	 * For 2 persons → 4 keys; for 3 → 8; for 4 → 16. Above 4 the panel
	 * surfaces a "this is a lot" hint.
	 */
	const variantKeys = $derived.by(() => {
		const slugs = eligiblePersons.map(personSlug).sort();
		const keys: string[] = ['empty'];
		const n = slugs.length;
		for (let mask = 1; mask < 1 << n; mask++) {
			const present: string[] = [];
			for (let i = 0; i < n; i++) {
				if (mask & (1 << i)) present.push(slugs[i]);
			}
			keys.push(present.join('+'));
		}
		return keys;
	});

	const slugToLabel = $derived.by(() => {
		const m: Record<string, string> = {};
		for (const p of eligiblePersons) m[personSlug(p)] = personLabel(p);
		return m;
	});

	function variantLabel(key: string): string {
		if (key === 'empty') return 'Empty';
		return key
			.split('+')
			.map((s) => slugToLabel[s] ?? s)
			.join(' + ');
	}

	/* ── Areas (rows of the mapping table) ────────────────────────── */
	const eligibleAreas = $derived(discovery.areas.filter((a) => a.id !== '__unsorted__'));

	/* ── Mapping (paintingSets) ───────────────────────────────────── */
	type AreaMapping = Record<string, string | null>; // variantKey -> filename
	type SetMapping = Record<string, AreaMapping>; // areaId -> AreaMapping
	/**
	 * personImages is parallel to per-area `sets` — keyed by personSlug,
	 * holds the per-person away image (and could carry future per-person
	 * states later, e.g. `sleeping`). Lives on the paintingSets root, NOT
	 * inside `sets`, so it isn't part of the active painting-set rotation
	 * — an "away" image means the same thing regardless of which set is
	 * active.
	 */
	type PaintingSetsConfig = {
		active: string;
		sets: Record<string, SetMapping>;
		personImages?: Record<string, { away?: string | null }>;
	};
	const ACTIVE_DEFAULT: PaintingSetsConfig = { active: 'default', sets: { default: {} } };

	const paintingSets = useCurationField<PaintingSetsConfig>(
		'plugins.emanations.config.paintingSets'
	);

	function activeSetName(): string {
		return paintingSets.value?.active ?? ACTIVE_DEFAULT.active;
	}

	function getMapping(areaId: string, variantKey: string): string | null {
		const cfg = paintingSets.value ?? ACTIVE_DEFAULT;
		return cfg.sets[cfg.active]?.[areaId]?.[variantKey] ?? null;
	}

	function setMapping(areaId: string, variantKey: string, filename: string | null) {
		const cfg = paintingSets.value ?? ACTIVE_DEFAULT;
		const setName = cfg.active;
		const next: PaintingSetsConfig = {
			active: setName,
			sets: { ...cfg.sets, [setName]: { ...(cfg.sets[setName] ?? {}) } }
		};
		next.sets[setName][areaId] = { ...(next.sets[setName][areaId] ?? {}) };
		if (!filename) {
			delete next.sets[setName][areaId][variantKey];
		} else {
			next.sets[setName][areaId][variantKey] = filename;
		}
		paintingSets.value = next;
	}

	function getPersonAway(slug: string): string | null {
		return paintingSets.value?.personImages?.[slug]?.away ?? null;
	}

	function setPersonAway(slug: string, filename: string | null) {
		const cfg = paintingSets.value ?? ACTIVE_DEFAULT;
		const personImages = { ...(cfg.personImages ?? {}) };
		const entry = { ...(personImages[slug] ?? {}) };
		if (!filename) delete entry.away;
		else entry.away = filename;
		if (Object.keys(entry).length === 0) delete personImages[slug];
		else personImages[slug] = entry;
		paintingSets.value = { ...cfg, personImages };
	}

	/** Clear any mapping that references a deleted file (sets + personImages). */
	function cleanupMappingFor(filename: string) {
		const cfg = paintingSets.value;
		if (!cfg) return;
		let dirty = false;
		const next: PaintingSetsConfig = {
			...cfg,
			sets: { ...cfg.sets },
			personImages: { ...(cfg.personImages ?? {}) }
		};
		for (const setName of Object.keys(next.sets)) {
			next.sets[setName] = { ...next.sets[setName] };
			for (const areaId of Object.keys(next.sets[setName])) {
				const m = { ...next.sets[setName][areaId] };
				for (const vk of Object.keys(m)) {
					if (m[vk] === filename) {
						delete m[vk];
						dirty = true;
					}
				}
				next.sets[setName][areaId] = m;
			}
		}
		for (const slug of Object.keys(next.personImages ?? {})) {
			const entry = { ...(next.personImages![slug] ?? {}) };
			for (const k of Object.keys(entry) as Array<keyof typeof entry>) {
				if (entry[k] === filename) {
					delete entry[k];
					dirty = true;
				}
			}
			if (Object.keys(entry).length === 0) delete next.personImages![slug];
			else next.personImages![slug] = entry;
		}
		if (dirty) paintingSets.value = next;
	}

	function fmtSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}
</script>

<div class="panel">
	<!-- ── Section 1 — Behaviour ────────────────────────────────── -->
	<SettingsRow
		label="Painting mode"
		hint="Use room paintings when available; off forces the procedural field."
	>
		<button
			type="button"
			class="toggle"
			class:on={usePaintings.value ?? DEFAULT_USE_PAINTINGS}
			role="switch"
			aria-checked={usePaintings.value ?? DEFAULT_USE_PAINTINGS}
			onclick={() => (usePaintings.value = !(usePaintings.value ?? DEFAULT_USE_PAINTINGS))}
		>
			<span class="toggle-track"><span class="toggle-thumb"></span></span>
			<span class="toggle-label">
				{(usePaintings.value ?? DEFAULT_USE_PAINTINGS) ? 'On' : 'Off'}
			</span>
		</button>
	</SettingsRow>

	<SettingsRow label="Cross-fade duration" hint="How long state transitions take.">
		<input
			class="num"
			type="number"
			min={100}
			max={5000}
			step={100}
			value={fadeMs.value ?? DEFAULT_FADE_MS}
			onchange={(e) => (fadeMs.value = Number(e.currentTarget.value))}
		/>
		<span class="unit">ms</span>
	</SettingsRow>

	<!-- ── Section 2 — Painting library ─────────────────────────── -->
	<h3 class="section-title">Painting library</h3>
	<p class="section-hint">
		Upload your own room paintings — PNG, JPG, SVG, WebP, GIF, up to 5 MB
		each. Drop into the box or click to browse. Uploads persist across
		add-on updates. Filenames are kept as-is.
	</p>

	<div
		class="dropzone"
		class:over={dragOver}
		class:uploading
		role="button"
		tabindex="0"
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={() => fileInputEl?.click()}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fileInputEl?.click();
			}
		}}
	>
		{#if uploading}
			Uploading…
		{:else if dragOver}
			Drop to upload
		{:else}
			Drop images here, or <span class="link">browse</span>
		{/if}
	</div>
	<input
		type="file"
		accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
		multiple
		bind:this={fileInputEl}
		style="display:none"
		onchange={(e) => {
			const fl = (e.currentTarget as HTMLInputElement).files;
			if (fl) handleFiles(fl);
			(e.currentTarget as HTMLInputElement).value = '';
		}}
	/>

	{#if uploadError}
		<p class="error">Upload error: {uploadError}</p>
	{/if}
	{#if listError}
		<p class="error">Couldn't list uploads: {listError}</p>
	{/if}

	{#if files.length === 0}
		<p class="empty">No uploads yet. Drag an image into the box above.</p>
	{:else}
		<div class="thumbs">
			{#each files as f (f.filename)}
				<figure class="thumb">
					<img src={pluginDataUrl('emanations', f.filename)} alt={f.filename} loading="lazy" />
					<figcaption>
						<span class="thumb-meta">
							<span class="thumb-name" title={f.filename}>{f.filename}</span>
							<span class="thumb-size">{fmtSize(f.size)}</span>
						</span>
						<button type="button" class="thumb-del" onclick={() => removeFile(f.filename)}>
							Delete
						</button>
					</figcaption>
				</figure>
			{/each}
		</div>
	{/if}

	<!-- ── Section 3 — Per-room paintings ───────────────────────── -->
	<h3 class="section-title">Per-room paintings</h3>
	<p class="section-hint">
		Pick which uploaded image renders for each combination of who's home.
		Empty cells fall back to the procedural field.
		{#if eligiblePersons.length === 0}
			<strong
				>No people with a presence sensor yet — set one in /settings/people first.</strong
			>
		{:else if eligiblePersons.length > 4}
			<strong
				>{eligiblePersons.length} people = {1 << eligiblePersons.length} variants per room — that's
				a lot. Consider trimming the eligible set in /settings/people.</strong
			>
		{/if}
	</p>

	{#if eligiblePersons.length > 0 && eligibleAreas.length > 0}
		<p class="set-meta">
			Active painting set: <strong>{activeSetName()}</strong>
			<span class="set-hint">
				· Multiple named sets land in v0.1.x; for now everything maps under "default".
			</span>
		</p>
		<div class="mapping">
			{#each eligibleAreas as area (area.id)}
				<section class="map-area">
					<h4 class="area-name">{area.name}</h4>
					<div class="variant-grid">
						{#each variantKeys as vk (vk)}
							{@const mapped = getMapping(area.id, vk)}
							<div class="variant-cell">
								<span class="variant-label">{variantLabel(vk)}</span>
								<select
									class="variant-pick"
									value={mapped ?? ''}
									onchange={(e) =>
										setMapping(
											area.id,
											vk,
											(e.currentTarget as HTMLSelectElement).value || null
										)}
								>
									<option value="">— none —</option>
									{#each files as f (f.filename)}
										<option value={f.filename}>{f.filename}</option>
									{/each}
								</select>
								{#if mapped}
									<img
										class="variant-thumb"
										src={pluginDataUrl('emanations', mapped)}
										alt={mapped}
										loading="lazy"
									/>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}

	<!-- ── Section 4 — When they're away (per-person) ──────────────── -->
	{#if eligiblePersons.length > 0}
		<h3 class="section-title">When they're away</h3>
		<p class="section-hint">
			For each person, pick the image to render when they aren't in any room
			(sensor reads <code>not_home</code>, <code>away</code>, or <code>unknown</code>).
			The /emanations page shows one card per person — when they're absent, this
			image fills their card.
		</p>
		<div class="mapping">
			{#each eligiblePersons as p (p.id)}
				{@const slug = personSlug(p)}
				{@const away = getPersonAway(slug)}
				<section class="map-area">
					<h4 class="area-name">{p.name}</h4>
					<div class="variant-grid">
						<div class="variant-cell">
							<span class="variant-label">Away image</span>
							<select
								class="variant-pick"
								value={away ?? ''}
								onchange={(e) =>
									setPersonAway(slug, (e.currentTarget as HTMLSelectElement).value || null)}
							>
								<option value="">— none —</option>
								{#each files as f (f.filename)}
									<option value={f.filename}>{f.filename}</option>
								{/each}
							</select>
							{#if away}
								<img
									class="variant-thumb"
									src={pluginDataUrl('emanations', away)}
									alt={away}
									loading="lazy"
								/>
							{/if}
						</div>
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.toggle-track {
		width: 44px;
		height: 24px;
		border-radius: var(--radius-pill);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		display: flex;
		align-items: center;
		padding: 2px;
		transition: background var(--ease-quick), border-color var(--ease-quick);
	}

	.toggle.on .toggle-track {
		background: var(--accent-glow);
		border-color: var(--accent);
	}

	.toggle-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--fg-muted);
		transition: transform var(--ease-quick), background var(--ease-quick);
	}

	.toggle.on .toggle-thumb {
		transform: translateX(20px);
		background: var(--accent);
	}

	.toggle-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.toggle.on .toggle-label {
		color: var(--accent);
	}

	.num {
		width: 5.5rem;
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.num:focus {
		outline: none;
		border-color: var(--accent);
	}

	.unit {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	/* ── library + mapping sections ───────────────────────────────── */
	.section-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--accent);
		margin: var(--space-6) 0 var(--space-2);
		font-weight: 400;
	}

	.section-hint {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
		margin: 0 0 var(--space-3);
		max-width: 64ch;
	}

	.section-hint strong {
		color: var(--accent);
		font-weight: 500;
	}

	.dropzone {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 96px;
		padding: var(--space-4);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		color: var(--fg-muted);
		font-size: var(--text-caption);
		cursor: pointer;
		transition: border-color var(--ease-quick), background var(--ease-quick),
			color var(--ease-quick);
	}

	.dropzone:hover,
	.dropzone.over {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	.dropzone.uploading {
		opacity: 0.6;
		cursor: wait;
	}

	.link {
		color: var(--accent);
		text-decoration: underline;
		margin-left: 0.25em;
	}

	.error {
		color: var(--state-alert);
		font-size: var(--text-caption);
		margin: var(--space-2) 0 0;
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
		font-size: var(--text-caption);
		margin: var(--space-3) 0 0;
	}

	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.thumb {
		margin: 0;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.thumb img {
		width: 100%;
		height: 110px;
		object-fit: cover;
		display: block;
		background: #000;
	}

	.thumb figcaption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		gap: var(--space-2);
	}

	.thumb-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.thumb-name {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.thumb-size {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--fg-dim);
	}

	.thumb-del {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: 2px var(--space-2);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		background: transparent;
		cursor: pointer;
		flex: 0 0 auto;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.thumb-del:hover {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	.set-meta {
		font-size: var(--text-caption);
		color: var(--fg-muted);
		margin: 0 0 var(--space-3);
	}

	.set-meta strong {
		color: var(--accent);
		font-weight: 500;
	}

	.set-hint {
		font-style: italic;
		color: var(--fg-dim);
	}

	.mapping {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.map-area {
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-card);
	}

	.area-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.1rem;
		color: var(--fg);
		margin: 0 0 var(--space-3);
		font-weight: 400;
	}

	.variant-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
	}

	.variant-cell {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.variant-label {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.variant-pick {
		font-family: var(--font-caption);
		font-size: var(--text-caption);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.variant-pick:focus {
		outline: none;
		border-color: var(--accent);
	}

	.variant-thumb {
		width: 100%;
		max-height: 80px;
		object-fit: cover;
		border-radius: var(--radius-card);
		background: #000;
	}
</style>
