/**
 * What a drag places, transcribed from `InputHandler.iterateLine` and `Placement` in
 * v159.7.
 *
 * The first version of this file tested an L-shaped bend, invented from memory. That bend
 * exists nowhere in the game, and every one of its tests passed: a reminder that green
 * tests only validate the implementation's faithfulness to what we believed, never to the
 * game. Every test below cites the game function it comes from.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  bresenham, calculateNodes, lineOf, normalizeLine, normalizeRectangle, upgradeLine,
} from "../../../site/public/forge/editor/lines.js";
import { createBoard } from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const at = (x, y) => ({ x, y });
const cells = (plans) => plans.map((t) => [t.x, t.y]);
const line = (from, to, block, rotation = 0, options = {}) =>
  lineOf(from, to, block, known, rotation, options);

/* --- `Placement.normalizeLine`: the default trace -------------------------------------- */

test("the default drag is a straight line, not a bend", () => {
  /* This is THE fix in this file. A diagonal drag, with no modifier key held, gives a
     straight line on the dominant axis and nothing else: the bend everyone thinks they
     see comes from doing two drags. */
  assert.deepEqual(cells(line(at(0, 0), at(4, 2), "conveyor")),
                   [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test("the dominant axis decides, and a tie goes to vertical", () => {
  // `normalizeLine` checks `abs(dx) > abs(dy)`: on a tie, height wins.
  assert.deepEqual(cells(normalizeLine(at(0, 0), at(3, 3))),
                   [[0, 0], [0, 1], [0, 2], [0, 3]]);
});

test("a belt always faces the next one", () => {
  const posee = line(at(0, 0), at(3, 0), "conveyor");
  assert.deepEqual(posee.map((t) => t.rotation), [0, 0, 0, 0]);
  assert.deepEqual(line(at(3, 0), at(0, 0), "conveyor").map((t) => t.rotation), [2, 2, 2, 2]);
  assert.deepEqual(line(at(0, 0), at(0, 2), "conveyor").map((t) => t.rotation), [1, 1, 1]);
});

/* --- `Bresenham2.lineNoDiagonal`: diagonal mode ----------------------------------------- */

test("diagonal mode makes a staircase that hugs the true diagonal", () => {
  const marche = bresenham(at(0, 0), at(3, 3));
  // Never two axes in the same step: every tile touches the previous one by a side.
  for (let i = 1; i < marche.length; i++) {
    const pas = Math.abs(marche[i].x - marche[i - 1].x) + Math.abs(marche[i].y - marche[i - 1].y);
    assert.equal(pas, 1, `diagonal jump between ${i - 1} and ${i}`);
  }
  assert.deepEqual([marche[0], marche[marche.length - 1]], [at(0, 0), at(3, 3)]);
});

test("the diagonal key really does change the trace", () => {
  const droit = cells(line(at(0, 0), at(4, 3), "conveyor"));
  const escalier = cells(line(at(0, 0), at(4, 3), "conveyor", 0, { diagonal: true }));
  assert.notDeepEqual(droit, escalier);
  assert.deepEqual(escalier[escalier.length - 1], [4, 3]);
});

test("a block that refuses diagonal ignores the key, held or not", () => {
  // Bridges carry `allowDiagonal = false` in the game.
  assert.equal(known.blocks["phase-conveyor"].allow_diagonal, false);
  const sans = cells(line(at(0, 0), at(20, 6), "phase-conveyor"));
  const avec = cells(line(at(0, 0), at(20, 6), "phase-conveyor", 0, { diagonal: true }));
  assert.deepEqual(sans, avec);
});

test("a power node inverts the toggle, because it is almost always wanted staircased", () => {
  assert.equal(known.blocks["power-node"].swap_diagonal_placement, true);
  const sansTouche = cells(line(at(0, 0), at(9, 4), "power-node"));
  const avecTouche = cells(line(at(0, 0), at(9, 4), "power-node", 0, { diagonal: true }));
  assert.notDeepEqual(sansTouche, avecTouche);
});

/* --- `Placement.normalizeRectangle`: filling an area ------------------------------------ */

test("a wall is placed by whole area, not by lines", () => {
  const remplissage = normalizeRectangle(at(0, 0), at(2, 2), 1);
  assert.equal(remplissage.length, 9);
  assert.deepEqual(remplissage[0], at(0, 0));
  assert.deepEqual(remplissage[8], at(2, 2));
});

test("the step of a fill is the block's own size", () => {
  // Otherwise each placed block destroys the previous one, and only one tile remains.
  const remplissage = normalizeRectangle(at(0, 0), at(5, 5), 3);
  assert.deepEqual(remplissage.map((p) => [p.x, p.y]),
                   [[0, 0], [3, 0], [0, 3], [3, 3]]);
});

test("a fill also works backwards", () => {
  const remplissage = normalizeRectangle(at(5, 5), at(3, 3), 1);
  assert.equal(remplissage.length, 9);
  assert.deepEqual(remplissage[0], at(5, 5));
  assert.deepEqual(remplissage[8], at(3, 3));
});

/* --- `Placement.calculateNodes`: bridges leapfrog --------------------------------------- */

test("a bridge is not placed tile by tile, it leaps as far as it can see", () => {
  /* Twelve tiles with a phase conveyor, range twelve: two bridges, not thirteen. That is
     exactly what `changePlacementPath` does in the game, and its absence is what made
     bridges unusable here. */
  const posee = line(at(0, 0), at(12, 0), "phase-conveyor");
  assert.equal(posee.length, 2);
  assert.deepEqual(cells(posee), [[0, 0], [12, 0]]);
});

test("past its range, the bridge places a relay", () => {
  const posee = line(at(0, 0), at(12, 0), "bridge-conveyor");   // range 4
  assert.deepEqual(cells(posee), [[0, 0], [4, 0], [8, 0], [12, 0]]);
});

test("every bridge is linked to the next one, and the last is not", () => {
  /* `handlePlacementLine`: a bridge's config is the offset to the next one. Without it, a
     drag gives a row of bridges that ignore each other, which looks like a chain in the
     image and transports nothing. */
  const posee = line(at(0, 0), at(8, 0), "bridge-conveyor");
  assert.deepEqual(posee[0].config, { type: 7, dx: 4, dy: 0 });
  assert.deepEqual(posee[1].config, { type: 7, dx: 4, dy: 0 });
  assert.equal(posee[posee.length - 1].config, undefined);
});

test("nodes always keep the last point of the drag", () => {
  // Thirteen tiles with a range of four: the last point does not land on a multiple.
  const posee = line(at(0, 0), at(13, 0), "bridge-conveyor");
  assert.deepEqual(cells(posee)[cells(posee).length - 1], [13, 0]);
});

test("a power node spaces itself by its range, like a bridge", () => {
  const posee = line(at(0, 0), at(18, 0), "power-node");   // range 6
  assert.ok(posee.length >= 3 && posee.length <= 5, `${posee.length} power nodes`);
  for (let i = 1; i < posee.length; i++) {
    const ecart = Math.max(Math.abs(posee[i].x - posee[i - 1].x),
                           Math.abs(posee[i].y - posee[i - 1].y));
    assert.ok(ecart <= 6, `two power nodes ${ecart} tiles apart no longer see each other`);
  }
});

test("calculateNodes keeps the first and the last, no matter what", () => {
  const points = [at(0, 0), at(1, 0), at(2, 0), at(3, 0)];
  const noeuds = calculateNodes(points, (a, b) => Math.abs(a.x - b.x) <= 2);
  assert.deepEqual(noeuds[0], at(0, 0));
  assert.deepEqual(noeuds[noeuds.length - 1], at(3, 0));
});

/* --- `Placement.upgradeLine`: following an existing chain -------------------------------- */

test("dragging over an existing line follows it instead of cutting through it", () => {
  /* The move that replaces a whole line of conveyors with titanium ones in one drag,
     hugging its turns. Tracing straight would cut through the factory. */
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 1 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 2, block: "conveyor", rotation: 1 },
  ] });
  const suivi = upgradeLine(at(0, 0), at(2, 2), plateau);
  assert.deepEqual(suivi.map((p) => [p.x, p.y]),
                   [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
});

test("a chain that does not lead to the target is not followed", () => {
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
  ] });
  assert.equal(upgradeLine(at(0, 0), at(9, 9), plateau), null);
});

test("a chain that loops around does not loop forever", () => {
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 2 },
  ] });
  assert.equal(upgradeLine(at(0, 0), at(5, 5), plateau), null);
});

test("in diagonal mode, the drag still follows the chain when there is one", () => {
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 1 },
    { x: 1, y: 1, block: "conveyor", rotation: 1 },
  ] });
  const posee = line(at(0, 0), at(1, 1), "titanium-conveyor", 0,
                     { diagonal: true, board: plateau });
  assert.deepEqual(cells(posee), [[0, 0], [1, 0], [1, 1]]);
});

/* --- Edge cases -------------------------------------------------------------------------- */

test("a one-tile drag places a single block", () => {
  const posee = line(at(2, 2), at(2, 2), "conveyor", 3);
  assert.equal(posee.length, 1);
  assert.equal(posee[0].rotation, 3, "nothing indicates a direction, the held rotation decides");
});

test("a block that does not rotate comes out at zero, whatever the held rotation", () => {
  /* `Block.planRotation`: `!rotate && lockRotation ? 0 : rot`. A press does not rotate and
     `lockRotation` is true for every block in the game, so it always comes out at zero.

     This test used to expect the opposite, and the code was right: keeping the held
     rotation on a block that does not rotate would write into the file a value the game
     would reset to zero, so a schematic that does not round-trip identically. */
  assert.deepEqual(line(at(0, 0), at(4, 0), "graphite-press", 3).map((t) => t.rotation),
                   [0, 0, 0]);
});

test("a block that ignores the drag direction keeps the held rotation", () => {
  /* `ignoreLineRotation`, carried by thirty blocks: a beam drill or a turret rotates, but
     must not spin around just because the drag went to the right. Without this flag,
     placing a row of beam drills makes them all aim at their neighbor instead of the wall
     that was chosen for them. */
  assert.equal(known.blocks["plasma-bore"].ignore_line_rotation, true);
  assert.deepEqual(line(at(0, 0), at(6, 0), "plasma-bore", 3).map((t) => t.rotation),
                   [3, 3, 3, 3]);
  // A belt, on the other hand, does follow the drag.
  assert.deepEqual(line(at(0, 0), at(2, 0), "conveyor", 3).map((t) => t.rotation), [0, 0, 0]);
});

test("a large block spaces itself by its size instead of destroying itself", () => {
  /* A press is two tiles to a side. Placed tile by tile, each copy would cover the
     previous one and make it disappear: after a ten-tile drag only one press would
     remain. Three copies over a four-tile drag, then, not five. */
  assert.deepEqual(cells(line(at(0, 0), at(4, 0), "graphite-press")),
                   [[0, 0], [2, 0], [4, 0]]);
});

test("every tile is placed only once", () => {
  const posee = line(at(0, 0), at(6, 6), "conveyor", 0, { diagonal: true });
  assert.equal(new Set(posee.map((t) => `${t.x},${t.y}`)).size, posee.length);
});

test("a duct bridge configures nothing, it just looks straight ahead", () => {
  /* The game has two bridge families and they do not link the same way. `ItemBridge`
     stores the offset to its target in its config; `DirectionBridge`, which the duct
     bridge and the reinforced duct come from, configures nothing and sweeps straight
     ahead up to its range. Giving all of them a config would write into the file a link
     the game ignores. */
  const gaines = line(at(0, 0), at(8, 0), "duct-bridge");
  assert.deepEqual(cells(gaines), [[0, 0], [4, 0], [8, 0]], "the spacing stays the one from the range");
  for (const gaine of gaines) assert.equal(gaine.config, undefined);
  assert.deepEqual(gaines.map((g) => g.rotation), [0, 0, 0], "they face the next one");

  const ponts = line(at(0, 0), at(8, 0), "bridge-conveyor");
  assert.deepEqual(ponts[0].config, { type: 7, dx: 4, dy: 0 });
});

test("in diagonal mode, a belt routes around what is already there", () => {
  /* The game's `pathfindLine`: an A* for blocks with `conveyorPlacement`. A factory in the
     middle of the passage gets routed around instead of crushed, and that is what makes
     it possible to run a belt from one end of a base to the other without tearing it
     down. */
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 2, y: 0, block: "graphite-press", rotation: 0 },
  ] });
  const posee = line(at(0, 0), at(6, 0), "conveyor", 0, { diagonal: true, board: plateau });
  const dessus = posee.filter((p) => p.x >= 2 && p.x <= 3 && p.y >= 0 && p.y <= 1);
  assert.equal(dessus.length, 0, "the line goes through the press");
  assert.deepEqual([posee[posee.length - 1].x, posee[posee.length - 1].y], [6, 0]);
});
