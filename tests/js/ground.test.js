/**
 * What a drill or a pump pulls out of the ground under it.
 *
 * Before there was a ground, a drill in this graph produced nothing at all: the block
 * registry gives one no output, because what it makes is decided by the tiles it covers.
 * A schematic of drills and belts analysed to silence, and the shopping list told a player
 * to go and find the copper their own drills were sitting on.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { yieldOf } from "../../site/public/forge/ground.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

/** A patch of ore, as the game stacks it: an overlay laid over a floor. */
const patch = (ore, ...tiles) => Object.fromEntries(
  tiles.map(([x, y]) => [`${x},${y}`, { floor: "sand-floor", overlay: ore }]));

test("a drill's rate is the game's formula, not a best case", async () => {
  /* `60 * covered / (drillTime + hardnessDrillMultiplier * hardness)`, which for a
     mechanical drill on copper is 60 * n / (600 + 50). The game shows the same number on
     the placement tooltip. */
  const ground = patch("ore-copper", [0, 0], [1, 0], [0, 1], [1, 1]);
  const out = await analyse(paste([[0, 0, "mechanical-drill", 0]]), {}, null, { ground });

  const drill = out.detail.find((t) => t.role === "drill");
  close(drill.dug.rate, 60 * 4 / 650, "quatre cases de cuivre");
  assert.equal(drill.dug.covered, 4);
});

test("a drill half on the patch is half as fast", async () => {
  const ground = patch("ore-copper", [0, 0], [1, 0]);
  const out = await analyse(paste([[0, 0, "mechanical-drill", 0]]), {}, null, { ground });
  close(out.detail[0].dug.rate, 60 * 2 / 650, "deux cases sur quatre");
});

test("a drill too weak for the ore digs nothing", async () => {
  /* A mechanical drill on titanium is not slow, it is unable, and reporting a rate would
     be reporting one nobody will ever see. */
  const ground = patch("ore-titanium", [0, 0], [1, 0], [0, 1], [1, 1]);
  const weak = await analyse(paste([[0, 0, "mechanical-drill", 0]]), {}, null, { ground });
  assert.equal(weak.detail[0].dug, null);

  const able = await analyse(paste([[0, 0, "laser-drill", 0]]), {}, null, { ground });
  assert.ok(able.detail[0].dug.rate > 0, "une foreuse laser y arrive");
});

test("a pump sums the tiles under it, and deep water counts for more", async () => {
  const shallow = { "0,0": { floor: "shallow-water" } };
  const deep = { "0,0": { floor: "deep-water" } };
  const rate = async (ground) => {
    const out = await analyse(paste([[0, 0, "mechanical-pump", 0]]), {}, null, { ground });
    return out.detail[0].dug?.rate || 0;
  };

  close(await rate(shallow), 7, "sept eau par seconde");
  close(await rate(deep), 10.5, "l'eau profonde compte une fois et demie");
});

test("a pump on two different liquids pumps neither", async () => {
  /* The game refuses rather than picking a favourite. */
  const ground = {
    "0,0": { floor: "shallow-water" }, "1,0": { floor: "tar" },
    "0,1": { floor: "shallow-water" }, "1,1": { floor: "shallow-water" },
  };
  const out = await analyse(paste([[0, 0, "rotary-pump", 0]]), {}, null, { ground });
  assert.equal(out.detail[0].dug, null);
});

test("a drill on ore feeds the layout instead of being asked to be fed", async () => {
  /* A laser drill over nine tiles of coal makes 1.42 a second and a graphite press eats
     1.33, so the shopping list empties. The same test with a mechanical drill is the more
     common answer and the more useful one: it still says how much is missing. */
  const nine = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) nine.push([x, y]);
  const ground = patch("ore-coal", ...nine);
  /* The sandbox tap is not decoration. A laser drill runs on current, and since the solve
     started throttling on the grid a drill with nothing wired to it turns at nothing - as
     it does in the game. Without the tap this reads as a test about ore that is really a
     test about an unpowered drill. */
  const tiles = [[1, 1, "laser-drill", 0], [3, 1, "conveyor", 0],
                 [4, 1, "graphite-press", 0], [0, 3, "power-source", 0]];

  const bare = await analyse(paste(tiles));
  assert.ok(bare.needs.some((n) => n.resource === "coal"),
            "sans sol, il faut trouver du charbon");

  const dug = await analyse(paste(tiles), {}, null, { ground });
  assert.ok(!dug.needs.some((n) => n.resource === "coal"),
            "avec le charbon dessous, il n'y a plus rien a aller chercher");
  assert.ok(dug.perMinute.graphite > 0, "et la presse tourne");
});

test("a drill that does not cover the demand says how much is missing", async () => {
  /* One mechanical drill on four tiles of coal makes 20 a minute; a graphite press eats
     80. The honest answer is not "fed" and not "starved", it is the sixty that is short. */
  const ground = patch("ore-coal", [0, 0], [1, 0], [0, 1], [1, 1]);
  const out = await analyse(paste([
    [0, 0, "mechanical-drill", 0], [2, 0, "conveyor", 0], [3, 0, "graphite-press", 0],
  ]), {}, null, { ground });

  const coal = out.needs.find((n) => n.resource === "coal");
  close(coal.perMinute, 80 - 60 * 4 / 700 * 60, "ce qui manque, pas ce qu'il faut en tout");
});

test("nothing under it means nothing out of it", () => {
  const drill = { x: 0, y: 0, role: "drill", block: { size: 2, tier: 2, drill_time: 600 } };
  assert.equal(yieldOf(drill, {}, known), null);
  assert.equal(yieldOf(drill, null, known), null, "et pas de sol du tout non plus");
});
