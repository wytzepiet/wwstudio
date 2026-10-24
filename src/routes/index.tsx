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
import './home.css';

// The flight (see <Flock>): the first FLY screens take the camera through the flock to PAST beyond
// it; each screen after that flies on STEP. The intro is said one line a screen, each line a stop on
// the way, arriving at its own size as the camera reaches it.
const D = defaults.distance;
const lines = [
	"Hi, I'm Wytze, a developer in Rotterdam.",
	'I build websites, apps, backends and interactive things like the one you just flew through.',
	'Code got cheap.',
	"What I bring is the part that didn't: an eye for what's good, the judgement to choose, and the ability to express exactly what it should be.",
	'Take a look at some of my work.'
];
// From the last stop the page scrolls as pages do: the work, whose first project already peeks in
// at the bottom of the screen there (PEEK of a screen down).
const PEEK = 0.82;
const lastStop = FLY + lines.length - 1;
// Stop k is reached after FLY + k screens: it sits D beyond where the camera is then. The first
// fades in from further off; the last recedes as the work slides over it.
const stops = lines.map((text, k) => ({
	text,
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
				<main class="plane hero" style={hero.style()} inert={hero.inert()}>
					<Headline lines={['Building things is easy now.', "Knowing what to build isn't."]} />
				</main>
				<For each={stops}>
					{(stop) => {
						const plane = createPlane(stage, stop.plane);
						return (
							<section class="plane stop" style={plane.style()} inert={plane.inert()}>
								<Reveal class="text" text={stop.text} in={plane.shown()} />
							</section>
						);
					}}
				</For>
				{/* The flight's length, and where scrolling comes to rest: the hero and each stop. */}
				<div class="runway" style={{ height: `${(lastStop + PEEK) * 100}vh` }}>
					<For each={[0, ...stops.map((s) => s.scroll)]}>{(at) => <div class="rest" style={{ top: `${at * 100}vh` }} />}</For>
				</div>
				<Work />
				<Ending />
				{/* The hero, the intro's lines, the projects, "Still here?" and the lake. */}
				<Ticker count={1 + stops.length + work.length + 2} />
			</div>
		</Stage>
	);
}
