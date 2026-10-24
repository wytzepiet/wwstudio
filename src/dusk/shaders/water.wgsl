// The lake: glassy, nearly still, as in a long exposure; a slow, low swell is all that moves it.
// It mirrors the sky and the far shore by working out what a reflected ray would meet, so the
// reflection is exact and costs no extra pass. The flock it mirrors from a texture the flock draws
// its mirror image into (`reflection`: light, as the flock's own composite reads it), sampled where
// this pixel is on screen, shifted by the swell, and laid on as ink. The email standing in the lake
// (label.wgsl) it mirrors as it does the shore, and where it broke the surface, rings spread out.
// The swell calms with distance. Past the far shore, the land.

struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) world: vec3f,
}

@vertex
fn mainVertex(input: VertexInput) -> VertexOutput {
	var out: VertexOutput;
	let world = (shaderSystem.world * vec4f(input.position, 1.0)).xyz;
	out.position = shaderSystem.viewProjection * vec4f(world, 1.0);
	out.world = world;
	return out;
}

/** How much of the ground at p is open water of the lakes past the far shore (blur: how much ground
 *  a pixel covers): each an oval, x, z and its half-width and half-depth, with an uneven shore. */
fn lakes(p: vec2f, blur: f32) -> f32 {
	var all = array<vec4f, 2>(vec4f(450.0, -2300.0, 1100.0, 420.0), vec4f(-1100.0, -4300.0, 1700.0, 650.0));
	var open = 0.0;
	for (var i = 0; i < 2; i++) {
		let o = (p - all[i].xy) / all[i].zw;
		let shore = length(o) - 1.0 + 0.35 * (noise1(p.x * 0.004 + f32(i) * 9.0) + noise1(p.y * 0.007 + 5.0) - 1.0);
		open = max(open, 1.0 - smoothstep(-blur / all[i].w, blur / all[i].w, shore));
	}
	return open;
}

/** The surface's slope at p: a few wind-leaning swells and finer ripples. */
fn slope(p: vec2f, t: f32, calm: f32) -> vec2f {
	var g = vec2f(0.0);
	var dir = normalize(vec2f(0.3, 1.0));
	var freq = 0.35;
	var amp = 0.016;
	for (var i = 0; i < 7; i++) {
		let phase = dot(p, dir) * freq + t * sqrt(9.8 * freq) * 0.6;
		g += dir * cos(phase) * amp * freq;
		dir = vec2f(dir.x * 0.8 - dir.y * 0.6, dir.x * 0.6 + dir.y * 0.8);
		freq *= 1.55;
		amp *= 0.62;
	}
	return g * calm;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4f {
	let p = input.world;
	let eye = shaderSystem.cameraPosition;
	let v = normalize(p - eye);
	let dist = length(p.xz - eye.xz);
	// How much ground a pixel covers here (worked out before any branch, as derivatives must be).
	let blur = max(length(fwidth(p.xz)), 1e-3);
	// Past the far shore it is land, not water: dark fields, lost in the haze toward the horizon.
	// From the dike the shore hides it; from higher up it is seen.
	if (p.z < SHORE_Z) {
		// Frisian meadows: long strips, a little turned, each its own shade, and between them ditches
		// that catch the sky. Too fine to make out, a ditch is what share of the ground it covers; far
		// off, they are lost.
		let a = 0.35;
		let q = vec2f(cos(a) * p.x - sin(a) * p.z, sin(a) * p.x + cos(a) * p.z);
		let strip = vec2f(40.0, 320.0);
		let tone = 0.7 + 0.6 * hash2(floor(q / strip)).x;
		let edge = (0.5 - abs(fract(q / strip) - 0.5)) * strip;
		let half = vec2f(1.0, 0.7);
		let line = 1.0 - smoothstep(half - blur, half + blur, edge);
		let share = mix(line, 2.0 * half / strip, smoothstep(vec2f(2.0), vec2f(8.0), vec2f(blur)));
		let ditch = max(share.x, share.y) * exp(-max(dist + SHORE_Z, 0.0) / 3000.0);
		let mirror = skyColor(reflect(v, vec3f(0.0, 1.0, 0.0)));
		var meadow = mix(LAND * tone, mirror * 0.6, ditch);
		// Farmyards and copses: in some fields a clump of trees, nearly black, and by some of them a
		// farm's light.
		let yard = floor(p.xz / 260.0);
		let y = hash2(yard + 31.0);
		if (y.x > 0.45) {
			let at = (yard + 0.2 + 0.6 * hash2(yard + 7.0)) * 260.0;
			let size = 14.0 + 22.0 * y.y;
			let edge = length(p.xz - at) - size + 7.0 * (noise1(p.x * 0.09) + noise1(p.z * 0.09 + 2.0) - 1.0);
			meadow = mix(meadow, vec3f(0.006, 0.01, 0.012), 1.0 - smoothstep(-blur, blur, edge));
			if (y.y > 0.55) {
				let lamp = length(p.xz - at - vec2f(size, 0.0));
				meadow += WINDOW * 1.5 * (1.0 - smoothstep(0.0, max(blur * 1.5, 1.5), lamp));
			}
		}
		// And further off, more lakes: wide, uneven ovals of still water, mirroring the sky.
		let open = lakes(p.xz, blur);
		let fresnel = 0.02 + 0.98 * pow(1.0 - max(-v.y, 0.0), 5.0);
		let lake = mix(vec3f(0.01, 0.025, 0.06), mirror, fresnel);
		return vec4f(finish(hazed(mix(meadow, lake, open), v, dist)), 1.0);
	}
	let calm = 1.0 / (1.0 + dist * 0.02);
	var g = slope(p.xz, shaderUniforms.time, calm);

	// Rings from each letter of the label as it breaks the surface (letterRings: when; letterCenters:
	// where), dying away; and round each letter afloat, the water lapping at it: small wavelets,
	// uneven round it, as its bobbing and rocking stirs them.
	let lz = shaderUniforms.label.x;
	// The letters are flat but read as having body: the water moves from their front, not their middle.
	let front = lz + 0.3;
	for (var i = 0; i < i32(shaderUniforms.label.w); i++) {
		let since = shaderUniforms.time - shaderUniforms.letterRings[i / 4][i % 4];
		if (since > 0.0 && since < 8.0) {
			let off = p.xz - vec2f(shaderUniforms.letterCenters[i / 4][i % 4], front);
			let d = max(length(off), 1e-3);
			let behind = since * 1.4 - d;
			let env = select(0.0, exp(-behind * 0.8), behind > 0.0) * exp(-since * 0.55) * exp(-d * 0.35);
			g += off / d * cos(4.0 * behind) * env * shaderUniforms.rings.y;
		}
		let up = clamp((letterRise(i) + shaderUniforms.label.z) / shaderUniforms.label.z, 0.0, 1.0);
		if (up > 0.0) {
			let off = p.xz - vec2f(shaderUniforms.letterCenters[i / 4][i % 4], front);
			let d = max(length(off), 1e-3);
			let t = shaderUniforms.time + f32(i) * 1.7;
			let uneven = 0.6 + 0.4 * sin(atan2(off.y, off.x) * 3.0 + t * 0.7);
			let lap = cos(7.0 * d - t * 3.1) * 0.06 * exp(-d * 1.8) + cos(3.8 * d - t * 2.0) * 0.035 * exp(-d * 0.8);
			g += off / d * lap * uneven * up;
		}
	}
	let n = normalize(vec3f(-g.x, 1.0, -g.y));

	var r = reflect(v, n);
	r.y = max(r.y, 0.0005);
	var mirrored = skyColor(r);
	// Does the reflected ray meet the far shore? Then it shows the shore's outline.
	if (r.z < 0.0) {
		let t = (SHORE_Z - p.z) / r.z;
		let x = p.x + r.x * t;
		if (t > 0.0 && r.y * t < shoreHeight(x)) {
			mirrored = shoreColor(r) + WINDOW * windowLight(x, r.y * t) * 0.8;
		}
	}

	// The flock's mirror image, rippled: the flatter the surface here, the less it is moved.
	let uv = input.position.xy / shaderSystem.screenSize.xy + vec2f(n.x, -n.z) * shaderUniforms.ripple;
	let birds = textureSampleLevel(reflection, reflectionSampler, uv, 0.0).rgb;
	let ink = 1.0 - exp(-max(birds.r, max(birds.g, birds.b)) * shaderUniforms.flockGain);
	mirrored = mix(mirrored, shaderUniforms.inkColor, ink);

	// The label, mirrored: where the reflected ray meets its plane, above the water, each letter at
	// its own height and turn.
	if (r.z < 0.0 && p.z > lz) {
		let t = (lz - p.z) / r.z;
		let hit = p + r * t;
		// So close to the water, the ripples would hardly move it; moved more, it shows them, as the
		// flock's does.
		let wobble = vec2f(n.x, n.z) * 3.0;
		let at = letterAt(hit.x + wobble.x, hit.y + wobble.y);
		if (hit.y > 0.0 && at.z > 0.0) {
			let a = textureSampleLevel(labelText, labelTextSampler, at.xy, 0.0).a;
			mirrored = mix(mirrored, vec3f(0.95, 0.93, 0.9), a * 0.85);
		}
	}

	let facing = max(dot(-v, n), 0.0);
	let fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
	let body = vec3f(0.0, 0.02, 0.09);
	return vec4f(finish(mix(body, mirrored, fresnel)), 1.0);
}
