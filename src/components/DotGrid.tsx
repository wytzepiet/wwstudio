import { onSettled } from 'solid-js';
import './DotGrid.css';

/**
 * The dot grid of Fuse's own site (solid-fuse/packages/docs/components/home/dot-grid.tsx): a canvas
 * of small dots filling its parent, bigger and brighter in a swirl round a glow. `glow`: where it
 * is (0 to 1 of the width and height), how far it reaches (of the longer side), how strong.
 */
export default function DotGrid(props: {
	color?: string;
	spacing?: number;
	glow?: { x: number; y: number; radius: number; intensity: number };
}) {
	let canvas!: HTMLCanvasElement;
	onSettled(() => {
		const parent = canvas.parentElement!;
		const spacing = props.spacing ?? 14;
		const glow = props.glow;
		// The colour's parts, read once by painting it.
		const probe = document.createElement('canvas').getContext('2d')!;
		probe.fillStyle = props.color ?? 'rgba(212, 147, 89, 0.18)';
		probe.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;

		let size = '';
		const draw = () => {
			const w = parent.clientWidth;
			const h = parent.clientHeight;
			if (`${w}x${h}` === size) return;
			size = `${w}x${h}`;
			const dpr = devicePixelRatio || 1;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			const ctx = canvas.getContext('2d')!;
			ctx.scale(dpr, dpr);
			const cx = glow ? glow.x * w : 0;
			const cy = glow ? glow.y * h : 0;
			const reach = glow ? glow.radius * Math.max(w, h) : 0;
			for (let y = spacing / 2; y < h; y += spacing) {
				for (let x = spacing / 2; x < w; x += spacing) {
					let alpha = a / 255;
					let radius = 0.7;
					if (glow) {
						const dx = x - cx;
						const dy = y - cy;
						const norm = Math.hypot(dx, dy) / reach;
						if (norm < 1) {
							const t = 1 - norm;
							// A ripple round the glow, for the swirl.
							const wave = Math.sin(norm * 12 + Math.atan2(dy, dx) * 3) * 0.45 + 0.55;
							alpha += t * t * glow.intensity * wave;
							radius += t * glow.intensity * 2.5;
						}
					}
					ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
					ctx.beginPath();
					ctx.arc(x, y, radius, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		};
		draw();
		const observer = new ResizeObserver(() => requestAnimationFrame(draw));
		observer.observe(parent);
		return () => observer.disconnect();
	});
	return <canvas class="dot-grid" ref={canvas} />;
}
