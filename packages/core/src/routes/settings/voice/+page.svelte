<script lang="ts">
	/**
	 * /settings/voice — editorial string overrides.
	 *
	 * Each editable string is a templated phrase with documented
	 * variables. Defaults shown as placeholder; the user types an
	 * override to replace it.
	 */

	import { curationStore, setVoiceString } from '$lib/curation/store.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageShell from '$lib/components/PageShell.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import OutLine from '$lib/components/OutLine.svelte';

	interface VoiceField {
		id: string;
		label: string;
		default: string;
		variables: string[];
	}

	const fields: VoiceField[] = [
		{
			id: 'manifest.empty',
			label: 'Empty house',
			default: 'The house is empty.',
			variables: []
		},
		{
			id: 'manifest.oneHome',
			label: 'One person home (room known)',
			default: '{name} home in the {room}.',
			variables: ['{name}', '{room}']
		},
		{
			id: 'manifest.oneHomeRoomUnknown',
			label: 'One person home (room unknown)',
			default: '{name} home.',
			variables: ['{name}']
		},
		{
			id: 'manifest.bothHomeSameRoom',
			label: 'Two home, same room',
			default: 'Both in the {room}.',
			variables: ['{room}']
		},
		{
			id: 'manifest.bothHomeDifferent',
			label: 'Two home, different rooms',
			default: '{a} in the {aRoom}, {b} in the {bRoom}.',
			variables: ['{a}', '{b}', '{aRoom}', '{bRoom}']
		}
	];

	// Edit buffers — keyed by field id. Initialised from current curation
	// on focus.
	let buffers = $state<Record<string, string>>({});

	function startEdit(f: VoiceField) {
		buffers[f.id] = curationStore.current.voice[f.id] ?? '';
	}

	async function commitEdit(f: VoiceField) {
		const value = (buffers[f.id] ?? '').trim();
		const ok = await setVoiceString(f.id, value);
		if (ok) {
			showToast(value ? `${f.label} updated` : `${f.label}: cleared`, 'success');
		} else {
			showToast('Save failed', 'error');
		}
		delete buffers[f.id];
	}

	function cancelEdit(f: VoiceField) {
		delete buffers[f.id];
	}

	function currentValue(f: VoiceField): string {
		return curationStore.current.voice[f.id] ?? '';
	}
</script>

<svelte:head>
	<title>Voice · Settings · broadsheet</title>
</svelte:head>

<PageShell width="default">
	<Hero size="md">
		{#snippet eyebrow()}
			<Eyebrow section="Settings · Voice" />
		{/snippet}
		{#snippet headline()}
			Override the editorial strings.
		{/snippet}
		{#snippet dek()}
			Variables in {`{braces}`} get filled in at render. Leave blank to use the
			default.
		{/snippet}
	</Hero>

	<OutLine label="Manifest" />

	<dl class="fields">
		{#each fields as f (f.id)}
			{@const editing = buffers[f.id] !== undefined}
			{@const cur = currentValue(f)}
			<div class="field">
				<dt class="field-head">
					<span class="field-label">{f.label}</span>
					{#if f.variables.length > 0}
						<span class="vars">
							{#each f.variables as v}
								<code>{v}</code>
							{/each}
						</span>
					{/if}
				</dt>
				<dd class="field-body">
					{#if editing}
						<input
							type="text"
							class="field-input"
							bind:value={buffers[f.id]}
							placeholder={f.default}
							onkeydown={(e) => {
								if (e.key === 'Enter') commitEdit(f);
								if (e.key === 'Escape') cancelEdit(f);
							}}
						/>
						<div class="field-actions">
							<button class="action confirm" type="button" onclick={() => commitEdit(f)}>
								Save
							</button>
							<button class="action" type="button" onclick={() => cancelEdit(f)}>
								Cancel
							</button>
						</div>
					{:else}
						<button
							class="display-value"
							type="button"
							onclick={() => startEdit(f)}
							class:overridden={cur !== ''}
						>
							{cur || f.default}
							<span class="edit-hint">edit</span>
						</button>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</PageShell>

<style>
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
	}

	.field {
		border-bottom: 1px solid var(--rule);
		padding-bottom: var(--space-4);
	}

	.field:last-child {
		border-bottom: none;
	}

	.field-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.field-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.2rem;
		color: var(--accent);
	}

	.vars {
		display: inline-flex;
		gap: var(--space-1);
	}

	.vars code {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 1px var(--space-2);
		background: var(--bg-card);
		border: 1px solid var(--rule);
		border-radius: var(--radius-pill);
		color: var(--fg-muted);
	}

	.field-body {
		margin: 0;
	}

	.display-value {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		text-align: left;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg-card);
		font-family: var(--font-body);
		font-size: var(--text-body);
		color: var(--fg-muted);
		transition: border-color var(--ease-quick), color var(--ease-quick);
	}

	.display-value:hover {
		border-color: var(--accent);
	}

	.display-value.overridden {
		color: var(--fg);
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.edit-hint {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--accent);
		flex: 0 0 auto;
	}

	.field-input {
		font-family: var(--font-body);
		font-size: var(--text-body);
		padding: var(--space-3) var(--space-4);
		width: 100%;
		background: var(--bg-raised);
		border: 1px solid var(--accent);
		border-radius: var(--radius-input);
		color: var(--fg);
	}

	.field-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.action {
		font-family: var(--font-mono);
		font-size: var(--text-eyebrow);
		letter-spacing: var(--track-eyebrow);
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: var(--space-2) var(--space-4);
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
</style>
