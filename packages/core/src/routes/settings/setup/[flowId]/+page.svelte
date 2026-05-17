<script lang="ts">
	/**
	 * /settings/setup/[flowId] — Theme B onboarding flow runner.
	 *
	 * One page per flow. Reads the flow definition from
	 * `lib/flows/definitions.ts`, resolves each step ref against the
	 * loaded plugins, renders the step list with per-step affordances
	 * (toggle, deep-link, external-link, custom component).
	 *
	 * Completion is computed LIVE from curation/discovery/localFlags on
	 * every render — there is NO separate "done" flag. This means
	 * partial outside-flow progress (e.g. user pasted the Anthropic
	 * key in the harold-preset settings panel before opening the flow)
	 * is detected on entry and the step shows ✓ immediately.
	 *
	 * Hash-navigate: visiting `/settings/setup/add-harold/#step-3`
	 * scrolls + flashes the third step. Used by the attention-hub
	 * "Resume step N →" CTA + by deep links from elsewhere in the SPA.
	 *
	 * Spec: docs/plans/plan-theme-B-onboarding-flows.md.
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';
	import { pluginLoader } from '$lib/plugins/loader.svelte';
	import { curationStore, setPluginEnabled } from '$lib/curation/store.svelte';
	import { discovery } from '$lib/discovery';
	import { showToast } from '$lib/stores/toast.svelte';
	import { wireHashHighlight } from '$lib/utils/hashNavigate';
	import { FLOWS, resolveStepRef } from '$lib/flows/definitions';
	import type { ResolvedStep } from '$lib/flows/definitions';
	import {
		buildFlowStepContext,
		countDone,
		firstIncompleteIndex,
		isFlowComplete,
		markStepClicked
	} from '$lib/flows/context';

	const flowId = $derived(page.params.flowId ?? '');
	const flow = $derived(FLOWS.find((f) => f.id === flowId) ?? null);

	// Reactive deps: pluginLoader.registry, curationStore.tick, discovery
	// snapshots — every change re-runs isComplete on every step.
	const plugins = $derived(pluginLoader.registry.map((r) => r.plugin));
	const ctx = $derived.by(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		curationStore.tick;
		return buildFlowStepContext(curationStore.current, {
			floors: discovery.floors,
			areas: discovery.areas,
			persons: discovery.persons
		});
	});

	interface StepRow {
		index: number;
		ref: string;
		resolved: ResolvedStep | null;
		done: boolean;
	}
	const rows = $derived.by((): StepRow[] => {
		if (!flow) return [];
		return flow.steps.map((ref, index) => {
			const resolved = resolveStepRef(ref, plugins);
			let done = false;
			if (resolved) {
				try {
					done = resolved.step.isComplete(ctx) === true;
				} catch {
					done = false;
				}
			}
			return { index, ref, resolved, done };
		});
	});

	const doneCount = $derived(flow ? countDone(flow, plugins, ctx) : 0);
	const totalCount = $derived(flow?.steps.length ?? 0);
	const allDone = $derived(!!flow && isFlowComplete(flow, plugins, ctx));

	// On mount: if no #step- hash is present + flow has incomplete
	// steps, hash-navigate to the first incomplete step. Otherwise let
	// the user's explicit hash win.
	onMount(() => {
		const cleanup = wireHashHighlight();
		if (typeof window !== 'undefined' && !window.location.hash && flow) {
			const next = firstIncompleteIndex(flow, plugins, ctx);
			if (next >= 0) {
				// History-replace so back button doesn't trap them on /#step-N
				history.replaceState(null, '', `#step-${next + 1}`);
				wireHashHighlight();
			}
		}
		return cleanup;
	});

	async function togglePluginEnable(pluginId: string, on: boolean) {
		const ok = await setPluginEnabled(pluginId, on);
		if (ok) {
			showToast(`${pluginId} ${on ? 'enabled' : 'disabled'}`, 'success');
		} else {
			showToast('Save failed — try again', 'error');
		}
	}

	function markClicked(pluginId: string, stepId: string) {
		markStepClicked(pluginId, stepId);
		// Force a re-render by ticking the curation store — cheapest
		// way to nudge $derived without a dedicated localFlags rune.
		// (Mirrors what setCurationPath does after a save.)
		curationStore.tick++;
	}
</script>

<svelte:head>
	<title>
		{flow ? flow.title : 'Setup'} · Settings · broadsheet
	</title>
</svelte:head>

<PageShell width="default">
	{#if !flow}
		<Hero size="md">
			{#snippet eyebrow()}
				<Eyebrow section="Settings · Setup" />
			{/snippet}
			{#snippet headline()}
				No such flow.
			{/snippet}
			{#snippet dek()}
				<code>{flowId}</code> doesn't match any flow broadsheet ships. See
				<a href="{base}/settings/">all settings</a> to find your way back.
			{/snippet}
		</Hero>
	{:else}
		<Hero size="md">
			{#snippet eyebrow()}
				<Eyebrow section="Settings · Setup" />
			{/snippet}
			{#snippet headline()}
				{flow.title}
			{/snippet}
			{#snippet dek()}
				{flow.description}
				<span class="progress" data-state={allDone ? 'done' : 'in-progress'}>
					{doneCount} of {totalCount} done{allDone ? ' ✓' : ''}
				</span>
			{/snippet}
		</Hero>

		{#each rows as row (row.ref)}
			{@const isHidden = row.resolved === null}
			<OutLine label="Step {row.index + 1}" />
			<!-- id="step-N" — hash-navigate target -->
			<section
				class="step-card"
				class:done={row.done}
				class:unavailable={isHidden}
				id="step-{row.index + 1}"
			>
				<header class="step-head">
					<div class="step-meta">
						<span class="step-eyebrow">
							Step {row.index + 1}
							{#if row.resolved?.step.optional}
								<span class="optional-chip">· optional</span>
							{/if}
						</span>
						<h3 class="step-title">
							{row.resolved?.step.title ?? '(step unavailable)'}
						</h3>
					</div>
					<span class="step-status" aria-live="polite">
						{#if isHidden}
							<span class="status-chip warn" title="Contributing plugin not bundled">
								unavailable
							</span>
						{:else if row.done}
							<span class="status-chip done">✓ done</span>
						{:else}
							<span class="status-chip pending">to do</span>
						{/if}
					</span>
				</header>

				{#if row.resolved}
					{@const step = row.resolved.step}
					<p class="step-desc">{step.description}</p>

					<!-- Affordance by kind -->
					<div class="step-affordance">
						{#if step.kind === 'enable-plugin'}
							{@const pluginId = row.resolved.pluginId}
							<button
								type="button"
								class="toggle"
								class:on={row.done}
								role="switch"
								aria-checked={row.done}
								onclick={() => togglePluginEnable(pluginId, !row.done)}
							>
								<span class="toggle-track"><span class="toggle-thumb"></span></span>
								<span class="toggle-label">
									{row.done ? `${pluginId} enabled` : `Enable ${pluginId}`}
								</span>
							</button>
						{:else if step.kind === 'set-curation-field'}
							{@const cf = step.curationField}
							<div class="cf-row">
								<span class="cf-hint">Needs: {cf?.valueHint ?? '(value)'}</span>
								{#if cf?.settingsHref}
									<a class="cf-link" href={cf.settingsHref}>Set in settings ↗</a>
								{/if}
							</div>
						{:else if step.kind === 'external-link'}
							{@const lk = step.link}
							<div class="el-row">
								{#if lk}
									<a
										class="el-open"
										href={lk.href}
										target={lk.href.startsWith('/') ? '_self' : '_blank'}
										rel="noopener noreferrer"
									>
										Open {lk.label} ↗
									</a>
								{/if}
								{#if !row.done}
									<button
										type="button"
										class="el-done"
										onclick={() => markClicked(row.resolved!.pluginId, step.id)}
									>
										I've done this →
									</button>
								{/if}
							</div>
						{:else if step.kind === 'custom' && step.component}
							{#await step.component()}
								<p class="loading">Loading step…</p>
							{:then loaded}
								{@const StepComp = loaded.default}
								<StepComp />
							{:catch err}
								<p class="step-error">
									(step component failed to load — skip to next?)
									<span class="err-detail">{String(err)}</span>
								</p>
							{/await}
						{/if}
					</div>
				{:else}
					<p class="step-desc">
						This step is contributed by a plugin that isn't bundled in this
						broadsheet build. Skip to the next step.
					</p>
				{/if}
			</section>
		{/each}

		{#if allDone}
			<section class="done-banner">
				<h3>Setup complete.</h3>
				<p>Every step is ✓. Head back to <a href="{base}/">the moment</a>.</p>
			</section>
		{/if}
	{/if}
</PageShell>

<style>
	.progress {
		display: inline-block;
		margin-left: var(--space-2);
		padding: 1px var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		border-radius: var(--radius-pill);
		border: 1px solid var(--rule);
		color: var(--fg-muted);
	}
	.progress[data-state='done'] {
		color: var(--state-positive, #6a8a4d);
		border-color: var(--state-positive, #6a8a4d);
	}

	.step-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
	}

	.step-card.done {
		opacity: 0.75;
	}

	.step-card.unavailable {
		opacity: 0.55;
		border-style: dashed;
	}

	.step-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.step-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1 1 auto;
		min-width: 0;
	}

	.step-eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.optional-chip {
		color: var(--fg-dim);
		font-style: italic;
	}

	.step-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--accent);
		margin: 0;
		font-weight: 400;
	}

	.status-chip {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		border: 1px solid var(--rule);
		color: var(--fg-muted);
		white-space: nowrap;
	}

	.status-chip.done {
		color: var(--state-positive, #6a8a4d);
		border-color: var(--state-positive, #6a8a4d);
	}

	.status-chip.pending {
		color: var(--accent);
		border-color: var(--accent);
	}

	.status-chip.warn {
		color: var(--state-alert);
		border-color: var(--state-alert);
	}

	.step-desc {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg);
		line-height: var(--leading-snug);
	}

	.step-affordance {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-top: var(--space-1);
	}

	/* Reuse the same toggle look as /settings/plugins for consistency */
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

	.cf-row,
	.el-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.cf-hint {
		font-family: var(--font-mono);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
	}

	.cf-link,
	.el-open {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
	}

	.cf-link:hover,
	.el-open:hover {
		border-bottom-style: solid;
	}

	.el-done {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
		cursor: pointer;
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.el-done:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.loading {
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--fg-muted);
		font-style: italic;
		margin: 0;
	}

	.step-error {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-caption);
		color: var(--state-alert);
	}

	.step-error .err-detail {
		display: block;
		font-family: var(--font-mono);
		color: var(--fg-muted);
		margin-top: var(--space-1);
		font-size: 0.7rem;
	}

	.done-banner {
		text-align: center;
		padding: var(--space-6);
		margin-top: var(--space-4);
		background: var(--accent-glow, rgba(192, 138, 74, 0.06));
		border: 1px solid var(--accent);
		border-radius: var(--radius-card);
	}

	.done-banner h3 {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
		font-size: 1.8rem;
		margin: 0 0 var(--space-2);
		font-weight: 400;
	}

	.done-banner p {
		font-family: var(--font-body);
		color: var(--fg);
		margin: 0;
	}

	.done-banner a {
		color: var(--accent);
	}
</style>
