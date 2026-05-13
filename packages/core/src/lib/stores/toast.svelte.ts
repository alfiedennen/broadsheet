/**
 * Toast store — single ephemeral notification at a time.
 *
 * `toast.show(text, kind)` displays a toast for ~1.4s.
 * Subsequent calls replace the current toast immediately.
 */

interface ToastEntry {
	id: number;
	text: string;
	kind: 'success' | 'error';
}

class ToastStore {
	current = $state<ToastEntry | null>(null);
	private _seq = 0;
	private _timer: ReturnType<typeof setTimeout> | null = null;
}

export const toastStore = new ToastStore();

export function showToast(text: string, kind: 'success' | 'error' = 'success'): void {
	if (typeof window === 'undefined') return;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const s = toastStore as any;
	s._seq++;
	s.current = { id: s._seq, text, kind };
	if (s._timer) clearTimeout(s._timer);
	s._timer = setTimeout(() => {
		s.current = null;
	}, kind === 'error' ? 3000 : 1400);
}
