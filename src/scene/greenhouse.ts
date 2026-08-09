/**
 * The house the garden stands in, as arithmetic.
 *
 * Putting the plot under glass is not a backdrop swap. It settles a question the
 * open field kept asking: how much world has to exist around a garden before it
 * reads as somewhere. Outdoors the answer is *all of it* — grass to the horizon,
 * hills, a tree line — and every one of those is a surface that has to be
 * plausible from any angle the camera can reach. A greenhouse answers it with a
 * wall three metres away. The horizon is still out there and still lit by the
 * same sun, but it has become weather rather than scenery: seen through glass,
 * softened, and no longer load-bearing.
 *
 * Two properties make it affordable, and both are the horizon's rules restated
 * (DESIGN.md, "what is decoration"):
 *
 *   it carries no signal      nothing about the building moves with a metric
 *   it owns no colour logic   the shared rig lights it, so it scrubs for free
 *
 * The sun and moon stay reachable. Glass is drawn without shadow casting and
 * without depth writes, so the sky, both bodies, and the drag handles that live
 * out at 160 metres are all still there to be grabbed through the roof — which
 * they had to be, because the scrub gesture is the sun and a roof that took it
 * away would have cost the whole of time.
 *
 * Pure, and kept out of the component for the reason `daylight` and `dust` are:
 * the proportions are the design decision, and they should be arguable in a test
 * without a renderer.
 */

/**
 * The floor, in metres relative to the soil surface.
 *
 * This is the whole trick of the raised beds, and it is worth stating plainly
 * because it looks upside down. Beds are raised by **lowering the world**, not by
 * lifting the soil: a plant is placed at y = 0 by `layout.ts`, grafts run between
 * those points, dust settles from them, and sway is measured up from them. Raise
 * the soil and every one of those has to learn a bed height. Drop the floor
 * instead and the soil surface stays exactly where it was, the timber sides fall
 * away beneath it, and nothing above the ground has to know this happened.
 */
export const FLOOR_Y = -0.45;

/** How far the soil stands above the floor. Positive, for the things that build
 *  the timber sides downward from the soil surface. */
export const BED_HEIGHT = -FLOOR_Y;

/** Clear metres of path between the outermost bed and the glass. Enough to walk
 *  down with a watering can, which is the width a greenhouse aisle actually is. */
export const PATH = 2.2;

/**
 * The smallest house a garden gets. A three-bed mock garden is a twelve metre
 * strip barely two metres deep, and a building that tight around it would read
 * as a cold frame rather than as a place with a door in it.
 */
const MIN_WIDTH = 10;
const MIN_DEPTH = 7.5;

/**
 * Top of the dwarf wall the glazing stands on, and the eaves it reaches. **Both
 * are measured up from the floor**, not from the soil surface, which is the one
 * thing to keep straight in here: the floor is a bed's depth below zero, so a
 * knee wall specified against the soil would stand a third taller than intended
 * and read as a parapet with a garden behind it.
 *
 * The knee is set just above the beds' own timber, so the two lines agree rather
 * than nearly agreeing. The eaves are high because the plants are: a grove tree
 * at full maturity is three metres out of the soil, and a glasshouse that clips
 * the tallest thing in it is a glasshouse nobody would have built.
 */
export const KNEE = 0.6;
export const EAVES = 3.4;

/**
 * Ridge rise above the eaves, per metre of depth, and the range it may take.
 * Pitching off the depth is what keeps the roof looking like the same roof on a
 * narrow garden and on the league's twenty metre one; the clamp is what stops a
 * wide house growing a cathedral.
 */
const PITCH = 0.26;
const MIN_RISE = 1.2;
const MAX_RISE = 2.6;

/**
 * Target metres between glazing bars. Real horticultural glass is about this
 * wide, and it is also the spacing at which the bars read as a rhythm rather
 * than as either a cage or a couple of stray posts.
 */
export const BAY = 1.6;

/** The doorway, in the middle of one gable end. Also measured from the floor. */
export const DOOR = { width: 1.15, height: 2.15 };

export interface Shell {
  /** Interior extent along x, the ridge's own axis. */
  width: number;
  /** Interior extent along z, which the roof slopes down across. */
  depth: number;
  knee: number;
  eaves: number;
  ridge: number;
  /** Ridge height above the eaves. */
  rise: number;
  /** Length of one roof slope from eaves to ridge, for sizing a pane. */
  rake: number;
  /** Slope angle from horizontal, in radians. */
  pitch: number;
  /** x of every glazing bar on the long walls, and of every rafter. Both ends
   *  included, so the first and last bar land on the corners. */
  bays: number[];
  /** z of every glazing bar on the gable ends. Both ends included. */
  ribs: number[];
  door: { width: number; height: number };
}

/**
 * Bar positions along a wall of a given length, centred on zero.
 *
 * Both ends are always present, because a corner without a post is a corner
 * where two sheets of glass meet in mid-air. The interior count is whatever puts
 * the spacing nearest the target, so bays are even — an uneven last bay is the
 * single most visible way for a repeated structure to look wrong.
 */
export function bayPositions(length: number, target = BAY): number[] {
  const panels = Math.max(1, Math.round(length / target));
  return Array.from(
    { length: panels + 1 },
    (_, i) => -length / 2 + (length * i) / panels,
  );
}

/**
 * The house that fits a garden of a given footprint.
 *
 * The garden's own size arrives from `layoutGarden`, so a house is a consequence
 * of what is planted rather than a fixed set the layout has to stay inside — and
 * the league, which is eight beds in two rows, gets a bigger building rather than
 * a cramped one.
 */
export function shellFor(size: readonly [number, number]): Shell {
  const width = Math.max(MIN_WIDTH, size[0] + PATH * 2);
  const depth = Math.max(MIN_DEPTH, size[1] + PATH * 2);
  const rise = clamp(depth * PITCH, MIN_RISE, MAX_RISE);
  const ridge = EAVES + rise;

  return {
    width,
    depth,
    knee: KNEE,
    eaves: EAVES,
    ridge,
    rise,
    rake: Math.hypot(depth / 2, rise),
    pitch: Math.atan2(rise, depth / 2),
    bays: bayPositions(width),
    ribs: bayPositions(depth),
    door: DOOR,
  };
}

/**
 * How high the roof stands a given distance in from a long wall, measured from
 * the floor. Everything under glass has to fit beneath this line, and the useful
 * part is that it rises: a bed set back behind the path has considerably more
 * headroom over it than the eaves alone would suggest.
 */
export function roofHeightAt(shell: Shell, fromWall: number): number {
  return shell.eaves + shell.rise * clamp(fromWall / (shell.depth / 2), 0, 1);
}

/**
 * Eye height above the floor. A person standing on the path, not a camera at a
 * convenient altitude — the whole point of the house is that it is a room you
 * are in, and the give-away that you are not is a viewpoint no body could hold.
 */
export const EYE = 1.62;

/**
 * Clear metres kept between the viewer and the glass, and the closest the orbit
 * may pull in to a plant.
 *
 * The far clamp is what actually keeps you indoors. Standing inside once is a
 * starting position and nothing more: the first scroll of a wheel would put the
 * camera through the wall and back out in the field, and a room you can leave by
 * accident is not a room. The near clamp stops the same wheel burying the lens
 * in a trunk.
 */
const WALL_CLEARANCE = 0.6;
const NEAREST = 1.2;

/** Headroom left under the eaves, so rising never clips through the roof. */
const ROOF_CLEARANCE = 0.3;

/**
 * What the viewer looks at: the middle of the planting, a plant's own height up.
 * Aiming at the floor would tip the whole house downward and fill the view with
 * soil; aiming at the ridge would make a building the subject, and the building
 * is not the thing being read.
 */
const TARGET_Y = 1.0;

/** Where a person stands in the house, and how far they may move without leaving it. */
export interface Viewpoint {
  /** Camera position, world space — soil surface is y = 0, floor is below it. */
  position: [number, number, number];
  /** Orbit target: the middle of the planting. */
  target: [number, number, number];
  /** Orbit radius limits. The far one is the wall. */
  minRadius: number;
  maxRadius: number;
  /** Polar limits: `min` is stopped by the roof, `max` by standing height. */
  minPolar: number;
  maxPolar: number;
}

/**
 * Standing inside the house, looking at what is planted in it.
 *
 * The camera used to solve for a distance that fit the whole width in frame,
 * which put it out in the field looking at a building — the garden was a thing
 * on the other side of some glass. Standing in the aisle inverts that: the glass
 * is overhead and around, the far wall is a few metres past the last bed, and
 * the plants are at the height they would be if you had walked in.
 *
 * The radius is the near path rather than a chosen number, so the viewer stands
 * where a person would — on the walkway, not in the soil — and every garden puts
 * them the same distance off the first bed regardless of how big the house it
 * needed was. What changes between a three-bed garden and the league is how much
 * house there is around you, which is the honest difference.
 *
 * Pure, and tested, because these are proportions and not rendering: the failure
 * mode of getting them wrong is a camera inside a wall, and that is arithmetic
 * anyone should be able to argue with in a test.
 */
export function viewpointFor(shell: Shell): Viewpoint {
  const eyeY = FLOOR_Y + EYE;

  // The wall you would back into first. Width is the ridge's axis and usually
  // the long one, so on most gardens this is the depth — but a garden that
  // wraps into two short rows can invert that, and taking the smaller of the
  // two is what keeps the clamp honest either way.
  const maxRadius = Math.max(
    NEAREST + 0.1,
    Math.min(shell.width, shell.depth) / 2 - WALL_CLEARANCE,
  );

  // Standing at the back of the near path, which is the far clamp itself: it is
  // the same wall in both cases, and starting anywhere short of it would mean
  // the first scroll outward moved the viewer for no reason.
  const rise = eyeY - TARGET_Y;
  const ground = Math.sqrt(Math.max(0, maxRadius * maxRadius - rise * rise));

  // How far up the orbit may swing before the camera meets the glass. Measured
  // against the eaves rather than the ridge, because the eaves are the low edge
  // and a viewer who cleared the ridge would still be through the roof at the
  // side where it comes down.
  const headroom = FLOOR_Y + shell.eaves - ROOF_CLEARANCE - TARGET_Y;
  const minPolar = Math.acos(clamp(headroom / maxRadius, 0, 1));

  return {
    position: [0, eyeY, ground],
    target: [0, TARGET_Y, 0],
    minRadius: NEAREST,
    maxRadius,
    minPolar,
    // Just short of level, so the orbit never drops under the target and looks
    // up at the garden through the floor.
    maxPolar: Math.PI / 2.05,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
