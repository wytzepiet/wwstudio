import { createSignal, untrack } from 'solid-js';
import { createFrame } from './frame';

/**
 * A value that follows `target` on a critically damped spring: it eases in and out, never
 * overshoots, and is nearly there in about 5 / `rate` seconds. While `jump` is true it is at the
 * target at once. `set` puts it somewhere at once.
 */
export function createSpring(target: () => number, rate: number, { initial = 0, jump }: { initial?: number; jump?: () => boolean } = {}) {
	const [value, setValue] = createSignal(initial, { name: 'spring' });
	let at = initial;
	let speed = 0;
	createFrame((dt) => {
		const to = untrack(target);
		if (Math.abs(to - at) < 1e-5 && Math.abs(speed) < 1e-5) return;
		if (jump && untrack(jump)) {
			at = to;
			speed = 0;
			setValue(at);
			return;
		}
		speed += (rate * rate * (to - at) - 2 * rate * speed) * dt;
		at += speed * dt;
		setValue(at);
	});
	const set = (v: number) => {
		at = v;
		speed = 0;
		setValue(v);
	};
	return [value, set] as const;
}
