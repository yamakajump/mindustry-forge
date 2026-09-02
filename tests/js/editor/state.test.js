/**
 * The board: what is placed, what is painted, and what can be undone.
 *
 * The limit of 64 comes from `Vars.maxSchematicSize` in v159.7. It bears on the bounding
 * box, edges of large blocks included, and not on the number of blocks: a thousand-tile
 * conveyor line coiled up on itself is accepted, two blocks sixty-five tiles apart are
 * not.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, createBoard, currentFrameOf, exportUnit, legalFrame, MAX_SIZE }
  from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });

test("the limit is the game's own", () => {
  assert.equal(MAX_SIZE, 64);
});

test("the box is measured off what the blocks cover", () => {
  // A mechanical drill is two tiles to a side and is placed by its center, so placed at
  // (5, 5) it covers up to (6, 6).
  const plateau = board([{ x: 5, y: 5, block: "mechanical-drill", rotation: 0 }]);
  assert.deepEqual(plateau.box(), { left: 5, bottom: 5, width: 2, height: 2 });
});

test("an empty board has an empty box rather than infinities", () => {
  assert.deepEqual(board().box(), { left: 0, bottom: 0, width: 0, height: 0 });
});

test("a block that would spill past 64 does not fit", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(plateau.fits({ x: 63, y: 0, block: "conveyor", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 64, y: 0, block: "conveyor", rotation: 0 }), false);
});

test("a large block counts by what it covers, not by its center", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  // The drill placed at (62, 0) covers (62, 0) to (63, 1): the box is 64 wide.
  assert.equal(plateau.fits({ x: 62, y: 0, block: "mechanical-drill", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 63, y: 0, block: "mechanical-drill", rotation: 0 }), false);
});

test("an empty board accepts any first block", () => {
  assert.equal(board().fits({ x: 900, y: -400, block: "conveyor", rotation: 0 }), true);
});

test("whatever covers a tile is found back through that tile", () => {
  const plateau = board([{ x: 5, y: 5, block: "mechanical-drill", rotation: 0 }]);
  assert.equal(plateau.at(6, 6)?.block, "mechanical-drill");
  assert.equal(plateau.at(7, 7), null);
});

test("a move undoes in one step, even if it placed thirty blocks", () => {
  const plateau = board();
  const ligne = Array.from({ length: 30 },
    (_, i) => ({ x: i, y: 0, block: "conveyor", rotation: 0 }));
  plateau.apply({ place: ligne });
  assert.equal(plateau.tiles.length, 30);
  assert.equal(plateau.undo(), true);
  assert.equal(plateau.tiles.length, 0);
  assert.equal(plateau.redo(), true);
  assert.equal(plateau.tiles.length, 30);
});

test("undoing with nothing to undo breaks nothing", () => {
  const plateau = board();
  assert.equal(plateau.undo(), false);
  assert.equal(plateau.redo(), false);
});

test("a new move drops what had been undone", () => {
  const plateau = board();
  plateau.apply({ place: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }] });
  plateau.undo();
  plateau.apply({ place: [{ x: 5, y: 5, block: "router", rotation: 0 }] });
  assert.equal(plateau.redo(), false);
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "router");
});

test("ground undoes like everything else", () => {
  const plateau = board();
  plateau.apply({ paint: { "3,4": { floor: "sand" } } });
  assert.equal(plateau.ground["3,4"].floor, "sand");
  plateau.undo();
  assert.equal(plateau.ground["3,4"], undefined);
});

test("repainting over ground undoes to the old ground, not to nothing", () => {
  const plateau = board([], { "3,4": { floor: "stone" } });
  plateau.apply({ paint: { "3,4": { floor: "sand" } } });
  assert.equal(plateau.ground["3,4"].floor, "sand");
  plateau.undo();
  assert.equal(plateau.ground["3,4"].floor, "stone");
});

test("ore is placed on top of the ground instead of replacing it", () => {
  const plateau = board([], { "0,0": { floor: "stone" } });
  plateau.apply({ paint: { "0,0": { overlay: "ore-copper" } } });
  assert.deepEqual(plateau.ground["0,0"], { floor: "stone", overlay: "ore-copper" });
});

test("erasing a tile removes it instead of emptying it", () => {
  const plateau = board([], { "0,0": { floor: "stone" } });
  plateau.apply({ paint: { "0,0": null } });
  assert.equal(plateau.ground["0,0"], undefined);
  plateau.undo();
  assert.deepEqual(plateau.ground["0,0"], { floor: "stone" });
});

test("placing on an occupied tile replaces instead of stacking", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "titanium-conveyor", rotation: 1 }] });
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "titanium-conveyor");
  assert.equal(plateau.tiles[0].rotation, 1);
});

test("a large block clears everything it covers, not just its center", () => {
  const plateau = board([
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 5, y: 5, block: "conveyor", rotation: 0 },
  ]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "mechanical-drill", rotation: 0 }] });
  assert.equal(plateau.tiles.length, 2);
  assert.equal(plateau.at(5, 5)?.block, "conveyor");
});

test("undoing a placement that covered something brings back what was underneath", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "mechanical-drill", rotation: 0 }] });
  assert.equal(plateau.tiles.length, 1);
  plateau.undo();
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "conveyor");
});

test("removing a block also undoes", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 2 }]);
  plateau.apply({ remove: [plateau.at(0, 0)] });
  assert.equal(plateau.tiles.length, 0);
  plateau.undo();
  assert.equal(plateau.tiles[0].rotation, 2);
});

test("an empty move does not fill up the history", () => {
  const plateau = board();
  assert.equal(plateau.apply({ place: [] }), false);
  assert.equal(plateau.undo(), false);
});

test("a whole batch is judged together, not block by block", () => {
  /* A hundred conveyors on an empty board: each is one tile wide and so fits alone within
     64 on its own. It is together that they overflow, and it is together that they must
     be judged, otherwise a long enough drag produces a schematic the game refuses. */
  const plateau = board();
  const ligne = Array.from({ length: 100 },
    (_, i) => ({ x: i, y: 0, block: "conveyor", rotation: 0 }));
  assert.equal(plateau.fits(ligne[99]), true, "a single block always fits");
  assert.equal(plateau.fits(ligne), false, "the whole line should overflow");
  assert.equal(plateau.fits(ligne.slice(0, 64)), true);
  assert.equal(plateau.fits(ligne.slice(0, 65)), false);
});

/* --------------------------------------------------------------------------------------
   Frames.

   A frame is a named rectangle, drawn by hand, at most 64 by 64: this is
   `Vars.maxSchematicSize`, a hard refusal and not a warning. With no frame at all, the
   whole board stands in for it, capped at 64 exactly as before: this is the rule that
   protects the simple case, and the tests above already cover it.

   As soon as a frame exists, placing a block is no longer bounded by 64: the board itself
   becomes the bounded unit, at 256, to let several sites sit side by side. The 64 moves
   onto the frame, not onto the placement.
   -------------------------------------------------------------------------------------- */

test("the board is fixed at 256, it does not grow", () => {
  assert.equal(BOARD_SIZE, 256);
});

test("a frame fits within 64 by 64, never more: hard refusal, not a warning", () => {
  assert.equal(legalFrame({ width: 64, height: 64 }), true);
  assert.equal(legalFrame({ width: 65, height: 64 }), false);
  assert.equal(legalFrame({ width: 64, height: 65 }), false);
  assert.equal(legalFrame({ width: 1, height: 1 }), true);
});

test("a zero or negative frame is not legal", () => {
  assert.equal(legalFrame({ width: 0, height: 5 }), false);
  assert.equal(legalFrame({ width: -1, height: 5 }), false);
});

test("as soon as frames exist, the placement cap covers the whole board, at 256", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  assert.equal(plateau.fits({ x: 64, y: 0, block: "conveyor", rotation: 0 }), true,
    "a frame allows going past 64, as long as the board fits within 256");
  assert.equal(plateau.fits({ x: 255, y: 0, block: "conveyor", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 256, y: 0, block: "conveyor", rotation: 0 }), false);
});

test("drawing a frame undoes like everything else", () => {
  const plateau = board();
  const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };
  plateau.apply({ addFrames: [cadre] });
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.undo(), true);
  assert.equal(plateau.frames.length, 0);
  assert.equal(plateau.redo(), true);
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.frames[0].name, "fonderie");
});

test("renaming, moving or resizing a frame goes through removing then re-adding", () => {
  const plateau = board();
  const cadre = { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 };
  plateau.apply({ addFrames: [cadre] });
  const renomme = { ...plateau.frames[0], name: "assemblage" };
  plateau.apply({ removeFrames: [plateau.frames[0]], addFrames: [renomme] });
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.frames[0].name, "assemblage");
  plateau.undo();
  assert.equal(plateau.frames[0].name, "fonderie");
});

test("deleting a frame leaves its blocks in place", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 5, height: 5 }],
  });
  plateau.apply({ removeFrames: [plateau.frames[0]] });
  assert.equal(plateau.frames.length, 0);
  assert.equal(plateau.tiles.length, 1);
});

test("a point falls into the frame that covers it, bounded like a normal box", () => {
  const plateau = board();
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  assert.equal(plateau.frameAt(5, 5)?.id, "a");
  assert.equal(plateau.frameAt(10, 5), null, "the top edge is excluded, like a normal box");
  assert.equal(plateau.frameAt(-1, 5), null);
});

test("a block entirely inside the frame belongs to it", () => {
  const plateau = board([{ x: 5, y: 5, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  const [cadre] = plateau.frames;
  assert.deepEqual(plateau.tilesIn(cadre).map((t) => t.block), ["conveyor"]);
  assert.deepEqual(plateau.orphans(), []);
});

test("a block that spills out of the frame by a single tile does not belong to it", () => {
  // A mechanical drill placed at (9, 9) covers (9, 9) to (10, 10): it spills one tile past
  // a 10 by 10 frame placed at (0, 0). A frame only proves what fits entirely inside it.
  const plateau = board([{ x: 9, y: 9, block: "mechanical-drill", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 }],
  });
  const [cadre] = plateau.frames;
  assert.deepEqual(plateau.tilesIn(cadre), []);
  assert.equal(plateau.orphans().length, 1);
});

test("with no frame at all, nothing is orphaned: the whole board stands in for it", () => {
  const plateau = board([{ x: 900, y: -400, block: "conveyor", rotation: 0 }]);
  assert.deepEqual(plateau.orphans(), []);
});

test("a frame's used size is the box of what it holds, not its drawn size", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 20, height: 20 }],
  });
  assert.deepEqual(plateau.frameBox(plateau.frames[0]), { left: 1, bottom: 1, width: 1, height: 1 });
});

test("an empty frame has an empty used box", () => {
  const plateau = board();
  plateau.apply({
    addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 20, height: 20 }],
  });
  assert.deepEqual(plateau.frameBox(plateau.frames[0]), { left: 0, bottom: 0, width: 0, height: 0 });
});

test("a board rebuilt with no frames key starts with an empty list", () => {
  // The case of a draft from yesterday, which has never heard of frames.
  const plateau = createBoard({ tiles: [], ground: {}, sizeOf });
  assert.deepEqual(plateau.frames, []);
});

test("the box of all frames is used to frame the whole site in one go", () => {
  const plateau = board();
  plateau.apply({
    addFrames: [
      { id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 10 },
      { id: "b", name: "assemblage", left: 40, bottom: -5, width: 8, height: 8 },
    ],
  });
  assert.deepEqual(plateau.framesBox(), { left: 0, bottom: -5, width: 48, height: 15 });
});

test("with no frame at all, the frames box is empty rather than infinite", () => {
  assert.deepEqual(board().framesBox(), { left: 0, bottom: 0, width: 0, height: 0 });
});

/* ----------------------------------------------------------------------------------------
   The snapshot: what a draft or a workspace actually saves.

   A local draft and a workspace both save the same shape, and it is this snapshot that
   fixes it once and for all: a frame missing here would be a frame lost everywhere this
   shape is used.
   ---------------------------------------------------------------------------------------- */

test("the snapshot carries the tiles, the ground and the frames together", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }], { "0,0": { floor: "stone" } });
  plateau.apply({ addFrames: [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 }] });

  const photo = plateau.snapshot();
  assert.equal(photo.tiles.length, 1);
  assert.deepEqual(photo.ground, { "0,0": { floor: "stone" } });
  assert.deepEqual(photo.frames, [{ id: "a", name: "fonderie", left: 0, bottom: 0, width: 10, height: 8 }]);
});

test("the snapshot does not keep computed fields like link", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  // What `relink()` in mount.js writes onto a tile every frame, never saved.
  plateau.tiles[0].link = [1, 1];

  const photo = plateau.snapshot();
  assert.deepEqual(photo.tiles[0], { x: 0, y: 0, block: "conveyor", rotation: 0, config: undefined });
});

test("the snapshot of an empty board has neither tile nor frame", () => {
  assert.deepEqual(board().snapshot(), { tiles: [], ground: {}, frames: [] });
});

test("loading a snapshot replaces the board, and clears the history", () => {
  const plateau = board([{ x: 5, y: 5, block: "conveyor", rotation: 0 }]);
  plateau.apply({ place: [{ x: 6, y: 6, block: "conveyor", rotation: 0 }] });
  assert.equal(plateau.done.length, 1);

  plateau.load({
    tiles: [{ x: 1, y: 1, block: "wall", rotation: 0 }],
    ground: { "2,2": { floor: "sand" } },
    frames: [{ id: "b", name: "assemblage", left: 0, bottom: 0, width: 5, height: 5 }],
  });

  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "wall");
  assert.deepEqual(plateau.ground, { "2,2": { floor: "sand" } });
  assert.equal(plateau.frames.length, 1);
  assert.equal(plateau.done.length, 0);
  assert.equal(plateau.undone.length, 0);
});

test("loading a snapshot with no frame or ground starts with empty lists, not gaps", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.load({ tiles: [] });
  assert.deepEqual(plateau.tiles, []);
  assert.deepEqual(plateau.ground, {});
  assert.deepEqual(plateau.frames, []);
});

test("erasing one layer leaves the others where they were", () => {
  const plateau = board([], { "0,0": { floor: "sand", overlay: "ore-copper" } });

  /* The eraser used to say nothing narrower than "this tile goes", so rubbing out an ore
     took the floor painted under it, and correcting one mistake made another. */
  plateau.apply({ paint: { "0,0": { overlay: null } } });
  assert.deepEqual(plateau.ground["0,0"], { floor: "sand" });

  plateau.undo();
  assert.deepEqual(plateau.ground["0,0"], { floor: "sand", overlay: "ore-copper" });
});

test("a cell erased layer by layer ends up gone, not empty", () => {
  const plateau = board([], { "0,0": { wall: "stone-wall" } });

  // Indistinguishable from a tile nobody ever painted: everything downstream walks the
  // painted cells, and one holding an empty object would be walked for nothing.
  plateau.apply({ paint: { "0,0": { wall: null } } });
  assert.equal(plateau.ground["0,0"], undefined);
});

/* ------------------------------------------------------------------------------------
   What a copy or a download hands over.

   The editor gained a button that copies the plan without selecting it first, and the
   question that button had to answer is the one the gauge and the analysis already
   answered separately: with frames, one frame; without, the board. Written down once here
   rather than three times in `mount.js`, which no test can reach.
   ------------------------------------------------------------------------------------ */

const FRAME = { id: "a", name: "usine", left: 0, bottom: 0, width: 8, height: 8 };
const AILLEURS = { id: "b", name: "coin", left: 20, bottom: 20, width: 8, height: 8 };

test("with no frame at all, the plan is the whole board", () => {
  const plateau = board([{ x: 1, y: 1, block: "conveyor", rotation: 0 }]);
  const unit = exportUnit(plateau);

  assert.equal(unit.frame, null);
  assert.equal(unit.tiles.length, 1);
  assert.equal(unit.name, "plan", "a name the file can carry, since no frame names it");
});

test("with frames, the plan is one frame and never the workbench", () => {
  const plateau = createBoard({
    tiles: [{ x: 1, y: 1, block: "conveyor", rotation: 0 },
      { x: 21, y: 21, block: "conveyor", rotation: 0 }],
    ground: {}, frames: [FRAME, AILLEURS], sizeOf,
  });

  const unit = exportUnit(plateau, "a");
  assert.equal(unit.name, "usine");
  assert.deepEqual(unit.tiles.map((tile) => tile.x), [1],
    "the block in the other frame is not this plan's, and the export refuses it too");
});

test("no active frame falls back to the last drawn, not to nothing", () => {
  const plateau = createBoard({
    tiles: [], ground: {}, frames: [FRAME, AILLEURS], sizeOf,
  });

  assert.equal(currentFrameOf(plateau, null).id, "b");
  assert.equal(exportUnit(plateau, null).name, "coin");
  // An id that no longer names a frame is the same case: it was deleted, not chosen.
  assert.equal(exportUnit(plateau, "parti").name, "coin");
});
