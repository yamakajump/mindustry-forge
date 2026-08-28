/**
 * Analysing one frame of a board that holds several.
 *
 * The analysis has only ever been handed a whole board, so analysing a frame hands it a
 * board made of that frame alone. The page then sets the board it was handed aside, and
 * picks that one back up the next time somebody edits. Hand it the frame-only board and
 * the shelf holds a board nobody ever built: every other frame, and every block outside
 * the analysed one, missing from it. Not hidden, absent, and saved over on the next
 * gesture.
 *
 * What is checked here is that round trip rather than the analysis: which board goes on
 * the shelf, and what is still in it when it comes back.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createBoard, frameBoard, workbenchOf }
  from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;

const fonderie = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 8, height: 8 };
const assemblage = { id: "b", name: "assemblage", left: 20, bottom: 0, width: 8, height: 8 };

/** Two frames with blocks in each: a workbench, which is what this bug is about losing. */
function workbench() {
  const plateau = createBoard({ tiles: [], ground: {}, frames: [], sizeOf });
  plateau.apply({ addFrames: [fonderie, assemblage] });
  plateau.apply({ place: [{ x: 1, y: 1, block: "conveyor" }, { x: 2, y: 1, block: "conveyor" }] });
  plateau.apply({ place: [{ x: 21, y: 1, block: "titanium-conveyor" }] });
  return plateau;
}

test("a frame is analysed on its own blocks, and on nobody else's", () => {
  const plateau = workbench();
  const scoped = frameBoard({ board: plateau, frame: plateau.frames[0], sizeOf });
  assert.deepEqual(scoped.tiles.map((tile) => [tile.x, tile.y]), [[1, 1], [2, 1]]);
  assert.deepEqual(scoped.frames.map((frame) => frame.name), ["fonderie"]);
});

test("the board set aside on the way back is the workbench, not the analysed frame", () => {
  const plateau = workbench();
  const scoped = frameBoard({ board: plateau, frame: plateau.frames[0], sizeOf });

  // What `leaveEditor` puts on the shelf, and what the next `enterEditor` picks up.
  const kept = workbenchOf(scoped);

  assert.deepEqual(kept.frames.map((frame) => frame.name), ["fonderie", "assemblage"]);
  assert.equal(kept.tiles.length, 3);
  assert.equal(kept === plateau, true, "the shelf holds the board itself, not a copy of it");
});

test("a whole-board analysis sets aside the very board it analysed", () => {
  const plateau = workbench();
  assert.equal(workbenchOf(plateau), plateau);
});

test("the workbench comes back with its history, ctrl+Z included", () => {
  const plateau = workbench();
  const kept = workbenchOf(frameBoard({ board: plateau, frame: plateau.frames[1], sizeOf }));
  assert.equal(kept.undo(), true);
  // The last gesture undone, and only it: the two blocks of the other frame stay put.
  assert.equal(kept.tiles.length, 2);
});

test("the frame's board is a view: what happens to it never reaches the workbench", () => {
  const plateau = workbench();
  const scoped = frameBoard({ board: plateau, frame: plateau.frames[0], sizeOf });
  scoped.apply({ remove: [...scoped.tiles] });
  scoped.apply({ paint: { "0,0": { floor: "sand-floor" } } });
  assert.equal(scoped.tiles.length, 0);
  assert.equal(plateau.tiles.length, 3);
  assert.deepEqual(plateau.ground, {});
});
