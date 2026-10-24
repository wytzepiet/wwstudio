import { createEffect, createMemo, createSignal, createStore, deep, For, onSettled, Show, snapshot } from 'solid-js';
import { Title } from '@solidjs/meta';
import { startBoids, type FlockControl, type Stats } from '../boids/app';
import { defaults, palettes, sliders, type Params, type Slider as SliderSpec } from '../boids/params';
import './sandbox.css';

const STORE = 'boids-sandbox-3';
const fresh = (): Params => structuredClone(defaults);

/** The boids on their own, with every knob exposed and GPU time per pass. */
export default function Sandbox() {
	// The settings: the flock reads them every frame, the controls write them.
	const [params, setParams] = createStore(fresh());
	const set = <K extends keyof Params>(key: K, value: Params[K]) =>
		setParams((s) => {
			s[key] = value;
		});
	const [flock, setFlock] = createSignal<FlockControl | null>(null, { name: 'flock' });
	const [error, setError] = createSignal<string | null>(null, { name: 'error' });
	const [bare, setBare] = createSignal(false, { name: 'bare' });
	let canvas!: HTMLCanvasElement;

	onSettled(() => {
		// What was last tuned here, of the settings that still exist (removed ones would ride along
		// in every copy).
		try {
			const saved = Object.entries(JSON.parse(localStorage.getItem(STORE) ?? '{}')).filter(([key]) => key in defaults);
			setParams((s) => Object.assign(s, Object.fromEntries(saved)));
		} catch {}
		// For tuning from the console.
		Object.assign(window, { params, setParams });
		const toggle = (e: KeyboardEvent) => e.key === 'h' && !(e.target instanceof HTMLInputElement) && setBare((b) => !b);
		addEventListener('keydown', toggle);
		let running: FlockControl | null = null;
		let disposed = false;
		startBoids(canvas, params)
			.then((started) => {
				if (disposed) return started.dispose();
				running = started;
				setFlock(started);
			})
			.catch((e: Error) => setError(e.message));
		return () => {
			disposed = true;
			running?.dispose();
			removeEventListener('keydown', toggle);
		};
	});
	// Kept between visits.
	createEffect(
		() => deep(params),
		(all) => {
			try {
				localStorage.setItem(STORE, JSON.stringify(all));
			} catch {}
		},
		{ name: 'save', defer: true }
	);
	/** The old site's palette the colours are, if they are one. */
	const palette = createMemo(() => Object.entries(palettes).find(([, [n, f]]) => n === params.nearColor && f === params.farColor)?.[0] ?? '');

	return (
		// The canvas is see-through: the background is the page's.
		<div class={['sandbox', { bare: bare() }]} style={{ background: params.background }}>
			<Title>Boids sandbox</Title>
			<canvas ref={canvas} />
			<pre class="stats">{flock()?.stats() ? describe(flock()!.stats()!) : ''}</pre>
			<aside class="panel">
				<For each={sliders}>
					{(group) => (
						<section>
							<h2>{group.group}</h2>
							<For each={group.items}>{(spec) => <Slider spec={spec} value={params[spec.key]} set={(v) => set(spec.key, v)} />}</For>
						</section>
					)}
				</For>
				<div class="row" title="Colour pairs from the old site.">
					<label>palette</label>
					<select
						value={palette()}
						onChange={(e) => {
							const pair = palettes[e.currentTarget.value];
							if (!pair) return;
							setParams((s) => {
								[s.nearColor, s.farColor] = pair;
							});
						}}
					>
						<option value="">—</option>
						<For each={Object.keys(palettes)}>{(name) => <option value={name}>{name}</option>}</For>
					</select>
				</div>
				<Color label="near" hint="Colour of boids near the camera. Toward far it sweeps through the hues in between." value={params.nearColor} set={(v) => set('nearColor', v)} />
				<Color label="far" hint="Colour of boids far from the camera." value={params.farColor} set={(v) => set('farColor', v)} />
				<Color label="background" hint="What everything sits on." value={params.background} set={(v) => set('background', v)} />
				<div class="buttons">
					<button type="button" title="Draw the flock into the loader ring." onClick={() => flock()?.gather()}>
						gather
					</button>
					<button type="button" title="Let the ring burst into the flock." onClick={() => flock()?.release()}>
						release
					</button>
				</div>
				<div class="buttons">
					<button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(snapshot(params), null, '\t'))}>
						copy
					</button>
					<button type="button" onClick={() => setParams((s) => Object.assign(s, fresh()))}>
						reset
					</button>
					<button type="button" onClick={() => setBare((b) => !b)}>
						hide
					</button>
				</div>
			</aside>
			<Show when={error()}>{(message) => <p class="error">{message()}</p>}</Show>
		</div>
	);
}

/** A slider and the number beside it. The number can be typed, past the slider's range either way.
 *  Settings that rebuild the flock (it restarts) only take effect once the slider is let go; until
 *  then the number shows where it is. */
function Slider(props: { spec: SliderSpec; value: number; set: (v: number) => void }) {
	// Follows the setting, and runs ahead of it while a rebuilding slider is dragged.
	const [draft, setDraft] = createSignal(() => props.value, { name: 'draft' });
	return (
		<div class="row" title={props.spec.hint}>
			<label>{props.spec.key}</label>
			<input
				type="range"
				min={props.spec.min}
				max={props.spec.max}
				step={props.spec.step}
				value={draft()}
				onInput={(e) => (props.spec.rebuild ? setDraft(Number(e.currentTarget.value)) : props.set(Number(e.currentTarget.value)))}
				onChange={(e) => props.set(Number(e.currentTarget.value))}
			/>
			<input
				class="value"
				inputmode="decimal"
				spellcheck="false"
				value={String(draft())}
				onChange={(e) => {
					const n = Number(e.currentTarget.value);
					if (e.currentTarget.value.trim() !== '' && Number.isFinite(n)) props.set(n);
					else e.currentTarget.value = String(props.value);
				}}
				onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			/>
		</div>
	);
}

function Color(props: { label: string; hint: string; value: string; set: (v: string) => void }) {
	return (
		<div class="row" title={props.hint}>
			<label>{props.label}</label>
			<input type="color" value={props.value} onInput={(e) => props.set(e.currentTarget.value)} />
		</div>
	);
}

function describe(s: Stats) {
	const lines = [`${s.fps.toFixed(0)} fps`, `${s.count.toLocaleString()} boids`, `${s.dims.join('×')} cells`];
	if (s.gpu) {
		const total = Object.values(s.gpu).reduce((a, b) => a + b, 0);
		lines.push('', ...Object.entries(s.gpu).map(([k, v]) => `${k.padEnd(6)} ${v.toFixed(2)} ms`), `${'gpu'.padEnd(6)} ${total.toFixed(2)} ms`);
	} else {
		lines.push('', 'no timestamp-query: GPU times unavailable');
	}
	return lines.join('\n');
}
