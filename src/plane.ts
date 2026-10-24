import { createMemo } from 'solid-js';
import { defaults } from './boids/params';
import type { StageValue } from './stage';

const D = defaults.distance; // the camera's distance from the flock's middle, at rest
const clamp = (x: number) => Math.min(Math.max(x, 0), 1);

export interface PlaneOptions {
	/** World units from the flock's middle toward the camera; behind it (negative), the boids fly
	 *  in front of it. */
	depth: number;
	/** World units from the camera where it shows at its laid-out size (by default, where it starts). */
	at?: number;
	/** It fades in from this many D away (3 by default). */
	fade?: number;
	/** Where the flight ends, it zooms out a little and fades over this many screens of scrolling,
	 *  as the page slides over it. */
	recede?: number;
}

/**
 * Places a plane of the page in the flock's space, so it moves exactly as the boids around it do.
 *
 * The camera has a 60° view, so CSS's perspective (the eye's distance from the screen) is 0.866
 * screen heights, and stands for D world units. A plane at depth w is translated (flown + w) toward
 * the eye, which makes it look D / (D - flown - w) its size; scaled by at / D first, it is its
 * laid-out size at `at` from the camera. It fades in from far away, and out as it nears the camera.
 */
export function createPlane(stage: StageValue, o: PlaneOptions) {
	const placed = createMemo(
		() => {
			const flown = stage.flown();
			const H = stage.viewport.height();
			const eye = H * 0.866;
			const at = o.at ?? D - o.depth;
			const dist = D - flown - o.depth;
			// Gone soon once passed: out as it comes nearer than where it rests, gone by 0.6 of that.
			const near = clamp((dist - 0.6 * at) / (0.35 * at));
			// In from `fade` × D, fully by 0.8 D nearer.
			const far = clamp(((o.fade ?? 3) * D - dist) / (0.8 * D));
			const recede = o.recede ? clamp((stage.viewport.scroll() / H - stage.flightEnd) / o.recede) : 0;
			return {
				seen: near * far * (1 - recede),
				transform: `perspective(${eye.toFixed(2)}px) translateZ(${((flown + o.depth) * (eye / D)).toFixed(2)}px) scale(${((at / D) * (1 - 0.12 * recede)).toFixed(4)})`
			};
		},
		{ name: 'plane' }
	);
	/** How much it is seen, 0 to 1. */
	const seen = () => placed().seen;
	return {
		style: () => ({
			transform: placed().transform,
			// Either side of the flock's canvas (1).
			'z-index': o.depth < 0 ? 0 : 2,
			opacity: seen(),
			// While the loader runs, only it is seen.
			visibility: stage.released() && seen() > 0.001 ? ('visible' as const) : ('hidden' as const)
		}),
		/** Only what you are reading can be clicked or selected, not the faint ones about it. */
		inert: () => seen() < 0.5,
		/** Its title is in once it is mostly there, and out again once it has nearly gone. */
		shown: createMemo<boolean>((was) => (seen() > 0.6 ? true : seen() < 0.05 ? false : !!was), { name: 'planeShown' })
	};
}
