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
 * The eight neighbours, in `arc.math.geom.Geometry.d8` order as decompiled from the pinned
 * jar.
 *
 * The order is kept faithful to the game because this file follows the game elsewhere and
 * a silent departure here would be one more thing for a reader to have to notice. It is
 * NOT load-bearing: `edgeCell` derives its cell from the `(dx, dy)` offsets themselves
 * rather than from a position in this array, so `blendersAt` and `render.js` only need the
 * array to be a self-consistent bookkeeping key between the two of them, and reordering it
 * would change nothing either would draw.
 */
export const D8 = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/**
 * The floor a tile contributes to its neighbour, which is its floor and never its overlay.
 *
 * The game's expression is `(this != tile.floor() && other.overlay() != air) ? other.overlay()
 * : other.floor()`. The tempting misreading is that `this` is the neighbour, making the clause
 * "prefer the layer on top". It is not: `this` is the block whose `drawEdges` is running and
 * `tile` is the tile being drawn, so `this != tile.floor()` is a property of the tile at the
 * centre. It is true only on the overlay pass described beside `blendersAt`. On the floor pass,
 * the one modelled here, it is false on every tile, and the neighbour's own overlay never
 * enters the choice.
 *
 * Getting this wrong does not swap one sheet for another. Every overlay in the catalogue has
 * `sheet: null`, so returning one drops the neighbour at the sheet guard below: painting copper
 * ore on a grass tile bordering stone would stop the grass bleeding at that tile alone, which
 * punches a hole in a boundary that is continuous everywhere else.
 */
function contributorAt(ground, x, y) {
  return ground[`${x},${y}`]?.floor || null;
}

/**
 * Which neighbouring floors bleed onto this tile, and from which sides.
 *
 * The floor pass of `Floor.drawEdges` in v159.7, decompiled from `server-release.jar` rather
 * than read off a wiki. Two departures, named rather than left for a reader to discover:
 *
 * - `drawBase` runs `drawMain; if(drawEdgeIn) drawEdges; drawOverlay`, and `drawOverlay` calls
 *   `drawBase` again on the tile's own overlay block. That re-entry runs `drawEdges` a second
 *   time with `this` set to the overlay, so it uses the overlay's blend id and its `edges`, and
 *   it is where the neighbour's overlay clause finally applies. It is not implemented here: a
 *   tile's overlay bleeds onto nothing.
 * - `doEdge` compares `realBlendId`, which for a liquid floor under a non-ore overlay composes
 *   a negative value rather than returning `blendId`. This compares `blendId` alone.
 *
 * The clause worth naming inside `doEdge` is the second half: a neighbour bleeds when its blend
 * id is higher **or when this tile's floor has no edge sheet at all**. Drop it and every patch
 * of a sheetless floor reads as a cut-out with hard borders, which is the state this replaces
 * rather than an improvement on it.
 *
 * Returns one entry per distinct floor, each carrying the directions it came from, sorted by
 * **block id** ascending. That is the game's own key: `drawBlended` sorts on
 * `floor.id + (this != tile.floor() && floor == tile.floor() ? 99999 : 0)`, and the bump can
 * only fire on the overlay pass, so on this pass the key is the id alone. Blend id is a
 * different field and sorting on it leaves ties, because a blend group hands one blend id to
 * several floors that keep their own ids.
 */
export function blendersAt(ground, x, y, floors) {
  const mine = ground[`${x},${y}`]?.floor;
  const here = mine ? floors[mine] : null;
  const found = new Map();

  // `drawBase` reaches `drawEdges` only when the tile's own floor has `drawEdgeIn`. Fourteen
  // floors say no, `colored-floor` and every `metal-tiles-*`, and they receive no boundary at
  // all whatever surrounds them.
  if (here?.in === false) return [];

  for (const [index, [dx, dy]] of D8.entries()) {
    const name = contributorAt(ground, x + dx, y + dy);
    if (!name || name === mine) continue;

    const other = floors[name];
    if (!other?.out || !other.sheet) continue;
    // `drawEdges` skips a neighbour whose floor sits on another `cacheLayer`, because the game
    // draws those in a pass of their own. Without it `deep-water` collects a sliver of the
    // `stone` beside it, since stone's blend id is the higher of the two.
    if ((other.layer ?? "normal") !== (here?.layer ?? "normal")) continue;
    // `doEdge`: a higher id wins, and a floor whose group has no sheet loses to everything.
    if (here?.sheet && other.blend <= (here.blend ?? 0)) continue;

    const already = found.get(name);
    if (already) already.dirs.push(index);
    else found.set(name, { name, sheet: other.sheet, dirs: [index] });
  }

  return [...found.values()].sort((a, b) => floors[a.name].id - floors[b.name].id);
}

/**
 * Which cell of a floor's nine cell edge sheet carries the material that spills from a
 * neighbour in direction `(dx, dy)`.
 *
 * A neighbour's floor spills onto this tile along the edge the two share, so the material
 * has to sit on the side the neighbour is on: a neighbour to the north paints the top of
 * the cell, one to the east paints the right. The game's own `edges[i][2 - j]` already
 * turns a y-up game coordinate into an image row that grows downwards; a canvas row also
 * grows downwards, so converting a second time on the way into `drawImage` undoes the
 * first conversion instead of applying it. This function performs the conversion exactly
 * once. Which cell that is was measured out of the atlas rather than reasoned out a second
 * time, and `tests/js/tiling.test.js` decodes the sheet and measures it again on every run:
 * a packer that transposed or flipped it fails there instead of quietly drawing a boundary
 * on the wrong side of every tile.
 */
export function edgeCell(dx, dy) {
  return { col: 1 - dx, row: 1 + dy };
}
