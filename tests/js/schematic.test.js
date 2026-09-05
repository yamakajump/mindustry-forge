/**
 * Reading the game's format, and writing it back.
 *
 * The round trip is the test that matters and it is checked against the game's own bytes
 * rather than against a writer of my own: a reader checked against a writer that shares
 * its assumptions checks nothing. A real schematic, pasted by a real player, goes through
 * the reader and back out through the writer, and what comes back has to be the same
 * schematic block for block.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { fromBase64, read, toBase64, write } from "../../site/public/forge/schematic.js";
import { analyse } from "../../site/public/forge/bilan.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;

/** The same real schematic the analysis tests use. */
const REAL = "bXNjaAF4nE1Sy27TQBS9HjszHid2yoptVdaWEEj0K1izqCo0iSeRhWMbe5yqQvwAEqISP8AX8gW05j5SQqT45Pq+zjk3kMFFAtm2a4Nvw3vXg/ryFXTjNr4Z4eLm6ubVbueur93t718PV7eQtO7g4eUHF/xw2Xd3+Hzz9vW7S9/6YX8Py8qP26HuQ921ADnkTf15qqty6CZsgLyfmtGXuK2a6gDFZqir/Tk2Gxew7B7WY/DuUO5pqgvdAOtt55pyixSHejftPazPrUd/jxXZdmpCfeTqYmorP+ya7q7cI1F4Eerg2no6nMuXJ2L4/hMsx74bfNkPfkTNrKpsu8qXjRtwF8BH4E8c4SOCmH4riWKJEokWECsEbeb56Sd+j4qyBiKCFCJKWkMN8zw/cjKT5FJgJTX5c80frikkuYYoAVqjCJRAAipC0LQ8wlXYEIGFWCNkhhlSB3LAHYre5mcCSAmHc8uaJCmkzmqAaSscpOhtjoLmp9MghS2x6I5ToF4GBZFlOzhKBNAQeqkFDNkTQ0r2POA3qAwLVxAnvFIRKIGEuCbi5A9yMl5giMtTBCvJ7Dk5KPKhoBskKCSmvbhyiWCJ8YJyQB5RiZYTajmhlhNqOaGWE2pZ/J0XYwDmn5OcJQXz48kPTcamCDlR50JmKpDQKQzPkw4UYjiNDxZiWMhpHIX5//8QI24bOhBaR3wJ0M4VQpZKuBLIBQoBdsLKmaycyRItC1bOZOVMlkRrBBb97STaimjiMfOcVMZzgZVALlAI4Ma/lba3pg==";

test("a real schematic survives being written back out", async () => {
  const before = await fromBase64(REAL);
  const after = await fromBase64(await toBase64(before.tiles, {
    tags: before.tags, sizeOf,
  }));

  assert.equal(after.tiles.length, before.tiles.length, "the same number of blocks");
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.deepEqual(after.tags, before.tags, "the name and the tags carry over");

  for (let i = 0; i < before.tiles.length; i++) {
    const a = before.tiles[i];
    const b = after.tiles[i];
    assert.deepEqual([b.block, b.x, b.y, b.rotation], [a.block, a.x, a.y, a.rotation],
                     `block ${i}`);
    assert.deepEqual(b.config, a.config, `block ${i}'s configuration`);
  }
});

test("what comes back out analyses to the same thing", async () => {
  /* The stronger check: not that the bytes look alike, but that the schematic still is the
     schematic. A bridge whose link was mangled or a sorter whose filter was dropped would
     read fine and behave differently. */
  const eau = { "4,15": { side: "in", resource: "water" } };
  const before = await analyse(REAL, {}, eau);
  const written = await toBase64((await fromBase64(REAL)).tiles, { sizeOf });
  const after = await analyse(written, {}, eau);

  assert.equal(after.blocks, before.blocks);
  assert.deepEqual(after.cost, before.cost, "the same build cost");
  assert.ok(Math.abs(after.power.net - before.power.net) < 1e-6,
            `${after.power.net} vs ${before.power.net}`);
});

test("a block placed by hand comes out readable", async () => {
  const written = await toBase64([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "graphite-press", rotation: 0 },
  ], { tags: { name: "posee a la main" }, sizeOf });

  const back = await fromBase64(written);
  assert.equal(back.tags.name, "posee a la main");
  assert.equal(back.tiles.length, 2);
  assert.deepEqual(back.tiles.map((t) => t.block), ["conveyor", "graphite-press"]);
  // The press is two tiles wide: the box runs from 0 to 2.
  assert.equal(back.width, 3);
});

test("the writer and the reader agree with a writer that shares nothing with them", async () => {
  /* `paste` in the test helpers is written from the format description alone and knows
     nothing about this module. Two independent writers producing the same schematic is
     the closest thing to a second opinion available without the game. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 1], [2, 0, "router", 0]];
  const theirs = await fromBase64(paste(tiles, "essai"));
  const mine = await fromBase64(await toBase64(theirs.tiles, {
    tags: theirs.tags, sizeOf,
  }));

  assert.deepEqual(mine.tiles.map((t) => [t.block, t.x, t.y, t.rotation]),
                   theirs.tiles.map((t) => [t.block, t.x, t.y, t.rotation]));
});

test("an empty schematic is refused rather than written", async () => {
  await assert.rejects(() => toBase64([], { sizeOf }), /vide/);
});

test("a configuration created by the editor survives being written", async () => {
  /* The reader keeps the raw bytes and the writer replays them: fine as long as nothing
     CREATES a configuration. The editor does, since dragging a run of bridges links each
     link to the next. Without writing configurations, that chain used to come out of the
     site as a row of bridges ignoring each other: the picture was right, the file was
     wrong, and nothing said so. */
  const tiles = [
    { x: 0, y: 0, block: "bridge-conveyor", rotation: 0,
      config: { type: 7, dx: 4, dy: 0 } },
    { x: 4, y: 0, block: "bridge-conveyor", rotation: 0 },
    { x: 2, y: 2, block: "sorter", rotation: 0,
      config: { type: 5, content: 0, id: 1 } },
  ];
  const relu = await read(await write(tiles, { tags: { name: "ponts" }, sizeOf: () => 1 }));

  const pont = relu.tiles.find((t) => t.x === 0 && t.y === 0);
  assert.deepEqual({ type: pont.config.type, dx: pont.config.dx, dy: pont.config.dy },
                   { type: 7, dx: 4, dy: 0 });

  const bout = relu.tiles.find((t) => t.block === "bridge-conveyor" && t.x === 4);
  assert.equal(bout.config, null, "the last bridge points at nobody");

  const trieur = relu.tiles.find((t) => t.block === "sorter");
  assert.deepEqual({ type: trieur.config.type, content: trieur.config.content, id: trieur.config.id },
                   { type: 5, content: 0, id: 1 });
});

test("the write order is the game's own build order", async () => {
  /* `Block.schematicPriority` goes from +10 for a plastanium wall to -15 for a surge
     tower: what protects gets built first, what links gets built last, once what it has
     to link to exists. Writing in placement order would place a power node before the
     reactors it was meant to feed. */
  const priorites = { "power-node": -10, "plastanium-wall": 10, conveyor: 0 };
  const tiles = [
    { x: 0, y: 0, block: "power-node", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "plastanium-wall", rotation: 0 },
  ];
  const relu = await read(await write(tiles, {
    sizeOf: () => 1,
    priorityOf: (name) => priorites[name] ?? 0,
  }));
  assert.deepEqual(relu.tiles.map((t) => t.block),
                   ["plastanium-wall", "conveyor", "power-node"]);
});

test("at equal priority, the original order holds", async () => {
  // Otherwise two exports of the same schematic would give two different files.
  const tiles = [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "router", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
  ];
  const relu = await read(await write(tiles, { sizeOf: () => 1 }));
  assert.deepEqual(relu.tiles.map((t) => t.x), [0, 1, 2]);
});
