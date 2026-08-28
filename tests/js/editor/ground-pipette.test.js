/**
 * Which layer a ground pipette takes off a stacked tile.
 *
 * `EditorTool.pick` in `mindustry.editor` (v159.7) reads a tile's wall first, then its ore
 * overlay, then its floor, falling through only when the layer above is absent:
 *
 *     editor.drawBlock = tile.block() == Blocks.air || !tile.block().inEditor
 *       ? (tile.overlay() == Blocks.air ? tile.floor() : tile.overlay())
 *       : tile.block();
 *
 * https://github.com/Anuken/Mindustry/blob/v159.7/core/src/mindustry/editor/EditorTool.java
 *
 * `pipetteLayerOf` is that same order, read off this repository's own stacked ground shape
 * (`{ floor, overlay, wall }`) rather than off a `Tile`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { pipetteLayerOf } from "../../../site/public/forge/editor/ui.js";

test("a wall wins over an ore and a floor underneath it", () => {
  const picked = pipetteLayerOf({ floor: "stone", overlay: "ore-copper", wall: "stone-wall" });
  assert.deepEqual(picked, { layer: "wall", block: "stone-wall" });
});

test("an ore wins over the floor underneath it, when there is no wall", () => {
  const picked = pipetteLayerOf({ floor: "stone", overlay: "ore-copper" });
  assert.deepEqual(picked, { layer: "overlay", block: "ore-copper" });
});

test("the floor is what is left when nothing is stacked over it", () => {
  const picked = pipetteLayerOf({ floor: "stone" });
  assert.deepEqual(picked, { layer: "floor", block: "stone" });
});

test("an undescribed tile has nothing to pick", () => {
  assert.equal(pipetteLayerOf(null), null);
  assert.equal(pipetteLayerOf(undefined), null);
  assert.equal(pipetteLayerOf({}), null);
});

test("a wall alone, over an undescribed floor, is still what is picked", () => {
  const picked = pipetteLayerOf({ wall: "stone-wall" });
  assert.deepEqual(picked, { layer: "wall", block: "stone-wall" });
});
