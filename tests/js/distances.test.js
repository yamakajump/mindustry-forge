/**
 * Every distance in the catalogue is counted in tiles.
 *
 * There used to be two units in one field. `ItemBridge.range` is a count of tiles in the
 * game and `BaseTurret.range` is a float of world units, eight times larger, and the dump
 * copied each straight through: a bridge's 4 and a mender's 40 sat in the same key with
 * nothing to tell them apart. Every reader had to guess the unit from the block's class,
 * and a wrong guess produces a wrong number rather than an exception - which is how it
 * survived long enough for a page to divide a second time and show a repair point reaching
 * less than one tile.
 *
 * The division now happens once, in `DumpBlocks.java`. These are the anchors that say so.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { loadCatalogue } from "./helpers.js";

const known = loadCatalogue();
const block = (name) => {
  const found = known.blocks[name];
  assert.ok(found, `${name} is missing from the catalogue`);
  return found;
};

test("the distances already in tiles have not moved", () => {
  // These were right before the normalisation and have to still be right after it. A
  // migration that fixes one half by breaking the other has fixed nothing.
  assert.equal(block("bridge-conveyor").range, 4);
  assert.equal(block("phase-conveyor").range, 12);
  assert.equal(block("duct-bridge").range, 4);
  assert.equal(block("plasma-bore").range, 5);
  assert.equal(block("beam-node").range, 10);
  assert.equal(block("mass-driver").range, 55);
  assert.equal(block("overdrive-projector").range, 10);
  assert.equal(block("power-node").laser_range, 6);
});

/**
 * The twenty-nine turrets and eight helpers whose distance the dump divides, in tiles.
 *
 * A table rather than a ceiling, after trying a ceiling. The idea was that an implausibly
 * large value would give away a forgotten division, and the game refused it twice: the
 * `laser_range` of `beam-link` really is 500 tiles, because it is built to cross a whole
 * map, and the large payload driver really does reach 262.5. A ceiling high enough to let
 * those through catches no turret at all, and a ceiling raised until the suite goes green
 * protects nothing.
 *
 * So the numbers themselves are pinned. Removing a division reddens twenty named lines
 * instead of one vague assertion.
 */
const IN_TILES = {
  duo: 20, scatter: 27.5, scorch: 7.5, hail: 29.375, wave: 13.75, lancer: 20.625,
  arc: 11.25, swarmer: 30, salvo: 23.75, segment: 22.5, tsunami: 23.75, fuse: 11.25,
  ripple: 36.25, cyclone: 25, foreshadow: 62.5, spectre: 32.5, meltdown: 24.375,
  breach: 23.75, diffuse: 15.625, sublimate: 16.25, titan: 48.75, disperse: 38.75,
  afflict: 46, lustre: 31.25, scathe: 168.75, smite: 37.5, malign: 51.25,
  parallax: 37.5, "build-tower": 25,
  mender: 5, "mend-projector": 10.625, "repair-point": 7.5, "repair-turret": 18.125,
  "unit-repair-tower": 12.5, "shockwave-tower": 21.25, "regen-projector": 28,
};

test("every divided distance is what the game says, in tiles", () => {
  for (const [name, tiles] of Object.entries(IN_TILES)) {
    assert.equal(block(name).range, tiles, `${name} should reach ${tiles} tiles`);
  }
});

test("a phase boost is in the same unit as the range it lengthens", () => {
  /* The key carried both units at once: raw on the mender, already divided on the
     overdrive projector. Nothing downstream could tell one from the other. */
  assert.equal(block("mender").phase_range_boost, 2.5);
  assert.equal(block("mend-projector").phase_range_boost, 6.25);
  assert.equal(block("overdrive-projector").phase_range_boost, 2.5);
});

test("the force projector counts its radius the way the others count their range", () => {
  assert.equal(block("force-projector").radius, 12.7125);
  assert.equal(block("force-projector").phase_radius_boost, 10);
});

test("the regen projector carries its range, an integer of tiles in the game", () => {
  /* `RegenProjector.range` is an `int`, the one distance the game already counts in tiles.
     It fell into the zero of a ternary and the trimmer threw it out with the other zeros,
     so the block reached the browser with no range at all. */
  assert.equal(block("regen-projector").range, 28);
});

test("every buildable turret knows how far it shoots", () => {
  /* Seventeen of the twenty-eight visible turrets had no range: the item-turret branch
     answered before the one that writes the field. An absent field draws no line rather
     than a wrong one, which is why nobody had seen it. */
  const turrets = Object.entries(known.blocks)
    .filter(([, b]) => b.category === "turret" && b.cost);
  assert.ok(turrets.length >= 28, `only ${turrets.length} turrets found`);
  for (const [name, b] of turrets) {
    assert.ok(b.range > 0, `${name} has no range`);
  }
});
