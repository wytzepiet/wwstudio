import common from './shaders/common.wgsl?raw';
import countCode from './shaders/count.wgsl?raw';
import scatterCode from './shaders/scatter.wgsl?raw';
import flockCode from './shaders/flock.wgsl?raw';
import { Scan } from './scan';
import type { Params } from './params';
import type { GpuTimer } from './timer';

type Vec3 = ArrayLike<number>;

/** What changes every frame, from outside the simulation. */
export interface Frame {
	dt: number;
	time: number;
	frame: number;
	goal: Vec3;
	/** 0 flocking, 1 held in the ring. */
	hold: number;
	/** An outward kick this frame, world units per second; 0 most frames. */
	burst: number;
	/** How full the loader ring is, 0 to 1, and how far it has turned since it filled. */
	progress: number;
	ringAngle: number;
	/** × ringRadius: below 1 while the ring tenses before it bursts. */
	ringScale: number;
	/** Where the surges running round the ring are, in radians of their wave. */
	surgePhase: number;
	/** How far the ring has drawn in (0 to 1); 1 also while it lets go after the burst. */
	squeeze: number;
	/** How fast the push dies away, per second: faster just after a burst. */
	pushDecay: number;
	viewProj: Float32Array;
	camRight: Vec3;
	camUp: Vec3;
	tanHalfFov: number;
	aspect: number;
	mouseOn: boolean;
	/** Previous and current pointer, NDC. */
	mouse: [number, number, number, number];
	mouseVel: [number, number];
}

const GROUP = 128;
const BOID = 48; // bytes: pos, vel, push
const SIM = 288; // bytes, the Sim struct
const groups = (n: number) => Math.ceil(n / GROUP);

/**
 * The simulation, all on the GPU. Every frame:
 *   sort  — count boids per cell, prefix-sum the counts into starts, scatter boids into cell order
 *   flock — every boid steers from the neighbours in the cells around it, and moves (flock.wgsl)
 * `boids` holds the result, in cell order, for the renderer.
 */
export class Flock {
	readonly boids: GPUBuffer;
	readonly count: number;
	readonly dims: [number, number, number];
	readonly cells: number;

	private device: GPUDevice;
	private starts: GPUBuffer;
	private simBuffer: GPUBuffer;
	private sim = new ArrayBuffer(SIM);
	private owned: GPUBuffer[] = [];
	private scan: Scan;
	private pipelines: Record<'count' | 'scatter' | 'flock', GPUComputePipeline>;
	private bindGroups: Record<'count' | 'scatter' | 'flock', GPUBindGroup>;

	constructor(
		device: GPUDevice,
		private params: Params
	) {
		this.device = device;
		this.count = params.count;
		const cellSize = params.radius;
		this.dims = params.box.map((s) => Math.ceil(s / cellSize)) as [number, number, number];
		this.cells = this.dims[0] * this.dims[1] * this.dims[2];

		const buffer = (size: number, usage: number) => {
			const b = device.createBuffer({ size, usage });
			this.owned.push(b);
			return b;
		};
		const STORAGE = GPUBufferUsage.STORAGE;
		const n = this.count;
		this.boids = buffer(n * BOID, STORAGE | GPUBufferUsage.COPY_DST);
		const sorted = buffer(n * BOID, STORAGE);
		const boidCell = buffer(n * 4, STORAGE);
		const boidRank = buffer(n * 4, STORAGE);
		// One extra entry, left at zero, so after the scan starts[cells] is the total and
		// every cell's range is starts[c]..starts[c + 1].
		const starts = (this.starts = buffer((this.cells + 1) * 4, STORAGE | GPUBufferUsage.COPY_DST));
		this.simBuffer = buffer(SIM, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
		this.scan = new Scan(device, starts, this.cells + 1);

		const pipeline = (label: string, code: string) =>
			device.createComputePipeline({
				label,
				layout: 'auto',
				compute: { module: device.createShaderModule({ label, code: common + code }), entryPoint: 'main' }
			});
		this.pipelines = {
			count: pipeline('count', countCode),
			scatter: pipeline('scatter', scatterCode),
			flock: pipeline('flock', flockCode)
		};

		const group = (p: GPUComputePipeline, buffers: GPUBuffer[]) =>
			device.createBindGroup({
				layout: p.getBindGroupLayout(0),
				entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } }))
			});
		const sim = this.simBuffer;
		this.bindGroups = {
			count: group(this.pipelines.count, [sim, this.boids, starts, boidCell, boidRank]),
			scatter: group(this.pipelines.scatter, [sim, this.boids, starts, boidCell, boidRank, sorted]),
			flock: group(this.pipelines.flock, [sim, sorted, starts, this.boids])
		};

		device.queue.writeBuffer(this.boids, 0, this.seed());
	}

	private seed() {
		const data = new Float32Array((this.count * BOID) / 4);
		const inBall = () => {
			for (;;) {
				const v = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
				if (v[0] ** 2 + v[1] ** 2 + v[2] ** 2 <= 1) return v;
			}
		};
		for (let i = 0; i < this.count; i++) {
			const p = inBall();
			const v = inBall();
			data.set([p[0] * 300, p[1] * 300, p[2] * 300, 0, v[0] * 60, v[1] * 60, v[2] * 60, i], (i * BOID) / 4);
		}
		return data;
	}

	update(f: Frame) {
		const p = this.params;
		const F = new Float32Array(this.sim);
		const U = new Uint32Array(this.sim);
		F.set(f.viewProj, 0);
		F.set([-p.box[0] / 2, -p.box[1] / 2, -p.box[2] / 2, p.radius], 16);
		F.set([...p.box, p.radius], 20);
		U.set([...this.dims, this.count], 24);
		F.set([f.goal[0], f.goal[1], f.goal[2], f.dt], 28);
		F.set([f.camRight[0], f.camRight[1], f.camRight[2], f.aspect], 32);
		F.set([f.camUp[0], f.camUp[1], f.camUp[2], f.tanHalfFov], 36);
		F.set(f.mouse, 40);
		F.set([...f.mouseVel, f.mouseOn ? 1 : 0, p.mouseRadius], 44);
		F[48] = f.time;
		U.set([p.maxPerCell, f.frame], 49);
		F[51] = p.seek;
		F.set([p.maxSpeed, p.maxAccel, p.sep, p.ali], 52);
		F.set([p.coh, p.bounds, p.mouse, f.hold], 56);
		F.set([p.wander, p.wanderScale, p.wanderSpeed, f.burst], 60);
		F.set([Math.max(p.ringRadius * f.ringScale, 1), p.ringSpin, f.progress, f.ringAngle], 64);
		// How hard boids are drawn to their places: harder as the ring tenses, so they keep up.
		F[68] = 6 / Math.max(f.ringScale, 0.08);
		F[69] = f.pushDecay;
		F[70] = f.squeeze;
		F[71] = f.surgePhase;
		this.device.queue.writeBuffer(this.simBuffer, 0, this.sim);
	}

	encode(encoder: GPUCommandEncoder, timer: GpuTimer | null) {
		const { pipelines: P, bindGroups: G } = this;
		encoder.clearBuffer(this.starts);

		const sort = encoder.beginComputePass({ timestampWrites: timer?.writes('sort') });
		sort.setPipeline(P.count);
		sort.setBindGroup(0, G.count);
		sort.dispatchWorkgroups(groups(this.count));
		this.scan.encode(sort);
		sort.setPipeline(P.scatter);
		sort.setBindGroup(0, G.scatter);
		sort.dispatchWorkgroups(groups(this.count));
		sort.end();

		const flock = encoder.beginComputePass({ timestampWrites: timer?.writes('flock') });
		flock.setPipeline(P.flock);
		flock.setBindGroup(0, G.flock);
		flock.dispatchWorkgroups(groups(this.count));
		flock.end();
	}

	destroy() {
		this.scan.destroy();
		for (const b of this.owned) b.destroy();
	}
}
