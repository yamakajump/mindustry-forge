/**
 * What is done with a group of blocks once it is selected.
 *
 * Turning a selection is not turning each block where it stands: the **positions** turn too,
 * around the box. Confusing the two gives a selection that flies apart on the first quarter
 * turn, every block staying where it was with a rotated sprite.
 *
 * Rotations are the game's, counted anticlockwise from east: 0 east, 1 north, 2 west,
 * 3 south. A positive quarter turn therefore turns that way.
 *
 * A large block is filed by its centre, with the offset `-(size - 1) / 2` truncated. It is
 * not its centre that has to be turned but its footprint, otherwise a two-wide drill leaves
 * the box by half a tile on every quarter turn and the fourth one does not give back the
 * selection it started from.
 */

import { boxOf, footprint } from "./state.js";

/** The bottom left corner of a block's footprint, and its size. */
function corner(tile, sizeOf) {
  const size = sizeOf(tile.block) || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  return { cx: tile.x + offset, cy: tile.y + offset, size, offset };
}

/** The blocks whose footprint touches the box, if only by one tile. */
export function inBox(tiles, box, sizeOf) {
  return tiles.filter((tile) => footprint(tile, sizeOf).some(([x, y]) =>
    x >= box.left && x < box.left + box.width
    && y >= box.bottom && y < box.bottom + box.height));
}

/** Moving, which is the one case where nothing else changes. */
export function translate(tiles, dx, dy) {
  return tiles.map((tile) => ({ ...tile, x: tile.x + dx, y: tile.y + dy }));
}

/**
 * Turn the selection by one or more quarter turns.
 *
 * The box is measured on the blocks, the rotation happens in coordinates relative to its
 * bottom left corner, and the turned box is put back at that same corner. Four quarter turns
 * therefore give back exactly the selection it started from, which a test checks.
 */
/**
 * A bridge's configuration is a direction, and a direction turns with the rest.
 *
 * `schematic.js` reads it as `{type: 7, dx, dy}`: the offset from a bridge to the one it
 * hands over to, in tiles. Rotating or mirroring a selection moved every block and left
 * that vector where it was, so a bridge came out of a mirror pointing at whatever now
 * happened to be on its right - and the game reads the vector, not the picture, so the
 * copy pasted back in was wired differently from the one on screen.
 *
 * The quarter turn here is anticlockwise, the same one `rotateBy` applies to positions:
 * (1, 0) becomes (0, 1). Derived from the position arithmetic rather than assumed, because
 * a vector turning the wrong way is a defect that looks like a working schematic.
 *
 * Anything else is handed back untouched. A sorter's item, a processor's program: they do
 * not point anywhere. The one shape this deliberately does not touch is `{type: 8, links}`,
 * a processor's links, which are packed absolute positions rather than offsets - turning
 * those needs the board they were packed against, which a selection does not carry.
 */
function turnedConfig(config, quarters) {
  if (!config || config.type !== 7) return config;
  let { dx, dy } = config;
  for (let i = 0; i < ((quarters % 4) + 4) % 4; i++) {
    // `0 - dy` rather than `-dy`: negating a zero gives -0, which survives into the draft's
    // JSON and makes two identical selections compare unequal.
    [dx, dy] = [0 - dy, dx];
  }
  return { ...config, dx, dy };
}

/** The same, mirrored: on the X axis the offset's own x changes sign, and only it. */
function flippedConfig(config, axis) {
  if (!config || config.type !== 7) return config;
  return axis === "x"
    ? { ...config, dx: 0 - config.dx }
    : { ...config, dy: 0 - config.dy };
}

export function rotateBy(tiles, quarters, catalogue) {
  const turns = ((quarters % 4) + 4) % 4;
  if (!turns || !tiles.length) return tiles.map((tile) => ({ ...tile }));

  const sizeOf = (name) => catalogue.blocks[name]?.size || 1;
  let out = tiles.map((tile) => ({ ...tile }));

  for (let step = 0; step < turns; step++) {
    const box = boxOf(out, sizeOf);
    out = out.map((tile) => {
      const { cx, cy, size, offset } = corner(tile, sizeOf);
      const rx = cx - box.left;
      const ry = cy - box.bottom;
      /* Anticlockwise: the column becomes the row, and the row becomes the column counted
         from the other edge. The `- (size - 1)` takes the footprint by its other corner,
         the one that becomes the bottom left corner after the quarter turn. */
      const nx = box.height - 1 - (ry + size - 1);
      const ny = rx;
      return {
        ...tile,
        x: box.left + nx - offset,
        y: box.bottom + ny - offset,
        rotation: catalogue.blocks[tile.block]?.rotate
          ? ((tile.rotation || 0) + 1) % 4 : (tile.rotation || 0),
        config: turnedConfig(tile.config, 1),
      };
    });
  }
  return out;
}

/**
 * Mirror the selection, on the `"x"` axis (left-right) or the `"y"` axis (top-bottom).
 *
 * The rotation is mirrored as well: on the X axis, east becomes west and north stays put.
 * Flipping the positions without flipping the rotations gives a mirrored copy whose belts
 * all run backwards, which shows in use and not in the picture.
 */
export function flip(tiles, axis, catalogue) {
  if (!tiles.length) return [];
  const sizeOf = (name) => catalogue.blocks[name]?.size || 1;
  const box = boxOf(tiles, sizeOf);

  /**
   * `Block.flipRotation` from v159.7, transcribed rather than tabulated.
   *
   *     if((x == (rotation % 2 == 0)) != invertFlip) rotation = planRotation(rotation + 2)
   *
   * A four-entry table gave the same answer for every block except those carrying
   * `invertFlip`, and the game has one: a mirror turned it the wrong way with nothing to say
   * so, which is exactly the kind of mistake that only shows in use, once the schematic has
   * been pasted into the game.
   */
  const flipped = (rotation, block) => {
    const onX = axis === "x";
    const turn = (onX === (rotation % 2 === 0)) !== Boolean(block?.invert_flip);
    const out = turn ? (rotation + 2) % 4 : rotation;
    return !block?.rotate && block?.lock_rotation ? 0 : out;
  };

  return tiles.map((tile) => {
    const { cx, cy, size, offset } = corner(tile, sizeOf);
    const rx = cx - box.left;
    const ry = cy - box.bottom;
    const nx = axis === "x" ? box.width - size - rx : rx;
    const ny = axis === "y" ? box.height - size - ry : ry;
    return {
      ...tile,
      x: box.left + nx - offset,
      y: box.bottom + ny - offset,
      rotation: flipped((tile.rotation || 0) % 4, catalogue.blocks[tile.block]),
      config: flippedConfig(tile.config, axis),
    };
  });
}
