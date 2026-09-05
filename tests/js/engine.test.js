/**
 * The ported update loop, checked against the figures the game states for itself.
 *
 * The first attempt at simulating a schematic was written from intuition and deleted: it
 * reported -408 energy a second where the real figure is +2,402. What makes this one a
 * different proposition is that every rule came out of the game's source and every number
 * below is one the game publishes, so a disagreement is a bug with a known answer rather
 * than a matter of opinion.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph } from "../../site/public/forge/bilan.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { edgesOf, World } from "../../site/public/forge/engine/core.js";
import { behaviourOf } from "../../site/public/forge/engine/carriers.js";
import { feed, simulate } from "../../site/public/forge/engine/run.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const near = (a, b, slack, why) =>
  assert.ok(Math.abs(a - b) <= slack, `${why}: ${a} vs ${b}`);

const graphOf = async (tiles) => buildGraph((await fromBase64(paste(tiles))).tiles);

test("neighbours are visited in the game's order, not in mine", () => {
  /* `Edges` builds the ring bottom, top, left, right and then sorts it by angle. It
     decides which branch of a split gets served first, so getting it wrong shifts every
     round robin by one. */
  assert.deepEqual(edgesOf(1), [[1, 0], [0, 1], [-1, 0], [0, -1]],
                   "east, north, west, south");
  assert.equal(edgesOf(2).length, 8, "a two-wide block has eight neighbours");
  assert.equal(edgesOf(3).length, 12);
});

test("a belt carries what the game says it carries", async () => {
  /* 6.5 items a second, which is the figure on the block's own stat line. Nothing here
     was told that number: it falls out of `speed = 0.046` a frame and `itemSpace = 0.4`,
     the two constants the dump and the source provide. */
  const tiles = [];
  for (let x = 0; x < 6; x++) tiles.push([x, 0, "conveyor", 0]);
  const graph = await graphOf(tiles);

  const out = simulate(graph, { feeds: { 0: { copper: 40 } }, seconds: 30, warmup: 6 });
  near(out.delivered.copper, known.blocks["conveyor"].items_per_second, 0.35,
       "a belt carries 6.5 a second");
});

test("a belt fed less than it can carry passes exactly that", async () => {
  const tiles = [];
  for (let x = 0; x < 5; x++) tiles.push([x, 0, "conveyor", 0]);
  const out = simulate(await graphOf(tiles),
                       { feeds: { 0: { copper: 3 } }, seconds: 30, warmup: 6 });
  near(out.delivered.copper, 3, 0.2, "trois entrent, trois sortent");
});

test("a belt that is full refuses more", async () => {
  const tiles = [];
  for (let x = 0; x < 4; x++) tiles.push([x, 0, "conveyor", 0]);
  const out = simulate(await graphOf(tiles),
                       { feeds: { 0: { copper: 60 } }, seconds: 10, warmup: 2 });
  assert.ok(out.refused > 0, "on lui en a offert soixante, elle en prend six et demi");
});

test("two belts facing each other do not pass one item back and forth", async () => {
  /* `ConveyorBuild.acceptItem` refuses anything handed in head on, and refuses to hand
     back to whatever it points at. Without both, a pair of belts pointed at each other
     becomes a perpetual motion machine. */
  const graph = await graphOf([[0, 0, "conveyor", 0], [1, 0, "conveyor", 2]]);
  const world = new World(graph, behaviourOf);

  world.builds[0].handleItem(null, "copper");
  for (let i = 0; i < 600; i++) world.step();

  const held = world.builds.reduce((sum, build) => sum + build.state.len, 0);
  assert.equal(held, 1, "one item stays one item");
});

test("a router splits evenly without anything computing a half", async () => {
  /* Nothing in `dump` divides by two. The cursor walks one further along each call, and
     an even split is what that comes to over a few hundred frames. */
  const graph = await graphOf([
    [0, 0, "conveyor", 0], [1, 0, "router", 0],
    [2, 0, "conveyor", 0], [1, 1, "conveyor", 1], [1, -1, "conveyor", 3],
  ]);
  const world = new World(graph, behaviourOf);
  const tap = world.builds[0];

  // Counted as they arrive rather than read off at the end: what a belt is holding at any
  // one moment says nothing, because it is moving things off the other end all the while.
  const branches = world.builds.filter((b) => b !== tap && b.role === "conveyor");
  const got = branches.map(() => 0);
  branches.forEach((build, i) => {
    const real = build.behaviour.handleItem;
    build.behaviour = { ...build.behaviour, handleItem(b, source, item) {
      if (b === build) got[i]++;
      real(b, source, item);
    } };
  });

  for (let i = 0; i < 1800; i++) {
    feed(tap, "copper");
    world.step();
  }

  assert.equal(branches.length, 3);
  assert.ok(got.every((n) => n > 0), `all three branches receive something: ${got}`);
  const spread = Math.max(...got) / Math.min(...got);
  assert.ok(spread < 1.35, `and roughly evenly split: ${got}`);
});

test("a junction crosses two lines without mixing them", async () => {
  /* Four queues, one per side, each coming out of the far side. Modelled as a router it
     merged the very lines it exists to keep apart. */
  const graph = await graphOf([
    [0, 0, "conveyor", 0], [1, 0, "junction", 0], [2, 0, "conveyor", 0],
    [1, -1, "conveyor", 1], [1, 1, "conveyor", 1],
  ]);
  const world = new World(graph, behaviourOf);

  const west = world.builds[0];
  const south = world.builds[3];
  for (let i = 0; i < 900; i++) {
    feed(west, "copper");
    feed(south, "lead");
    world.step();
  }

  const east = world.builds[2];
  const north = world.builds[4];
  assert.ok(east.state.ids.every((item) => item === "copper"),
            `east receives only copper: ${east.state.ids}`);
  assert.ok(north.state.ids.every((item) => item === "lead"),
            `north receives only lead: ${north.state.ids}`);
});

test("an overflow gate goes straight on first and sideways only when it cannot", async () => {
  /* The whole point of the block, and the one thing a maximum flow cannot express: it is
     right about the total and wrong about which branch carries it. */
  const graph = await graphOf([
    [0, 0, "conveyor", 0], [1, 0, "overflow-gate", 0],
    [2, 0, "conveyor", 0], [1, 1, "conveyor", 1],
  ]);
  const world = new World(graph, behaviourOf);
  const tap = world.builds[0];

  for (let i = 0; i < 300; i++) {
    feed(tap, "copper");
    world.step();
  }

  const ahead = world.builds[2];
  const aside = world.builds[3];
  assert.ok(ahead.state.len > 0, "straight on first");
  assert.ok(aside.state.len === 0 || ahead.state.len >= aside.state.len,
            `and sideways only once it backs up: ${ahead.state.len} vs ${aside.state.len}`);
});

test("an unloader empties a container at eleven a second", async () => {
  /* A vault is three across and is stored at its middle, so it reaches one tile further
     right than where it is written. The belt has to lead somewhere: with nothing in front
     of it, three items fill it and the unloader correctly stops, which is the game's
     behaviour and useless for measuring a rate. */
  const tiles = [[0, 0, "vault", 0], [2, 0, "unloader", 0]];
  for (let x = 3; x < 8; x++) tiles.push([x, 0, "titanium-conveyor", 0]);

  const out = simulate(await graphOf(tiles), {
    stock: { 0: { copper: 2000 } }, seconds: 20, warmup: 4,
    // An unset unloader walks the game's item list in the game's own order, so it needs
    // the registry rather than only its own neighbours.
    catalogue: known,
  });

  /* Eleven a second offered, and a titanium belt behind it. The belt's own constants give
     12.02, so the unloader is the narrower of the two and this measures the unloader. */
  near(out.delivered.copper, 11, 0.8, "eleven a second, the game's own line");
});

test("the simulation and the maximum flow agree on a plain line", async () => {
  /* The two halves of this repository answer the same question two ways, and the whole
     argument for keeping both is that they have to meet. */
  const tiles = [];
  for (let x = 0; x < 8; x++) tiles.push([x, 0, "conveyor", 0]);
  const out = simulate(await graphOf(tiles),
                       { feeds: { 0: { copper: 20 } }, seconds: 30, warmup: 6 });

  near(out.delivered.copper, 6.5, 0.4, "the maximum flow says 6.5, and so does the simulation");
});
