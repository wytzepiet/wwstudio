import { For } from 'solid-js';
import { Title } from '@solidjs/meta';
import { defaults, FLY, PAST, STEP } from '../boids/params';
import Ending from '../components/Ending';
import Flock from '../components/Flock';
import Headline from '../components/Headline';
import Reveal from '../components/Reveal';
import Ticker from '../components/Ticker';
import Work, { TOP, work } from '../components/Work';
import { createPlane } from '../plane';
import { createStage, Stage } from '../stage';

// The flight (see <Flock>): the first FLY screens take the camera through the flock to PAST beyond
// it; each screen after that flies on STEP. The intro is said one line a screen, each line a stop on
// the way, arriving at its own size as the camera reaches it.
const D = defaults.distance;
// Each with what it is called on the ticker.
const lines = [
	{ label: 'Hi', text: "Hi, I'm Wytze, a developer in Rotterdam." },
	{ label: 'What I build', text: 'I build websites, apps, backends and interactive things like the one you just flew through.' },
	{ label: 'Code got cheap', text: 'Writing code got cheap.' },
	{ label: 'What I bring', text: "What didn't: telling good from bad, and how to put it into words." },
	{ label: 'The work', text: 'Take a look at some of my work.' }
];
// From the last stop the page scrolls as pages do: the work, whose first project already peeks in
// at the bottom of the screen there (PEEK of a screen down).
const PEEK = 0.82;
/** A plane of the page in the flock's space (see plane.ts): it fills the screen and carries its own
 *  perspective, so planes behind the flock can lie under the canvas and those in front over it. It
 *  lets the pointer through; only its content takes it. */
const PLANE = 'pointer-events-none fixed inset-0 will-change-[transform,opacity] *:pointer-events-auto';
const lastStop = FLY + lines.length - 1;
// Stop k is reached after FLY + k screens: it sits D beyond where the camera is then. The first
// fades in from further off; the last recedes as the work slides over it.
const stops = lines.map(({ text, label }, k) => ({
	text,
	label,
	scroll: FLY + k,
	plane: { depth: -(D + PAST) - k * STEP, at: D, fade: k === 0 ? 3 : 1.8, recede: k === lines.length - 1 ? PEEK - TOP : undefined }
}));

export default function Home() {
	const stage = createStage(lastStop);
	// In the flock's space: the headline floats in front of the flock, the intro's lines wait beyond it.
	const hero = createPlane(stage, { depth: 300 });
	return (
		<Stage value={stage}>
			<Title>Wytze Sligting</Title>
			<div class={['home', { loading: !stage.released() }]}>
				<Flock />
				<main class={[PLANE, 'box-border grid content-end p-gutter']} style={hero.style()} inert={hero.inert()}>
					<Headline lines={['Building things is easy now.', "Knowing what to build isn't."]} />
				</main>
				<For each={stops}>
					{(stop) => {
						const plane = createPlane(stage, stop.plane);
						return (
							<section class={[PLANE, 'box-border grid place-content-center p-gutter text-center']} style={plane.style()} inert={plane.inert()}>
								<Reveal class="m-0 max-w-2xl text-title text-balance" text={stop.text} in={plane.shown()} />
							</section>
						);
					}}
				</For>
				{/* The flight's length, and where scrolling comes to rest: the hero and each stop. It lies over
				    the planes behind the flock, so it lets the pointer through. */}
				<div class="pointer-events-none relative" style={{ height: `${(lastStop + PEEK) * 100}vh` }}>
					<For each={[0, ...stops.map((s) => s.scroll)]}>
						{(at) => <div data-rest class="pointer-events-none absolute h-screen snap-start snap-always" style={{ top: `${at * 100}vh` }} />}
					</For>
				</div>
				<Work />
				<Ending />
				{/* Where you are: the hero, the intro's lines, the projects, "Still here?" and the lake. */}
				<Ticker labels={['Start', ...stops.map((s) => s.label), ...work.map((w) => w.name), 'Still here?', 'Say hi']} />
			</div>
		</Stage>
	);
}
