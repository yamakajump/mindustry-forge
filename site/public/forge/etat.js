/**
 * What a running block is doing, read off the stepped world and never invented.
 *
 * A plan that runs shows things moving and says nothing about them. To find out whether a
 * machine is keeping up you clicked it, read the panel, clicked the next one: on a
 * thirty-seven block schematic that is thirty-seven clicks to answer one question, and the
 * question is the whole reason to watch it run.
 *
 * Two figures, and both are ones the engine already keeps:
 *
 *   - `state.efficiency`, which is how well a machine is being fed. `machines.js` records
 *     it on every step and uses it to climb the warmup that lights a smelter, so it is a
 *     fact about the simulation and not a reading taken beside it.
 *   - `items.total` against the block's own capacity, for the things whose job is to hold
 *     items. A vault filling up and a vault emptying are the two ends of a design working
 *     or not, and they look identical.
 *
 * Nothing here computes anything. `live.js` says the renderer is handed a world that has
 * been stepped rather than a clock of its own, and that is what makes the picture worth
 * trusting; an overlay showing a figure the engine did not produce would spend exactly that
 * trust on a decoration.
 */

/** The blocks whose job is to hold things, rather than to hold what they are working on. */
const RESERVES = new Set(["store", "core"]);

const borne = (part) => Math.max(0, Math.min(1, part));

/**
 * The one thing worth saying about a building, or nothing.
 *
 * A machine first: a crafter also holds items, and how well it is running is what somebody
 * watching it wants, not how full its input buffer happens to be between two crafts.
 */
export function etatDe(build) {
  if (!build || build.state?.dead) return null;

  const efficiency = build.state?.efficiency;
  if (typeof efficiency === "number" && Number.isFinite(efficiency)) {
    return { kind: "machine", part: borne(efficiency) };
  }

  const role = build.node?.role ?? build.block?.role;
  if (RESERVES.has(role)) {
    const capacity = build.block?.item_capacity || 0;
    const held = build.items?.total ?? 0;
    if (capacity > 0) return { kind: "stock", part: borne(held / capacity), held, capacity };
  }

  return null;
}

/**
 * What colour says it, from green through amber to red.
 *
 * The same reading either way round, deliberately: a machine at a tenth and a vault at a
 * tenth are both worth a look, one because it is starving and the other because it is about
 * to. A vault filling to the brim is the interesting one and it reads green, which is a
 * limit of one colour scale and cheaper than two the reader has to keep apart.
 */
export function couleurDe(part) {
  if (part >= 0.995) return "#57d977";
  if (part >= 0.6) return "#e8c05a";
  if (part >= 0.25) return "#e89a4a";
  return "#e2685f";
}

/**
 * Whether a figure can be written at this zoom, rather than drawn.
 *
 * The plan is a canvas between eight and forty-eight pixels to a tile, and a one-by-one
 * belt at twenty-four has no room for a number. Below this, the bar is the whole message:
 * a bar survives any zoom, a percentage becomes two grey pixels exactly on the large
 * schematics where it would help most.
 */
export const LISIBLE = 34;

/** How thick the bar is, in pixels, whatever the zoom. Three is visible and not a stripe. */
export const EPAISSEUR = 3;
