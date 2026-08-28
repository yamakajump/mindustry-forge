/**
 * The analysis, run exactly as the page runs it.
 *
 * There is one implementation and this exercises it. The Python side of the repository
 * runs the real game and measures the same schematics; that comparison is what proves
 * these numbers, and these tests are what stop them changing by accident.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse, buildGraph, solve } from "../../site/public/forge/analyse.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { inAt, loadCatalogue, paste } from "./helpers.js";
import { drives, logicOf, readProgram } from "../../site/public/forge/logic.js";

const known = loadCatalogue();

/** Where the real schematic takes its water, said once rather than in every test. */
const EAU = { "4,15": { side: "in", resource: "water" } };

/** A real schematic, pasted by a real player through a chat, checksum and all. */
const REAL = "bXNjaAF4nE1Sy27TQBS9HjszHid2yoptVdaWEEj0K1izqCo0iSeRhWMbe5yqQvwAEqISP8AX8gW05j5SQqT45Pq+zjk3kMFFAtm2a4Nvw3vXg/ryFXTjNr4Z4eLm6ubVbueur93t718PV7eQtO7g4eUHF/xw2Xd3+Hzz9vW7S9/6YX8Py8qP26HuQ921ADnkTf15qqty6CZsgLyfmtGXuK2a6gDFZqir/Tk2Gxew7B7WY/DuUO5pqgvdAOtt55pyixSHejftPazPrUd/jxXZdmpCfeTqYmorP+ya7q7cI1F4Eerg2no6nMuXJ2L4/hMsx74bfNkPfkTNrKpsu8qXjRtwF8BH4E8c4SOCmH4riWKJEokWECsEbeb56Sd+j4qyBiKCFCJKWkMN8zw/cjKT5FJgJTX5c80frikkuYYoAVqjCJRAAipC0LQ8wlXYEIGFWCNkhhlSB3LAHYre5mcCSAmHc8uaJCmkzmqAaSscpOhtjoLmp9MghS2x6I5ToF4GBZFlOzhKBNAQeqkFDNkTQ0r2POA3qAwLVxAnvFIRKIGEuCbi5A9yMl5giMtTBCvJ7Dk5KPKhoBskKCSmvbhyiWCJ8YJyQB5RiZYTajmhlhNqOaGWE2pZ/J0XYwDmn5OcJQXz48kPTcamCDlR50JmKpDQKQzPkw4UYjiNDxZiWMhpHIX5//8QI24bOhBaR3wJ0M4VQpZKuBLIBQoBdsLKmaycyRItC1bOZOVMlkRrBBb97STaimjiMfOcVMZzgZVALlAI4Ma/lba3pg==";
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

test("the catalogue came from the game, not from a wiki", () => {
  assert.equal(known.build, 159);
  close(known.blocks["conveyor"].items_per_second, 6.5, "a belt moves 6.5 a second");
  close(known.blocks["titanium-conveyor"].items_per_second, 10, "titanium moves 10");
  assert.deepEqual(known.blocks["graphite-press"].input, { coal: 2 });
});

test("a schematic written by the game's own layout reads back", async () => {
  const parsed = await fromBase64(paste([[0, 0, "conveyor", 0], [1, 0, "router", 0]], "x"));
  assert.equal(parsed.tags.name, "x");
  assert.equal(parsed.tiles.length, 2);
  assert.equal(parsed.tiles[0].block, "conveyor");
});

test("a belt hands forward and refuses from the front", () => {
  const facing = buildGraph([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 2 },
  ]);
  assert.deepEqual(facing.edges, [], "two belts facing each other carry nothing");

  const line = buildGraph([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
  ]);
  assert.deepEqual(line.edges, [[0, 1]]);
});

test("a belt caps at its own speed", () => {
  const graph = buildGraph([0, 1, 2].map((x) => ({ x, y: 0, block: "conveyor", rotation: 0 })));
  const out = solve(graph, { 0: { copper: 40 } });
  close(out.delivered.copper, 6.5, "a belt moves 6.5 a second whatever is upstream");
});

test("a press turns coal into graphite at its own pace", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));
  close(out.perMinute.graphite, 40, "one graphite every ninety ticks");
  assert.equal(out.produced.coal, undefined, "the coal became graphite");
});

test("a starved machine is named rather than averaged", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: (2 * 60 / 90) / 3 },
                          inAt([0, 0, "coal"]));
  assert.equal(out.bottleneck[0], "graphite-press");
  close(out.bottleneck[1], 1 / 3, "fed a third of what it wants");
});

test("a stranded machine is waste and not the bottleneck", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0],
                 [2, 8, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));
  assert.deepEqual(out.idle, { "graphite-press": 1 });
  assert.equal(out.bottleneck, null, "the connected press runs flat out");
});

test("a stranded belt is not fed and does not count as output", async () => {
  /* Supply arrives on the edge of the network that carries it, and is split across the
     entry points rather than repeated at each, so what comes out is what went in. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [9, 9, "conveyor", 0]];
  const out = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));
  assert.deepEqual(out.idle, { conveyor: 1 });
  assert.ok(!out.produced.coal, "what goes in and comes back out is not production");
});

test("oversupply is reported rather than swallowed", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));
  close(out.surplus.coal, 4 - 2 * 60 / 90, "a press eats 1.33 coal a second");
});

test("the cost of building it is counted", async () => {
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]));
  assert.deepEqual(out.cost, { copper: 2 }, "a conveyor costs one copper");
});

test("a smelter declares its power draw", async () => {
  /* A layout reported without power promises a throughput the game will not deliver.
     Counted against what a block is actually running at, since a starved smelter draws
     nothing. */
  const running = await analyse(paste([
    [0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "silicon-smelter", 0],
    [0, 1, "conveyor", 3], [1, 1, "conveyor", 3],
  ]), { coal: 4, sand: 8 }, inAt([0, 0, "coal"], [0, 1, "sand"]));
  assert.ok(running.power.spent > 0, `${running.power.spent} power drawn`);
  assert.equal(running.power.made, 0, "a smelter does not produce power");
});

test("an unknown block blocks its tile rather than vanishing", async () => {
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "un-bloc-de-mod", 0]]));
  assert.deepEqual(out.unknown, { "un-bloc-de-mod": 1 });
});

test("something that is not a schematic is refused by name", async () => {
  await assert.rejects(() => analyse(Buffer.from("pas une schematique").toString("base64")),
    /schematique Mindustry/);
});

test("text that is not base64 is refused by name", async () => {
  await assert.rejects(() => analyse("!!! pas du base64 !!!"), /base64/);
});

test("a wrapped paste from a chat message still works", async () => {
  const text = paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]);
  const wrapped = text.match(/.{1,20}/g).join("\n  ");
  const out = await analyse(wrapped);
  assert.equal(out.blocks, 2);
});

test("a bridge keeps its link instead of breaking the read", async () => {
  /* Real schematics are full of configured blocks and the first version refused all of
     them. A bridge remembers where it reaches, a power node what it is wired to, a sorter
     which item it passes. The first schematic anyone pasted at this held eight bridge
     conduits, ten bridge conveyors and a power node, and was rejected outright. */
  const { fromBase64 } = await import("../../site/public/forge/schematic.js");
  const parsed = await fromBase64(REAL);
  assert.equal(parsed.tags.name, "Water power 2306 energy");
  assert.ok(parsed.tiles.length >= 90, `${parsed.tiles.length} tiles read`);

  const bridges = parsed.tiles.filter((t) => t.block === "bridge-conveyor");
  assert.ok(bridges.length > 0);
  assert.equal(bridges[0].config.type, 7, "a bridge stores a Point2");
});

test("a string damaged in transit is read anyway and says so", async () => {
  /* Refusing a build the reader can see perfectly well helps nobody: 1,102 bytes decoded
     cleanly and the whole thing was rejected over the last two checksum bytes. */
  const out = await analyse(REAL, {}, EAU);
  assert.equal(out.altered, true, "the checksum did not match");
  assert.ok(out.truncated > 0, "and the tail was lost, which the report must say");
  assert.ok(out.blocks >= 90, "while the blocks that did read are kept");
});

test("a clean schematic is not flagged as damaged", async () => {
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]));
  assert.equal(out.altered, false);
  assert.equal(out.truncated, 0);
});

test("a stream that errors on its checksum still yields the schematic", async () => {
  /* Found by running the page rather than by reading it. Chrome reported every failure as
     "Failed to fetch" through `new Response(stream)`, which says nothing; read chunk by
     chunk, the same data decoded 1,102 bytes and then raised "Junk found after end of
     compressed data" over the four trailing checksum bytes. Everything before the error is
     the build. */
  const { fromBase64 } = await import("../../site/public/forge/schematic.js");
  const parsed = await fromBase64(REAL);
  assert.ok(parsed.tiles.length >= 90);
  assert.equal(parsed.altered, true);
  assert.equal(parsed.truncated, 5, "and it says how many blocks it lost");
});

test("a water to power schematic reports power, not the coal it makes on the way", async () => {
  /* The bug Corentin caught by reading the answer rather than the code. His schematic
     takes water and makes electricity; it was reported as producing coal and spore pods,
     which are intermediates every one of which is eaten inside. The cause ran deep: the
     block registry carried item inputs and nothing else, so a cultivator declared no
     inputs at all and made spore pods out of nothing, and a steam generator was filed as
     a sink that swallowed coal without consuming it. */
  const out = await analyse(REAL, { water: 120 }, EAU);

  assert.ok(out.power.made > 1000, `${out.power.made} power made`);
  assert.ok(out.power.net > 0, "a generator produces more than it consumes");
  assert.ok(!out.perMinute.coal || out.perMinute.coal < 1,
    "coal is an intermediate, not an output");
});

test("more water means more power", async () => {
  /* The relationship a player would check first, and the one that stayed flat at zero
     through three earlier versions of this model. */
  const little = await analyse(REAL, { water: 30 }, EAU);
  const plenty = await analyse(REAL, { water: 120 }, EAU);
  assert.ok(plenty.power.made > little.power.made * 1.3,
    `${little.power.made} vs ${plenty.power.made}`);
});

test("what was handed in is not counted as what came out", async () => {
  /* Fed at every edge pipe and counted on the way out, one schematic reported fifteen
     thousand water a minute of production, which buried the number that mattered. */
  const out = await analyse(REAL, { water: 100 }, EAU);
  assert.ok(!out.perMinute.water, "the water supplied is not production");
});

test("a belt will not carry a liquid", async () => {
  /* Letting a carrier take anything made a conveyor deliver oil, which looks like a
     working factory and is not one. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]];
  const out = await analyse(paste(tiles), { water: 10 });
  assert.deepEqual(out.perMinute, {});
});

test("a battery neither takes nor hands on anything", async () => {
  /* Treated as an offloader, twenty-one batteries gave a schematic thirty-nine outgoing
     links, and every drop of water supplied to it drained into one. */
  const graph = buildGraph([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "battery", rotation: 0 },
  ]);
  assert.deepEqual(graph.edges, [], "nothing goes into a battery and nothing comes out of it");
});

test("a block on the power grid is not a block somebody forgot to connect", async () => {
  /* Batteries and nodes carry nothing on the item network by design. Calling twenty-one
     of them "connected to nothing" buried the two bridges that really were. */
  const out = await analyse(REAL, { water: 120 }, EAU);
  assert.ok(!out.idle.battery, "a battery does its job on the power grid");
  assert.ok(!out.idle["power-node-large"]);
});

test("a rate that rounds to zero is not reported as a product", async () => {
  const out = await analyse(REAL, { water: 120 }, EAU);
  for (const [item, n] of Object.entries(out.perMinute)) {
    assert.ok(n >= 0.1, `${item} shows ${n} per minute`);
  }
});

test("a bridge that claims to reach three hundred tiles is not linked", async () => {
  /* A schematic copied out of a base keeps the links of bridges whose far end was not
     copied, and those come back as nonsense: five bridges in one real schematic claimed to
     reach 365 tiles left and 394 down, and were drawn as bars across the whole picture.
     The game's own rules settle it: along one axis, never diagonally, never past range. */
  const parsed = await analyse(REAL, { water: 60 }, EAU);
  const bridges = parsed.graph.nodes.filter((n) => n.role === "bridge");
  assert.ok(bridges.length > 10, `${bridges.length} ponts`);

  for (const bridge of bridges) {
    if (!bridge.link) continue;
    const dx = bridge.link[0] - bridge.x;
    const dy = bridge.link[1] - bridge.y;
    assert.ok(dx === 0 || dy === 0, `${bridge.name} reaches diagonally (${dx},${dy})`);
    assert.ok(Math.abs(dx) + Math.abs(dy) <= (bridge.block.range || 4),
      `${bridge.name} reaches ${Math.abs(dx) + Math.abs(dy)} tiles`);
  }
  assert.ok(bridges.some((b) => b.link), "and the valid bridges keep their link");
});

test("a pipe carries one liquid at a time", async () => {
  /* The game's own rule, not a simplification: `acceptLiquid` on a conduit reads
     `liquids.current() == liquid || liquids.currentAmount() < 0.2f`, so a pipe holding
     water refuses oil until the water is nearly gone. Letting a pipe carry both let the
     network mix them, and a liquid tank came out reporting 32 oil and 6,011 water a minute
     through the same three tiles. */
  const out = await analyse(REAL, {}, EAU);
  const mixing = out.detail.filter((tile) =>
    (tile.role === "conduit" || tile.role === "junction")
    && Object.values(tile.through || {}).filter((v) => v > 0.001).length > 1);

  assert.deepEqual(mixing.map((t) => `${t.name} (${t.x},${t.y})`), [],
    "no pipe carries two liquids");
});

test("a junction crosses two lines without merging them", async () => {
  /* A junction exists so two lines can cross. Handing on to all four sides made it merge
     the very lines it is there to keep apart. */
  const tiles = [
    [0, 0, "conveyor", 0], [1, 0, "junction", 0], [2, 0, "conveyor", 0],
    [1, 1, "conveyor", 3], [1, -1, "conveyor", 3],
  ];
  const out = await analyse(paste(tiles), { copper: 4 });
  const junction = out.detail.find((t) => t.name === "junction");
  assert.ok(junction, "the junction is there");
  assert.ok(out.produced.copper === undefined || out.produced.copper <= 4.001,
    "nothing is duplicated crossing through");
});

test("a turret eats what it is loaded with", async () => {
  /* Filed as a sink that consumed nothing, a belt feeding one carried items into a hole
     and the layout read as wasting them. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "duo", 0]];
  const out = await analyse(paste(tiles), { copper: 10 });

  const turret = out.detail.find((t) => t.name === "duo");
  assert.equal(turret.role, "turret");
  assert.ok(!out.idle.duo, "a fed turret is not waste");
  assert.ok(!out.produced.copper, "the copper goes in, it does not come back out");
});

test("a vault is somewhere a line delivers to", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [3, 0, "vault", 0]];
  const out = await analyse(paste(tiles), { copper: 5 });
  assert.ok(!out.produced.copper || out.produced.copper <= 5.001);
  assert.ok(!out.idle.vault, "a vault at the end of a line is not connected to nothing");
});

test("an unloader beside a container is where a line starts", async () => {
  /* It pulls rather than being pushed to, so nothing upstream feeds it, and a line
     beginning at one used to begin at nothing at all. */
  const tiles = [[0, 0, "vault", 0], [3, 0, "unloader", 0], [4, 0, "conveyor", 0]];
  const out = await analyse(paste(tiles));

  const unloader = out.detail.find((t) => t.name === "unloader");
  assert.equal(unloader.role, "unloader");
  assert.ok(!out.idle.unloader, "an unloader against a vault does something");
});

/* What the game itself puts in a schematic's info panel, and where Forge parts with it.
   `Schematic.powerProduction` sums `getDisplayedPowerProduction`, `powerConsumption` sums
   `consPower.usage`, both per tick, and neither knows an overdrive projector exists. */

test("power is counted on every block, not only on the power blocks", async () => {
  /* A phase conveyor draws 0.3 a tick and is filed under bridges. Counted per role, its
     18 a second went missing, and a 334 block layout came out 144 short of the game. */
  const out = await analyse(paste([[0, 0, "phase-conveyor", 0], [5, 0, "phase-conveyor", 0]]));
  close(out.potential.spent, 36, "deux convoyeurs de phase, 18 chacun");
});

test("an overdrive projector speeds up what stands under it", async () => {
  const alone = await analyse(paste([[0, 0, "steam-generator", 0]]));
  close(alone.potential.made, 330, "a steam generator is worth 330");

  const boosted = await analyse(paste([
    [0, 0, "steam-generator", 0], [3, 0, "overdrive-projector", 0]]));
  close(boosted.potential.made, 495, "under an accelerator it is worth half again");
  close(boosted.potential.spent, 210, "et l'accelerateur se paie 210");
});

test("an overdrive projector reaches ten tiles and no further", async () => {
  const far = await analyse(paste([
    [0, 0, "steam-generator", 0], [30, 0, "overdrive-projector", 0]]));
  close(far.potential.made, 330, "out of range, nothing accelerates");
});

test("a block exactly on the projector's circle is left alone", async () => {
  /* The same strictness the mass driver and the processor link were already held to, and
     the same source: `Mathf.within` is `dst2 < dst * dst`, so the circle itself is out.

     Both blocks are 2x2, so their centres share a row and the boundary lands on a whole
     number: the radius is 10 plus the generator's own half width, 11, against a distance
     of exactly 11. One tile nearer it is sped up, which is what makes this a boundary
     rather than an off-by-one somewhere else. */
  const on = await analyse(paste([
    [0, 0, "steam-generator", 0], [11, 0, "overdrive-projector", 0]]));
  close(on.potential.made, 330, "11 is not strictly less than 11");

  const inside = await analyse(paste([
    [0, 0, "steam-generator", 0], [10, 0, "overdrive-projector", 0]]));
  close(inside.potential.made, 495, "one tile closer, it accelerates");
});

test("a projector does not speed up another projector", async () => {
  /* `canOverdrive` is false on it, on walls and on the whole power grid. Read from the
     game rather than listed here, so a balance patch cannot make this quietly wrong. */
  const out = await analyse(paste([
    [0, 0, "overdrive-projector", 0], [3, 0, "overdrive-projector", 0]]));
  close(out.potential.spent, 420, "two accelerators, 210 each and not one more");
});

test("a sandbox source pours what it was configured with", async () => {
  const coal = { content: 0, id: known.items["coal"].id };
  const tiles = [[0, 0, "item-source", 0, coal], [1, 0, "conveyor", 0],
                 [2, 0, "conveyor", 0]];
  const out = await analyse(paste(tiles));

  /* Capped by the belt, not by the source: it offers a hundred a second and a conveyor
     carries six and a half. Read off the belt rather than off what the schematic is said
     to produce, because a tap the builder put inside it is something handed in, not
     something made: a layout fed coal and returning coal has made nothing. */
  const last = out.detail.filter((d) => d.name === "conveyor").pop();
  close(last.through.coal, 6.5, "the coal comes out at the belt's rate");
  assert.ok(!out.idle["item-source"], "a source feeds, it is not forgotten");
});

test("a liquid source is recognised even when nothing in the layout drinks it", async () => {
  const water = { content: 4, id: known.liquids["water"].id };
  const out = await analyse(paste([[0, 0, "liquid-source", 0, water], [1, 0, "conduit", 0]]));
  const pipe = out.detail.find((d) => d.name === "conduit");
  assert.ok(pipe.through.water > 0, "the water goes through the pipe");
});

test("what arrives is spread over the machines waiting for it", async () => {
  /* A maximum flow is free to fill some machines and abandon others, and it did: seven of
     forty-one thorium reactors read as fed nothing while the other thirty-four ran flat
     out, and the page named an ordinary reactor as the layout's bottleneck. The game
     hands material out round by round. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "router", 0],
                 [2, 0, "graphite-press", 0], [0, 1, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 1 }, inAt([0, 0, "coal"]));

  const presses = out.detail.filter((t) => t.name === "graphite-press");
  assert.equal(presses.length, 2);
  close(presses[0].fed, presses[1].fed, "both presses run the same");
  assert.ok(presses[0].fed > 0.01, "neither of the two is left at zero");
  assert.ok(presses[0].fed < 0.99, "and neither runs flat out on half the coal");
});

test("a machine nothing feeds stays at nothing", async () => {
  /* The other half of the same rule: sharing must not average away a real fault. A press
     wired to no belt at all is worth seeing. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "graphite-press", 0],
                 [8, 8, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));

  const presses = out.detail.filter((t) => t.name === "graphite-press")
    .sort((a, b) => b.fed - a.fed);
  assert.ok(presses[0].fed > 0.5, "the one that is connected runs");
  close(presses[1].fed, 0, "the one connected to nothing does not run");
});

test("a sandbox source gives the factory what it asks for, not a flood", async () => {
  /* A liquid source refills itself to ten thousand every tick, which is six hundred
     thousand a second, and a maximum flow pushed every drop of it into whatever pipe
     ended in the air: one layout reported making 557 million cryofluid a minute. */
  const water = { content: 4, id: known.liquids["water"].id };
  const tiles = [[0, 0, "liquid-source", 0, water], [1, 0, "conduit", 0],
                 [2, 0, "conduit", 0], [3, 0, "conduit", 0]];
  const out = await analyse(paste(tiles));

  const carried = out.detail.find((d) => d.name === "conduit").through.water;
  assert.ok(carried > 0 && carried < 1300,
            `a pipe does not pour out an ocean: ${carried}`);
});

test("a container is a buffer an unloader draws from, not a hole", async () => {
  /* A container swallowed whatever reached it and the unloader beside it was handed an
     invented supply out of nowhere, of whatever resource was being solved for. The two
     halves of one belt had nothing to do with each other. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "container", 0], [3, 0, "unloader", 0],
                 [4, 0, "conveyor", 0], [5, 0, "conveyor", 0]];
  const out = await analyse(paste(tiles), { copper: 4 }, inAt([0, 0, "copper"]));

  const last = out.detail.filter((d) => d.name === "conveyor").pop();
  close(last.through.copper, 4, "what went into the vault comes back out of the unloader");
});

test("an unloader hands on eleven items a second, not three hundred", async () => {
  /* `60 / speed`, which is the game's own stat line. Written as `speed * 60` it came out
     thirty times too fast and a container behind one looked like a mine. */
  close(known.blocks["unloader"].items_per_second, 11, "eleven a second");

  /* Fed straight into the container, so the belt in front is not what limits it: the
     unloader offers eleven a second and the titanium belt behind it takes ten. */
  const tiles = [[1, 0, "container", 0], [3, 0, "unloader", 0],
                 [4, 0, "titanium-conveyor", 0]];
  // The paste recentres on the bounding box: the vault lands back at (0, 0).
  const out = await analyse(paste(tiles), { copper: 40 }, inAt([0, 0, "copper"]));
  const belt = out.detail.find((d) => d.name === "titanium-conveyor");
  close(belt.through.copper, 10, "the titanium belt carries ten, the unloader offers eleven");
});

test("a sandbox source is not credited with what runs straight through", async () => {
  /* A reactor farm standing on twelve cryofluid sources was reported as producing a
     hundred thousand cryofluid a minute, which is the part nobody drank leaving by the
     nearest open pipe. */
  const water = { content: 4, id: known.liquids["water"].id };
  const out = await analyse(paste([[0, 0, "liquid-source", 0, water], [1, 0, "conduit", 0]]));
  assert.ok(!out.produced.water, "a source is not production");
});

test("a liquid a machine drinks is not reported as wasted", async () => {
  /* Counted on `block.input` alone, a liquid ingredient was never counted as eaten: a
     layout fed exactly the water its cultivators drink reported wasting all of it, on the
     same page that said the cultivators were running flat out. */
  const out = await analyse(REAL, {}, EAU);
  assert.ok(!out.surplus.water,
            `water drunk is not wasted: ${JSON.stringify(out.surplus)}`);
});

test("a build standing on its own sources is not asked where it plugs in", async () => {
  const coal = { content: 0, id: known.items["coal"].id };
  const out = await analyse(paste([[0, 0, "item-source", 0, coal], [1, 0, "conveyor", 0]]));
  assert.equal(out.selfFed, true, "it has its own taps");

  const plain = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]));
  assert.equal(plain.selfFed, false, "a belt on its own waits to be connected");
});

test("sealed means nothing arrives from outside", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "graphite-press", 0]];
  const marked = await analyse(paste(tiles), {}, inAt([0, 0, "coal"]));
  const shut = await analyse(paste(tiles), {}, inAt([0, 0, "coal"]), { sealed: true });

  const press = (report) => report.detail.find((d) => d.name === "graphite-press");
  assert.ok(press(marked).fed > 0, "marked, the press is fed");
  close(press(shut).fed, 0, "sealed, nothing arrives and nothing runs");
  assert.equal(shut.awaiting, false, "sealed is an answer, not the absence of one");
});

/**
 * The mass driver, on the analytic side.
 *
 * Written because the simulator and the page disagreed in silence: every oracle scenario
 * read exact while `analyse` said a linked pair carried nothing at all. `tools/compare.mjs`
 * only ever runs the simulation, so nothing in the bench could see it.
 */
const driverAt = (x, link) => ({
  x, y: 0, block: "mass-driver", rotation: 0,
  config: link ? { type: 7, dx: link, dy: 0 } : null,
});

test("a mass driver carries down its barrel", () => {
  const graph = buildGraph([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    driverAt(2, 10),
    driverAt(12, null),
    { x: 15, y: 0, block: "vault", rotation: 0 },
  ]);
  assert.ok(graph.out[0].includes(1), "a belt hands into a linked driver");
  assert.ok(graph.out[1].includes(2), "and it goes down the barrel");
  assert.ok(graph.out[2].includes(3), "and the far end empties into what touches it");

  const out = solve(graph, { 0: { copper: 40 } });
  close(out.delivered.copper, 6.5, "a belt is the ceiling, not the driver");
});

test("a mass driver set to nothing takes nothing", () => {
  const graph = buildGraph([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    driverAt(2, null),
    { x: 5, y: 0, block: "vault", rotation: 0 },
  ]);
  assert.ok(!graph.out[0].includes(1),
            "`acceptItem` is `linkValid()`, so an unset driver jams the belt behind it");
});

test("a mass driver caps a salvo at what it can reload", () => {
  const graph = buildGraph([driverAt(0, 10), driverAt(10, null),
                            { x: 13, y: 0, block: "vault", rotation: 0 }]);
  // Poured straight into the barrel, so the only ceiling left is the driver's own.
  const out = solve(graph, { 0: { copper: 500 } });
  close(out.delivered.copper, 36, "one hundred and twenty items every two hundred frames");
});

test("a mass driver link at exactly its range is refused", () => {
  const reach = known.blocks["mass-driver"].range;
  const near = buildGraph([driverAt(0, reach - 1), driverAt(reach - 1, null)]);
  assert.deepEqual(near.edges, [[0, 1]], "one tile inside, the barrel works");

  const edge = buildGraph([driverAt(0, reach), driverAt(reach, null)]);
  assert.deepEqual(edge.edges, [],
                   "`within` is strict, and the game saves the link then refuses it");
});

/**
 * The processors, declared rather than simulated.
 *
 * A processor consumes nothing at all, so it never enters a flow; what it is worth to a
 * reader is which blocks it drives and whether it drives them. Built here rather than
 * pasted from the game, because the format is the point of the test: `LogicBlock.compress`
 * is a deflate of one version byte, the program as a length-prefixed blob, and the links as
 * a Java `writeUTF` name and two shorts each.
 */
async function processorConfig(code, links = []) {
  const text = new TextEncoder().encode(code);
  const parts = [new Uint8Array([1])];

  const size = new Uint8Array(4);
  new DataView(size.buffer).setInt32(0, text.length);
  parts.push(size, text);

  const count = new Uint8Array(4);
  new DataView(count.buffer).setInt32(0, links.length);
  parts.push(count);

  for (const link of links) {
    const name = new TextEncoder().encode(link.name);
    const head = new Uint8Array(2);
    new DataView(head.buffer).setUint16(0, name.length);
    const where = new Uint8Array(4);
    new DataView(where.buffer).setInt16(0, link.dx);
    new DataView(where.buffer).setInt16(2, link.dy);
    parts.push(head, name, where);
  }

  const flat = new Uint8Array(parts.reduce((sum, one) => sum + one.length, 0));
  let at = 0;
  for (const one of parts) { flat.set(one, at); at += one.length; }

  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  writer.write(flat);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

test("a processor's program and links read back out of its configuration", async () => {
  const bytes = await processorConfig("sensor x vault1 @copper\nprint x\n",
                                      [{ name: "vault1", dx: 2, dy: 0 }]);
  const program = await readProgram(bytes);
  assert.equal(program.code, "sensor x vault1 @copper\nprint x\n");
  assert.deepEqual(program.links, [{ name: "vault1", dx: 2, dy: 0 }]);
});

test("a processor that only watches is not a processor that drives", async () => {
  const watching = await readProgram(await processorConfig(
    "sensor x vault1 @copper\nprint x\nprintflush message1\n"));
  assert.equal(drives(watching), false, "sensor and print change nothing");

  const driving = await readProgram(await processorConfig(
    "sensor x vault1 @copper\njump 4 lessThan x 100\ncontrol enabled conveyor1 0 0 0 0\n"));
  assert.equal(drives(driving), true, "`control` is the one instruction that reaches out");
});

test("a schematic says which blocks its processors drive", async () => {
  const nodes = buildGraph([
    { x: 0, y: 0, block: "micro-processor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "vault", rotation: 0 },
  ]).nodes;
  nodes[0].program = await readProgram(await processorConfig(
    "control enabled conveyor1 0 0 0 0\n",
    [{ name: "conveyor1", dx: 2, dy: 0 }, { name: "vault1", dx: 4, dy: 0 }]));

  assert.deepEqual(logicOf(nodes), {
    processors: 1, writing: 1, driven: ["conveyor", "vault"], unreachable: [],
  });
});

test("processors that only watch are named as harmless", async () => {
  const nodes = buildGraph([
    { x: 0, y: 0, block: "micro-processor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
  ]).nodes;
  nodes[0].program = await readProgram(await processorConfig(
    "sensor x conveyor1 @enabled\n", [{ name: "conveyor1", dx: 2, dy: 0 }]));

  assert.deepEqual(logicOf(nodes),
                   { processors: 1, writing: 0, driven: [], unreachable: [] });
});
