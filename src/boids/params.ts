/** The flight: scrolling FLY screens takes the camera through the flock to PAST beyond its middle
 *  (world units); each screen after that flies on STEP. */
export const FLY = 2.2;
export const PAST = 1400;
export const STEP = 900;


/** The old site's palettes, near → far, names and all. */
export const palettes: Record<string, [string, string]> = {
	'gold to blue greeny': ['#315492', '#290529'],
	'green purple': ['#49a25f', '#34094b'],
	'trippy iowaska': ['#c02425', '#f0cb35'],
	'another trippy one': ['#ff6a00', '#ee0979'],
	'white to pink to purple': ['#fdeff9', '#03001e'],
	'gold red': ['#b47a2d', '#5b0b0b'],
	'sea glass': ['#a4c3c5', '#022c19']
};

export const defaults = {
	/** World units: the flock lives in a box this big (width, height, depth), centred on its origin. */
	box: [1600, 1000, 1000] as [number, number, number],
	tempo: 0.59,
	/** How far the camera is from the flock's centre; the old site's was 1000. */
	distance: 1060,
	count: 63488,
	radius: 30,
	maxPerCell: 12,
	maxSpeed: 200,
	maxAccel: 990,
	/** The old site's force weights multiply these: 1 is it exactly. */
	sep: 1,
	ali: 1,
	coh: 1,
	seek: 0.5,
	/** Seconds for the goal to glide most of the way to where it hops; 0 jumps, as the old site did. */
	goalGlide: 0.3,
	wander: 0.8,
	wanderScale: 940,
	wanderSpeed: 0.4,
	bounds: 0.5,
	/** The loader: the ring the boids are held in before they burst into the flock. */
	ringRadius: 220,
	ringSpin: 0.6,
	burst: 6500,
	mouse: 2.1,
	mouseRadius: 0.3,
	size: 0.5,
	falloff: 1,
	streak: 6.4,
	glowFrom: 8,
	glowRange: 8,
	minGlow: 0,
	intensity: 1,
	depthSharpness: 12.4,
	nearColor: '#8d93bf',
	farColor: '#00030f',
	fade: 0.57,
	cut: 0.01,
	gain: 24,
	bloom: 10,
	bloomRadius: 1,
	saturation: 4,
	resolution: 2,
	/** The page's background, which the flock fogs into far off: a blue so deep and dark it is
	 *  nearly black, hsl(232 100% 3%). (The old site's was hsl(242 95% 4%), #010014.) */
	background: '#00020f',
	horizon: 0.5,
	/** In a scene (the dusk): how strongly the flock is mirrored in the water, and how much it is
	 *  dark ink against the sky rather than light, and of what colour: a little darker than the
	 *  dusk's navy ground. */
	mirror: 0.5,
	ink: 0,
	inkColor: '#010510'
};

export type Params = typeof defaults;
export type NumberKey = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

export interface Slider {
	key: NumberKey;
	min: number;
	max: number;
	step: number;
	/** Changing it needs new buffers, so the flock restarts. */
	rebuild?: boolean;
	/** What it does, for the tooltip. */
	hint: string;
}

export const sliders: { group: string; items: Slider[] }[] = [
	{
		group: 'flock',
		items: [
			{ key: 'tempo', min: 0.05, max: 2, step: 0.01, hint: 'Speed of time. Slows or speeds everything alike, so the flock keeps its shape.' },
			{ key: 'count', min: 1024, max: 524288, step: 1024, rebuild: true, hint: 'How many boids. The flock restarts when you let go.' },
			{ key: 'radius', min: 10, max: 80, step: 1, rebuild: true, hint: 'How far a boid sees its neighbours (world units). Also the grid cell size, so the flock restarts.' },
			{ key: 'maxPerCell', min: 4, max: 128, step: 1, hint: 'Performance: at most this many boids are read per crowded grid cell. Lower is faster, rougher.' },
			{ key: 'maxSpeed', min: 20, max: 400, step: 1, hint: 'Flying speed. Boids always fly exactly this fast (a mouse fling adds to it for a moment).' },
			{ key: 'maxAccel', min: 50, max: 5000, step: 10, hint: 'How hard a boid can turn. Low: wide lazy arcs. High: sharp turns. The old site’s was 6 × maxSpeed.' }
		]
	},
	{
		group: 'forces',
		items: [
			{ key: 'sep', min: 0, max: 5, step: 0.05, hint: 'Separation: every neighbour in sight pushes back with 1 / distance, all summed, so crowds burst apart. × the old weight.' },
			{ key: 'ali', min: 0, max: 10, step: 0.05, hint: 'Alignment: turn toward the neighbours’ heading, the nearest counting most. × the old weight.' },
			{ key: 'coh', min: 0, max: 5, step: 0.05, hint: 'Cohesion: steer toward the neighbours, weaker for small groups. × the old weight.' },
			{ key: 'goalGlide', min: 0, max: 2, step: 0.05, hint: 'How long the goal takes to glide to each new spot (seconds). 0: it jumps, as on the old site, which tears the flock as it turns.' },
			{ key: 'seek', min: 0, max: 2, step: 0.01, hint: 'Pull toward the goal, which hops round a circle every few seconds. 1: the old site’s.' },
			{ key: 'wander', min: 0, max: 3, step: 0.01, hint: 'Strength of the invisible swirling currents that tear the flock into strands.' },
			{ key: 'wanderScale', min: 100, max: 3000, step: 10, hint: 'Size of the currents. Small: choppy little swirls. Large: broad sweeps.' },
			{ key: 'wanderSpeed', min: 0, max: 2, step: 0.01, hint: 'How fast the currents themselves change.' },
			{ key: 'ringRadius', min: 50, max: 600, step: 5, hint: 'The loader: the radius of the ring the boids are held in before they burst out (world units).' },
			{ key: 'ringSpin', min: 0, max: 3, step: 0.05, hint: 'How fast the loader ring spins (radians a second).' },
			{ key: 'burst', min: 0, max: 3000, step: 10, hint: 'How hard the ring bursts outward on release (world units a second). It dies away fast, so this mostly sets how far the blast reaches.' },
			{ key: 'bounds', min: 0, max: 5, step: 0.05, hint: 'How hard the box’s invisible walls push boids back in.' },
			{ key: 'mouse', min: 0, max: 5, step: 0.05, hint: 'How hard the cursor pushes boids along and away from its path.' },
			{ key: 'mouseRadius', min: 0.02, max: 0.6, step: 0.01, hint: 'How wide the cursor reaches, as a fraction of half the screen’s height.' }
		]
	},
	{
		group: 'look',
		items: [
			{ key: 'distance', min: 300, max: 3000, step: 10, hint: 'Camera distance from the flock. Lower is closer and more immersive. The old site used 1000.' },
			{ key: 'size', min: 0.5, max: 10, step: 0.1, hint: 'Point size: pixels across at depth 1000, as on the old site.' },
			{ key: 'falloff', min: 0.5, max: 6, step: 0.1, hint: 'Shape of each point. 1: the old linear gradient. Higher: a smaller, sharper bright core.' },
			{ key: 'streak', min: 0, max: 10, step: 0.1, hint: 'Stretch points along their motion. 0: round points.' },
			{ key: 'glowFrom', min: 0, max: 30, step: 0.5, hint: 'Boids with fewer neighbours than this are invisible.' },
			{ key: 'glowRange', min: 1, max: 60, step: 0.5, hint: 'How many more neighbours it takes to go from invisible to full brightness.' },
			{ key: 'minGlow', min: 0, max: 1, step: 0.01, hint: 'Brightness floor, so even lone boids show a little.' },
			{ key: 'intensity', min: 0, max: 2, step: 0.01, hint: 'Each boid’s brightness as drawn, before the 8-bit ceiling.' },
			{ key: 'depthSharpness', min: 0.5, max: 20, step: 0.1, hint: 'How abruptly the colour turns from near to far with depth.' },
			{ key: 'fade', min: 0, max: 0.98, step: 0.01, hint: 'How much of last frame is kept each frame: the length of the trails. The old site used 0.7.' },
			{ key: 'cut', min: 0, max: 0.05, step: 0.001, hint: 'Subtracted each frame, so trails end cleanly instead of leaving a haze.' },
			{ key: 'gain', min: 0, max: 50, step: 0.1, hint: 'The whole scene × this at the end (the old ×8). Makes single boids sparkle.' },
			{ key: 'bloom', min: 0, max: 20, step: 0.05, hint: 'Strength of the glow round bright areas.' },
			{ key: 'bloomRadius', min: 0, max: 1, step: 0.01, hint: 'Toward 1: less glow hugging each point, more wide haze, so points stay crisp.' },
			{ key: 'saturation', min: 0, max: 8, step: 0.05, hint: 'Colour boost on the glow (the old 2.5).' },
			{ key: 'horizon', min: 0, max: 1, step: 0.01, hint: 'Fog of the background colour over the lower half of the screen.' },
			{ key: 'resolution', min: 0.5, max: 2, step: 0.25, hint: 'Render scale. 1: CSS pixels, a little soft (the old canvas). 2: full retina sharpness.' }
		]
	}
];
