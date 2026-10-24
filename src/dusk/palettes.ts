/**
 * Palettes for the dusk's sky (see skyColor in shaders/common.wgsl): stops from the horizon up, each
 * a colour and how high it lies (k, about the sine of the height above the horizon), blended
 * straight from one to the next. At most 12. The far shore's trees reach k = 0.013 or so, so what
 * lies below that is mostly hidden behind them; the lake mirrors it all.
 */
export type Stop = [r: number, g: number, b: number, k: number];

const hex = (h: string, k: number): Stop => [...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), k] as Stop;

export const palettes: Record<string, Stop[]> = {
	/** Sampled from a photo of the horizon after sunset, from the air: a hairline of dark red, a
	 *  wide orange running into peach, a short dusty seam of pink and lilac where warm meets cold,
	 *  powder blue, a pure azure, and a long fall through deep blue to navy. (The photo's
	 *  heights scaled to the scene's, and lifted so the red clears the far shore's trees.) */
	photo: [
		hex('#7a1a12', 0), hex('#c13516', 0.0143), hex('#f76216', 0.0158), hex('#fd992a', 0.0203),
		hex('#fdb04f', 0.027), hex('#fdbe95', 0.036), hex('#e3c1c2', 0.045), hex('#b3bfd9', 0.054),
		hex('#6eb4ed', 0.072), hex('#0072d6', 0.117), hex('#002b5c', 0.177), hex('#00041d', 0.33)
	],
	/** Saturated, screen-like: a sliver of red, amber, a hard white line, electric blues to navy. */
	electric: [
		[0.75, 0.12, 0.04, 0], [0.92, 0.24, 0.05, 0.0145], [1.0, 0.44, 0.08, 0.019], [1.0, 0.56, 0.16, 0.03],
		[1.0, 0.68, 0.22, 0.037], [0.85, 0.9, 0.95, 0.042], [0.2, 0.62, 1.0, 0.055], [0.0, 0.36, 1.0, 0.1],
		[0.02, 0.12, 0.72, 0.16], [0.02, 0.03, 0.3, 0.25], [0.008, 0.008, 0.08, 0.42]
	],
	/** Synthwave: a hot horizon, pink into magenta, purple and indigo. */
	synthwave: [
		hex('#ff2a2a', 0), hex('#ff5a1f', 0.014), hex('#ffb000', 0.022), hex('#ff3d8b', 0.035),
		hex('#e01ad0', 0.06), hex('#8a17e8', 0.1), hex('#3d14b8', 0.16), hex('#160a5c', 0.25), hex('#05021a', 0.42)
	],
	/** Ultraviolet: a thin orange line under violet, all of it purple. */
	ultraviolet: [
		hex('#ff4d00', 0), hex('#ff7a1a', 0.016), hex('#ff2e88', 0.026), hex('#c624ff', 0.045),
		hex('#7b2bff', 0.08), hex('#4417d6', 0.13), hex('#1e0b80', 0.2), hex('#07032e', 0.32), hex('#020110', 0.45)
	],
	/** Acid: a lime horizon into cyan and a deep teal night. */
	acid: [
		hex('#d4ff00', 0), hex('#9dff1f', 0.016), hex('#29ffb0', 0.03), hex('#00e5ff', 0.05),
		hex('#0095ff', 0.09), hex('#0047b3', 0.15), hex('#002a5c', 0.23), hex('#00101f', 0.35), hex('#00050a', 0.45)
	],
	/** Ember: red on red, the horizon burning down into black. */
	ember: [
		hex('#ffd000', 0), hex('#ff8c00', 0.014), hex('#ff3300', 0.025), hex('#e0001a', 0.045),
		hex('#a3001f', 0.08), hex('#5c0015', 0.14), hex('#2b000c', 0.22), hex('#0d0004', 0.35)
	],
	/** Vaporwave: peach, pink and lilac into cyan. */
	vaporwave: [
		hex('#ff9e7a', 0), hex('#ffb3a7', 0.016), hex('#ff8fd8', 0.03), hex('#c8a2ff', 0.055),
		hex('#7fd4ff', 0.09), hex('#3a8dff', 0.14), hex('#2443c4', 0.21), hex('#0e1460', 0.32), hex('#03051c', 0.45)
	],
	/** Mono: the site's black and white, the glow a grey light. */
	mono: [
		hex('#ffffff', 0), hex('#d9d9d9', 0.02), hex('#9a9a9a', 0.045), hex('#5a5a5a', 0.09),
		hex('#2e2e2e', 0.16), hex('#141414', 0.26), hex('#050505', 0.42)
	]
};

export const PALETTE = palettes.photo;

/** A palette as the sky's three mat4 uniforms (skyStops0..2): 12 stops, the last repeated, higher
 *  each time, to fill. */
export function stopsUniforms(stops: Stop[]): [number[], number[], number[]] {
	const all = [...stops];
	while (all.length < 12) {
		const [r, g, b, k] = all.at(-1)!;
		all.push([r, g, b, k + 1]);
	}
	const flat = all.flat();
	return [flat.slice(0, 16), flat.slice(16, 32), flat.slice(32, 48)];
}
