/**
 * What the game decides on the player's behalf when they draw a line.
 *
 * Two mechanics, and they are the ones that let somebody draw straight through their own
 * factory without thinking about it. Both transcribed from v159.7.
 *
 * **The junction at a crossing**, `Conveyor.getReplacement`. A line cutting across a
 * perpendicular line does not cut it: the crossing becomes a junction, and both lines carry
 * on their way.
 *
 * **The automatic bridge**, `Placement.calculateBridges`. A line meeting an obstacle crosses
 * it on its own. This is not an "if blocked, then bridge": it is dynamic programming over
 * the whole line, weighing three costs and choosing the cheapest path end to end.
 *
 * The costs are the game's, and their ratio is the whole of the behaviour: a bridge is worth
 * sixty-six conveyors, so it only appears where nothing else gets through, and the penalty
 * per empty tile spanned makes it prefer the shortest jump.
 */

import { footprint } from "./state.js";

const CONVEYOR_COST = 3;
const JUNCTION_COST = 30;
const BRIDGE_COST = 200;
const BRIDGE_OVER_EMPTY = 5;
const INFINITE = Number.MAX_SAFE_INTEGER / 2;

/**
 * `Placement.isSidePlace`: is the first block set crosswise to the line?
 *
 * A guard on the automatic bridge. A line whose first block faces sideways is not a line
 * being extended, it is an inlet being wired up, and inserting bridges into it undoes
 * exactly what the player had just done.
 */
export function isSidePlace(plans) {
  if (plans.length < 2) return false;
  const first = plans[0];
  const second = plans[1];
  const dx = Math.sign(second.x - first.x);
  const dy = Math.sign(second.y - first.y);
  const heading = dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
  return (((heading - (first.rotation || 0)) % 2) + 2) % 2 === 1;
}

/**
 * The junction at a crossing.
 *
 * Three conditions together, and it is their conjunction that avoids false positives: the
 * line carries on **on both sides** of this tile, the tile **already** holds a conveyor, and
 * that conveyor is **perpendicular** to ours. A conveyor running the same way is replaced
 * normally; only the crossing calls for a junction.
 */
export function withJunctions(plans, board, catalogue) {
  return plans.map((plan) => {
    const junction = catalogue.blocks[plan.block]?.junction_replacement;
    if (!junction) return plan;

    const ahead = plans.some((other) => sameCell(other, step(plan, plan.rotation)));
    const behind = plans.some((other) => sameCell(other, step(plan, plan.rotation + 2)));
    if (!ahead || !behind) return plan;

    const under = board.at(plan.x, plan.y);
    if (!under || !catalogue.blocks[under.block]?.conveyor_placement) return plan;
    /* Perpendicular, which is to say a rotation differing by an odd number of quarter
       turns. A conveyor running against ours is not a crossing. */
    if (((((under.rotation || 0) - plan.rotation) % 2) + 2) % 2 !== 1) return plan;

    return { ...plan, block: junction, rotation: 0, config: undefined };
  });
}

const DELTAS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const step = (plan, rotation) => {
  const [dx, dy] = DELTAS[(((rotation % 4) + 4) % 4)];
  return { x: plan.x + dx, y: plan.y + dy };
};
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

/**
 * The automatic bridges, `Placement.smartCalculateBridges`.
 *
 * `blocked(x, y)` says whether a tile refuses the conveyor, `reach` is the bridge's span,
 * and `bridge` its name. Returns a fresh list of plans in which the impassable stretches
 * have been replaced by bridges linked in pairs.
 *
 * The `dp` array has two halves: the first is the best cost of reaching `i` **on the
 * ground**, the second of reaching it **at the end of a bridge**. That doubling is what
 * allows the two to be compared at every tile, and a bridge to be opened only where it pays.
 */
export function withBridges(plans, { blocked, reach, bridge, hasJunction = false,
                                     avoid = () => false }) {
  if (plans.length < 2 || !bridge || !reach) return plans;
  /* Orthogonal lines only, and no side placement: the game's two guards, before anything
     is worked out at all. */
  const first = plans[0];
  const last = plans[plans.length - 1];
  if (first.x !== last.x && first.y !== last.y) return plans;
  if (isSidePlace(plans)) return plans;

  const n = plans.length;
  const cost = new Array(2 * n).fill(INFINITE);
  const parent = new Array(2 * n).fill(-1);
  cost[0] = 0;
  cost[n] = BRIDGE_COST;

  const free = (plan) => !blocked(plan.x, plan.y);

  for (let i = 1; i < n; i++) {
    const here = plans[i];
    const canPlace = free(here);
    /* The game's `needJunction`: `hasJunction && avoid.get(cur.tile().block())`. A junction
       only crosses a **carrier**, not any obstacle at all.

       Flattening that into "every obstacle is crossed by a junction" condemned the bridge to
       never win: a junction costs 30 and a bridge 200, so the calculation ran an imaginary
       junction straight through a press and opened no bridge. Measured on a line of
       seventeen conveyors cut by a press: zero bridges placed. */
    const needJunction = hasJunction && avoid(here.x, here.y);
    if (!canPlace && !needJunction) continue;

    cost[i] = cost[i - 1] + (canPlace ? CONVEYOR_COST : JUNCTION_COST);
    parent[i] = i - 1;

    if (cost[i] < INFINITE && canPlace) {
      cost[n + i] = cost[i] + BRIDGE_COST;
      parent[n + i] = i - 1;
    }

    if (i >= 2 && canPlace) {
      let emptyPenalty = free(plans[i - 1]) ? BRIDGE_OVER_EMPTY : 0;
      for (let j = i - 2; j >= 0; j--) {
        const other = plans[j];
        const far = Math.max(Math.abs(here.x - other.x), Math.abs(here.y - other.y));
        if (far > reach) break;   // further back will not be any closer
        if (free(other)) {
          const through = cost[n + j] + BRIDGE_COST + emptyPenalty;
          if (cost[n + i] > through) {
            cost[n + i] = through;
            parent[n + i] = j;
          }
          emptyPenalty += BRIDGE_OVER_EMPTY;
        }
      }
    }

    if (cost[n + i] < cost[i]) {
      cost[i] = cost[n + i];
      parent[i] = parent[n + i];
    }
    if (canPlace && cost[i] >= INFINITE) {
      // Nothing joins this tile to the start: begin a fresh stretch.
      cost[i] = 0;
      cost[n + i] = BRIDGE_COST;
    }
  }

  /* Walk the chosen path back. `mode` says whether this tile was reached on the ground or
     by a bridge, which is not the same cell of the array and so not the same parent. */
  const out = [];
  let mode = 0;
  for (let i = n - 1; i >= 0; ) {
    const here = { ...plans[i] };
    const from = parent[mode + i];
    if (from === -1 || from === i - 1) {
      out.push(here);
      mode = 0;
      i--;
    } else {
      const other = { ...plans[from] };
      here.block = bridge;
      other.block = bridge;
      other.config = { type: 7, dx: here.x - other.x, dy: here.y - other.y };
      out.push(here);
      plans[from] = other;
      i = from;
      mode = n;
    }
  }
  out.reverse();
  return out;
}

/** What a tile refuses: a wall, deep liquid, or a block that is not replaced. */
export function blockerOf(board, catalogue, block) {
  const known = catalogue.blocks[block] || {};
  const sizeOf = (name) => catalogue.blocks[name]?.size || 1;
  return (x, y) => {
    const ground = board.ground[`${x},${y}`];
    if (ground?.wall) return true;
    const floor = ground?.floor && catalogue.blocks[ground.floor];
    if (floor?.deep && !known.floating && !known.placeable_liquid) return true;

    const under = board.at(x, y);
    if (!under) return false;
    /* A block of the same group is replaced, so it does not block. Everything else does,
       and that is what triggers the bridge: a press in the middle of a conveyor line. */
    const other = catalogue.blocks[under.block] || {};
    if (other.always_replace) return false;
    return !(known.group && known.group !== "none" && other.group === known.group
             && footprint(under, sizeOf).length === 1);
  };
}
