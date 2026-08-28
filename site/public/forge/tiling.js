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
