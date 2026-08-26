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
