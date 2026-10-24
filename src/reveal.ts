/**
 * Titles come in a word at a time (or with `letters`, a letter at a time): each settles into place,
 * a little after the one before, sharpening as it comes (the styles are in Reveal.astro). `split`
 * sets a title up; `reveal` plays it in, or takes it out again so it can play the next time.
 */
const STAGGER = 40;

export function split(el: HTMLElement, { letters = false } = {}) {
	// Line breaks (newlines in the text) are kept.
	const lines = el.textContent!.trim().split(/\n/).map((line) => line.trim().split(/\s+/));
	const words = lines.flat();
	const pieces = letters ? words.join('').length : words.length;
	el.textContent = '';
	// Longer titles go a little quicker a piece, so they don't take forever: up to six pieces at
	// STAGGER ms each, beyond that less, by the root of how many more.
	el.style.setProperty('--stagger', `${STAGGER / Math.sqrt(Math.max(1, pieces / 6))}ms`);
	let i = 0;
	lines.forEach((line, l) => {
		if (l > 0) el.append(document.createElement('br'));
		for (const word of line) {
			// A word stays whole on its line; what moves is it, or each of its letters.
			const box = document.createElement('span');
			box.className = 'word';
			for (const piece of letters ? [...word] : [word]) {
				const inner = document.createElement('span');
				inner.textContent = piece;
				inner.style.setProperty('--i', String(i++));
				box.append(inner);
			}
			el.append(box, ' ');
		}
	});
	el.classList.add('reveal');
}

export function reveal(el: Element, on: boolean) {
	el.classList.toggle('in', on);
}

/** Plays each title in as it comes into view, and out once it has gone. */
export function revealInView(els: Iterable<HTMLElement>) {
	const seen = new IntersectionObserver((entries) => entries.forEach((e) => reveal(e.target, e.isIntersecting)), { threshold: 0.6 });
	for (const el of els) {
		split(el);
		seen.observe(el);
	}
}
