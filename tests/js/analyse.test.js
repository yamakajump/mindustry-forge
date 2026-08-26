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
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
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
  const out = await analyse(paste(tiles), { coal: 4 });
  close(out.perMinute.graphite, 40, "one graphite every ninety ticks");
  assert.equal(out.produced.coal, undefined, "the coal became graphite");
});

test("a starved machine is named rather than averaged", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: (2 * 60 / 90) / 3 });
  assert.equal(out.bottleneck[0], "graphite-press");
  close(out.bottleneck[1], 1 / 3, "fed a third of what it wants");
});

test("a stranded machine is waste and not the bottleneck", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0],
                 [2, 8, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 4 });
  assert.deepEqual(out.idle, { "graphite-press": 1 });
  assert.equal(out.bottleneck, null, "the connected press runs flat out");
});

test("a stranded belt is not fed and does not count as output", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [9, 9, "conveyor", 0]];
  const out = await analyse(paste(tiles), { coal: 4 });
  assert.deepEqual(out.idle, { conveyor: 1 });
  close(out.produced.coal, 4, "only the connected line carries anything");
});

test("oversupply is reported rather than swallowed", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), { coal: 4 });
  close(out.surplus.coal, 4 - 2 * 60 / 90, "a press eats 1.33 coal a second");
});

test("the cost of building it is counted", async () => {
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]));
  assert.deepEqual(out.cost, { copper: 2 }, "a conveyor costs one copper");
});

test("a smelter declares its power draw", async () => {
  const out = await analyse(paste([[0, 0, "silicon-smelter", 0]]));
  close(out.power, 30, "a layout reported without power promises a throughput the game will not give");
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
