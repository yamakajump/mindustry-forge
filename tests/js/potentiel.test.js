/**
 * The ceiling: what a schematic would yield if it were handed what it is missing.
 *
 * This repository has already removed a feature that looked like this one, and it was
 * right to: `ports.js` used to pick the likeliest arrival carrier, the whole page followed
 * from that choice, and a bad choice produced rates that looked calculated. The decision
 * was that guessing at inputs is removed, not improved.
 *
 * What is tested here therefore has to prove two things, and the second matters more. First
 * that the figure is right. Then **that no choice is made to get it**: the ceiling names no
 * arrival and routes no flow, it is the subtraction of what the machines make flat out minus
 * what they eat off each other. And it never stands in for the measurement: a player who
 * pastes their schematic must still see zero when it is zero, and the invitation to mark
 * their inputs.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/bilan.js";
import { loadCatalogue, paste } from "./helpers.js";

loadCatalogue();

const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

test("a press nothing feeds announces what it would do, without measuring anything", async () => {
  const out = await analyse(paste([[0, 0, "graphite-press", 0]]));

  /* The default does not move. That is half of the contract: the page keeps saying it
     does not know where this plugs in, and keeps asking. */
  assert.deepEqual(out.perMinute, {}, "nothing measured while nothing is marked");
  assert.equal(out.awaiting, true, "and it still waits for the answer");

  // Two coal per batch, a batch every 90 frames: 40 graphite a minute.
  close(out.potentialPerMinute.graphite, 40, "the ceiling, on the other hand, is computable");
});

test("the ceiling lands on what the solver returns when the input is marked by hand", async () => {
  /*
   * The test that earns this the right to be called a ceiling rather than an estimate. The
   * two paths share nothing: the one above solves a flow problem from a named arrival, the
   * one below subtracts two totals. If they diverge, one of them is lying, and it will not
   * be the one the bench backs up.
   */
  const code = paste([[0, 0, "graphite-press", 0]]);
  const bare = await analyse(code);

  const marked = Object.fromEntries(
    Object.keys(bare.offers).map((at) => [at, { side: "in", resource: "coal" }]));
  const fed = await analyse(code, {}, marked);

  close(fed.perMinute.graphite, bare.potentialPerMinute.graphite,
    "the fed measurement and the ceiling give the same number");
});

test("what it eats off itself does not count as output", async () => {
  // A press eats the coal a centrifuge makes: that coal does not come out, and reporting
  // it would send somebody looking for a coal source they do not need.
  const out = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    [4, 0, "graphite-press", 0],
  ]));

  // The centrifuge makes 2 coal/s, the press eats 1.33: 40 a minute is left over.
  close(out.potentialPerMinute.coal, 40, "only the surplus coal comes out");
  close(out.potentialPerMinute.graphite, 40, "and the graphite that follows from it");
});

test("a burner's fuel is deducted, even without a named recipe", async () => {
  /*
   * A combustion generator burns "anything at all": it names no material, so nothing
   * removed it from the output total. Without the deduction, a centrifuge feeding its own
   * burners was listed with the full amount of coal they swallow, and the ceiling reported
   * 120 a minute where there is really 60.
   */
  const seule = await analyse(paste([[0, 0, "coal-centrifuge", 0]]));
  const avecDeux = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    [4, 0, "combustion-generator", 0],
    [6, 0, "combustion-generator", 0],
  ]));

  close(seule.potentialPerMinute.coal, 120, "the centrifuge alone");
  close(avecDeux.potentialPerMinute.coal, 60, "minus what two burners swallow");
});

test("a burner eating more than the schematic makes leaves a need, not a negative", async () => {
  const out = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    ...Array.from({ length: 8 }, (_, i) => [4 + i * 2, 0, "combustion-generator", 0]),
  ]));

  assert.equal(out.potentialPerMinute.coal, undefined, "no coal is left over to output");
  // And the two halves match up: 240 burned, 120 made, 120 asked for.
  const fuel = out.needs.find((need) => need.resource === "*combustible");
  close(fuel.perMinute, 120, "what is missing is asked for, not hidden");
});

test("no nameless need ever shows up reported as an output", async () => {
  // `*combustible` is a hole in a shopping list, not a material.
  const out = await analyse(paste([[0, 0, "combustion-generator", 0]]));

  for (const item of Object.keys(out.potentialPerMinute)) {
    assert.ok(!item.startsWith("*"), `${item} is not something that comes out`);
  }
});

test("a schematic that makes nothing has no ceiling to report", async () => {
  // A belt is not a factory. It carries, it does not make, and a ceiling of zero shown
  // would be one more line to read for nothing.
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]));

  assert.deepEqual(out.potentialPerMinute, {});
});

test("the ceiling depends on no named arrival", async () => {
  /*
   * The guarantee that sets this apart from `ports.js`. The same factory, described twice
   * with different borders, one more arrival belt on one side, yields the same ceiling,
   * because nothing in the computation looks at where things come in. A figure that moved
   * with the chosen belt would be a guess, whatever its name.
   */
  const nue = await analyse(paste([[0, 0, "graphite-press", 0]]));
  const avecBandes = await analyse(paste([
    [0, 0, "graphite-press", 0],
    [-1, 0, "conveyor", 0], [-2, 0, "conveyor", 0], [-1, 1, "conveyor", 0],
  ]));

  assert.deepEqual(avecBandes.potentialPerMinute, nue.potentialPerMinute);
});
