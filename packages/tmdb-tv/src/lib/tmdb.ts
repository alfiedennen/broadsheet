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

export interface TmdbClient {
	/** "Trending this week" — mixed movies + TV, region-wide. */
	trendingThisWeek(): Promise<TmdbItem[]>;
	/** Recent releases (last `windowDays`), region-wide, movies + TV merged. */
	newReleases(windowDays?: number): Promise<TmdbItem[]>;
}

/**
 * Build a TMDB client bound to a user token + region. The token is a
 * TMDB v4 read access token (the free one); region is an ISO-3166-1
 * code like `GB` / `US`.
 */
export function createTmdbClient(token: string, region: string): TmdbClient {
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
		async trendingThisWeek(): Promise<TmdbItem[]> {
			const r = await tmdb<{ results: TmdbItem[] }>('/trending/all/week', { region });
			return r.results
				.filter((x) => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv'))
				.slice(0, 18);
		},

		async newReleases(windowDays = 45): Promise<TmdbItem[]> {
			const since = new Date(Date.now() - windowDays * 86400 * 1000).toISOString().slice(0, 10);
			const today = new Date().toISOString().slice(0, 10);
			const common = {
				watch_region: region,
				region,
				'vote_count.gte': 5, // weed out no-signal noise
				page: 1
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
