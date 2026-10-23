// Counting sort, step 3: once the counts are scanned into starts, every boid knows its slot.

@group(0) @binding(1) var<storage, read> boids: array<Boid>;
@group(0) @binding(2) var<storage, read> starts: array<u32>;
@group(0) @binding(3) var<storage, read> boidCell: array<u32>;
@group(0) @binding(4) var<storage, read> boidRank: array<u32>;
@group(0) @binding(5) var<storage, read_write> sorted: array<Boid>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x;
	if (i >= sim.count) { return; }
	sorted[starts[boidCell[i]] + boidRank[i]] = boids[i];
}
