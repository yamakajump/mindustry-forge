/**
 * Where a block sits, given the tile it is stored on.
 *
 * Mindustry stores a block by its centre and offsets by `-(size - 1) / 2`, truncating
 * towards zero, so a two-wide drill stored at (4, 4) covers (4, 4) to (5, 5) and a
 * three-wide one stored at (4, 4) covers (3, 3) to (5, 5). Every distance the game measures
 * between two blocks is measured between those centres, not between the stored tiles, and
 * the two differ by half a tile for every block of even size.
 *
 * Written here rather than in `analyse.js` because `logic.js` needs the same answer and
 * cannot import `analyse.js`, which imports it. A second copy of this formula would be a
 * second thing to have wrong, and it would be wrong only on even sizes, which is the kind
 * of error that cancels itself out on a pair of odd blocks and appears at the first vault.
 */

/** The tiles a block covers, given the tile it is stored on. */
export function footprint(x, y, size) {
  const offset = Math.trunc(-(size - 1) / 2);
  const out = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) out.push([x + offset + dx, y + offset + dy]);
  }
  return out;
}

/** The middle of a block, in tiles, which is what the game measures ranges between. */
export function centre(node) {
  const size = node.block.size || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  return [node.x + offset + size / 2, node.y + offset + size / 2];
}
