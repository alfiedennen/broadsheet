/**
 * Voice substrate — TTS via HA's tts/speak.
 *
 * Two output modes:
 *   1. `target = 'browser'` — call HA's tts/speak with a HOLD target
 *      (`media_player.broadsheet_browser` synthetic), get back an
 *      audio URL, play it in the current tab via <audio>. This is the
 *      default; the user is at broadsheet, voice should answer where
 *      the user is.
 *   2. `target = 'media_player.<entity>'` — call HA's tts/speak with
 *      that entity as the target. HA streams the audio to that
 *      speaker (Nest Hub, Sonos, Echo, etc).
 *
 * v0.1 ships mode 1 via tts/cloud/say (the cloud endpoint that
 * returns a stream URL we can fetch + play). The synthetic
 * "browser" media_player target is more elegant — we'd register a
 * Wyoming-like satellite — but that needs HA add-on changes; defer.
 *
 * Spec: docs/plans/plan-voice-substrate.md.
 */

interface HassConnectionLike {
	sendMessagePromise<T>(message: Record<string, unknown>): Promise<T>;
}

export interface TtsRequest {
	text: string;
	engine: string; // tts engine id
	language?: string;
	voice?: string | null;
	/** 'browser' = play in tab; otherwise an entity_id */
	target: string;
}

export interface TtsResult {
	played: boolean;
	target: string;
	url?: string;
	error?: string;
}

/**
 * Speak via the active HA TTS engine + route to either the browser
 * tab or a physical speaker.
 */
export async function speak(
	conn: HassConnectionLike,
	req: TtsRequest
): Promise<TtsResult> {
	if (!req.text.trim()) {
		return { played: false, target: req.target };
	}

	if (req.target === 'browser') {
		return await speakInBrowser(conn, req);
	}
	return await speakOnTarget(conn, req);
}

interface CloudSayResponse {
	url: string;
	path: string;
}

/**
 * Get an audio URL from HA's TTS engine and play it in the tab.
 * Uses `tts/cloud/say` if engine is cloud, otherwise generic
 * `tts/get_audio` endpoint. Both return a {url, path}.
 */
async function speakInBrowser(
	conn: HassConnectionLike,
	req: TtsRequest
): Promise<TtsResult> {
	try {
		// `tts/get_url` is the documented generic endpoint (2024.x+); it
		// works against any registered TTS engine, returns a path you
		// can fetch from HA's HTTP server. Failing that, fall back to
		// the older tts/cloud/say.
		let resp: CloudSayResponse;
		try {
			resp = await conn.sendMessagePromise<CloudSayResponse>({
				type: 'tts/get_url',
				engine_id: req.engine,
				message: req.text,
				language: req.language,
				options: req.voice ? { voice: req.voice } : undefined
			});
		} catch {
			resp = await conn.sendMessagePromise<CloudSayResponse>({
				type: 'tts/cloud/say',
				message: req.text,
				language: req.language
			});
		}

		if (typeof window === 'undefined' || !resp?.url) {
			return { played: false, target: req.target, url: resp?.url };
		}

		// Play. Don't await — let the audio stream while the caller
		// returns control. Errors surface via the audio element's onerror.
		const audio = new Audio(resp.url);
		audio.play().catch((err) => {
			// eslint-disable-next-line no-console
			console.warn('[@broadsheet/voice] audio.play() failed', err);
		});
		return { played: true, target: req.target, url: resp.url };
	} catch (err) {
		return {
			played: false,
			target: req.target,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

async function speakOnTarget(
	conn: HassConnectionLike,
	req: TtsRequest
): Promise<TtsResult> {
	try {
		// Service call route: tts.speak fires-and-forgets to the target
		// media_player. No URL returned; success = no error thrown.
		await conn.sendMessagePromise({
			type: 'call_service',
			domain: 'tts',
			service: 'speak',
			service_data: {
				media_player_entity_id: req.target,
				message: req.text,
				language: req.language,
				options: req.voice ? { voice: req.voice } : undefined,
				cache: false
			},
			target: { entity_id: req.target }
		});
		return { played: true, target: req.target };
	} catch (err) {
		return {
			played: false,
			target: req.target,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
