import { createSignal, onSettled } from 'solid-js';

/**
 * Calls `tick` every animation frame, with the seconds since the last one (at most 1/20, so a
 * stalled tab doesn't jump) and the frame's time in ms, for as long as its owner lives. Browser
 * only: it starts once the owner has settled. The frame is an outside source, like an event: what
 * `tick` writes is written from there.
 */
export function createFrame(tick: (dt: number, now: number) => void) {
	onSettled(() => {
		let last = performance.now();
		let id = requestAnimationFrame(function frame(now) {
			const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20);
			last = now;
			tick(dt, now);
			id = requestAnimationFrame(frame);
		});
		return () => cancelAnimationFrame(id);
	});
}

/** The time in ms (performance.now), as a signal that moves every frame. 0 on the server. */
export function createClock() {
	const [now, setNow] = createSignal(0, { name: 'clock' });
	createFrame((_, t) => setNow(t));
	return now;
}
