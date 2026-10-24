import { createSignal, onSettled } from 'solid-js';

/**
 * How far the page is scrolled and how big the window is, in CSS pixels, as signals. On the server
 * (and until the page has settled) a 1000 × 800 window at the top.
 */
export function createViewport() {
	const [scroll, setScroll] = createSignal(0, { name: 'scrollY' });
	const [width, setWidth] = createSignal(1000, { name: 'innerWidth' });
	const [height, setHeight] = createSignal(800, { name: 'innerHeight' });
	onSettled(() => {
		const read = () => {
			setScroll(scrollY);
			setWidth(innerWidth);
			setHeight(innerHeight);
		};
		read();
		addEventListener('scroll', read, { passive: true });
		addEventListener('resize', read);
		return () => {
			removeEventListener('scroll', read);
			removeEventListener('resize', read);
		};
	});
	return { scroll, width, height };
}

/** Whether the element is (mostly: `threshold` of it) on screen, as a signal. */
export function createInView(element: () => Element | undefined, threshold = 0.6) {
	const [seen, setSeen] = createSignal(false, { name: 'inView' });
	onSettled(() => {
		const el = element();
		if (!el) return;
		const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { threshold });
		observer.observe(el);
		return () => observer.disconnect();
	});
	return seen;
}
