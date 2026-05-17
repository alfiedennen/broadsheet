/**
 * TMDB client — browser-side, for @broadsheet/tmdb-tv.
 *
 * Ported from harold-home's `tmdb.ts`. The one structural change:
 * harold-home baked a single token into the bundle via
 * `VITE_TMDB_TOKEN`; broadsheet's token is USER-SUPPLIED, read from
 * `curation.integrations.tmdb.apiKey` and passed in here. So this is
 * a `createTmdbClient(token, region)` factory rather than a module
 * with a baked-in token.
 *
 * Responses are cached in localStorage with a 1h TTL — refreshing
 * `/tv` reuses cached responses and only re-hits TMDB on expiry.
 * Cache keys include the region so switching region doesn't serve
 * stale rows.
 *
 * TMDB's API supports browser CORS (it's built for client-side use),
 * so the renderer can fetch it directly — no proxy needed.
 */

const BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

/** The slice of a TMDB list item broadsheet actually reads. */
export interface TmdbItem {
	id: number;
	title?: string; // movies
	name?: string; // tv
	release_date?: string;
	first_air_date?: string;
	poster_path: string | null;
	overview?: string;
	vote_average?: number;
	media_type?: 'movie' | 'tv'; // present on /trending mixed responses
}

/* ── cache layer ───────────────────────────────────────────────── */

function cacheGet<T>(key: string): T | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(`tmdb:${key}`);
	if (!raw) return null;
	try {
		const { ts, data } = JSON.parse(raw) as { ts: number; data: T };
		if (Date.now() - ts > CACHE_TTL_MS) return null;
		return data;
	} catch {
		return null;
	}
}

function cacheSet<T>(key: string, data: T): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(`tmdb:${key}`, JSON.stringify({ ts: Date.now(), data }));
	} catch {
		/* quota — ignore */
	}
}

/* ── client factory ────────────────────────────────────────────── */

/**
 * Theme E — depth knobs the client honours. Each is optional + has a
 * sensible default (see createTmdbClient). Passing through from
 * `curation.integrations.tmdb.*`.
 */
export interface TmdbClientOptions {
	/**
	 * Watch-provider IDs to filter by, e.g. [8, 337] for Netflix +
	 * Disney+. Empty / undefined = no filter (show everything
	 * available in the region).
	 */
	providers?: number[];
	/** Trending window — TMDB natively supports `day` or `week`. */
	trendingWindow?: 'day' | 'week';
	/** Days to look back for the "New" row. Defaults to 45. */
	newReleasesWindowDays?: number;
}

export interface TmdbClient {
	/**
	 * "Trending this <window>" — mixed movies + TV, region-wide.
	 * Window comes from TmdbClientOptions.trendingWindow (default
	 * 'week').
	 */
	trending(): Promise<TmdbItem[]>;
	/**
	 * Recent releases (last `newReleasesWindowDays`), region-wide,
	 * movies + TV merged. Window is configured at client-build time;
	 * pass nothing OR override via the optional windowDays arg.
	 */
	newReleases(windowDays?: number): Promise<TmdbItem[]>;
}

/**
 * Build a TMDB client bound to a user token + region. The token is a
 * TMDB v4 read access token (the free one); region is an ISO-3166-1
 * code like `GB` / `US`. Theme E adds optional depth knobs (providers,
 * trendingWindow, newReleasesWindowDays).
 */
export function createTmdbClient(
	token: string,
	region: string,
	options: TmdbClientOptions = {}
): TmdbClient {
	const providers = options.providers ?? [];
	const trendingWindow = options.trendingWindow ?? 'week';
	const defaultWindowDays = options.newReleasesWindowDays ?? 45;
	// Typed explicitly as a flat Record so spreading into the discover
	// params doesn't widen the union into a Record-with-optional-string
	// shape that the tmdb() signature rejects.
	const providerParam: Record<string, string> =
		providers.length > 0 ? { with_watch_providers: providers.join('|') } : {};
	async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
		const usp = new URLSearchParams(
			Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
		);
		const cacheKey = `${region}:${path}?${usp.toString()}`;
		const hit = cacheGet<T>(cacheKey);
		if (hit) return hit;
		const r = await fetch(`${BASE}${path}?${usp.toString()}`, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
		});
		if (!r.ok) throw new Error(`TMDB ${r.status}`);
		const json = (await r.json()) as T;
		cacheSet(cacheKey, json);
		return json;
	}

	return {
		async trending(): Promise<TmdbItem[]> {
			// TMDB's /trending endpoint doesn't accept with_watch_providers
			// (it's an aggregate, not a discover query). When providers
			// are set we switch to /discover sorted by popularity within
			// the window, giving "trending on these providers".
			if (providers.length > 0) {
				const days = trendingWindow === 'day' ? 1 : 7;
				const since = new Date(Date.now() - days * 86400 * 1000)
					.toISOString()
					.slice(0, 10);
				const today = new Date().toISOString().slice(0, 10);
				const common = {
					watch_region: region,
					region,
					'vote_count.gte': 5,
					sort_by: 'popularity.desc',
					page: 1,
					...providerParam
				};
				const [movies, tv] = await Promise.all([
					tmdb<{ results: TmdbItem[] }>('/discover/movie', {
						...common,
						'primary_release_date.gte': since,
						'primary_release_date.lte': today
					}),
					tmdb<{ results: TmdbItem[] }>('/discover/tv', {
						...common,
						'first_air_date.gte': since,
						'first_air_date.lte': today
					})
				]);
				const tagged: TmdbItem[] = [
					...movies.results.map((r) => ({ ...r, media_type: 'movie' as const })),
					...tv.results.map((r) => ({ ...r, media_type: 'tv' as const }))
				];
				return tagged.filter((x) => x.poster_path).slice(0, 18);
			}
			// No provider filter — use TMDB's native /trending endpoint
			// for the canonical "trending right now" cross-platform mix.
			const r = await tmdb<{ results: TmdbItem[] }>(`/trending/all/${trendingWindow}`, {
				region
			});
			return r.results
				.filter((x) => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv'))
				.slice(0, 18);
		},

		async newReleases(windowDays = defaultWindowDays): Promise<TmdbItem[]> {
			const since = new Date(Date.now() - windowDays * 86400 * 1000).toISOString().slice(0, 10);
			const today = new Date().toISOString().slice(0, 10);
			const common = {
				watch_region: region,
				region,
				'vote_count.gte': 5, // weed out no-signal noise
				page: 1,
				...providerParam
			};
			const [movies, tv] = await Promise.all([
				tmdb<{ results: TmdbItem[] }>('/discover/movie', {
					...common,
					sort_by: 'primary_release_date.desc',
					'primary_release_date.gte': since,
					'primary_release_date.lte': today
				}),
				tmdb<{ results: TmdbItem[] }>('/discover/tv', {
					...common,
					sort_by: 'first_air_date.desc',
					'first_air_date.gte': since,
					'first_air_date.lte': today
				})
			]);
			const tagged: TmdbItem[] = [
				...movies.results.map((r) => ({ ...r, media_type: 'movie' as const })),
				...tv.results.map((r) => ({ ...r, media_type: 'tv' as const }))
			];
			return tagged
				.filter((x) => x.poster_path)
				.sort((a, b) => {
					const da = a.release_date || a.first_air_date || '';
					const db = b.release_date || b.first_air_date || '';
					return db.localeCompare(da);
				})
				.slice(0, 18);
		}
	};
}

/**
 * Curated provider catalogue. TMDB has 500+ provider IDs across
 * regions; we ship a sensible UK + US subset so the settings UI can
 * offer a multi-select chip row without forcing the user to look up
 * numeric IDs. Plugins / advanced users can still pass arbitrary IDs
 * via the curation field — this catalogue is only the picker source.
 *
 * Region affinity: GB providers shown when region === 'GB', US when
 * region === 'US'. Cross-region (Netflix etc.) shown everywhere.
 */
export interface ProviderCatalogueEntry {
	id: number;
	name: string;
	/** Regions where this entry is the canonical provider. */
	regions: ('GB' | 'US' | 'global')[];
}

export const PROVIDER_CATALOGUE: ProviderCatalogueEntry[] = [
	// Cross-region / global
	{ id: 8, name: 'Netflix', regions: ['global'] },
	{ id: 9, name: 'Prime Video', regions: ['global'] },
	{ id: 337, name: 'Disney Plus', regions: ['global'] },
	{ id: 350, name: 'Apple TV Plus', regions: ['global'] },
	{ id: 384, name: 'Max', regions: ['global'] },
	// GB-specific
	{ id: 38, name: 'BBC iPlayer', regions: ['GB'] },
	{ id: 103, name: 'Channel 4', regions: ['GB'] },
	{ id: 151, name: 'ITVX', regions: ['GB'] },
	{ id: 39, name: 'Now TV', regions: ['GB'] },
	// US-specific
	{ id: 15, name: 'Hulu', regions: ['US'] },
	{ id: 386, name: 'Peacock', regions: ['US'] },
	{ id: 387, name: 'Peacock Premium', regions: ['US'] },
	{ id: 531, name: 'Paramount Plus', regions: ['US'] }
];

/** Pick the provider entries the settings UI should offer for `region`. */
export function providersForRegion(region: string): ProviderCatalogueEntry[] {
	return PROVIDER_CATALOGUE.filter(
		(p) => p.regions.includes('global') || p.regions.includes(region as 'GB' | 'US')
	);
}

/**
 * Curated list of ISO 3166-1 alpha-2 region codes the TMDB settings
 * panel offers in its dropdown. Covers the regions TMDB has rich
 * watch-provider coverage for + the territories Alfie's likely
 * audience lives in. Adding a region is mechanical — drop a new
 * `{ code, name }` entry in here. The dropdown sorts by name so
 * ordering of the array doesn't matter.
 */
export interface RegionOption {
	code: string;
	name: string;
}

export const TMDB_REGIONS: RegionOption[] = [
	{ code: 'GB', name: 'United Kingdom' },
	{ code: 'US', name: 'United States' },
	{ code: 'IE', name: 'Ireland' },
	{ code: 'CA', name: 'Canada' },
	{ code: 'AU', name: 'Australia' },
	{ code: 'NZ', name: 'New Zealand' },
	{ code: 'DE', name: 'Germany' },
	{ code: 'FR', name: 'France' },
	{ code: 'ES', name: 'Spain' },
	{ code: 'IT', name: 'Italy' },
	{ code: 'NL', name: 'Netherlands' },
	{ code: 'BE', name: 'Belgium' },
	{ code: 'AT', name: 'Austria' },
	{ code: 'CH', name: 'Switzerland' },
	{ code: 'SE', name: 'Sweden' },
	{ code: 'NO', name: 'Norway' },
	{ code: 'DK', name: 'Denmark' },
	{ code: 'FI', name: 'Finland' },
	{ code: 'PT', name: 'Portugal' },
	{ code: 'PL', name: 'Poland' },
	{ code: 'JP', name: 'Japan' },
	{ code: 'KR', name: 'South Korea' },
	{ code: 'IN', name: 'India' },
	{ code: 'BR', name: 'Brazil' },
	{ code: 'MX', name: 'Mexico' },
	{ code: 'AR', name: 'Argentina' },
	{ code: 'ZA', name: 'South Africa' }
];

/* ── presentation helpers ──────────────────────────────────────── */

/** Build a poster URL. Sizes: w185 / w342 / w500. */
export function posterUrl(
	path: string | null | undefined,
	size: 'w185' | 'w342' | 'w500' = 'w342'
): string | null {
	if (!path) return null;
	return `${IMG_BASE}/${size}${path}`;
}

/** Display title — tv uses `name`, movie uses `title`. */
export function titleOf(item: TmdbItem): string {
	return item.title || item.name || 'Untitled';
}

/** Year from release_date / first_air_date, or null. */
export function yearOf(item: TmdbItem): string | null {
	const d = item.release_date || item.first_air_date;
	return d ? d.slice(0, 4) || null : null;
}
