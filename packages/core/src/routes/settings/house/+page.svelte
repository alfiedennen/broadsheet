<script lang="ts">
	/**
	 * /settings/house — areas + entities curation.
	 *
	 * The most-impactful screen — this is where the user fixes the
	 * ugly raw HA area names (alfies_office → Alfie's office), hides
	 * entities they don't want surfaced, and pins entities to the
	 * pages they expect.
	 */

	import { discovery } from '$lib/discovery';
	import type { DomainArea, DomainEntity } from '$lib/discovery';
	import { curationStore, hideArea, renameArea, hideEntity, renameEntity } from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	// Sort areas: visible first, then hidden (still curatable), then Unsorted
	const sortedAreas = $derived.by(() => {
		// Reactive on curation tick
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		const all = [...discovery.areas];
		return all.sort((a, b) => {
			if (a.id === '__unsorted__') return 1;
			if (b.id === '__unsorted__') return -1;
			return a.name.localeCompare(b.name);
		});
	});

	let expandedAreaId = $state<string | null>(null);

	function toggleExpand(id: string) {
		expandedAreaId = expandedAreaId === id ? null : id;
	}

	// Edit-buffer for the in-place rename input. Keyed by area_id.
	let renameBuffer = $state<Record<string, string>>({});
	let entityRenameBuffer = $state<Record<string, string>>({});

	function startRenameArea(area: DomainArea) {
		// Look up the raw HA name (since `area.name` might already be a curated rename)
		const raw = discoveryStore.areas.find((a) => a.area_id === area.id);
		renameBuffer[area.id] = curationStore.current.areas[area.id]?.rename ?? raw?.name ?? area.name;
	}

	async function commitRenameArea(areaId: string) {
		const value = (renameBuffer[areaId] ?? '').trim();
		const ok = await renameArea(areaId, value || null);
		if (ok) showToast(value ? `Renamed to "${value}"` : 'Rename cleared', 'success');
		else showToast('Save failed — try again', 'error');
		delete renameBuffer[areaId];
	}

	function cancelRenameArea(areaId: string) {
		delete renameBuffer[areaId];
	}

	async function toggleAreaHidden(area: DomainArea) {
		const next = !curationStore.current.areas[area.id]?.hidden;
		const ok = await hideArea(area.id, next);
		if (ok) showToast(next ? `${area.name} hidden` : `${area.name} visible`, 'success');
		else showToast('Save failed', 'error');
	}

	function startRenameEntity(entity: DomainEntity) {
		entityRenameBuffer[entity.id] =
			curationStore.current.entities[entity.id]?.rename ?? entity.name;
	}

	async function commitRenameEntity(entityId: string) {
		const value = (entityRenameBuffer[entityId] ?? '').trim();
		const ok = await renameEntity(entityId, value || null);
		if (ok) showToast(value ? `Renamed to "${value}"` : 'Rename cleared', 'success');
		else showToast('Save failed — try again', 'error');
		delete entityRenameBuffer[entityId];
	}

	function cancelRenameEntity(entityId: string) {
		delete entityRenameBuffer[entityId];
	}

	async function toggleEntityHidden(entity: DomainEntity) {
		const next = !curationStore.current.entities[entity.id]?.hidden;
		const ok = await hideEntity(entity.id, next);
		if (ok) showToast(next ? `${entity.name} hidden` : `${entity.name} visible`, 'success');
		else showToast('Save failed', 'error');
	}

	// Helpers
	function rawNameFor(areaId: string): string | null {
		return discoveryStore.areas.find((a) => a.area_id === areaId)?.name ?? null;
	}

	function entityCountSummary(area: DomainArea): string {
		const parts: string[] = [];
		const map: Array<[number, string]> = [
			[area.lights.length, 'lights'],
			[area.switches.length, 'switches'],
			[area.climates.length, 'climate'],
			[area.locks.length, 'locks'],
			[area.contacts.length, 'contacts'],
			[area.cameras.length, 'cameras'],
			[area.tvs.length, 'tvs'],
			[area.media.length, 'media'],
			[area.remotes.length, 'remotes'],
			[area.sensors.length, 'sensors'],
			[area.scenes.length, 'scenes'],
			[area.otherEntities.length, 'other']
		];
		for (const [n, label] of map) {
			if (n > 0) parts.push(`${n} ${label}`);
		}
		return parts.length === 0 ? '0 entities' : parts.join(' · ');
	}

	function isHidden(area: DomainArea): boolean {
		return !!curationStore.current.areas[area.id]?.hidden;
	}

	function isEntityHidden(entity: DomainEntity): boolean {
		return !!curationStore.current.entities[entity.id]?.hidden;
	}

	function allEntitiesIn(area: DomainArea): DomainEntity[] {
		return [
			...area.lights,
			...area.switches,
			...area.climates,
			...area.locks,
			...area.contacts,
			...area.cameras,
			...area.tvs,
			...area.media,
			...area.remotes,
			...area.sensors,
			...area.scenes,
			...area.otherEntities
		];
	}
</script>

<svelte:head>
	<title>House · Settings · broadsheet</title>
</svelte:head>

<PageShell width="wide">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · House" />
		{/snippet}
		{#snippet headline()}
			Your areas + entities.
		{/snippet}
		{#snippet dek()}
			Tap a row to expand. Renames + hides save immediately. To assign an
			Unsorted entity to a room, set its area in HA itself — broadsheet picks
			it up within 5 seconds.
		{/snippet}
	</Hero>

	<OutLine label="Areas" />

	<ul class="area-list">
		{#each sortedAreas as area (area.id)}
			{@const expanded = expandedAreaId === area.id}
			{@const renaming = renameBuffer[area.id] !== undefined}
			{@const hidden = isHidden(area)}
			{@const raw = rawNameFor(area.id)}
			{@const isUnsorted = area.id === '__unsorted__'}
			<li class="area-row" class:expanded class:hidden class:unsorted={isUnsorted}>
				<header class="area-head">
					{#if renaming}
						<div class="title-block rename-mode">
							<input
								type="text"
								class="rename-input"
								bind:value={renameBuffer[area.id]}
								onkeydown={(e) => {
									if (e.key === 'Enter') commitRenameArea(area.id);
									if (e.key === 'Escape') cancelRenameArea(area.id);
								}}
								placeholder={raw ?? area.name}
							/>
							<span class="area-count">{entityCountSummary(area)}</span>
						</div>
					{:else}
						<button class="expand" type="button" onclick={() => toggleExpand(area.id)} aria-expanded={expanded}>
							<span class="chev">{expanded ? '−' : '+'}</span>
							<div class="title-block">
								<span class="area-name">{area.name}</span>
								{#if raw && raw !== area.name && !isUnsorted}
									<span class="raw-name">was: {raw}</span>
								{/if}
								<span class="area-count">{entityCountSummary(area)}</span>
							</div>
						</button>
					{/if}

					<div class="actions" role="group">
						{#if renaming}
							<button class="action confirm" type="button" onclick={() => commitRenameArea(area.id)}>
								Save
							</button>
							<button class="action" type="button" onclick={() => cancelRenameArea(area.id)}>
								Cancel
							</button>
						{:else if !isUnsorted}
							<button class="action" type="button" onclick={() => startRenameArea(area)}>
								Rename
							</button>
							<button class="action" type="button" onclick={() => toggleAreaHidden(area)}>
								{hidden ? 'Show' : 'Hide'}
							</button>
						{:else}
							<span class="hint">Cannot rename Unsorted</span>
						{/if}
					</div>
				</header>

				{#if expanded}
					<div class="entities">
						{#each allEntitiesIn(area) as entity (entity.id)}
							{@const eRenaming = entityRenameBuffer[entity.id] !== undefined}
							{@const eHidden = isEntityHidden(entity)}
							<div class="entity-row" class:hidden={eHidden}>
								<div class="entity-info">
									{#if eRenaming}
										<input
											type="text"
											class="rename-input"
											bind:value={entityRenameBuffer[entity.id]}
											onkeydown={(e) => {
												if (e.key === 'Enter') commitRenameEntity(entity.id);
												if (e.key === 'Escape') cancelRenameEntity(entity.id);
											}}
													/>
									{:else}
										<span class="entity-name">{entity.name}</span>
									{/if}
									<code class="entity-id">{entity.id}</code>
								</div>
								<div class="entity-actions">
									{#if eRenaming}
										<button class="mini confirm" type="button" onclick={() => commitRenameEntity(entity.id)}>
											Save
										</button>
										<button class="mini" type="button" onclick={() => cancelRenameEntity(entity.id)}>
											Cancel
										</button>
									{:else}
										<button class="mini" type="button" onclick={() => startRenameEntity(entity)}>
											Rename
										</button>
										<button class="mini" type="button" onclick={() => toggleEntityHidden(entity)}>
											{eHidden ? 'Show' : 'Hide'}
										</button>
									{/if}
								</div>
							</div>
						{/each}
						{#if allEntitiesIn(area).length === 0}
							<p class="empty">No entities.</p>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</PageShell>

<style>
	.area-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.area-row {
		border-bottom: 1px solid var(--rule);
	}

	.area-row.hidden .area-name {
		color: var(--fg-dim);
		text-decoration: line-through;
	}

	.area-row.unsorted .area-name {
		color: var(--accent);
		font-style: italic;
	}

	.area-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-2);
	}

	.expand {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		text-align: left;
		color: var(--fg);
		min-width: 0;
	}

	.chev {
		font-family: var(--font-mono);
		font-size: 1.2rem;
		color: var(--fg-muted);
		flex: 0 0 1.2rem;
		text-align: center;
	}

	.title-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.area-name {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--fg);
		line-height: 1.2;
	}

	.raw-name {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-dim);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
	}

	.area-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		flex: 0 0 auto;
	}

	.action {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 36px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.action:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.action.confirm {
		color: var(--accent);
		border-color: var(--accent);
	}

	.hint {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
		font-style: italic;
		align-self: center;
	}

	.rename-input {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--accent);
		border-radius: var(--radius-input);
		width: 100%;
	}

	.entities {
		padding: var(--space-3) var(--space-3) var(--space-4) calc(var(--space-3) + 1.2rem);
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 1px solid var(--rule);
		background: var(--bg-card);
	}

	.entity-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2);
		border-bottom: 1px solid var(--rule);
	}

	.entity-row:last-child {
		border-bottom: none;
	}

	.entity-row.hidden .entity-name {
		color: var(--fg-dim);
		text-decoration: line-through;
	}

	.entity-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.entity-name {
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
	}

	.entity-id {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--fg-dim);
	}

	.entity-actions {
		display: flex;
		gap: var(--space-1);
		flex: 0 0 auto;
	}

	.mini {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: var(--track-caption);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 32px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.mini:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.mini.confirm {
		color: var(--accent);
		border-color: var(--accent);
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
		font-size: var(--text-caption);
	}
</style>
