// The email, standing in the lake, coming up a letter at a time: one board, each letter cut from
// the text at its own height (letterRise) and turned a little (letterAt). Only what is above the surface is drawn, plain white;
// it draws over the water (depth 'always').
//
// label: z of its plane, half its width, a letter's height, how many letters.

const LABEL = vec3f(0.95, 0.93, 0.9);

struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) world: vec3f,
}

@vertex
fn mainVertex(input: VertexInput) -> VertexOutput {
	var out: VertexOutput;
	out.position = shaderSystem.viewProjection * vec4f(input.position, 1.0);
	out.world = input.position;
	return out;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4f {
	let at = letterAt(input.world.x, input.world.y);
	var a = textureSampleLevel(labelText, labelTextSampler, at.xy, 0.0).a * at.z;
	// Only what is above the water is seen.
	a *= smoothstep(-0.03, 0.0, input.world.y);
	return vec4f(finish(LABEL), a);
}
