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
import { analyse } from "../../site/public/forge/analyse.js";
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

  assert.equal(after.tiles.length, before.tiles.length, "le meme nombre de blocs");
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.deepEqual(after.tags, before.tags, "le nom et les etiquettes suivent");

  for (let i = 0; i < before.tiles.length; i++) {
    const a = before.tiles[i];
    const b = after.tiles[i];
    assert.deepEqual([b.block, b.x, b.y, b.rotation], [a.block, a.x, a.y, a.rotation],
                     `bloc ${i}`);
    assert.deepEqual(b.config, a.config, `configuration du bloc ${i}`);
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
  assert.deepEqual(after.cost, before.cost, "le meme cout de construction");
  assert.ok(Math.abs(after.power.net - before.power.net) < 1e-6,
            `${after.power.net} contre ${before.power.net}`);
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
  // La presse fait deux de cote : la boite va de 0 a 2.
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

test("une configuration creee par l editeur survit a l ecriture", async () => {
  /* Le lecteur garde les octets bruts et l ecrivain les rejoue : parfait tant que rien ne
     CREE de configuration. L editeur en cree, puisqu un glisse de ponts lie chaque maillon
     au suivant. Sans ecriture des configurations, cette chaine sortait du site en file de
     ponts qui s ignorent : l image etait juste, le fichier etait faux, et rien ne le
     disait. */
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
  assert.equal(bout.config, null, "le dernier pont ne vise personne");

  const trieur = relu.tiles.find((t) => t.block === "sorter");
  assert.deepEqual({ type: trieur.config.type, content: trieur.config.content, id: trieur.config.id },
                   { type: 5, content: 0, id: 1 });
});
