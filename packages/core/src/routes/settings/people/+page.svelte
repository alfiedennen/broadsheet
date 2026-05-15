<script lang="ts">
	/**
	 * /settings/people — per-person presence sensor picker.
	 *
	 * Three jobs:
	 *  1. Ranked sensor list per person with ★ best badge, tier
	 *     (BLE/GPS/aggregate) + warnings (iOS suspension etc).
	 *  2. "Other entity…" expansion that opens the picker to ANY
	 *     binary_sensor / sensor / device_tracker / person — the
	 *     escape hatch for users with custom presence templates the
	 *     heuristic doesn't catch.
	 *  3. "+ New person" form that calls HA's `person/create` so
	 *     fresh installs can get to a working state without leaving
	 *     broadsheet for HA Settings.
	 */

	import { tick } from 'svelte';
	import { discovery } from '$lib/discovery';
	import type { DomainPerson } from '$lib/discovery';
	import { curationStore, setPersonPresenceSensor } from '$lib/curation/store.svelte';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { createPerson } from '$lib/ha/registry';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	// Resolve effective sensor per person (curation override OR heuristic suggestion)
	function effectiveSensor(p: DomainPerson): string | null {
		const o = curationStore.current.people.find((x) => x.personId === p.id);
		if (o !== undefined) return o.presenceSensorId;
		return p.suggestedPresenceSensor;
	}

	function effectiveDeviceClass(p: DomainPerson): 'android' | 'ios' | 'unknown' {
		const o = curationStore.current.people.find((x) => x.personId === p.id);
		return o?.deviceClass ?? p.deviceClass;
	}

	async function pickSensor(p: DomainPerson, sensorId: string | null) {
		const ok = await setPersonPresenceSensor(p.id, sensorId, effectiveDeviceClass(p));
		if (ok) showToast(sensorId ? `${p.name}: sensor updated` : `${p.name}: cleared`, 'success');
		else showToast('Save failed — try again', 'error');
	}

	async function setDeviceClass(p: DomainPerson, dc: 'android' | 'ios' | 'unknown') {
		const sensor = effectiveSensor(p);
		const ok = await setPersonPresenceSensor(p.id, sensor, dc);
		if (ok) showToast(`${p.name}: ${dc}`, 'success');
		else showToast('Save failed', 'error');
	}

	/* ─────────────── "Other entity…" picker ────────────────────────
	 * The ranked list is heuristic-curated. Some installs have
	 * presence wired in ways the heuristic can't recognise — a
	 * custom template binary_sensor, a Bermuda area sensor, a Z2M
	 * occupancy sensor on a specific room. The escape hatch surfaces
	 * EVERY entity that could plausibly answer "is this person here"
	 * — binary_sensor / sensor / device_tracker / person — minus the
	 * ones already in the ranked list. User filters by typing.
	 */
	let expandedFor = $state<string | null>(null); // person id whose 'other' list is open
	let otherFilter = $state<Record<string, string>>({}); // per-person typed filter

	function toggleExpanded(pid: string) {
		expandedFor = expandedFor === pid ? null : pid;
	}

	function allCandidateEntities(): string[] {
		const ids: string[] = [];
		for (const id of Object.keys(discoveryStore.states)) {
			if (
				id.startsWith('binary_sensor.') ||
				id.startsWith('sensor.') ||
				id.startsWith('device_tracker.') ||
				id.startsWith('person.')
			) {
				ids.push(id);
			}
		}
		return ids.sort((a, b) => a.localeCompare(b));
	}

	function otherCandidates(p: DomainPerson): string[] {
		const ranked = new Set(p.rankedPresenceSensors.map((r) => r.entityId));
		const filter = (otherFilter[p.id] ?? '').toLowerCase().trim();
		const all = allCandidateEntities().filter((id) => !ranked.has(id));
		if (!filter) return all;
		return all.filter(
			(id) =>
				id.toLowerCase().includes(filter) ||
				(discoveryStore.states[id]?.attributes?.friendly_name ?? '')
					.toString()
					.toLowerCase()
					.includes(filter)
		);
	}

	function entityLabel(id: string): string {
		const fn = discoveryStore.states[id]?.attributes?.friendly_name as string | undefined;
		const state = discoveryStore.states[id]?.state ?? '—';
		return fn ? `${fn} (${state})` : `(${state})`;
	}

	/* ─────────────── "+ New person" form ───────────────────────────
	 * Calls HA's stable person/create WS API. Discovery's person-
	 * registry subscription picks up the new entity within ~500ms,
	 * so this form just submits and clears — no manual insert.
	 *
	 * device_trackers is optional — a person with no trackers is
	 * valid HA, just won't have presence until you pick a sensor in
	 * the section above. Picker only shows trackers not yet assigned
	 * to another person (HA would 400 on a duplicate assignment).
	 */
	let creating = $state<boolean>(false);
	let newName = $state<string>('');
	let newTrackers = $state<Set<string>>(new Set());
	let newNameEl = $state<HTMLInputElement | null>(null);
	let submitting = $state<boolean>(false);

	function openCreate() {
		creating = true;
		newName = '';
		newTrackers = new Set();
		tick().then(() => newNameEl?.focus());
	}
	function cancelCreate() {
		creating = false;
		newName = '';
		newTrackers = new Set();
	}

	const trackersAlreadyAssigned = $derived.by((): Set<string> => {
		const out = new Set<string>();
		for (const p of discovery.persons) {
			for (const t of p.deviceTrackers ?? []) out.add(t);
		}
		return out;
	});

	const availableTrackers = $derived.by(() =>
		Object.keys(discoveryStore.states)
			.filter((id) => id.startsWith('device_tracker.'))
			.filter((id) => !trackersAlreadyAssigned.has(id))
			.sort((a, b) => a.localeCompare(b))
	);

	function toggleTracker(id: string) {
		const next = new Set(newTrackers);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		newTrackers = next;
	}

	async function commitCreate() {
		const name = newName.trim();
		if (!name) {
			showToast('Name required', 'error');
			newNameEl?.focus();
			return;
		}
		submitting = true;
		try {
			const result = await createPerson(name, [...newTrackers]);
			if (result.success) {
				showToast(`Created ${name}`, 'success');
				cancelCreate();
			} else {
				showToast(`Create failed — ${result.error ?? 'unknown'}`, 'error');
			}
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>People · Settings · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · People" />
		{/snippet}
		{#snippet headline()}
			Who lives here.
		{/snippet}
		{#snippet dek()}
			broadsheet ranks each person's available sensors. <span class="badge">★ best</span> is
			our recommendation; pick whichever you trust.
		{/snippet}
	</Hero>

	<div class="new-person">
		{#if creating}
			<div class="new-person-form">
				<input
					type="text"
					class="new-person-input"
					placeholder="Person name — e.g. Sam"
					aria-label="New person name"
					bind:value={newName}
					bind:this={newNameEl}
					onkeydown={(e) => {
						if (e.key === 'Enter' && !submitting) commitCreate();
						if (e.key === 'Escape') cancelCreate();
					}}
				/>
				<div class="new-person-actions">
					<button
						class="action confirm"
						type="button"
						disabled={submitting || !newName.trim()}
						onclick={commitCreate}
					>
						{submitting ? 'Creating…' : 'Create'}
					</button>
					<button
						class="action"
						type="button"
						disabled={submitting}
						onclick={cancelCreate}
					>
						Cancel
					</button>
				</div>
				{#if availableTrackers.length > 0}
					<fieldset class="tracker-picker">
						<legend>Assign device trackers (optional)</legend>
						<p class="tracker-hint">
							Tick any tracker this person owns — usually their phone via the
							HA Companion App. Trackers already assigned to another person
							are hidden.
						</p>
						<ul class="tracker-list">
							{#each availableTrackers as t (t)}
								<li>
									<label class="tracker-row">
										<input
											type="checkbox"
											checked={newTrackers.has(t)}
											onchange={() => toggleTracker(t)}
										/>
										<span class="tracker-id"><code>{t}</code></span>
										<span class="tracker-state">
											{discoveryStore.states[t]?.state ?? '—'}
										</span>
									</label>
								</li>
							{/each}
						</ul>
					</fieldset>
				{:else}
					<p class="tracker-hint">
						No unassigned device trackers found. You can still create the
						person and pin a presence sensor below — or install HA's
						Companion App on a phone first to give them a tracker.
					</p>
				{/if}
			</div>
		{:else}
			<button class="new-person-trigger" type="button" onclick={openCreate}>
				+ New person
			</button>
		{/if}
	</div>

	{#if discovery.persons.length === 0}
		<p class="empty">
			No <code>person.*</code> entities discovered yet. Use <strong>+ New person</strong>
			above, or create them in HA → Settings → People — either path works.
		</p>
	{/if}

	{#each discovery.persons as person (person.id)}
		{@const effective = effectiveSensor(person)}
		{@const dc = effectiveDeviceClass(person)}
		<OutLine label={person.name} />

		<section class="person-card">
			<dl class="meta">
				<dt>Person ID</dt>
				<dd><code>{person.id}</code></dd>
				<dt>Device class</dt>
				<dd class="dc-row">
					<button
						type="button"
						class="dc-pill"
						class:active={dc === 'android'}
						onclick={() => setDeviceClass(person, 'android')}
					>
						Android
					</button>
					<button
						type="button"
						class="dc-pill"
						class:active={dc === 'ios'}
						onclick={() => setDeviceClass(person, 'ios')}
					>
						iOS
					</button>
					<button
						type="button"
						class="dc-pill"
						class:active={dc === 'unknown'}
						onclick={() => setDeviceClass(person, 'unknown')}
					>
						Auto
					</button>
				</dd>
			</dl>

			<h3 class="sensors-title">Presence sensor</h3>
			<ul class="sensor-list" role="radiogroup" aria-label="Pick presence sensor for {person.name}">
				{#each person.rankedPresenceSensors as ranked (ranked.entityId)}
					{@const isPicked = effective === ranked.entityId}
					<li>
						<button
							type="button"
							class="sensor-row"
							class:picked={isPicked}
							class:warn={ranked.warning}
							role="radio"
							aria-checked={isPicked}
							onclick={() => pickSensor(person, ranked.entityId)}
						>
							<span class="radio" aria-hidden="true">
								<span class="dot"></span>
							</span>
							<div class="sensor-meta">
								<div class="sensor-id-row">
									<code class="sensor-id">{ranked.entityId}</code>
									{#if ranked.badge === 'best'}
										<span class="badge best">★ best</span>
									{:else}
										<span class="badge">{ranked.badge}</span>
									{/if}
									{#if ranked.warning}
										<span class="badge warn">⚠</span>
									{/if}
								</div>
								<p class="sensor-reason">{ranked.reason}</p>
							</div>
						</button>
					</li>
				{/each}
				<li>
					<button
						type="button"
						class="sensor-row"
						class:picked={effective === null}
						role="radio"
						aria-checked={effective === null}
						onclick={() => pickSensor(person, null)}
					>
						<span class="radio" aria-hidden="true"><span class="dot"></span></span>
						<div class="sensor-meta">
							<div class="sensor-id-row">
								<code class="sensor-id">(none)</code>
							</div>
							<p class="sensor-reason">
								No tracker. {person.name} won't appear in the manifest until you pick one.
							</p>
						</div>
					</button>
				</li>
			</ul>

			<!--
				Escape hatch: open the picker to ANY plausible entity. Heuristic
				ranks above are the right answer 90% of the time; this covers
				the 10% where someone has a custom template binary_sensor or
				an unusual integration the heuristic doesn't recognise.
			-->
			<details class="other-block" open={expandedFor === person.id}>
				<summary
					class="other-summary"
					onclick={(e) => {
						e.preventDefault();
						toggleExpanded(person.id);
					}}
				>
					Other entity…
					<span class="other-hint">
						any binary_sensor / sensor / device_tracker / person
					</span>
				</summary>
				{#if expandedFor === person.id}
					<input
						type="search"
						class="other-filter"
						placeholder="Filter — type to narrow (e.g. 'alfie' or 'occupancy')"
						bind:value={otherFilter[person.id]}
					/>
					{@const matches = otherCandidates(person)}
					{#if matches.length === 0}
						<p class="empty">
							No other entities match. Try a different filter, or check what's
							in <code>binary_sensor.*</code> / <code>sensor.*</code> in HA.
						</p>
					{:else}
						<p class="other-count">
							{matches.length} other entity{matches.length === 1 ? '' : ' (entities)'}
						</p>
						<ul class="other-list" role="radiogroup" aria-label="Other entities">
							{#each matches.slice(0, 50) as id (id)}
								{@const isPicked = effective === id}
								<li>
									<button
										type="button"
										class="other-row"
										class:picked={isPicked}
										role="radio"
										aria-checked={isPicked}
										onclick={() => pickSensor(person, id)}
									>
										<code class="sensor-id">{id}</code>
										<span class="other-label">{entityLabel(id)}</span>
									</button>
								</li>
							{/each}
						</ul>
						{#if matches.length > 50}
							<p class="other-truncated">
								… {matches.length - 50} more — narrow with the filter above.
							</p>
						{/if}
					{/if}
				{/if}
			</details>
		</section>
	{/each}
</PageShell>

<style>
	/* ── + New person form ─────────────────────────────────────────── */
	.new-person {
		margin-bottom: var(--space-6);
	}

	.new-person-trigger {
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

	.new-person-trigger:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.new-person-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--bg-card);
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
	}

	.new-person-input {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 44px;
	}

	.new-person-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.new-person-actions {
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

	.tracker-picker {
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		margin: 0;
	}

	.tracker-picker legend {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: 0 var(--space-2);
	}

	.tracker-hint {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
		line-height: var(--leading-snug);
		margin: 0 0 var(--space-3);
	}

	.tracker-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-height: 240px;
		overflow-y: auto;
	}

	.tracker-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		cursor: pointer;
	}

	.tracker-row:hover {
		border-color: var(--accent);
	}

	.tracker-id code {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.tracker-state {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	/* ── "Other entity…" expansion ─────────────────────────────────── */
	.other-block {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px dashed var(--rule);
	}

	.other-summary {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		cursor: pointer;
		min-height: 36px;
		list-style: none;
		transition: color var(--ease-quick);
	}

	.other-summary::-webkit-details-marker {
		display: none;
	}

	.other-summary:hover {
		color: var(--accent);
	}

	.other-summary::before {
		content: '+ ';
		color: var(--accent);
	}

	.other-block[open] .other-summary::before {
		content: '− ';
	}

	.other-hint {
		font-style: italic;
		text-transform: lowercase;
		color: var(--fg-dim);
		font-size: 0.7rem;
	}

	.other-filter {
		display: block;
		width: 100%;
		max-width: 480px;
		margin: var(--space-3) 0 var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-body);
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		min-height: 40px;
	}

	.other-filter:focus {
		outline: none;
		border-color: var(--accent);
	}

	.other-count {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-dim);
		margin: 0 0 var(--space-2);
	}

	.other-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 360px;
		overflow-y: auto;
	}

	.other-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		width: 100%;
		min-height: 40px;
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}

	.other-row:hover {
		border-color: var(--accent);
	}

	.other-row.picked {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.other-label {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
	}

	.other-truncated {
		font-family: var(--font-body);
		font-style: italic;
		font-size: var(--text-caption);
		color: var(--fg-dim);
		margin: var(--space-2) 0 0;
	}

	.empty {
		color: var(--fg-muted);
		font-style: italic;
	}

	.empty code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--fg);
	}

	.person-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.meta {
		display: grid;
		grid-template-columns: 8rem 1fr;
		gap: var(--space-2) var(--space-4);
		margin: 0;
	}

	.meta dt {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.meta dd {
		margin: 0;
	}

	.meta code {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.dc-row {
		display: flex;
		gap: var(--space-2);
	}

	.dc-pill {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
		min-height: 32px;
		transition: color var(--ease-quick), border-color var(--ease-quick);
	}

	.dc-pill:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.dc-pill.active {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.sensors-title {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: var(--space-2) 0 0;
	}

	.sensor-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
	}

	.sensor-row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-3) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-align: left;
		color: var(--fg);
		margin-bottom: var(--space-2);
		transition: border-color var(--ease-quick), background var(--ease-quick);
		width: 100%;
	}

	.sensor-row:hover {
		border-color: var(--accent);
	}

	.sensor-row.picked {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.radio {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid var(--fg-muted);
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		margin-top: 2px;
	}

	.sensor-row.picked .radio {
		border-color: var(--accent);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: transparent;
		transition: background var(--ease-quick);
	}

	.sensor-row.picked .dot {
		background: var(--accent);
	}

	.sensor-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.sensor-id-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.sensor-id {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg);
	}

	.sensor-reason {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}

	.badge {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
		border: 1px solid var(--rule);
	}

	.badge.best {
		color: var(--accent);
		border-color: var(--accent);
	}

	.badge.warn {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	.sensor-row.warn .sensor-reason {
		color: var(--state-alert);
	}
</style>
