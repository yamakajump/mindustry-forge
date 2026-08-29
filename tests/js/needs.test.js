/**
 * What a schematic needs, said in what a player installs.
 *
 * The first version asked the question the other way round: tell me what arrives and I
 * will tell you what comes out. That made the tool's homework the player's problem.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse, buildGraph } from "../../site/public/forge/analyse.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { overCarried } from "../../site/public/forge/needs.js";
import { demand, fuels, producers } from "../../site/public/forge/needs.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

test("a press needs coal, stated as drills", async () => {
  const out = await analyse(paste([[0, 0, "graphite-press", 0]]));
  const coal = out.needs.find((n) => n.resource === "coal");

  assert.ok(coal, "a press eats coal");
  close(coal.rate, 2 * 60 / 90, "two coal per craft, one craft every 90 ticks");
  assert.ok(coal.options.length, "and that translates into drills");
  assert.ok(coal.options[0].count >= 1);
});

test("a drill too weak for the ore is not offered", () => {
  /* A mechanical drill cannot touch titanium, and telling a player to build eight of them
     would send them to build a factory that never starts. */
  const options = producers(known, "titanium", 5);
  assert.ok(options.length, "something can mine titanium");
  assert.ok(!options.some((o) => o.block === "mechanical-drill"),
    "but not a mechanical drill");
});

test("a harder ore takes more drills than a soft one", () => {
  /* The game's own formula: drillTime plus hardnessDrillMultiplier times hardness. */
  const copper = producers(known, "copper", 10).find((o) => o.block === "pneumatic-drill");
  const titanium = producers(known, "titanium", 10).find((o) => o.block === "pneumatic-drill");
  assert.ok(titanium.count > copper.count,
    `${titanium.count} for titanium vs ${copper.count} for copper`);
});

test("a liquid is answered with pumps, not with drills", () => {
  const options = producers(known, "water", 18);
  assert.ok(options.length);
  assert.ok(options.every((o) => known.blocks[o.block].role === "pump"));
});

test("what the layout makes for itself is not on the shopping list", async () => {
  /* A schematic that grows its own spore pods and presses them into oil does not need oil
     delivered; it needs water. */
  const REAL = process.env.FORGE_REAL;
  if (!REAL) return;
});

test("a chain does not ask for its own intermediates", () => {
  /* Coal into a press, graphite out, and the coal is what has to arrive. Ask for the
     graphite too and the shopping list describes a factory nobody would build. */
  const graph = {
    nodes: [
      { role: "crafter", block: known.blocks["graphite-press"] },
      { role: "crafter", block: known.blocks["coal-centrifuge"] },
    ],
  };
  const { outside } = demand(graph);
  assert.ok(outside.oil, "the centrifuge wants oil");
  assert.ok(!outside.coal || outside.coal < 2 * 60 / 90,
    "and the coal it makes covers part of the press's own");
});

/*
 * The shopping list has to be buildable on the world it is for.
 *
 * `producers` matched on `role === "drill"`, which is the four Serpulo drills and nothing
 * else, and filtered by no world at all. So an Erekir schematic was told to install a blast
 * drill, and Erekir's own tungsten and graphite had no source offered at all, because a
 * plasma bore's role is `beam-drill` and an impact drill's is `burst-drill`.
 *
 * A correct rate attached to a block that cannot be placed is the worst shape a wrong
 * answer can take: it does not read as a gap, it reads as an instruction.
 */

test("Erekir is offered Erekir drills and never Serpulo ones", () => {
  const offered = producers(known, "tungsten", 10, "erekir");

  assert.ok(offered.length, "Erekir's tungsten has a source");
  for (const option of offered) {
    assert.notEqual(known.blocks[option.block].planet, "serpulo",
      `${option.block} does not stand on Erekir`);
  }
  assert.ok(offered.some((o) => known.blocks[o.block].role === "beam-drill"),
    "including beam drills, which the single-role match missed");
});

test("Serpulo keeps its own, which is how this could break unnoticed", () => {
  const offered = producers(known, "coal", 10, "serpulo");

  assert.ok(offered.length);
  for (const option of offered) {
    assert.notEqual(known.blocks[option.block].planet, "erekir");
  }
  assert.ok(offered.some((o) => o.block === "mechanical-drill"));
});

test("without a world, the whole game is offered", () => {
  const both = producers(known, "copper", 10);
  const worlds = new Set(both.map((o) => known.blocks[o.block].planet));

  assert.ok(worlds.has("serpulo") && worlds.has("erekir"),
    "a caller that does not say its world receives all of them");
});

test("a burst drill pays no hardness, and a beam drill works its width", () => {
  /* Two shapes, and the game's. An ordinary drill covers its whole footprint and pays
     fifty ticks per point of hardness; a burst drill covers its footprint and pays none,
     because its class zeroes the multiplier; a beam drill fires one line out of each tile
     across its face, so it works its width and not its area. */
  const impact = producers(known, "tungsten", 1, "erekir")
    .find((o) => o.block === "impact-drill");
  // Beryllium, not tungsten: a plasma bore is tier three and cannot touch an ore of
  // hardness five. The first draft of this test asked for the impossible, and refusing
  // that is half of what `producers` is for.
  const bore = producers(known, "beryllium", 1, "erekir")
    .find((o) => o.block === "plasma-bore");

  // Impact drill: four by four tiles, 720 ticks, no hardness term whatever the ore.
  close(impact.each, (4 * 4 * 60) / 720, "an impact drill covers its footprint");

  // Plasma bore: size two, so two beams and not four tiles, at 160 ticks.
  close(bore.each, (2 * 60) / 160, "a beam drill works its width");
});

test("a cliff crusher is not a drill, and is not offered as one", () => {
  /* It carries a `drill_time` and eats cliffs rather than ore, so it states no tier. It is
     already a maker of sand through its recipe; offering it here as well would be saying a
     player can point one at a beach. */
  for (const option of producers(known, "sand", 10, "erekir")) {
    assert.notEqual(option.block, "cliff-crusher");
    assert.notEqual(option.block, "large-cliff-crusher");
  }
});

test("a sandbox tap is never part of a plan", () => {
  // `liquid-source` states an output a second like a pump. It is handed out in a sandbox
  // and nowhere else, so planning a base around one is worse than saying nothing.
  for (const option of producers(known, "water", 10)) {
    assert.notEqual(option.block, "liquid-source");
  }
  assert.ok(producers(known, "water", 10, "erekir").some((o) => o.block === "reinforced-pump"));
});

test("the same question comes back in the same order", () => {
  assert.deepEqual(producers(known, "copper", 37, "serpulo"),
    producers(known, "copper", 37, "serpulo"));
});

test("a schematic's own blocks say which world its shopping list is for", async () => {
  const { requirements, planetOf } = await import("../../site/public/forge/needs.js");
  const { buildGraph } = await import("../../site/public/forge/analyse.js");

  const erekir = await analyse(paste([[0, 0, "carbide-crucible", 0]]));
  const graphite = erekir.needs.find((n) => n.resource === "graphite");

  assert.ok(graphite, "a carbide crucible wants graphite");
  for (const option of graphite.options) {
    assert.notEqual(known.blocks[option.block].planet, "serpulo",
      "and it is not offered a Serpulo drill");
  }

  const serpulo = await analyse(paste([[0, 0, "graphite-press", 0]]));
  assert.equal(planetOf(serpulo.graph), "serpulo");
  assert.ok(buildGraph, "the graph is indeed the one from the analysis");
});

test("a silicon line that burns coal is told it needs coal", async () => {
  /*
   * The failure this file exists to prevent, and it was silent. What covers the hunger of
   * a generator that burns "anything" used to be everything the layout made, so a chain
   * producing silicon was told its silicon would feed its combustion generators. Coal
   * never appeared on the shopping list. The player builds it, it stops, and the page had
   * said it would run.
   */
  const out = await analyse(paste([
    [0, 0, "silicon-smelter", 0],
    [5, 0, "combustion-generator", 0],
  ]));

  const fuel = out.needs.find((need) => need.resource === "*combustible");
  assert.ok(fuel, "it needs something to burn brought to it");
  close(fuel.perMinute, 30, "a combustion generator, one batch every 120 frames");
});

test("coal it makes itself does cover its burners", async () => {
  // The other half, and the reason the loose rule existed at all: a centrifuge feeding its
  // own generators genuinely needs no coal delivered, and saying otherwise would send
  // somebody to build a drill they do not need.
  const out = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    [5, 0, "combustion-generator", 0],
  ]));

  assert.ok(!out.needs.some((need) => need.resource === "*combustible"),
    "its own coal is enough");
});

test("what covers a burner is the game's list, not a flammability threshold", async () => {
  /*
   * An RTG generator eats thorium, phase fabric and fissile matter, and all three have a
   * flammability of zero. A threshold cannot express that, which is why the rule is read
   * from the block's own `accepts` - dumped from the game - and not typed here.
   */
  const known = loadCatalogue();
  assert.deepEqual(known.blocks["rtg-generator"].accepts,
    ["thorium", "phase-fabric", "fissile-matter"]);
  for (const item of known.blocks["rtg-generator"].accepts) {
    assert.equal(known.items[item].flammability, 0, `${item} does not burn, and the RTG eats it`);
  }

  const graph = buildGraph((await fromBase64(paste([[0, 0, "rtg-generator", 0]]))).tiles);
  assert.deepEqual([...fuels(graph)], ["thorium", "phase-fabric", "fissile-matter"]);
});

test("a reactor that names its ingredients is not a fuel burner", async () => {
  // A thorium reactor states a recipe, so its demand is already counted under those names.
  // Counting it here as well would have it covered twice.
  const graph = buildGraph((await fromBase64(paste([[0, 0, "thorium-reactor", 0]]))).tiles);

  assert.equal(fuels(graph).size, 0);
});

/**
 * The instruction has to be one a player can carry out.
 *
 * "1 440 sand a minute, on the belt marked at (3, 0)" is not: a titanium conveyor carries
 * ten items a second. The flow solver has always known that figure and capped the belt
 * with it; the shopping list printed beside it did not, so the page asked for something
 * impossible and then blamed the machine downstream for being fed at 94%.
 */
test("says when the marked belts cannot carry what is asked for", () => {
  const belt = (x) => ({ name: "titanium-conveyor", carries: "item", x, y: 0 });

  // Ten a second is six hundred a minute. One belt, and 1 440 asked for: three of them.
  const over = overCarried([belt(3)], 1440, known);
  assert.equal(over.ceiling, 600);
  assert.equal(over.block, "titanium-conveyor");
  assert.equal(over.needed, 3);

  // Two belts, 640 between them, which is under the 1 200 they carry: nothing to say.
  assert.equal(overCarried([belt(3), belt(4)], 640, known), null);

  // The case from the screenshot that opened this: one belt, 640 asked for, 600 carried.
  assert.equal(overCarried([belt(0)], 640, known).needed, 2);
});

test("says nothing rather than inventing a ceiling", () => {
  const belt = { name: "titanium-conveyor", carries: "item", x: 0, y: 0 };
  const pipe = { name: "conduit", carries: "liquid", x: 1, y: 0 };

  // A pipe is not measured in items a second, and a marking that mixes kinds names no
  // particular "you need N of them".
  assert.equal(overCarried([pipe], 100000, known), null);
  assert.equal(overCarried([belt, pipe], 100000, known), null);

  // A carrier the catalogue gives no rate for must not come back as a ceiling of zero.
  assert.equal(overCarried([{ name: "invente", carries: "item", x: 0, y: 0 }], 10, known), null);

  // And nothing marked is not a shortfall.
  assert.equal(overCarried([], 10, known), null);
});
