/**
 * What happens to a group of blocks once it is selected.
 *
 * Rotating a selection is not rotating each block in place: the positions rotate too,
 * around the box. Confusing the two gives a selection that blows apart on the very first
 * quarter turn, and the round trip is the test that catches it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { flip, inBox, rotateBy, translate }
  from "../../../site/public/forge/editor/selection.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const bande = (x, y, rotation = 0) => ({ x, y, block: "conveyor", rotation });
const cle = (t) => `${t.x},${t.y},${t.block},${t.rotation}`;
const trie = (tiles) => tiles.map(cle).sort();

test("the selection takes what the box covers, and nothing else", () => {
  const tiles = [bande(0, 0), bande(5, 5), bande(2, 2)];
  const prise = inBox(tiles, { left: 0, bottom: 0, width: 3, height: 3 }, sizeOf);
  assert.equal(prise.length, 2);
});

test("a large block is taken as soon as a single one of its tiles is in the box", () => {
  // The drill placed at (2, 2) covers (2, 2) to (3, 3); the box only touches (3, 3).
  const tiles = [{ x: 2, y: 2, block: "mechanical-drill", rotation: 0 }];
  assert.equal(inBox(tiles, { left: 3, bottom: 3, width: 1, height: 1 }, sizeOf).length, 1);
});

test("moving moves everything by the same step", () => {
  const bouge = translate([bande(0, 0), bande(1, 0)], 3, -2);
  assert.deepEqual(bouge.map((t) => [t.x, t.y]), [[3, -2], [4, -2]]);
});

test("a quarter turn rotates the positions and the blocks together", () => {
  // Two belts side by side facing east become two belts stacked on each other facing
  // north.
  const tourne = rotateBy([bande(0, 0), bande(1, 0)], 1, known);
  assert.deepEqual(tourne.map((t) => t.rotation), [1, 1]);
  assert.equal(tourne[0].x, tourne[1].x, "they should be aligned vertically");
  assert.notEqual(tourne[0].y, tourne[1].y);
});

test("four quarter turns give back the starting selection", () => {
  const depart = [bande(0, 0), bande(3, 1, 2), bande(1, 4, 3)];
  let tourne = depart;
  for (let i = 0; i < 4; i++) tourne = rotateBy(tourne, 1, known);
  assert.deepEqual(trie(tourne), trie(depart));
});

test("four quarter turns also give back large blocks, without drifting", () => {
  /* A size-two block is placed by its center with a truncated offset. Rotating the center
     instead of the footprint pushes it half a tile out of the box on every quarter turn,
     and by the fourth nothing recognizable is left. */
  const depart = [
    { x: 0, y: 0, block: "mechanical-drill", rotation: 0 },
    { x: 3, y: 3, block: "graphite-press", rotation: 0 },
    bande(0, 3),
  ];
  let tourne = depart;
  for (let i = 0; i < 4; i++) tourne = rotateBy(tourne, 1, known);
  assert.deepEqual(trie(tourne), trie(depart));
});

test("rotating all at once or quarter by quarter gives the same result", () => {
  const depart = [bande(0, 0), bande(2, 1, 1), { x: 4, y: 0, block: "mechanical-drill", rotation: 0 }];
  const troisFois = rotateBy(rotateBy(rotateBy(depart, 1, known), 1, known), 1, known);
  assert.deepEqual(trie(rotateBy(depart, 3, known)), trie(troisFois));
});

test("a mirror flips the positions and flips the belts with them", () => {
  const mire = flip([bande(0, 0, 0), bande(1, 0, 0)], "x", known);
  // A belt that faced east now faces west.
  assert.deepEqual(mire.map((t) => t.rotation), [2, 2]);
  // And the two have swapped places.
  assert.deepEqual(mire.map((t) => t.x).sort(), [0, 1]);
});

test("a mirror on X does not touch north and south", () => {
  const mire = flip([bande(0, 0, 1), bande(1, 0, 3)], "x", known);
  assert.deepEqual(mire.map((t) => t.rotation), [1, 3]);
});

test("a mirror on Y swaps north and south, not east and west", () => {
  const mire = flip([bande(0, 0, 1), bande(0, 1, 0)], "y", known);
  assert.deepEqual(mire.map((t) => t.rotation).sort(), [0, 3]);
});

test("mirroring twice gives back the starting selection", () => {
  const depart = [bande(0, 0, 1), bande(2, 3, 0),
                  { x: 5, y: 5, block: "mechanical-drill", rotation: 0 }];
  for (const axis of ["x", "y"]) {
    assert.deepEqual(trie(flip(flip(depart, axis, known), axis, known)), trie(depart),
                     `mirroring on ${axis} does not come back`);
  }
});

test("a block that does not rotate keeps its rotation no matter what", () => {
  const presse = [{ x: 0, y: 0, block: "graphite-press", rotation: 0 }];
  assert.equal(rotateBy(presse, 1, known)[0].rotation, 0);
  assert.equal(flip(presse, "x", known)[0].rotation, 0);
});

test("an empty selection breaks nothing", () => {
  assert.deepEqual(rotateBy([], 1, known), []);
  assert.deepEqual(flip([], "x", known), []);
  assert.deepEqual(translate([], 3, 3), []);
});

test("the game's only invert-flip block flips the other way around", () => {
  /* `Block.invertFlip`: "schematic flips with this block are inverted". Only one block in
     the game carries it, the electrolyzer, and a four-entry rotation table used to flip
     it the wrong way with nothing to say so. The game's own formula handles it:

         if((x == (rotation % 2 == 0)) != invertFlip) rotation += 2
  */
  assert.equal(known.blocks["electrolyzer"].invert_flip, true);
  const normal = { x: 0, y: 0, block: "thermal-generator", rotation: 0 };
  const inverse = { x: 0, y: 0, block: "electrolyzer", rotation: 0 };

  // On the X axis, an even rotation flips... except for the one that inverts.
  assert.notEqual(flip([inverse], "x", known)[0].rotation,
                  flip([{ ...normal, block: "conveyor" }], "x", known)[0].rotation);
});
