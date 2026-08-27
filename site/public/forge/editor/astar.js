/**
 * The route that goes around, transcribed from `Placement.astar` in v159.7.
 *
 * Holding a conveyor and asking for diagonal placement does not draw a line in the game: it
 * searches for a path. A factory in the way is walked around instead of being flattened,
 * and that is what lets a belt be pulled across a base without taking the base apart.
 *
 * Three heuristics, and they are the whole of the behaviour:
 *
 * | What is crossed | Cost |
 * |---|---|
 * | a free tile, carrying on the same way | 1 |
 * | a free tile, but one that turns | 8 |
 * | an occupied tile or deep liquid | 20 |
 *
 * The turn costing 8 is the detail that matters: without it the A\* returns a staircase of
 * single steps, pretty on paper and catastrophic in conveyors, since every turn costs an
 * item of throughput. With it, the path runs straight for as long as it can.
 *
 * The thousand-node limit is the game's, and so is the fallback: with no path found it
 * returns `null` and the caller drops back to the straight line.
 */

const NODE_LIMIT = 1000;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const key = (x, y) => `${x},${y}`;

/**
 * `tileHeuristic`: what it costs to enter `other` coming from `from`.
 *
 * `blocked(x, y)` says a tile refuses the block, which covers the game's
 * `!canReplace && !alwaysReplace` and its `floor().isDeep()`.
 */
function stepCost(from, other, parents, blocked) {
  if (blocked(other.x, other.y)) return 20;
  const came = parents.get(key(from.x, from.y));
  if (came) {
    const inbound = `${Math.sign(from.x - came.x)},${Math.sign(from.y - came.y)}`;
    const outbound = `${Math.sign(other.x - from.x)},${Math.sign(other.y - from.y)}`;
    if (inbound !== outbound) return 8;
  }
  return 1;
}

const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * The path from `from` to `to`, or `null` when the search finds none.
 *
 * `bounds` limits the search. The game does not need it, since its map has edges; here the
 * ground is endless and an unbounded search sets off into the void until it hits its
 * thousand-node limit, on every movement of the mouse.
 */
export function astar(from, to, { blocked, bounds }) {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];

  const costs = new Map([[key(from.x, from.y), 0]]);
  const parents = new Map();
  const closed = new Set([key(from.x, from.y)]);
  /* A queue sorted each round rather than a heap: a thousand nodes at most, and a
     hand-written heap of a thousand elements is more code to get wrong than time saved. */
  let queue = [{ ...from }];
  let visited = 0;
  let found = false;

  while (queue.length && visited++ < NODE_LIMIT) {
    queue.sort((a, b) =>
      (costs.get(key(a.x, a.y)) + distance(a, to))
      - (costs.get(key(b.x, b.y)) + distance(b, to)));
    const next = queue.shift();
    if (next.x === to.x && next.y === to.y) { found = true; break; }

    const base = costs.get(key(next.x, next.y)) ?? 0;
    for (const [dx, dy] of DIRECTIONS) {
      const child = { x: next.x + dx, y: next.y + dy };
      if (child.x < bounds.left || child.x > bounds.right) continue;
      if (child.y < bounds.bottom || child.y > bounds.top) continue;
      const at = key(child.x, child.y);
      if (closed.has(at)) continue;
      closed.add(at);
      parents.set(at, { x: next.x, y: next.y });
      costs.set(at, base + stepCost(next, child, parents, blocked));
      queue.push(child);
    }
  }
  if (!found) return null;

  const path = [{ x: to.x, y: to.y }];
  let current = { x: to.x, y: to.y };
  let steps = 0;
  while (!(current.x === from.x && current.y === from.y) && steps++ < NODE_LIMIT) {
    const came = parents.get(key(current.x, current.y));
    if (!came) return null;
    path.push(came);
    current = came;
  }
  path.reverse();
  return path;
}
