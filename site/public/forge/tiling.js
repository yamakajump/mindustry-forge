/**
 * The decisions behind drawing the ground, kept out of the canvas so they can be tested.
 *
 * `render.js` owns the `drawImage` calls and nothing else. What is here is arithmetic, and
 * a canvas is not needed to check arithmetic.
 */

/**
 * Which of a floor's sprites this tile takes.
 *
 * The game asks `Mathf.randomSeed(Point2.pack(x, y), 0, variants - 1)`, and this is
 * deliberately not that. The game seeds on a position in a real map; a schematic's tiles
 * are at local coordinates and do not know where they will be pasted, so an exact port
 * would produce a different pattern from the one the player saw in game anyway. There is no
 * accuracy on offer here, only the absence of repetition, and any well spread hash gives
 * that. Said plainly because "this follows the game's formula" is a claim this repository
 * makes seriously, and it would be false here.
 *
 * The mixing is the finalising half of murmur3, over a pair of odd multipliers, which
 * spreads adjacent inputs rather than merely distinguishing them. `x % count` on a plain
 * sum does distinguish them and stripes the board diagonally, which is the defect wearing
 * a different hat.
 */
export function variantOf(x, y, count) {
  if (count <= 1) return 0;
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) % count;
}

/**
 * The eight neighbours, in `arc.math.geom.Geometry.d8` order.
 *
 * The order matters and is not cosmetic: it is the index into a floor's edge sheet, so
 * turning it changes which cell of the 96 pixel sheet is drawn on which side.
 */
export const D8 = [
  [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1],
];

/** The floor a tile contributes to its neighbour: its overlay when it has one, else itself. */
function contributorAt(ground, x, y, mine) {
  const layers = ground[`${x},${y}`];
  if (!layers?.floor) return null;
  return layers.overlay && layers.floor !== mine ? layers.overlay : layers.floor;
}

/**
 * Which neighbouring floors bleed onto this tile, and from which sides.
 *
 * `Floor.drawEdges` of v159.7, decompiled from `server-release.jar` rather than read off a
 * wiki. The clause worth naming is `doEdge`: a neighbour bleeds when its blend id is higher
 * **or when this tile's floor has no edge sheet at all**. Drop the second half and every
 * patch of a sheetless floor reads as a cut-out with hard borders, which is the state this
 * replaces rather than an improvement on it.
 *
 * Returns one entry per distinct floor, sorted by blend id ascending so that two of them
 * stack the same way on every frame, each carrying the directions it came from.
 */
export function blendersAt(ground, x, y, floors) {
  const mine = ground[`${x},${y}`]?.floor;
  const here = mine ? floors[mine] : null;
  const found = new Map();

  for (const [index, [dx, dy]] of D8.entries()) {
    const name = contributorAt(ground, x + dx, y + dy, mine);
    if (!name || name === mine) continue;

    const other = floors[name];
    if (!other?.out || !other.sheet) continue;
    // `doEdge`: a higher id wins, and a floor whose group has no sheet loses to everything.
    if (here?.sheet && other.blend <= (here.blend ?? 0)) continue;

    const already = found.get(name);
    if (already) already.dirs.push(index);
    else found.set(name, { name, sheet: other.sheet, dirs: [index] });
  }

  return [...found.values()].sort((a, b) => floors[a.name].blend - floors[b.name].blend);
}
