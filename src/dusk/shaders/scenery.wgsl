// What stands on the land past the far shore, seen from above on the way down: rows of trees, farms,
// villages with their churches. Each is a flat cut-out standing up, facing the camera's way (it
// only ever looks out across the lake); the quad's uv says what it is (u's whole part: a tree, a
// house gable on, a barn side on, a church) and where in it this is. Dark against the land, lost in
// its haze far off; a few village windows lit.

struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) world: vec3f,
	@location(1) uv: vec2f,
}

@vertex
fn mainVertex(input: VertexInput) -> VertexOutput {
	var out: VertexOutput;
	out.position = shaderSystem.viewProjection * vec4f(input.position, 1.0);
	out.world = input.position;
	out.uv = input.uv;
	return out;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4f {
	let kind = floor(input.uv.x / 2.0);
	let u = input.uv.x - kind * 2.0;
	let v = input.uv.y;
	let across = 1.0 - abs(u - 0.5) * 2.0; // 1 in the middle, 0 at the sides
	var inside = false;
	var windows = false;
	if (kind < 0.5) {
		// A tree: no trunk to be seen this far off, only its crown, straight-sided down to the ground
		// and rounded over the top, its edge a little ragged.
		let c = (u - 0.5) * 2.0;
		let ragged = 0.04 * (noise1(u * 6.0 + input.world.x) - 0.5);
		inside = abs(c) < 0.9 + ragged && v < 0.6 + 0.4 * sqrt(max(1.0 - c * c / 0.81, 0.0)) + ragged;
	} else if (kind < 1.5) {
		// A house, gable on: walls, and a steep roof to a point.
		inside = v < 0.5 + 0.5 * across;
		windows = v < 0.45;
	} else if (kind < 2.5) {
		// A barn, side on: low walls, a long ridge, its ends sloping.
		inside = v < 0.4 + 0.6 * min(across / 0.3, 1.0);
	} else {
		// A church: a tower with a spire, over a low nave.
		let a = abs(u - 0.5);
		inside = v < 0.25 || (a < 0.12 && v < 0.7) || (a < 0.12 && v < 0.7 + 0.3 * (1.0 - a / 0.12));
	}
	if (!inside) { discard; }

	let eye = shaderSystem.cameraPosition;
	let d = normalize(input.world - eye);
	var c = vec3f(0.008, 0.012, 0.02);
	if (windows) {
		let cell = vec2f(u * 4.0, v * 7.0);
		let f = fract(cell);
		let lit = hash2(floor(cell) + floor(input.world.xz)).x > 0.8 && f.x > 0.25 && f.x < 0.75 && f.y > 0.3 && f.y < 0.7;
		c = select(c, WINDOW, lit);
	}
	return vec4f(finish(hazed(c, d, length(input.world.xz - eye.xz))), 1.0);
}
