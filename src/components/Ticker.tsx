import { createMemo, Repeat, useContext } from 'solid-js';
import { Stage } from '../stage';
import './Ticker.css';

/**
 * Where you are on the page: a short line on the right edge for each place scrolling comes to rest
 * (the hero, each of the intro's lines, each project, "Still here?" and the lake), the one you are
 * at long and white. A line takes you to its place. How many there are is the page's to say (so the
 * server renders them too); where they lead is measured on the page.
 */
export default function Ticker(props: { count: number }) {
	const stage = useContext(Stage);
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
	return (
		<nav class={['ticker', { on: stage.released() }]} aria-label="Where you are">
			<Repeat count={props.count}>
				{(i) => (
					<button
						type="button"
						class={{ at: i === at() }}
						aria-label={`Go to part ${i + 1} of ${props.count}`}
						aria-current={i === at() ? 'step' : undefined}
						onClick={() => scrollTo({ top: stops()[i] ?? 0, behavior: 'smooth' })}
					/>
				)}
			</Repeat>
		</nav>
	);
}
