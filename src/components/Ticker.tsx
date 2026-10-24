import { createMemo, createSignal, Repeat, useContext } from 'solid-js';
import { Stage } from '../stage';
import './Ticker.css';

/** How many lines either side the pointer's pull reaches. */
const REACH = 1.6;
const SPACING = 12; // px from line to line (as in Ticker.css)

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
			return [...document.querySelectorAll<HTMLElement>('.home .rest, .home .boring, .home .lake')]
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
	/** The line nearest the pointer. */
	const near = createMemo(() => (pointer() === null ? null : Math.round(Math.min(Math.max(pointer()!, 0), props.labels.length - 1))), {
		name: 'tickerNear'
	});

	return (
		<nav
			class={['ticker', { on: stage.released(), near: near() !== null }]}
			aria-label="Where you are"
			onPointerMove={(e) => {
				if (!list) return;
				setPointer((e.clientY - list.getBoundingClientRect().top - SPACING / 2) / SPACING);
			}}
			onPointerLeave={() => setPointer(null)}
		>
			<div class="lines" ref={(el: HTMLElement) => (list = el)}>
				<Repeat count={props.labels.length}>
					{(i) => (
						<button
							type="button"
							class={{ at: i === at(), near: i === near() }}
							style={{ '--swell': swell(i) }}
							aria-label={props.labels[i]}
							aria-current={i === at() ? 'step' : undefined}
							onClick={() => scrollTo({ top: stops()[i] ?? 0, behavior: 'smooth' })}
						>
							<span class="label">{props.labels[i]}</span>
						</button>
					)}
				</Repeat>
			</div>
		</nav>
	);
}
