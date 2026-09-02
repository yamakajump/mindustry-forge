/**
 * The analysis run backwards, held to the same standard as the analysis.
 *
 * This tool hands a player a number they are going to build against. That makes an
 * optimistic figure worse than no figure: a factory sized on it underruns and the player
 * cannot see why. So the arithmetic is checked against the catalogue by hand, the
 * fractional count is checked to survive to the end, and the assumptions are checked to
 * travel with the answer rather than being available on request.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { chaine, plan, makersOf, minables } from "../../site/public/forge/plan.js";
import { loadCatalogue } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);

const stepFor = (out, item) => out.steps.find((step) => step.item === item);
const rawFor = (out, resource) => out.raw.find((row) => row.resource === resource);

test("a hundred silicon a minute is two smelters at fifty-six per cent", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  const smelter = stepFor(out, "silicon");

  // A silicon smelter turns one coal and two sand into one silicon every forty ticks,
  // which is one and a half a second, or ninety a minute. Read off the catalogue by hand.
  assert.equal(smelter.block, "silicon-smelter");
  close(smelter.perBlockPerMinute, 90, "ninety silicon a minute each");

  close(smelter.count, 100 / 90, "the fraction is what the line actually runs at");
  assert.equal(smelter.whole, 2, "and two is what gets built");
  close(smelter.load, (100 / 90) / 2, "so each one idles part of the time");
});

test("the fraction is never rounded away on the quiet", () => {
  // Ninety a minute is exactly one smelter. Ninety-one is two, and saying "two smelters"
  // without saying they run at half is describing a different factory from the one built.
  const exact = plan(known, { item: "silicon", perMinute: 90, planet: "serpulo" });
  close(stepFor(exact, "silicon").count, 1, "exactly one");
  assert.equal(stepFor(exact, "silicon").whole, 1);
  close(stepFor(exact, "silicon").load, 1, "and it runs flat out");

  const over = plan(known, { item: "silicon", perMinute: 91, planet: "serpulo" });
  assert.equal(stepFor(over, "silicon").whole, 2, "one more crosses into a second block");
  assert.ok(stepFor(over, "silicon").load < 0.51, "which then idles half the time");

  // The two answers must not print the same. This is the whole point of carrying both.
  assert.notEqual(stepFor(exact, "silicon").whole, stepFor(over, "silicon").whole);
});

test("what the ground yields is dug, not manufactured", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });

  // Sand has a recipe, the pulveriser, and is still a drill on a beach nine times out of
  // ten. Answering "build eleven pulverisers" to "I need sand" answers nobody's question.
  assert.ok(minables(known).has("sand"), "the ground yields sand");
  assert.equal(stepFor(out, "sand"), undefined, "so no sand is manufactured");

  const sand = rawFor(out, "sand");
  assert.ok(sand, "it is asked for from the ground instead");
  assert.ok(sand.options.length, "and answered in drills");

  // Two sand per craft, and the smelter runs at 100/90 of its rate.
  close(sand.perMinute, 2 * 100, "two sand for every silicon");
});

test("but the caller can say otherwise, and then the chain grows", () => {
  const out = plan(known, {
    item: "silicon", perMinute: 100, planet: "serpulo",
    choices: { sand: "pulverizer" },
  });

  const sand = stepFor(out, "sand");
  assert.ok(sand, "asked for it to be made, so it is made");
  assert.equal(sand.block, "pulverizer");

  // And the pulveriser's own input now appears, which is the point of following the chain.
  assert.ok(rawFor(out, "scrap"), "a pulveriser eats scrap, and that has to come from somewhere");
});

test("a shared ingredient is sized once, on the total", () => {
  // Both halves of this want coal. Sizing the coal line off either branch alone builds
  // half of it, and the factory starves in a way nothing on the page would explain.
  const out = plan(known, {
    item: "silicon", perMinute: 90, planet: "serpulo",
    choices: { sand: "pulverizer", coal: "coal-centrifuge" },
  });

  const coal = stepFor(out, "coal");
  assert.ok(coal, "coal is made rather than dug here");

  // One smelter eats one coal per craft at 1.5 crafts a second: 1.5 coal a second.
  // Nothing else in this chain eats coal, so that is the whole demand.
  close(coal.needPerMinute, 90, "ninety coal a minute for ninety silicon");
});

test("power is counted on what is built, not on what it averages", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  const smelter = stepFor(out, "silicon");

  // A silicon smelter draws thirty a second, and two are built. A grid sized on the
  // average dims the moment the line runs full.
  close(smelter.power, 2 * 30, "two smelters at thirty each");
  assert.ok(out.power >= 60, "and the total is at least that");
});

test("the build cost counts whole blocks, because halves cannot be placed", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });

  // Two smelters at thirty copper and twenty-five lead each.
  assert.equal(out.cost.copper, 60);
  assert.equal(out.cost.lead, 50);
});

test("every figure carries its assumptions", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });

  // Not a footnote and not available on request: the plan cannot be printed without them.
  assert.ok(out.assumptions.includes("fed"), "it assumes the blocks are fed flat out");
  assert.ok(out.assumptions.includes("partial"), "and it has a block running under load");
  assert.ok(out.assumptions.includes("power"), "and it needs current");
  assert.ok(out.assumptions.includes("patch"), "and its drills stand on full ore");
});

test("a world is honoured, and blocks belonging to neither are kept", () => {
  const serpulo = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  const erekir = plan(known, { item: "silicon", perMinute: 100, planet: "erekir" });

  assert.equal(stepFor(serpulo, "silicon").block, "silicon-smelter");
  assert.equal(stepFor(erekir, "silicon").block, "silicon-arc-furnace");

  // A conveyor is on both worlds and carries no planet at all. A filter that dropped it
  // would leave an Erekir plan unable to move anything.
  assert.ok(makersOf(known, "silicon", "erekir").length, "Erekir can make silicon");
  assert.ok(!makersOf(known, "silicon", "erekir").includes("silicon-smelter"));
});

test("the makers are offered in a stable order and nothing hidden is offered", () => {
  const first = makersOf(known, "graphite", "serpulo");
  const again = makersOf(known, "graphite", "serpulo");

  assert.deepEqual(first, again, "the same question gives the same answer");
  assert.ok(first.includes("graphite-press"));
  assert.ok(first.includes("multi-press"));

  for (const name of makersOf(known, "silicon")) {
    assert.notEqual(known.blocks[name].build_visibility, "hidden");
  }
});

test("asking for nothing answers nothing rather than dividing by zero", () => {
  for (const bad of [0, -5, NaN, null]) {
    const out = plan(known, { item: "silicon", perMinute: bad });
    assert.deepEqual(out.steps, []);
    assert.deepEqual(out.raw, []);
    assert.equal(out.power, 0);
  }

  const nameless = plan(known, { item: "", perMinute: 100 });
  assert.deepEqual(nameless.steps, []);
});

test("an item nothing makes and nothing drops is simply asked for", () => {
  const out = plan(known, { item: "pyratite", perMinute: 60, planet: "serpulo" });

  // Whatever it turns out to be, it must not be silently dropped: a plan that omits an
  // ingredient is a plan that builds a factory missing a line.
  assert.ok(out.steps.length || out.raw.length, "it appears somewhere");
});

test("the recipe rate matches the engine on every block in the catalogue", () => {
  // `plan.js` carries its own copy of `craftsPerSecond`, as `needs.js` does, because
  // `analyse.js` does not export it and adding an export would restamp every stored
  // analysis on the site. A copy is only acceptable while it cannot drift, so this walks
  // the whole catalogue rather than a sample.
  for (const [name, block] of Object.entries(known.blocks)) {
    const item = Object.keys(block.output || {})[0];
    if (!item || !block.craft_time) continue;

    const out = plan(known, { item, perMinute: 60, choices: { [item]: name } });
    const step = out.steps.find((one) => one.block === name);
    if (!step) continue;

    close(step.perBlock, block.output[item] * (60 / block.craft_time),
      `${name} makes ${item} at the catalogue's own rate`);
  }
});

test("a loop in the recipes is reported, not looped over", () => {
  // Nothing in the shipped catalogue loops, so the loop is built here. The failure this
  // guards is a hang with no message, on a page a player is waiting on.
  const looped = {
    ...known,
    blocks: {
      ...known.blocks,
      "test-a": { build_visibility: "shown", craft_time: 60, id: 9001,
                  output: { alpha: 1 }, input: { beta: 1 }, cost: {} },
      "test-b": { build_visibility: "shown", craft_time: 60, id: 9002,
                  output: { beta: 1 }, input: { alpha: 1 }, cost: {} },
    },
  };

  const out = plan(looped, { item: "alpha", perMinute: 60 });
  assert.ok(out.cycles.length, "the loop is named");
  assert.ok(out.cycles[0].includes("alpha"));
});

test("no plan advises a block the chosen world cannot build", () => {
  /* `producers` in `needs.js` matches on `role === "drill"`, which is the four Serpulo
     drills and nothing else, and it filters by no world at all. Unfiltered, an Erekir plan
     came back advising a blast drill: a correct rate attached to a block that cannot be
     placed there, which is the worst shape a wrong answer can take.

     The gap in `needs.js` is real and is showing in the analyser's own panel today, but
     that file is in `EngineVersion` and repairing it restamps every stored analysis, so it
     is sequenced with the pilot rather than slipped in here. This holds the line meanwhile. */
  const erekir = plan(known, { item: "carbide", perMinute: 100, planet: "erekir" });

  for (const row of erekir.raw) {
    for (const option of row.options) {
      const world = known.blocks[option.block]?.planet;
      assert.notEqual(world, "serpulo",
        `${option.block} does not stand on Erekir and must not be advised`);
    }
  }

  // And the filter must not empty a Serpulo plan, which is the way this could go wrong
  // without anybody noticing.
  const serpulo = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  assert.ok(serpulo.raw.every((row) => row.options.length), "Serpulo keeps its own drills");
});

/* ------------------------------------------------------------------------------------
   The chain, which is the half a player builds from.

   The list of counts says a hundred silicon a minute needs two smelters and so much sand.
   It never says that the sand goes into the smelter. That shape is walked during the
   computation and was thrown away on the way out.
   ------------------------------------------------------------------------------------ */

test("the chain hangs the inputs under the block that asks for them", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  const arbre = chaine(out);

  assert.equal(arbre.item, "silicon");
  assert.equal(arbre.block, "silicon-smelter");
  close(arbre.perMinute, 100, "the target is what was asked for");

  // One coal and two sand per craft, so the sand edge is twice the coal edge.
  const sous = Object.fromEntries(arbre.inputs.map((one) => [one.item, one.perMinute]));
  close(sous.coal, 100, "one coal per silicon");
  close(sous.sand, 200, "two sand per silicon");
});

test("it stops at what comes out of the ground, and says how to get it", () => {
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  const sable = chaine(out).inputs.find((one) => one.item === "sand");

  assert.equal(sable.kind, "raw", "sand is dug, and the chain has no root under a drill");
  assert.deepEqual(sable.inputs, []);
  assert.ok(sable.options.length > 0, "and the drills that would do it are named");
});

test("an edge carries what one step asks, not the whole plan's total", () => {
  /* The trap this whole shape has to avoid. Coal feeds the smelter and the graphite press
     alike; a belt sized on the total when the smelter only wants half of it is a belt sized
     for a factory nobody built. */
  const out = plan(known, { item: "silicon", perMinute: 100, planet: "serpulo" });
  const arbre = chaine(out);
  const charbon = arbre.inputs.find((one) => one.item === "coal");

  close(charbon.perMinute, 100, "what the smelter asks");
  close(charbon.total, rawFor(out, "coal").perSecond, "and the total is said apart");
});

test("a thing wanted twice is drawn once, and marked the second time", () => {
  /* Graphite and silicon both come back to coal. Repeating the subtree would state the
     drill count twice, and two numbers on a page get added up. */
  const out = plan(known, { item: "phase-fabric", perMinute: 10, planet: "serpulo" });
  const arbre = chaine(out);

  const vus = [];
  const marcher = (noeud) => { vus.push(noeud); noeud.inputs.forEach(marcher); };
  marcher(arbre);

  const repris = vus.filter((one) => one.kind === "repris");
  for (const one of repris) {
    assert.deepEqual(one.inputs, [], "a second appearance carries no children");
    assert.ok(vus.some((autre) => autre.item === one.item && autre.kind !== "repris"),
      `${one.item} is drawn in full somewhere`);
  }

  const complets = vus.filter((one) => one.kind === "fait").map((one) => one.item);
  assert.equal(new Set(complets).size, complets.length, "and nothing is drawn in full twice");
});

test("nothing asked for gives no chain at all, rather than an empty node", () => {
  assert.equal(chaine(plan(known, { item: "", perMinute: 100 })), null);
});
