/**
 * What a running block says about itself.
 *
 * The rule that matters here is not arithmetic, it is provenance: every figure this file
 * turns into a colour has to be one the engine already keeps. `live.js` hands the renderer
 * a world that has been stepped rather than a clock of its own, and that is the whole reason
 * the moving picture is worth trusting; an overlay showing something computed beside the
 * simulation would spend that on a decoration.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { couleurDe, etatDe, LISIBLE } from "../../site/public/forge/etat.js";

const machine = (efficiency) => ({ state: { efficiency }, block: {}, node: { role: "crafter" } });
const reserve = (held, capacity) => ({
  state: {}, items: { total: held }, block: { item_capacity: capacity }, node: { role: "store" },
});

test("a machine says how well it is being fed, which the engine records", () => {
  assert.deepEqual(etatDe(machine(0.4)), { kind: "machine", part: 0.4 });
  assert.deepEqual(etatDe(machine(1)), { kind: "machine", part: 1 });
});

test("a machine running over one is still a full one", () => {
  // `efficiency` climbs above 1 on a boosted crafter. A bar wider than its block would draw
  // outside it, and "a hundred and forty per cent fed" answers nothing anybody asked.
  assert.equal(etatDe(machine(1.4)).part, 1);
  assert.equal(etatDe(machine(-0.2)).part, 0);
});

test("a reserve says how full it is, which is the question it exists to answer", () => {
  const etat = etatDe(reserve(250, 1000));

  assert.equal(etat.kind, "stock");
  assert.equal(etat.part, 0.25);
  // Both numbers kept: a quarter of a vault and a quarter of a container are not the same
  // afternoon's work.
  assert.equal(etat.held, 250);
  assert.equal(etat.capacity, 1000);
});

test("a machine that also holds items is read as a machine", () => {
  /* A crafter has an input buffer, and how full it happens to be between two crafts is not
     what somebody watching it wants to know. */
  const crafter = { state: { efficiency: 0.5 }, items: { total: 9 },
    block: { item_capacity: 10 }, node: { role: "crafter" } };

  assert.equal(etatDe(crafter).kind, "machine");
});

test("a belt says nothing, because a bar on every tile is a bar on nothing", () => {
  const belt = { state: {}, items: { total: 1 }, block: { item_capacity: 3 },
    node: { role: "conveyor" } };

  assert.equal(etatDe(belt), null);
});

test("nothing is said about what is not there, or is no longer", () => {
  assert.equal(etatDe(null), null);
  assert.equal(etatDe({ state: { dead: true, efficiency: 1 } }), null);
  assert.equal(etatDe({ state: {}, node: { role: "crafter" }, block: {} }), null);
});

test("a reserve with no capacity is not a reserve divided by zero", () => {
  assert.equal(etatDe(reserve(4, 0)), null);
});

test("the colour is read the same way at every reading", () => {
  assert.equal(couleurDe(1), couleurDe(0.999), "a hair under full is full");
  assert.notEqual(couleurDe(0.9), couleurDe(0.1));
  // Four steps, and the darkest reading is the one that needs looking at.
  const echelle = [1, 0.7, 0.4, 0.1].map(couleurDe);
  assert.equal(new Set(echelle).size, 4);
});

test("the figure is written only where a tile has room for it", () => {
  // The canvas runs from eight to forty-eight pixels a tile. A percentage at twenty-four is
  // two grey pixels, which is worse than the bar alone.
  assert.ok(LISIBLE > 24 && LISIBLE < 48);
});
