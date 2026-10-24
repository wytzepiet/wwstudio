import { createContext, createMemo, createSignal } from 'solid-js';
import type { FlockControl } from './boids/app';
import { defaults, FLY, PAST, STEP } from './boids/params';
import { createDescent } from './descent';
import type { startDusk } from './dusk/scene';
import { createViewport } from './lib/viewport';

export type Scene = Awaited<ReturnType<typeof startDusk>>;

/**
 * What the home page's parts share: the flock and the dusk scene once they run, where the camera
 * is in its flight, the window, and the way down into the scene at the end. Made once per page (in
 * its component, so per request on the server).
 *
 * Its sources are written only from outside: the engines as they start, and the window's events.
 * Everything else on the page is derived from them, or from what the engines give back.
 */
export function createStage(flightEnd: number) {
	const base = createSources(flightEnd);
	return { ...base, descent: createDescent(base) };
}

/** The stage's sources, before what is derived from them. */
function createSources(flightEnd: number) {
	const [released, setReleased] = createSignal(false, { name: 'released' });
	const [flock, setFlock] = createSignal<FlockControl | null>(null, { name: 'flock' });
	/** The dusk scene: undefined until it has started (or failed to), null if it couldn't. */
	const [dusk, setDusk] = createSignal<Scene | null | undefined>(undefined, { name: 'dusk' });
	const viewport = createViewport();
	const D = defaults.distance;
	/** How far to fly, from the scroll: 0 in front of the flock, 1 at PAST beyond its middle (after
	 *  FLY screens), and on at STEP a screen, until the flight ends. */
	const travel = createMemo(
		() => {
			const s = Math.min(Math.max(viewport.scroll() / viewport.height(), 0), flightEnd);
			return s <= FLY ? s / FLY : 1 + ((s - FLY) * STEP) / (D + PAST);
		},
		{ name: 'travel' }
	);
	return {
		viewport,
		released,
		flock,
		dusk,
		travel,
		/** World units the camera has flown toward and past the flock's middle: where the flock's
		 *  camera is (it eases after the scroll), or without a flock, straight from the scroll. */
		flown: createMemo(() => flock()?.flown() ?? travel() * (D + PAST), { name: 'flown' }),
		/** Written by <Flock>, as the engines start and the loader lets go. */
		set: { released: setReleased, flock: setFlock, dusk: setDusk },
		/** The flock's settings on the page (see boids/params). */
		params: { ...defaults },
		/** Elements other parts need to reach, set by refs (not reactive: they are there once the
		 *  page has settled, which is when they are read). */
		el: {} as { dusk?: HTMLCanvasElement; boring?: HTMLElement; lake?: HTMLElement },
		/** Screens down where the flight ends and the page scrolls as pages do. */
		flightEnd
	};
}

export type StageBase = ReturnType<typeof createSources>;
export type StageValue = ReturnType<typeof createStage>;
export const Stage = createContext<StageValue>();
