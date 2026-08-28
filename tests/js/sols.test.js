/**
 * The floor data that decides how the ground looks, and the promise that it is not in the
 * file that decides what the analyser answers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(
  readFileSync(new URL(`../../site/public/forge/${name}`, import.meta.url), "utf8"));

const sols = read("sols.json");
const catalogue = read("blocks.json");

test("every floor in the catalogue has an entry", () => {
  const floors = Object.entries(catalogue.blocks)
    .filter(([, block]) => block.floor).map(([name]) => name);
  for (const name of floors) {
    assert.ok(sols.floors[name], `${name} is missing from sols.json`);
  }
});

test("blending data stays out of the hashed catalogue", () => {
  /* `EngineVersion` hashes blocks.json. A blend id in there would mark fifteen thousand
     stored analyses stale for the sake of a boundary between two patches of grass. This is
     the check that stops that from happening by accident, since the rule alone is an
     intention. */
  for (const block of Object.values(catalogue.blocks)) {
    const forbiddenFields = ["blend_id", "draw_edge_in", "draw_edge_out", "blend_group",
                             "cache_layer"];
    for (const forbidden of forbiddenFields) {
      assert.ok(!(forbidden in block), `${forbidden} leaked into blocks.json`);
    }
  }
});

test("a floor that names an edge sheet has that sheet in the atlas", () => {
  const atlas = read("atlas.json");
  for (const [name, floor] of Object.entries(sols.floors)) {
    if (!floor.sheet) continue;
    assert.ok(atlas.sprites[`floor/${floor.sheet}#edge`],
      `${name} blends with ${floor.sheet}, which is not packed`);
  }
});

test("a vent blends with its group's sheet rather than with nothing", () => {
  /* Every crater and every vent carries a blend_group and ships no sheet of its own, so
     reading `<name>-edge` records nothing for all fourteen and they stop blending.
     `Floor.edges()` is `blendGroup.asFloor().edges`, which is what this checks. */
  for (const [name, group] of [["crater-stone", "stone"], ["basalt-vent", "basalt"],
                               ["carbon-vent", "carbon-stone"]]) {
    assert.equal(sols.floors[name]?.sheet, group, `${name} should blend with ${group}`);
  }
});

test("a floor that says it has variants has them in the atlas", () => {
  const atlas = read("atlas.json");
  for (const [name, floor] of Object.entries(sols.floors)) {
    for (let n = 1; n <= floor.variants; n++) {
      assert.ok(atlas.sprites[`floor/${name}#${n}`], `no variant ${n} packed for ${name}`);
    }
  }
});
