import { useContext } from 'solid-js';
import { EMAIL, WHATSAPP } from '../contact';
import { Stage } from '../stage';
import Reveal from './Reveal';

/** A screen of the ending, where scrolling comes to rest. */
const SCREEN = 'pointer-events-none relative z-3 box-border grid h-screen snap-start snap-always place-items-center p-gutter';
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
	const scened = () => !!stage.dusk();
	return (
		<div>
			{/* Behind the flock, and only there once it is in the scene. */}
			<canvas
				class={['pointer-events-none fixed inset-0 z-0 block size-full', descent.inside() ? 'visible' : 'invisible']}
				aria-hidden="true"
				ref={(el: HTMLCanvasElement) => (stage.el.dusk = el)}
				style={{ 'clip-path': descent.clip() }}
			/>
			{/* The scene's frame: its edge, a hairline as the work panels have, over the scene and the flock. */}
			<div
				class={['pointer-events-none fixed z-2 rounded-panel shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]', descent.inside() ? 'visible' : 'invisible']}
				style={{ inset: `${descent.frame().end}px ${descent.frame().side}px` }}
			>
				{/* Small, in the bottom corner; it settles in four seconds after the email. */}
				<a
					class={[
						'pointer-events-auto absolute right-6.5 bottom-5.5 text-[0.8125rem] text-subtle no-underline transition-[opacity,translate,color,visibility] duration-[1200ms,1200ms,200ms,0ms] ease-out-soft hover:text-white focus-visible:text-white',
						descent.surfaced() ? 'visible translate-y-0 opacity-100 delay-[4s,4s,0s,4s]' : 'invisible translate-y-1.5 opacity-0 delay-[0s,0s,0s,1200ms]'
					]}
					href={`https://wa.me/${WHATSAPP}`}
					target="_blank"
					rel="noopener"
				>
					Mailed me three weeks ago? Sorry. You can also WhatsApp me →
				</a>
			</div>
			{/* The two screens lie over the scene and its frame: only what is in them takes the pointer. */}
			<section data-rest class={SCREEN} ref={(el: HTMLElement) => (stage.el.boring = el)}>
				<Reveal class="pointer-events-auto m-0 text-center text-title text-balance" text="Still here?" />
			</section>
			<div class="pointer-events-none" style={{ height: `${DESCENT * 100}vh` }} />
			{/* Without the scene, the line stands over an ordinary link; with it, the line is in the
			    middle of the screen, and the scene draws the email with the link laid over it, unseen. */}
			<section data-rest class={[SCREEN, 'content-center gap-8']} ref={(el: HTMLElement) => (stage.el.lake = el)}>
				<Reveal
					class={[
						'm-0 text-center text-title text-balance',
						{ 'pointer-events-none fixed inset-x-0 top-1/2 -translate-y-1/2 px-gutter': scened() }
					]}
					letters
					text="Say hi sometime."
					in={stage.dusk() ? descent.hi().in : undefined}
					out={stage.dusk() ? descent.hi().out : undefined}
				/>
				{/* With the scene, it draws the email and the link lies over it, unseen. */}
				<a
					class={[
						'pointer-events-auto text-[clamp(1.5rem,4vw,3rem)] font-semibold no-underline',
						scened()
							? 'invisible fixed z-3 overflow-hidden whitespace-nowrap text-transparent focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white/60'
							: 'text-white'
					]}
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
