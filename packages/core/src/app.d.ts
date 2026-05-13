// See https://svelte.dev/docs/kit/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		/**
		 * Set by appending `?allow-writes=true` to the URL in dev mode.
		 * When false, callService() blocks all writes and logs to the audit log.
		 * NOT persisted across reloads — has to be re-typed each session.
		 */
		__BROADSHEET_ALLOW_WRITES__?: boolean;
	}
}

export {};
