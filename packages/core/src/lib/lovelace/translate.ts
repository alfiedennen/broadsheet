/**
 * Lovelace → broadsheet translator.
 *
 * Per-card translators take a LovelaceCard and return:
 *   - BlockDef[]    — translation succeeded (may emit zero, one, or
 *                     many blocks depending on the source card)
 *   - null          — card type is unsupported; skipped + reported
 *
 * The translator framework iterates over a Lovelace view's cards,
 * dispatches each to its registered translator (or null for missing),
 * and tracks coverage so the import UI can show a per-card report.
 *
 * Adding a new card translator:
 *   1. Write the function below
 *   2. Add it to TRANSLATORS keyed by Lovelace card `type`
 *   3. Add an entry to TRANSLATOR_META so the coverage report can
 *      describe what got translated + how cleanly
 *
 * v0.2 starter set covers the SCAFFOLDING + TEXT cards: markdown,
 * entity, entities, vertical-stack, horizontal-stack. That's the
 * "you'll see SOMETHING for any common dashboard" base. The action +
 * control cards (button, light, scene, weather-forecast, etc) come
 * in subsequent commits as the matching primitives land.
 */

import type { BlockDef } from '$lib/blocks/types';
import type { LovelaceCard, LovelaceConfig, LovelaceView } from './reader';

/**
 * Coverage classification for one card's translation. Aggregated
 * into a per-page report shown to the user before they commit the
 * import.
 */
export type Coverage = 'clean' | 'partial' | 'unsupported';

export interface TranslatorReport {
	/** Source Lovelace card type. */
	type: string;
	/** How well it translated. */
	coverage: Coverage;
	/** Optional human note ("rendered as markdown stub"). */
	note?: string;
	/** Source card index in the view, for line-up with the original. */
	sourceIndex: number;
}

export interface TranslatedView {
	title: string | null;
	path: string | null;
	blocks: BlockDef[];
	reports: TranslatorReport[];
}

export interface TranslatedDashboard {
	title: string | null;
	views: TranslatedView[];
	totals: { clean: number; partial: number; unsupported: number; total: number };
}

/* ── Per-card translators ─────────────────────────────────────────── */

/**
 * `markdown` card → markdown block. Direct mapping; the broadsheet
 * MarkdownBlockRenderer uses a similar inline-md syntax + supports
 * `{{entity_id}}` templates. Lovelace's markdown card uses Jinja
 * template syntax (`{{ states('entity') }}`) which we don't yet
 * support — non-template content translates cleanly; template-heavy
 * cards translate partially with a note.
 */
function translateMarkdown(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const content = (card.content ?? '') as string;
	const hasJinja = /\{\{\s*states?\(/.test(content);
	const blocks: BlockDef[] = [
		{ type: 'markdown', config: { body: content } }
	];
	if (hasJinja) {
		return {
			blocks,
			coverage: 'partial',
			note: 'Jinja templates pass through as text — not yet evaluated.'
		};
	}
	return { blocks, coverage: 'clean' };
}

/**
 * `entity` card → markdown block with state interpolation. A single
 * line "Friendly name: state" using the broadsheet markdown syntax
 * so the source resolves at render time.
 */
function translateEntity(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const id = (card.entity ?? '') as string;
	if (!id) {
		return { blocks: [], coverage: 'unsupported', note: 'entity field missing' };
	}
	const name = (card.name ?? id) as string;
	const blocks: BlockDef[] = [
		{
			type: 'markdown',
			config: {
				body: `**${name}**: \`{{${id}}}\``
			}
		}
	];
	return { blocks, coverage: 'clean' };
}

/**
 * `entities` card → entity-list block. Direct mapping; per-row
 * configuration (custom name, hidden, secondary_info) maps onto our
 * `nameOverrides`. Rows that are themselves cards or `divider` rows
 * are dropped with a partial-coverage note.
 */
function translateEntities(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const rawEntities = (card.entities ?? []) as unknown[];
	const ids: string[] = [];
	const nameOverrides: Record<string, string> = {};
	let droppedRows = 0;
	for (const row of rawEntities) {
		if (typeof row === 'string') {
			ids.push(row);
		} else if (row && typeof row === 'object') {
			const r = row as { entity?: string; name?: string; type?: string };
			if (r.entity) {
				ids.push(r.entity);
				if (r.name) nameOverrides[r.entity] = r.name;
			} else {
				// e.g. type: 'divider', type: 'section', or a sub-card
				droppedRows++;
			}
		} else {
			droppedRows++;
		}
	}
	if (ids.length === 0) {
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'no entity rows could be extracted'
		};
	}
	const label = (card.title ?? null) as string | null;
	const blocks: BlockDef[] = [
		{
			type: 'entity-list',
			config: {
				label,
				entities: ids,
				showIcon: card.show_icon !== false,
				nameOverrides: Object.keys(nameOverrides).length ? nameOverrides : undefined
			}
		}
	];
	if (droppedRows > 0) {
		return {
			blocks,
			coverage: 'partial',
			note: `${droppedRows} non-entity row${droppedRows === 1 ? '' : 's'} (divider / section / sub-card) dropped.`
		};
	}
	return { blocks, coverage: 'clean' };
}

/**
 * `vertical-stack` / `horizontal-stack` → recurse into child cards.
 * Both translate identically for v0.2 — broadsheet pages are a flat
 * vertical sequence of blocks, so the layout distinction is lost.
 * Future: if a horizontal-block primitive lands, horizontal-stack
 * could land as a horizontal layout container.
 */
function translateStack(
	card: LovelaceCard,
	recurse: (c: LovelaceCard, idx: number) => { blocks: BlockDef[]; reports: TranslatorReport[] }
): { blocks: BlockDef[]; coverage: Coverage; note?: string; childReports: TranslatorReport[] } {
	const cards = (card.cards ?? []) as LovelaceCard[];
	const blocks: BlockDef[] = [];
	const childReports: TranslatorReport[] = [];
	cards.forEach((c, i) => {
		const r = recurse(c, i);
		blocks.push(...r.blocks);
		childReports.push(...r.reports);
	});
	const note = card.type === 'horizontal-stack'
		? 'Horizontal layout flattened to vertical (no horizontal primitive yet).'
		: undefined;
	return { blocks, coverage: 'clean', note, childReports };
}

/* ── The dispatch table ───────────────────────────────────────────── */

const TRANSLATORS: Record<string, true> = {
	markdown: true,
	entity: true,
	entities: true,
	'vertical-stack': true,
	'horizontal-stack': true
};

/** Public: which Lovelace card types we currently translate. */
export function isSupportedCardType(type: string): boolean {
	return TRANSLATORS[type] === true;
}

/* ── View + dashboard translation ─────────────────────────────────── */

/**
 * Translate one Lovelace view into a list of broadsheet blocks +
 * coverage reports. Stacks recurse — a stack's child reports are
 * flattened into the view's report list with the same sourceIndex.
 */
export function translateView(view: LovelaceView): TranslatedView {
	const cards = (view.cards ?? []) as LovelaceCard[];
	const blocks: BlockDef[] = [];
	const reports: TranslatorReport[] = [];

	const visit = (card: LovelaceCard, idx: number): { blocks: BlockDef[]; reports: TranslatorReport[] } => {
		const t = card.type;
		if (t === 'markdown') {
			const r = translateMarkdown(card);
			return {
				blocks: r.blocks,
				reports: [{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx }]
			};
		}
		if (t === 'entity') {
			const r = translateEntity(card);
			return {
				blocks: r.blocks,
				reports: [{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx }]
			};
		}
		if (t === 'entities') {
			const r = translateEntities(card);
			return {
				blocks: r.blocks,
				reports: [{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx }]
			};
		}
		if (t === 'vertical-stack' || t === 'horizontal-stack') {
			const r = translateStack(card, visit);
			return {
				blocks: r.blocks,
				reports: [
					{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx },
					...r.childReports
				]
			};
		}
		// Unsupported
		return {
			blocks: [],
			reports: [
				{
					type: t || '(no type)',
					coverage: 'unsupported',
					note: 'No translator for this card type yet.',
					sourceIndex: idx
				}
			]
		};
	};

	cards.forEach((card, i) => {
		const r = visit(card, i);
		blocks.push(...r.blocks);
		reports.push(...r.reports);
	});

	return {
		title: (view.title ?? null) as string | null,
		path: (view.path ?? null) as string | null,
		blocks,
		reports
	};
}

/** Translate every view in a dashboard config. */
export function translateDashboard(config: LovelaceConfig): TranslatedDashboard {
	const views = (config.views ?? []).map(translateView);
	let clean = 0,
		partial = 0,
		unsupported = 0,
		total = 0;
	for (const v of views) {
		for (const r of v.reports) {
			total++;
			if (r.coverage === 'clean') clean++;
			else if (r.coverage === 'partial') partial++;
			else unsupported++;
		}
	}
	return {
		title: (config.title ?? null) as string | null,
		views,
		totals: { clean, partial, unsupported, total }
	};
}

/* ── Slug derivation ───────────────────────────────────────────────── */

/** Derive a broadsheet-safe slug from a label string. */
export function slugifyForBroadsheet(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 64);
}
