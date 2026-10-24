// Each boid is a soft quad, stretched along its motion as seen by the camera, added into an HDR
// target that keeps fading trails. As on the old site: colour sweeps from nearColor to farColor in
// HSL (so it passes through the hues between), boids with few neighbours fade out, and colours add
// up as sRGB values, not linear light. That is what lets dense spots run to white: no channel is
// far behind the brightest, so they all saturate, one after another.

struct Boid {
	pos: vec4f,
	vel: vec4f,
	push: vec4f,
}

struct View {
	viewProj: mat4x4f,
	camPos: vec3f, size: f32,
	nearColor: vec4f, // rgb as sRGB values, a: intensity
	farColor: vec4f,
	streak: f32, glowFrom: f32, maxSpeed: f32, depthNear: f32,
	depthFar: f32, glowRange: f32, depthSharpness: f32, minGlow: f32,
	falloff: f32, mirrorY: f32, mirror: f32, count: f32,
	pushStretch: f32, _a: f32, _b: f32, _c: f32,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> boids: array<Boid>;

struct Out {
	@builtin(position) pos: vec4f,
	@location(0) uv: vec2f,
	@location(1) color: vec3f,
}

fn rgbToHsl(c: vec3f) -> vec3f {
	let hi = max(max(c.r, c.g), c.b);
	let lo = min(min(c.r, c.g), c.b);
	let d = hi - lo;
	let l = (hi + lo) * 0.5;
	if (d <= 0.0) { return vec3f(0.0, 0.0, l); }
	let s = select(d / (2.0 - hi - lo), d / (hi + lo), l < 0.5);
	var h: f32;
	if (hi == c.r) { h = (c.g - c.b) / d + select(0.0, 6.0, c.g < c.b); }
	else if (hi == c.g) { h = (c.b - c.r) / d + 2.0; }
	else { h = (c.r - c.g) / d + 4.0; }
	return vec3f(h / 6.0, s, l);
}

fn hslToRgb(hsl: vec3f) -> vec3f {
	let k = (vec3f(0.0, 8.0, 4.0) + hsl.x * 12.0) % 12.0;
	let a = hsl.y * min(hsl.z, 1.0 - hsl.z);
	return hsl.z - a * clamp(min(k - 3.0, 9.0 - k), vec3f(-1.0), vec3f(1.0));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
	var corners = array<vec2f, 6>(
		vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
		vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
	);
	let q = corners[vi];
	// Instances past the flock are its mirror image in the water: flipped about it, and dimmer.
	let mirrored = f32(ii) >= view.count;
	let b = boids[select(ii, ii - u32(view.count), mirrored)];
	var p = b.pos.xyz;
	// The pointer's push stretches a boid too, as far as pushStretch says: a flung spark streaks,
	// but ink would only smear darker.
	var v = b.vel.xyz + b.push.xyz * view.pushStretch;
	if (mirrored) {
		p.y = 2.0 * view.mirrorY - p.y;
		v.y = -v.y;
	}

	let toBoid = p - view.camPos;
	let dist = length(toBoid);
	let fwd = toBoid / dist;
	let across = v - fwd * dot(v, fwd);
	let acrossSpeed = length(across);
	var along = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
	if (acrossSpeed > 1e-3) { along = across / acrossSpeed; }
	let side = cross(fwd, along);
	let stretch = 1.0 + view.streak * acrossSpeed / view.maxSpeed;
	let world = p + along * q.x * view.size * stretch + side * q.y * view.size;

	let mid = (view.depthNear + view.depthFar) * 0.5;
	let x = (dist - mid) / (view.depthFar - mid);
	let t = 1.0 / (1.0 + exp(-x * view.depthSharpness));
	let hsl = mix(rgbToHsl(view.nearColor.rgb), rgbToHsl(view.farColor.rgb), t);
	let intensity = mix(view.nearColor.a, view.farColor.a, t);
	let glow = clamp((b.pos.w - view.glowFrom) / view.glowRange, view.minGlow, 1.0) * b.push.w;

	var out: Out;
	out.pos = view.viewProj * vec4f(world, 1.0);
	out.uv = q;
	// Boids right by the camera fade out, instead of filling the screen as they fly past it.
	let close = smoothstep(15.0, 120.0, dist);
	out.color = hslToRgb(hsl) * intensity * glow * close * select(1.0, view.mirror, mirrored);
	return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
	// The old site's sprite was a linear radial gradient, white at the centre to clear at the rim
	// (falloff 1). A higher falloff shrinks the bright core inside the same footprint.
	let a = pow(max(1.0 - length(in.uv), 0.0), view.falloff);
	return vec4f(in.color * a, 0.0);
}
