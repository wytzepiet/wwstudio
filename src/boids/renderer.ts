import drawCode from './shaders/draw.wgsl?raw';
import bloomCode from './shaders/bloom.wgsl?raw';
import type { GpuTimer } from './timer';

// The scene is 8-bit, as on the old site: every channel stops at 1, so a dense spot is a hard,
// bright plateau, and the gain in the composite (×8 there) turns single boids into points of light.
const SCENE: GPUTextureFormat = 'rgba8unorm';
const HDR: GPUTextureFormat = 'rgba16float';
const MAX_MIPS = 6;

export interface View {
	viewProj: Float32Array;
	camPos: ArrayLike<number>;
	/** Half the quad's width, in world units. */
	size: number;
	falloff: number;
	/** The water's height in flock units, how strongly boids are mirrored in it (0: not drawn), and
	 *  how many boids there are (instances past it are the mirror images). */
	mirrorY: number;
	mirror: number;
	count: number;
	/** 0: boids are light, added. 1: they are ink, dark against what is behind (a sky at dusk). */
	ink: number;
	inkColor: [number, number, number];
	/** sRGB values 0–1, and intensity. */
	nearColor: [number, number, number, number];
	farColor: [number, number, number, number];
	depthSharpness: number;
	streak: number;
	glowFrom: number;
	glowRange: number;
	minGlow: number;
	maxSpeed: number;
	depthNear: number;
	depthFar: number;
	/** Last frame is kept × fade, minus cut: the trails, cut off clean instead of fading forever. */
	fade: number;
	cut: number;
	/** The scene × gain, plus the bloom × bloom, eased toward 1 per channel. */
	gain: number;
	bloom: number;
	/** 0: every blur level counts the same. Toward 1, the tight halo round each point fades and the
	 *  wide glow is left, so points stay crisp (the old site's bloomRadius, 0.9). */
	bloomRadius: number;
	saturation: number;
	/** sRGB values 0–1: what the old canvas sat on. */
	background: [number, number, number];
	/** How much of that colour fogs the lower half. */
	horizon: number;
	time: number;
}

/** Boids into a scene that keeps fading trails, bloom down and up a mip chain, tonemap onto the canvas. */
export class Renderer {
	private drawPipeline: GPURenderPipeline;
	private fade: GPURenderPipeline;
	private down: GPURenderPipeline;
	private up: GPURenderPipeline;
	private composite: GPURenderPipeline;
	private viewBuffer: GPUBuffer;
	private postBuffer: GPUBuffer;
	private fadeGroup: GPUBindGroup;
	private sampler: GPUSampler;
	private drawGroup: { boids: GPUBuffer; group: GPUBindGroup } | null = null;
	/** The flock's mirror image in the water, at half resolution, when asked for (see resize). */
	reflection: GPUTexture | null = null;
	private targets: {
		scene: GPUTexture;
		mips: GPUTexture[];
		downGroups: GPUBindGroup[];
		upGroups: GPUBindGroup[];
		compositeGroup: GPUBindGroup;
	} | null = null;

	constructor(
		private device: GPUDevice,
		format: GPUTextureFormat
	) {
		const add: GPUBlendState = {
			color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
			alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
		};
		// dst × (1 − the fragment's alpha) − the fragment's colour: the old site's dim pass.
		const dim: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'reverse-subtract' };
		const scale: GPUBlendState = { color: dim, alpha: dim };
		const drawModule = device.createShaderModule({ label: 'draw', code: drawCode });
		this.drawPipeline = device.createRenderPipeline({
			label: 'draw',
			layout: 'auto',
			vertex: { module: drawModule, entryPoint: 'vs' },
			fragment: { module: drawModule, entryPoint: 'fs', targets: [{ format: SCENE, blend: add }] }
		});
		const bloomModule = device.createShaderModule({ label: 'bloom', code: bloomCode });
		const fullscreen = (entryPoint: string, format: GPUTextureFormat, blend?: GPUBlendState) =>
			device.createRenderPipeline({
				label: entryPoint,
				layout: 'auto',
				vertex: { module: bloomModule, entryPoint: 'vs' },
				fragment: { module: bloomModule, entryPoint, targets: [{ format, blend }] }
			});
		this.fade = fullscreen('fade', SCENE, scale);
		this.down = fullscreen('down', HDR);
		// mip[i - 1] × the blend constant + the next level up: the constant turns each finer level down.
		const keep: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'constant', operation: 'add' };
		this.up = fullscreen('up', HDR, { color: keep, alpha: keep });
		this.composite = fullscreen('composite', format);

		this.viewBuffer = device.createBuffer({ size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		this.postBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		this.fadeGroup = device.createBindGroup({
			layout: this.fade.getBindGroupLayout(0),
			entries: [{ binding: 3, resource: { buffer: this.postBuffer } }]
		});
		this.sampler = device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});
	}

	resize(width: number, height: number, reflect = false) {
		if (this.targets) {
			this.targets.scene.destroy();
			for (const m of this.targets.mips) m.destroy();
		}
		this.reflection?.destroy();
		this.reflection = reflect
			? this.device.createTexture({
					size: [Math.max(1, width >> 1), Math.max(1, height >> 1)],
					format: SCENE,
					usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
				})
			: null;
		const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
		const scene = this.device.createTexture({ size: [width, height], format: SCENE, usage });
		const mips: GPUTexture[] = [];
		for (let w = width >> 1, h = height >> 1; mips.length < MAX_MIPS && w >= 4 && h >= 4; w >>= 1, h >>= 1) {
			mips.push(this.device.createTexture({ size: [w, h], format: HDR, usage }));
		}
		const group = (pipeline: GPURenderPipeline, src: GPUTexture, extra: GPUBindGroupEntry[] = []) =>
			this.device.createBindGroup({
				layout: pipeline.getBindGroupLayout(0),
				entries: [{ binding: 0, resource: src.createView() }, { binding: 1, resource: this.sampler }, ...extra]
			});
		this.targets = {
			scene,
			mips,
			downGroups: mips.map((_, i) => group(this.down, i === 0 ? scene : mips[i - 1])),
			upGroups: mips.map((m) => group(this.up, m)),
			compositeGroup: group(this.composite, scene, [
				{ binding: 2, resource: mips[0].createView() },
				{ binding: 3, resource: { buffer: this.postBuffer } }
			])
		};
	}

	draw(encoder: GPUCommandEncoder, target: GPUTextureView, boids: GPUBuffer, count: number, v: View, timer: GpuTimer | null) {
		const t = this.targets;
		if (!t) return;

		const view = new Float32Array(44);
		view.set(v.viewProj, 0);
		view.set([v.camPos[0], v.camPos[1], v.camPos[2], v.size], 16);
		view.set(v.nearColor, 20);
		view.set(v.farColor, 24);
		view.set([v.streak, v.glowFrom, v.maxSpeed, v.depthNear], 28);
		view.set([v.depthFar, v.glowRange, v.depthSharpness, v.minGlow], 32);
		view.set([v.falloff, v.mirrorY, v.mirror, v.count], 36);
		view[40] = 1 - v.ink; // light streaks when pushed; ink doesn't
		this.device.queue.writeBuffer(this.viewBuffer, 0, view);
		this.device.queue.writeBuffer(
			this.postBuffer,
			0,
			new Float32Array([v.bloom, v.gain, v.time % 1000, v.fade, v.saturation, v.cut, v.horizon, v.ink, ...v.background, 0, ...v.inkColor, 0])
		);

		if (this.drawGroup?.boids !== boids) {
			const group = this.device.createBindGroup({
				layout: this.drawPipeline.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: { buffer: this.viewBuffer } },
					{ binding: 1, resource: { buffer: boids } }
				]
			});
			this.drawGroup = { boids, group };
		}

		const pass = (view: GPUTextureView, load: GPULoadOp, timestampWrites?: GPURenderPassTimestampWrites) =>
			encoder.beginRenderPass({
				colorAttachments: [{ view, loadOp: load, storeOp: 'store', clearValue: [0, 0, 0, 1] }],
				timestampWrites
			});
		const fullscreen = (p: GPURenderPassEncoder, pipeline: GPURenderPipeline, group: GPUBindGroup) => {
			p.setPipeline(pipeline);
			p.setBindGroup(0, group);
			p.draw(3);
		};

		const boidsPass = pass(t.scene.createView(), 'load', timer?.writes('draw'));
		fullscreen(boidsPass, this.fade, this.fadeGroup);
		boidsPass.setPipeline(this.drawPipeline);
		boidsPass.setBindGroup(0, this.drawGroup.group);
		boidsPass.draw(6, count);
		boidsPass.end();

		// The mirror images (instances past the flock), fresh each frame, into the reflection.
		if (this.reflection && v.mirror > 0) {
			const mirror = pass(this.reflection.createView(), 'clear');
			mirror.setPipeline(this.drawPipeline);
			mirror.setBindGroup(0, this.drawGroup.group);
			mirror.draw(6, count, 0, count);
			mirror.end();
		}

		t.mips.forEach((mip, i) => {
			const p = pass(mip.createView(), 'clear', i === 0 ? timer?.writes('bloom', 'begin') : undefined);
			fullscreen(p, this.down, t.downGroups[i]);
			p.end();
		});
		for (let i = t.mips.length - 1; i > 0; i--) {
			const p = pass(t.mips[i - 1].createView(), 'load');
			const k = 1 - v.bloomRadius * 0.75;
			p.setBlendConstant([k, k, k, k]);
			fullscreen(p, this.up, t.upGroups[i]);
			p.end();
		}
		const p = pass(target, 'clear', timer?.writes('bloom', 'end'));
		fullscreen(p, this.composite, t.compositeGroup);
		p.end();

	}
}
