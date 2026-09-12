/**
 * What kind of thing a schematic is.
 *
 * The case this exists for is the one the old report got wrong: a wall of logic displays
 * showing a meme was treated as a factory that had failed to be measured, asked where it
 * plugged in, and given a ceiling of nothing. Most of what is asserted here is about the
 * order of the tests, because the order is the whole design.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COURANT, DEFEND, FABRIQUE, MONTRE, RIEN, TRANSPORTE, seBranche, typeOf }
  from "../../site/public/forge/rapport/type.js";

/** A catalogue holding only what a test names, shaped like the real one. */
const catalogue = {
  blocks: {
    "logic-display": { kind: "LogicDisplay", size: 3, category: "logic" },
    "large-logic-display": { kind: "LogicDisplay", size: 6, category: "logic" },
    "micro-processor": { kind: "LogicBlock", size: 1, category: "logic" },
    "battery": { kind: "Battery", size: 1, category: "power", role: "power" },
    "solar-panel": { kind: "SolarGenerator", size: 1, category: "power", role: "generator" },
    "thermal-generator": { kind: "ThermalGenerator", size: 2, category: "power", role: "generator" },
    "graphite-press": { kind: "GenericCrafter", size: 2, category: "crafting", role: "crafter" },
    "duo": { kind: "ItemTurret", size: 1, category: "turret", role: "turret" },
    "titanium-conveyor": { kind: "Conveyor", size: 1, category: "distribution", role: "conveyor" },
    "copper-wall": { kind: "Wall", size: 1, category: "defense" },
    "ground-factory": { kind: "UnitFactory", size: 3, category: "units", role: "unit-factory" },
  },
};

const bilan = (held, extra = {}) => ({
  held,
  potentialPerMinute: {},
  potential: { made: 0, spent: 0 },
  ...extra,
});

test("a wall of displays is something that shows, not a factory that failed", () => {
  const what = typeOf(bilan({ "large-logic-display": 1, "micro-processor": 2 }), catalogue);

  assert.equal(what.kind, MONTRE);
  assert.equal(what.ecrans, 1);
  assert.equal(what.processeurs, 2);
});

test("a display lit by its own solar panel is still a display", () => {
  /* The reason displays are tested first. A meme wall almost always carries a battery and
     a panel to light itself, and asking "does it make power" first files half of them as
     power plants. */
  const what = typeOf(bilan(
    { "logic-display": 4, "micro-processor": 1, "solar-panel": 2, battery: 1 },
    { potential: { made: 6, spent: 2 } },
  ), catalogue);

  assert.equal(what.kind, MONTRE);
});

test("a factory that happens to carry a status display is a factory", () => {
  const what = typeOf(bilan(
    { "graphite-press": 4, "logic-display": 1, "titanium-conveyor": 20 },
    { potentialPerMinute: { graphite: 160 } },
  ), catalogue);

  assert.equal(what.kind, FABRIQUE);
});

test("a factory nobody has marked is still a factory", () => {
  // The kind of thing a schematic is cannot depend on whether somebody marked it, which is
  // why the ceiling decides and not the measured throughput.
  const what = typeOf(bilan(
    { "graphite-press": 2 },
    { potentialPerMinute: { graphite: 80 }, perMinute: {} },
  ), catalogue);

  assert.equal(what.kind, FABRIQUE);
});

test("a unit factory makes something no item rate would report", () => {
  const what = typeOf(bilan({ "ground-factory": 2, "titanium-conveyor": 8 }), catalogue);

  assert.equal(what.kind, FABRIQUE);
});

test("generators that make more than they burn are a power plant", () => {
  const what = typeOf(bilan(
    { "thermal-generator": 6, "titanium-conveyor": 4 },
    { potential: { made: 2970, spent: 568 } },
  ), catalogue);

  assert.equal(what.kind, COURANT);
});

test("turrets with nothing to make are defence", () => {
  const what = typeOf(bilan({ duo: 8, "copper-wall": 20 }), catalogue);

  assert.equal(what.kind, DEFEND);
});

test("belts and nothing else carry things", () => {
  const what = typeOf(bilan({ "titanium-conveyor": 40 }), catalogue);

  assert.equal(what.kind, TRANSPORTE);
});

test("a block of walls is none of the above, which is an answer", () => {
  const what = typeOf(bilan({ "copper-wall": 60 }), catalogue);

  assert.equal(what.kind, RIEN);
});

test("an empty schematic does not divide by its own nothing", () => {
  assert.equal(typeOf(bilan({}), catalogue).kind, RIEN);
  assert.equal(typeOf({}, catalogue).kind, RIEN);
  assert.equal(typeOf({}, null).kind, RIEN);
});

test("a block this catalogue has never seen is counted as nothing, not crashed on", () => {
  const what = typeOf(bilan({ "mod-block-nobody-has": 40, duo: 2 }), catalogue);

  assert.equal(what.kind, DEFEND);
});

test("only the kinds with something to plug in are asked where they plug in", () => {
  // The defect the whole file exists for: asking a wall of displays where its intake is.
  assert.equal(seBranche(MONTRE), false);
  assert.equal(seBranche(RIEN), false);
  assert.equal(seBranche(FABRIQUE), true);
  assert.equal(seBranche(COURANT), true);
  assert.equal(seBranche(DEFEND), true);
  assert.equal(seBranche(TRANSPORTE), true);
});

test("a large display counts for its whole footprint, not for one tile", () => {
  // Tiles and not blocks: one large display covers thirty-six of them, and a rule counting
  // blocks would weigh it the same as a single conveyor.
  const mur = typeOf(bilan({ "large-logic-display": 1, "titanium-conveyor": 12 }), catalogue);

  assert.equal(mur.kind, MONTRE);
});
