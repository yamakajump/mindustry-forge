/**
 * Where a tile lands on the canvas, which is a question about the joint between two of
 * them rather than about either one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { tileRect } from "../../site/public/forge/tiling.js";

const box = { left: 0, bottom: 0, width: 8, height: 8 };

test("neighbouring tiles share an edge exactly, at a fractional scale", () => {
  /* The defect this replaces: `x * scale` for both, drawn `scale` wide. At 13.7 pixels a
     tile the right edge of one landed 0.7 of a pixel short of its neighbour's left edge,
     and with smoothing off the canvas rounded the two apart. */
  const scale = 13.7;
  for (let x = 0; x < 7; x++) {
    const here = tileRect(x, 0, box, scale);
    const next = tileRect(x + 1, 0, box, scale);
    assert.equal(here.x + here.w, next.x, `joint after column ${x}`);
  }
});

test("stacked tiles share an edge exactly too", () => {
  const scale = 13.7;
  for (let y = 0; y < 7; y++) {
    const lower = tileRect(0, y, box, scale);
    const upper = tileRect(0, y + 1, box, scale);
    assert.equal(upper.y + upper.h, lower.y, `joint above row ${y}`);
  }
});

test("every rectangle is whole pixels", () => {
  const rect = tileRect(3, 5, box, 13.7);
  for (const side of ["x", "y", "w", "h"]) {
    assert.equal(rect[side], Math.trunc(rect[side]), `${side} is not an integer`);
  }
});

test("a tile is never zero wide, however small the zoom", () => {
  /* A schematic zoomed out to fit a thumbnail still has to show its ground. Rounding two
     boundaries independently can collapse a tile to nothing; the game shows a pixel. */
  for (const scale of [0.4, 0.7, 1, 1.3]) {
    const rect = tileRect(2, 2, box, scale);
    assert.ok(rect.w >= 1 && rect.h >= 1, `${scale} gave ${rect.w}x${rect.h}`);
  }
});

test("y is measured downwards, because a canvas is", () => {
  /* The board's y grows upwards and the canvas's grows downwards. Getting this backwards
     draws the ground mirrored under a schematic that is not, which reads as a rendering
     bug nobody can name. */
  const bottom = tileRect(0, 0, box, 10);
  const top = tileRect(0, 7, box, 10);
  assert.equal(bottom.y, 70);
  assert.equal(top.y, 0);
});
