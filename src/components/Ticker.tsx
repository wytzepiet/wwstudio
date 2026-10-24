import { createMemo, createSignal, Repeat, useContext } from 'solid-js';
import { Stage } from '../stage';

/** How many lines either side the pointer's pull reaches. */
const REACH = 1.6;
const SPACING = 12; // px from line to line (the lines' h-3)

/**
 * Where you are on the page: a short line on the right edge for each place scrolling comes to rest
 * (the hero, each of the intro's lines, each project, "Still here?" and the lake), the one you are
 * at long and white. As the pointer comes near, the lines under it swell toward it, as a dock does,
 * and the nearest says what it is. A line takes you to its place.
 *
 * Which places there are is the page's to say (so the server renders them too); where they lead is
 * measured on the page.
 */
export default function Ticker(props: { labels: string[] }) {
	const stage = useContext(Stage);
	/** Where the pointer is over the lines, in lines from the first (null when it is not near). */
	const [pointer, setPointer] = createSignal<number | null>(null, { name: 'tickerPointer' });
	let list: HTMLElement | undefined;

	/** Where each resting place is on the page: layout, so read again when the window changes
	 *  (and once the engines are in, when the page has its full length). */
	const stops = createMemo(
		() => {
			stage.viewport.width();
			stage.viewport.height();
			stage.released();
			if (typeof document === 'undefined') return [];
			return [...document.querySelectorAll<HTMLElement>('.home [data-rest]')]
				.map((el) => Math.round(el.getBoundingClientRect().top + scrollY))
				.sort((a, b) => a - b);
		},
		{ name: 'tickerStops' }
	);
	/** The one you are at: the last you have scrolled more than halfway to. */
	const at = createMemo(
		() => {
			const y = stage.viewport.scroll() + stage.viewport.height() * 0.5;
			return stops().reduce((found, top, i) => (top <= y ? i : found), 0);
		},
		{ name: 'tickerAt' }
	);
	/** How much each line swells toward the pointer, 0 to 1. */
	const swell = (i: number) => {
		const p = pointer();
		if (p === null) return 0;
		const d = (i - p) / REACH;
		return Math.exp(-d * d);
	};
	/** How long and bright a line is: the one you are at long and white, the others short and dim,
	 *  each leaning toward the pointer. */
	const line = (i: number) =>
		i === at() ? { width: 24 + 10 * swell(i), height: 2, alpha: 1 } : { width: 8 + 22 * swell(i), height: 1, alpha: 0.3 + 0.5 * swell(i) };
	/** The line nearest the pointer. */
	const near = createMemo(() => (pointer() === null ? null : Math.round(Math.min(Math.max(pointer()!, 0), props.labels.length - 1))), {
		name: 'tickerNear'
	});

	return (
		<nav
			// On the right edge, in the middle, over everything; in once the loader has let go. It
			// reaches out to the left a good way, so the pointer is felt coming near before it is on a line.
			class={[
				'fixed top-1/2 right-0 z-4 -translate-y-1/2 py-12 pr-[clamp(12px,2vw,28px)] pl-18 transition-opacity duration-800',
				stage.released() ? 'opacity-100' : 'pointer-events-none opacity-0'
			]}
			aria-label="Where you are"
			onPointerMove={(e) => {
				if (!list) return;
				setPointer((e.clientY - list.getBoundingClientRect().top - SPACING / 2) / SPACING);
			}}
			onPointerLeave={() => setPointer(null)}
		>
			<div class="grid justify-items-end" ref={(el: HTMLElement) => (list = el)}>
				<Repeat count={props.labels.length}>
					{(i) => (
						<button
							type="button"
							// Each line sits in a taller target, so it is easy to hit.
							class="relative block h-3 w-10 cursor-pointer focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white/60"
							aria-label={props.labels[i]}
							aria-current={i === at() ? 'step' : undefined}
							onClick={() => scrollTo({ top: stops()[i] ?? 0, behavior: 'smooth' })}
						>
							<span
								class="absolute top-1/2 right-0 -translate-y-1/2 bg-white transition-[width,height,opacity] duration-250 ease-out-soft motion-reduce:transition-none"
								style={{ width: `${line(i).width}px`, height: `${line(i).height}px`, opacity: line(i).alpha }}
							/>
							{/* What the nearest line is, beside it on the left, small, with a soft dark halo so it
							    reads over the bright flock too. */}
							<span
								class={[
									'pointer-events-none absolute top-1/2 right-[calc(100%+4px)] font-mono text-[0.6875rem] leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase transition-[opacity,translate] duration-300 ease-out-soft [text-shadow:0_0_10px_rgb(0_2_15/0.9),0_0_3px_rgb(0_2_15/0.9)] motion-reduce:transition-none',
									i === near() ? '-translate-y-1/2 opacity-100' : 'translate-x-1.5 -translate-y-1/2 opacity-0',
									i === at() ? 'text-white' : 'text-white/75'
								]}
							>
								{props.labels[i]}
							</span>
						</button>
					)}
				</Repeat>
			</div>
		</nav>
	);
}
