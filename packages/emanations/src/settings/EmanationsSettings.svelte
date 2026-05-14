<script lang="ts">
	/**
	 * Emanations settings panel — rendered at
	 * /settings/plugins/emanations/config when the plugin is enabled.
	 *
	 * Binds two curation fields under plugins.emanations.config via
	 * `useCurationField`, laid out with `SettingsRow`. Each change
	 * persists immediately through the curation store's optimistic
	 * write — no save button.
	 *
	 * `useCurationField().value` is `undefined` until first written, so
	 * each control supplies its own default rather than `bind:`-ing
	 * straight onto a possibly-undefined value.
	 */
	import { SettingsRow, useCurationField } from '@broadsheet/core';

	const usePaintings = useCurationField<boolean>('plugins.emanations.config.usePaintings');
	const fadeMs = useCurationField<number>('plugins.emanations.config.fadeMs');

	const DEFAULT_USE_PAINTINGS = true;
	const DEFAULT_FADE_MS = 800;
</script>

<div class="panel">
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
</style>
