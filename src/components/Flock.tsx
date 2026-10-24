import { createSignal, onSettled, useContext } from 'solid-js';
import { startBoids } from '../boids/app';
import { EMAIL } from '../contact';
import { Stage } from '../stage';

const FILL = 2600; // ms for the ring to fill, if the page is ready by then
const WAIT = 0.9; // where it waits until the page is
const BEAT = 350; // ms full before it bursts
/** The fill starts once SMOOTH_RUN frames in a row have come within SMOOTH_FRAME ms. */
const SMOOTH_FRAME = 50;
const SMOOTH_RUN = 4;
/** While developing, every edit reloads the page: it then skips the loader and goes back to where
 *  it was, rather than starting over at the hero. (Not on the real site.) */
const RESUME_KEY = 'dev:scroll';

/**
 * The murmuration, full-screen behind the page, with the settings tuned in /sandbox. It opens as a
 * loader: a ring that fills to 100% and bursts into the flock. Without WebGPU there is no flock and
 * no loader, and the page is let go at once.
 *
 * It starts the engines, tells them where to read what drives them (the scroll, and the way down
 * into the dusk, see descent.ts), and hands them to the stage: first the dusk scene of the page's
 * end (paused, on the canvas <Ending> left), so the flock can run on its GPU device, fly into that
 * scene and be mirrored in its lake; then the flock.
 */
export default function Flock() {
	const stage = useContext(Stage);
	// 0% from the first paint (it is rendered so on the server), while the engines start and the
	// shaders are made; then the ring comes in round it.
	const [percent, setPercent] = createSignal('0%', { name: 'percent' });
	const [gone, setGone] = createSignal(false, { name: 'loaderGone' });
	const [failed, setFailed] = createSignal(false, { name: 'noFlock' });
	let canvas!: HTMLCanvasElement;

	onSettled(() => {
		// The page always opens at the hero, where the loader plays, not where a reload left it.
		history.scrollRestoration = 'manual';
		const resume = import.meta.env.DEV ? Number(sessionStorage.getItem(RESUME_KEY) ?? NaN) : NaN;
		const resuming = Number.isFinite(resume);
		let frame = 0;
		let disposed = false;
		const engines: { dispose(): void }[] = [];
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
			const { descent } = stage;
			const dusk = duskCanvas
				? await import('../dusk/scene')
						.then(({ startDusk }) => startDusk(duskCanvas, { email: EMAIL, ...descent.scene }, { paused: true }))
						.catch((e) => (console.error(e), null))
				: null;
			if (dusk) engines.push(dusk);
			const flock = await startBoids(canvas, descent.flock.params, {
				held: !resuming,
				// Scrolling flies the camera, once the loader has let go.
				travel: () => (stage.released() ? stage.travel() : 0),
				placed: descent.flock.placed,
				device: dusk?.device,
				reflect: !!dusk
			});
			engines.push(flock);
			if (disposed) return engines.forEach((e) => e.dispose());
			stage.set.dusk(dusk);
			stage.set.flock(flock);
			if (resuming) return release();

			// The loader. The fake part: an eased curve over FILL. The true part: it holds at WAIT
			// until the page is ready. The curve only starts once frames come smoothly, so the GPU
			// is really drawing: the first frames wait on its shaders being made, which on a first
			// visit can take a while, and the ring would otherwise appear already nearly full.
			let ready = false;
			Promise.all([loaded, document.fonts.ready]).then(() => (ready = true));
			let start: number | null = null;
			let smooth = 0;
			let last = performance.now();
			let full: number | null = null;
			flock.progress(0);
			const tick = (now: number) => {
				smooth = now - last < SMOOTH_FRAME ? smooth + 1 : 0;
				last = now;
				if (start === null && smooth >= SMOOTH_RUN) start = now;
				const t = start === null ? 0 : Math.min((now - start) / FILL, 1);
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
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			engines.forEach((e) => e.dispose());
		};
	});

	const { descent } = stage;
	return (
		<>
			<canvas
				// Above the planes behind the flock, under those in front of it, and never in the pointer's
				// way. (Not below zero: the page's body would then stand in front of what lies behind it.)
				class={['pointer-events-none fixed inset-0 z-1 block size-full', { hidden: failed() }]}
				aria-hidden="true"
				ref={canvas}
				style={descent.inside() ? { 'clip-path': descent.clip(), opacity: descent.birds() } : undefined}
			/>
			{/* In the middle of the ring, which is in the middle of the screen. */}
			<p
				class={[
					'pointer-events-none fixed inset-0 m-0 grid place-items-center font-mono text-sm leading-none font-medium tracking-[0.08em] text-white/80 tabular-nums transition-opacity duration-400',
					{ 'opacity-0': gone() }
				]}
				aria-hidden="true"
			>
				{percent()}
			</p>
		</>
	);
}
