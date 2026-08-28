/**
 * What the catalogue needs to know for a placement to be decidable.
 *
 * `Block.canReplace` in v159.7 reads `group`, `subclass`, `replaceable`, `alwaysReplace`,
 * `privileged` and `quickRotate`. Without them, replacing a conveyor with a titanium
 * conveyor is not a question the editor can answer, and it refuses a move the game
 * accepts. Guessing from `role` does not work either: `role` groups blocks the game
 * separates, and the reverse.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const bloc = (name) => {
  const found = known.blocks[name];
  assert.ok(found, `${name} is missing from the catalogue`);
  return found;
};

test("every buildable block carries a category from the game", () => {
  const categories = new Set(["turret", "production", "distribution", "liquid", "power",
                              "defense", "crafting", "units", "effect", "logic"]);
  const constructibles = Object.entries(known.blocks)
    .filter(([, b]) => b.cost && !b.floor);
  assert.ok(constructibles.length > 100, "the catalogue lost its buildable blocks");
  for (const [name, b] of constructibles) {
    assert.ok(categories.has(b.category), `${name} has category ${b.category}`);
  }
});

test("two conveyors share a group, which makes them interchangeable", () => {
  assert.equal(bloc("conveyor").group, "transportation");
  assert.equal(bloc("titanium-conveyor").group, "transportation");
});

test("a drag traces an L on a belt, a straight line on a router", () => {
  assert.equal(bloc("conveyor").conveyor_placement, true);
  assert.notEqual(bloc("router").conveyor_placement, true);
});

test("every block knows which planet it comes from", () => {
  assert.equal(bloc("conveyor").planet, "serpulo");
  assert.equal(bloc("duct").planet, "erekir");
});

test("a false flag survives the catalogue's trimming pass", () => {
  /* `placeableOn` and `replaceable` default to **true** in the game and are only written
     where they are false. The trimming pass drops empty values, and `False == 0` in
     Python: without care, these two fields would lose the only thing they had to say, and
     an absence reads as the default, so as the opposite of the truth. */
  assert.equal(bloc("space").placeable_on, false);
  assert.equal(bloc("core-shard").replaceable, false);
});

test("a deep liquid stays buildable, it is its depth that decides", () => {
  /* Trap: `placeable_on` on deep water is true. What forbids building on it is `deep`,
     checked separately in `Build.validPlace`, and confusing the two would give an editor
     that lets a conveyor be placed at the bottom of a lake. */
  assert.notEqual(bloc("deep-water").placeable_on, false);
  assert.equal(bloc("deep-water").deep, true);
});
