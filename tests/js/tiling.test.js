import test from "node:test";
import assert from "node:assert/strict";

import { variantOf } from "../../site/public/forge/tiling.js";

test("a floor with one sprite always takes it", () => {
  for (const [x, y] of [[0, 0], [7, 3], [-4, 19]]) {
    assert.equal(variantOf(x, y, 1), 0);
    assert.equal(variantOf(x, y, 0), 0);
  }
});

test("the variant is in range and never moves", () => {
  for (let x = -20; x < 20; x++) {
    for (let y = -20; y < 20; y++) {
      const first = variantOf(x, y, 3);
      assert.ok(first >= 0 && first < 3, `${x},${y} gave ${first}`);
      assert.equal(variantOf(x, y, 3), first, "not stable across calls");
    }
  }
});

test("the variant depends on both coordinates, which is the whole point", () => {
  /* A hash of x alone stripes the board vertically, a hash of y alone stripes it
     horizontally, and either one is the defect this replaces wearing a different hat. So
     the check is not "it varies" but "it varies along both axes". */
  const alongX = new Set();
  const alongY = new Set();
  for (let i = 0; i < 40; i++) {
    alongX.add(variantOf(i, 0, 3));
    alongY.add(variantOf(0, i, 3));
  }
  assert.ok(alongX.size > 1, "a whole row took the same variant");
  assert.ok(alongY.size > 1, "a whole column took the same variant");
});

test("the three variants come up about as often as each other", () => {
  /* 4096 tiles is the largest board this editor allows, so this is the real population
     rather than a sample of it. A hash that is technically in range but favours one
     variant four to one looks, on a painted patch, exactly like no variants at all. */
  const seen = [0, 0, 0];
  for (let x = 0; x < 64; x++) {
    for (let y = 0; y < 64; y++) seen[variantOf(x, y, 3)]++;
  }
  const expected = 4096 / 3;
  for (const [n, count] of seen.entries()) {
    assert.ok(Math.abs(count - expected) < expected * 0.15,
      `variant ${n} came up ${count} times, expected about ${Math.round(expected)}`);
  }
});

test("neighbours usually differ, which is what kills the stripes", () => {
  let same = 0;
  for (let x = 0; x < 63; x++) {
    for (let y = 0; y < 64; y++) {
      if (variantOf(x, y, 3) === variantOf(x + 1, y, 3)) same++;
    }
  }
  // A third of neighbours matching is what three variants picked independently gives.
  assert.ok(same < 63 * 64 * 0.45, `${same} of ${63 * 64} horizontal neighbours matched`);
});

test("the variant is not constant along a diagonal either", () => {
  /* (x + y) % count and (x - y) % count both pass every test above this one: they vary
     along x, they vary along y, they're stable across calls, roughly balanced, and mostly
     differ from an east or north neighbour. What they don't do is vary along their own
     diagonal, since that is exactly the axis a sum or difference hash holds constant. A
     hash that only clears the row and column checks can still stripe the board on the
     diagonal, which is the same defect the rest of this file exists to catch. */
  const alongSum = new Set();
  const alongDiff = new Set();
  for (let x = 0; x < 40; x++) {
    alongSum.add(variantOf(x, 20 - x, 3));
    alongDiff.add(variantOf(x, x - 20, 3));
  }
  assert.ok(alongSum.size > 1, "a whole x + y diagonal took the same variant");
  assert.ok(alongDiff.size > 1, "a whole x - y diagonal took the same variant");
});

import { blendersAt, D8 } from "../../site/public/forge/tiling.js";

/* Two floors, one that blends over the other. Written here rather than read out of
   sols.json so the test says what it depends on. */
const floors = {
  stone: { blend: 10, out: true, variants: 3, sheet: "stone" },
  grass: { blend: 20, out: true, variants: 3, sheet: "grass" },
  // A floor the game tells not to bleed outwards, which is the one case where a higher
  // blend id still draws nothing.
  shale: { blend: 30, out: false, variants: 1, sheet: "shale" },
  // A floor with no sheet anywhere, neither its own nor its group's: it cannot bleed, and
  // anything bleeds onto it.
  sand: { blend: 5, out: true, variants: 3, sheet: null },
  // A vent, which ships no sheet and borrows its group's. Fourteen real floors are shaped
  // like this, and reading `<name>-edge` alone drops every one of them.
  "stone-vent": { blend: 12, out: true, variants: 3, sheet: "stone" },
};

const ground = (cells) => Object.fromEntries(
  Object.entries(cells).map(([at, floor]) => [at, { floor }]));

test("the eight directions are the game's, in the game's order", () => {
  assert.equal(D8.length, 8);
  // Geometry.d8 starts at (-1,-1) and turns; what matters is that every neighbour appears
  // exactly once and the centre never does.
  const seen = new Set(D8.map(([dx, dy]) => `${dx},${dy}`));
  assert.equal(seen.size, 8);
  assert.ok(!seen.has("0,0"));
});

test("a higher blend id bleeds onto a lower one", () => {
  const board = ground({ "0,0": "stone", "1,0": "grass" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["grass"]);
});

test("a lower blend id does not bleed onto a higher one", () => {
  const board = ground({ "0,0": "grass", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("the same floor on both sides is not a boundary", () => {
  const board = ground({ "0,0": "grass", "1,0": "grass", "0,1": "grass" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("drawEdgeOut false means it never bleeds, whatever its id", () => {
  const board = ground({ "0,0": "stone", "1,0": "shale" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("a floor with no sheet at all is bled onto by a lower id", () => {
  /* doEdge is `other.blendId > this.blendId || this.edges === null`. Sand has no sheet, so
     stone bleeds onto it although stone's id is higher, and grass would too. Without this
     clause a patch of sand next to anything reads as a cut-out. */
  const board = ground({ "0,0": "sand", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors).map((b) => b.name), ["stone"]);
});

test("a vent bleeds, and does it with its group's sheet", () => {
  const board = ground({ "0,0": "sand", "1,0": "stone-vent" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone-vent"]);
  assert.equal(found[0].sheet, "stone", "a vent must draw its group's sheet, not its own");
});

test("one neighbour contributes once, with every direction it came from", () => {
  const board = ground({ "0,0": "stone", "1,0": "grass", "0,1": "grass", "1,1": "grass" });
  const found = blendersAt(board, 0, 0, floors);
  assert.equal(found.length, 1, "grass was listed more than once");
  assert.equal(found[0].dirs.length, 3, "not every direction was recorded");
});

test("blenders come out sorted, so two of them stack the same way every frame", () => {
  const board = ground({ "0,0": "sand", "1,0": "grass", "0,1": "stone" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone", "grass"]);
});

test("an unpainted neighbour is not a floor and contributes nothing", () => {
  /* The board is mostly empty and stays that way: a tile nobody painted has no floor, and
     reading it as one would draw a boundary around every patch against nothing. */
  const board = ground({ "0,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

import { edgeCell } from "../../site/public/forge/tiling.js";

/*
 * Where the material sits in each of the nine cells of `floor/grass#edge`, measured out of
 * the atlas rather than reasoned out: for each cell, decode its pixels and count how many
 * have alpha above 128 in each third of the cell (left/centre/right, top/middle/bottom).
 * The side with the material tells which neighbour that cell belongs to.
 *
 *   [col 0][row 0]  material bottom-right   -> south-east neighbour  (dx +1, dy -1)
 *   [col 1][row 0]  material bottom strip   -> south neighbour       (dx  0, dy -1)
 *   [col 2][row 0]  material bottom-left    -> south-west neighbour  (dx -1, dy -1)
 *   [col 0][row 1]  material right strip    -> east neighbour        (dx +1, dy  0)
 *   [col 1][row 1]  fully opaque            -> the centre, never drawn as an edge
 *   [col 2][row 1]  material left strip     -> west neighbour        (dx -1, dy  0)
 *   [col 0][row 2]  material top-right      -> north-east neighbour  (dx +1, dy +1)
 *   [col 1][row 2]  material top strip      -> north neighbour       (dx  0, dy +1)
 *   [col 2][row 2]  material top-left       -> north-west neighbour  (dx -1, dy +1)
 */
const MEASURED_CELLS = [
  { dir: "south-east", dx: 1, dy: -1, cell: { col: 0, row: 0 } },
  { dir: "south", dx: 0, dy: -1, cell: { col: 1, row: 0 } },
  { dir: "south-west", dx: -1, dy: -1, cell: { col: 2, row: 0 } },
  { dir: "east", dx: 1, dy: 0, cell: { col: 0, row: 1 } },
  { dir: "west", dx: -1, dy: 0, cell: { col: 2, row: 1 } },
  { dir: "north-east", dx: 1, dy: 1, cell: { col: 0, row: 2 } },
  { dir: "north", dx: 0, dy: 1, cell: { col: 1, row: 2 } },
  { dir: "north-west", dx: -1, dy: 1, cell: { col: 2, row: 2 } },
];

for (const { dir, dx, dy, cell } of MEASURED_CELLS) {
  test(`the ${dir} neighbour's material sits at col ${cell.col}, row ${cell.row}`, () => {
    assert.deepEqual(edgeCell(dx, dy), cell);
  });
}

test("no direction ever selects the centre cell, which is fully opaque", () => {
  /* Cell (1, 1) is the whole texture with no cut, measured as fully opaque above. Selecting
     it for a direction would paint a whole tile of the neighbour's floor rather than a
     sliver, since drawImage would read solid material with nothing missing. */
  for (const { dx, dy } of MEASURED_CELLS) {
    const { col, row } = edgeCell(dx, dy);
    assert.ok(!(col === 1 && row === 1), `(${dx}, ${dy}) selected the centre cell`);
  }
});
