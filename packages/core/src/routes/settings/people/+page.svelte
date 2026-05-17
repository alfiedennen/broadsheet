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

	import { tick, onMount } from 'svelte';
	import { discovery } from '$lib/discovery';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import type { DomainPerson } from '$lib/discovery';
	import { curationStore, setPersonPresenceSensor } from '$lib/curation/store.svelte';
	import { createPerson } from '$lib/ha/registry';
	import { showToast } from '$lib/stores/toast.svelte';
	import { wireHashHighlight } from '$lib/utils/hashNavigate';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import PresenceSensorPicker from '$lib/components/PresenceSensorPicker.svelte';

	// Theme H: when a home-tile InlinePin sends the user here with a
	// fragment like #person.alfie_dennen, scroll to + flash that row.
	onMount(() => wireHashHighlight());

	function effectiveDeviceClass(p: DomainPerson): 'android' | 'ios' | 'unknown' {
		const o = curationStore.current.people.find((x) => x.personId === p.id);
		return o?.deviceClass ?? p.deviceClass;
	}

	async function setDeviceClass(p: DomainPerson, dc: 'android' | 'ios' | 'unknown') {
		const o = curationStore.current.people.find((x) => x.personId === p.id);
		const sensor = o !== undefined ? o.presenceSensorId : p.suggestedPresenceSensor;
		const ok = await setPersonPresenceSensor(p.id, sensor, dc);
		if (ok) showToast(`${p.name}: ${dc}`, 'success');
		else showToast('Save failed', 'error');
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
		{@const dc = effectiveDeviceClass(person)}
		<OutLine label={person.name} />

		<!-- id={person.id} is the hash-navigate target for InlinePin
		     navigate-with-context from home tiles (#person.alfie_dennen
		     etc). See wireHashHighlight() onMount above. -->
		<section class="person-card" id={person.id}>
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
			<!-- Theme H: picker UI extracted to PresenceSensorPicker so
			     the same component renders here AND in the home-tile
			     InlinePin popover. Full-form (not compact) since this
			     IS the long-form settings surface. -->
			<PresenceSensorPicker {person} />
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

	/* Kept for the Hero dek's "★ best" inline pill. The picker UI
	 * itself ships its own .badge inside PresenceSensorPicker. */
	.badge {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		color: var(--accent);
		border: 1px solid var(--accent);
	}
</style>
