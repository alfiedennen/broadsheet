<script lang="ts">
	/**
	 * /settings/people — per-person presence sensor picker.
	 *
	 * Shows the ranked sensor list per person with the ★ best badge,
	 * tier (BLE / GPS / aggregate), and warnings (iOS suspension etc).
	 * Selecting a sensor persists immediately + shows a toast.
	 */

	import { discovery } from '$lib/discovery';
	import type { DomainPerson } from '$lib/discovery';
	import { curationStore, setPersonPresenceSensor } from '$lib/curation/store.svelte';
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

	{#if discovery.persons.length === 0}
		<p class="empty">
			No <code>person.*</code> entities discovered yet. Create them in HA → Settings → People.
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
		</section>
	{/each}
</PageShell>

<style>
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
