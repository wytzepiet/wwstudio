import { useContext } from 'solid-js';
import { EMAIL, WHATSAPP } from '../contact';
import { Stage } from '../stage';
import Reveal from './Reveal';
import './Ending.css';

/** Screens of scrolling from the line to the lake, beyond the one it takes to scroll the line away. */
const DESCENT = 1;

/**
 * The end of the page: after the work, a line on black ("Still here?"), and then down into the
 * dusk (src/dusk), framed as the site frames its pictures, the flock now dark birds over a Frisian
 * lake, and the email rising out of the water (see descent.ts for how it plays). On the way down,
 * "Say hi sometime" comes, and dissolves as the scene comes up; a while after the email, a way
 * round it if mail goes unanswered.
 *
 * Without the scene (or WebGPU) the email is an ordinary link on the last screen.
 */
export default function Ending() {
	const stage = useContext(Stage);
	const { descent } = stage;
	return (
		<div class={['ending', { scened: !!stage.dusk() }]}>
			<canvas
				class={['dusk', { on: descent.inside() }]}
				aria-hidden="true"
				ref={(el: HTMLCanvasElement) => (stage.el.dusk = el)}
				style={{ 'clip-path': descent.clip() }}
			/>
			{/* The scene's frame: its edge, a hairline, over the scene and the flock. */}
			<div class={['frame', { on: descent.inside() }]} style={{ inset: `${descent.frame().end}px ${descent.frame().side}px` }}>
				<a class={['whatsapp', { on: descent.surfaced() }]} href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener">
					Mailed me three weeks ago? Sorry. You can also WhatsApp me →
				</a>
			</div>
			<section class="boring" ref={(el: HTMLElement) => (stage.el.boring = el)}>
				<Reveal text="Still here?" />
			</section>
			<div class="descent" style={{ height: `${DESCENT * 100}vh` }} />
			<section class="lake" ref={(el: HTMLElement) => (stage.el.lake = el)}>
				<Reveal
					class="hi"
					letters
					text="Say hi sometime."
					in={stage.dusk() ? descent.hi().in : undefined}
					out={stage.dusk() ? descent.hi().out : undefined}
				/>
				{/* With the scene, it draws the email and the link lies over it, unseen. */}
				<a
					class="email"
					href={`mailto:${EMAIL}`}
					style={
						descent.emailRect()
							? {
									left: `${descent.emailRect()!.left}px`,
									top: `${descent.emailRect()!.top}px`,
									width: `${descent.emailRect()!.width}px`,
									height: `${descent.emailRect()!.height}px`,
									visibility: 'visible'
								}
							: undefined
					}
				>
					{EMAIL}
				</a>
			</section>
		</div>
	);
}
