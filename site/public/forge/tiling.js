/**
 * The three decisions behind drawing the ground, kept out of the canvas so they can be
 * tested.
 *
 * `render.js` owns the `drawImage` calls and nothing else. What is here is arithmetic: a
 * canvas is not needed to be sure two tiles meet, and a test that needs one would not have
 * been written.
 */

/**
 * Where one tile lands, in whole pixels, with its neighbours.
 *
 * Both edges are rounded from the same expression, so tile `x`'s right edge is computed as
 * `round((x + 1) * scale)` and tile `x + 1`'s left edge is the same number. Rounding a
 * position and then adding a rounded width does not have that property, and that is the
 * defect this replaces: a one pixel gap between every pair of tiles at any zoom that was
 * not a whole number of pixels.
 */
export function tileRect(x, y, box, scale) {
  const left = Math.round((x - box.left) * scale);
  const right = Math.round((x - box.left + 1) * scale);
  const top = Math.round((box.height - (y - box.bottom) - 1) * scale);
  const bottom = Math.round((box.height - (y - box.bottom)) * scale);
  return {
    x: left,
    y: top,
    // A tile rounded out of existence is a hole in the ground. One pixel is the least a
    // canvas can show, and a thumbnail is exactly where this happens.
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}
