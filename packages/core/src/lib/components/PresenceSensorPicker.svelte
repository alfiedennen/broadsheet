<script lang="ts">
	/**
	 * PresenceSensorPicker — Theme H reusable picker.
	 *
	 * Extracted from /settings/people so the same UI ships in
	 *   - /settings/people (long-form, with device-class chips)
	 *   - InlinePin popover on the home tile (compact, just the radio
	 *     group + escape hatch)
	 *
	 * Renders the ranked candidate list from `person.rankedPresenceSensors`
	 * (★ BEST + tier badge + per-candidate reason from heuristics.ts),
	 * a "(none)" option to clear the binding, and an expandable
	 * "Other entity…" escape hatch listing every plausible HA entity
	 * (binary_sensor / sensor / device_tracker / person) minus those
	 * already in the ranked list, with type-to-filter.
	 *
	 * `compact={true}` is the inline-popover variant: skips the
	 * device-class chips (those belong on the long-form settings page
	 * where the user is already in "configure" mode). Pick handler
	 * still uses the person's currently-effective device class.
	 *
	 * `onCommit?` fires after a successful pick. Callers that host this
	 * in a popover use it to close the popover automatically — saves the
	 * tap-outside-to-dismiss step.
	 *
	 * Spec: docs/plans/plan-theme-H-inline-overrides.md.
	 */

	import type { DomainPerson } from '$lib/discovery';
	import { discoveryStore } from '$lib/discovery/store.svelte';
	import { curationStore, setPersonPresenceSensor } from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';

	let {
		person,
		compact = false,
		onCommit
	}: {
		person: DomainPerson;
		compact?: boolean;
		onCommit?: () => void;
	} = $props();

	const effective = $derived.by(() => {
		const o = curationStore.current.people.find((x) => x.personId === person.id);
		return o !== undefined ? o.presenceSensorId : person.suggestedPresenceSensor;
	});
	const effectiveDeviceClass = $derived.by((): 'android' | 'ios' | 'unknown' => {
		const o = curationStore.current.people.find((x) => x.personId === person.id);
		return o?.deviceClass ?? person.deviceClass;
	});

	let expanded = $state(false);
	let otherFilter = $state('');

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

	const otherCandidates = $derived.by(() => {
		const ranked = new Set(person.rankedPresenceSensors.map((r) => r.entityId));
		const filter = otherFilter.toLowerCase().trim();
		const all = allCandidateEntities().filter((id) => !ranked.has(id));
		if (!filter) return all;
		return all.filter((id) => {
			if (id.toLowerCase().includes(filter)) return true;
			const fn = discoveryStore.states[id]?.attributes?.friendly_name;
			return typeof fn === 'string' && fn.toLowerCase().includes(filter);
		});
	});

	async function pickSensor(sensorId: string | null) {
		const ok = await setPersonPresenceSensor(person.id, sensorId, effectiveDeviceClass);
		if (ok) {
			showToast(
				sensorId ? `${person.name}: sensor updated` : `${person.name}: cleared`,
				'success'
			);
			onCommit?.();
		} else {
			showToast('Save failed — try again', 'error');
		}
	}
</script>

<div class="picker" class:compact>
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
					onclick={() => pickSensor(ranked.entityId)}
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
				onclick={() => pickSensor(null)}
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

	<details class="other-block" bind:open={expanded}>
		<summary class="other-summary">
			Other entity…
			<span class="other-hint">
				any binary_sensor / sensor / device_tracker / person
			</span>
		</summary>
		{#if expanded}
			<input
				type="search"
				class="other-filter"
				placeholder="Filter by id or friendly_name…"
				bind:value={otherFilter}
			/>
			<ul class="other-list">
				{#each otherCandidates.slice(0, 30) as id (id)}
					<li>
						<button
							type="button"
							class="other-row"
							class:picked={effective === id}
							onclick={() => pickSensor(id)}
						>
							<code class="sensor-id">{id}</code>
							{#if discoveryStore.states[id]?.attributes?.friendly_name}
								<span class="other-fn">
									{discoveryStore.states[id]?.attributes?.friendly_name}
								</span>
							{/if}
						</button>
					</li>
				{/each}
				{#if otherCandidates.length > 30}
					<li class="other-truncated">+ {otherCandidates.length - 30} more (refine filter)</li>
				{/if}
			</ul>
		{/if}
	</details>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.sensor-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sensor-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: var(--radius-md, 4px);
		text-align: left;
		cursor: pointer;
		transition: border-color var(--ease-quick), background var(--ease-quick);
	}
	.sensor-row:hover {
		border-color: var(--accent);
	}
	.sensor-row.picked {
		border-color: var(--accent);
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
	}
	.sensor-row.warn {
		border-color: var(--state-warn, #c08a4a);
	}

	.radio {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 1px solid var(--fg-muted);
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		margin-top: 2px;
	}
	.sensor-row.picked .radio {
		border-color: var(--accent);
	}
	.sensor-row.picked .radio .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}

	.sensor-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		flex: 1 1 auto;
	}

	.sensor-id-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.sensor-id {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg);
	}

	.badge {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		border: 1px solid var(--rule);
	}
	.badge.best {
		color: var(--accent);
		border-color: var(--accent);
	}
	.badge.warn {
		color: var(--state-warn, #c08a4a);
		border-color: var(--state-warn, #c08a4a);
	}

	.sensor-reason {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}

	.other-block {
		border-top: 1px dashed var(--rule);
		padding-top: var(--space-2);
		margin-top: var(--space-1);
	}
	.other-summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		color: var(--fg-muted);
		text-transform: uppercase;
	}
	.other-hint {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		text-transform: none;
		letter-spacing: normal;
		margin-left: var(--space-2);
	}
	.other-filter {
		display: block;
		width: 100%;
		margin-top: var(--space-2);
		padding: var(--space-2);
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}
	.other-filter:focus {
		outline: none;
		border-color: var(--accent);
	}
	.other-list {
		max-height: 18rem;
		overflow-y: auto;
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.other-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-1) var(--space-2);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-pill);
		text-align: left;
		cursor: pointer;
		color: var(--fg);
		font-size: 0.8rem;
	}
	.other-row:hover {
		border-color: var(--rule);
	}
	.other-row.picked {
		border-color: var(--accent);
	}
	.other-fn {
		font-family: var(--font-body);
		color: var(--fg-muted);
	}
	.other-truncated {
		padding: var(--space-1) var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		color: var(--fg-muted);
	}
</style>
