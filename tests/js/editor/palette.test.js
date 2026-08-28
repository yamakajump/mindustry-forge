/**
 * What the palette offers, and in what order.
 *
 * A palette is what separates an editor from a directory listing. The previous one showed
 * 253 icons flat, with no category and no planet, in whatever order the catalogue had
 * written them.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildables } from "../../../site/public/forge/editor/ui.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const palette = buildables(known);
const names = palette.map((entry) => entry.name);

test("the palette only offers what a player can actually place", () => {
  assert.ok(palette.length > 200, `only ${palette.length} blocks`);
  // No floor, no decorative wall, no air, no spawn marker.
  for (const interdit of ["stone", "ore-copper", "deep-water", "stone-wall", "air", "spawn"]) {
    assert.ok(!names.includes(interdit), `${interdit} has nothing to do in the palette`);
  }
  assert.ok(names.includes("conveyor"));
  assert.ok(names.includes("duct"));
});

test("every block offered carries a cost, a category and a planet", () => {
  for (const { name, block } of palette) {
    assert.ok(block.cost, `${name} has no cost`);
    assert.ok(block.category, `${name} has no category`);
  }
  // Sandbox blocks belong to no tech tree, so to no planet. They stay placeable: the game
  // places them too.
  const sansPlanete = palette.filter(({ block }) => !block.planet);
  assert.ok(sansPlanete.length < 10,
            `${sansPlanete.length} blocks with no planet, too many for sandbox-only blocks`);
});

test("the order is the game's own, not the alphabet", () => {
  /* In the game's registry, a conveyor comes before a titanium conveyor. The alphabet
     would put "titanium-conveyor" first, which is nobody's order and splits a single
     family in two. */
  assert.ok(names.indexOf("conveyor") < names.indexOf("titanium-conveyor"));
  assert.ok(names.indexOf("mechanical-drill") < names.indexOf("pneumatic-drill"));
});

test("filtering by planet really does separate the two block sets", () => {
  const serpulo = palette.filter(({ block }) => block.planet === "serpulo");
  const erekir = palette.filter(({ block }) => block.planet === "erekir");
  assert.ok(serpulo.length > 100 && erekir.length > 80,
            `${serpulo.length} serpulo blocks, ${erekir.length} erekir blocks`);
  assert.equal(serpulo.some(({ name }) => name === "duct"), false);
  assert.equal(erekir.some(({ name }) => name === "conveyor"), false);
});

test("the palette shows what the game's own menu shows, not whatever has a cost", () => {
  /* `buildVisibility` and `placeablePlayer` are the game's own filter. Filtering on "it
     has a build cost" let through ten blocks nobody can place in a real game: launch pads,
     the radar, the illuminator, the interplanetary accelerator, and the core, which only
     exists inside its own zone. */
  for (const absent of ["launch-pad", "advanced-launch-pad", "core-shard", "radar",
                        "illuminator", "interplanetary-accelerator"]) {
    assert.ok(!names.includes(absent), `${absent} has nothing to do in the palette`);
  }
  for (const present of ["conveyor", "graphite-press", "duo", "power-node"]) {
    assert.ok(names.includes(present), `${present} should be placeable`);
  }
});
