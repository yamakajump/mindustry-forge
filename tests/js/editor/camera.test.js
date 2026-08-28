/**
 * Where we're looking, and which tile is under the cursor.
 *
 * Tested in isolation because this is exactly where off-by-one-tile errors live: a
 * conversion off by half a pixel places the block next to where the player saw it, and
 * nothing on screen says why. It's the kind of bug that looks like a click problem.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createCamera } from "../../../site/public/forge/editor/camera.js";

const vue = { width: 800, height: 600 };

test("the center of the view is where the camera is looking", () => {
  const camera = createCamera({ scale: 20, x: 10, y: 5 });
  assert.deepEqual(camera.toTile(400, 300, vue), { x: 10, y: 5 });
});

test("going to screen and back gives the same tile", () => {
  const camera = createCamera({ scale: 17, x: -3, y: 8 });
  for (const [tx, ty] of [[0, 0], [-3, 8], [40, -12], [63, 63]]) {
    const { px, py } = camera.toScreen(tx, ty, vue);
    assert.deepEqual(camera.toTile(px, py, vue), { x: tx, y: ty },
                     `round trip broke at ${tx},${ty}`);
  }
});

test("the screen counts downward, the map counts upward", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  assert.ok(camera.toScreen(0, -1, vue).py > camera.toScreen(0, 1, vue).py,
            "the vertical axis is not flipped");
});

test("the whole rectangle of a tile returns that tile", () => {
  /* The conversion rounds down, never to the nearest: with `Math.round`, half of every
     tile spilled over onto its neighbor, and a click on the right side of a tile placed
     the block one over.

     The rectangle is asked of `rectOf`, not `toScreen`: a tile's point is its bottom-left
     corner, its rectangle starts at its top-left corner, and the screen counts the
     opposite way from the map. */
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const { px, py, size } = camera.rectOf(3, 3, vue);
  assert.equal(size, 20);
  assert.deepEqual(camera.toTile(px + 1, py + 1, vue), { x: 3, y: 3 });
  assert.deepEqual(camera.toTile(px + size - 1, py + size - 1, vue), { x: 3, y: 3 });
});

test("two neighboring tiles have rectangles that touch", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const bas = camera.rectOf(0, 0, vue);
  const haut = camera.rectOf(0, 1, vue);
  assert.equal(haut.py + haut.size, bas.py, "a gap separates two tiles that should be flush");
});

test("zooming keeps the tile that was under the cursor there", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const avant = camera.toTile(650, 120, vue);
  camera.zoomAt(2, 650, 120, vue);
  assert.deepEqual(camera.toTile(650, 120, vue), avant);
});

test("zoom is bounded on both sides", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  for (let i = 0; i < 40; i++) camera.zoomAt(2, 400, 300, vue);
  assert.ok(camera.scale <= 64, `zoom ran off to ${camera.scale}`);
  for (let i = 0; i < 80; i++) camera.zoomAt(0.5, 400, 300, vue);
  assert.ok(camera.scale >= 4, `zoom ran off to ${camera.scale}`);
});

test("the scale stays an integer, otherwise sprites shimmer", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  camera.zoomAt(1.1, 400, 300, vue);
  assert.equal(camera.scale, Math.round(camera.scale));
});

test("panning the view is counted in pixels, like the gesture", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  // Dragging the image twenty pixels to the right shows the map twenty pixels further left.
  camera.pan(20, 0);
  assert.equal(camera.x, -1);
});

test("framing puts the whole box inside the view", () => {
  const camera = createCamera({ scale: 64, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 60, height: 40 }, vue);
  for (const [tx, ty] of [[0, 0], [59, 39]]) {
    const { px, py } = camera.toScreen(tx, ty, vue);
    assert.ok(px >= 0 && px <= vue.width, `${px} is outside the view`);
    assert.ok(py >= 0 && py <= vue.height, `${py} is outside the view`);
  }
});

test("framing an empty board does not produce an absurd scale", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 0, height: 0 }, vue);
  assert.ok(camera.scale >= 4 && camera.scale <= 64, `scale ${camera.scale}`);
  assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y));
});

test("framing a small schematic does not zoom in until it's nose to the block", () => {
  /* Five conveyors in a 1160-pixel view: a pure fit gives a scale of 165, clamped down to
     the maximum of 64, and we end up nose to the block. Framing therefore stops at the
     sprite's native size, while manual zoom still keeps its 64: past native size, zooming
     in further does not show more, it shows the same pixels bigger. */
  const camera = createCamera({ scale: 24, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 5, height: 1 }, { width: 1160, height: 810 });
  assert.equal(camera.scale, 32);
});

test("framing a large schematic shrinks as much as needed", () => {
  const camera = createCamera({ scale: 32, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 64, height: 64 }, { width: 800, height: 600 });
  // 600 / 66 rounded down, which is nine pixels per tile.
  assert.equal(camera.scale, 9);
});
