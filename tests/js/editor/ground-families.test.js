/**
 * The families the ground grid sorts floors into, checked against the real catalogue.
 *
 * A fixture would agree with whatever mistake wrote it. Only the shipped catalogue can
 * say whether every floor actually lands somewhere, and only the shipped catalogue can
 * say whether a family the game still uses turned up empty.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { grounds } from "../../../site/public/forge/editor/ui.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const families = grounds(known);
const byKey = Object.fromEntries(families.map((f) => [f.key, f]));

test("every family the ground grid draws is non-empty", () => {
  for (const family of families) {
    assert.ok(family.blocks.length > 0, `${family.key} has no blocks`);
  }
});

test("a floor lands in exactly one of the floor families, and every floor lands", () => {
  const allFloors = Object.entries(known.blocks)
    .filter(([, block]) => block.floor && !block.overlay && !block.wall)
    .map(([name]) => name);
  assert.ok(allFloors.length > 50, `only ${allFloors.length} floors in the catalogue`);

  const solid = new Set(byKey.floor.blocks);
  const liquid = new Set(byKey["floor-liquid"].blocks);

  for (const name of allFloors) {
    const inSolid = solid.has(name);
    const inLiquid = liquid.has(name);
    assert.ok(inSolid || inLiquid, `${name} landed in no floor family`);
    assert.ok(!(inSolid && inLiquid), `${name} landed in both floor families`);
  }
  assert.equal(solid.size + liquid.size, allFloors.length);
});

test("the liquid family is decided by floor_liquid, not by a hand-kept list", () => {
  for (const name of byKey["floor-liquid"].blocks) {
    assert.ok(known.blocks[name].floor_liquid, `${name} has no floor_liquid flag`);
  }
  for (const name of byKey.floor.blocks) {
    assert.ok(!known.blocks[name].floor_liquid, `${name} is a liquid filed as solid ground`);
  }
});

test("overlay and wall keep their own families, untouched by the floor split", () => {
  for (const name of byKey.overlay.blocks) assert.ok(known.blocks[name].overlay, name);
  for (const name of byKey.wall.blocks) assert.ok(known.blocks[name].wall, name);
});

test("no block is filed under more than one of the four families", () => {
  const seen = new Map();
  for (const family of families) {
    for (const name of family.blocks) {
      assert.ok(!seen.has(name),
        `${name} is in both ${seen.get(name)} and ${family.key}`);
      seen.set(name, family.key);
    }
  }
});
