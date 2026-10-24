import { createMemo, For, useContext } from 'solid-js';
import { Stage } from '../stage';
import DotGrid from './DotGrid';
import Reveal from './Reveal';
import sprawl from '../images/work/sprawl.png?w=800;1400;2200&format=webp&as=srcset';
import baantower from '../images/work/baantower.webp?w=800;1400;2200&format=webp&as=srcset'; // render from prsc.nl

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
		<section class="relative z-3 mx-auto box-border max-w-6xl px-gutter pb-[30vh]" aria-label="Work">
			{/* Where scrolling comes to rest: each panel settled in its place. */}
			<For each={work}>{(_, k) => <div data-rest class="pointer-events-none absolute h-screen snap-start snap-always" style={{ top: `calc(${k()} * (82vh + 30vh) - ${TOP * 100}vh)` }} />}</For>
			<For each={work}>
				{(item, i) => (
					// Each project a big panel: its image filling it, the words over its lower edge. It holds
					// still TOP of a screen from the top; once the next starts sliding over it, it shrinks a
					// little and dims behind it.
					<article
						class="group sticky top-[9vh] isolate mb-[30vh] h-[82vh] origin-top overflow-hidden rounded-panel bg-[#0a0b1d] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
						ref={(el: HTMLElement) => void panels.push(el)}
						style={{ transform: `scale(${1 - 0.06 * (covered()[i()] ?? 0)})`, filter: `brightness(${1 - 0.6 * (covered()[i()] ?? 0)})` }}
					>
						{/* Until there are images, a soft glow, so the panel isn't flat. */}
						<div
							class="absolute inset-0 -z-1 grid place-items-center bg-[radial-gradient(120%_90%_at_70%_20%,rgb(80_100_200/0.18),transparent_60%)] transition-transform duration-1200 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:scale-[1.03]"
							aria-hidden="true"
						>
							{item.image ? (
								<img
									srcset={item.image}
									sizes="(max-width: 72rem) 100vw, 72rem"
									alt=""
									loading="lazy"
									class="absolute inset-0 size-full object-cover"
									style={item.focus ? { 'object-position': item.focus } : undefined}
								/>
							) : item.dots ? (
								// Fuse's site: its near-black, a warm haze where the dots glow.
								<div class="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_78%_25%,rgb(212_147_89/0.07),transparent_60%),#0d0d0f]">
									<DotGrid color="rgba(212, 147, 89, 0.25)" glow={{ x: 0.78, y: 0.25, radius: 0.45, intensity: 0.5 }} />
								</div>
							) : (
								<span class="text-sm text-white/20">image</span>
							)}
						</div>
						<div class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/60 via-55% to-transparent p-[clamp(24px,4vw,56px)] pt-48">
							<Reveal as="h3" class="m-0 text-title leading-none" text={item.name} />
							<p class="mt-4 mb-0 max-w-xl text-[1.0625rem] leading-normal text-subtle">{item.what}</p>
							<ul class="mt-5 mb-0 flex list-none flex-wrap gap-1.5 p-0">
								<For each={item.tags}>
									{(tag) => <li class="rounded-full border border-white/12 bg-white/6 px-2.75 py-1 text-xs text-white/75">{tag}</li>}
								</For>
							</ul>
						</div>
					</article>
				)}
			</For>
		</section>
	);
}
