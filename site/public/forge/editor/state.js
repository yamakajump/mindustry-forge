/**
 * What is placed, what is painted, and what can be undone.
 *
 * A gesture is one history entry, not one block. A line of thirty conveyors comes undone in
 * one go, because it was drawn in one go. The opposite forces somebody to hammer ctrl+Z
 * thirty times to repair a bad drag, which is not an undo but a punishment.
 *
 * An entry keeps **what changed**, not a photograph of the board: the blocks removed, the
 * blocks added, and the previous ground of the repainted tiles only. A full copy per gesture
 * on a board of four thousand blocks would cost a megabyte a click, for information of which
 * only the difference is ever used.
 *
 * The limit of 64 is `Vars.maxSchematicSize` in v159.7. It applies to the bounding box, the
 * walls of large blocks included, and not to the number of blocks.
 *
 * That limit used to sit on the whole board, because the whole board was the schematic.
 * Now that a board can hold several named frames, the 64 cap moves onto each frame: a
 * frame is a rectangle of at most 64 by 64, drawn by hand, and it is the frame's bounding
 * box that the game refuses past 64, not the board's. The board itself grows to 256, fixed
 * and not growable, so several 64-square work sites fit side by side with room between
 * them. As long as no frame exists, the board stays the schematic exactly as before, and
 * the 64 cap keeps applying to it directly: that is the case that must never see the word
 * "frame".
 */

export const MAX_SIZE = 64;
export const BOARD_SIZE = 256;

/**
 * Is this rectangle a frame the game would accept?
 *
 * A hard refusal, not a warning: `Vars.maxSchematicSize` does not negotiate. Anything drawn
 * past 64 in either direction is not a frame, it is two frames waiting to be told so.
 */
export function legalFrame(rect) {
  return Number.isInteger(rect.width) && Number.isInteger(rect.height)
    && rect.width >= 1 && rect.width <= MAX_SIZE
    && rect.height >= 1 && rect.height <= MAX_SIZE;
}

/**
 * Does `tile`'s whole footprint sit inside `frame`?
 *
 * Whole, not "any of it": a block that pokes one tile past the edge does not join the
 * frame it mostly sits in, it stays an orphan. A frame is a claim about what is inside it,
 * and a claim proved by three quarters of a block is not proved.
 */
export function frameHolds(frame, tile, sizeOf) {
  return footprint(tile, sizeOf).every(([x, y]) =>
    x >= frame.left && x < frame.left + frame.width
    && y >= frame.bottom && y < frame.bottom + frame.height);
}

/**
 * Every tile a block covers.
 *
 * Mindustry files a block by its centre and offsets by `-(size - 1) / 2`, truncated. A
 * two-wide drill filed at (5, 5) therefore covers (5, 5) to (6, 6), and not (4, 4) to
 * (5, 5). Measuring on the filed position rather than on the footprint is what pushes half
 * of a large block out of its own box.
 */
export function footprint(tile, sizeOf) {
  const size = sizeOf(tile.block) || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  const cells = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      cells.push([tile.x + offset + dx, tile.y + offset + dy]);
    }
  }
  return cells;
}

/** The bounding box of a list of blocks, measured on what they cover. */
export function boxOf(tiles, sizeOf) {
  if (!tiles.length) return { left: 0, bottom: 0, width: 0, height: 0 };
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const tile of tiles) {
    for (const [x, y] of footprint(tile, sizeOf)) {
      if (x < left) left = x;
      if (y < bottom) bottom = y;
      if (x > right) right = x;
      if (y > top) top = y;
    }
  }
  return { left, bottom, width: right - left + 1, height: top - bottom + 1 };
}

const key = (x, y) => `${x},${y}`;

export function createBoard({ tiles = [], ground = {}, frames = [], sizeOf }) {
  const board = {
    tiles: tiles.map((tile) => ({ rotation: 0, ...tile })),
    ground: { ...ground },
    /* Absent on a draft written before frames existed, and that absence is not a version
       to migrate: it is exactly the "no frame at all" case, which already means something
       on its own. Defaulting it to an empty list is the whole of the compatibility work. */
    frames: frames.map((frame) => ({ ...frame })),
    /* What has been done, and what has been undone and could be redone. */
    done: [],
    undone: [],
  };

  /** The tiles a block covers, as ground keys. */
  const cellsOf = (tile) => footprint(tile, sizeOf).map(([x, y]) => key(x, y));

  board.at = (x, y) => board.tiles.find(
    (tile) => cellsOf(tile).includes(key(x, y))) || null;

  board.box = () => boxOf(board.tiles, sizeOf);

  /** The frame covering a point, if any. Bounds work like `box`: the top and right edges
      are excluded, the same way a tile at x=64 is outside a box 64 wide starting at 0. */
  board.frameAt = (x, y) => board.frames.find((frame) =>
    x >= frame.left && x < frame.left + frame.width
    && y >= frame.bottom && y < frame.bottom + frame.height) || null;

  /** The blocks a frame can prove are its own: the ones it holds whole. */
  board.tilesIn = (frame) => board.tiles.filter((tile) => frameHolds(frame, tile, sizeOf));

  /** What a frame currently occupies, measured on its blocks rather than on its drawn
      rectangle: a frame drawn at 20 by 20 with one conveyor in the corner has a used size
      of 1 by 1, and that is the number the gauge and the export both care about. */
  board.frameBox = (frame) => boxOf(board.tilesIn(frame), sizeOf);

  /** The blocks that belong to no frame, and so will not export. Empty as long as no frame
      exists at all: the board is then the one implicit frame, and nothing sits outside it. */
  board.orphans = () => board.frames.length
    ? board.tiles.filter((tile) => !board.frames.some((frame) => frameHolds(frame, tile, sizeOf)))
    : [];

  /** The box holding every frame, for framing the whole workbench at a glance rather than
      whatever single frame happens to be active. */
  board.framesBox = () => {
    if (!board.frames.length) return { left: 0, bottom: 0, width: 0, height: 0 };
    let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
    for (const frame of board.frames) {
      left = Math.min(left, frame.left);
      bottom = Math.min(bottom, frame.bottom);
      right = Math.max(right, frame.left + frame.width - 1);
      top = Math.max(top, frame.bottom + frame.height - 1);
    }
    return { left, bottom, width: right - left + 1, height: top - bottom + 1 };
  };

  /**
   * A plain, JSON-safe copy of the board: tiles, ground and frames, and nothing that only
   * makes sense while the board is live.
   *
   * `link` is left out on purpose. `mount.js`'s `relink()` writes it onto a tile every
   * frame, recomputed from `config` against the block's own reach; it is a cache, not a
   * fact about the board, and saving it would let a stale coordinate outlive the bridge it
   * once pointed at. This is also, deliberately, the one shape both `draft.js`'s local
   * draft and a work space save: a save that quietly dropped `frames` here would drop
   * every frame a player drew, in both places at once, and never say so.
   */
  board.snapshot = () => ({
    tiles: board.tiles.map(({ x, y, block, rotation, config }) =>
      ({ x, y, block, rotation, config: config || undefined })),
    ground: { ...board.ground },
    frames: board.frames.map((frame) => ({ ...frame })),
  });

  /**
   * Replace the board's contents with a snapshot, in place.
   *
   * Used to open a different work space inside an editor that is already mounted, without
   * tearing the whole thing down and rebuilding it. The undo history does not travel with
   * it: `done`/`undone` describe how *this* board got to where it is, and a history
   * borrowed from a board that was somewhere else entirely would let ctrl+Z reach back into
   * a space nobody is looking at.
   */
  board.load = (snapshot) => {
    board.tiles = (snapshot.tiles || []).map((tile) => ({ rotation: 0, ...tile }));
    board.ground = { ...(snapshot.ground || {}) };
    board.frames = (snapshot.frames || []).map((frame) => ({ ...frame }));
    board.done = [];
    board.undone = [];
  };

  /**
   * Does placing this keep the board within its cap?
   *
   * Takes one block or a whole batch, and the batch is not the sum of the blocks: a drag of
   * a hundred conveyors on an empty board sees each of its blocks fit on its own, since each
   * measured alone is one tile wide. It is together that they overflow.
   *
   * The cap itself moves with whether a frame exists. No frame at all means the board is
   * the schematic, exactly as before this feature, capped at 64. Once a frame exists,
   * placement is free of the 64 cap (a frame carries that cap on its own, checked when it
   * is drawn, not when a block lands near it) and the board's own bound becomes 256, wide
   * enough to hold several 64-square frames with room between them.
   */
  board.fits = (plans) => {
    const batch = Array.isArray(plans) ? plans : [plans];
    const box = boxOf([...board.tiles, ...batch], sizeOf);
    const cap = board.frames.length ? BOARD_SIZE : MAX_SIZE;
    return box.width <= cap && box.height <= cap;
  };

  /**
   * Apply a gesture and push it onto the history.
   *
   * `change` is `{ place, remove, paint }`, each optional. A `paint` of `null` on a tile
   * erases it rather than leaving it empty: an empty tile and an absent tile draw the same
   * and do not read the same, and the ground rules only apply to described tiles.
   *
   * Returns `false` when the gesture changed nothing, in which case nothing is pushed: a
   * click that did nothing must not consume a ctrl+Z.
   *
   * `addFrames` and `removeFrames` are frames rather than tiles, but they ride the same
   * gesture and the same history: drawing, renaming, moving and deleting a frame are
   * gestures too, and a ctrl+Z that skips them is a ctrl+Z somebody stops trusting.
   * Renaming, moving and resizing all go through remove-then-add, exactly like replacing a
   * tile: there is no separate "edit a frame in place", so a frame's identity survives a
   * mutation only through its `id`, never through object identity.
   */
  board.apply = ({ place = [], remove = [], paint = null, addFrames = [], removeFrames = [] }) => {
    const plans = place.map((plan) => ({ rotation: 0, ...plan }));

    /* What a placement displaces: everything its footprint touches, and not only the block
       filed on the same tile. A two-wide drill dropped on four conveyors removes four;
       removing only one left three ghosts under it, invisible on screen and very much
       present in the exported file. */
    const covered = new Set(plans.flatMap(cellsOf));
    const chased = board.tiles.filter(
      (tile) => cellsOf(tile).some((cell) => covered.has(cell)));
    const removed = [...new Set([...remove, ...chased])];

    const before = {};
    if (paint) {
      for (const cell of Object.keys(paint)) before[cell] = board.ground[cell];
    }

    if (!plans.length && !removed.length && !paint && !addFrames.length && !removeFrames.length) {
      return false;
    }

    board.tiles = board.tiles.filter((tile) => !removed.includes(tile)).concat(plans);
    if (paint) applyPaint(board.ground, paint);
    board.frames = board.frames.filter((frame) => !removeFrames.includes(frame)).concat(addFrames);

    board.done.push({ removed, added: plans, before, paint, removedFrames: removeFrames, addedFrames: addFrames });
    board.undone.length = 0;
    return true;
  };

  board.undo = () => {
    const entry = board.done.pop();
    if (!entry) return false;
    board.tiles = board.tiles
      .filter((tile) => !entry.added.includes(tile))
      .concat(entry.removed);
    restore(board.ground, entry.before);
    board.frames = board.frames
      .filter((frame) => !entry.addedFrames.includes(frame))
      .concat(entry.removedFrames);
    board.undone.push(entry);
    return true;
  };

  board.redo = () => {
    const entry = board.undone.pop();
    if (!entry) return false;
    board.tiles = board.tiles
      .filter((tile) => !entry.removed.includes(tile))
      .concat(entry.added);
    if (entry.paint) applyPaint(board.ground, entry.paint);
    board.frames = board.frames
      .filter((frame) => !entry.removedFrames.includes(frame))
      .concat(entry.addedFrames);
    board.done.push(entry);
    return true;
  };

  return board;
}

/** Painting: an ore goes **over** the ground, the way the game stacks its layers. */
/**
 * `null` for the whole cell wipes it; `null` for one layer drops that layer alone.
 *
 * The second is what the eraser needs. Rubbing out an ore used to take the floor painted
 * under it with it, because the eraser had no way of saying anything narrower than "this
 * tile goes", and putting the floor back was a job in itself.
 *
 * A layer set to null is deleted rather than stored as null: everything downstream tests
 * the name it finds, so both read the same, and a key that means "nothing" is one more
 * shape for the draft, the renderer and the analysis to agree about for no gain. A cell
 * left with no layer at all goes too, so an erased tile is indistinguishable from one
 * never painted.
 */
function applyPaint(ground, paint) {
  for (const [cell, layers] of Object.entries(paint)) {
    if (layers === null) {
      delete ground[cell];
      continue;
    }
    const merged = { ...ground[cell], ...layers };
    for (const [layer, value] of Object.entries(merged)) {
      if (value === null || value === undefined) delete merged[layer];
    }
    if (Object.keys(merged).length) ground[cell] = merged;
    else delete ground[cell];
  }
}

/** Put the previous ground back, telling "it was empty" from "it was something else". */
function restore(ground, before) {
  for (const [cell, layers] of Object.entries(before)) {
    if (layers === undefined) delete ground[cell];
    else ground[cell] = layers;
  }
}

/**
 * One frame as a board of its own, for analysing that frame alone.
 *
 * A view rather than a board somebody built: its blocks, its ground and its frame are
 * copies, so nothing done to it on the way through the analysis reaches the workbench it
 * was cut from. It carries that workbench, and carrying it is the whole point. The page
 * sets the board it was handed aside so that editing again resumes where it stopped, and a
 * view set aside that way becomes the board the player comes back to: every other frame,
 * and every block outside this one, gone from it, then written over the saved draft on the
 * first gesture. `workbenchOf` is what the page asks instead.
 */
export function frameBoard({ board, frame, sizeOf }) {
  const scoped = createBoard({
    tiles: board.tilesIn(frame), ground: board.ground, frames: [{ ...frame }], sizeOf,
  });
  scoped.workbench = board;
  return scoped;
}

/**
 * The board to set aside: the workbench a view was cut from, or the board itself when it
 * is already the workbench.
 *
 * A whole-board analysis and a frame analysis come back through the same door, and the
 * board is the only one that can say which of the two it was.
 */
export function workbenchOf(board) {
  return board.workbench || board;
}

/**
 * The frame every measurement and every export is about: the active one, or failing that
 * the last drawn, so nothing is ever left pointing at nothing once a frame exists.
 *
 * `null` when the board carries no frame at all, which is not a missing answer: with no
 * frame the board is itself the single implicit one, and `orphans()` returns nothing for
 * exactly the same reason.
 */
export function currentFrameOf(board, activeFrameId = null) {
  return board.frames.find((frame) => frame.id === activeFrameId)
    || board.frames[board.frames.length - 1]
    || null;
}

/**
 * What "the plan" means when nobody has selected anything: the blocks a copy or a download
 * should carry, and the name to write on them.
 *
 * The same unit the gauge measures and the analysis reads. Answering anything else would
 * let a button hand over blocks the export refuses, which is the one way to give somebody
 * a schematic that is not what they were looking at. A board with frames therefore exports
 * one frame and not the workbench, and a board without them exports itself whole.
 */
export function exportUnit(board, activeFrameId = null) {
  const frame = currentFrameOf(board, activeFrameId);
  return frame
    ? { tiles: board.tilesIn(frame), name: frame.name, frame }
    : { tiles: board.tiles, name: "plan", frame: null };
}
