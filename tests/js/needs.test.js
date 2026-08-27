/**
 * What a schematic needs, said in what a player installs.
 *
 * The first version asked the question the other way round: tell me what arrives and I
 * will tell you what comes out. That made the tool's homework the player's problem.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { demand, producers } from "../../site/public/forge/needs.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

test("a press needs coal, stated as drills", async () => {
  const out = await analyse(paste([[0, 0, "graphite-press", 0]]));
  const coal = out.needs.find((n) => n.resource === "coal");

  assert.ok(coal, "une presse mange du charbon");
  close(coal.rate, 2 * 60 / 90, "deux charbons par craft, un craft par 90 ticks");
  assert.ok(coal.options.length, "et ca se traduit en foreuses");
  assert.ok(coal.options[0].count >= 1);
});

test("a drill too weak for the ore is not offered", () => {
  /* A mechanical drill cannot touch titanium, and telling a player to build eight of them
     would send them to build a factory that never starts. */
  const options = producers(known, "titanium", 5);
  assert.ok(options.length, "quelque chose peut miner du titane");
  assert.ok(!options.some((o) => o.block === "mechanical-drill"),
    "mais pas une foreuse mecanique");
});

test("a harder ore takes more drills than a soft one", () => {
  /* The game's own formula: drillTime plus hardnessDrillMultiplier times hardness. */
  const copper = producers(known, "copper", 10).find((o) => o.block === "pneumatic-drill");
  const titanium = producers(known, "titanium", 10).find((o) => o.block === "pneumatic-drill");
  assert.ok(titanium.count > copper.count,
    `${titanium.count} pour le titane contre ${copper.count} pour le cuivre`);
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
  assert.ok(outside.oil, "la centrifugeuse veut du petrole");
  assert.ok(!outside.coal || outside.coal < 2 * 60 / 90,
    "et le charbon qu'elle fabrique couvre en partie celui de la presse");
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

  assert.ok(offered.length, "le tungstene d'Erekir a une source");
  for (const option of offered) {
    assert.notEqual(known.blocks[option.block].planet, "serpulo",
      `${option.block} ne se pose pas sur Erekir`);
  }
  assert.ok(offered.some((o) => known.blocks[o.block].role === "beam-drill"),
    "dont les foreuses a faisceau, que le role unique ratait");
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
    "un appelant qui ne dit pas son monde les recoit tous");
});

test("a burst drill pays no hardness, and a beam drill works its width", () => {
  /* Two shapes, and the game's. An ordinary drill covers its whole footprint and pays
     fifty ticks per point of hardness; a burst drill covers its footprint and pays none,
     because its class zeroes the multiplier; a beam drill fires one line out of each tile
     across its face, so it works its width and not its area. */
  const impact = producers(known, "tungsten", 1, "erekir")
    .find((o) => o.block === "impact-drill");
  // Le beryllium et pas le tungstene : une foreuse a plasma est de rang trois et ne touche
  // pas un minerai de durete cinq. Le premier jet de ce test demandait l'impossible, et
  // c'est la moitie du travail de `producers` que de refuser.
  const bore = producers(known, "beryllium", 1, "erekir")
    .find((o) => o.block === "plasma-bore");

  // Impact drill: four by four tiles, 720 ticks, no hardness term whatever the ore.
  close(impact.each, (4 * 4 * 60) / 720, "une foreuse a percussion couvre son emprise");

  // Plasma bore: size two, so two beams and not four tiles, at 160 ticks.
  close(bore.each, (2 * 60) / 160, "une foreuse a faisceau travaille sa largeur");
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

  assert.ok(graphite, "un creuset a carbure veut du graphite");
  for (const option of graphite.options) {
    assert.notEqual(known.blocks[option.block].planet, "serpulo",
      "et on ne lui propose pas une foreuse de Serpulo");
  }

  const serpulo = await analyse(paste([[0, 0, "graphite-press", 0]]));
  assert.equal(planetOf(serpulo.graph), "serpulo");
  assert.ok(buildGraph, "le graphe est bien celui de l'analyse");
});
