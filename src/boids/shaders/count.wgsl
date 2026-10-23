// Counting sort, step 1: each boid learns its cell and its place in that cell's queue.

@group(0) @binding(1) var<storage, read> boids: array<Boid>;
@group(0) @binding(2) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> boidCell: array<u32>;
@group(0) @binding(4) var<storage, read_write> boidRank: array<u32>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x;
	if (i >= sim.count) { return; }
	let c = cellIndex(cellCoord(boids[i].pos.xyz));
	boidCell[i] = c;
	boidRank[i] = atomicAdd(&counts[c], 1u);
}
