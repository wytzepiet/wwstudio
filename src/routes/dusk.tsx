import { createSignal, For, onSettled, Show } from 'solid-js';
import { Title } from '@solidjs/meta';
import { startBoids, type FlockControl } from '../boids/app';
import { defaults } from '../boids/params';
import { EMAIL } from '../contact';
import { PALETTE, palettes } from '../dusk/palettes';
import { box, placement } from '../dusk/placement';
import type { Scene } from '../stage';

const ink = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** The dusk scene on its own, for working on it: the lake, its sky and its far shore, the flock,
 *  and the email rising out of the water, with controls. */
export default function DuskPage() {
	// What the controls set; the scene reads it every frame.
	const [azimuth, setAzimuth] = createSignal(18, { name: 'azimuth' });
	const [elevation, setElevation] = createSignal(-1.2, { name: 'elevation' });
	const [exposure, setExposure] = createSignal(1, { name: 'exposure' });
	const [palette, setPalette] = createSignal(PALETTE, { name: 'palette' });
	// The flock, as dark birds against the sky: dots with a short tail, and no bloom (as ink, a glow
	// would be a dark smudge round it). It shares the scene's GPU device, so its mirror image can be
	// a texture the water samples, rippled.
	const flockParams = { ...defaults, box, ink: 1, mirror: 0.6, bloom: 0, streak: 1, size: 1.9 };
	const [scene, setScene] = createSignal<Scene | null>(null, { name: 'scene' });
	const [flock, setFlock] = createSignal<FlockControl | null>(null, { name: 'flock' });
	const [error, setError] = createSignal<string | null>(null, { name: 'error' });
	let duskCanvas!: HTMLCanvasElement;
	let flockCanvas!: HTMLCanvasElement;

	onSettled(() => {
		// For tuning from the console.
		Object.assign(window, { flock: flockParams });
		let timer = 0;
		let disposed = false;
		const engines: { dispose(): void }[] = [];
		(async () => {
			const { startDusk } = await import('../dusk/scene');
			const dusk = await startDusk(duskCanvas, {
				email: EMAIL,
				sun: () => ({ azimuth: azimuth(), elevation: elevation() }),
				exposure,
				palette,
				reflection: () => flock()?.reflection(),
				ink: { gain: flockParams.gain, color: ink(flockParams.inkColor) }
			});
			engines.push(dusk);
			const birds = await startBoids(flockCanvas, flockParams, { placed: placement, device: dusk.device, reflect: true });
			engines.push(birds);
			if (disposed) return engines.forEach((e) => e.dispose());
			setScene(dusk);
			setFlock(birds);
			// The email rises after a moment.
			timer = window.setTimeout(dusk.surface, 2500);
		})().catch((e: Error) => {
			setError(e.message);
			console.error(e);
		});
		return () => {
			disposed = true;
			clearTimeout(timer);
			engines.forEach((e) => e.dispose());
		};
	});

	/** The link lies over the email the scene draws, following it as it rises and bobs. */
	const rect = () => scene()?.emailRect() ?? null;

	const range = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void) => (
		<label class="grid grid-cols-[100px_160px] items-center">
			{label} <input class="accent-white" type="range" min={min} max={max} step={step} value={value} onInput={(e) => set(Number(e.currentTarget.value))} />
		</label>
	);

	return (
		<div class="locked font-mono text-[11px] leading-snug">
			<Title>Dusk</Title>
			<canvas class="fixed inset-0 block h-screen w-screen" ref={duskCanvas} />
			<canvas class="pointer-events-none fixed inset-0 block h-screen w-screen" ref={flockCanvas} />
			<a
				// Clickable and readable, but the scene draws it: the link itself is invisible.
				class="fixed overflow-hidden whitespace-nowrap text-transparent focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white/60"
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
			<aside class="fixed right-4 bottom-4 grid gap-1.5 border border-white/15 bg-black/60 p-2.5">
				{range('sun azimuth', -60, 60, 0.5, 18, setAzimuth)}
				{range('sun elevation', -6, 6, 0.1, -1.2, setElevation)}
				<label class="grid grid-cols-[100px_160px] items-center">
					palette{' '}
					<select class="border border-white/20 bg-black px-1.5 py-0.5 text-inherit" onChange={(e) => setPalette(palettes[e.currentTarget.value])}>
						<For each={Object.keys(palettes)}>{(name) => <option value={name}>{name}</option>}</For>
					</select>
				</label>
				<button type="button" class="cursor-pointer border border-white/20 px-1.5 py-0.75" onClick={() => scene()?.surface()}>
					surface
				</button>
				{range('exposure', 0.3, 2, 0.05, 1, setExposure)}
			</aside>
			<Show when={error()}>{(message) => <p class="fixed inset-0 m-0 grid place-items-center">{message()}</p>}</Show>
		</div>
	);
}
