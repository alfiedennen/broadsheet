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
 *
 * `partial-layout` (0.9.4): translation worked but the source's
 * multi-column / sections layout was approximated by a heuristic
 * (e.g. a default masonry view bucketed into a 2-column row when
 * we don't have explicit column hints). The data made it through;
 * the user might want to re-arrange in the things-first canvas.
 */
export type Coverage = 'clean' | 'partial' | 'partial-layout' | 'unsupported';

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
	totals: {
		clean: number;
		partial: number;
		/** 0.9.4: data translated but layout was approximated by the masonry heuristic. */
		partialLayout: number;
		unsupported: number;
		total: number;
	};
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
 *
 * `vertical-stack` flattens to the parent flow (broadsheet pages
 * are already vertical, no wrapper needed).
 *
 * `horizontal-stack` (0.9.4) emits a `row` block wrapping the
 * translated children. The translator no longer drops horizontal
 * layout signals. Equal flex shares by default; per-child
 * `colSpan` honoured if the source carried one (rare for
 * horizontal-stack).
 */
function translateStack(
	card: LovelaceCard,
	recurse: (c: LovelaceCard, idx: number) => { blocks: BlockDef[]; reports: TranslatorReport[] }
): { blocks: BlockDef[]; coverage: Coverage; note?: string; childReports: TranslatorReport[] } {
	const cards = (card.cards ?? []) as LovelaceCard[];
	const childBlocks: BlockDef[] = [];
	const childReports: TranslatorReport[] = [];
	cards.forEach((c, i) => {
		const r = recurse(c, i);
		childBlocks.push(...r.blocks);
		childReports.push(...r.reports);
	});

	if (card.type === 'horizontal-stack') {
		const rowBlock: BlockDef = {
			type: 'row',
			config: {
				label: (card.title ?? null) as string | null,
				children: childBlocks,
				gap: 3
			}
		};
		return {
			blocks: [rowBlock],
			coverage: 'clean',
			note: undefined,
			childReports
		};
	}

	// vertical-stack — flat sequence, no wrapper.
	return { blocks: childBlocks, coverage: 'clean', note: undefined, childReports };
}

/**
 * 0.9.4 — `grid` card → broadsheet `grid` block.
 *
 * A `type: 'grid'` Lovelace card has `columns: N` + `cards: [...]`.
 * Translates 1:1 to a broadsheet grid block with the same column
 * count + translated children. Each child's `colSpan` is read from
 * its own `grid_options.columns` if present; defaults to 1.
 */
function translateGrid(
	card: LovelaceCard,
	recurse: (c: LovelaceCard, idx: number) => { blocks: BlockDef[]; reports: TranslatorReport[] }
): { blocks: BlockDef[]; coverage: Coverage; note?: string; childReports: TranslatorReport[] } {
	const cards = (card.cards ?? []) as LovelaceCard[];
	const columns = typeof card.columns === 'number' ? card.columns : 3;
	const childBlocks: BlockDef[] = [];
	const childReports: TranslatorReport[] = [];

	cards.forEach((c, i) => {
		const r = recurse(c, i);
		// Source card's grid_options.columns becomes broadsheet
		// colSpan. Walk each emitted child block and attach.
		const gridOpts = c.grid_options as { columns?: number } | undefined;
		const span =
			gridOpts && typeof gridOpts.columns === 'number' && gridOpts.columns > 0
				? gridOpts.columns
				: undefined;
		for (const b of r.blocks) {
			if (span !== undefined) (b as BlockDef).colSpan = span;
			childBlocks.push(b);
		}
		childReports.push(...r.reports);
	});

	const gridBlock: BlockDef = {
		type: 'grid',
		config: {
			label: (card.title ?? null) as string | null,
			columns,
			children: childBlocks,
			gap: 3
		}
	};

	return { blocks: [gridBlock], coverage: 'clean', note: undefined, childReports };
}

/**
 * `glance` card → entity-list with icons. Glance is "a row of mini
 * tiles per entity"; entity-list is the closest broadsheet shape.
 * Per-entity styling fields (no_state, no_name, taps) are dropped.
 */
function translateGlance(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const rawEntities = (card.entities ?? []) as unknown[];
	const ids: string[] = [];
	const nameOverrides: Record<string, string> = {};
	for (const row of rawEntities) {
		if (typeof row === 'string') ids.push(row);
		else if (row && typeof row === 'object') {
			const r = row as { entity?: string; name?: string };
			if (r.entity) {
				ids.push(r.entity);
				if (r.name) nameOverrides[r.entity] = r.name;
			}
		}
	}
	if (ids.length === 0) {
		return { blocks: [], coverage: 'unsupported', note: 'no entities resolved' };
	}
	return {
		blocks: [
			{
				type: 'entity-list',
				config: {
					label: (card.title ?? null) as string | null,
					entities: ids,
					showIcon: true,
					nameOverrides: Object.keys(nameOverrides).length ? nameOverrides : undefined
				}
			}
		],
		coverage: 'partial',
		note: 'Rendered as a list — glance grid layout flattened.'
	};
}

/**
 * `gauge` card → markdown line "Name: value uom". Lossy — the gauge
 * dial visual is gone — but the live value still surfaces.
 */
function translateGauge(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const id = (card.entity ?? '') as string;
	if (!id) return { blocks: [], coverage: 'unsupported', note: 'entity field missing' };
	const name = (card.name ?? id) as string;
	const unit = (card.unit ?? '') as string;
	const body = `**${name}**: \`{{${id}}}\`${unit ? ` ${unit}` : ''}`;
	return {
		blocks: [{ type: 'markdown', config: { body } }],
		coverage: 'partial',
		note: 'Gauge visual replaced with markdown value line.'
	};
}

/**
 * `sensor` card → markdown line. Sensor cards are graph-cards in
 * Lovelace but the chart history doesn't translate to a primitive
 * yet — surface the live value as a fallback.
 */
function translateSensor(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const id = (card.entity ?? '') as string;
	if (!id) return { blocks: [], coverage: 'unsupported', note: 'entity field missing' };
	const name = (card.name ?? id) as string;
	const body = `**${name}**: \`{{${id}}}\``;
	return {
		blocks: [{ type: 'markdown', config: { body } }],
		coverage: 'partial',
		note: 'Sensor chart history dropped — live value surfaced as markdown.'
	};
}

/**
 * `weather-forecast` → markdown line with current condition + temp.
 * The 5-day forecast doesn't yet have a primitive landing zone, so
 * the daily breakdown is dropped — note flags that.
 */
function translateWeatherForecast(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const id = (card.entity ?? '') as string;
	if (!id) return { blocks: [], coverage: 'unsupported', note: 'entity field missing' };
	const name = (card.name ?? 'Outside') as string;
	const body = `**${name}**: \`{{${id}}}\``;
	return {
		blocks: [{ type: 'markdown', config: { body } }],
		coverage: 'partial',
		note: 'Forecast graph dropped — current condition surfaced as markdown.'
	};
}

/**
 * `picture` card → markdown image. Lovelace `picture` is just a
 * rendered image with optional tap/hold actions — translation drops
 * the actions but keeps the image.
 */
function translatePicture(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const url = (card.image ?? card.image_entity ?? '') as string;
	if (!url || typeof url !== 'string') {
		return { blocks: [], coverage: 'unsupported', note: 'image url missing' };
	}
	const alt = (card.alt_text ?? card.title ?? 'image') as string;
	return {
		blocks: [{ type: 'markdown', config: { body: `![${alt}](${url})` } }],
		coverage: card.tap_action ? 'partial' : 'clean',
		note: card.tap_action ? 'tap_action dropped — picture is read-only here.' : undefined
	};
}

/**
 * Build a service call from a Lovelace tap_action. Returns null if
 * the action isn't translatable (e.g. `more-info` modal, navigate to
 * URL). Falls back to a sensible default for entity-typed cards
 * (toggle for lights/switches).
 */
function tapActionToServiceCall(
	tapAction: unknown,
	fallbackEntity: string | null
): { domain: string; service: string; data?: Record<string, unknown>; target?: { entity_id?: string } } | null {
	if (tapAction && typeof tapAction === 'object') {
		const ta = tapAction as Record<string, unknown>;
		if (ta.action === 'call-service' && typeof ta.service === 'string') {
			const [domain, service] = (ta.service as string).split('.');
			if (!domain || !service) return null;
			const target =
				ta.target && typeof ta.target === 'object' ? (ta.target as { entity_id?: string }) : undefined;
			return {
				domain,
				service,
				data: ta.data && typeof ta.data === 'object' ? (ta.data as Record<string, unknown>) : undefined,
				target
			};
		}
		// `toggle` / `more-info` / `navigate` etc — fall through to entity-default
	}
	if (fallbackEntity) {
		const domain = fallbackEntity.split('.')[0];
		// Sensible default per domain
		if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'input_boolean') {
			return { domain, service: 'toggle', target: { entity_id: fallbackEntity } };
		}
		if (domain === 'scene' || domain === 'script') {
			return { domain, service: 'turn_on', target: { entity_id: fallbackEntity } };
		}
		if (domain === 'lock') {
			return { domain: 'lock', service: 'unlock', target: { entity_id: fallbackEntity } };
		}
	}
	return null;
}

/**
 * `button` card → action-grid with one tile. Button is the canonical
 * single-action card; broadsheet's action-grid handles N actions but
 * a one-tile grid is fine.
 */
function translateButton(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? null) as string | null;
	const service = tapActionToServiceCall(card.tap_action, entity);
	if (!service) {
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'tap_action not a recognised service call.'
		};
	}
	const label = (card.name ?? entity ?? 'Action') as string;
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'medium',
					actions: [
						{
							label,
							icon: (card.icon as string) ?? null,
							service,
							stateBinding: entity ? { entityId: entity } : undefined
						}
					]
				}
			}
		],
		coverage: 'clean'
	};
}

/**
 * `light` card → action-grid tile that toggles the light + reflects
 * its state. Lovelace's light card has brightness sliders we don't
 * translate — flagged partial.
 */
function translateLight(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? '') as string;
	if (!entity || !entity.startsWith('light.')) {
		return { blocks: [], coverage: 'unsupported', note: 'entity must be light.*' };
	}
	const label = (card.name ?? entity) as string;
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'medium',
					actions: [
						{
							label,
							service: { domain: 'light', service: 'toggle', target: { entity_id: entity } },
							stateBinding: { entityId: entity }
						}
					]
				}
			}
		],
		coverage: 'partial',
		note: 'Light toggle only — brightness slider + colour controls dropped.'
	};
}

/**
 * `custom:mushroom-template-card` → markdown block. Mushroom template
 * cards use Jinja templates for `primary` / `secondary` / `icon`.
 * We pass the rendered text through as markdown; any Jinja syntax
 * remains as-is (broadsheet doesn't yet evaluate Jinja).
 */
function translateMushroomTemplate(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const primary = (card.primary ?? '') as string;
	const secondary = (card.secondary ?? '') as string;
	const entity = (card.entity ?? null) as string | null;
	const tapAction = card.tap_action;
	// Path 1 — icon-only button shape (no text, has tap_action). Common
	// in remote-control dashboards built from mushroom-template-cards.
	// Land as an action-grid tile so the user can actually tap it.
	if (!primary && !secondary && tapAction) {
		const service = tapActionToServiceCall(tapAction, entity);
		if (service) {
			const label = (card.icon as string)?.replace(/^mdi:/, '') ?? entity ?? 'button';
			return {
				blocks: [
					{
						type: 'action-grid',
						config: {
							size: 'small',
							actions: [
								{
									label,
									icon: (card.icon as string) ?? null,
									service,
									stateBinding: entity ? { entityId: entity } : undefined
								}
							]
						}
					}
				],
				coverage: 'partial',
				note: 'Icon-only mushroom button — translated as action tile.'
			};
		}
	}
	// Path 2 — decorative card (no text, no tap). Common as visual
	// spacers in remote-control layouts (e.g. corners of a D-pad).
	// Recognised but emits no blocks; classified 'partial' so the
	// import isn't penalised in coverage stats but the user sees
	// what was dropped.
	if (!primary && !secondary) {
		return {
			blocks: [],
			coverage: 'partial',
			note: 'Decorative card (no text, no tap) — nothing to render.'
		};
	}
	const body = [primary && `**${primary}**`, secondary].filter(Boolean).join('\n\n');
	const hasJinja = /\{\{|\{%/.test(body);
	return {
		blocks: [{ type: 'markdown', config: { body } }],
		// Jinja templates DO evaluate at render time as of v0.2 commit 3
		// (lib/jinja). Visual chrome — icon + grid layout — is still
		// dropped, so this stays 'partial', not 'clean'.
		coverage: 'partial',
		note: hasJinja
			? 'Card chrome dropped — Jinja templates evaluate at render time.'
			: 'Mushroom card chrome (icon, layout) replaced with markdown.'
	};
}

/**
 * `custom:mushroom-chips-card` → action-grid (small) + markdown
 * fallback for non-action chips (template chips, weather chips,
 * conditional chips). Mixed-content chips emit BOTH blocks: an
 * action-grid for the action chips, then a markdown summary line
 * for the rest. Pure-template chips emit just the markdown.
 */
function translateMushroomChips(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const chips = (card.chips ?? []) as unknown[];
	const actions: ActionGridItemSeed[] = [];
	const labels: string[] = [];
	let dropped = 0;
	for (const chip of chips) {
		if (!chip || typeof chip !== 'object') {
			dropped++;
			continue;
		}
		const c = chip as Record<string, unknown>;
		const entity = (c.entity ?? null) as string | null;
		// Path 1: entity-bound chip → action tile
		if (entity) {
			const service = tapActionToServiceCall(c.tap_action, entity);
			if (service) {
				const label = (c.name ?? c.content ?? entity) as string;
				actions.push({
					label,
					icon: (c.icon as string) ?? null,
					service,
					stateBinding: { entityId: entity }
				});
				continue;
			}
		}
		// Path 2: template / weather / conditional chip → markdown line.
		// `content` is mushroom's primary template field for chips.
		// Falls back to `name` then a generic chip-type label.
		const content = (c.content ?? c.name ?? c.type ?? 'chip') as string;
		labels.push(String(content));
	}
	const blocks: BlockDef[] = [];
	if (actions.length > 0) {
		blocks.push({ type: 'action-grid', config: { size: 'small', actions } });
	}
	if (labels.length > 0) {
		blocks.push({ type: 'markdown', config: { body: labels.join(' · ') } });
	}
	if (blocks.length === 0) {
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'no chips translated.'
		};
	}
	const note =
		actions.length > 0 && labels.length > 0
			? `${labels.length} non-action chip${labels.length === 1 ? '' : 's'} rendered as markdown.`
			: labels.length > 0
				? 'All chips rendered as markdown (no entity-bound actions).'
				: dropped > 0
					? `${dropped} chip${dropped === 1 ? '' : 's'} dropped.`
					: undefined;
	return {
		blocks,
		coverage: dropped > 0 ? 'partial' : labels.length > 0 ? 'partial' : 'clean',
		note
	};
}

/**
 * `custom:mushroom-light-card` / `mushroom-entity-card` →
 * action-grid tile. Mushroom's entity-row variants compress to a
 * single state-bound action tile.
 */
function translateMushroomEntity(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? '') as string;
	if (!entity) {
		return { blocks: [], coverage: 'unsupported', note: 'entity field missing.' };
	}
	const service = tapActionToServiceCall(card.tap_action, entity);
	if (!service) {
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'tap_action not a recognised service call + no domain default.'
		};
	}
	const label = (card.name ?? entity) as string;
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'medium',
					actions: [
						{
							label,
							icon: (card.icon as string) ?? null,
							service,
							stateBinding: { entityId: entity }
						}
					]
				}
			}
		],
		coverage: 'partial',
		note: 'Mushroom card chrome dropped — kept as a state-bound action tile.'
	};
}

/**
 * `custom:mushroom-climate-card` → action-grid tile bound to the
 * climate entity. Mushroom's climate card is the most popular HACS
 * climate UI; previously broadsheet's importer left it `unsupported`
 * which silently dropped every TRV from imported pages (BUG-009).
 *
 * The translator emits a labelled tile that opens HA's more-info
 * dialog when tapped (the canonical Lovelace tap action for climate)
 * — actual setpoint editing still happens in HA's own dialog because
 * broadsheet's action-grid primitive doesn't yet model continuous
 * setpoints.
 */
function translateMushroomClimate(
	card: LovelaceCard
): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? '') as string;
	if (!entity) {
		return { blocks: [], coverage: 'unsupported', note: 'entity field missing.' };
	}
	const label = ((card.name as string) ?? entity).toString();
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'medium',
					actions: [
						{
							label,
							icon: (card.icon as string) ?? 'mdi:thermostat',
							service: {
								// homeassistant.update_entity is a safe no-op tap that
								// also kicks the climate state — keeps the tile
								// reactive without changing setpoint. Setpoint
								// editing is handled via the HA more-info dialog
								// the user opens from the tile.
								domain: 'homeassistant',
								service: 'update_entity',
								target: { entity_id: entity }
							},
							stateBinding: { entityId: entity }
						}
					]
				}
			}
		],
		coverage: 'partial',
		note: 'Climate card → state-bound tile. Setpoint editing stays in HA.'
	};
}

// Helper alias for the translateMushroomChips loop — keeps the
// type checker happy without exporting an internal type.
type ActionGridItemSeed = NonNullable<
	Extract<BlockDef, { type: 'action-grid' }>['config']['actions']
>[number];

/**
 * `conditional` card → recurses into its `card` child. The condition
 * itself is dropped — the wrapped card always renders. v0.2 doesn't
 * have a "conditional block" primitive yet, so this is the honest
 * fallback: surface the content but lose the gating.
 */
function translateConditional(
	card: LovelaceCard,
	recurse: (c: LovelaceCard, idx: number) => { blocks: BlockDef[]; reports: TranslatorReport[] }
): { blocks: BlockDef[]; coverage: Coverage; note?: string; childReports: TranslatorReport[] } {
	const child = (card.card ?? null) as LovelaceCard | null;
	if (!child) {
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'no `card` child found',
			childReports: []
		};
	}
	const r = recurse(child, 0);
	return {
		blocks: r.blocks,
		coverage: 'partial',
		note: 'Condition dropped — wrapped card always renders.',
		childReports: r.reports
	};
}

/**
 * `custom:layout-card` → recurses into ALL of its child cards.
 * The grid / masonry layout config is dropped; broadsheet renders
 * children flat-vertically. Coverage is 'clean' for the wrapper
 * itself; child coverage rolls up via the per-child reports.
 */
function translateLayoutCard(
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
	return {
		blocks,
		coverage: 'clean',
		note: 'Layout positioning dropped — children render flat-vertically.',
		childReports
	};
}

/**
 * `custom:calendar-card-pro` (and similar HACS calendar cards)
 * → markdown stub describing the calendar entity. The agenda view
 * doesn't translate to a primitive yet — surface the entity_id so
 * the user knows what was wrapped.
 */
function translateCalendarCardPro(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entities = (card.entities ?? []) as unknown[];
	const ids: string[] = entities
		.map((e) => {
			if (typeof e === 'string') return e;
			if (e && typeof e === 'object' && typeof (e as { entity?: string }).entity === 'string')
				return (e as { entity: string }).entity;
			return null;
		})
		.filter((s): s is string => s !== null);
	const title = (card.title ?? 'Calendar') as string;
	const body =
		ids.length > 0
			? `**${title}** — ${ids.map((id) => `\`${id}\``).join(', ')}`
			: `**${title}** — no calendars configured`;
	return {
		blocks: [{ type: 'markdown', config: { body } }],
		coverage: 'partial',
		note: 'Agenda view dropped — surfaced as markdown stub naming the calendar(s).'
	};
}

/**
 * `tile` card (built-in, newer) → action-grid item.
 * Tile cards are HA's modern entity-tile UI — single state-bound
 * tile with optional features (sliders, buttons). For v0.2 we
 * translate to a simple state-bound action tile.
 */
function translateTile(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? '') as string;
	if (!entity) return { blocks: [], coverage: 'unsupported', note: 'entity field missing.' };
	const service = tapActionToServiceCall(card.tap_action, entity);
	if (!service)
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'tap_action not recognised + no domain default.'
		};
	const label = (card.name ?? entity) as string;
	const features = Array.isArray(card.features) && card.features.length > 0;
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'medium',
					actions: [
						{
							label,
							icon: (card.icon as string) ?? null,
							service,
							stateBinding: { entityId: entity }
						}
					]
				}
			}
		],
		coverage: 'partial',
		note: features
			? 'Tile features (sliders, buttons) dropped — single state-bound action only.'
			: undefined
	};
}

/**
 * `media-control` card → action-grid with play/pause + next/prev
 * buttons for the media player. Browse-media + volume-slider are
 * dropped.
 */
function translateMediaControl(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? '') as string;
	if (!entity || !entity.startsWith('media_player.')) {
		return { blocks: [], coverage: 'unsupported', note: 'entity must be media_player.*' };
	}
	const target = { entity_id: entity };
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'small',
					actions: [
						{ label: '⏮', service: { domain: 'media_player', service: 'media_previous_track', target } },
						{ label: '⏯', service: { domain: 'media_player', service: 'media_play_pause', target }, stateBinding: { entityId: entity, activeStates: ['playing'] } },
						{ label: '⏭', service: { domain: 'media_player', service: 'media_next_track', target } }
					]
				}
			}
		],
		coverage: 'partial',
		note: 'Browse-media + volume slider dropped — playback controls only.'
	};
}

/**
 * `iframe` card → markdown link. We can't iframe arbitrary URLs
 * inside broadsheet (CSP, addon ingress constraints), so the URL
 * surfaces as a clickable link.
 */
function translateIframe(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const url = (card.url ?? '') as string;
	if (!url) return { blocks: [], coverage: 'unsupported', note: 'url field missing.' };
	const title = (card.title ?? 'External page') as string;
	return {
		blocks: [
			{
				type: 'markdown',
				config: {
					body: `[**${title}**](${url})`
				}
			}
		],
		coverage: 'partial',
		note: 'iframe replaced with a link — broadsheet does not embed external URLs.'
	};
}

/**
 * `picture-glance` → markdown image (top) + entity-list (bottom).
 * Lovelace's picture-glance is "image with state chips overlaid";
 * broadsheet flattens to image + list.
 */
function translatePictureGlance(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const url = (card.image ?? '') as string;
	const rawEntities = (card.entities ?? []) as unknown[];
	const ids: string[] = [];
	for (const row of rawEntities) {
		if (typeof row === 'string') ids.push(row);
		else if (row && typeof row === 'object') {
			const r = row as { entity?: string };
			if (r.entity) ids.push(r.entity);
		}
	}
	const blocks: BlockDef[] = [];
	if (url) {
		blocks.push({ type: 'markdown', config: { body: `![${(card.title ?? 'image') as string}](${url})` } });
	}
	if (ids.length > 0) {
		blocks.push({
			type: 'entity-list',
			config: { label: (card.title ?? null) as string | null, entities: ids, showIcon: true }
		});
	}
	if (blocks.length === 0) {
		return { blocks: [], coverage: 'unsupported', note: 'no image or entities resolved.' };
	}
	return {
		blocks,
		coverage: 'partial',
		note: 'Glance overlay flattened — image then entity list.'
	};
}

/**
 * `picture-entity` → markdown image + entity status line. Similar to
 * picture-glance but for a single entity.
 */
function translatePictureEntity(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? '') as string;
	if (!entity) return { blocks: [], coverage: 'unsupported', note: 'entity field missing.' };
	const url = (card.image ?? card.image_entity ?? null) as string | null;
	const name = (card.name ?? entity) as string;
	const blocks: BlockDef[] = [];
	if (url && typeof url === 'string') {
		blocks.push({ type: 'markdown', config: { body: `![${name}](${url})` } });
	}
	blocks.push({
		type: 'markdown',
		config: { body: `**${name}**: \`{{${entity}}}\`` }
	});
	return {
		blocks,
		coverage: 'partial',
		note: 'Image + state line — tap_action overlay dropped.'
	};
}

/**
 * `heading` card → outline block. HA's section-heading card is the
 * built-in equivalent of the OutLine primitive — direct mapping.
 */
function translateHeading(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const heading = (card.heading ?? card.title ?? '') as string;
	if (!heading) {
		return { blocks: [], coverage: 'unsupported', note: 'no heading text.' };
	}
	return {
		blocks: [{ type: 'outline', config: { label: heading } }],
		coverage: 'clean'
	};
}

/**
 * `custom:mini-graph-card` (HACS) → markdown stub showing the latest
 * value(s) of the graphed entity/entities. The chart history doesn't
 * have a primitive landing zone yet; surfacing the live value keeps
 * the import readable + flagged 'partial' so the user knows.
 */
function translateMiniGraph(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	// Two shapes: single `entity` field, OR `entities` array (multi-line).
	const single = (card.entity ?? null) as string | null;
	const multi = (card.entities ?? null) as unknown[] | null;
	const ids: string[] = [];
	if (single) ids.push(single);
	if (Array.isArray(multi)) {
		for (const e of multi) {
			if (typeof e === 'string') ids.push(e);
			else if (e && typeof e === 'object' && typeof (e as { entity?: string }).entity === 'string')
				ids.push((e as { entity: string }).entity);
		}
	}
	if (ids.length === 0) {
		return { blocks: [], coverage: 'unsupported', note: 'no entity / entities resolved.' };
	}
	const name = (card.name ?? null) as string | null;
	const hours = (card.hours_to_show ?? 24) as number;
	// Emit one sparkline per entity. Multi-line charts become stacked
	// sparklines — broadsheet doesn't yet do overlaid lines (the
	// editorial register prefers a stack of sparklines anyway).
	const blocks: BlockDef[] = ids.map((id, i) => ({
		type: 'sparkline',
		config: {
			entityId: id,
			label: i === 0 ? name : null, // label only on the first
			hours
		}
	}));
	return {
		blocks,
		// Multi-entity: 'partial' (overlaid → stacked is a register
		// shift). Single-entity: clean — direct 1:1 mapping.
		coverage: ids.length === 1 ? 'clean' : 'partial',
		note:
			ids.length > 1
				? `Multi-entity overlay split into ${ids.length} stacked sparklines.`
				: undefined
	};
}

/**
 * `custom:button-card` (HACS) → action-grid item. Button-card is the
 * Swiss army knife — supports templates, custom layouts, etc. We
 * land it as a single action tile, the most-common shape.
 */
function translateButtonCard(card: LovelaceCard): { blocks: BlockDef[]; coverage: Coverage; note?: string } {
	const entity = (card.entity ?? null) as string | null;
	const service = tapActionToServiceCall(card.tap_action, entity);
	if (!service)
		return {
			blocks: [],
			coverage: 'unsupported',
			note: 'no recognised tap_action + no entity domain default.'
		};
	const label = (card.label ?? card.name ?? entity ?? 'button') as string;
	return {
		blocks: [
			{
				type: 'action-grid',
				config: {
					size: 'medium',
					actions: [
						{
							label,
							icon: (card.icon as string) ?? null,
							service,
							stateBinding: entity ? { entityId: entity } : undefined
						}
					]
				}
			}
		],
		coverage: 'partial',
		note: 'Custom layout + per-state styling dropped — single state-bound action tile.'
	};
}

/* ── The dispatch table ───────────────────────────────────────────── */

const TRANSLATORS: Record<string, true> = {
	markdown: true,
	entity: true,
	entities: true,
	'vertical-stack': true,
	'horizontal-stack': true,
	glance: true,
	gauge: true,
	sensor: true,
	'weather-forecast': true,
	picture: true,
	'picture-glance': true,
	'picture-entity': true,
	button: true,
	light: true,
	tile: true,
	'media-control': true,
	conditional: true,
	iframe: true,
	heading: true,
	'custom:mini-graph-card': true,
	'custom:mushroom-template-card': true,
	'custom:mushroom-chips-card': true,
	'custom:mushroom-light-card': true,
	'custom:mushroom-entity-card': true,
	'custom:mushroom-climate-card': true,
	'custom:layout-card': true,
	'custom:stack-in-card': true,
	'custom:button-card': true,
	'custom:calendar-card-pro': true
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
/**
 * 0.9.4 — masonry-default heuristic for views without explicit
 * layout signals (the legacy default view shape, every install
 * since the beginning of HA).
 *
 * Tiered: 3-col when > 12 cards, 2-col when 6-12, 1-col under 6.
 * Each tier ALSO requires ≥ 1 small card type in the bunch (chip,
 * glance, sensor, tile, mushroom-chip, custom mini chips, button) —
 * dashboards consisting entirely of tall graphs / media-controls
 * stay single-column to avoid bunching them side-by-side.
 *
 * Returns either:
 *  - { wrap: true,  columns: N } — caller wraps the translated
 *    blocks in a grid block with that column count, all colSpans
 *    default to 1, status `partial-layout` on the source's reports
 *  - { wrap: false } — single-column flat sequence (current behaviour)
 */
function masonryHeuristic(cards: LovelaceCard[]): { wrap: boolean; columns: number } {
	const n = cards.length;
	if (n < 6) return { wrap: false, columns: 1 };
	// "Small card" types — narrow / short, safe to put side-by-side
	const smallTypes = new Set([
		'chip',
		'chips',
		'glance',
		'sensor',
		'tile',
		'button',
		'entity',
		'custom:mushroom-chips-card',
		'custom:mushroom-template-card',
		'custom:mushroom-entity-card',
		'custom:mushroom-light-card',
		'custom:button-card',
		'heading'
	]);
	const hasSmall = cards.some((c) => typeof c.type === 'string' && smallTypes.has(c.type));
	if (!hasSmall) return { wrap: false, columns: 1 };
	if (n > 12) return { wrap: true, columns: 3 };
	return { wrap: true, columns: 2 };
}

export function translateView(view: LovelaceView): TranslatedView {
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

		// 0.9.4: `grid` card — translates 1:1 to a broadsheet grid block
		// with the source's column count + per-child colSpan from each
		// child's grid_options.columns.
		if (t === 'grid') {
			const r = translateGrid(card, visit);
			return {
				blocks: r.blocks,
				reports: [
					{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx },
					...r.childReports
				]
			};
		}

		// Other recursive wrappers — `conditional` (one child), `layout-card` (many)
		if (t === 'conditional') {
			const r = translateConditional(card, visit);
			return {
				blocks: r.blocks,
				reports: [
					{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx },
					...r.childReports
				]
			};
		}
		if (t === 'custom:layout-card' || t === 'custom:stack-in-card') {
			const r = translateLayoutCard(card, visit);
			return {
				blocks: r.blocks,
				reports: [
					{
						type: t,
						coverage: r.coverage,
						note:
							t === 'custom:stack-in-card'
								? 'stack-in-card chrome dropped — children render flat-vertically.'
								: r.note,
						sourceIndex: idx
					},
					...r.childReports
				]
			};
		}

		// Single-card translators (no recursion)
		const singleCardTranslators: Record<
			string,
			(card: LovelaceCard) => { blocks: BlockDef[]; coverage: Coverage; note?: string }
		> = {
			glance: translateGlance,
			gauge: translateGauge,
			sensor: translateSensor,
			'weather-forecast': translateWeatherForecast,
			picture: translatePicture,
			'picture-glance': translatePictureGlance,
			'picture-entity': translatePictureEntity,
			button: translateButton,
			light: translateLight,
			tile: translateTile,
			'media-control': translateMediaControl,
			iframe: translateIframe,
			heading: translateHeading,
			'custom:mini-graph-card': translateMiniGraph,
			'custom:mushroom-template-card': translateMushroomTemplate,
			'custom:mushroom-chips-card': translateMushroomChips,
			'custom:mushroom-light-card': translateMushroomEntity,
			'custom:mushroom-entity-card': translateMushroomEntity,
			'custom:mushroom-climate-card': translateMushroomClimate,
			'custom:button-card': translateButtonCard,
			'custom:calendar-card-pro': translateCalendarCardPro
		};
		const fn = singleCardTranslators[t];
		if (fn) {
			const r = fn(card);
			return {
				blocks: r.blocks,
				reports: [{ type: t, coverage: r.coverage, note: r.note, sourceIndex: idx }]
			};
		}

		// Unsupported — but emit a placeholder markdown block so the user
		// SEES that something was there in their source dashboard. Better
		// than silently dropping (BUG-010); the user can choose whether
		// to delete or replace the placeholder. Best-effort entity
		// surfaced so it's clear what the missing card was for.
		const fallbackEntity =
			(card.entity as string | undefined) ??
			(Array.isArray(card.entities) && card.entities.length > 0
				? typeof card.entities[0] === 'string'
					? (card.entities[0] as string)
					: ((card.entities[0] as { entity?: string })?.entity ?? '')
				: '');
		const placeholderBody =
			fallbackEntity
				? `> _Unsupported \`${t || 'card'}\` for \`${fallbackEntity}\` — open in HA._`
				: `> _Unsupported \`${t || 'card'}\` — no broadsheet translator yet._`;
		return {
			blocks: [
				{
					type: 'markdown',
					config: { body: placeholderBody }
				}
			],
			reports: [
				{
					type: t || '(no type)',
					coverage: 'unsupported',
					note: 'No translator for this card type yet — placeholder emitted.',
					sourceIndex: idx
				}
			]
		};
	};

	/*
	 * 0.9.4 — view-level dispatch on view.type:
	 *
	 *  - `sections` view → one grid block per section, with 12-col
	 *    scale + per-card colSpan from grid_options.columns. Each
	 *    section's title (if set) emits an outline block above.
	 *  - `panel` view → one card fills the view; translate it
	 *    without any wrapping. The panel-flag is layout metadata
	 *    we don't need on broadsheet's side.
	 *  - default / masonry view → translate cards individually, then
	 *    optionally wrap the whole sequence in a grid via the
	 *    masonry heuristic when enough small-type cards are present.
	 */
	const viewType = view.type as string | undefined;

	if (viewType === 'sections') {
		const sections = (view.sections ?? []) as Array<{
			title?: string;
			type?: string;
			cards?: LovelaceCard[];
		}>;
		sections.forEach((section, secIdx) => {
			if (section.title) {
				blocks.push({ type: 'outline', config: { label: section.title } });
			}
			const sectionCards = (section.cards ?? []) as LovelaceCard[];
			const childBlocks: BlockDef[] = [];
			sectionCards.forEach((c, i) => {
				const r = visit(c, secIdx * 1000 + i);
				const gridOpts = c.grid_options as { columns?: number } | undefined;
				const span =
					gridOpts && typeof gridOpts.columns === 'number' && gridOpts.columns > 0
						? gridOpts.columns
						: undefined;
				for (const b of r.blocks) {
					if (span !== undefined) (b as BlockDef).colSpan = span;
					childBlocks.push(b);
				}
				reports.push(...r.reports);
			});
			if (childBlocks.length > 0) {
				blocks.push({
					type: 'grid',
					config: {
						columns: 12,
						children: childBlocks,
						gap: 3
					}
				});
			}
		});

		return {
			title: (view.title ?? null) as string | null,
			path: (view.path ?? null) as string | null,
			blocks,
			reports
		};
	}

	// Default / panel / masonry — iterate top-level cards through `visit`.
	const cards = (view.cards ?? []) as LovelaceCard[];

	if (viewType === 'panel') {
		// Single card fills the view; if there's exactly one we translate
		// it without any wrapping. Fall through otherwise (rare — broken
		// panel views with multiple cards).
		if (cards.length === 1) {
			const r = visit(cards[0], 0);
			blocks.push(...r.blocks);
			reports.push(...r.reports);
			return {
				title: (view.title ?? null) as string | null,
				path: (view.path ?? null) as string | null,
				blocks,
				reports
			};
		}
	}

	// Translate each top-level card individually first.
	const topLevelBlocksByIndex: BlockDef[][] = [];
	cards.forEach((card, i) => {
		const r = visit(card, i);
		topLevelBlocksByIndex.push(r.blocks);
		reports.push(...r.reports);
	});

	// Apply the masonry heuristic for default views — if it returns
	// wrap, package the whole sequence into a grid block. Each child
	// keeps its default colSpan (1) so the grid auto-distributes them.
	const heuristic = masonryHeuristic(cards);
	if (heuristic.wrap && viewType !== 'panel') {
		const childBlocks: BlockDef[] = [];
		for (const seq of topLevelBlocksByIndex) {
			childBlocks.push(...seq);
		}
		// Re-stamp the reports with partial-layout so the user sees the
		// heuristic was applied (data made it through, layout is a guess).
		for (const report of reports) {
			if (report.coverage === 'clean') report.coverage = 'partial-layout';
		}
		blocks.push({
			type: 'grid',
			config: {
				columns: heuristic.columns,
				children: childBlocks,
				gap: 3
			}
		});
	} else {
		// No wrap — flat sequence (legacy behaviour).
		for (const seq of topLevelBlocksByIndex) {
			blocks.push(...seq);
		}
	}

	return {
		title: (view.title ?? null) as string | null,
		path: (view.path ?? null) as string | null,
		blocks,
		reports
	};
}

/* ── 0.9.4.1: chip-bar dedup + multi-view → tabs ──────────────────
 *
 * Real-world Lovelace dashboards with multiple views typically have
 * a hand-authored navigation chip-bar at the TOP of every view, so
 * the user can switch between tabs. The cards in the bar are usually
 * `custom:mushroom-template-card` (or chips inside a
 * `custom:mushroom-chips-card`) whose `tap_action: { action: navigate,
 * navigation_path: '/<dashboard>/<sibling-view-path>' }` points at a
 * sibling view.
 *
 * When 0.9.4.1's multi-view import wraps the views in a `tabs` block,
 * the tabs block IS that nav. Leaving the source chip-bar in the
 * per-view content gives the user two navs doing the same job. So
 * the translator strips it.
 *
 * Pattern: a TOP-LEVEL card in the view is a "view-nav chip-bar"
 * when it's a `horizontal-stack` / `vertical-stack` / `custom:mushroom-
 * chips-card` whose children (or chips) are ALL chip-shaped cards
 * whose tap_action.navigation_path matches a sibling view's path.
 *
 * The detection runs only when the importer knows the sibling paths,
 * so single-view imports never strip anything by accident.
 */

function getNavTargetPath(card: LovelaceCard): string | null {
	// Direct: tap_action.navigation_path
	const ta = card.tap_action as
		| { action?: string; navigation_path?: string }
		| undefined;
	if (ta && ta.action === 'navigate' && typeof ta.navigation_path === 'string') {
		return ta.navigation_path;
	}
	return null;
}

function isNavigateChipCard(
	card: LovelaceCard,
	siblingPaths: ReadonlySet<string>
): boolean {
	const path = getNavTargetPath(card);
	if (path && siblingPaths.has(path)) return true;
	return false;
}

/**
 * Walks a card and decides whether it's a chip-bar of view-nav
 * chips. Recurses ONE level for stacks + mushroom-chips-card.
 * Returns true only when ALL children/chips look like view-nav
 * (any non-nav child means the user mixed nav with content; keep it).
 */
function isViewNavChipBar(card: LovelaceCard, siblingPaths: ReadonlySet<string>): boolean {
	if (siblingPaths.size === 0) return false;
	const t = card.type;
	// horizontal-stack / vertical-stack of nav-chip cards
	if (t === 'horizontal-stack' || t === 'vertical-stack') {
		const children = (card.cards ?? []) as LovelaceCard[];
		if (children.length === 0) return false;
		return children.every((c) => isNavigateChipCard(c, siblingPaths));
	}
	// custom:mushroom-chips-card with chips that all navigate
	if (t === 'custom:mushroom-chips-card') {
		const chips = (card.chips ?? []) as Array<{
			tap_action?: { action?: string; navigation_path?: string };
		}>;
		if (chips.length === 0) return false;
		return chips.every((chip) => {
			const ta = chip.tap_action;
			return (
				ta?.action === 'navigate' &&
				typeof ta.navigation_path === 'string' &&
				siblingPaths.has(ta.navigation_path)
			);
		});
	}
	return false;
}

/**
 * Filter a view's top-level cards down to those that AREN'T view-nav
 * chip-bars. Conservative — only top-level removal, never recurses
 * into stacks (a chip-bar nested 3 levels deep stays; that's the
 * author's deliberate placement).
 */
function stripViewNavChipBars(
	cards: LovelaceCard[],
	siblingPaths: ReadonlySet<string>
): LovelaceCard[] {
	return cards.filter((c) => !isViewNavChipBar(c, siblingPaths));
}

/**
 * Translate a view with optional chip-bar stripping. Same body as
 * `translateView` but accepts the sibling paths set so it can pre-
 * filter the top-level cards before the existing walker runs.
 *
 * Used by `translateDashboardAsTabs`; the public `translateView`
 * defers to this with an empty sibling set (no stripping for
 * single-view imports).
 */
function translateViewWithSiblings(
	view: LovelaceView,
	siblingPaths: ReadonlySet<string>
): TranslatedView {
	if (siblingPaths.size === 0) return translateView(view);
	// Build a shallow-clone view with top-level cards stripped of nav-chip-bars.
	const stripped: LovelaceView = {
		...view,
		cards: stripViewNavChipBars((view.cards ?? []) as LovelaceCard[], siblingPaths)
	} as LovelaceView;
	return translateView(stripped);
}

/**
 * Derive the set of sibling view paths for a dashboard. Each view's
 * `path` is converted to its full canonical URL form
 * (`/<dashboard-url-path>/<view-path>`) so the comparison matches
 * how Lovelace authors actually write `tap_action.navigation_path`.
 * `dashboardUrlPath` is null for the default dashboard, in which
 * case views are addressed as `/lovelace/<view-path>`.
 */
function siblingViewPaths(
	views: LovelaceView[],
	dashboardUrlPath: string | null
): Set<string> {
	const out = new Set<string>();
	const prefix = dashboardUrlPath ?? 'lovelace';
	for (const v of views) {
		const path = (v.path ?? null) as string | null;
		if (!path) continue;
		out.add(`/${prefix}/${path}`);
		// Some authors omit the leading dashboard prefix — also accept
		// the bare `/<view-path>` form. Cheap to add both.
		out.add(`/${path}`);
	}
	return out;
}

/**
 * Multi-view dashboard → one TranslatedView whose single block is a
 * `tabs` block. Each tab = one source view, with chip-bar nav stripped
 * from per-view content (the tabs block IS that nav). View `path` is
 * the tab id (so deep-links land on the right tab); view `title` is
 * the chip label.
 *
 * Aggregate `reports` carries ALL views' per-card reports so the
 * coverage UI sees the whole dashboard as one unit.
 */
export function translateDashboardAsTabs(
	config: LovelaceConfig,
	dashboardUrlPath: string | null
): TranslatedDashboard {
	const sourceViews = (config.views ?? []) as LovelaceView[];
	const siblingPaths = siblingViewPaths(sourceViews, dashboardUrlPath);

	const reports: TranslatorReport[] = [];
	const tabs: import('$lib/blocks/types').TabDef[] = [];

	sourceViews.forEach((v, idx) => {
		const translated = translateViewWithSiblings(v, siblingPaths);
		const rawId = (v.path ?? slugifyForBroadsheet(v.title ?? `view-${idx + 1}`)) as string;
		const id = slugifyForBroadsheet(rawId) || `view-${idx + 1}`;
		tabs.push({
			id,
			label: (v.title ?? `View ${idx + 1}`) as string,
			icon: (v.icon ?? null) as string | null,
			blocks: translated.blocks
		});
		reports.push(...translated.reports);
	});

	const aggregatedView: TranslatedView = {
		title: (config.title ?? null) as string | null,
		path: null,
		blocks: [
			{
				type: 'tabs',
				config: { tabs }
			}
		],
		reports
	};

	// Tally totals across all reports (same shape as translateDashboard).
	let clean = 0,
		partial = 0,
		partialLayout = 0,
		unsupported = 0,
		total = 0;
	for (const r of reports) {
		total++;
		if (r.coverage === 'clean') clean++;
		else if (r.coverage === 'partial') partial++;
		else if (r.coverage === 'partial-layout') partialLayout++;
		else unsupported++;
	}

	return {
		title: (config.title ?? null) as string | null,
		views: [aggregatedView],
		totals: { clean, partial, partialLayout, unsupported, total }
	};
}

/** Translate every view in a dashboard config. */
export function translateDashboard(config: LovelaceConfig): TranslatedDashboard {
	const views = (config.views ?? []).map(translateView);
	let clean = 0,
		partial = 0,
		partialLayout = 0,
		unsupported = 0,
		total = 0;
	for (const v of views) {
		for (const r of v.reports) {
			total++;
			if (r.coverage === 'clean') clean++;
			else if (r.coverage === 'partial') partial++;
			else if (r.coverage === 'partial-layout') partialLayout++;
			else unsupported++;
		}
	}
	return {
		title: (config.title ?? null) as string | null,
		views,
		totals: { clean, partial, partialLayout, unsupported, total }
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
