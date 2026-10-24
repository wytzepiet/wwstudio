import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import { fileRoutes } from 'filesystem-routing/vite';
import { prerender } from 'prerender-crawler/vite';
import { imagetools } from 'vite-imagetools';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	// Start mode: no index.html and no entry files. The plugin builds the app around src/App.tsx
	// (inside src/Document.tsx), renders it on the server, and hydrates it in the browser. At build
	// time every page is rendered once to static HTML in dist/client, which is the whole site.
	plugins: [
		// `extensions` lets the plugin also compile the `?pick=` route modules fileRoutes emits.
		solid({ start: true, ssr: true, diagnostics: true, extensions: ['.jsx', '.tsx'] }),
		fileRoutes({ types: true }),
		imagetools(),
		tailwindcss(),
		// Nothing links to /dusk and /sandbox (they are for working on the scene and the flock), so
		// they are named here.
		prerender({ mode: 'static', pages: ['/', '/dusk', '/sandbox'] })
	],
	server: { port: 4321 },
	build: { target: 'esnext', assetsInlineLimit: 0 }
});
