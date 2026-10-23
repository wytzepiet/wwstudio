import { mat4, vec3 } from 'wgpu-matrix';
import { Flock } from './flock';
import { Renderer } from './renderer';
import { GpuTimer } from './timer';
import { box, type Params } from './params';

export interface Stats {
	fps: number;
	gpu: Record<string, number> | null;
	count: number;
	cells: number;
	dims: [number, number, number];
}

const FOV = Math.PI / 3;

const hexColor = (hex: string, intensity: number): [number, number, number, number] => {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	return [r, g, b, intensity];
};

/**
 * Runs the flock on `canvas` until the page goes away. Params are read live every frame, so whoever
 * holds them can change them. Throws if the browser has no WebGPU.
 */
export async function startBoids(canvas: HTMLCanvasElement, params: Params, onStats?: (s: Stats) => void) {
	if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
	const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
	if (!adapter) throw new Error('No WebGPU adapter found.');
	const timing = adapter.features.has('timestamp-query');
	const device = await adapter.requestDevice({ requiredFeatures: timing ? ['timestamp-query'] : [] });
	device.lost.then((info) => console.error('WebGPU device lost:', info.message));
	device.addEventListener('uncapturederror', (e) => console.error((e as GPUUncapturedErrorEvent).error.message));

	const context = canvas.getContext('webgpu')!;
	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: 'opaque' });

	const timer = timing ? new GpuTimer(device, ['sort', 'flock', 'draw', 'bloom']) : null;
	const renderer = new Renderer(device, format);
	let flock = new Flock(device, params);

	const resize = () => {
		// The old site drew at CSS pixels, a little soft on retina; `resolution` 1 is that.
		const dpr = Math.min(params.resolution, window.devicePixelRatio);
		const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
		const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
		if (w === size[0] && h === size[1]) return;
		size = [w, h];
		canvas.width = w;
		canvas.height = h;
		renderer.resize(w, h);
	};
	let size = [0, 0];
	new ResizeObserver(resize).observe(canvas);
	resize();

	// Pointer, in normalized device coordinates. `look` trails it for a slow camera parallax.
	const pointer = { x: 0, y: 0, on: false };
	const look = { x: 0, y: 0 };
	const lastPointer = { x: 0, y: 0 };
	const pointerVel: [number, number] = [0, 0];
	// On the window, not the canvas: on a page the canvas lies behind the content.
	window.addEventListener('pointermove', (e) => {
		const r = canvas.getBoundingClientRect();
		pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
		pointer.y = 1 - ((e.clientY - r.top) / r.height) * 2;
		if (!pointer.on) Object.assign(lastPointer, { x: pointer.x, y: pointer.y });
		pointer.on = true;
	});
	document.documentElement.addEventListener('pointerleave', () => (pointer.on = false));

	// A goal the flock seeks, hopping around a circle every few seconds, as on the old site.
	const goal = vec3.create(0, 0, 0);
	let goalAngle = Math.random() * Math.PI * 2;
	let nextHop = 0;

	let frame = 0;
	let last = performance.now();
	let fps = 60;
	// The flock's own clock: `tempo` slows everything it does alike, so its shape survives.
	let simTime = 0;

	const loop = (now: number) => {
		resize();
		const dt = Math.min((now - last) / 1000, 1 / 30);
		last = now;
		if (dt > 0) fps += (1 / dt - fps) * 0.05;
		const time = now / 1000;
		const simDt = dt * params.tempo;
		simTime += simDt;

		if (simTime > nextHop) {
			goalAngle += (0.5 + Math.random()) * Math.PI;
			nextHop = simTime + 2 + Math.random() * 2;
		}
		const goalTo = [Math.cos(goalAngle) * box[0] * 0.18, Math.sin(goalAngle) * box[1] * 0.18, 0];
		// The old site's goal jumped; this one glides there, about goalGlide seconds to get most of the way.
		vec3.lerp(goal, goalTo, params.goalGlide > 0 ? 1 - Math.exp(-simDt / params.goalGlide) : 1, goal);

		const ease = 1 - Math.exp(-dt * 3);
		look.x += ((pointer.on ? pointer.x : 0) - look.x) * ease;
		look.y += ((pointer.on ? pointer.y : 0) - look.y) * ease;
		const yaw = look.x * 0.2;
		const pitch = look.y * 0.12;
		const camPos = vec3.create(
			params.distance * Math.sin(yaw) * Math.cos(pitch),
			params.distance * Math.sin(pitch),
			params.distance * Math.cos(yaw) * Math.cos(pitch)
		);
		const aspect = canvas.width / canvas.height;
		const viewMat = mat4.lookAt(camPos, [0, 0, 0], [0, 1, 0]);
		const viewProj = mat4.multiply(mat4.perspective(FOV, aspect, 10, 5000), viewMat);
		const camRight = vec3.create(viewMat[0], viewMat[4], viewMat[8]);
		const camUp = vec3.create(viewMat[1], viewMat[5], viewMat[9]);
		const tanHalfFov = Math.tan(FOV / 2);
		const mouse: [number, number, number, number] = [lastPointer.x, lastPointer.y, pointer.x, pointer.y];
		if (dt > 0) {
			const k = 1 - Math.exp(-dt * 20);
			pointerVel[0] += ((pointer.x - lastPointer.x) / dt - pointerVel[0]) * k;
			pointerVel[1] += ((pointer.y - lastPointer.y) / dt - pointerVel[1]) * k;
		}
		Object.assign(lastPointer, { x: pointer.x, y: pointer.y });

		if (flock.count !== params.count || flock.dims[0] !== Math.ceil(box[0] / params.radius)) {
			flock.destroy();
			flock = new Flock(device, params);
		}

		flock.update({
			dt: simDt,
			time: simTime,
			frame,
			goal,
			viewProj,
			camRight,
			camUp,
			tanHalfFov,
			aspect,
			mouseOn: pointer.on,
			mouse,
			mouseVel: pointerVel
		});

		const encoder = device.createCommandEncoder();
		flock.encode(encoder, timer);
		renderer.draw(
			encoder,
			context.getCurrentTexture().createView(),
			flock.boids,
			flock.count,
			{
				viewProj,
				camPos,
				// `size` is the old site's point size: size × 1000 / depth screen pixels across (CSS
				// pixels, whatever the window's height), which is this many world units half-wide.
				size: (params.size * 1000 * tanHalfFov) / canvas.clientHeight,
				falloff: params.falloff,
				nearColor: hexColor(params.nearColor, params.intensity),
				farColor: hexColor(params.farColor, params.intensity),
				depthSharpness: params.depthSharpness,
				streak: params.streak,
				glowFrom: params.glowFrom,
				glowRange: params.glowRange,
				minGlow: params.minGlow,
				maxSpeed: params.maxSpeed,
				depthNear: params.distance - box[2] / 2,
				depthFar: params.distance + box[2] / 2,
				// The old site faded by a fixed factor per frame; this is that factor at 60 fps.
				fade: params.fade ** (dt * 60),
				cut: params.cut * dt * 60,
				gain: params.gain,
				bloom: params.bloom,
				bloomRadius: params.bloomRadius,
				saturation: params.saturation,
				background: hexColor(params.background, 1).slice(0, 3) as [number, number, number],
				horizon: params.horizon,
				time
			},
			timer
		);
		timer?.resolve(encoder);
		device.queue.submit([encoder.finish()]);
		timer?.read();

		if (onStats && frame % 10 === 0) {
			onStats({ fps, gpu: timer?.ms ?? null, count: flock.count, cells: flock.cells, dims: flock.dims });
		}
		frame++;
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
