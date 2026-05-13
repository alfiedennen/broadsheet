import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	server: {
		// Allow access from other devices on the LAN (wall tablet, phone)
		// during dev. Bound to all interfaces; firewall is the gate.
		host: '0.0.0.0',
		port: 5173,
		strictPort: true
	},

	preview: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true
	}
});
