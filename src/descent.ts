import { createEffect, createMemo } from 'solid-js';
import { box, placement } from './dusk/placement';
import { createSpring } from './lib/spring';
import type { StageBase } from './stage';

/** The camera's way down: from HIGH metres to the dike, and as it comes, tilting down from TILT
 *  radians more up than it looks there, so the horizon comes up the screen a little. */
const HIGH = 150;
const TILT = 0.04;
/** On "Still here?", the camera looks up this much more, so the night fills the frame; it lowers
 *  its gaze over the first LOWER of the way down, settling slowly onto the horizon. */
const STARGAZE = 0.5;
const LOWER = 0.85;
/** The way down follows the scroll on a spring, so however fast the page gets there it takes its
 *  time (nearly there in about 5 / DESCEND seconds), easing in and out. */
const DESCEND = 1.2;
/** The scene is framed as the site frames its pictures (a work panel, see Work.css): it shows first
 *  at the panel's size and place, and opens out on the way down until a thin margin of the page is
 *  all that is left round it. */
export const RADIUS = 28;
const [, LOW] = placement.eye;
const LOOK_UP = Math.atan2(placement.target[1] - LOW, -placement.target[2]);

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Eases in, and out over a long, soft tail. */
const settle = (x: number) => 1 - (1 - smooth(x)) ** 2.5;
const ink = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
type Vec3 = [number, number, number];

/**
 * The end of the page: once "Still here?" is up, with the screen black, the flock is moved into
 * the dusk scene (it is dark against a sky still black, so the change can't be seen). Scrolling on,
 * the scene comes up out of the black as the camera comes down from among the birds to the dike:
 * the lake flattens to a strip, the shore rises to the horizon, and the flock ends up overhead.
 * Down, the email rises out of the water.
 *
 * All of it is derived from where the page is scrolled to; the effects only hand it to the engines.
 */
export function createDescent(stage: StageBase) {
	const { viewport } = stage;
	// The engines, once both run.
	const engines = createMemo(() => {
		const dusk = stage.dusk();
		const flock = stage.flock();
		return dusk && flock ? { dusk, flock } : null;
	}, { name: 'engines' });

	/** Where the line ("Still here?") and the lake's screen begin on the page. Layout, so read again
	 *  when the window changes (the elements are there once the page has settled). */
	const marks = createMemo(
		() => {
			viewport.width();
			viewport.height();
			const at = (el?: HTMLElement) => (el ? el.getBoundingClientRect().top + scrollY : Infinity);
			return { line: at(stage.el.boring), lake: at(stage.el.lake) };
		},
		{ name: 'marks' }
	);
	const inside = createMemo(() => !!engines() && viewport.scroll() > marks().line - viewport.height() * 0.5, { name: 'inside' });
	/** How far the page has scrolled from the line to the lake. */
	const toward = createMemo(() => clamp((viewport.scroll() - marks().line) / (marks().lake - marks().line)), { name: 'toward' });
	/** How far down the camera is (0 to 1). */
	const [down] = createSpring(() => (inside() ? toward() : 0), DESCEND);
	const p = createMemo(() => clamp(down()), { name: 'descent' });

	/** The first stars are out as the line comes up, before anything else. */
	const stars = createMemo(() => smooth(clamp((viewport.scroll() - marks().line) / (viewport.height() * 0.5) + 1)), { name: 'stars' });
	const exposure = createMemo(() => smooth(clamp(p() / 0.7)), { name: 'exposure' });
	const camera = createMemo(
		() => {
			const y = HIGH + (LOW - HIGH) * p();
			const pitch = LOOK_UP + TILT * (1 - p()) + STARGAZE * (1 - settle(clamp(p() / LOWER)));
			return { eye: [0, y, 0] as Vec3, target: [0, y + 100 * Math.tan(pitch), -100] as Vec3 };
		},
		{ name: 'camera' }
	);
	/** The frame, as insets from the window's edges. */
	const frame = createMemo(
		() => {
			const open = smooth(clamp(p() / 0.7));
			const w = viewport.width();
			const h = viewport.height();
			const pad = Math.min(Math.max(16, w * 0.05), 64);
			const panel = Math.min(w, 72 * 16) - 2 * pad;
			const margin = Math.min(Math.max(12, w * 0.015), 24);
			return {
				side: (w - panel) / 2 + (margin - (w - panel) / 2) * open,
				end: h * 0.09 + (margin - h * 0.09) * open
			};
		},
		{ name: 'frame' }
	);
	const clip = createMemo(() => `inset(${frame().end}px ${frame().side}px round ${RADIUS}px)`, { name: 'clip' });
	/** Has the email come up? Once it has, it stays up until the page leaves the scene. */
	const surfaced = createMemo<boolean>((was) => inside() && (!!was || p() > 0.97), { name: 'surfaced' });
	/** Where the email is on screen, for the link laid over it. */
	const emailRect = createMemo(
		() => {
			const dusk = stage.dusk();
			if (!dusk || !surfaced()) return null;
			return dusk.emailRect(viewport.width(), viewport.height(), camera().eye, camera().target);
		},
		{ name: 'emailRect' }
	);

	// The flock as it is on the page, and as dark birds against the sky (no bloom: as ink, a glow
	// would be a dark smudge round it), in the scene's place, seen by its camera.
	const page = { ...stage.params };
	const night = { ...stage.params, box, ink: 1, mirror: 0.6, bloom: 0, streak: 1, size: 1.9 };
	const placed = { ...placement, eye: [...placement.eye] as Vec3, target: [...placement.target] as Vec3 };

	createEffect(
		() => (engines() ? { ...engines()!, on: inside() } : null),
		(enter) => {
			if (!enter) return;
			const { dusk, flock, on } = enter;
			dusk.ink(night.gain, ink(night.inkColor));
			Object.assign(stage.params, on ? night : page);
			flock.place(on ? placed : null);
			dusk.run(on);
			if (!on) dusk.sink();
		},
		{ name: 'enterScene' }
	);
	createEffect(
		() => (engines() && inside() ? { dusk: engines()!.dusk, camera: camera(), exposure: exposure(), stars: stars() } : null),
		(view) => {
			if (!view) return;
			const { dusk } = view;
			placed.eye = view.camera.eye;
			placed.target = view.camera.target;
			dusk.look(view.camera.eye, view.camera.target);
			dusk.settings.exposure = view.exposure;
			dusk.settings.stars = view.stars;
		},
		{ name: 'aimCamera' }
	);
	createEffect(
		() => (surfaced() ? engines()?.dusk : null),
		(dusk) => {
			dusk?.surface();
		},
		{ name: 'surface' }
	);

	return {
		/** Whether the scene is on (and the page is at the end). */
		inside,
		/** How far down the camera is, 0 to 1. */
		p,
		/** The frame's insets and clip, for the scene, the flock and the frame's edge. */
		frame,
		clip,
		/** Dark birds against black still show a little: they come up with the scene. */
		birds: createMemo(() => clamp(exposure() * 2), { name: 'birdsOpacity' }),
		/** "Say hi sometime": in as the way down starts, dissolving near the bottom. */
		hi: createMemo(() => ({ in: p() > 0.02, out: p() > 0.68 }), { name: 'hi' }),
		surfaced,
		emailRect
	};
}
