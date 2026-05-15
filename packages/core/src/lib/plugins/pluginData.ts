/**
 * Plugin-data client — list, upload, and delete a plugin's persistent
 * user-uploaded files. Counterpart to bundled `/plugin-assets/`.
 *
 * Backed by the add-on sidecar at `/api/broadsheet/plugin-data/<id>`.
 * Use these from a plugin's `settingsPanel` to manage uploads; the
 * URLs that come back resolve via `pluginDataUrl()` from `./assets`.
 *
 * Files persist across add-on updates (they live on the add-on's
 * persistent /data/ volume). The sidecar enforces filename pattern
 * `[A-Za-z0-9._-]{1,128}\.(png|jpg|jpeg|svg|webp|gif|json)` and a
 * 5 MB per-file cap. Anything outside that returns 4xx with a
 * structured error message — surface it to the user.
 *
 * Dev mode (no sidecar): these calls fail with `not-connected`-shaped
 * errors. v0.1 doesn't ship a dev fallback for plugin data; it's an
 * add-on-mode feature.
 */
import { base } from '$app/paths';

export interface PluginDataFile {
	filename: string;
	size: number;
	/** epoch seconds */
	mtime: number;
}

export interface PluginDataUploadResult {
	filename: string;
	size: number;
}

const apiUrl = (pluginId: string, filename?: string): string =>
	`${base}/api/broadsheet/plugin-data/${pluginId}` +
	(filename ? `/${encodeURIComponent(filename)}` : '');

async function readError(r: Response, fallback: string): Promise<string> {
	try {
		const body = (await r.json()) as { error?: string };
		if (body && typeof body.error === 'string') return body.error;
	} catch {
		/* not JSON — keep fallback */
	}
	return `${fallback}: HTTP ${r.status}`;
}

/** List uploaded files for a plugin. Empty array if nothing uploaded yet. */
export async function listPluginData(pluginId: string): Promise<PluginDataFile[]> {
	const r = await fetch(apiUrl(pluginId), { cache: 'no-store' });
	if (!r.ok) throw new Error(await readError(r, 'list failed'));
	const body = (await r.json()) as { files: PluginDataFile[] };
	return body.files ?? [];
}

/**
 * Upload a `File` (from an `<input type="file">` or a drop event) to
 * the plugin's data dir. The file's own `name` is used as the filename
 * — must satisfy the sidecar's pattern (alphanumeric + `._-`, image
 * extension). Resolves with the stored filename + size on success.
 */
export async function uploadPluginData(
	pluginId: string,
	file: File
): Promise<PluginDataUploadResult> {
	const fd = new FormData();
	fd.append('file', file, file.name);
	const r = await fetch(apiUrl(pluginId), { method: 'POST', body: fd });
	if (!r.ok) throw new Error(await readError(r, 'upload failed'));
	return (await r.json()) as PluginDataUploadResult;
}

/** Delete a single file. Throws if not found. */
export async function deletePluginData(pluginId: string, filename: string): Promise<void> {
	const r = await fetch(apiUrl(pluginId, filename), { method: 'DELETE' });
	if (!r.ok) throw new Error(await readError(r, 'delete failed'));
}
