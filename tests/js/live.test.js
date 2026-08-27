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
import { buildGraph, useCatalogue } from "../../site/public/forge/analyse.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { World } from "../../site/public/forge/engine/core.js";
import { behaviourOf } from "../../site/public/forge/engine/carriers.js";
import { anchor, beltFrame } from "../../site/public/forge/live.js";

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
  assert.notEqual(at, -1, "le plomb devrait etre entre par le cote");
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
  assert.ok(Math.abs(step - speed * 2) < 1e-6, `pas de ${step}`);
  assert.ok(across.some((value) => value === 0), "il devrait finir au milieu");
});

test("a belt scrolls at its own speed and stops when it is backed up", () => {
  /* `(int)(Time.time * speed * 8) % 4`. A copper belt is 0.046, so a frame lasts about two
     and a half ticks and the whole cycle takes eleven. */
  const copper = catalogue.blocks.conveyor.speed;
  const belt = { block: { speed: copper }, state: { minitem: 1 } };
  const frames = [];
  for (let tick = 0; tick < 24; tick += 1) frames.push(beltFrame(belt, tick, 0, 1));
  assert.deepEqual(frames.slice(0, 6), [0, 0, 0, 1, 1, 1]);
  assert.ok(frames.includes(3), "les quatre images devraient defiler");

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
