// The far shore: a strip of columns along SHORE_Z whose tops are raised to shoreHeight, so the
// mesh and the water's reflection of it are the same outline. A few of the village's windows are lit.

struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) world: vec3f,
}

@vertex
fn mainVertex(input: VertexInput) -> VertexOutput {
	var out: VertexOutput;
	var local = input.position;
	if (local.y > 0.0) { local.y = shoreHeight(local.x); }
	let world = vec3f(local.x, local.y, SHORE_Z);
	out.position = shaderSystem.viewProjection * vec4f(world, 1.0);
	out.world = world;
	return out;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4f {
	let d = normalize(input.world - shaderSystem.cameraPosition);
	return vec4f(finish(shoreColor(d) + WINDOW * windowLight(input.world.x, input.world.y)), 1.0);
}
