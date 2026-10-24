// Bloom as in Call of Duty: Advanced Warfare: a 13-tap downsample chain, then a tent-filtered
// upsample added back up the chain. The composite is the old site's: the 8-bit scene × gain plus
// an oversaturated bloom, each channel eased toward 1 on its own, written out as is (the light was
// added as sRGB values, so there is no gamma to apply). `fade` is its dim pass: last frame × fade,
// minus cut, so trails end instead of leaving a haze. The canvas is see-through (premultiplied):
// light is as opaque as it is bright, so the page behind shows in the dark, as the old site's
// transparent canvas did over its navy page. `horizon` is that page's colour (`background`) fogging
// the lower half, over the light and whatever is behind it.

struct Post {
	strength: f32, gain: f32, time: f32, fade: f32,
	saturation: f32, cut: f32, horizon: f32, ink: f32,
	background: vec4f,
	inkColor: vec4f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var filtering: sampler;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> post: Post;

struct Out {
	@builtin(position) pos: vec4f,
	@location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> Out {
	let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
	var out: Out;
	out.pos = vec4f(xy, 0.0, 1.0);
	out.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
	return out;
}

fn tap(uv: vec2f, offset: vec2f) -> vec3f {
	return textureSampleLevel(src, filtering, uv + offset / vec2f(textureDimensions(src)), 0.0).rgb;
}

@fragment
fn down(in: Out) -> @location(0) vec4f {
	let uv = in.uv;
	let a = tap(uv, vec2f(-2.0, 2.0));
	let b = tap(uv, vec2f(0.0, 2.0));
	let c = tap(uv, vec2f(2.0, 2.0));
	let d = tap(uv, vec2f(-2.0, 0.0));
	let e = tap(uv, vec2f(0.0, 0.0));
	let f = tap(uv, vec2f(2.0, 0.0));
	let g = tap(uv, vec2f(-2.0, -2.0));
	let h = tap(uv, vec2f(0.0, -2.0));
	let i = tap(uv, vec2f(2.0, -2.0));
	let j = tap(uv, vec2f(-1.0, 1.0));
	let k = tap(uv, vec2f(1.0, 1.0));
	let l = tap(uv, vec2f(-1.0, -1.0));
	let m = tap(uv, vec2f(1.0, -1.0));
	let sum = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
	return vec4f(sum, 1.0);
}

@fragment
fn up(in: Out) -> @location(0) vec4f {
	let uv = in.uv;
	let sum =
		tap(uv, vec2f(0.0, 0.0)) * 4.0 +
		(tap(uv, vec2f(0.0, 1.0)) + tap(uv, vec2f(-1.0, 0.0)) + tap(uv, vec2f(1.0, 0.0)) + tap(uv, vec2f(0.0, -1.0))) * 2.0 +
		(tap(uv, vec2f(-1.0, 1.0)) + tap(uv, vec2f(1.0, 1.0)) + tap(uv, vec2f(-1.0, -1.0)) + tap(uv, vec2f(1.0, -1.0)));
	return vec4f(sum / 16.0, 1.0);
}

fn dither(p: vec2f) -> f32 {
	return fract(sin(dot(p + post.time, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
}

@fragment
fn fade() -> @location(0) vec4f {
	return vec4f(vec3f(post.cut), 1.0 - post.fade);
}

@fragment
fn composite(in: Out) -> @location(0) vec4f {
	let scene = textureSampleLevel(src, filtering, in.uv, 0.0).rgb;
	var bloom = textureSampleLevel(bloomTex, filtering, in.uv, 0.0).rgb;
	let gray = dot(bloom, vec3f(0.2126, 0.7152, 0.0722));
	bloom = max(mix(vec3f(gray), bloom, post.saturation), vec3f(0.0));
	let c = clamp(1.0 - exp(-(scene * post.gain + bloom * post.strength)) + dither(in.pos.xy) / 255.0, vec3f(0.0), vec3f(1.0));
	let a = max(c.r, max(c.g, c.b));
	// Light is as opaque as it is bright. As ink, the same amount of it is that much dark instead.
	let light = mix(vec4f(c, a), vec4f(post.inkColor.rgb * a, a), post.ink);
	// The fog: the page's colour at the bottom, gone by the middle (the old gradient, 1.25× tall).
	let up = 1.0 - in.uv.y;
	let fog = clamp(1.0 - (up + 0.125) / 0.625, 0.0, 1.0) * post.horizon;
	return light * (1.0 - fog) + vec4f(post.background.rgb, 1.0) * fog;
}
