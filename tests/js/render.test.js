/**
 * Drawing a schematic the way the game draws it.
 *
 * A picture is what a player reads first, so a picture that lies is worse than no picture.
 * A belt drawn pointing the wrong way lies about the one thing anyone is looking at.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { bounds, markBox, stampOf } from "../../site/public/forge/render.js";

const size = (name) => (name === "mechanical-drill" ? 2 : 1);

test("the box comes from what the blocks cover, not from what they are stored at", () => {
  /* Mindustry stores a block by its centre and offsets by -(size - 1) / 2, so a two wide
     drill stored at (5, 5) covers (5, 5) to (6, 6). A box measured on stored positions
     crops the far edge of every wide block out of the picture. */
  const box = bounds([{ x: 5, y: 5, block: "mechanical-drill" }], size);
  assert.deepEqual(box, { left: 5, bottom: 5, width: 2, height: 2 });
});

test("the box is tightened onto the build", () => {
  const box = bounds([
    { x: 10, y: 10, block: "conveyor" },
    { x: 13, y: 12, block: "conveyor" },
  ], size);
  assert.deepEqual(box, { left: 10, bottom: 10, width: 4, height: 3 });
});

test("an empty schematic still yields a drawable box", () => {
  /* Returning infinities would make the canvas dimensions NaN, which fails silently as a
     blank white rectangle rather than as an error anyone can act on. */
  assert.deepEqual(bounds([], size), { left: 0, bottom: 0, width: 1, height: 1 });
});

/**
 * The address of the atlas picture, which is what kept a whole deployment from being seen.
 *
 * The picture was asked for as `atlas.png`, one address for bytes that change at every
 * build, cached for a week. A deployment shipped a bigger atlas and the site rendered as
 * garbage until the address changed. So the picture is now asked for at an address derived
 * from the index describing it, and what these check is the only property that matters:
 * a different index must not be able to produce the same address.
 */
test("the stamp moves when the index does", () => {
  const index = JSON.stringify({ sprites: { a: { x: 0, y: 0, w: 32, h: 32 } } });
  const bigger = JSON.stringify({ sprites: { a: { x: 0, y: 0, w: 32, h: 32 },
                                             b: { x: 32, y: 0, w: 32, h: 32 } } });
  assert.notEqual(stampOf(index), stampOf(bigger), "two indexes share one address");

  /* The case that actually happened: the same sprites, moved. The packer repacks from
     scratch, so a new sprite shifts the ones after it, and every one of those shifts has to
     reach the address. */
  const moved = index.replace('"y":0', '"y":64');
  assert.notEqual(stampOf(index), stampOf(moved), "a moved sprite left the address alone");
});

test("the same index always gives the same address", () => {
  /* Otherwise every reload fetches 1.5 MB again, which is the cache this exists to keep. */
  const ecrire = () => JSON.stringify({ sprites: { a: { x: 7, y: 9, w: 32, h: 32 } } });
  assert.equal(stampOf(ecrire()), stampOf(ecrire()));
});

test("the stamp is short and safe in a query string", () => {
  const long = JSON.stringify({ sprites: Object.fromEntries(
    Array.from({ length: 1200 }, (_, i) => [`s${i}`, { x: i, y: i, w: 32, h: 32 }])) });
  const stamp = stampOf(long);
  assert.ok(stamp.length <= 7, `the stamp is ${stamp.length} characters`);
  assert.match(stamp, /^[a-z0-9]+$/, "the stamp needs escaping in a URL");
});

/**
 * A mark covers the block it is on, not the tile the block is stored at.
 *
 * The ring is what says "this is the intake". Drawn one tile wide on a mass driver, which
 * is three by three, it covered the middle ninth of the block and read as a mark on the
 * floor behind it: the reader is back to counting tiles, which is the whole thing the mark
 * removes. Turrets go to four wide, so the error grows with the block.
 */
test("a mark on a single tile covers that tile", () => {
  const box = { left: 0, bottom: 0, width: 5, height: 5 };
  const drawn = markBox({ x: 2, y: 3 }, box, 10, 1);
  assert.deepEqual(drawn, { x: 20, y: 10, span: 10 });
});

test("a mark on a three wide block covers all nine tiles", () => {
  /* Stored at (4, 5), a three wide block covers (3, 4) to (5, 6). Its ring therefore starts
     at column 3, and at the row of y = 6, which is the top of the footprint on screen. */
  const box = { left: 0, bottom: 0, width: 10, height: 10 };
  const drawn = markBox({ x: 4, y: 5 }, box, 8, 3);
  assert.deepEqual(drawn, { x: 24, y: 24, span: 24 });
});

test("a mark on an even sized block follows the game's own truncation", () => {
  /* Mindustry offsets by -(size - 1) / 2 truncated towards zero, so a four wide block
     stored at (6, 6) covers (5, 5) to (8, 8) and not (4, 4) to (7, 7). Rounding the other
     way puts the ring one tile off on every turret. */
  const box = { left: 0, bottom: 0, width: 12, height: 12 };
  const drawn = markBox({ x: 6, y: 6 }, box, 4, 4);
  assert.deepEqual(drawn, { x: 20, y: 12, span: 16 });
});

test("a mark is placed against the drawn box, not against the origin", () => {
  /* The picture is cropped to the build, so a schematic that starts at (30, 30) draws its
     first tile at zero. A mark measured from the origin lands off the canvas entirely. */
  const box = { left: 30, bottom: 30, width: 4, height: 4 };
  const drawn = markBox({ x: 31, y: 31 }, box, 10, 1);
  assert.deepEqual(drawn, { x: 10, y: 20, span: 10 });
});
