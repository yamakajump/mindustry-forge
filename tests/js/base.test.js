/**
 * What a schematic takes out of the base it was copied from.
 *
 * A schematic is a module, not a world. The thing it was standing against when somebody
 * pressed copy - a core, a vault, the grid behind it - does not come across, and reading
 * its absence as an absence of supply is reading the copy rather than the design.
 *
 * That is not a small class. Nine thousand one hundred and twenty-five of the catalogue's
 * fifteen thousand five hundred and thirty-four schematics draw current and generate none.
 * The one that started this is six cryofluid mixers standing on five unloaders: the
 * unloaders touched no container, so they drew nothing, so every mixer starved, and the
 * report came back producing nothing and naming the mixer as its own bottleneck, at zero
 * per cent.
 *
 * What is assumed is availability, never quantity. An unloader still moves eleven items a
 * second and a wall of them still moves eleven each: it is the stock behind it that is
 * taken for granted, exactly as a player takes it for granted when they paste the thing
 * next to their core.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/bilan.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);
const coal = { content: 0, id: known.items["coal"].id };

/** A press that makes graphite out of coal, and a belt taking the graphite away. */
const presse = (amont) => [
  [2, 0, "graphite-press", 0],
  ...amont,
  [4, 0, "titanium-conveyor", 0],
  [5, 0, "titanium-conveyor", 0],
];

test("an unloader standing against nothing is standing against the base", async () => {
  // Nobody builds an unloader facing nothing. It was put against a core that stayed behind.
  const out = await analyse(paste(presse([[0, 0, "unloader", 0], [1, 0, "titanium-conveyor", 0]])));

  assert.ok(out.perMinute.graphite > 0,
    "a press fed by an unloader produced nothing at all");
});

test("what it draws is still the block's own rate, only the stock is assumed", async () => {
  /* The assumption is availability, not quantity. An unloader moves eleven items a second
     whatever is behind it, and a press eating one and a half coal a second is nowhere near
     that ceiling, so the press sets the pace and not the unloader. */
  const out = await analyse(paste(presse([[0, 0, "unloader", 0], [1, 0, "titanium-conveyor", 0]])));
  const unloader = out.detail.find((d) => d.name === "unloader");

  assert.ok(unloader.through.coal <= 11.001,
    `an unloader poured more than eleven a second: ${unloader.through.coal}`);
});

test("an unloader against a container still draws from the container", async () => {
  /* The rule that was already here, and it has to keep winning: a vault in the middle of a
     line is a buffer, and what comes out of it is what went into it, not what a base holds.
     Nothing arrives here, so nothing comes out. */
  const out = await analyse(paste([
    [2, 0, "graphite-press", 0],
    [0, 0, "container", 0], [1, 0, "unloader", 0],
    [4, 0, "titanium-conveyor", 0],
  ]));

  assert.deepEqual(out.perMinute, {},
    "an unloader on an empty container invented a supply out of the base");
});

test("a core the schematic carries is the base, present rather than implied", async () => {
  const out = await analyse(paste([
    [2, 0, "graphite-press", 0],
    [0, 0, "core-shard", 0],
    [4, 0, "titanium-conveyor", 0],
  ]));

  assert.ok(out.perMinute.graphite > 0, "a press beside a core produced nothing");
});

test("the base hands over raw materials, never what the plan makes itself", async () => {
  /* A press turning coal into graphite in front of something eating that graphite is short
     of coal and not of graphite. Handing it graphite out of the core would report a
     production the schematic does not perform, which is the failure this whole engine
     exists to avoid. */
  const out = await analyse(paste([
    [2, 0, "graphite-press", 0],
    [0, 0, "unloader", 0], [1, 0, "titanium-conveyor", 0],
    [4, 0, "titanium-conveyor", 0], [5, 0, "titanium-conveyor", 0],
  ]));

  const belt = out.detail.filter((d) => d.name === "titanium-conveyor" && d.x >= 4);
  for (const tile of belt) {
    assert.ok(!(tile.through.coal > 0.001),
      `coal came out of the far end of the belt at (${tile.x},${tile.y})`);
  }
});

test("no liquid ever comes out of the base, because no core holds one", async () => {
  /* Water comes from a pump, and which pump is exactly the question no tool can answer for
     a schematic's author. So it stays asked. */
  const out = await analyse(paste([
    [2, 0, "cryofluid-mixer", 0],
    [0, 0, "unloader", 0], [1, 0, "titanium-conveyor", 0],
  ]));

  assert.deepEqual(out.perMinute, {},
    "a mixer was handed water out of a core, which holds none");
  assert.ok((out.needs || []).some((n) => n.resource === "water"),
    "it stopped asking where the water comes from");
});

test("a sandbox tap still beats the base, because it states its own rate", async () => {
  // An item source is not a core: it pours what it was set to, at its own declared rate,
  // and that figure is in the schematic rather than assumed around it.
  const out = await analyse(paste(presse([[1, 0, "item-source", 0, coal]])));

  assert.ok(out.perMinute.graphite > 0, "a press on a sandbox tap made nothing");
});

test("a plan carrying its own generator is not topped up from the base", async () => {
  /* The other half of the same rule, and the one that keeps a defect visible. A plan that
     brought a generator was meant to run on it, so one of its own machines left off that
     grid is a wire its author forgot. Covering it out of an imagined base would hide the
     one thing here worth reporting. */
  const out = await analyse(paste([
    [0, 0, "silicon-smelter", 0], [-1, 0, "item-source", 0, coal],
    [0, 4, "silicon-smelter", 0], [-1, 4, "item-source", 0, coal],
    [2, 0, "combustion-generator", 0], [2, 1, "item-source", 0, coal],
  ]));

  close(out.power.made, 60, "the generator it carries is what it has");
  assert.ok(out.bottleneck, "the smelter on the dead grid was quietly plugged in");
});
