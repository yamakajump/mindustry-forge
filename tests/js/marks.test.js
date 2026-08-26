/**
 * What the player says goes in and what comes out.
 *
 * This module replaced a guess: Forge used to pick the likeliest boundary carrier per
 * resource and feed the layout through it, and everything on the page was computed from
 * that choice. These tests are about the thing that replaced it, and the first one is
 * about the guess being gone.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { candidates, feedFrom, markable, readMarks } from "../../site/public/forge/marks.js";
import { inAt, loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

test("nothing is fed until somebody says where from", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];

  const silent = await analyse(paste(tiles), { coal: 4 });
  assert.equal(silent.awaiting, true, "la question n'a pas de reponse");
  assert.equal(silent.detail.find((d) => d.name === "graphite-press").fed, 0);
  assert.equal(Object.keys(silent.perMinute).length, 0, "et donc aucun debit annonce");

  const said = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));
  assert.equal(said.awaiting, false);
  close(said.perMinute.graphite, 40, "marquee, elle tourne");
});

test("a marked tile says what it has to carry", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), {}, inAt([0, 0, "coal"]));

  assert.equal(out.ports.inputs.length, 1);
  const [port] = out.ports.inputs;
  assert.equal(port.resource, "coal");
  close(port.rate, 2 * 60 / 90, "une presse mange 1,33 charbon par seconde");
});

test("two tiles marked for the same thing share the demand", async () => {
  /* Two water pipes marked means two water pipes, not two schematics. */
  const tiles = [[0, 0, "conveyor", 0], [0, 2, "conveyor", 0],
                 [1, 0, "graphite-press", 0], [1, 2, "graphite-press", 0]];
  const out = await analyse(paste(tiles), {}, inAt([0, 0, "coal"], [0, 2, "coal"]));

  assert.equal(out.ports.inputs.length, 2);
  for (const port of out.ports.inputs) {
    close(port.rate, 2 * 60 / 90, "chacune amene de quoi nourrir sa presse");
  }
});

test("what comes out is read, not chosen", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "graphite-press", 0],
                 [3, 0, "conveyor", 0], [4, 0, "conveyor", 0]];
  const out = await analyse(paste(tiles), {}, {
    "0,0": { side: "in", resource: "coal" },
    "4,0": { side: "out", resource: null },
  });

  const [exit] = out.ports.outputs;
  assert.equal(exit.resource, "graphite", "la schematique dit quoi, le joueur dit ou");
  assert.ok(exit.rate > 0);
});

test("a pipe is never offered coal", async () => {
  const water = { content: 4, id: known.liquids["water"].id };
  const out = await analyse(paste([
    [0, 0, "conduit", 0], [1, 0, "cultivator", 0], [4, 0, "liquid-source", 0, water],
  ]));

  const offered = out.offers["0,0"] || [];
  assert.ok(offered.includes("water"), `un tuyau se voit proposer de l'eau : ${offered}`);
  assert.ok(!offered.includes("coal"), "et jamais du charbon");
});

test("a fuel wildcard is offered as the things that actually burn", () => {
  const pipe = { block: { carries: "item" }, role: "conveyor" };
  const offered = candidates(pipe, { "*combustible": 1 }, {}, known, () => false);

  assert.ok(offered.includes("coal"), `le charbon brule : ${offered}`);
  assert.ok(!offered.includes("copper"), "le cuivre non");
});

test("an old save with a bare side still reads", () => {
  /* The first shape of a mark was the string "in", with no resource on it. */
  assert.deepEqual(readMarks({ "3,7": "in" }), { "3,7": { side: "in", resource: null } });
  assert.deepEqual(readMarks({ "3,7": { side: "out", resource: "coal" } }),
                   { "3,7": { side: "out", resource: "coal" } });
  assert.deepEqual(readMarks({ "3,7": "peut-etre" }), {}, "et rien d'autre ne passe");
});

test("a mark only goes on something that carries", () => {
  const node = (block, role) => ({ block, role });
  assert.equal(markable(node({ carries: "item" }, "conveyor")), true);
  assert.equal(markable(node({}, "crafter")), false, "on ne branche pas sur une usine");
  assert.equal(markable(node({ carries: "item" }, "source")), false,
               "une source de bac a sable verse deja toute seule");
});

test("a marked tile with nothing picked takes what fits", () => {
  /* Clicking without picking is an answer too: this pipe, whatever the layout is short of
     that a pipe can hold. */
  const graph = { nodes: [{ x: 0, y: 0, block: { carries: "liquid" }, role: "conduit" }] };
  const feeds = feedFrom(graph, { "0,0": { side: "in", resource: null } },
                         { water: 12, coal: 3 }, (name) => name === "water");

  assert.deepEqual(feeds, { 0: { water: 12 } }, "l'eau oui, le charbon non");
});
