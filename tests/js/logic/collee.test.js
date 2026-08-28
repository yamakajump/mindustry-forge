/**
 * The schematic we produce, read back by the real game.
 *
 * A processor program crosses three nested formats and all three are written here. A round
 * trip from one end to the other therefore proves nothing: it shows this repository agrees
 * with itself, which stays true on the day it is wrong.
 *
 * `bench/data/logique-collee.json` is what Mindustry actually read in the schematic built by
 * `tools/js/logique-collee.mjs`, through `Schematics.readBase64`, the same function the
 * game's paste key calls. `tools/build_logic_paste.py` re-takes it when the trial program
 * changes. This test rebuilds the same schematic and demands that our reader find in it
 * exactly what the game found.
 *
 * `matches_game_writer` is the field that earned its keep: it compares our bytes to those of
 * `LogicBlock.compress`, and it read false, because the version byte of a processor
 * configuration is 1 and we were writing 0. Both sides read it back fine, and nothing said
 * a word.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BLOCK, build, catalogue } from "../../../tools/js/logique-collee.mjs";
import { fromSchematic } from "../../../site/public/forge/logic/program.js";

catalogue();

const seen = JSON.parse(readFileSync(
  new URL("../../../bench/data/logique-collee.json", import.meta.url), "utf8"));

test("the game correctly read the schematic we build", () => {
  assert.ok(!seen.refused, `the game refused it: ${seen.refused}`);
  assert.equal(seen.processors.length, 1);
  assert.ok(seen.processors[0].matches_game_writer,
    "our bytes are no longer those LogicBlock.compress writes");
});

test("we read back what the game read back", async () => {
  const pasted = await build().toSchematic({ block: BLOCK, name: "epreuve" });
  const ours = await fromSchematic(pasted);

  assert.equal(ours.length, 1);
  assert.equal(ours[0].block, seen.processors[0].block);
  assert.equal(ours[0].x, seen.processors[0].x);
  assert.equal(ours[0].y, seen.processors[0].y);
  assert.equal(ours[0].code, seen.processors[0].code);
  assert.deepEqual(ours[0].links, seen.processors[0].links);
});

test("the trial program is the one the game saw", () => {
  assert.equal(build().text(), seen.processors[0].code,
    "the program changed without tools/build_logic_paste.py being rerun");
});
