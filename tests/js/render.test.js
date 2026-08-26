/**
 * Drawing a schematic the way the game draws it.
 *
 * A picture is what a player reads first, so a picture that lies is worse than no picture.
 * A belt drawn pointing the wrong way lies about the one thing anyone is looking at.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { bounds } from "../../site/public/forge/render.js";

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
