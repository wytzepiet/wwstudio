// The sky: a sphere round the camera, drawn at the far plane, coloured by skyColor, with the night
// behind it: stars and the Milky Way.

struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) dir: vec3f,
}

@vertex
fn mainVertex(input: VertexInput) -> VertexOutput {
	var out: VertexOutput;
	let world = shaderSystem.cameraPosition + input.position * 3000.0;
	let clip = shaderSystem.viewProjection * vec4f(world, 1.0);
	out.position = vec4f(clip.xy, clip.w * 0.99999, clip.w);
	out.dir = input.position;
	return out;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4f {
	let d = normalize(input.dir);
	// Below the horizon, where the water's plane has ended: the land, as far off as it gets.
	if (d.y < 0.0) { return vec4f(finish(landColor(d)), 1.0); }
	let sky = skyColor(d);
	// The night behind the sky: the stars, a great many of them, and the Milky Way. They show by
	// their own brightness (`stars`), not the exposure, so they are out while all else is black;
	// but they show only through a sky darker than they are bright: as the dusk comes up, the Milky
	// Way and the faint stars are lost in it first, and the brightest stand longest. Low down the
	// haze hides them all.
	let glare = dot(sky, vec3f(0.3, 0.6, 0.1)) * shaderUniforms.exposure;
	// The pointer moves the night a little, nearer layers more (`drift`): the bright stars most,
	// the faint ones less, the Milky Way least, so it has depth.
	let drift = vec3f(shaderUniforms.drift, 0.0);
	let band = milkyWay(normalize(d + drift * 0.3));
	// In the site's blue: the night itself a deep navy, the stars a cool blue-white with a little
	// shine round the bright ones, and the Milky Way violet, warmer at its heart.
	var night = vec3f(0.008, 0.012, 0.09) * exp(-glare * 30.0);
	night += starLayer(normalize(d + drift), 0.014, 0.05, 0.0009, 0.0, 0.08) * exp(-glare * 6.0);
	night += 0.6 * starLayer(normalize(d + drift * 0.6), 0.006, 0.14 + 0.6 * band, 0.0008, 41.0, 0.0) * exp(-glare * 60.0);
	let heart = smoothstep(0.55, 0.85, band);
	night += mix(vec3f(0.36, 0.4, 0.85), vec3f(0.85, 0.62, 0.72), heart) * band * 0.17 * exp(-glare * 100.0);
	let el = asin(clamp(d.y, -1.0, 1.0));
	return vec4f(finish(sky) + night * smoothstep(0.04, 0.2, el) * shaderUniforms.stars, 1.0);
}

/** The stars' colour: the flock's periwinkle, lightened toward white. */
/** A star's colour, the flock's periwinkle lightened toward white, and of the faint shine round it. */
const STAR = vec3f(0.78, 0.82, 1.0);
const BLOOM = vec3f(0.78, 0.82, 1.0);

/** Stars on a grid of cells `cell` radians across over the sky: in `density` of the cells, a star
 *  at a point in it, `size` radians across, in a blue bloom (`bloom` as strong) that reaches into
 *  the cells about it; most faint, a few bright, each twinkling a little. `seed` makes each layer
 *  its own. */
fn starLayer(d: vec3f, cell: f32, density: f32, size: f32, seed: f32, bloom: f32) -> vec3f {
	let g = vec2f(atan2(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0))) / cell;
	var light = vec3f(0.0);
	for (var y = -1; y <= 1; y++) {
		for (var x = -1; x <= 1; x++) {
			let c = floor(g) + vec2f(f32(x), f32(y));
			let h = hash2(c + seed);
			if (h.x > density) { continue; }
			let at = c + 0.2 + 0.6 * hash2(c + seed + 17.0);
			let r = length(g - at) * cell / size;
			let bright = 0.2 + 1.2 * pow(fract(h.y * 13.0), 8.0);
			let twinkle = 0.85 + 0.15 * sin(shaderUniforms.time * 2.5 + h.y * 60.0);
			light += bright * twinkle * (STAR * exp(-r * r) + BLOOM * bloom * bright * exp(-r * 0.6));
		}
	}
	return light;
}

fn noise3(p: vec3f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let u = f * f * (3.0 - 2.0 * f);
	let n = dot(i, vec3f(1.0, 57.0, 113.0));
	return mix(
		mix(mix(hash1(n), hash1(n + 1.0), u.x), mix(hash1(n + 57.0), hash1(n + 58.0), u.x), u.y),
		mix(mix(hash1(n + 113.0), hash1(n + 114.0), u.x), mix(hash1(n + 170.0), hash1(n + 171.0), u.x), u.y),
		u.z
	);
}

fn fbm(p: vec3f) -> f32 {
	return 0.5 * noise3(p) + 0.25 * noise3(p * 2.03 + 5.1) + 0.125 * noise3(p * 4.01 + 9.7) + 0.125 * noise3(p * 8.05 + 3.3);
}

/** The Milky Way along d (0 to 1): a band round the sky, rising across the view from low on the
 *  left, uneven in width, clotted with star clouds, a lane of dust down its middle. */
fn milkyWay(d: vec3f) -> f32 {
	let pole = normalize(cross(normalize(vec3f(-0.8, 0.03, -0.6)), normalize(vec3f(0.6, 0.42, -0.68))));
	let off = dot(d, pole);
	let width = 0.16 + 0.08 * fbm(d * 2.0 + 7.0);
	let glow = exp(-off * off / (width * width)) * smoothstep(0.25, 0.75, fbm(d * 5.0));
	let dust = smoothstep(0.5, 0.75, fbm(d * 9.0 + 3.0)) * exp(-off * off / 0.003);
	return glow * (1.0 - 0.85 * dust);
}
