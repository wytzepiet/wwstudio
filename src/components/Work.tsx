import { createMemo, For, useContext } from 'solid-js';
import { Stage } from '../stage';
import DotGrid from './DotGrid';
import Reveal from './Reveal';
import sprawl from '../images/work/sprawl.png?w=800;1400;2200&format=webp&as=srcset';
import baantower from '../images/work/baantower.webp?w=800;1400;2200&format=webp&as=srcset'; // render from prsc.nl
import './Work.css';

/** The panels stack: each holds still TOP of a screen from the top while the next slides over it. */
export const TOP = 0.09;

export const work = [
	{
		name: 'Sprawl',
		image: sprawl,
		what: 'A multiplayer city-building and traffic game. A Rust simulation server, and a WebGPU client that draws the whole city from code, without a single asset.',
		tags: ['Rust', 'WebGPU', 'Multiplayer', 'In development']
	},
	{
		name: 'Fuse',
		dots: true, // Fuse's own dot grid, from its site
		what: 'An app framework: native apps written in TypeScript and SolidJS, running in QuickJS inside Flutter through Rust, and updated over the air.',
		tags: ['Rust', 'Flutter', 'SolidJS', 'In development']
	},
	{
		name: 'Real-estate sites',
		image: baantower,
		focus: '50% 100%', // the bottom of a tall render: the arches and the street
		what: 'Websites for Dutch real-estate developments, built at PRSC: Baantower, KLOOS, Tree House Rotterdam and more.',
		tags: ['Next.js', 'Sanity', 'Vercel']
	}
];

/** The work: an ordinary page, scrolling up over where the flight left off. Each project a big
 *  panel, its image filling it, the words over its lower edge. */
export default function Work() {
	const stage = useContext(Stage);
	// The panels, in order (the list never changes).
	const panels: HTMLElement[] = [];
	/** How far each panel is covered by the next one sliding over it (0 to 1). */
	const covered = createMemo(
		() => {
			stage.viewport.scroll();
			const h = stage.viewport.height();
			return panels.map((panel, i) => {
				const next = panels[i + 1];
				if (!next) return 0;
				const top = panel.getBoundingClientRect().top;
				return Math.min(Math.max((h - next.getBoundingClientRect().top) / (h - top), 0), 1);
			});
		},
		{ name: 'covered' }
	);
	return (
		<section class="work" aria-label="Work">
			{/* Where scrolling comes to rest: each panel settled in its place. */}
			<For each={work}>{(_, k) => <div class="rest" style={{ top: `calc(${k()} * (82vh + 30vh) - ${TOP * 100}vh)` }} />}</For>
			<For each={work}>
				{(item, i) => (
					// Once the next starts sliding over it, it shrinks a little and dims behind it.
					<article
						class="item"
						ref={(el: HTMLElement) => void panels.push(el)}
						style={{ transform: `scale(${1 - 0.06 * (covered()[i()] ?? 0)})`, filter: `brightness(${1 - 0.6 * (covered()[i()] ?? 0)})` }}
					>
						<div class="image" aria-hidden="true">
							{item.image ? (
								<img
									srcset={item.image}
									sizes="(max-width: 72rem) 100vw, 72rem"
									alt=""
									loading="lazy"
									style={item.focus ? { 'object-position': item.focus } : undefined}
								/>
							) : item.dots ? (
								<div class="fuse">
									<DotGrid color="rgba(212, 147, 89, 0.25)" glow={{ x: 0.78, y: 0.25, radius: 0.45, intensity: 0.5 }} />
								</div>
							) : (
								<span>image</span>
							)}
						</div>
						<div class="about">
							<Reveal as="h3" text={item.name} />
							<p>{item.what}</p>
							<ul class="tags">
								<For each={item.tags}>{(tag) => <li>{tag}</li>}</For>
							</ul>
						</div>
					</article>
				)}
			</For>
		</section>
	);
}
