// One step for one boid. Reads the sorted boids (neighbours sit together in memory) and writes
// the result back in sorted order, so next frame starts out nearly sorted.
//
// The rules are the old site's boid.vert, found by eye and kept with its constants; the sep, ali,
// coh and seek weights multiply them, 1 being the old site exactly. It flew 2 units a frame at
// 60 fps, so one of its forces is ours × 30 × maxSpeed per second.

@group(0) @binding(1) var<storage, read> sorted: array<Boid>;
@group(0) @binding(2) var<storage, read> starts: array<u32>;
@group(0) @binding(3) var<storage, read_write> boids: array<Boid>;

fn pcg(v: u32) -> u32 {
	let s = v * 747796405u + 2891336453u;
	let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
	return (w >> 22u) ^ w;
}

fn clampLength(v: vec3f, m: f32) -> vec3f {
	let l = length(v);
	return select(v, v / l * m, l > m);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x;
	if (i >= sim.count) { return; }
	let me = sorted[i];
	let p = me.pos.xyz;
	let v = me.vel.xyz;

	// Everyone within `radius`. Crowded cells are sampled, at most maxPerCell boids from a spot
	// that changes every frame, and not scaled back up: the old grid held 20 boids a cell (fewer,
	// where its slots collided), so in a crowd its sums stopped growing, and so do these.
	let c = vec3i(cellCoord(p));
	let r2 = sim.radius * sim.radius;
	let seed = pcg(i ^ (sim.frame * 0x9E3779B9u));
	var sep = vec3f(0.0);
	var ali = vec3f(0.0);
	var coh = vec3f(0.0);
	var nearness = 0.0; // Σ 1 / distance
	var heard = 0.0;    // neighbours read
	var seen = 0.0;     // neighbours there, sampled or not: the glow

	for (var dz = -1; dz <= 1; dz++) {
		for (var dy = -1; dy <= 1; dy++) {
			for (var dx = -1; dx <= 1; dx++) {
				let n = c + vec3i(dx, dy, dz);
				if (any(n < vec3i(0)) || any(n >= vec3i(sim.dims))) { continue; }
				let cell = cellIndex(vec3u(n));
				let s = starts[cell];
				let count = starts[cell + 1u] - s;
				if (count == 0u) { continue; }
				let m = min(count, sim.maxPerCell);
				let offset = (seed + cell * 2654435761u) % count;
				let scale = f32(count) / f32(m);
				for (var k = 0u; k < m; k++) {
					let j = s + (offset + k) % count;
					if (j == i) { continue; }
					let o = sorted[j];
					let d = o.pos.xyz - p;
					let dd = dot(d, d);
					if (dd > r2 || dd < 1e-6) { continue; }
					let dist = sqrt(dd);
					sep -= d / dd;            // each pushes back with 1 / distance: crowds burst apart
					ali += o.vel.xyz / dist;  // the nearest count most
					nearness += 1.0 / dist;
					coh += d;
					heard += 1.0;
					seen += scale;
				}
			}
		}
	}

	// Alignment: the neighbours' velocities less its own, by 1 / distance. Leaving its own velocity
	// in (as the old site's first version did) gives ordered crowds inertia: the big forward term
	// fills the cap, so seek and wander only move the ragged edges. Taking it out lets them act
	// everywhere, which with the wander is the look chosen.
	ali -= v * nearness;

	let n = 1.0 + heard; // the old site counted the boid itself
	var force = sep * sim.radius * sim.wSep
		+ ali * sim.radius / (max(n, 8.0) * sim.maxSpeed) * 5.0 * sim.wAli
		+ coh / (max(n, 18.0) * sim.radius) * 36.0 * sim.wCoh; // the floors keep small groups loose

	let toGoal = sim.goal - p;
	if (dot(toGoal, toGoal) > 1.0) { force += normalize(toGoal) * sim.wSeek; }

	// Wander: an ABC flow, a chaotic flow field with no sources or sinks. Boids close together get
	// steered alike and boids far apart don't, so neighbourhoods drift off into strands.
	let w = p / sim.wanderScale * 6.2831853;
	let t = sim.time * sim.wanderSpeed;
	force += sim.wWander * 0.5 * vec3f(
		sin(w.z + t) + cos(w.y - t * 0.7),
		sin(w.x + t * 0.8) + cos(w.z + t * 0.5),
		sin(w.y - t * 0.6) + cos(w.x + t * 0.9),
	);

	// Walls: a push that starts in the outer tenth of the box and grows past it.
	let half = sim.boxSize * 0.5;
	let q = (p - (sim.boxMin + half)) / half;
	force -= sim.wBounds * sign(q) * max(abs(q) - 0.8, vec3f(0.0)) / 0.2;

	// Capped at maxAccel (the old site's limit(…, 0.2) is maxAccel = 6 × maxSpeed), and always
	// flying at exactly maxSpeed, as there.
	let steer = clampLength(force * 30.0 * sim.maxSpeed, sim.maxAccel);
	var vel = normalize(v + steer * sim.dt) * sim.maxSpeed;

	// The loader. Held, each boid has its own place on a ring facing the camera, fixed by its id. The
	// ring fills clockwise from the top as `progress` goes to 1. A boid whose place is not filled
	// yet rides in the head, a bright knot at the leading end, and drops off into its place as the
	// head passes it: so the loader starts as one blinding point holding every boid, and draws the
	// ring like a comet laying down its trail. The stroke has round ends (they draw in over the last
	// few percent, so the closed ring has no seam), and each boid circles the stroke's core at its
	// own pace, so it twists like a rope. Full, the ring spins. `hold` blends all of this in and
	// back out of the flock.
	//
	// It is alive, not drawn: the ring holds the boids only so hard, so their own flocking keeps them
	// jostling in a loose band, and now and then a few let go, peel away and are pulled back; waves
	// of birds surge round it, bunching into knots that swell outward; and it beats. All of it builds
	// as the ring fills; the moment it is full the band draws tight and the beat stops, but the surges
	// run on, and as it draws in to the point it bursts from they race round it ever faster
	// (`surgePhase`, run ahead by the engine).
	let who = u32(me.vel.w);
	var present = 1.0;
	if (sim.hold > 0.0) {
		let rand = vec4f(vec4u(pcg(who), pcg(who ^ 0x5bd1e995u), pcg(who ^ 0x27d4eb2du), pcg(who ^ 0x165667b1u)) % vec4u(65536u)) / 65536.0;
		// How restless it is: building as it fills, and none once it is full.
		let full = step(1.0, sim.progress);
		let energy = smoothstep(0.0, 0.85, sim.progress) * (1.0 - full);
		let beat = pow(max(sin(sim.time * 2.4 + sim.progress * 20.0), 0.0), 10.0) * energy;
		let radius = sim.ringRadius * (1.0 + 0.05 * beat);
		let thick = sim.ringRadius * 0.07 * (1.0 + 1.2 * energy);
		let cap = thick * (1.0 - smoothstep(0.95, 1.0, sim.progress));
		let arc = sim.progress * 6.2831853 * sim.ringRadius;
		let s = rand.x * 6.2831853 * sim.ringRadius; // its place along the whole ring
		let filled = s <= arc;
		let past = max(max(cap - s, s - (arc - cap)), 0.0);
		let width = sqrt(max(thick * thick - past * past, 0.0));
		let a0 = 1.5707963 - s / sim.ringRadius - sim.ringAngle;
		// The surges: waves running round it, shifting each boid along the ring toward the nearest
		// crest (so they bunch there), and swelling the band where they are.
		let wave = 3.0 * a0 - sim.surgePhase;
		let surge = mix(0.3 + 0.7 * energy, 1.0, full);
		let a = a0 + 0.2 * surge * sin(wave);
		let swell = 1.0 + 1.2 * surge * max(cos(wave), 0.0);
		let b = rand.y * 6.2831853 + sim.time * (rand.w - 0.5) * 3.0;
		let tube = width * swell * sqrt(rand.z);
		let around = vec3f(cos(a), sin(a), 0.0);
		var place = sim.goal + around * (radius + tube * cos(b)) + vec3f(0.0, 0.0, tube * sin(b));
		if (!filled) {
			// In the head: somewhere in a ball round the leading end, a little ahead of the stroke.
			let tip = 1.5707963 - arc / sim.ringRadius - sim.ringAngle;
			let off = normalize(vec3f(rand.y, rand.z, rand.w) * 2.0 - 1.0 + 1e-3) * pow(rand.z, 0.33);
			place = sim.goal + vec3f(cos(tip), sin(tip), 0.0) * radius + off * thick * 1.6;
		}
		// While the ring fills, seen only once it is near: from further away (where it started, say)
		// it comes unseen. Once full, everyone is seen: the ring tensing and bursting flings boids far
		// from their places, and they must not fade out for it.
		if (sim.progress < 1.0) {
			present = 1.0 - smoothstep(thick * 5.0, thick * 9.0, distance(p, place));
		}
		let orbit = vec3f(sin(a), -cos(a), 0.0) * sim.ringRadius * sim.ringSpin * step(1.0, sim.progress);
		// How hard it is held: less the more restless it is, firmly when full. A few at a time let go
		// for a moment (each now and then, at its own time) and drift off with the flock.
		let loose = smoothstep(0.9, 1.0, fract(rand.w * 13.0 + sim.time * 0.25)) * energy;
		let grip = mix(1.0, 0.45, energy) * (1.0 - 0.9 * loose);
		vel = mix(vel, (place - p) * sim.ringPull + orbit, sim.hold * grip);
	}
	// Fades in and out over about a fifth of a second.
	let presence = mix(me.push.w, present, 1.0 - exp(-sim.dt * 8.0));

	// The release: one frame's kick outward from the ring's middle, which the push then lets fade.
	var kick = vec3f(0.0);
	if (sim.burst > 0.0) {
		let fromMiddle = p - sim.goal;
		let jitter = f32(pcg(who ^ sim.frame) % 1024u) / 1024.0;
		kick = fromMiddle / max(length(fromMiddle), 1e-3) * sim.burst * (0.6 + 0.8 * jitter);
	}

	// The pointer, as on the old site: boids near the segment it swept this frame (on screen) get
	// a push along its motion and away from it, kept apart from their own velocity and decaying.
	var push = me.push.xyz * exp(-sim.dt * sim.pushDecay) + kick;
	let clip = sim.viewProj * vec4f(p, 1.0);
	if (sim.mouseOn > 0.0 && clip.w > 0.0) {
		let aspect = vec2f(sim.aspect, 1.0);
		let at = clip.xy / clip.w * aspect;
		let a = sim.mouse.xy * aspect;
		let ab = sim.mouse.zw * aspect - a;
		let along = clamp(dot(at - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
		let away = at - (a + ab * along);
		let dist = length(away);
		if (dist < sim.mouseRadius) {
			let f = 1.0 - dist / sim.mouseRadius;
			let perNdc = clip.w * sim.tanHalfFov; // world units per NDC unit at this depth
			let drag = (sim.camRight * sim.mouseVel.x * sim.aspect + sim.camUp * sim.mouseVel.y) * perNdc;
			let outward = (sim.camRight * away.x + sim.camUp * away.y) / max(dist, 1e-4);
			// The mouse may build the push up to 4 × maxSpeed, but never cut back one already faster
			// (a burst's), or a cursor at rest would stand in the blast like a wall.
			let cap = max(length(push), sim.maxSpeed * 4.0);
			push = clampLength(push + (drag + outward * length(drag) * 0.6) * f * f * sim.wMouse * sim.dt * 6.0, cap);
		}
	}

	boids[i] = Boid(vec4f(p + (vel + push) * sim.dt, seen), vec4f(vel, me.vel.w), vec4f(push, presence));
}
