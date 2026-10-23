import scanCode from './shaders/scan.wgsl?raw';

const BLOCK = 2048;

/** In-place exclusive prefix sum of `n` u32s, any n: blocks of 2048, recursing on block totals. */
export class Scan {
	private levels: { n: number; bindGroup: GPUBindGroup }[] = [];
	private scanBlocks: GPUComputePipeline;
	private addBlocks: GPUComputePipeline;
	private buffers: GPUBuffer[] = [];

	constructor(device: GPUDevice, data: GPUBuffer, n: number) {
		const module = device.createShaderModule({ label: 'scan', code: scanCode });
		const layout = device.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
				{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
				{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
			]
		});
		const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
		this.scanBlocks = device.createComputePipeline({
			layout: pipelineLayout,
			compute: { module, entryPoint: 'scanBlocks' }
		});
		this.addBlocks = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'addBlocks' } });

		let level = data;
		for (;;) {
			const blocks = Math.ceil(n / BLOCK);
			const sums = device.createBuffer({ size: Math.max(blocks, 1) * 4, usage: GPUBufferUsage.STORAGE });
			const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
			device.queue.writeBuffer(uniform, 0, new Uint32Array([n, 0, 0, 0]));
			this.buffers.push(sums, uniform);
			const bindGroup = device.createBindGroup({
				layout,
				entries: [
					{ binding: 0, resource: { buffer: level } },
					{ binding: 1, resource: { buffer: sums } },
					{ binding: 2, resource: { buffer: uniform } }
				]
			});
			this.levels.push({ n, bindGroup });
			if (blocks <= 1) break;
			level = sums;
			n = blocks;
		}
	}

	encode(pass: GPUComputePassEncoder) {
		pass.setPipeline(this.scanBlocks);
		for (const { n, bindGroup } of this.levels) {
			pass.setBindGroup(0, bindGroup);
			pass.dispatchWorkgroups(Math.ceil(n / BLOCK));
		}
		pass.setPipeline(this.addBlocks);
		for (const { n, bindGroup } of this.levels.slice(0, -1).reverse()) {
			pass.setBindGroup(0, bindGroup);
			pass.dispatchWorkgroups(Math.ceil(n / 256));
		}
	}

	destroy() {
		for (const b of this.buffers) b.destroy();
	}
}
