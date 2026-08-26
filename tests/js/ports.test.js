/**
 * Where a schematic plugs in, deduced rather than asked for.
 *
 * "A conveyor that starts from nowhere" is where something arrives, and that is obvious to
 * anyone looking at the picture. Asking the player for it was asking them to state what
 * the schematic already says.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue, paste } from "./helpers.js";

loadCatalogue();
const REAL = "bXNjaAF4nE1Sy27TQBS9HjszHid2yoptVdaWEEj0K1izqCo0iSeRhWMbe5yqQvwAEqISP8AX8gW05j5SQqT45Pq+zjk3kMFFAtm2a4Nvw3vXg/ryFXTjNr4Z4eLm6ubVbueur93t718PV7eQtO7g4eUHF/xw2Xd3+Hzz9vW7S9/6YX8Py8qP26HuQ921ADnkTf15qqty6CZsgLyfmtGXuK2a6gDFZqir/Tk2Gxew7B7WY/DuUO5pqgvdAOtt55pyixSHejftPazPrUd/jxXZdmpCfeTqYmorP+ya7q7cI1F4Eerg2no6nMuXJ2L4/hMsx74bfNkPfkTNrKpsu8qXjRtwF8BH4E8c4SOCmH4riWKJEokWECsEbeb56Sd+j4qyBiKCFCJKWkMN8zw/cjKT5FJgJTX5c80frikkuYYoAVqjCJRAAipC0LQ8wlXYEIGFWCNkhhlSB3LAHYre5mcCSAmHc8uaJCmkzmqAaSscpOhtjoLmp9MghS2x6I5ToF4GBZFlOzhKBNAQeqkFDNkTQ0r2POA3qAwLVxAnvFIRKIGEuCbi5A9yMl5giMtTBCvJ7Dk5KPKhoBskKCSmvbhyiWCJ8YJyQB5RiZYTajmhlhNqOaGWE2pZ/J0XYwDmn5OcJQXz48kPTcamCDlR50JmKpDQKQzPkw4UYjiNDxZiWMhpHIX5//8QI24bOhBaR3wJ0M4VQpZKuBLIBQoBdsLKmaycyRItC1bOZOVMlkRrBBb97STaimjiMfOcVMZzgZVALlAI4Ma/lba3pg==";

test("a belt that starts from nowhere is where something arrives", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles));

  const port = out.ports.inputs.find((p) => p.x === 0 && p.y === 0);
  assert.ok(port, "la bande qui ne recoit rien est une prise");
  assert.ok(port.wants.coal > 0, "et ce qu'elle attend vient de la presse au bout");
});

test("a schematic analyses itself with nothing typed", async () => {
  /* The whole point. A layout nobody described used to analyse to nothing at all. */
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles));

  assert.equal(out.fedItself, true);
  assert.ok(out.perMinute.graphite > 0, "elle se branche toute seule et produit");
});

test("a looping network still finds its sockets", async () => {
  /* Only dangling starts were looked for at first, which found none at all on this one:
     its pipes run in a loop and the pumps live outside the copy. A player plugs that in at
     the edge, so that is where the sockets are. */
  const out = await analyse(REAL);
  assert.ok(out.ports.inputs.length > 0, "un reseau en boucle a quand meme des prises");
  assert.ok(out.ports.inputs.some((p) => p.carries === "liquid" && p.wants.water),
    "des tuyaux qui attendent de l'eau");
  /* And some are belts, because the steam generators burn something. A port carries what
     the machines behind it want, not what the layout as a whole wants. */
  assert.ok(out.power.made > 0, "branchee toute seule, elle produit de l'energie");
});

test("a socket is not offered for something the layout makes itself", async () => {
  /* Every pipe inside a working chain reaches a machine that wants something. Saying so
     for all of them would list forty sockets on a schematic with two. */
  const out = await analyse(REAL);
  for (const port of out.ports.inputs) {
    for (const resource of Object.keys(port.wants)) {
      assert.ok(resource === "water" || resource.startsWith("*"),
        `${resource} est fabrique sur place, ce n'est pas une prise`);
    }
  }
});

test("supplying by hand overrides the automatic feed", async () => {
  /* Compared against itself rather than against the automatic feed. The two do not enter
     the network the same way: plugged in by itself, one socket carries everything, while a
     stated supply is spread over every entry the resource can use. Comparing them measured
     the routing, not the supply. */
  const plenty = await analyse(REAL, { water: 120 });
  const little = await analyse(REAL, { water: 20 });

  assert.equal(plenty.fedItself, false);
  assert.ok(plenty.power.made > little.power.made,
    `${little.power.made} avec 20/s contre ${plenty.power.made} avec 120/s`);
});

test("a socket marked by hand replaces the guess", async () => {
  /* Guessing where a schematic plugs in is genuinely hard: this one has fourteen faces a
     pipe could physically hand into and one intake the author meant. So the guess is a
     default, and what the player marks is the answer. */
  const guessed = await analyse(REAL);
  assert.ok(guessed.ports.inputs.length > 1, "plusieurs candidats sans consigne");

  const chosen = await analyse(REAL, {}, { "4,15": "in" });
  assert.deepEqual(Object.keys(chosen.marked), ["4,15"]);
  assert.equal(chosen.ports.inputs.length, 1, "un seul point, celui qu'on a designe");
  assert.deepEqual([chosen.ports.inputs[0].x, chosen.ports.inputs[0].y], [4, 15]);
  assert.ok(chosen.power.made > 0, "et elle tourne en etant nourrie par la");
});
