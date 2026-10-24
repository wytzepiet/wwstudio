// Shared by every material of the dusk scene: the sky (also what the water mirrors), the far
// shore's outline (also what the water mirrors), and the finish.
//
// The sky is late twilight, a gradient and nothing else, in a palette's colours (palettes.ts).
// A little warmer toward where the sun went down. The first stars are out (sky.wgsl).
//
// World: y up, the camera at the origin on the near shore, looking down -z across the lake.
// Colours are as they appear on screen; light past white is eased into it by `finish`.

/** The far shore runs along z = SHORE_Z. */
const SHORE_Z = -700.0;

fn hash1(x: f32) -> f32 {
	return fract(sin(x * 127.1) * 43758.5453);
}

fn noise1(x: f32) -> f32 {
	let i = floor(x);
	let f = fract(x);
	let u = f * f * (3.0 - 2.0 * f);
	return mix(hash1(i), hash1(i + 1.0), u);
}

/** The email comes up a letter at a time (label.wgsl): which letter is at u along its board, by the
 *  letters' left edges (letterEdges, padded with 2), or -1 left of the first. */
fn letterOf(u: f32) -> i32 {
	var found = -1;
	for (var i = 0; i < 16; i++) {
		if (u >= shaderUniforms.letterEdges[i / 4][i % 4]) { found = i; }
	}
	return found;
}

/** How high letter i's foot stands. */
fn letterRise(i: i32) -> f32 {
	return shaderUniforms.letterRises[i / 4][i % 4];
}

/** Where on the email's text a point (x, y) of its board lies, if anywhere: each letter cut at its
 *  own rise and turned (letterTilts) about the middle of its baseline, which lies rings.x above its
 *  foot. (u, v, 1), or 0 where no letter is. */
fn letterAt(x: f32, y: f32) -> vec3f {
	let i = letterOf(boardU(x));
	for (var j = max(i - 1, 0); j <= i + 1 && j < i32(shaderUniforms.label.w); j++) {
		let a = shaderUniforms.letterTilts[j / 4][j % 4];
		let pivot = vec2f(shaderUniforms.letterCenters[j / 4][j % 4], letterRise(j) + shaderUniforms.rings.x);
		let d = vec2f(x, y) - pivot;
		let p = pivot + vec2f(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
		let u = boardU(p.x);
		let v = (p.y - letterRise(j)) / shaderUniforms.label.z;
		if (letterOf(u) == j && u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0) { return vec3f(u, v, 1.0); }
	}
	return vec3f(0.0);
}

/** The board's u at world x: the world's x runs right to left on screen, so u runs against it. */
fn boardU(x: f32) -> f32 {
	let hw = shaderUniforms.label.y;
	return 1.0 - (x + hw) / (2.0 * hw);
}

fn hash2(p: vec2f) -> vec2f {
	let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
	return fract(sin(q) * 43758.5453);
}

/** Stop i of the sky's palette: a colour, and how high it lies. */
fn skyStop(i: i32) -> vec4f {
	if (i < 4) { return shaderUniforms.skyStops0[i]; }
	if (i < 8) { return shaderUniforms.skyStops1[i - 4]; }
	return shaderUniforms.skyStops2[i - 8];
}

fn ramp(x: f32, a: f32, b: f32) -> f32 {
	return clamp((x - a) / (b - a), 0.0, 1.0);
}

/** The sky along direction d (normalized): a ramp by height above the horizon, a little uneven,
 *  with a few streaks of cloud in the glow. Below the horizon it is the horizon. */
fn skyColor(d: vec3f) -> vec3f {
	let sun = normalize(shaderUniforms.sunDir);
	let h = max(d.y, 0.0);
	let toward = pow(dot(normalize(d.xz + vec2f(1e-5)), normalize(sun.xz)) * 0.5 + 0.5, 3.0);
	// Toward the sun the warm part reaches a little higher, and along the horizon it rises and dips
	// a little, unevenly, as a real glow does.
	let az = atan2(d.x, -d.z);
	let k = h / (mix(0.95, 1.05, toward) * (0.97 + 0.06 * noise1(az * 1.5 + 1.7)));
	// Straight blends between stops: eased ones would rest at each stop and show as bands.
	// The far shore's trees reach k = 0.013 or so: what lies below that is mostly hidden.
	// The colours come from the palette (skyStops, see src/dusk/palettes.ts): from the horizon up.
	var c = skyStop(0).rgb;
	for (var i = 1; i < 12; i++) {
		let a = skyStop(i - 1);
		let b = skyStop(i);
		c = mix(c, b.rgb, ramp(k, a.w, b.w));
	}
	// A few long, thin streaks of cloud low over the glow, darker against it: layers, gently wavy,
	// each broken along its length.
	let band = k * 220.0 + 1.2 * noise1(az * 3.0);
	let thin = smoothstep(0.35, 0.5, 0.5 - abs(fract(band) - 0.5)) * step(0.55, hash1(floor(band)));
	let broken = smoothstep(0.55, 0.85, noise1(az * 18.0 + floor(band) * 13.0)) * noise1(az * 5.0 + floor(band) * 3.0);
	let low = smoothstep(0.014, 0.028, k) * (1.0 - smoothstep(0.06, 0.1, k));
	c = mix(c, c * vec3f(0.65, 0.55, 0.68), thin * broken * low * 0.35);
	// Where the sun went down, the horizon a touch brighter.
	let s = max(dot(d, sun), 0.0);
	c += vec3f(1.0, 0.55, 0.2) * pow(s, 12.0) * 0.05;
	return c;
}

/** The village on the far shore lies round its church, at x = VILLAGE; its houses stand on lots LOT
 *  metres wide. How much village there is at x: 1 in its heart, 0 out of it. */
const VILLAGE = -260.0;
const LOT = 11.0;
fn village(x: f32) -> f32 {
	return smoothstep(170.0, 100.0, abs(x - VILLAGE));
}

/** The house at x in the village, if any: how high its walls and its roof reach there (0: none).
 *  Shoulder to shoulder under steep roofs, some gable on (a peak), some side on (a ridge with
 *  sloping ends); fewer of them toward the village's edge, where trees take over. */
fn house(x: f32) -> vec2f {
	// Lots of uneven widths, and not every one built on.
	let at = x / LOT + 0.6 * noise1(x * 0.07);
	let lot = floor(at);
	let f = fract(at);
	if (hash1(lot) > village(x) * 0.85) { return vec2f(0.0); }
	let wall = 3.5 + 2.0 * hash1(lot + 3.1);
	let roof = 4.0 + 2.5 * hash1(lot + 7.7);
	let across = 1.0 - abs(f - 0.5) * 2.0;
	let slope = select(across, min(across / 0.35, 1.0), hash1(lot + 1.3) > 0.5);
	return vec2f(wall, wall + roof * slope);
}

/** The light of a window at (x, y) on the far shore: a few in the houses' walls are lit (1), the
 *  rest dark (0). */
const WINDOW = vec3f(1.0, 0.62, 0.28);
fn windowLight(x: f32, y: f32) -> f32 {
	let wall = house(x).x;
	if (wall <= 0.0 || y < 2.3 || y > wall - 0.3) { return 0.0; }
	let cell = vec2f(x / 2.4, y / 2.2);
	let f = fract(cell);
	let lit = hash2(floor(cell) + 3.0).x > 0.65;
	return select(0.0, 1.0, lit && f.x > 0.2 && f.x < 0.8 && f.y > 0.2 && f.y < 0.8);
}

/** How high the far shore stands at x, in metres: tree rows with gaps, a farm, a village round its
 *  church tower. */
fn shoreHeight(x: f32) -> f32 {
	// The land itself: low and flat, a dike's width above the water.
	var h = 2.0 + noise1(x * 0.05) * 0.5;
	// Rows of trees along it, mostly unbroken, lower in places; crowns bumpy.
	let rows = 0.35 + 0.65 * smoothstep(0.25, 0.55, noise1(x * 0.006 + 3.0));
	let crowns = 0.7 + 0.3 * noise1(x * 0.07) + 0.15 * noise1(x * 0.35);
	// Fewer, lower trees in the village, among its houses.
	h = max(h, rows * 11.0 * crowns * (1.0 - 0.3 * village(x)));
	// The village's own trees, in gardens and along its streets, rising over the roofs here and there.
	h = max(h, village(x) * (4.0 + 8.0 * noise1(x * 0.11 + 4.0) * noise1(x * 0.031)) * crowns);
	h = max(h, house(x).y);
	// A farm: a long barn under a steep roof, and a house beside it.
	let barn = 420.0;
	if (abs(x - barn) < 22.0) { h = max(h, 5.0 + 6.0 * (1.0 - abs(x - barn) / 22.0)); }
	if (abs(x - barn - 34.0) < 7.0) { h = max(h, 4.0 + 3.0 * (1.0 - abs(x - barn - 34.0) / 7.0)); }
	// The village church: a square tower with a short spire.
	let church = VILLAGE;
	let a = abs(x - church);
	if (a < 4.0) { h = max(h, 26.0 + 10.0 * (1.0 - a / 4.0)); }
	if (a < 14.0) { h = max(h, 9.0 + 5.0 * (1.0 - a / 14.0)); }
	return h;
}

/** The far shore's colour seen along d: a dark navy outline, softened by the haze. */
fn shoreColor(d: vec3f) -> vec3f {
	let behind = skyColor(normalize(vec3f(d.x, 0.015, d.z)));
	// 700 m of evening air in front of it.
	return mix(vec3f(0.004, 0.028, 0.09), behind, 0.12);
}

/** The land past the far shore: meadows, dim in the dusk (water.wgsl draws them, ditches and all). */
const LAND = vec3f(0.004, 0.035, 0.114);

/** The haze over the land: seen along d from dist away, colour c goes toward the horizon's glow. */
fn hazed(c: vec3f, d: vec3f, dist: f32) -> vec3f {
	let haze = 1.0 - exp(-max(dist + SHORE_Z, 0.0) / 2500.0);
	return mix(c, skyColor(normalize(vec3f(d.x, 0.004, d.z))), haze * 0.18);
}

/** The land as far off as it gets, along d: where the water's plane ends, the sky below the horizon. */
fn landColor(d: vec3f) -> vec3f {
	return hazed(LAND, d, 1e6);
}

/** Exposure, then light past white eased into it: colours below 0.8 come out as they are. */
fn finish(c: vec3f) -> vec3f {
	let e = c * shaderUniforms.exposure;
	return select(e, 0.8 + 0.2 * (1.0 - exp(-(e - 0.8) / 0.2)), e > vec3f(0.8));
}
