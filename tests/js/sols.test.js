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

test("the variant counts are the game's, not this repository's own arithmetic", () => {
  /* What this replaces compared `build_sols.py`'s enumeration against `build_sprites.py`'s.
     Both derive variants from one rule, so it checked a script against its twin and passed
     for any mistake the two shared. One was shared: `metal-tiles-1` claimed three variants
     that are in fact the base sprites of `metal-tiles-11`, `-12` and `-13`, three separate
     floors, and both scripts agreed about it all the way to the browser.

     These counts were read out of `assets-v159.7.jar`, under `sprites/blocks/environment/`,
     by asking how many of `<name>1`, `<name>2`, ... it ships. The jar is 35 megabytes, is
     gitignored and is not checked out in CI, so they are written down rather than counted
     here: a check that skips itself on the machine that matters checks nothing. */
  const measured = {
    // The ordinary case: three pictures of one ground, picked per tile.
    grass: 3, stone: 3, "sand-floor": 3, darksand: 3, basalt: 3, shale: 3,
    "spore-moss": 3, mud: 3,
    // A crater ships six, and a vent two. Both borrow `stone`'s edge sheet and neither
    // borrows its variant count, which is why they are here.
    "crater-stone": 6, "stone-vent": 2,
    // One sprite and no choice to make.
    "deep-water": 0, "molten-slag": 0, space: 0, empty: 0, "metal-tiles-11": 0,
    // Zero, and the reason this table exists rather than a comparison. Three sprites in the
    // jar match `metal-tiles-1<n>` and all three belong to other floors.
    "metal-tiles-1": 0,
  };
  for (const [name, count] of Object.entries(measured)) {
    assert.equal(sols.floors[name]?.variants, count,
      `${name} should have ${count} variants`);
  }
});

test("a floor that says it has variants has them in the atlas", () => {
  const atlas = read("atlas.json");
  for (const [name, floor] of Object.entries(sols.floors)) {
    for (let n = 1; n <= floor.variants; n++) {
      assert.ok(atlas.sprites[`floor/${name}#${n}`], `no variant ${n} packed for ${name}`);
    }
  }
  /* A floor with no variants is drawn from the bare key, so `metal-tiles-1` losing its three
     false ones is only a fix if there is something left to draw it with. */
  assert.ok(atlas.sprites["floor/metal-tiles-1"], "floor/metal-tiles-1 is not packed");
});

test("the blend ids came out of the game, and so did the order between them", () => {
  /* Nothing here pinned a single value the game produced. Spelling `entry.get("blend_id")`
     as `entry.get("blend")` in `build_sols.py` hands every floor a blend id of 0, no floor
     ever bleeds onto another, the feature quietly does nothing, and every other test in this
     repository still passes. These are v159.7's own numbers.

     The relations matter as much as the values, because what a blend id decides is which of
     two floors paints over the other. */
  const measured = { "deep-water": 21, stone: 33, "sand-floor": 39, grass: 71, shale: 76 };
  for (const [name, blend] of Object.entries(measured)) {
    assert.equal(sols.floors[name]?.blend, blend, `${name} should carry blend id ${blend}`);
  }
  assert.ok(sols.floors.grass.blend > sols.floors.stone.blend,
    "grass must bleed onto stone, not the other way round");
  assert.ok(sols.floors.stone.blend > sols.floors["deep-water"].blend,
    "stone's blend id must beat deep water's");
  // 93 distinct values across 107 floors, the repeats being the blend groups. A field gone
  // flat collapses this to one, which is the failure the numbers above cannot see on their
  // own if the whole dump changes shape.
  assert.ok(new Set(Object.values(sols.floors).map((f) => f.blend)).size > 50,
    "the blend ids have collapsed onto a handful of values");
});

test("the gates the game applies are recorded, and are not one answer repeated", () => {
  /* `in`, `out` and `layer` each decide whether a boundary is drawn at all, so each of them
     going uniformly true, or uniformly `normal`, silently turns a gate off. Pinned against
     v159.7 by naming a floor on both sides of each. */
  assert.equal(sols.floors["metal-tiles-1"].in, false, "metal-tiles-1 receives no edges");
  assert.equal(sols.floors.stone.in, true, "stone receives edges");
  // `space` is the pair that proves the two flags are separate questions: it refuses to
  // bleed outwards and still receives edges, so `in` cannot be read off `out`.
  assert.equal(sols.floors.space.out, false, "space bleeds onto nothing");
  assert.equal(sols.floors.space.in, true, "space still receives edges");
  assert.equal(sols.floors["deep-water"].layer, "water", "deep water is on the water layer");
  assert.equal(sols.floors["molten-slag"].layer, "slag", "molten slag is on the slag layer");
  assert.equal(sols.floors.stone.layer, "normal", "stone is on the default layer");

  const counts = (key, value) =>
    Object.values(sols.floors).filter((f) => f[key] === value).length;
  assert.equal(counts("in", false), 14, "14 floors receive no edges in v159.7");
  assert.equal(counts("out", false), 16, "16 floors bleed onto nothing in v159.7");
  assert.equal(counts("layer", "normal"), 94, "13 floors sit on a layer of their own");
});

test("the block ids are distinct, because the draw order is sorted on them", () => {
  /* `blendersAt` sorts blenders by block id, the way `Floor.drawBlended` does. Blend ids
     repeat across a blend group, which is exactly why the sort cannot use them: `stone`,
     `char`, `crater-stone` and `stone-vent` all carry blend id 33 and four different ids. */
  const ids = Object.values(sols.floors).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "two floors share a block id");
  for (const name of ["stone", "char", "crater-stone", "stone-vent"]) {
    assert.equal(sols.floors[name].blend, 33, `${name} is in stone's blend group`);
  }
  assert.deepEqual(
    ["stone", "char", "crater-stone", "stone-vent"]
      .sort((a, b) => sols.floors[a].id - sols.floors[b].id),
    ["stone", "crater-stone", "char", "stone-vent"],
    "the ids that break the blend group's tie are not v159.7's");
});

test("the eleven liquids carry the alpha the game draws them back at", () => {
  /* `Floor.drawBase`'s fourth statement redraws a liquid over its own overlay at
     `1 - overlayAlpha`. Both halves of that are pinned here, because both can be wrong on
     their own and neither shows up as an error.

     The set: `isLiquid` reaches the dump as `floor_liquid` and eleven floors set it. A gate
     read off something adjacent, `cache_layer` or `deep`, would name a different set: thirteen
     floors have a layer of their own, `space` and `mud` among them, and only six of the eleven
     are deep.

     The value: `Floor`'s constructor sets `overlayAlpha` to 0.65 and exactly one class in
     `server-release.jar` writes the field afterwards, `mindustry.content.Blocks$10`, which
     the content class builds as `new Blocks$10("pooled-cryofluid")` and which sets 0.35. So
     ten liquids come back at 0.35 and cryofluid at 0.65, and a single constant of 0.35 for
     all eleven, which is the obvious way to write this, draws cryofluid wrong. */
  const veiled = Object.fromEntries(Object.entries(sols.floors)
    .filter(([, floor]) => floor.veil).map(([name, floor]) => [name, floor.veil]));
  assert.deepEqual(veiled, {
    "deep-water": 0.35, "shallow-water": 0.35, "tainted-water": 0.35,
    "deep-tainted-water": 0.35, "darksand-tainted-water": 0.35, "sand-water": 0.35,
    "darksand-water": 0.35, tar: 0.35, "molten-slag": 0.35, "arkycite-floor": 0.35,
    "pooled-cryofluid": 0.65,
  });

  /* Ninety-six floors are drawn once, and a floor drawn twice when the game draws it once
     paints itself over its own ore for no reason a player can name. `null` rather than a
     missing key, so a floor that fell out of the build reads as a fault rather than as land. */
  for (const [name, floor] of Object.entries(sols.floors)) {
    if (veiled[name]) continue;
    assert.equal(floor.veil, null, `${name} is not a liquid and must not be veiled`);
  }
});
