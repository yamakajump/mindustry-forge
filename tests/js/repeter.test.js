/**
 * The same plan, put down again beside itself.
 *
 * The commonest thing a player does with a schematic they were handed is decide one is not
 * enough. What the multiplication must not do is flatter: six times the output is six times
 * the intake and six times the current, and the last two are what people forget until the
 * grid browns out.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { repetable, repetitions } from "../../site/public/forge/rapport/repeter.js";

const bilan = (extra = {}) => ({
  width: 10, height: 16, blocks: 90,
  needs: [{ resource: "coal", perMinute: 320 }],
  potential: { made: 0, spent: 360 },
  cost: { copper: 300, lead: 120 },
  ...extra,
});

const produit = { nom: "graphite", taux: 160 };

test("a module is the sort of thing somebody repeats", () => {
  assert.equal(repetable(bilan(), produit), true);
});

test("a plan that makes nothing is not repeated for more of nothing", () => {
  // A display shows the same picture twice however many you put down, and a wall is not
  // made thicker by pasting the schematic again.
  assert.equal(repetable(bilan(), null), false);
});

test("a whole base is not a module, and is not offered the multiplication", () => {
  assert.equal(repetable(bilan({ blocks: 900 }), produit), false);
  assert.equal(repetable(bilan({ width: 60, height: 60 }), produit), false);
});

test("a schematic with no size at all does not divide by its own nothing", () => {
  assert.equal(repetable(bilan({ width: 0, height: 0 }), produit), false);
});

test("what comes out is multiplied, and so is what goes in", () => {
  const [deux] = repetitions(bilan(), produit);

  assert.equal(deux.fois, 2);
  assert.equal(deux.sort, 320);
  assert.equal(deux.prend.coal, 640, "it doubled the output without doubling the intake");
});

test("the current is multiplied too, which is the figure people forget", () => {
  const [deux, quatre] = repetitions(bilan(), produit);

  assert.equal(deux.courant, 720);
  assert.equal(quatre.courant, 1440);
});

test("a plan that makes its own current asks the grid for nothing, however many there are", () => {
  // Net, not gross: eight copies of a plan that covers itself still cover themselves.
  const [deux] = repetitions(bilan({ potential: { made: 400, spent: 360 } }), produit);

  assert.equal(deux.courant, 0);
});

test("the build cost is multiplied, because that is what it costs to do it", () => {
  const [, , huit] = repetitions(bilan(), produit);

  assert.equal(huit.fois, 8);
  assert.equal(huit.cout.copper, 2400);
  assert.equal(huit.cases, 10 * 16 * 8);
});

test("it offers a few copies and not a hundred", () => {
  // Beyond a handful a player is building a base, not a row, and the arithmetic stops being
  // the thing that helps.
  const tout = repetitions(bilan(), produit);

  assert.deepEqual(tout.map((r) => r.fois), [2, 4, 8]);
});
