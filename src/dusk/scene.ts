import {
	addToScene,
	createEngine,
	createFreeCamera,
	createMeshFromData,
	createSceneContext,
	disposeEngine,
	createShaderMaterial,
	createSphere,
	createTexture2DFromExternalImage,
	createTexture2DFromPixels,
	onBeforeRender,
	registerScene,
	setShaderFloat,
	setShaderTexture,
	setShaderUniform,
	setShaderVector3,
	startEngine,
	stopEngine,
	vec3,
	type ShaderMaterial,
	type Texture2D,
	type ShaderUniformOption
} from '@babylonjs/lite';
import common from './shaders/common.wgsl?raw';
import skyCode from './shaders/sky.wgsl?raw';
import waterCode from './shaders/water.wgsl?raw';
import shoreCode from './shaders/shore.wgsl?raw';
import labelCode from './shaders/label.wgsl?raw';
import sceneryCode from './shaders/scenery.wgsl?raw';
import { createSignal } from 'solid-js';
import { mat4, vec3 as v3 } from 'wgpu-matrix';
import { PALETTE, stopsUniforms, type Stop } from './palettes';
import { EYE, TARGET, FOV } from './placement';

export { placement, box } from './placement';

type Vec3 = [number, number, number] | Float32Array;

/** A value the scene reads every frame: a getter (a signal, say), or a value that holds. */
type Input<T> = T | (() => T);
const read = <T>(input: Input<T>): T => (typeof input === 'function' ? (input as () => T)() : input);

/** What the scene is told. All but the email are read every frame, so it follows whoever drives it. */
export interface Dusk {
	/** What rises out of the water. */
	email: string;
	/** Where the sun is: degrees round from straight ahead (positive right), and above the horizon. */
	sun?: Input<{ azimuth: number; elevation: number }>;
	exposure?: Input<number>;
	/** How bright the stars are, apart from the exposure: they can be out while all else is black. */
	stars?: Input<number>;
	/** The sky's colours (see palettes.ts). */
	palette?: Input<Stop[]>;
	/** Where the camera is: from eye, looking at target. On the dike, by default. */
	camera?: Input<{ eye: Vec3; target: Vec3 }>;
	/** Whether it draws at all (stopped, it costs nothing). */
	running?: Input<boolean>;
	/** Whether the email is up: it rises when this turns true, and sinks back at once when false. */
	up?: Input<boolean>;
	/** The flock's mirror image (see boids/app), for the water, and how it reads it: the flock's
	 *  gain, and the colour of its ink. */
	reflection?: Input<GPUTexture | null | undefined>;
	ink?: Input<{ gain: number; color: Vec3 }>;
}

/** Where the email is on screen, in CSS pixels of the canvas, and whether any of it is up. */
export interface EmailRect {
	left: number;
	top: number;
	width: number;
	height: number;
	visible: boolean;
}

/** The email's board: its plane LABEL_Z out, LABEL_W wide, its letters LABEL_H tall, in metres. Each
 *  letter rises from SUNK below the water to FLOAT above it over RISE seconds, STAGGER after the one
 *  before (at most 16 letters), and then bobs. RING_DELAY after a letter breaks the surface, a ring
 *  goes out from it. */
const LABEL_Z = -14;
const LABEL_W = 12;
const LABEL_H = 1.5;
const SUNK = -LABEL_H - 0.4;
/** The text's baseline lies this far up the canvas (see below), so a letter afloat has its foot
 *  this much under the water and its baseline just on it. */
const BASELINE = 190 / 256;
const FLOAT = -(1 - BASELINE) * LABEL_H + 0.04;
/** Afloat, a letter lies lower by this much of a dot's size, and a tall one (past the x-height) lower
 *  by this much of what it stands above it: the more there is of a letter, the deeper it sits. */
const DOT_SINK = 0.75;
const TALL_SINK = 0.3;
const RISE = 1.8;
const STAGGER = 0.08;
const RING_DELAY = 0.35;
const MAX_LETTERS = 16;
/** The dock: once up, letters near the pointer lift LIFT metres, about clear of the water, the nearest
 *  most; how near counts is DOCK_REACH of the email's width either side. They go up and come down
 *  on a springy spring (DOCK_SPRING its rate), and where one leaves or meets the water, a ring. */
const LIFT = 0.45;
const DOCK_REACH = 0.08;
const DOCK_SPRING = 14;
/** How far the night drifts with the pointer, at most, in radians (its nearest stars). */
const DRIFT = 0.025;

/** The far shore runs along z = SHORE_Z (as in shaders/common.wgsl). */
const SHORE_Z = -700;


/**
 * A Frisian lake at dusk, drawn with Babylon Lite: the sky, the water mirroring it, and the far
 * shore's trees, farm and church against the glow. Everything is made in code; the shaders share
 * their sky and shore so the water reflects them exactly. The camera looks up a little, leaving
 * the sky for the flock.
 */
export async function startDusk(canvas: HTMLCanvasElement, settings: Dusk, { paused = false } = {}) {
	const { sun: sunInput = { azimuth: 18, elevation: -1.2 }, exposure = 1, stars = 1, palette: paletteInput = PALETTE } = settings;
	const { camera: cameraInput = { eye: EYE, target: TARGET }, running: runningInput = true, up: upInput, reflection, ink } = settings;
	const engine = await createEngine(canvas, { maxDevicePixelRatio: 2, msaaSamples: 4 });
	const scene = createSceneContext(engine);
	const device = (engine as unknown as { _device: GPUDevice })._device;
	const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
	scene.clearColor = { r: 0, g: 0, b: 0, a: 1 };

	const camera = createFreeCamera(vec3(...EYE), vec3(...TARGET));
	camera.fov = FOV;
	camera.nearPlane = 0.1;
	camera.farPlane = 5000;
	addToScene(scene, camera);

	const shared: ShaderUniformOption[] = [
		{ name: 'sunDir', type: 'vec3<f32>', defaultValue: [0, 0, -1] },
		{ name: 'time', type: 'f32', defaultValue: 0 },
		{ name: 'exposure', type: 'f32', defaultValue: 1 },
		{ name: 'stars', type: 'f32', defaultValue: 1 },
		{ name: 'drift', type: 'vec2<f32>', defaultValue: [0, 0] },
		...stopsUniforms(PALETTE).map((defaultValue, i) => ({ name: `skyStops${i}`, type: 'mat4x4<f32>', defaultValue }) as ShaderUniformOption),
		{ name: 'label', type: 'vec4<f32>', defaultValue: [LABEL_Z, LABEL_W / 2, LABEL_H, SUNK] },
		{ name: 'rings', type: 'vec4<f32>', defaultValue: [0, 0, 0, 0] },
		{ name: 'letterEdges', type: 'mat4x4<f32>', defaultValue: new Array(16).fill(2) },
		{ name: 'letterRises', type: 'mat4x4<f32>', defaultValue: new Array(16).fill(SUNK) },
		{ name: 'letterRings', type: 'mat4x4<f32>', defaultValue: new Array(16).fill(-1000) },
		{ name: 'letterCenters', type: 'mat4x4<f32>', defaultValue: new Array(16).fill(0) },
		{ name: 'letterTilts', type: 'mat4x4<f32>', defaultValue: new Array(16).fill(0) }
	];
	const material = (name: string, code: string, attributes: ('position' | 'uv')[], extra: Partial<Parameters<typeof createShaderMaterial>[0]> = {}) =>
		createShaderMaterial({
			name,
			vertexSource: common + code,
			fragmentSource: common + code,
			attributes,
			uniforms: ['world', 'viewProjection', 'cameraPosition', ...shared],
			...extra
		});

	// The sky: a sphere the shader keeps round the camera.
	const sky = createSphere(engine, { diameter: 2, segments: 32 });
	sky.material = material('sky', skyCode, ['position'], { backFaceCulling: false, depthWrite: false });
	addToScene(scene, sky);

	// The lake: one big flat square, reaching past the far shore.
	const L = 6000;
	const water = createMeshFromData(
		engine,
		'water',
		new Float32Array([-L, 0, -L, L, 0, -L, L, 0, L, -L, 0, L]),
		new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
		new Uint32Array([0, 2, 1, 0, 3, 2])
	);
	const waterMaterial = material('water', waterCode, ['position'], {
		backFaceCulling: false,
		uniforms: [
			'world',
			'viewProjection',
			'cameraPosition',
			'screenSize',
			...shared,
			{ name: 'ripple', type: 'f32', defaultValue: 1.6 },
			{ name: 'flockGain', type: 'f32', defaultValue: 24 },
			{ name: 'inkColor', type: 'vec3<f32>', defaultValue: [0.02, 0.025, 0.05] }
		],
		samplers: ['reflection', 'labelText']
	});
	// Nothing to mirror until the flock draws its reflection (see `reflect`).
	setShaderTexture(waterMaterial, 'reflection', createTexture2DFromPixels(engine, new Uint8Array(4), 1, 1));
	water.material = waterMaterial;
	addToScene(scene, water);

	// The far shore: columns from under the water to a top the shader raises to shoreHeight.
	const COLUMNS = 4000;
	const WIDTH = 8000;
	const shorePos = new Float32Array(COLUMNS * 6);
	const shoreIdx = new Uint32Array((COLUMNS - 1) * 6);
	for (let i = 0; i < COLUMNS; i++) {
		const x = -WIDTH / 2 + (i / (COLUMNS - 1)) * WIDTH;
		shorePos.set([x, -2, 0, x, 1, 0], i * 6);
		if (i < COLUMNS - 1) {
			const a = i * 2;
			shoreIdx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
		}
	}
	const shore = createMeshFromData(engine, 'shore', shorePos, new Float32Array(COLUMNS * 6).fill(0), shoreIdx);
	shore.material = material('shore', shoreCode, ['position'], { backFaceCulling: false });
	addToScene(scene, shore);

	// What stands on the land past the shore (scenery.wgsl), seen on the way down: rows of trees,
	// farms, and villages with their churches, each a cut-out quad. Placed at random, but the same
	// every time, and not in the lakes out there (water.wgsl's `lakes`).
	const sceneryMaterial = (() => {
		let seed = 7;
		const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		const between = (a: number, b: number) => a + (b - a) * random();
		const lakes = [
			[450, -2300, 1100, 420],
			[-1100, -4300, 1700, 650]
		];
		const dry = (x: number, z: number) => lakes.every(([lx, lz, w, d]) => ((x - lx) / w) ** 2 + ((z - lz) / d) ** 2 > 1.4);
		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];
		const KIND = { tree: 0, house: 1, barn: 2, church: 3 };
		const put = (kind: number, x: number, z: number, w: number, h: number) => {
			if (z > SHORE_Z - 20 || !dry(x, z)) return;
			const n = positions.length / 3;
			positions.push(x - w / 2, 0, z, x + w / 2, 0, z, x + w / 2, h, z, x - w / 2, h, z);
			uvs.push(kind * 2, 0, kind * 2 + 1, 0, kind * 2 + 1, 1, kind * 2, 1);
			indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
		};
		const tree = (x: number, z: number) => put(KIND.tree, x, z, between(6, 10), between(8, 14));
		const far = () => between(SHORE_Z - 60, -5800);
		// Rows of trees along the fields.
		for (let r = 0; r < 140; r++) {
			const [x0, z] = [between(-4500, 4500), far()];
			const length = between(60, 420);
			for (let x = x0; x < x0 + length; x += between(6, 10)) tree(x, z + between(-2, 2));
		}
		// Farms: a barn, the house beside it, trees about the yard.
		for (let f = 0; f < 90; f++) {
			const [x, z] = [between(-4500, 4500), far()];
			put(KIND.barn, x, z, between(20, 30), between(9, 12));
			put(KIND.house, x + between(16, 24), z + between(4, 10), between(8, 11), between(8, 10));
			for (let t = 0; t < 8; t++) tree(x + between(-30, 40), z + between(-25, 15));
		}
		// Villages: houses round a church, and their trees.
		for (const [vx, vz] of [
			[-1500, -1900],
			[1900, -3300],
			[200, -5200]
		]) {
			put(KIND.church, vx, vz - 20, 16, between(32, 40));
			for (let h = 0; h < 45; h++) put(KIND.house, vx + between(-160, 160), vz + between(-120, 60), between(8, 12), between(7, 10));
			for (let t = 0; t < 40; t++) tree(vx + between(-200, 200), vz + between(-150, 80));
		}
		const scenery = createMeshFromData(
			engine,
			'scenery',
			new Float32Array(positions),
			new Float32Array(positions.length).fill(0),
			new Uint32Array(indices),
			new Float32Array(uvs)
		);
		scenery.material = material('scenery', sceneryCode, ['position', 'uv'], { backFaceCulling: false });
		addToScene(scene, scenery);
		return scenery.material as ShaderMaterial;
	})();

	// The email: drawn on a canvas in the page's own font, on a board standing in the lake.
	const text = document.createElement('canvas');
	text.width = 2048;
	text.height = 256;
	const ctx = text.getContext('2d')!;
	ctx.font = "600 150px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#fff';
	const email = [...settings.email].slice(0, MAX_LETTERS);
	ctx.fillText(email.join(''), text.width / 2, text.height * BASELINE);
	const labelTexture = await createTexture2DFromExternalImage(engine, text);
	setShaderTexture(waterMaterial, 'labelText', labelTexture);
	const hw = LABEL_W / 2;
	// Where each letter lies along the board (u), measured as the canvas set it, and its middle in x.
	const total = ctx.measureText(email.join('')).width;
	const left = (i: number) => (text.width / 2 - total / 2 + ctx.measureText(email.slice(0, i).join('')).width) / text.width;
	const edges = new Array(16).fill(2);
	const centers = new Array(16).fill(0);
	email.forEach((_, i) => {
		edges[i] = left(i);
		const u = (left(i) + left(i + 1)) / 2;
		centers[i] = (1 - u) * LABEL_W - hw;
	});
	edges[0] = 0; // the first letter's cut reaches the board's edge
	// How high each letter floats: lower by a little of a dot, and tall ones lower still.
	const metres = (px: number) => (px / text.height) * LABEL_H;
	const measure = (s: string) => ctx.measureText(s);
	const dot = measure('.');
	const xHeight = measure('x').actualBoundingBoxAscent;
	const floats = email.map(
		(c) => FLOAT - DOT_SINK * metres(dot.actualBoundingBoxAscent + dot.actualBoundingBoxDescent) - TALL_SINK * metres(Math.max(measure(c).actualBoundingBoxAscent - xHeight, 0))
	);
	// Each letter comes up turned a little, one way or the other, rights itself and then rocks.
	const random = (x: number) => (((Math.sin(x) * 43758.5453) % 1) + 1) % 1;
	const kicks = email.map((_, i) => (i % 2 ? 1 : -1) * (0.12 + 0.1 * random(i * 12.9898)));
	const rocks = email.map((_, i) => 0.03 + 0.03 * random(i * 78.233));
	// One board, tall enough for every letter at every height it takes.
	const bottom = SUNK;
	const top = FLOAT + LABEL_H + 0.4;
	const board = createMeshFromData(
		engine,
		'label',
		new Float32Array([-hw, bottom, LABEL_Z, hw, bottom, LABEL_Z, hw, top, LABEL_Z, -hw, top, LABEL_Z]),
		new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
		new Uint32Array([0, 1, 2, 0, 2, 3])
	);
	const labelMaterial = material('label', labelCode, ['position'], {
		backFaceCulling: false,
		needAlphaBlending: true,
		depthWrite: false,
		depthCompare: 'always',
		samplers: ['labelText']
	});
	setShaderTexture(labelMaterial, 'labelText', labelTexture);
	board.material = labelMaterial;
	addToScene(scene, board);

	// Where the camera is (see `camera`).
	const eye = v3.clone(EYE);
	const target = v3.clone(TARGET);

	// The pointer, in CSS pixels of the canvas, for the dock.
	const pointer = { x: 0, y: 0, on: false };
	const move = (e: PointerEvent) => {
		const r = canvas.getBoundingClientRect();
		Object.assign(pointer, { x: e.clientX - r.left, y: e.clientY - r.top, on: true });
	};
	const leave = () => (pointer.on = false);
	addEventListener('pointermove', move);
	document.documentElement.addEventListener('pointerleave', leave);
	const lifts = new Array(16).fill(0);
	const liftSpeeds = new Array(16).fill(0);

	// The letters' rise: each from under the water, out and over the top a little, then bobbing.
	let risenAt: number | null = null;
	const rises = new Array(16).fill(SUNK);
	const ringsAt = new Array(16).fill(-1000);
	const tilts = new Array(16).fill(0);

	const materials = [sky.material, water.material, shore.material, labelMaterial, sceneryMaterial] as ShaderMaterial[];
	const start = performance.now();
	let last = 0;
	// The night drifts a little with the pointer (see the sky's `drift`), slowly following it.
	const drift = [0, 0];
	let mirrored: GPUTexture | null = null;
	onBeforeRender(scene, () => {
		const now = (performance.now() - start) / 1000;
		const view = read(cameraInput);
		v3.copy(view.eye, eye);
		v3.copy(view.target, target);
		camera.position.set(eye[0], eye[1], eye[2]);
		camera.target.set(target[0], target[1], target[2]);
		const texture = reflection ? read(reflection) : null;
		if (texture && texture !== mirrored) {
			mirrored = texture;
			setShaderTexture(waterMaterial, 'reflection', { texture, view: texture.createView(), sampler, width: texture.width, height: texture.height } as Texture2D);
		}
		if (ink) {
			const { gain, color } = read(ink);
			setShaderFloat(waterMaterial, 'flockGain', gain);
			setShaderVector3(waterMaterial, 'inkColor', [color[0], color[1], color[2]]);
		}
		const palette = stopsUniforms(read(paletteInput));
		const dt = Math.min(Math.max(now - last, 0), 1 / 20);
		last = now;
		const toward = pointer.on ? [(pointer.x / canvas.clientWidth) * 2 - 1, 1 - (pointer.y / canvas.clientHeight) * 2] : [0, 0];
		for (const i of [0, 1]) drift[i] += (toward[i] * DRIFT - drift[i]) * (1 - Math.exp(-dt * 2));
		if (risenAt !== null) {
			// Where the letters are on screen, for the dock.
			const [w, h] = [canvas.clientWidth, canvas.clientHeight];
			const project = mat4.multiply(mat4.perspective(FOV, w / h, 0.1, 5000), mat4.lookAt(eye, target, [0, 1, 0]));
			// (This projection is right-handed, Babylon's left-handed: the world's x is mirrored.)
			const screen = (x: number, y: number) => {
				const p = v3.transformMat4([-x, y, LABEL_Z], project);
				return [((p[0] + 1) / 2) * w, ((1 - p[1]) / 2) * h];
			};
			const reach = Math.abs(screen(hw, 0)[0] - screen(-hw, 0)[0]) * DOCK_REACH;
			email.forEach((_, i) => {
				const since = now - risenAt! - i * STAGGER;
				const k = Math.min(Math.max(since / RISE, 0), 1);
				const back = 1.4; // a little past, and settling back: buoyancy
				const eased = 1 + (back + 1) * (k - 1) ** 3 + back * (k - 1) ** 2;
				const was = rises[i];
				// The bob comes in slowly over the end of the rise, so the one runs into the other.
				const e = Math.min(Math.max((since - RISE * 0.6) / (RISE * 1.2), 0), 1);
				const bob = 0.05 * Math.sin(now * 1.4 + i * 0.5) * e * e * (3 - 2 * e);
				// The dock: how near the pointer is, across and (past the letter's top or foot) up or down.
				const [x, foot] = screen(centers[i], 0);
				const [, head] = screen(centers[i], LABEL_H);
				const dx = (pointer.x - x) / reach;
				const dy = Math.max(head - pointer.y, pointer.y - foot, 0) / (foot - head);
				const near = pointer.on && since > RISE ? Math.exp(-dx * dx - 4 * dy * dy) : 0;
				liftSpeeds[i] += (DOCK_SPRING ** 2 * (near * LIFT - lifts[i]) - 0.9 * DOCK_SPRING * liftSpeeds[i]) * dt;
				lifts[i] += liftSpeeds[i] * dt;
				rises[i] = SUNK + (floats[i] - SUNK) * eased + bob + lifts[i];
				// Out of the water, or back in: a ring.
				if (since > RISE && was < 0 !== rises[i] < 0) ringsAt[i] = now;
				const t = Math.max(since, 0);
				tilts[i] = kicks[i] * Math.exp(-t * 0.9) * Math.cos(t * 2.6) + rocks[i] * Math.sin(now * 0.8 + i * 1.3) * (1 - Math.exp(-t));
				// A beat after the letter breaks the surface, as the water takes a moment to answer.
				if (was + LABEL_H < 0 && rises[i] + LABEL_H >= 0) ringsAt[i] = now + RING_DELAY;
			});
		}
		const at = read(sunInput);
		const az = (at.azimuth * Math.PI) / 180;
		const el = (at.elevation * Math.PI) / 180;
		const sun: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
		for (const m of materials) {
			setShaderVector3(m, 'sunDir', sun);
			setShaderFloat(m, 'time', now);
			setShaderFloat(m, 'exposure', read(exposure));
			setShaderFloat(m, 'stars', read(stars));
			setShaderUniform(m, 'drift', drift);
			palette.forEach((stops, i) => setShaderUniform(m, `skyStops${i}`, stops));
			setShaderUniform(m, 'label', [LABEL_Z, hw, LABEL_H, email.length]);
			setShaderUniform(m, 'rings', [(1 - BASELINE) * LABEL_H, 0.25, 0, 0]);
			setShaderUniform(m, 'letterEdges', edges);
			setShaderUniform(m, 'letterRises', rises);
			setShaderUniform(m, 'letterRings', ringsAt);
			setShaderUniform(m, 'letterCenters', centers);
			setShaderUniform(m, 'letterTilts', tilts);
		}
	});

	await registerScene(scene);
	await startEngine(engine);
	// Paused, it still draws one frame first, so all is ready (shaders made) by the time it runs.
	let running = true;
	if (paused) {
		await new Promise(requestAnimationFrame);
		stopEngine(engine);
		running = false;
	}

	// The email rises when told to and sinks when not; drawing starts and stops when told to; and
	// where the email is on screen is told back. Read every frame, running or not.
	const sink = () => {
		risenAt = null;
		lifts.fill(0);
		liftSpeeds.fill(0);
		rises.fill(SUNK);
		ringsAt.fill(-1000);
	};
	const surface = () => {
		risenAt = (performance.now() - start) / 1000;
		rises.fill(SUNK);
		ringsAt.fill(-1000);
	};
	const [emailRect, setEmailRect] = createSignal<EmailRect | null>(null, { name: 'emailRect' });
	let wasUp = false;
	let watching = requestAnimationFrame(function watch() {
		const on = read(runningInput);
		if (on !== running) {
			running = on;
			if (on) startEngine(engine);
			else stopEngine(engine);
		}
		if (upInput !== undefined) {
			const up = read(upInput);
			if (up && !wasUp) surface();
			if (!up && wasUp) sink();
			wasUp = up;
		}
		setEmailRect((was) => {
			const next = placeEmail(read(cameraInput));
			return was && Object.keys(next).every((k) => was[k as keyof EmailRect] === next[k as keyof EmailRect]) ? was : next;
		});
		watching = requestAnimationFrame(watch);
	});
	/** Where the email is on screen, seen from the camera. */
	const placeEmail = (view: { eye: Vec3; target: Vec3 }): EmailRect => {
		const [width, height] = [canvas.clientWidth, canvas.clientHeight];
		const project = mat4.multiply(mat4.perspective(FOV, width / height, 0.1, 5000), mat4.lookAt(view.eye, view.target, [0, 1, 0]));
		const at = (x: number, y: number) => {
			const p = v3.transformMat4([x, y, LABEL_Z], project);
			return [Math.round(((p[0] + 1) / 2) * width), Math.round(((1 - p[1]) / 2) * height)];
		};
		const [x0, y0] = at(-hw, FLOAT + LABEL_H);
		const [x1, y1] = at(hw, FLOAT);
		return { left: x0, top: y0, width: x1 - x0, height: y1 - y0, visible: rises.some((r) => r + LABEL_H > 0) };
	};

	return {
		/** The GPU device the scene draws with, for the flock to share. */
		device,
		/** Where the email is on screen (a signal). */
		emailRect,
		/** Let the email rise out of the water (again), whatever `up` says. */
		surface,
		/** Stops it and lets go of the GPU. */
		dispose() {
			cancelAnimationFrame(watching);
			removeEventListener('pointermove', move);
			document.documentElement.removeEventListener('pointerleave', leave);
			stopEngine(engine);
			disposeEngine(engine);
		}
	};
}
