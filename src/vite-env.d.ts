/// <reference types="vite/client" />
/// <reference types="../file-routes.d.ts" />

// Images run through vite-imagetools: a srcset of sizes, or one size's URL.
declare module '*as=srcset' {
	const srcset: string;
	export default srcset;
}
declare module '*format=webp' {
	const src: string;
	export default src;
}
