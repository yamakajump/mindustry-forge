/**
 * Putting a carrier down on an empty tile.
 *
 * The case it exists for: a plan that makes something and has no way out. Marking an outlet
 * answers nothing there, because nothing flows to the tile being marked, so the mark reads
 * as a resource picked off the front of a list at a rate of zero. A belt is a block, and the
 * analysis reads a block.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { aPoser, poser, sensDeFuite } from "../../site/public/forge/rapport/poser.js";

const catalogue = {
  blocks: {
    conveyor: { role: "conveyor", id: 12, build_visibility: "shown" },
    "titanium-conveyor": { role: "conveyor", id: 13, build_visibility: "shown" },
    "armored-conveyor": { role: "conveyor", id: 14, build_visibility: "shown" },
    "plastanium-conveyor": { role: "stack-conveyor", id: 15, build_visibility: "shown" },
    duct: { role: "duct", id: 20, build_visibility: "shown" },
    "junction": { role: "junction", id: 16, build_visibility: "shown" },
    conduit: { role: "conduit", id: 30, build_visibility: "shown" },
    "pulse-conduit": { role: "conduit", id: 31, build_visibility: "shown" },
    "legacy-belt": { role: "conveyor", id: 99, build_visibility: "hidden" },
    kiln: { role: "crafter", id: 40, build_visibility: "shown" },
  },
};

const outils = {
  escape: (s) => String(s),
  t: (key) => key,
  lisible: (name) => `<${name}>`,
  blockIcon: () => "[icone]",
};

test("it points away from the plan, so nothing has to be turned afterwards", () => {
  /* An empty tile beside a plan is somewhere a player wants something to leave by: that is
     the question the report asked to get them here. */
  const plan = new Set(["5,5"]);
  const occupe = (x, y) => plan.has(`${x},${y}`);

  // East of the plan: the plan is west, so the way out is east, which is rotation 0.
  assert.equal(sensDeFuite(6, 5, occupe), 0);
  assert.equal(sensDeFuite(5, 6, occupe), 1, "north");
  assert.equal(sensDeFuite(4, 5, occupe), 2, "west");
  assert.equal(sensDeFuite(5, 4, occupe), 3, "south");
});

test("a tile touching nothing still gets a direction rather than undefined", () => {
  assert.equal(sensDeFuite(40, 40, () => false), 0);
});

test("what the plan already carries comes first", () => {
  // A plan built out of titanium conveyors wants another one, and offering the catalogue in
  // alphabetical order would be asking it to find its own belt among two hundred blocks.
  const offert = aPoser({ "titanium-conveyor": 12, kiln: 4 }, catalogue);

  assert.equal(offert[0], "titanium-conveyor");
});

test("a plan carrying no belt at all is still offered one", () => {
  const offert = aPoser({ kiln: 4 }, catalogue);

  assert.ok(offert.length > 0);
  // The game's own numbering, which is the order a player meets them in.
  assert.equal(offert[0], "conveyor");
});

test("only carriers, and only the ones a player can place", () => {
  const offert = aPoser({}, catalogue);

  assert.ok(!offert.includes("kiln"), "it offered to put a factory down");
  assert.ok(!offert.includes("junction"), "a junction is a crossing, not a way out");
  assert.ok(!offert.includes("legacy-belt"), "it offered a block the game hides");
});

test("a liquid wants a pipe, and an item never gets one", () => {
  assert.deepEqual(aPoser({}, catalogue, true), ["conduit", "pulse-conduit"]);
  assert.ok(!aPoser({}, catalogue).includes("conduit"));
});

test("it offers a few and not a palette", () => {
  // This is a row of buttons in a bubble over a picture.
  assert.ok(aPoser({}, catalogue).length <= 4);
});

test("the chip carries the identifier the editor places by, and shows the name", () => {
  const html = poser(["titanium-conveyor"], outils);

  assert.ok(html.includes('data-poser="titanium-conveyor"'));
  assert.ok(html.includes("<titanium-conveyor>"), "it shows the identifier instead of a name");
});

test("nothing to offer means no bubble, rather than an empty one", () => {
  assert.equal(poser([], outils), "");
});
