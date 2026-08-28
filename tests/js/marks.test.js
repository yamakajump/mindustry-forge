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
  assert.equal(silent.awaiting, true, "the question has no answer");
  assert.equal(silent.detail.find((d) => d.name === "graphite-press").fed, 0);
  assert.equal(Object.keys(silent.perMinute).length, 0, "and so no rate is reported");

  const said = await analyse(paste(tiles), { coal: 4 }, inAt([0, 0, "coal"]));
  assert.equal(said.awaiting, false);
  close(said.perMinute.graphite, 40, "marked, it runs");
});

test("a marked tile says what it has to carry", async () => {
  const tiles = [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "graphite-press", 0]];
  const out = await analyse(paste(tiles), {}, inAt([0, 0, "coal"]));

  assert.equal(out.ports.inputs.length, 1);
  const [port] = out.ports.inputs;
  assert.equal(port.resource, "coal");
  close(port.rate, 2 * 60 / 90, "a press eats 1.33 coal a second");
});

test("two tiles marked for the same thing share the demand", async () => {
  /* Two water pipes marked means two water pipes, not two schematics. */
  const tiles = [[0, 0, "conveyor", 0], [0, 2, "conveyor", 0],
                 [1, 0, "graphite-press", 0], [1, 2, "graphite-press", 0]];
  const out = await analyse(paste(tiles), {}, inAt([0, 0, "coal"], [0, 2, "coal"]));

  assert.equal(out.ports.inputs.length, 2);
  for (const port of out.ports.inputs) {
    close(port.rate, 2 * 60 / 90, "each one brings enough to feed its press");
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
  assert.equal(exit.resource, "graphite", "the schematic says what, the player says where");
  assert.ok(exit.rate > 0);
});

test("a pipe is never offered coal", async () => {
  const water = { content: 4, id: known.liquids["water"].id };
  const out = await analyse(paste([
    [0, 0, "conduit", 0], [1, 0, "cultivator", 0], [4, 0, "liquid-source", 0, water],
  ]));

  const offered = out.offers["0,0"] || [];
  assert.ok(offered.includes("water"), `a pipe should be offered water: ${offered}`);
  assert.ok(!offered.includes("coal"), "and never coal");
});

test("a fuel wildcard is offered as the things that actually burn", () => {
  const pipe = { block: { carries: "item" }, role: "conveyor" };
  const offered = candidates(pipe, { "*combustible": 1 }, {}, known, () => false);

  assert.ok(offered.includes("coal"), `coal burns: ${offered}`);
  assert.ok(!offered.includes("copper"), "copper does not");
});

test("an old save with a bare side still reads", () => {
  /* The first shape of a mark was the string "in", with no resource on it. */
  assert.deepEqual(readMarks({ "3,7": "in" }), { "3,7": { side: "in", resource: null } });
  assert.deepEqual(readMarks({ "3,7": { side: "out", resource: "coal" } }),
                   { "3,7": { side: "out", resource: "coal" } });
  assert.deepEqual(readMarks({ "3,7": "peut-etre" }), {}, "and nothing else gets through");
});

test("a mark goes on anything that can be plugged into", () => {
  /* It used to be carriers only, which is wrong in the ordinary case: a belt coming from
     outside ends on a press as happily as on another belt. */
  const node = (block, role) => ({ block, role });
  assert.equal(markable(node({ carries: "item" }, "conveyor")), true);
  assert.equal(markable(node({}, "crafter")), true, "a belt can end on a factory");
  assert.equal(markable(node({}, "turret")), true, "and on a turret");
  assert.equal(markable(node({}, "store")), true, "and into a vault");

  assert.equal(markable(node({}, "power")), false, "a belt is not plugged into a battery");
  assert.equal(markable(node({}, "unknown")), false);
  assert.equal(markable(node({ carries: "item" }, "source")), false,
               "a sandbox source already pours by itself");
});

test("a machine is offered its own recipe, not the whole shortfall", async () => {
  const out = await analyse(paste([[0, 0, "graphite-press", 0], [4, 0, "duo", 0]]));
  assert.deepEqual(out.offers["0,0"], ["coal"], "a press eats coal");
  assert.ok(out.offers["4,0"].includes("graphite"), "a turret eats its ammunition");
  assert.ok(!out.offers["4,0"].includes("coal"), "and not coal");
});

test("an arrival can land straight on a machine", async () => {
  /* No belt in the picture at all: the schematic is one press, and the coal arrives on it
     from a base that was not copied. */
  const out = await analyse(paste([[0, 0, "graphite-press", 0]]), {},
                            inAt([0, 0, "coal"]));
  close(out.detail[0].fed, 1, "the press runs");
  close(out.perMinute.graphite, 40, "and outputs its graphite");
});

test("a marked tile with nothing picked takes what fits", () => {
  /* Clicking without picking is an answer too: this pipe, whatever the layout is short of
     that a pipe can hold. */
  const graph = { nodes: [{ x: 0, y: 0, block: { carries: "liquid" }, role: "conduit" }] };
  const feeds = feedFrom(graph, { "0,0": { side: "in", resource: null } },
                         { water: 12, coal: 3 }, (name) => name === "water");

  assert.deepEqual(feeds, { 0: { water: 12 } }, "water yes, coal no");
});
