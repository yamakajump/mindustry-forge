/**
 * A sandbox tap powers the layout and is never credited with producing anything.
 *
 * `power-source` hands out 999,999.94 energy a second, `liquid-source` six hundred thousand
 * of a liquid, `item-source` a hundred items. Those are the game's numbers and they are its
 * way of writing "as much as you like".
 *
 * The measured side already knew: `poured()` takes a tap back out of what a schematic is
 * credited with making, after a reactor farm on twelve cryofluid sources was reported
 * producing five hundred and fifty-seven million a minute. Two figures never got the same
 * guard, and both reached the catalogue:
 *
 * - the **power budget**, which is a column rather than an index row, so a listing sorted
 *   on it put 479,999,971 energy a second at the top of "who makes power";
 * - the **ceiling**, which reached seventy per cent of the catalogue the evening this was
 *   found, and which claimed thirty-six million water a minute from one liquid source.
 *
 * The split that matters and that these tests pin: the tap really does power the grid, so
 * the machines on it really do run. What is refused is calling that production.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);
const item = (name) => ({ content: 0, id: known.items[name].id });
const liquid = (name) => ({ content: 4, id: known.liquids[name].id });

test("a sandbox power source makes no power, and powers the grid all the same", async () => {
  /* Both halves in one layout, because either alone is a different bug. Credited, the page
     printed 480 megawatts; discounted from the grid as well, the smelter beside it would
     have read as starved and every figure downstream with it. */
  const out = await analyse(paste([
    [1, 0, "silicon-smelter", 0],
    [0, 0, "item-source", 0, item("coal")], [0, 1, "item-source", 0, item("sand")],
    [3, 0, "power-source", 0],
  ]));

  close(out.power.made, 0, "a tap makes no power");
  close(out.power.spent, 30, "the smelter draws thirty");
  close(out.power.coverage, 1, "and it has it, since the tap is there");
  close(out.perMinute.silicon, 90, "so the smelter runs flat out");
});

test("a real generator is left exactly as it was", async () => {
  /* The control that matters more than the correction: a rule that empties the catalogue is
     not a rule. A combustion generator is `shown`, so nothing about it changes. */
  const out = await analyse(paste([
    [0, 0, "combustion-generator", 0], [1, 0, "item-source", 0, item("coal")],
  ]));
  close(out.power.made, 60, "sixty, same as before");
});

test("a sandbox tap claims no ceiling of its own", async () => {
  /* The ceiling is the figure that says what a schematic could make if it were fed. A tap
     is not a way of feeding it, it is a way of not answering the question. */
  const items = await analyse(paste([
    [0, 1, "item-source", 0, item("copper")], [1, 1, "conveyor", 0], [3, 1, "vault", 0],
  ]));
  assert.equal(items.potentialPerMinute.copper, undefined, "not six thousand copper/min");

  const liquids = await analyse(paste([
    [0, 1, "liquid-source", 0, liquid("water")], [1, 1, "conduit", 0],
    [2, 1, "liquid-tank", 0],
  ]));
  assert.equal(liquids.potentialPerMinute.water, undefined,
               "not thirty-six million water/min");
});

test("a machine standing beside a tap keeps its own ceiling", async () => {
  /* The other half of the same claim. Taking the tap out of the ceiling must not take the
     smelter out of it: what the smelter could make is a real answer, and it is the answer
     the ceiling exists to give. */
  const out = await analyse(paste([
    [1, 0, "silicon-smelter", 0],
    [0, 0, "item-source", 0, item("coal")], [0, 1, "item-source", 0, item("sand")],
    [3, 0, "power-source", 0],
  ]));
  close(out.potentialPerMinute.silicon, 90, "the smelter keeps its own");
  assert.equal(out.potentialPerMinute.coal, undefined, "the tap has none");
});
