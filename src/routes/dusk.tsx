import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { Title } from '@solidjs/meta';
import { startBoids } from '../boids/app';
import { defaults } from '../boids/params';
import { EMAIL } from '../contact';
import { palettes } from '../dusk/palettes';
import { box, placement } from '../dusk/placement';
import type { Dusk } from '../dusk/scene';
import { createClock } from '../lib/frame';
import type { Scene } from '../stage';
import './dusk.css';

const ink = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** The dusk scene on its own, for working on it: the lake, its sky and its far shore, the flock,
 *  and the email rising out of the water, with controls. */
export default function DuskPage() {
	// What the scene reads every frame; the controls write it.
	const settings: Dusk = { sun: { azimuth: 18, elevation: -1.2 }, exposure: 1, stars: 1, email: EMAIL };
	// The flock, as dark birds against the sky: dots with a short tail, and no bloom (as ink, a glow
	// would be a dark smudge round it). It shares the scene's GPU device, so its mirror image can be
	// a texture the water samples, rippled.
	const flock = { ...defaults, box, ink: 1, mirror: 0.6, bloom: 0, streak: 1, size: 1.9 };
	const [scene, setScene] = createSignal<Scene | null>(null, { name: 'scene' });
	const [error, setError] = createSignal<string | null>(null, { name: 'error' });
	let duskCanvas!: HTMLCanvasElement;
	let flockCanvas!: HTMLCanvasElement;

	onSettled(() => {
		// For tuning from the console.
		Object.assign(window, { flock, settings });
		let timer = 0;
		import('../dusk/scene')
			.then(({ startDusk }) => startDusk(duskCanvas, settings))
			.then((dusk) => {
				dusk.ink(flock.gain, ink(flock.inkColor));
				setScene(dusk);
				// The email rises after a moment.
				timer = window.setTimeout(dusk.surface, 2500);
				return startBoids(flockCanvas, flock, { placed: placement, device: dusk.device, onReflection: dusk.reflect });
			})
			.catch((e: Error) => {
				setError(e.message);
				console.error(e);
			});
		return () => clearTimeout(timer);
	});

	// The link lies over the email the scene draws, following it as it rises and bobs.
	const now = createClock();
	const rect = createMemo(() => {
		now();
		return scene()?.emailRect(innerWidth, innerHeight) ?? null;
	});

	const range = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void) => (
		<label>
			{label} <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => set(Number(e.currentTarget.value))} />
		</label>
	);

	return (
		<div class="dusk-page">
			<Title>Dusk</Title>
			<canvas class="scene" ref={duskCanvas} />
			<canvas class="birds" ref={flockCanvas} />
			<a
				class="email"
				href={`mailto:${EMAIL}`}
				style={
					rect()
						? {
								left: `${rect()!.left}px`,
								top: `${rect()!.top}px`,
								width: `${rect()!.width}px`,
								height: `${rect()!.height}px`,
								visibility: rect()!.visible ? 'visible' : 'hidden'
							}
						: { visibility: 'hidden' }
				}
			>
				{EMAIL}
			</a>
			<aside>
				{range('sun azimuth', -60, 60, 0.5, settings.sun.azimuth, (v) => (settings.sun.azimuth = v))}
				{range('sun elevation', -6, 6, 0.1, settings.sun.elevation, (v) => (settings.sun.elevation = v))}
				<label>
					palette{' '}
					<select onChange={(e) => (settings.palette = palettes[e.currentTarget.value])}>
						<For each={Object.keys(palettes)}>{(name) => <option value={name}>{name}</option>}</For>
					</select>
				</label>
				<button type="button" onClick={() => scene()?.surface()}>
					surface
				</button>
				{range('exposure', 0.3, 2, 0.05, settings.exposure, (v) => (settings.exposure = v))}
			</aside>
			<Show when={error()}>{(message) => <p class="error">{message()}</p>}</Show>
		</div>
	);
}
