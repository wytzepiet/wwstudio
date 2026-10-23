/**
 * GPU time per named pass, from timestamp queries. A pass that did not run this frame reads 0.
 * Results arrive a few frames late and are smoothed.
 */
export class GpuTimer {
	readonly ms: Record<string, number> = {};
	private querySet: GPUQuerySet;
	private resolveBuffer: GPUBuffer;
	private readBuffer: GPUBuffer;
	private ran = new Set<string>();
	private reading = false;

	constructor(
		device: GPUDevice,
		private names: string[]
	) {
		const size = names.length * 2 * 8;
		this.querySet = device.createQuerySet({ type: 'timestamp', count: names.length * 2 });
		this.resolveBuffer = device.createBuffer({ size, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
		this.readBuffer = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
		for (const name of names) this.ms[name] = 0;
	}

	/** Timestamps for a pass; `begin`/`end` let one name span several passes. */
	writes(name: string, part: 'begin' | 'end' | 'both' = 'both'): GPUComputePassTimestampWrites {
		const i = this.names.indexOf(name) * 2;
		this.ran.add(name);
		return {
			querySet: this.querySet,
			...(part !== 'end' && { beginningOfPassWriteIndex: i }),
			...(part !== 'begin' && { endOfPassWriteIndex: i + 1 })
		};
	}

	resolve(encoder: GPUCommandEncoder) {
		if (this.reading) return;
		encoder.resolveQuerySet(this.querySet, 0, this.names.length * 2, this.resolveBuffer, 0);
		encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, this.readBuffer.size);
	}

	/** Call after submit. */
	read() {
		if (this.reading) return;
		this.reading = true;
		const ran = new Set(this.ran);
		this.ran.clear();
		this.readBuffer.mapAsync(GPUMapMode.READ).then(() => {
			const t = new BigInt64Array(this.readBuffer.getMappedRange());
			this.names.forEach((name, i) => {
				const ms = ran.has(name) ? Number(t[i * 2 + 1] - t[i * 2]) / 1e6 : 0;
				if (ms >= 0 && ms < 1000) this.ms[name] += (ms - this.ms[name]) * 0.1;
			});
			this.readBuffer.unmap();
			this.reading = false;
		});
	}
}
