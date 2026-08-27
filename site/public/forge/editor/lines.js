/**
 * What a drag places, transcribed from `InputHandler.iterateLine` and `Placement` in v159.7.
 *
 * The first version of this file invented an L-shaped elbow, on the strength of how one
 * remembers placing conveyors. **That elbow exists nowhere in the game.** Here is what
 * really exists, in the order `iterateLine` decides it:
 *
 *     diagonal = "diagonal placement" key held
 *     if block.swapDiagonalPlacement           -> diagonal = !diagonal
 *
 *     if diagonal and block.allowDiagonal
 *         if start and end are a chain the block can replace
 *                                              -> upgradeLine: follow the existing chain
 *         else                                 -> pathfindLine: a Bresenham staircase,
 *                                                 or A* for conveyorPlacement blocks
 *     else if block.allowRectanglePlacement    -> normalizeRectangle, spaced by the size
 *     else                                     -> normalizeLine: a STRAIGHT line, long axis
 *
 *     then block.changePlacementPath(points)   -> bridges space their nodes by their span
 *     then block.handlePlacementLine(plans)    -> bridges link to the next one
 *
 * Those last two lines are what makes a drag of bridges produce, in the game, a chain of
 * linked bridges and not a row of touching bridges that never speak to each other.
 */

import { DIRECTIONS } from "../engine/core.js";
import { blockerOf, withBridges, withJunctions } from "./smart.js";
import { astar } from "./astar.js";

/** The game rotation going from `a` to `b`, or `null` when the two tiles are the same. */
function facing(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  const found = DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
  return found === -1 ? null : found;
}

/**
 * `Placement.normalizeLine`: a straight line on the axis the drag is longest along.
 *
 * This is the **default** route, the one obtained without touching any key, and therefore by
 * far the most used.
 */
export function normalizeLine(from, to) {
  const points = [];
  if (Math.abs(from.x - to.x) > Math.abs(from.y - to.y)) {
    const way = Math.sign(to.x - from.x);
    for (let i = 0; i <= Math.abs(from.x - to.x); i++) {
      points.push({ x: from.x + i * way, y: from.y });
    }
  } else {
    const way = Math.sign(to.y - from.y);
    for (let i = 0; i <= Math.abs(from.y - to.y); i++) {
      points.push({ x: from.x, y: from.y + i * way });
    }
  }
  return points;
}

/**
 * `Placement.normalizeRectangle`: fill the whole **area**, not a line.
 *
 * This is the gesture that lays a twenty-block stretch of wall in one go, and it covers 139
 * blocks of the game. The step is the block's size, otherwise every block placed destroys
 * the previous one and a single tile is left at the end of the gesture.
 *
 * The name misleads, and it misled whoever wrote this first: "rectangle" here means a filled
 * surface, not the outline of a rectangle. Read in the source rather than guessed.
 */
export function normalizeRectangle(from, to, size) {
  const points = [];
  const spanX = Math.abs(to.x - from.x);
  const spanY = Math.abs(to.y - from.y);
  const wayX = Math.sign(to.x - from.x);
  const wayY = Math.sign(to.y - from.y);
  for (let y = 0; y <= spanY; y += size) {
    for (let x = 0; x <= spanX; x += size) {
      points.push({ x: from.x + x * wayX, y: from.y + y * wayY });
    }
  }
  return points;
}

/**
 * `Bresenham2.lineNoDiagonal`: the staircase that hugs the true diagonal.
 *
 * One step on one axis at a time, never both together, otherwise two conveyors would touch
 * at the corner and hand each other nothing.
 */
export function bresenham(from, to) {
  const points = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    points.push({ x, y });
    if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    /* The `else if` is the whole point: with two `if`s, both axes advance on the same
       iteration and the line starts jumping diagonally. */
    if (twice >= dy) { error += dy; x += sx; }
    else if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

/**
 * `Placement.upgradeLine`: follow a chain already placed instead of drawing across it.
 *
 * This is the gesture that replaces a line of conveyors with titanium conveyors in one drag,
 * hugging its turns. Drawing straight instead would cut through the factory.
 *
 * The game follows `ChainedBuilding.next()`. There are no buildings here, only tiles: the
 * chain is followed by stepping from one to the next in the direction each block faces.
 */
export function upgradeLine(from, to, board) {
  const points = [{ x: from.x, y: from.y }];
  const seen = new Set([`${from.x},${from.y}`]);
  let tile = board.at(from.x, from.y);

  while (tile && !(tile.x === to.x && tile.y === to.y)) {
    const [dx, dy] = DIRECTIONS[(tile.rotation || 0) % 4];
    const next = board.at(tile.x + dx, tile.y + dy);
    const key = next && `${next.x},${next.y}`;
    if (!next || seen.has(key)) return null;
    seen.add(key);
    points.push({ x: next.x, y: next.y });
    tile = next;
  }
  return tile ? points : null;
}

/**
 * `Placement.calculateNodes`: keep only the nodes that can still see each other.
 *
 * Walks the points and, from each, jumps to the **furthest** one still within reach. That is
 * what makes a drag of bridges over twelve tiles place two bridges and not twelve, and what
 * makes the twelve-tile span of a phase conduit actually felt in use.
 */
export function calculateNodes(points, reach) {
  if (points.length < 2) return points;
  const result = [];
  let i = 0;
  let addedLast = false;

  outer:
  while (i < points.length) {
    const point = points[i];
    result.push(point);
    if (i === points.length - 1) addedLast = true;

    for (let j = points.length - 1; j > i; j--) {
      if (reach(point, points[j])) {
        i = j;
        continue outer;
      }
    }
    i++;
  }
  if (!addedLast) result.push(points[points.length - 1]);
  return result;
}

/** A block's reach in tiles, whether it files it under `range` or `laser_range`. */
export function reachOf(block) {
  if (block?.range) return block.range;
  if (block?.laser_range) return Math.floor(block.laser_range);
  return 0;
}

/** A block that jumps over the ground: bridge, duct bridge, power node. */
export function jumps(block) {
  const kind = block?.kind || "";
  return kind.includes("Bridge") || kind === "PowerNode" || kind === "BeamNode";
}

/**
 * A bridge that **holds** its target, as opposed to one that looks for it ahead.
 *
 * The game has two families and they do not link the same way. `ItemBridge` and
 * `LiquidBridge` keep the offset to their target in their configuration, and
 * `handlePlacementLine` is what writes it. `DirectionBridge`, which the duct bridge and the
 * reinforced conduit come from, configures nothing at all: its `findLink()` sweeps straight
 * ahead, in the direction it faces, out to its reach.
 *
 * Giving all of them a configuration would write into the file a link the game ignores, and
 * let a duct pointed any which way claim to be connected.
 */
export function linksByConfig(block) {
  const kind = block?.kind || "";
  return kind.includes("Bridge") && !kind.includes("Direction") && !kind.includes("Duct");
}

/**
 * The blocks a drag from `from` to `to` places.
 *
 * `diagonal` is the state of the "diagonal placement" key. `board` is what `upgradeLine`
 * needs, since it has to know what is already there; with no board, that mode is skipped.
 */
export function lineOf(from, to, block, catalogue, rotation = 0,
                       { diagonal = false, board = null } = {}) {
  const known = catalogue.blocks[block] || {};
  const size = known.size || 1;

  /* A few blocks invert the toggle so that their most useful behaviour is the one obtained
     without holding anything down. Power nodes are among them: they are almost always
     wanted as a staircase. */
  let wants = diagonal;
  if (known.swap_diagonal_placement) wants = !wants;

  let points;
  if (wants && known.allow_diagonal !== false) {
    const chain = board ? upgradeLine(from, to, board) : null;
    /* The game's `pathfindLine`: an A* for `conveyorPlacement` blocks, a Bresenham
       staircase for the rest. The A* goes around what is already there, which is what lets
       a belt be pulled across a base without taking the base apart. */
    points = chain
      || (known.conveyor_placement && board ? pathfind(from, to, block, catalogue, board) : null)
      || bresenham(from, to);
  } else if (known.allow_rectangle_placement) {
    points = normalizeRectangle(from, to, size);
  } else {
    points = normalizeLine(from, to);
  }

  /* `changePlacementPath`: blocks that reach far are not placed tile by tile, they are
     placed as far apart as they can still see each other. */
  const reach = reachOf(known);
  if (jumps(known) && reach > 0) {
    points = calculateNodes(points,
      (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= reach);
  } else if (size > 1 && !known.allow_rectangle_placement) {
    /* A large block placed tile by tile destroys itself at every step. The game avoids that
       through `allowRectanglePlacement` where it has set it; elsewhere, spacing it by its
       own size is the only reading that does not throw away half the gesture. */
    points = points.filter((_, i) => i % size === 0);
  }

  /* The game's `planRotation`: a block that does not rotate and that `lockRotation` locks
     always comes out at zero, whatever the hand holds. And `ignoreLineRotation` says a block
     does not follow the direction of the drag, even when it does rotate. */
  const follows = (known.conveyor_placement || known.rotate) && !known.ignore_line_rotation;
  const settle = (value) => (!known.rotate && known.lock_rotation ? 0 : value);

  let plans = points.map((point, i) => ({
    x: point.x,
    y: point.y,
    block,
    rotation: settle(follows
      ? (i + 1 < points.length
          ? (facing(point, points[i + 1]) ?? rotation)
          : lastFacing(points, rotation))
      : rotation),
  }));

  /* What the game decides on the player's behalf, and which needs to know what is already
     placed: the junction at a crossing, then the bridges that cross an obstacle. */
  if (board) {
    if (known.junction_replacement) plans = withJunctions(plans, board, catalogue);
    const relay = known.bridge_replacement && catalogue.blocks[known.bridge_replacement];
    if (relay) {
      plans = withBridges(plans, {
        blocked: blockerOf(board, catalogue, block),
        reach: reachOf(relay),
        bridge: known.bridge_replacement,
        hasJunction: Boolean(known.junction_replacement),
        /* What a junction can cross. The game passes `b -> b instanceof Conveyor` for a
           belt and `b -> b instanceof Duct || b instanceof Conveyor` for a duct;
           `conveyor_placement` is the published flag covering both families, and it is what
           is read here rather than testing class names. */
        avoid: (x, y) => {
          const under = board.at(x, y);
          return Boolean(under && catalogue.blocks[under.block]?.conveyor_placement);
        },
      });
    }
  }

  /* `handlePlacementLine`: every bridge receives, as its configuration, the offset to the
     next one. That is what makes a drag of bridges give a chain that carries, and not a row
     of bridges ignoring each other. */
  if (linksByConfig(known) && reach > 0) {
    for (let i = 0; i < plans.length - 1; i++) {
      const here = plans[i];
      const next = plans[i + 1];
      if (Math.max(Math.abs(here.x - next.x), Math.abs(here.y - next.y)) <= reach) {
        /* Type 7 of the format is a relative point written as two integers. It is the shape
           `schematic.js` reads and writes, and the one `analyse.js` follows to draw the
           link: inventing another shape here would have given three different ideas of the
           same link. */
        here.config = { type: 7, dx: next.x - here.x, dy: next.y - here.y };
      }
    }
  }
  return plans;
}

/**
 * The path that goes around, bounded to something reasonable.
 *
 * The bound is not in the game and is indispensable here: its map has edges, our ground has
 * none, and an unbounded search sets off into the void on every movement of the mouse.
 * Twenty tiles around what the drag asks for is ample to get around a factory, and does not
 * let the search wander.
 */
function pathfind(from, to, block, catalogue, board) {
  const margin = 20;
  return astar(from, to, {
    blocked: blockerOf(board, catalogue, block),
    bounds: {
      left: Math.min(from.x, to.x) - margin,
      right: Math.max(from.x, to.x) + margin,
      bottom: Math.min(from.y, to.y) - margin,
      top: Math.max(from.y, to.y) + margin,
    },
  });
}

/** The last block's heading: that of the segment which has just brought it there. */
function lastFacing(points, fallback) {
  if (points.length < 2) return fallback;
  const heading = facing(points[points.length - 2], points[points.length - 1]);
  return heading === null ? fallback : heading;
}
