import { createMemo, createSignal, For, onSettled, Show, useContext } from 'solid-js';
import { createClock } from '../lib/frame';
import { Stage } from '../stage';

const AFTER_BURST = 2200; // ms after the loader bursts before the first letter: a moment to take in the burst
const UNPROMPTED = 8000; // ms after which it plays anyway, if there is no loader to wait for
const TYPE_EVERY = 38; // ms a letter, line one
const PAUSE = 450; // ms between the lines
const APPEAR_EVERY = 25; // ms a letter, line two's scramble running ahead
const SETTLE_AFTER = 300; // ms of scramble before line two's first letter settles
const SETTLE_EVERY = 45; // ms a letter, line two's settled text following
const SHUFFLE_EVERY = 55; // ms between new random glyphs
const GLYPHS = 'abcdefghijklmnopqrstuvwxyz#%&*+=/<>?';

/** A number in [0, 1) that looks random, the same for the same inputs. */
const hash = (a: number, b: number) => {
	const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return x - Math.floor(x);
};

/**
 * The headline, acted out: the first line types itself, quick and effortless; the second arrives
 * scrambled and is worked out a letter at a time. It waits for the loader to burst. Screen readers
 * get the sentence at once, and with reduced motion it simply stands there.
 *
 * All of it is a function of the time since it started: which letters are typed, which have
 * settled, and the glyphs the scramble shows.
 */
export default function Headline(props: { lines: [string, string] }) {
	const stage = useContext(Stage);
	const now = createClock();
	const [still, setStill] = createSignal(false, { name: 'reducedMotion' });
	onSettled(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) setStill(true);
	});

	const typed = createMemo(() => [...props.lines[0]]);
	const worked = createMemo(() => {
		// Each letter of line two settles at its own moment, a little early or late; the noise in
		// its place shows up fast, ahead of it.
		return [...props.lines[1]].map((ch, i) => {
			const settle = SETTLE_AFTER + i * SETTLE_EVERY + (hash(i, 7) - 0.5) * SETTLE_EVERY;
			return { ch, settle, appear: Math.min(i * APPEAR_EVERY, settle), blank: ch === ' ' };
		});
	});
	const secondStart = () => typed().length * TYPE_EVERY + PAUSE;
	const length = () => secondStart() + Math.max(...worked().map((w) => w.settle));

	/** When it started, in clock ms: after the loader, or after a while if there is none. */
	const start = createMemo<number | null>(
		(was) => was ?? (stage.released() ? now() + AFTER_BURST : now() > UNPROMPTED ? now() : null),
		{ name: 'headlineStart' }
	);
	/** Ms into it: below 0 before it starts. */
	const t = createMemo(() => (start() === null ? -1 : now() - start()!), { name: 'headlineTime' });
	const done = createMemo(() => still() || t() >= length(), { name: 'headlineDone' });
	const shown = createMemo(() => Math.max(0, Math.min(typed().length, Math.floor(t() / TYPE_EVERY))));
	const t2 = () => t() - secondStart();
	const shuffle = () => Math.floor(t() / SHUFFLE_EVERY);
	/** Is this letter of line two still being worked out? */
	const working = (w: { appear: number; settle: number; blank: boolean }) => !done() && !w.blank && t2() >= w.appear && t2() < w.settle;
	/** Until it has played, a letter shows only once it is on: so the finished headline never flashes
	 *  up before it is played (it is rendered so on the server too). With reduced motion it simply
	 *  stands there, from the first paint. */
	const hidden = (on: boolean) => ({ 'motion-safe:opacity-0': !done() && !on });

	return (
		<h1 class="m-0 text-[clamp(2.5rem,7vw,7rem)] leading-[0.95] font-extrabold tracking-[-0.04em]" aria-label={props.lines.join(' ')}>
			<span class="relative block" aria-hidden="true">
				<For each={typed()} keyed={false}>
					{(ch, i) => (
						<span class={['relative', hidden(i < shown())]}>
							{ch()}
							{/* The caret, after the letter last typed. */}
							<Show when={!done() && i === shown() - 1 && shown() < typed().length}>
								<span class="absolute top-[0.08em] -right-[0.12em] bottom-[0.04em] w-[0.06em] bg-current" />
							</Show>
						</span>
					)}
				</For>
			</span>
			<span class="relative block" aria-hidden="true">
				<For each={worked()} keyed={false}>
					{(w) => <span class={['relative', hidden(t2() >= w().appear), { 'text-transparent': working(w()) }]}>{w().ch}</span>}
				</For>
				{/* A letter still being worked out keeps its width, empty, and a random glyph shows in its
				    place, on a copy of the line laid over it: see-through as a whole, so where two glyphs
				    overlap they don't add up. */}
				<Show when={!done()}>
					<span class="pointer-events-none absolute inset-0">
						<For each={worked()} keyed={false}>
							{(w, i) => (
								<span class="relative text-transparent">
									{w().ch}
									<Show when={working(w())}>
										<span class="absolute inset-0 text-center font-normal text-subtle">{GLYPHS[Math.floor(hash(i, shuffle()) * GLYPHS.length)]}</span>
									</Show>
								</span>
							)}
						</For>
					</span>
				</Show>
			</span>
		</h1>
	);
}
