/**
 * Voice substrate — browser STT via Web Speech API.
 *
 * Push-to-talk in the active broadsheet tab. Uses the browser's
 * SpeechRecognition API (Chrome / Edge supported well; Safari partial;
 * Firefox basically nonexistent).
 *
 * Server-side STT (HA's Whisper, etc) is NOT in this module — those
 * pipelines run on HA's Wyoming satellites or other STT engines + are
 * driven by HA itself when the user talks to an Atom Echo. This module
 * is the BROWSER push-to-talk path; the in-tab mic.
 *
 * Detects support + degrades gracefully: if no SpeechRecognition,
 * `isSupported()` returns false and the UI offers a "type a message"
 * textarea fallback.
 *
 * Spec: docs/plans/plan-voice-substrate.md.
 */

// SpeechRecognition + webkitSpeechRecognition aren't in lib.dom standardly.
// Declare the slice we actually use.
interface SpeechRecognitionEventLike {
	results: ArrayLike<{
		isFinal: boolean;
		[idx: number]: { transcript: string; confidence: number };
	}>;
	resultIndex: number;
}
interface SpeechRecognitionInstance {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	maxAlternatives: number;
	onresult: ((e: SpeechRecognitionEventLike) => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getCtor(): SpeechRecognitionCtor | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		SpeechRecognition?: SpeechRecognitionCtor;
		webkitSpeechRecognition?: SpeechRecognitionCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSupported(): boolean {
	return getCtor() !== null;
}

export interface SttHandle {
	stop(): void;
	abort(): void;
}

export interface SttCallbacks {
	onInterim?: (text: string) => void;
	onFinal: (text: string) => void;
	onError?: (err: string) => void;
	onEnd?: () => void;
}

/**
 * Start a single STT capture. Returns a handle the caller can stop
 * (graceful — flushes the final transcript) or abort (no callbacks).
 *
 * Default behaviour: single-utterance (continuous=false). Interim
 * results stream via onInterim so the UI can show what the browser
 * THINKS it heard before commit; onFinal fires once at end.
 */
export function startCapture(
	language: string,
	callbacks: SttCallbacks
): SttHandle | null {
	const Ctor = getCtor();
	if (!Ctor) {
		callbacks.onError?.('SpeechRecognition not supported in this browser');
		return null;
	}
	const r = new Ctor();
	r.lang = language || 'en-GB';
	r.interimResults = true;
	r.continuous = false;
	r.maxAlternatives = 1;
	let final = '';

	r.onresult = (e) => {
		for (let i = e.resultIndex; i < e.results.length; i++) {
			const res = e.results[i];
			const transcript = res[0]?.transcript ?? '';
			if (res.isFinal) {
				final += transcript;
			} else {
				callbacks.onInterim?.(transcript);
			}
		}
	};
	r.onerror = (e) => callbacks.onError?.(e.error);
	r.onend = () => {
		if (final.trim()) callbacks.onFinal(final.trim());
		callbacks.onEnd?.();
	};

	try {
		r.start();
	} catch (err) {
		callbacks.onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}

	return {
		stop: () => r.stop(),
		abort: () => r.abort()
	};
}
