// Exclusive prefix sum, in place. A block is 256 threads × 8 values; block totals go one level
// up, are scanned there the same way, and are added back down (scan.ts runs the levels).

@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@group(0) @binding(1) var<storage, read_write> blockSums: array<u32>;
@group(0) @binding(2) var<uniform> n: vec4u;

const PER_THREAD = 8u;
const BLOCK = 2048u;

var<workgroup> partial: array<u32, 256>;

@compute @workgroup_size(256)
fn scanBlocks(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
	let base = wid.x * BLOCK + lid.x * PER_THREAD;
	var local: array<u32, 8>;
	var sum = 0u;
	for (var k = 0u; k < PER_THREAD; k++) {
		local[k] = sum;
		if (base + k < n.x) { sum += data[base + k]; }
	}
	partial[lid.x] = sum;
	workgroupBarrier();

	for (var offset = 1u; offset < 256u; offset *= 2u) {
		var t = 0u;
		if (lid.x >= offset) { t = partial[lid.x - offset]; }
		workgroupBarrier();
		partial[lid.x] += t;
		workgroupBarrier();
	}

	var prefix = 0u;
	if (lid.x > 0u) { prefix = partial[lid.x - 1u]; }
	for (var k = 0u; k < PER_THREAD; k++) {
		if (base + k < n.x) { data[base + k] = local[k] + prefix; }
	}
	if (lid.x == 255u) { blockSums[wid.x] = partial[255]; }
}

@compute @workgroup_size(256)
fn addBlocks(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= n.x) { return; }
	data[id.x] += blockSums[id.x / BLOCK];
}
