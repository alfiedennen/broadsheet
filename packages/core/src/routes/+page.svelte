<script lang="ts">
	// M0 placeholder landing page. Real landing page (live painting +
	// manifest line) lands in M3 after the discovery layer (M2) is in
	// place. For now this just verifies the build pipeline works.
</script>

<main>
	<header>
		<p class="eyebrow">№ 00 · pre-release</p>
		<h1><em>broadsheet</em></h1>
		<p class="dek">An editorial frontend for Home Assistant. Under construction.</p>
	</header>

	<section class="status">
		<p>
			This is the M0 scaffold. The real landing page arrives at M3 after
			discovery (M2) and safety rails (M1) ship.
		</p>
		<p>
			See <a href="https://github.com/example/broadsheet">the repo</a> for
			progress and <code>docs/BUILD-LOG.md</code> for the running journal.
		</p>
	</section>
</main>

<style>
	main {
		max-width: 60ch;
		margin: 0 auto;
		padding: 4rem 2rem;
	}

	.eyebrow {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0 0 0.5rem;
	}

	h1 {
		font-family: 'Instrument Serif', Georgia, serif;
		font-size: clamp(3rem, 8vw, 5rem);
		font-weight: 400;
		line-height: 1;
		margin: 0 0 1rem;
		color: var(--accent);
	}

	h1 em {
		font-style: italic;
	}

	.dek {
		color: var(--muted);
		font-size: 1.1rem;
		margin: 0 0 3rem;
	}

	.status {
		border-top: 1px solid var(--rule);
		padding-top: 2rem;
		color: var(--muted);
		line-height: 1.6;
	}

	code {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.9em;
		color: var(--fg);
	}
</style>
