/**
 * The build grid, filed under the game's own categories.
 *
 * Before this, the grid was 235 blocks in one flat wall under a dropdown. The game's own
 * build menu shows tabs of icons instead, and `buildGroups` is what turns the id-sorted
 * list `buildables` already returns into the same headed groups, without a hand-kept list
 * of category names or their order.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildables, buildGroups } from "../../../site/public/forge/editor/ui.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const palette = buildables(known);
const groups = buildGroups(palette);

test("every block in the palette lands in exactly one group", () => {
  const seen = new Map();
  for (const group of groups) {
    for (const { name } of group.blocks) {
      assert.ok(!seen.has(name), `${name} is in both ${seen.get(name)} and ${group.key}`);
      seen.set(name, group.key);
    }
  }
  assert.equal(seen.size, palette.length);
});

test("no group is invented, and none is left out", () => {
  const expected = new Set(palette.map(({ block }) => block.category || ""));
  const got = new Set(groups.map((group) => group.key));
  assert.deepEqual([...got].sort(), [...expected].sort());
});

test("a group keeps the game's own id order, not the alphabet", () => {
  const turrets = groups.find((group) => group.key === "turret").blocks.map(({ name }) => name);
  assert.ok(turrets.indexOf("duo") < turrets.indexOf("scorch"),
    "duo has the lower id in the shipped catalogue, and should come first");
});

test("the group order is not invented either: it is the order categories first appear "
  + "walking the id-sorted palette", () => {
  const firstSeenAt = new Map();
  palette.forEach(({ block }, index) => {
    const key = block.category || "";
    if (!firstSeenAt.has(key)) firstSeenAt.set(key, index);
  });
  const expectedOrder = [...firstSeenAt.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  assert.deepEqual(groups.map((group) => group.key), expectedOrder);
});

test("a French label is given to every category the shipped catalogue actually uses", () => {
  for (const group of groups) {
    assert.notEqual(group.label, "", `${group.key} has no label`);
  }
});
