/**
 * What the camera changes about the framing, tested without a browser.
 *
 * `draw` needs a canvas and Node has none. What gets tested, and what is what breaks, is
 * the framing decision: which region of the world falls inside the view. Everything else
 * about the render follows from it, since every sprite is placed relative to this box.
 *
 * The first two tests are regression tests: the analysis report shares this renderer, and
 * its framing must not move by a single pixel just because the editor needs a camera.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { viewportBox } from "../../../site/public/forge/render.js";
import { createCamera } from "../../../site/public/forge/editor/camera.js";

const vue = { width: 800, height: 600 };

test("with no camera, the framing stays the one from the report", () => {
  const box = viewportBox({ tight: { left: 2, bottom: 3, width: 10, height: 8 }, apron: 0 });
  assert.deepEqual(box, { left: 2, bottom: 3, width: 10, height: 8 });
});

test("the margin opens up around the box", () => {
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 4, height: 4 }, apron: 2 });
  assert.deepEqual(box, { left: -2, bottom: -2, width: 8, height: 8 });
});

test("with a camera, the framing comes from the view, not from the content", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const box = viewportBox({
    tight: { left: 0, bottom: 0, width: 2, height: 2 },
    apron: 0, camera, viewport: vue,
  });
  // 800 / 20 = 40 tiles wide, centered on zero.
  assert.equal(box.width, 40);
  assert.equal(box.height, 30);
  assert.equal(box.left, -20);
  assert.equal(box.bottom, -15);
});

test("the camera's framing and its own tile conversion say the same thing", () => {
  /* The left edge of the view is the tile the camera says is under pixel zero. Two ways of
     answering the same question live in two files: if they disagree, the block draws in
     one place and gets placed in another, and nothing on screen says so. */
  const camera = createCamera({ scale: 17, x: 12, y: -4 });
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 1, height: 1 },
                            apron: 0, camera, viewport: vue });
  assert.equal(Math.floor(box.left), camera.toTile(0, 0, vue).x);
  assert.equal(Math.floor(box.bottom), camera.toTile(0, vue.height, vue).y);
});

test("the camera's canvas is exactly the size of the view", () => {
  // `draw` sizes the canvas as `box.width * scale`. With a camera, that has to land back
  // on the view pixel for pixel, otherwise the image spills out of its frame or leaves an
  // empty strip.
  const camera = createCamera({ scale: 23, x: 3, y: 7 });
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 1, height: 1 },
                            apron: 0, camera, viewport: vue });
  assert.equal(box.width * camera.scale, vue.width);
  assert.equal(box.height * camera.scale, vue.height);
});
