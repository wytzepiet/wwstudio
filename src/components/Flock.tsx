import { createEffect, createSignal, onSettled, useContext } from 'solid-js';
import { startBoids } from '../boids/app';
import { EMAIL } from '../contact';
import { Stage } from '../stage';
import './Flock.css';

const FILL = 2600; // ms for the ring to fill, if the page is ready by then
const WAIT = 0.9; // where it waits until the page is
const BEAT = 350; // ms full before it bursts
/** While developing, every edit reloads the page: it then skips the loader and goes back to where
 *  it was, rather than starting over at the hero. (Not on the real site.) */
const RESUME_KEY = 'dev:scroll';

/**
 * The murmuration, full-screen behind the page, with the settings tuned in /sandbox. It opens as a
 * loader: a ring that fills to 100% and bursts into the flock. Without WebGPU there is no flock and
 * no loader, and the page is let go at once.
 *
 * It starts the engines and hands them to the stage: first the dusk scene of the page's end (paused,
 * on the canvas <Ending> left), so the flock can run on its GPU device, fly into that scene and be
 * mirrored in its lake; then the flock. Scrolling flies the flock's camera (see `travel`).
 */
export default function Flock() {
	const stage = useContext(Stage);
	const [percent, setPercent] = createSignal('', { name: 'percent' });
	const [gone, setGone] = createSignal(false, { name: 'loaderGone' });
	const [failed, setFailed] = createSignal(false, { name: 'noFlock' });
	let canvas!: HTMLCanvasElement;

	// Scrolling flies the camera, once the loader has let go.
	createEffect(
		() => {
			const flock = stage.flock();
			return stage.released() && flock ? { flock, travel: stage.travel() } : null;
		},
		(fly) => {
			fly?.flock.travel(fly.travel);
		},
		{ name: 'fly' }
	);

	onSettled(() => {
		// The page always opens at the hero, where the loader plays, not where a reload left it.
		history.scrollRestoration = 'manual';
		const resume = import.meta.env.DEV ? Number(sessionStorage.getItem(RESUME_KEY) ?? NaN) : NaN;
		const resuming = Number.isFinite(resume);
		let frame = 0;
		const release = () => {
			setGone(true);
			// Whatever a reload tried, it starts at the hero (or, developing, where it was).
			scrollTo({ top: resuming ? resume : 0, behavior: 'instant' });
			stage.set.released(true);
			if (import.meta.env.DEV) addEventListener('scroll', () => sessionStorage.setItem(RESUME_KEY, String(scrollY)), { passive: true });
		};
		const loaded = new Promise((done) => (document.readyState === 'complete' ? done(null) : addEventListener('load', done, { once: true })));

		(async () => {
			const duskCanvas = stage.el.dusk;
			const dusk = duskCanvas
				? await import('../dusk/scene')
						.then(({ startDusk }) => startDusk(duskCanvas, { sun: { azimuth: 18, elevation: -1.2 }, exposure: 0, stars: 0, email: EMAIL }, { paused: true }))
						.catch((e) => (console.error(e), null))
				: null;
			stage.set.dusk(dusk);
			const flock = await startBoids(canvas, stage.params, {
				held: !resuming,
				onFlown: stage.set.drawn,
				device: dusk?.device,
				onReflection: dusk?.reflect
			});
			stage.set.flock(flock);
			if (resuming) return release();

			// The loader. The fake part: an eased curve over FILL. The true part: it holds at WAIT
			// until the page is ready.
			let ready = false;
			Promise.all([loaded, document.fonts.ready]).then(() => (ready = true));
			const start = performance.now();
			let full: number | null = null;
			flock.progress(0);
			const tick = (now: number) => {
				const t = Math.min((now - start) / FILL, 1);
				const p = Math.min(1 - (1 - t) ** 3, ready ? 1 : WAIT);
				flock.progress(p);
				setPercent(`${Math.floor(p * 100)}%`);
				if (p >= 1) full ??= now;
				if (full !== null && now - full > BEAT) {
					flock.release();
					release();
				} else {
					frame = requestAnimationFrame(tick);
				}
			};
			frame = requestAnimationFrame(tick);
		})().catch(() => {
			// No flock: the page still flies, straight from the scroll.
			setFailed(true);
			release();
		});
		return () => cancelAnimationFrame(frame);
	});

	const { descent } = stage;
	return (
		<>
			<canvas
				class={['flock', { off: failed() }]}
				aria-hidden="true"
				ref={canvas}
				style={descent.inside() ? { 'clip-path': descent.clip(), opacity: descent.birds() } : undefined}
			/>
			<p class={['percent', { gone: gone() }]} aria-hidden="true">
				{percent()}
			</p>
		</>
	);
}
