/**
 * The moving picture, checked where it can be checked.
 *
 * Two halves. The engine half is a fact about the game and is measured against the bench
 * like everything else here: an item handed to a belt from the side starts pressed against
 * that side and slides back to the middle, and it joins the queue where it physically is
 * rather than at the back of it. The drawing half is arithmetic - which sprite frame, which
 * point on the canvas - and arithmetic can be tested without a canvas.
 *
 * What is deliberately not tested here is whether it looks right. That is what watching it
 * is for.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { loadCatalogue, paste } from "./helpers.js";
import { buildGraph, useCatalogue } from "../../site/public/forge/bilan.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { World } from "../../site/public/forge/engine/core.js";
import { behaviourOf } from "../../site/public/forge/engine/carriers.js";
import { Live, absin, anchor, beltFrame, running } from "../../site/public/forge/live.js";
import { gridsOf } from "../../site/public/forge/engine/power.js";

const catalogue = loadCatalogue();
useCatalogue(catalogue);
const itemId = (name) => catalogue.items[name].id;

async function run(tiles, ticks) {
  const graph = buildGraph((await fromBase64(paste(tiles))).tiles);
  const world = new World(graph, behaviourOf);
  world.catalogue = catalogue;
  const seen = [];
  for (let i = 0; i < ticks; i++) {
    world.step(1);
    /* Copied, not referenced: a belt's arrays are the same three objects from the first
       frame to the last, so a list of references to them is the last frame written out
       however many times. */
    seen.push(world.builds.map((build) => ({
      x: build.x, y: build.y, role: build.role,
      ids: [...(build.state.ids || [])],
      ys: [...(build.state.ys || [])],
      xs: [...(build.state.xs || [])],
    })));
  }
  return { world, seen };
}

/** A straight belt fed from behind, and a second source pushing into its left flank. */
const SIDE_FED = [
  [0, 0, "item-source", 0, { content: 0, id: 0 }],
  [1, 0, "conveyor", 0],
  [2, 0, "conveyor", 0],
  [3, 0, "conveyor", 0],
  [2, -1, "item-source", 1, { content: 0, id: 0 }],
];

test("an item handed in from the side starts against that side", async () => {
  const tiles = structuredClone(SIDE_FED);
  tiles[0][4] = { content: 0, id: itemId("copper") };
  tiles[4][4] = { content: 0, id: itemId("lead") };
  const { world } = await run(tiles, 1);

  const belt = world.builds.find((b) => b.role === "conveyor" && b.x === 2 && b.y === 1);
  const at = belt.state.ids.indexOf("lead");
  assert.notEqual(at, -1, "the lead should have entered from the side");
  // `Conveyor.handleItem`: an item arriving across the belt lands at plus or minus one.
  assert.equal(Math.abs(belt.state.xs[at]), 1);
  // And half way along it rather than at its back, which is `ys[mid] = 0.5f`.
  assert.equal(belt.state.ys[at], 0.5);
});

test("and slides back to the middle at twice the belt's speed", async () => {
  const tiles = structuredClone(SIDE_FED);
  tiles[0][4] = { content: 0, id: itemId("copper") };
  tiles[4][4] = { content: 0, id: itemId("lead") };
  const { seen } = await run(tiles, 30);

  const across = seen.map((frame) => {
    const belt = frame.find((b) => b.role === "conveyor" && b.x === 2 && b.y === 1);
    const at = belt.ids.indexOf("lead");
    return at === -1 ? null : belt.xs[at];
  }).filter((value) => value !== null);

  assert.ok(across.length > 5);
  assert.equal(Math.abs(across[0]), 1);
  /* `Mathf.approach(xs[i], 0, moved * 2)`, and a copper belt moves 0.046 of a tile a frame,
     so an item is straight again inside a fifth of a second. Read off the catalogue rather
     than written here: the speed is game data and a copy of it in a test is a copy that
     goes stale on the next version. */
  const speed = catalogue.blocks.conveyor.speed;
  const step = Math.abs(across[0]) - Math.abs(across[1]);
  assert.ok(Math.abs(step - speed * 2) < 1e-6, `step of ${step}`);
  assert.ok(across.some((value) => value === 0), "it should end up in the middle");
});

test("a belt scrolls at its own speed and stops when it is backed up", () => {
  /* `(int)(Time.time * speed * 8) % 4`. A copper belt is 0.046, so a frame lasts about two
     and a half ticks and the whole cycle takes eleven. */
  const copper = catalogue.blocks.conveyor.speed;
  const belt = { block: { speed: copper }, state: { minitem: 1 } };
  const frames = [];
  for (let tick = 0; tick < 24; tick += 1) frames.push(beltFrame(belt, tick, 0, 1));
  assert.deepEqual(frames.slice(0, 6), [0, 0, 0, 1, 1, 1]);
  assert.ok(frames.includes(3), "the four frames should cycle through");

  // A titanium belt is nearly twice as fast, and its animation is too.
  const fast = { block: { speed: catalogue.blocks["titanium-conveyor"].speed },
                 state: { minitem: 1 } };
  assert.ok(beltFrame(fast, 4, 0, 1) > beltFrame(belt, 4, 0, 1));

  /* And a belt that has been backed up for a second stands still. `clogHeat` climbs by a
     sixtieth a frame and the sprite freezes past a half, which is why a jammed line in the
     game reads as jammed at a glance. */
  const stuck = { block: { speed: copper }, state: { minitem: 0 } };
  for (let tick = 0; tick < 40; tick += 1) beltFrame(stuck, tick, 0, 1);
  assert.equal(beltFrame(stuck, 41, 0, 1), 0);
});

test("a block's middle lands where the picture puts it", () => {
  const box = { left: 0, bottom: 0, width: 4, height: 4 };
  // One tile at the bottom left: half a tile in from the left, half a tile up from the
  // bottom, and screen y counts down from the top.
  const one = anchor({ x: 0, y: 0 }, 1, box, 32);
  assert.deepEqual([one.cx, one.cy], [16, 112]);
  assert.equal(one.unit, 4);

  // A three by three block is stored at its middle, so its middle is its own coordinates.
  const big = anchor({ x: 1, y: 1 }, 3, box, 32);
  assert.deepEqual([big.cx, big.cy], [48, 80]);
});

test("a duct remembers which side an item came in by", async () => {
  const tiles = [
    [0, 0, "item-source", 0, { content: 0, id: itemId("coal") }],
    [1, 0, "duct", 0],
    [2, 0, "duct", 1],
    [2, 1, "duct", 1],
  ];
  const { world } = await run(tiles, 40);
  const corner = world.builds.find((b) => b.role === "duct" && b.x === 2 && b.y === 0);
  // Fed from the west, pointing north: `recDir` is 0 and the drawn item turns the corner
  // rather than crossing the tile in a straight line.
  assert.equal(corner.state.from, 0);
  assert.equal(corner.rotation, 1);
});

test("a furnace comes up to heat rather than switching on", () => {
  /* `Mathf.approachDelta(warmup, 1, warmupSpeed)`, and a `GenericCrafter` climbs at 0.019
     a frame: two whole seconds to light up. Without it a glow snaps on between two frames,
     which is the one thing that gives away an animation somebody wrote by hand. */
  const oven = { block: { warmup_speed: 0.019 }, state: { efficiency: 1 } };
  assert.equal(running(oven, 1).warmup, 0.019);
  for (let tick = 0; tick < 60; tick += 1) running(oven, 1);
  assert.ok(running(oven, 1).warmup > 0.9);

  // And falls at the same rate the moment its supply is cut.
  oven.state.efficiency = 0;
  const hot = running(oven, 1).warmup;
  assert.ok(running(oven, 1).warmup < hot);

  /* `totalProgress` advances by the warmup reached and not by the time that passed: it is
     the clock every pulse is measured against, and a cold furnace does not pulse. */
  const cold = { block: {}, state: { efficiency: 0 } };
  for (let tick = 0; tick < 30; tick += 1) running(cold, 1);
  assert.equal(running(cold, 1).total, 0);
});

test("a glow breathes between nothing and its own maximum", () => {
  // `Mathf.absin(in, scl, mag) = (sin(in / (scl * 2)) * mag + mag) / 2`.
  assert.equal(absin(0, 10, 0.9), 0.45);
  const seen = [];
  for (let at = 0; at < 200; at += 1) seen.push(absin(at, 10, 0.9));
  assert.ok(Math.min(...seen) >= 0);
  assert.ok(Math.max(...seen) <= 0.9);
  // A whole cycle is `scl * 2 * 2 * PI`, about 126 frames at a scale of ten.
  assert.ok(Math.abs(absin(0, 10, 0.9) - absin(Math.round(10 * 4 * Math.PI), 10, 0.9)) < 0.01);
});

test("the drawing chain comes from the game, not from a file name", () => {
  /* The check that matters. An electrolyser glows lilac and a kiln burns orange, and
     nothing in `-glow` or in `-top` says so. Guessed, both colours are wrong; dumped, they
     are the game's. */
  const glow = catalogue.blocks.electrolyzer.drawers.find((one) => one.kind === "glow");
  assert.equal(glow.color, "#c4bdf3");
  assert.notEqual(glow.color, "#ff0000");

  const flame = catalogue.blocks.kiln.drawers.find((one) => one.kind === "flame");
  assert.equal(flame.color, "#ffc099");
  assert.notEqual(flame.color, catalogue.blocks["silicon-smelter"].drawers[0].color);

  // And a heater gives its heat back in red, breathing at the game's own rate.
  const heat = catalogue.blocks["electric-heater"].drawers.find((one) => one.kind === "heat");
  assert.deepEqual([heat.color, heat.pulse, heat.scale], ["#ff3838", 0.3, 10]);
});

/**
 * Where the schematic ends, in the picture as well as on the bench.
 *
 * The engine has always known this: a belt with nothing in front of it does not deliver,
 * it fills up and stops, so `run.js` puts a drain on the tile it points at. The page's own
 * simulation did not, so a design watched in the browser seized within seconds while the
 * same design measured against a real server delivered steadily. Two answers to one
 * question, and the one a player saw was the wrong one.
 */
test("a belt pointing out of the schematic delivers rather than backing up", async () => {
  const tiles = [[0, 0, "titanium-conveyor", 0], [1, 0, "titanium-conveyor", 0],
                 [2, 0, "titanium-conveyor", 0], [3, 0, "titanium-conveyor", 0]];
  const graph = buildGraph((await fromBase64(paste(tiles))).tiles);
  const first = graph.nodes.findIndex((node) => node.x === 0 && node.y === 0);

  // Six a second, well under the ten a titanium conveyor carries: this test is about the
  // end of the line, not about its ceiling.
  const live = new Live(graph, { catalogue, feeds: { [first]: { copper: 6 } } });

  // Ten seconds. A four-tile line holds three items a tile, so a line that could not
  // deliver would have been full and refusing after two of them.
  for (let i = 0; i < 600; i++) live.tick();

  const delivered = live.drains.reduce((sum, drain) => sum + (drain.taken.get("copper") || 0), 0);

  /* One drain, at (4, 0), and it has taken very nearly everything handed in: six a second
     for ten seconds, less what is still sliding along the line. Asserted as a floor rather
     than as a figure, because how many are in flight at the last tick is a sub-tile
     position, which this repository does not compare against anything. Twelve is what the
     line itself holds, so anything above it is proof that the end is open. */
  assert.equal(live.drains.length, 1);
  assert.ok(delivered > 50, `only ${delivered} delivered`);
});

/**
 * The page's run and the report above it make the same assumption about power.
 *
 * "Une fois nourrie a fond" prints what the machines would make at full tilt and lists the
 * draw beside it, which is the right question: a schematic is a piece of a base and the
 * base carries the current. The run assumed the opposite and said so nowhere, so pressing
 * play on a good factory showed it doing nothing at all.
 */
test("a schematic with no generator runs as if plugged in", async () => {
  // A smelter draws power and makes none. Fed sand and coal, and nothing else.
  const tiles = [[0, 0, "silicon-smelter", 0]];
  const graph = buildGraph((await fromBase64(paste(tiles))).tiles);
  const live = new Live(graph, { catalogue, gridsOf, feeds: {} });

  assert.equal(live.plugged.length, 1, "the one grid is plugged in");
  live.tick();
  assert.equal(live.world.grids[0].coverage, 1, "and covered");
});

test("a schematic that makes its own power is left to make it", async () => {
  /* A combustion generator with nothing to burn produces nothing, and the battery beside
     it stays flat. That is a fact about the design, measured against a real server, and
     the mains must not paper over it: this is a grid with a producer, so it is left
     alone. */
  const tiles = [[0, 0, "combustion-generator", 0], [2, 0, "battery", 0],
                 [1, 0, "power-node", 0]];
  const graph = buildGraph((await fromBase64(paste(tiles))).tiles);
  const live = new Live(graph, { catalogue, gridsOf, feeds: {} });

  assert.equal(live.plugged.length, 0, "nothing was plugged in");
  for (let i = 0; i < 60; i++) live.tick();
  assert.equal(live.world.grids[0].made, 0, "an unfed generator makes nothing");
});
