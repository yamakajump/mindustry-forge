/**
 * Drawing a schematic the way the game draws it.
 *
 * A picture is what a player reads first, so a picture that lies is worse than no picture.
 * A belt drawn pointing the wrong way lies about the one thing anyone is looking at.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { bounds, stampOf } from "../../site/public/forge/render.js";

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
