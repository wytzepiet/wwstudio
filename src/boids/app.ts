import { mat4, vec3 } from 'wgpu-matrix';
import { Flock } from './flock';
import { Renderer } from './renderer';
import { GpuTimer } from './timer';
import { box, PAST, type Params } from './params';

/**
 * The loader: `gather` draws the flock into the ring, `progress` fills it (0 to 1; the ring spins
 * once full), `release` lets it burst out. `travel` flies the camera forward through the flock and
 * past it: 0 in front, 1 at PAST beyond its middle, and on at that rate (see `flight` in params).
 */
export interface FlockControl {
	gather(): void;
	progress(p: number): void;
	release(): void;
	travel(t: number): void;
}

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
 * holds them can change them. With `held`, it starts as the loader ring. Throws if the browser has
 * no WebGPU.
 */
export async function startBoids(
	canvas: HTMLCanvasElement,
	params: Params,
	{
		held = false,
		onStats,
		onFlown
	}: {
		held?: boolean;
		onStats?: (s: Stats) => void;
		/** Every frame: how far the camera has flown toward and past the flock, in world units. */
		onFlown?: (flown: number) => void;
	} = {}
): Promise<FlockControl> {
	if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
	const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
	if (!adapter) throw new Error('No WebGPU adapter found.');
	const timing = adapter.features.has('timestamp-query');
	const device = await adapter.requestDevice({ requiredFeatures: timing ? ['timestamp-query'] : [] });
	device.lost.then((info) => console.error('WebGPU device lost:', info.message));
	device.addEventListener('uncapturederror', (e) => console.error((e as GPUUncapturedErrorEvent).error.message));

	const context = canvas.getContext('webgpu')!;
	const format = navigator.gpu.getPreferredCanvasFormat();
	// See-through where there is no light, so whatever lies behind the canvas shows in the gaps.
	context.configure({ device, format, alphaMode: 'premultiplied' });

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

	// The loader. The hold lets go fast and gathers slowly; a release also kicks once.
	let holdTo = held ? 1 : 0;
	let hold = holdTo;
	let burst = 0;
	let progress = 1;
	let ringAngle = 0;
	// A release first tenses: the ring draws in by TENSION over TENSE ms, slowly and then faster
	// (ease-in), then bursts. The burst's kick dies away BLAST_DECAY times a second for BLAST ms,
	// much faster than a mouse push, so the blast is quick and short.
	const TENSE = 700;
	const BLAST = 600;
	const BLAST_DECAY = 10;
	const TENSION = 1; // all the way in, to a point
	const COLLAPSED = 150; // ms held at the point, so every boid gets there before the burst
	let tensing: number | null = null;
	let ringScale = 1;
	// The burst spreads the boids thin: too thin to glow by their crowding (see glowFrom), and over so
	// much more of the screen that the light, which adds up, thins out too. So for a while everyone
	// glows regardless, and brighter (AFTERGLOW_GAIN ×): fully for GLOW_HOLD ms, then fading back
	// over GLOW_FADE, as the flock draws together again.
	const GLOW_HOLD = 1000;
	const GLOW_FADE = 1500;
	const AFTERGLOW_GAIN = 2.5;
	let burstAt: number | null = null;
	let afterglow = 0;

	let travelTo = 0;
	let travel = 0;

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

		hold += (holdTo - hold) * (1 - Math.exp(-dt * (holdTo > hold ? 2 : 8)));
		if (hold < 0.002) hold = 0;
		if (progress >= 1) ringAngle += params.ringSpin * simDt;
		if (burstAt !== null) {
			const k = Math.min(Math.max((now - burstAt - GLOW_HOLD) / GLOW_FADE, 0), 1);
			afterglow = 1 - k * k * (3 - 2 * k);
			if (k >= 1) burstAt = null;
		}
		if (tensing !== null) {
			const k = Math.min((now - tensing) / TENSE, 1);
			ringScale = 1 - TENSION * k * k * k;
			if (now - tensing >= TENSE + COLLAPSED) {
				tensing = null;
				ringScale = 1;
				holdTo = 0;
				burst = params.burst;
				burstAt = now;
			}
		}
		// Held, the goal waits in the middle, where the ring is; after a release it waits a moment more.
		if (hold > 0) nextHop = simTime + 1.5;
		if (simTime > nextHop) {
			goalAngle += (0.5 + Math.random()) * Math.PI;
			nextHop = simTime + 2 + Math.random() * 2;
		}
		const goalTo = hold > 0 ? [0, 0, 0] : [Math.cos(goalAngle) * box[0] * 0.18, Math.sin(goalAngle) * box[1] * 0.18, 0];
		// The old site's goal jumped; this one glides there, about goalGlide seconds to get most of the way.
		vec3.lerp(goal, goalTo, params.goalGlide > 0 ? 1 - Math.exp(-simDt / params.goalGlide) : 1, goal);

		const ease = 1 - Math.exp(-dt * 3);
		look.x += ((pointer.on ? pointer.x : 0) - look.x) * ease;
		look.y += ((pointer.on ? pointer.y : 0) - look.y) * ease;
		const yaw = look.x * 0.2;
		const pitch = look.y * 0.12;
		const orbit = vec3.create(
			params.distance * Math.sin(yaw) * Math.cos(pitch),
			params.distance * Math.sin(pitch),
			params.distance * Math.cos(yaw) * Math.cos(pitch)
		);
		// Looking at the flock's middle, and flying that way as `travel` goes to 1.
		travel += (travelTo - travel) * (1 - Math.exp(-dt * 12));
		const ahead = vec3.normalize(vec3.negate(orbit));
		const flown = travel * (params.distance + PAST);
		onFlown?.(flown);
		const camPos = vec3.addScaled(orbit, ahead, flown);
		const aspect = canvas.width / canvas.height;
		const viewMat = mat4.lookAt(camPos, vec3.add(camPos, ahead), [0, 1, 0]);
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
			hold,
			burst,
			progress,
			ringAngle,
			ringScale,
			pushDecay: burstAt !== null && now - burstAt < BLAST ? BLAST_DECAY : 4.35,
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
				nearColor: hexColor(params.nearColor, params.intensity * (1 + (AFTERGLOW_GAIN - 1) * afterglow)),
				farColor: hexColor(params.farColor, params.intensity * (1 + (AFTERGLOW_GAIN - 1) * afterglow)),
				depthSharpness: params.depthSharpness,
				streak: params.streak,
				glowFrom: params.glowFrom,
				glowRange: params.glowRange,
				minGlow: Math.max(params.minGlow, afterglow),
				maxSpeed: params.maxSpeed,
				// Colour by depth in the flock, not from the camera, so it holds as the camera flies in.
				depthNear: params.distance - flown - box[2] / 2,
				depthFar: params.distance - flown + box[2] / 2,
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

		burst = 0;
		if (onStats && frame % 10 === 0) {
			onStats({ fps, gpu: timer?.ms ?? null, count: flock.count, cells: flock.cells, dims: flock.dims });
		}
		frame++;
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);

	return {
		gather: () => (holdTo = 1),
		travel: (t) => (travelTo = Math.max(t, 0)),
		progress: (p) => {
			progress = Math.min(Math.max(p, 0), 1);
			if (progress < 1) ringAngle = 0;
		},
		release: () => {
			if (holdTo === 0 || tensing !== null) return;
			tensing = performance.now();
		}
	};
}
