/**
 * Where a ground family's picks actually land on the board.
 *
 * The grid splits the floor family in two for scanning (`floor`, `floor-liquid`, see
 * `ground-families.test.js`), but the board keeps one ground slot per stacked layer, three
 * of them, not four. Before this, a liquid floor painted through the grid was written under
 * a `floor-liquid` key nothing else in the repository reads: not `rules.js`'s deep-liquid
 * refusal, not its pump eligibility, not `ground.js`'s yield, not `render.js`'s draw. A
 * lake painted through the new grid did not render, could not be pumped, and never refused
 * a non-floating block standing on it, which is the bug the grid's own family split
 * introduced without anyone painting a tile to notice.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { storageLayerOf } from "../../../site/public/forge/editor/ui.js";

test("a liquid floor's family key still stores under the floor slot", () => {
  assert.equal(storageLayerOf("floor-liquid"), "floor");
});

test("a solid floor's family key is already the storage slot", () => {
  assert.equal(storageLayerOf("floor"), "floor");
});

test("overlay and wall need no translation, they are their own slot", () => {
  assert.equal(storageLayerOf("overlay"), "overlay");
  assert.equal(storageLayerOf("wall"), "wall");
});
