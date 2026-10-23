// Shared by every simulation pass. Mirrored word for word by `update` in flock.ts.

struct Boid {
	pos: vec4f,  // w: how many neighbours it sees, for the renderer
	vel: vec4f,  // its own flying velocity; w: its id, which survives the sorting
	push: vec4f, // what the pointer adds on top, decaying; w: how present it is, 0 unseen to 1
}

struct Sim {
	viewProj: mat4x4f,
	boxMin: vec3f, cellSize: f32,
	boxSize: vec3f, radius: f32,
	dims: vec3u, count: u32,
	goal: vec3f, dt: f32,
	camRight: vec3f, aspect: f32,
	camUp: vec3f, tanHalfFov: f32,
	mouse: vec4f, // previous and current pointer, NDC
	mouseVel: vec2f, mouseOn: f32, mouseRadius: f32,
	time: f32, maxPerCell: u32, frame: u32, wSeek: f32,
	maxSpeed: f32, maxAccel: f32, wSep: f32, wAli: f32,
	wCoh: f32, wBounds: f32, wMouse: f32, hold: f32,
	wWander: f32, wanderScale: f32, wanderSpeed: f32, burst: f32,
	ringRadius: f32, ringSpin: f32, progress: f32, ringAngle: f32, // the loader
	ringPull: f32, pushDecay: f32, _b: f32, _c: f32,
}

@group(0) @binding(0) var<uniform> sim: Sim;

fn cellCoord(p: vec3f) -> vec3u {
	let c = floor((p - sim.boxMin) / sim.cellSize);
	return vec3u(clamp(c, vec3f(0.0), vec3f(sim.dims) - 1.0));
}

fn cellIndex(c: vec3u) -> u32 {
	return c.x + sim.dims.x * (c.y + sim.dims.y * c.z);
}
