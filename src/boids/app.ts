import { createSignal } from 'solid-js';
import { mat4, vec3 } from 'wgpu-matrix';
import { Flock } from './flock';
import { Renderer } from './renderer';
import { GpuTimer } from './timer';
import { PAST, type Params } from './params';

export type FlockControl = Awaited<ReturnType<typeof startBoids>>;

export interface Stats {
	fps: number;
	gpu: Record<string, number> | null;
	count: number;
	cells: number;
	dims: [number, number, number];
}

const FOV = Math.PI / 3;

/**
 * The flock set into a scene of its own (see src/dusk): the scene's camera looks at it, the flock's
 * box sits at `center` in the scene, `scale` scene units to one flock unit, and it is mirrored in
 * water at height `water`. Vectors in scene units; `fov` vertical, in radians.
 */
export interface Placement {
	eye: [number, number, number];
	target: [number, number, number];
	fov: number;
	center: [number, number, number];
	scale: number;
	water: number;
}

const hexColor = (hex: string, intensity: number): [number, number, number, number] => {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	return [r, g, b, intensity];
};

/** A value the flock reads every frame: a getter (a signal, say), or a value that holds. */
type Input<T> = T | (() => T);
const read = <T>(input: Input<T>): T => (typeof input === 'function' ? (input as () => T)() : input);

/**
 * Runs the flock on `canvas` until disposed. What it is told it reads every frame, so it follows
 * whoever drives it: its settings (`params`), how far to fly (`travel`: 0 in front of the flock, 1
 * at PAST beyond its middle, and on at that rate, see `flight` in params), and whether it is set into
 * a scene (`placed`). What it knows it gives back as signals. The loader is driven by commands:
 * `gather` draws the flock into the ring, `progress` fills it (0 to 1; the ring spins once full),
 * `release` lets it burst out. With `held`, it starts as the ring. Throws if there is no WebGPU.
 */
export async function startBoids(
	canvas: HTMLCanvasElement,
	input: Input<Params>,
	{
		held = false,
		travel: travelInput = 0,
		placed: placedInput = null,
		device: shared,
		reflect = false
	}: {
		held?: boolean;
		travel?: Input<number>;
		/** Set into a scene instead of on its own: its camera, place and water. */
		placed?: Input<Placement | null>;
		/** Run on this device rather than one of its own: the scene's, so they can share textures. */
		device?: GPUDevice;
		/** Placed, draw the flock's mirror image into a texture (`reflection`) rather than on its
		 *  canvas, for the scene's water to sample, rippled. */
		reflect?: boolean;
	} = {}
) {
	let params = read(input);
	if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
	let device = shared;
	if (!device) {
		const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
		if (!adapter) throw new Error('No WebGPU adapter found.');
		const timing = adapter.features.has('timestamp-query');
		device = await adapter.requestDevice({ requiredFeatures: timing ? ['timestamp-query'] : [] });
		device.lost.then((info) => console.error('WebGPU device lost:', info.message));
		device.addEventListener('uncapturederror', (e) => console.error((e as GPUUncapturedErrorEvent).error.message));
	}
	const timing = device.features.has('timestamp-query');

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
		renderer.resize(w, h, reflect);
		if (reflect) setReflection(renderer.reflection);
	};
	let size = [0, 0];
	// What it gives back.
	const [reflection, setReflection] = createSignal<GPUTexture | null>(null, { name: 'reflection' });
	const [flown, setFlown] = createSignal(0, { name: 'flown' });
	const [stats, setStats] = createSignal<Stats | null>(null, { name: 'stats' });
	const watcher = new ResizeObserver(resize);
	watcher.observe(canvas);
	resize();

	// Pointer, in normalized device coordinates. `look` trails it for a slow camera parallax.
	const pointer = { x: 0, y: 0, on: false };
	const look = { x: 0, y: 0 };
	const lastPointer = { x: 0, y: 0 };
	const pointerVel: [number, number] = [0, 0];
	// On the window, not the canvas: on a page the canvas lies behind the content.
	const move = (e: PointerEvent) => {
		const r = canvas.getBoundingClientRect();
		pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
		pointer.y = 1 - ((e.clientY - r.top) / r.height) * 2;
		if (!pointer.on) Object.assign(lastPointer, { x: pointer.x, y: pointer.y });
		pointer.on = true;
	};
	const leave = () => (pointer.on = false);
	window.addEventListener('pointermove', move);
	document.documentElement.addEventListener('pointerleave', leave);

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
	// Where the surges running round the ring are (radians of their wave): it runs ahead ever faster
	// as the ring fills and then draws in, so they end up racing round it.
	let surgePhase = 0;
	let full = 0;
	// The burst spreads the boids thin: too thin to glow by their crowding (see glowFrom), and over so
	// much more of the screen that the light, which adds up, thins out too. So for a while everyone
	// glows regardless, and brighter (AFTERGLOW_GAIN ×): fully for GLOW_HOLD ms, then fading back
	// over GLOW_FADE, as the flock draws together again.
	const GLOW_HOLD = 1000;
	const GLOW_FADE = 1500;
	const AFTERGLOW_GAIN = 2.5;
	let burstAt: number | null = null;
	let afterglow = 0;

	// The first flight, through the flock to the first stop (travel 0 to 1), takes its own time however
	// quick the page snaps there: it speeds up gently (ACCEL, in travel a second, each second), and
	// near the end it may go no faster than LAND × (how far is left)^0.6, so it slows as it arrives,
	// the braking itself easing off to nothing: a soft landing, without a constant brake's sudden stop
	// or a spring's long creep. About a second all told. Past it, the camera keeps up with the scroll
	// closely.
	const ACCEL = 2.5;
	const LAND = 2.2;
	let travel = 0;
	let travelSpeed = 0;

	let frame = 0;
	let last = performance.now();
	let fps = 60;
	// The flock's own clock: `tempo` slows everything it does alike, so its shape survives.
	let simTime = 0;

	const loop = (now: number) => {
		params = read(input);
		const placed = read(placedInput);
		const travelTo = Math.max(read(travelInput), 0);
		resize();
		const dt = Math.min((now - last) / 1000, 1 / 30);
		last = now;
		if (dt > 0) fps += (1 / dt - fps) * 0.05;
		const time = now / 1000;
		const simDt = dt * params.tempo;
		simTime += simDt;

		hold += (holdTo - hold) * (1 - Math.exp(-dt * (holdTo > hold ? 2 : 8)));
		if (hold < 0.002) hold = 0;
		// Full, it turns: starting as it settles (see `full`), not all at once.
		ringAngle += params.ringSpin * simDt * full;
		if (burstAt !== null) {
			const k = Math.min(Math.max((now - burstAt - GLOW_HOLD) / GLOW_FADE, 0), 1);
			afterglow = 1 - k * k * (3 - 2 * k);
			if (k >= 1) burstAt = null;
		}
		{
			// Up to about 60 radians a second at the end: faster, and with three of them the knots
			// would jump further than a third of their spacing a frame and seem to stand or reverse.
			const squeeze = tensing !== null ? Math.min((now - tensing) / TENSE, 1) : 0;
			// Drawing in, they reach top speed halfway, while the ring is still big enough to see it, and
			// hold it as the ring shrinks.
			const rampUp = Math.min(squeeze / 0.5, 1);
			const speed = tensing !== null ? 9 + 51 * rampUp * rampUp * (3 - 2 * rampUp) : 1.6 + 7.4 * progress * progress;
			if (hold > 0) surgePhase += speed * dt;
			// Full, the ring settles over about half a second: the band drawing tight, the beat
			// stopping, the grip firming and the spin starting, all together and smoothly.
			full += ((progress >= 1 ? 1 : 0) - full) * (1 - Math.exp(-dt * 5));
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
		const goalTo = hold > 0 ? [0, 0, 0] : [Math.cos(goalAngle) * params.box[0] * 0.18, Math.sin(goalAngle) * params.box[1] * 0.18, 0];
		// The old site's goal jumped; this one glides there, about goalGlide seconds to get most of the way.
		vec3.lerp(goal, goalTo, params.goalGlide > 0 ? 1 - Math.exp(-simDt / params.goalGlide) : 1, goal);

		const aspect = canvas.width / canvas.height;
		// The flight goes on even while the flock is set into a scene, so the page's planes, which
		// are placed by it, are where they should be however the page got there.
		if (Math.max(travel, travelTo) <= 1.001) {
			const gap = travelTo - travel;
			const dir = Math.sign(gap);
			// Its speed toward where it is going (below 0 while it still moves the other way).
			const toward = Math.min(travelSpeed * dir + ACCEL * dt, LAND * Math.abs(gap) ** 0.6);
			travelSpeed = toward * dir;
			const step = travelSpeed * dt;
			// Arriving, it stops there rather than pass it.
			travel = Math.abs(step) >= Math.abs(gap) && toward > 0 ? travelTo : travel + step;
			if (travel === travelTo) travelSpeed = 0;
		} else {
			const was = travel;
			travel += (travelTo - travel) * (1 - Math.exp(-dt * 12));
			travelSpeed = dt > 0 ? (travel - was) / dt : 0;
		}
		const traveled = travel * (params.distance + PAST);
		setFlown(traveled);
		let camPos, viewMat, fov, flown;
		if (placed) {
			// The scene's camera, in the flock's own units.
			const toFlock = (p: [number, number, number]) => vec3.divScalar(vec3.sub(p, placed.center), placed.scale);
			camPos = toFlock(placed.eye);
			viewMat = mat4.lookAt(camPos, toFlock(placed.target), [0, 1, 0]);
			fov = placed.fov;
			flown = 0;
		} else {
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
			const ahead = vec3.normalize(vec3.negate(orbit));
			flown = traveled;
			camPos = vec3.addScaled(orbit, ahead, flown);
			viewMat = mat4.lookAt(camPos, vec3.add(camPos, ahead), [0, 1, 0]);
			fov = FOV;
		}
		const viewProj = mat4.multiply(mat4.perspective(fov, aspect, 10, 20000), viewMat);
		const camRight = vec3.create(viewMat[0], viewMat[4], viewMat[8]);
		const camUp = vec3.create(viewMat[1], viewMat[5], viewMat[9]);
		const tanHalfFov = Math.tan(fov / 2);
		// The flock's middle is this far off, for colouring by depth.
		const middle = vec3.length(camPos);
		const mouse: [number, number, number, number] = [lastPointer.x, lastPointer.y, pointer.x, pointer.y];
		if (dt > 0) {
			const k = 1 - Math.exp(-dt * 20);
			pointerVel[0] += ((pointer.x - lastPointer.x) / dt - pointerVel[0]) * k;
			pointerVel[1] += ((pointer.y - lastPointer.y) / dt - pointerVel[1]) * k;
		}
		Object.assign(lastPointer, { x: pointer.x, y: pointer.y });

		const dims = params.box.map((s) => Math.ceil(s / params.radius));
		if (flock.count !== params.count || dims.some((d, i) => d !== flock.dims[i])) {
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
			surgePhase,
			full,
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
			placed && params.mirror > 0 && !reflect ? flock.count * 2 : flock.count,
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
				depthNear: placed ? middle - params.box[2] / 2 : params.distance - flown - params.box[2] / 2,
				depthFar: placed ? middle + params.box[2] / 2 : params.distance - flown + params.box[2] / 2,
				mirrorY: placed ? (placed.water - placed.center[1]) / placed.scale : 0,
				mirror: placed ? params.mirror : 0,
				count: flock.count,
				ink: params.ink,
				inkColor: hexColor(params.inkColor, 1).slice(0, 3) as [number, number, number],
				// The old site faded by a fixed factor per frame; this is that factor at 60 fps.
				fade: params.fade ** (dt * 60),
				cut: params.cut * dt * 60,
				gain: params.gain,
				bloom: params.bloom,
				bloomRadius: params.bloomRadius,
				saturation: params.saturation,
				background: hexColor(params.background, 1).slice(0, 3) as [number, number, number],
				horizon: placed ? 0 : params.horizon,
				time
			},
			timer
		);
		timer?.resolve(encoder);
		device.queue.submit([encoder.finish()]);
		timer?.read();

		burst = 0;
		if (frame % 10 === 0) {
			setStats({ fps, gpu: timer?.ms ?? null, count: flock.count, cells: flock.cells, dims: flock.dims });
		}
		frame++;
		frameId = requestAnimationFrame(loop);
	};
	let frameId = requestAnimationFrame(loop);

	return {
		/** How far the camera has flown toward and past the flock, in world units. */
		flown,
		/** The flock's mirror image (with `reflect`), new whenever the canvas changes size. */
		reflection,
		/** Frames a second, GPU time per pass and the like, a few times a second. */
		stats,
		gather: () => {
			holdTo = 1;
		},
		progress: (p: number) => {
			progress = Math.min(Math.max(p, 0), 1);
			if (progress < 1) ringAngle = 0;
		},
		release: () => {
			if (holdTo === 0 || tensing !== null) return;
			tensing = performance.now();
		},
		/** Stops it and lets go of what it holds on the GPU. */
		dispose: () => {
			cancelAnimationFrame(frameId);
			watcher.disconnect();
			window.removeEventListener('pointermove', move);
			document.documentElement.removeEventListener('pointerleave', leave);
			flock.destroy();
		}
	};
}
