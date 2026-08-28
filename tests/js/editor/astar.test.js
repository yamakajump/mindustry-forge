/**
 * The route that goes around obstacles, transcribed from `Placement.astar` in v159.7.
 *
 * A factory in the middle of the passage gets routed around instead of crushed. The turn
 * cost of 8 is the detail that matters: without it, the path comes out as a staircase of
 * single-tile steps, pretty on paper and catastrophic once it is conveyors, since every
 * turn costs a throughput item.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { astar } from "../../../site/public/forge/editor/astar.js";

const bounds = { left: -20, right: 20, bottom: -20, top: 20 };
const chemin = (from, to, blocked = () => false) =>
  astar(from, to, { blocked, bounds });
const cases = (path) => path?.map((p) => [p.x, p.y]);

test("with no obstacle, the path goes straight", () => {
  /* This is guaranteed by the turn cost of 8: at equal tile cost, turning costs eight
     times more than continuing straight, so the path only turns when forced to. */
  assert.deepEqual(cases(chemin({ x: 0, y: 0 }, { x: 4, y: 0 })),
                   [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test("a diagonal path only makes one bend", () => {
  const path = chemin({ x: 0, y: 0 }, { x: 3, y: 3 });
  const virages = path.filter((p, i) => i > 0 && i < path.length - 1
    && Math.sign(p.x - path[i - 1].x) !== Math.sign(path[i + 1].x - p.x));
  assert.ok(virages.length <= 1, `${virages.length} turns, only one is needed`);
  assert.deepEqual(cases(path)[path.length - 1], [3, 3]);
});

test("a factory in the middle gets routed around instead of crushed", () => {
  // A three-tile vertical wall with no gap anywhere: the path must go around it.
  const mur = new Set(["2,-1", "2,0", "2,1"]);
  const path = chemin({ x: 0, y: 0 }, { x: 4, y: 0 }, (x, y) => mur.has(`${x},${y}`));
  assert.ok(path, "no path found");
  assert.deepEqual(cases(path)[path.length - 1], [4, 0]);
  const traverse = path.filter((p) => mur.has(`${p.x},${p.y}`));
  assert.equal(traverse.length, 0, "the path goes through the wall");
});

test("an impassable obstacle still gets crossed, for lack of anything better", () => {
  /* The game does not make an occupied tile forbidden, it makes it expensive: twenty
     against one. Boxing in the start should give a path that costs, not no path at all. */
  const partout = () => true;
  const path = chemin({ x: 0, y: 0 }, { x: 3, y: 0 }, partout);
  assert.ok(path, "an expensive path is still a path");
  assert.deepEqual(cases(path)[path.length - 1], [3, 0]);
});

test("the same start and end give a single tile", () => {
  assert.deepEqual(cases(chemin({ x: 2, y: 2 }, { x: 2, y: 2 })), [[2, 2]]);
});

test("every step is orthogonal, never diagonal", () => {
  const path = chemin({ x: 0, y: 0 }, { x: 5, y: 4 });
  for (let i = 1; i < path.length; i++) {
    const pas = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    assert.equal(pas, 1, `jump of ${pas} between ${i - 1} and ${i}`);
  }
});

test("outside the bounds, the search gives up instead of running off to infinity", () => {
  // The game does not need this, its map has edges; here the terrain is infinite.
  assert.equal(astar({ x: 0, y: 0 }, { x: 500, y: 0 },
                     { blocked: () => false, bounds }), null);
});
