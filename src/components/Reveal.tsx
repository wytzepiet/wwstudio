import { createMemo, For } from 'solid-js';
import { dynamic, type JSX } from '@solidjs/web';
import { createInView } from '../lib/viewport';

const STAGGER = 40;

/**
 * A title that comes in a word at a time (or with `letters`, a letter at a time): each settles into
 * place a little after the one before, sharpening as it comes, and with `out` it dissolves again,
 * drifting up. Without `in` it comes in as it scrolls into view and goes once it has gone.
 * Newlines in the text are kept as line breaks; a word stays whole on its line.
 */
export default function Reveal(props: { text: string; letters?: boolean; in?: boolean; out?: boolean; as?: string; class?: JSX.ClassValue }) {
	const parts = createMemo(() => {
		let i = 0;
		const lines = props.text
			.trim()
			.split('\n')
			.map((line) => line.trim().split(/\s+/).map((word) => (props.letters ? [...word] : [word]).map((text) => ({ text, i: i++ }))));
		// Longer titles go a little quicker a piece, so they don't take forever: up to six pieces at
		// STAGGER ms each, beyond that less, by the root of how many more.
		return { lines, stagger: STAGGER / Math.sqrt(Math.max(1, i / 6)) };
	});
	let el: HTMLElement | undefined;
	const seen = createInView(() => el);
	const Tag = dynamic(() => props.as ?? 'p');
	return (
		<Tag
			ref={(e: HTMLElement) => (el = e)}
			class={[props.class, 'reveal', { in: props.in ?? seen(), out: props.out }]}
			style={{ '--stagger': `${parts().stagger}ms` }}
		>
			<For each={parts().lines}>
				{(line, l) => (
					<>
						{l() > 0 && <br />}
						<For each={line}>
							{(word) => (
								<>
									<span class="word">
										<For each={word}>{(piece) => <span style={{ '--i': piece.i }}>{piece.text}</span>}</For>
									</span>{' '}
								</>
							)}
						</For>
					</>
				)}
			</For>
		</Tag>
	);
}
