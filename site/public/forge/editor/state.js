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
 */

export const MAX_SIZE = 64;

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

export function createBoard({ tiles = [], ground = {}, sizeOf }) {
  const board = {
    tiles: tiles.map((tile) => ({ rotation: 0, ...tile })),
    ground: { ...ground },
    /* What has been done, and what has been undone and could be redone. */
    done: [],
    undone: [],
  };

  /** The tiles a block covers, as ground keys. */
  const cellsOf = (tile) => footprint(tile, sizeOf).map(([x, y]) => key(x, y));

  board.at = (x, y) => board.tiles.find(
    (tile) => cellsOf(tile).includes(key(x, y))) || null;

  board.box = () => boxOf(board.tiles, sizeOf);

  /**
   * Does placing this keep the box within 64 by 64?
   *
   * Takes one block or a whole batch, and the batch is not the sum of the blocks: a drag of
   * a hundred conveyors on an empty board sees each of its blocks fit on its own, since each
   * measured alone is one tile wide. It is together that they overflow.
   */
  board.fits = (plans) => {
    const batch = Array.isArray(plans) ? plans : [plans];
    const box = boxOf([...board.tiles, ...batch], sizeOf);
    return box.width <= MAX_SIZE && box.height <= MAX_SIZE;
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
   */
  board.apply = ({ place = [], remove = [], paint = null }) => {
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

    if (!plans.length && !removed.length && !paint) return false;

    board.tiles = board.tiles.filter((tile) => !removed.includes(tile)).concat(plans);
    if (paint) applyPaint(board.ground, paint);

    board.done.push({ removed, added: plans, before, paint });
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
    board.done.push(entry);
    return true;
  };

  return board;
}

/** Painting: an ore goes **over** the ground, the way the game stacks its layers. */
function applyPaint(ground, paint) {
  for (const [cell, layers] of Object.entries(paint)) {
    if (layers === null) delete ground[cell];
    else ground[cell] = { ...ground[cell], ...layers };
  }
}

/** Put the previous ground back, telling "it was empty" from "it was something else". */
function restore(ground, before) {
  for (const [cell, layers] of Object.entries(before)) {
    if (layers === undefined) delete ground[cell];
    else ground[cell] = layers;
  }
}
