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

/**
 * A bridge points at the bridge it hands over to, and the arrow has to turn with the rest.
 *
 * `schematic.js` reads that as `{type: 7, dx, dy}`, an offset in tiles. Moving every block
 * and leaving the offsets alone gives a selection that looks mirrored and is wired the way
 * it was before: the game reads the vector, not the picture, so the defect only shows once
 * the copy is pasted back into a real base.
 */
const pont = (x, y, dx, dy) => ({
  x, y, block: "bridge-conveyor", rotation: 0, config: { type: 7, dx, dy },
});

test("a mirror turns the bridge's own arrow around", () => {
  // One tile to the right, mirrored left-right: one tile to the left.
  const [gauche] = flip([pont(0, 0, 1, 0)], "x", known);
  assert.deepEqual({ dx: gauche.config.dx, dy: gauche.config.dy }, { dx: -1, dy: 0 });

  // And the other axis leaves x alone.
  const [bas] = flip([pont(0, 0, 0, 3)], "y", known);
  assert.deepEqual({ dx: bas.config.dx, dy: bas.config.dy }, { dx: 0, dy: -3 });
});

test("a quarter turn takes the arrow with it", () => {
  /* Anticlockwise, like the positions: a block one tile east of another ends up one tile
     north of it, so an offset of (1, 0) becomes (0, 1). Checked against the positions
     rather than assumed - the two have to agree or the bridge lands beside its partner. */
  const deux = [pont(0, 0, 1, 0), { x: 1, y: 0, block: "conveyor", rotation: 0 }];
  const [tourne, voisin] = rotateBy(deux, 1, known);

  assert.deepEqual({ dx: tourne.config.dx, dy: tourne.config.dy }, { dx: 0, dy: 1 });
  assert.deepEqual([voisin.x - tourne.x, voisin.y - tourne.y], [0, 1],
    "the neighbour really did end up where the arrow now points");
});

test("four quarter turns bring the arrow back", () => {
  const [meme] = rotateBy([pont(0, 0, 2, -1)], 4, known);
  assert.deepEqual({ dx: meme.config.dx, dy: meme.config.dy }, { dx: 2, dy: -1 });
});

test("what does not point anywhere is left alone", () => {
  // A sorter's item is content, not a direction, and a mirror must not touch it.
  const trieur = { x: 0, y: 0, block: "sorter", rotation: 0,
    config: { type: 5, content: 0, id: 3 } };
  const [apres] = flip([trieur], "x", known);
  assert.deepEqual(apres.config, trieur.config);
});
