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
   sols.json so the test says what it depends on.

   The ids and blend ids are invented, small and readable; the shapes they stand for are
   real, and each is named where it is used. `id` and `blend` are separate fields in the
   game and are not in step, which is why `char` below shares stone's blend id and keeps
   an id of its own. */
const floors = {
  stone: { id: 33, blend: 10, in: true, out: true, layer: "normal", variants: 3, sheet: "stone" },
  grass: { id: 71, blend: 20, in: true, out: true, layer: "normal", variants: 3, sheet: "grass" },
  // A floor sharing stone's blend id and keeping its own, which is what a blend group does:
  // `stone`, `char` and `stone-vent` all carry blend id 33 in the real catalogue.
  char: { id: 35, blend: 10, in: true, out: true, layer: "normal", variants: 1, sheet: "stone" },
  // A floor the game tells not to bleed outwards, which is the one case where a higher
  // blend id still draws nothing.
  shale: { id: 30, blend: 30, in: false, out: false, variants: 1, layer: "normal", sheet: "shale" },
  // A floor nothing bleeds onto: `drawBase` reaches `drawEdges` only when `drawEdgeIn` is
  // set, and 14 floors clear it, `colored-floor` and every `metal-tiles-*`.
  "metal-tiles-4": { id: 146, blend: 146, in: false, out: false, layer: "normal",
                     variants: 1, sheet: null },
  // A liquid, drawn in a pass of its own. Its blend id is deliberately the LOWEST here, so
  // that the ordinary comparison lets every land floor bleed onto it and only the cache
  // layer gate stops them: that is the real shape, deep water at 21 beside stone at 33.
  "deep-water": { id: 21, blend: 5, in: true, out: true, layer: "water",
                  variants: 1, sheet: "deep-water" },
  // A floor with no sheet anywhere, neither its own nor its group's: it cannot bleed, and
  // anything bleeds onto it. Its blend id (40) is deliberately higher than every sheeted
  // floor below, so a test using it exercises the sheetless clause of doEdge rather than
  // the ordinary id comparison, which a lower id would have satisfied on its own and hidden
  // the clause's absence.
  sand: { id: 40, blend: 40, in: true, out: true, layer: "normal", variants: 3, sheet: null },
  // A vent, which ships no sheet and borrows its group's. Fourteen real floors are shaped
  // like this, and reading `<name>-edge` alone drops every one of them.
  "stone-vent": { id: 67, blend: 12, in: true, out: true, layer: "normal", variants: 3,
                  sheet: "stone" },
  // An ore overlay. Its blend id (45) beats every floor here and it is given a sheet it does
  // not really have, so that a test which mistakenly let an overlay contribute would show it
  // by name rather than by an empty result that half a dozen other faults also produce.
  "ore-copper": { id: 90, blend: 45, in: true, out: true, layer: "normal", variants: 1,
                  sheet: "ore-copper" },
};

const ground = (cells) => Object.fromEntries(
  Object.entries(cells).map(([at, floor]) => [at, { floor }]));

test("the eight directions are the game's, in the game's order", () => {
  // Decompiled from the pinned jar's arc.math.geom.Geometry.d8. Asserted as an exact
  // sequence, not just as a set, so that changing it is a deliberate act rather than an
  // accident: the order is not load-bearing for how a boundary is drawn (see the comment
  // on D8), but it is still the claim this file makes about following the game.
  assert.deepEqual(D8, [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]);
  const seen = new Set(D8.map(([dx, dy]) => `${dx},${dy}`));
  assert.equal(seen.size, 8, "a neighbour appeared twice");
  assert.ok(!seen.has("0,0"), "the centre must never appear");
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
  /* doEdge is `other.blendId > this.blendId || this.edges === null`. Sand's blend (40) is
     higher than stone's (10), so the ordinary id comparison alone would keep stone from
     bleeding onto it here; only the second half of doEdge, dropped when this tile's own
     floor has no sheet, lets a lower id still bleed. Removing the `here?.sheet` guard from
     blendersAt makes this assertion fail; see the fix report for the observed failure.
     Without the clause, a patch of sand next to anything reads as a cut-out. */
  const board = ground({ "0,0": "sand", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors).map((b) => b.name), ["stone"]);
});

test("a vent bleeds, and does it with its group's sheet", () => {
  const board = ground({ "0,0": "sand", "1,0": "stone-vent" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone-vent"]);
  assert.equal(found[0].sheet, "stone", "a vent must draw its group's sheet, not its own");
});

test("a neighbour's overlay changes nothing about which floor bleeds", () => {
  /* `(this != tile.floor() && other.overlay() != air) ? other.overlay() : other.floor()`
     reads as "prefer the layer on top" only if `this` is taken for the neighbour. It is the
     floor being drawn, and the clause is true only on the overlay pass, which is not modelled
     here: on the floor pass the neighbour always contributes its floor.

     This is not a matter of which sheet gets drawn. Every overlay in the catalogue has no
     sheet, so preferring one deletes the neighbour at the sheet guard. Painting ore on the
     stone tile below would stop stone bleeding onto sand at that tile and nowhere else, which
     is a hole in a boundary rather than a different boundary. Both boards must agree. */
  const bare = { "0,0": { floor: "sand" }, "1,0": { floor: "stone" } };
  const ored = {
    "0,0": { floor: "sand" },
    "1,0": { floor: "stone", overlay: "ore-copper" },
  };
  assert.deepEqual(blendersAt(bare, 0, 0, floors).map((b) => b.name), ["stone"]);
  assert.deepEqual(blendersAt(ored, 0, 0, floors), blendersAt(bare, 0, 0, floors),
    "an ore patch on the neighbour changed which floor bleeds");
});

test("a floor with drawEdgeIn false receives nothing, whatever borders it", () => {
  /* `Floor.drawBase` is `drawMain; if(drawEdgeIn) drawEdges; drawOverlay`, so a floor that
     clears the flag never enters `drawEdges` at all. Fourteen floors clear it. The tile here
     has no sheet either, which is the case that would otherwise let anything bleed onto it. */
  const board = ground({ "0,0": "metal-tiles-4", "1,0": "grass", "0,1": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("nothing bleeds onto a liquid from the land beside it", () => {
  /* `drawEdges` skips a neighbour whose floor sits on another `cacheLayer`. Deep water's
     blend id is lower than stone's, so the ordinary comparison happily draws a sliver of
     stone onto the water; the game draws none, because the liquid layers are a separate
     pass. */
  const board = ground({ "0,0": "deep-water", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("and nothing bleeds onto land from the liquid beside it", () => {
  /* The same gate read from the other side. Sand has no sheet, so the sheetless half of
     `doEdge` would otherwise let deep water bleed onto it despite the lower blend id. */
  const board = ground({ "0,0": "sand", "1,0": "deep-water" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("two floors sharing a blend id are ordered by block id, as the game orders them", () => {
  /* `drawBlended` sorts on `floor.id`, not on `blendId`. A blend group hands one blend id to
     several floors that keep their own ids, so sorting on the blend id leaves this pair tied
     and settles it by whichever of the eight directions was walked first. `char` sits east
     and is met first; `stone` has the lower id and must come out first anyway. */
  const board = ground({ "0,0": "sand", "1,0": "char", "0,1": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors).map((b) => b.name), ["stone", "char"]);
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
