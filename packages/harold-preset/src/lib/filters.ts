/**
 * Harold preset — input filters + language detection.
 *
 * Ported from Harold Road's `harold-agent/agent/channels/http.py`:
 *   - _looks_like_real_request — Echo-satellite tolerance filter,
 *     short bursts pass if they contain house tokens or first-person
 *     pronouns
 *   - _looks_like_real_request_wall — tighter filter for the wall
 *     display (which sits in the office; ambient call/meeting/podcast
 *     audio false-fires the wake word)
 *   - _is_italian — heuristic count of Italian marker words, kicks
 *     in when 2+ markers OR 1 marker in a ≤4-word phrase
 *
 * The Echo + wall filters return null (silent) to short-circuit
 * misfires. The wall filter ALSO short-circuits silently (not
 * audible "Pardon?") because the wall is in earshot of meetings
 * — interrupting the call with anything is worse than missing one
 * real request.
 *
 * Spec: docs/plans/plan-harold-preset.md.
 */

/* ── Italian detection (port of Harold Road's _is_italian) ───────── */

/**
 * High-frequency Italian markers. Includes common verbs, articles,
 * pronouns, basic vocabulary. Each marker is ≥3 chars so common
 * 1-2-letter English words don't false-match.
 */
const ITALIAN_MARKERS: ReadonlySet<string> = new Set([
	// Articles + prepositions
	'gli', 'lui', 'lei', 'noi', 'voi', 'loro',
	'sono', 'sei', 'siamo', 'sono', 'essere',
	'che', 'come', 'quando', 'perché', 'dove', 'quale',
	// Common verbs
	'fare', 'dire', 'avere', 'andare', 'venire', 'volere', 'potere',
	'devo', 'devi', 'deve', 'ho', 'hai', 'ha', 'va', 'vai',
	// Time / numbers
	'ore', 'mattina', 'sera', 'notte', 'giorno', 'oggi', 'domani', 'ieri',
	'una', 'due', 'tre', 'quattro', 'cinque', 'dieci',
	// Domestic / house words
	'casa', 'camera', 'cucina', 'porta', 'luce', 'luci', 'caldo', 'freddo',
	'aperto', 'chiuso', 'spegni', 'accendi',
	// Pleasantries / common modifiers
	'ciao', 'grazie', 'prego', 'scusa', 'molto', 'poco', 'tanto', 'sempre',
	'mai', 'già', 'anche', 'ancora',
	// Question shapes
	'cosa', 'chi', 'quanto', 'quanta'
]);

const WORD_SPLIT = /[\s,.!?;:'"()]+/;

/**
 * Detect Italian. Returns true on 2+ marker matches OR 1 match
 * inside a ≤4-word utterance. Conservative against English false
 * positives.
 */
export function isItalian(text: string): boolean {
	if (!text || text.trim().length === 0) return false;
	const words = text
		.toLowerCase()
		.split(WORD_SPLIT)
		.filter((w) => w.length > 0);
	if (words.length === 0) return false;
	let hits = 0;
	for (const w of words) {
		if (ITALIAN_MARKERS.has(w)) hits++;
	}
	if (hits >= 2) return true;
	if (hits === 1 && words.length <= 4) return true;
	return false;
}

/* ── Echo-satellite filter (port of _looks_like_real_request) ───── */

/**
 * House nouns — substantive things Harold can act on. Broad enough
 * to catch most real device-control phrasings.
 */
const HOUSE_TOKENS: ReadonlySet<string> = new Set([
	'light', 'lights', 'lamp', 'lamps', 'switch', 'plug',
	'door', 'lock', 'unlock', 'locked',
	'tv', 'television', 'volume', 'mute', 'channel', 'remote',
	'temperature', 'temp', 'heating', 'heat', 'cool', 'warm', 'cold', 'thermostat',
	'radiator', 'boiler',
	'scene', 'scenes', 'mode',
	'room', 'rooms', 'bedroom', 'kitchen', 'bathroom', 'office', 'hallway',
	'living', 'library', 'garage',
	'timer', 'alarm', 'reminder',
	'weather', 'forecast', 'rain', 'sunny', 'cloudy',
	'energy', 'electricity', 'gas',
	'music', 'play', 'pause', 'song', 'volume',
	'lock', 'locked', 'camera', 'porch', 'front',
	// Common phatics that still indicate a real query
	'what', 'when', 'where', 'how', 'is', 'are', 'can', 'will', 'time',
	'thank', 'thanks', 'please', 'look', 'show', 'tell'
]);

const FIRST_PERSON: ReadonlySet<string> = new Set([
	'i', "i'm", 'im', "i've", "ive", "i'll", 'ill', "i'd", 'id',
	'me', 'my', 'mine', 'we', 'us', 'our'
]);

/**
 * Echo-satellite filter — short STT bursts pass if they contain
 * a house token OR are ≥4 words containing a first-person pronoun.
 * Anything else: assume STT misfire, short-circuit. Returns null
 * to drop the utterance.
 */
export function looksLikeRealRequestEcho(text: string): boolean {
	const t = text.trim().toLowerCase();
	if (!t) return false;
	const words = t.split(WORD_SPLIT).filter((w) => w.length > 0);
	if (words.length < 2) return false;
	for (const w of words) {
		if (HOUSE_TOKENS.has(w)) return true;
	}
	if (words.length >= 4) {
		for (const w of words) {
			if (FIRST_PERSON.has(w)) return true;
		}
	}
	return false;
}

/* ── Wall-display filter (port of _looks_like_real_request_wall) ─── */

/**
 * Imperative verbs that start real requests. Tighter than the Echo
 * HOUSE_TOKENS set — verbs only, no nouns. A real "turn on the
 * lights" starts with "turn"; ambient "I think that's a great way
 * to end my talk" starts with "I" (first-person, not imperative).
 */
const IMPERATIVE_VERBS: ReadonlySet<string> = new Set([
	'turn', 'switch', 'set', 'show', 'open', 'close', 'lock', 'unlock',
	'play', 'pause', 'stop', 'start', 'find', 'search', 'tell', 'send',
	'add', 'remove', 'delete', 'cancel', 'create', 'make', 'put',
	'dim', 'brighten', 'increase', 'decrease', 'boost', 'cool',
	'remind', 'wake', 'sleep'
]);

const QUESTION_MARKERS: ReadonlySet<string> = new Set([
	'what', 'when', 'where', 'why', 'how', 'who', 'which', 'whose',
	'is', 'are', 'was', 'were', 'do', 'does', 'did', 'has', 'have',
	'had', 'can', 'could', 'will', 'would', 'should', 'shall', 'may',
	'might', 'must'
]);

/**
 * Tight nouns — actual things Harold can control. No phatic verbs
 * like "look" / "thank" — those false-pass too much ambient audio.
 */
const TIGHT_HOUSE_NOUNS: ReadonlySet<string> = new Set([
	'light', 'lights', 'lamp', 'lamps', 'switch', 'plug',
	'door', 'lock', 'tv', 'television', 'remote',
	'temperature', 'heating', 'heat', 'radiator', 'thermostat',
	'scene', 'bedroom', 'kitchen', 'bathroom', 'office', 'hallway',
	'living', 'library', 'garage', 'timer', 'alarm',
	'weather', 'forecast', 'energy', 'electricity',
	'music', 'porch', 'harold', 'graves'
]);

/**
 * Wall-display filter — passes only if:
 *   (a) explicit self-reference ("harold"/"graves"), OR
 *   (b) starts with an imperative verb, OR
 *   (c) starts with a question word, OR
 *   (d) contains a tight house noun
 *
 * Otherwise treat as ambient call/meeting/podcast audio.
 */
export function looksLikeRealRequestWall(text: string): boolean {
	const t = text.trim().toLowerCase();
	if (!t) return false;
	const words = t.split(WORD_SPLIT).filter((w) => w.length > 0);
	if (words.length === 0) return false;

	// (a) self-reference
	for (const w of words) {
		if (w === 'harold' || w === 'graves') return true;
	}
	// (b) imperative-verb start
	if (IMPERATIVE_VERBS.has(words[0])) return true;
	// (c) question-word start
	if (QUESTION_MARKERS.has(words[0])) return true;
	// (d) tight house noun anywhere
	for (const w of words) {
		if (TIGHT_HOUSE_NOUNS.has(w)) return true;
	}
	return false;
}
