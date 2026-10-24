// Where the camera and the flock are in the dusk scene: kept apart from scene.ts, so the page can
// know them without loading the scene (Babylon) itself.

/** The camera stands on the near shore, a little up on the dike, looking out over the lake. */
export const EYE: [number, number, number] = [0, 2.2, 0];
export const TARGET: [number, number, number] = [0, EYE[1] + 10, -100];
export const FOV = 0.85; // vertical, radians

/** Where the flock flies in this scene, for the boids' own renderer (see Placement in boids/app):
 *  a fifth of a metre to one of its units, 500 m out. With `box` below, its space is 600 m wide and
 *  140 m tall, its floor 40 m over the water, so the birds keep clear of the land. */
export const placement = { eye: EYE, target: TARGET, fov: FOV, center: [0, 110, -500] as [number, number, number], scale: 0.2, water: 0 };
/** The flock's box for this scene, in its own units (see `box` in boids/params). */
export const box: [number, number, number] = [3000, 700, 1400];
