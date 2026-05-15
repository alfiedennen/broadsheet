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
	// Path 2 — text card (primary / secondary). Existing behaviour.
	if (!primary && !secondary) {
		return { blocks: [], coverage: 'unsupported', note: 'no primary/secondary text + no actionable tap.' };
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
	const name = (card.name ?? 'Trend') as string;
	const lines = ids.map((id) => `- \`${id}\`: \`{{${id}}}\``);
	const body = `**${name}** (graph dropped)\n\n${lines.join('\n')}`;
	return {
		blocks: [{ type: 'markdown', config: { body } }],
		coverage: 'partial',
		note: 'Chart history dropped — current values surfaced as a list.'
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
