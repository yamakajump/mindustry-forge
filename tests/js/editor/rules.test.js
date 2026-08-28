/**
 * What the game accepts placing, and what it refuses.
 *
 * The rules come from `Build.validPlace`, `Block.canReplace`, `Drill.canMine` and
 * `Pump.canPlaceOn` in v159.7. The one that governs the others is not from the game: a
 * tile with no painted ground has no rule at all. An editor that refused a drill on a
 * blank canvas on the grounds that it sees no ore there would be an editor where nothing
 * can be built.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createBoard } from "../../../site/public/forge/editor/state.js";
import { canPlace } from "../../../site/public/forge/editor/rules.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });
const put = (plateau, plan) => canPlace(plateau, { rotation: 0, ...plan }, known);

/** The four tiles of a size-two block, painted with the same ground. */
const carre = (layers) => ({
  "0,0": { ...layers }, "1,0": { ...layers },
  "0,1": { ...layers }, "1,1": { ...layers },
});

test("with no painted ground, everything can be placed", () => {
  const plateau = board();
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);
  assert.equal(put(plateau, { x: 9, y: 9, block: "mechanical-pump" }).ok, true);
});

test("a refusal always carries a readable reason", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  const refus = put(plateau, { x: 0, y: 0, block: "graphite-press" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /\S/);
});

test("a conveyor replaces a conveyor", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "titanium-conveyor" }).ok, true);
});

test("a press does not replace a conveyor", () => {
  // Different groups: the press is in `none`, the belt in `transportation`.
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "graphite-press" }).ok, false);
});

test("a core is replaced by nothing, it is marked irreplaceable", () => {
  const plateau = board([{ x: 0, y: 0, block: "core-shard", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "core-foundation" }).ok, false);
});

test("past 64 tiles, the game no longer follows, and the reason says so", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  const refus = put(plateau, { x: 64, y: 0, block: "conveyor" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /64/);
});

test("as soon as a frame exists, 64 refuses nothing anymore: placement is free", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  assert.equal(put(plateau, { x: 64, y: 0, block: "conveyor" }).ok, true);
});

test("but the board itself stays bounded, at 256, and the reason says so", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  const refus = put(plateau, { x: 256, y: 0, block: "conveyor" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /256/);
});

test("nothing is built on a wall", () => {
  const plateau = board([], { "0,0": { floor: "stone", wall: "stone-wall" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor" }).ok, false);
});

test("a deep liquid only carries what floats", () => {
  const plateau = board([], carre({ floor: "deep-water" }));
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor" }).ok, false);
  // The thermal generator is the only `floating` block in the game.
  assert.equal(put(plateau, { x: 0, y: 0, block: "thermal-generator" }).ok, true);
});

test("a shallow liquid carries everyone", () => {
  const plateau = board([], carre({ floor: "sand-water" }));
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor" }).ok, true);
});

test("a drill wants ore under it", () => {
  const nu = board([], carre({ floor: "stone" }));
  assert.equal(put(nu, { x: 0, y: 0, block: "mechanical-drill" }).ok, false);

  const avec = board([], { ...carre({ floor: "stone" }),
                           "0,0": { floor: "stone", overlay: "ore-copper" } });
  assert.equal(put(avec, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);
});

test("a mechanical drill does not dig titanium, its hardness is beyond it", () => {
  const titane = board([], { ...carre({ floor: "stone" }),
                             "0,0": { floor: "stone", overlay: "ore-titanium" } });
  // Mechanical drill's tier 2 against titanium's hardness 3.
  assert.equal(put(titane, { x: 0, y: 0, block: "mechanical-drill" }).ok, false);
  assert.equal(put(titane, { x: 0, y: 0, block: "pneumatic-drill" }).ok, true);
});

test("a drill on an undescribed tile is still accepted", () => {
  // Only one of the four tiles is described, and it is bare. The ground under the other
  // three is unknown, so nothing lets us say the drill would dig nothing.
  const plateau = board([], { "0,0": { floor: "stone" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);
});

test("a pump wants liquid under every one of its tiles", () => {
  const moitie = board([], { "0,0": { floor: "sand-water" }, "1,0": { floor: "stone" } });
  // The mechanical pump is one tile and lands on the liquid.
  assert.equal(put(moitie, { x: 0, y: 0, block: "mechanical-pump" }).ok, true);
  // The rotary pump is two tiles and spills onto the stone.
  assert.equal(put(moitie, { x: 0, y: 0, block: "rotary-pump" }).ok, false);
});

test("a pump entirely on dry ground is refused, and says so as a pump", () => {
  /* Checks that it really is the pump's own rule speaking, not the ground's: on bare
     stone, nothing forbids building, only the pump has a reason to refuse. */
  const sec = board([], carre({ floor: "stone" }));
  const refus = put(sec, { x: 0, y: 0, block: "rotary-pump" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /liquide/i);
});

test("two different liquids under a pump go through the deep-water rule", () => {
  /* Measured against the catalogue: the game's five shallow liquid floors all yield
     water, and every other liquid is deep. A pump straddling two different liquids
     therefore necessarily straddles a deep one, and it is that rule that refuses it
     first. The test says what actually happens, not what we assumed. */
  const melange = board([], {
    "0,0": { floor: "sand-water" }, "1,0": { floor: "tar" },
    "0,1": { floor: "sand-water" }, "1,1": { floor: "sand-water" },
  });
  const refus = put(melange, { x: 0, y: 0, block: "rotary-pump" });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /flotte/);
});

test("painting a stone tile next door does not doom the drill", () => {
  /* A drill wants at least one ore tile. As long as a tile of its footprint is
     undescribed, it could carry ore, and nothing allows a refusal. The pump's rule is the
     opposite and gets settled at the first dry tile: that is the difference between
     "there exists" and "for all", and confusing the two gave an editor that punished the
     player the moment they started painting. */
  const partiel = board([], { "0,0": { floor: "stone" }, "1,0": { floor: "stone" } });
  assert.equal(put(partiel, { x: 0, y: 0, block: "mechanical-drill" }).ok, true);

  const complet = board([], carre({ floor: "stone" }));
  assert.equal(put(complet, { x: 0, y: 0, block: "mechanical-drill" }).ok, false);
});
