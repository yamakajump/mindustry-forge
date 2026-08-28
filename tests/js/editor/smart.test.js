/**
 * What the game decides on the player's behalf when they trace a line.
 *
 * The two mechanics that let you trace through your own factory without thinking about
 * it: the junction at a crossing, and the bridge that clears an obstacle on its own.
 * Transcribed from `Conveyor.getReplacement` and `Placement.smartCalculateBridges` in
 * v159.7.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { blockerOf, isSidePlace, withBridges, withJunctions }
  from "../../../site/public/forge/editor/smart.js";
import { createBoard } from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });
const bande = (x, y, rotation = 0) => ({ x, y, block: "conveyor", rotation });
const ligne = (from, to, y = 0, rotation = 0) => {
  const out = [];
  for (let x = from; x <= to; x++) out.push(bande(x, y, rotation));
  return out;
};

/* --- The junction at a crossing --------------------------------------------------------- */

test("crossing a perpendicular line places a junction", () => {
  // A vertical belt at (2, 0), and a horizontal line traced across it.
  const plateau = board([bande(2, 0, 1)]);
  const posee = withJunctions(ligne(0, 4), plateau, known);
  assert.equal(posee[2].block, "junction");
  assert.deepEqual(posee.filter((p) => p.block === "junction").length, 1);
});

test("a junction is not placed at the end of the line", () => {
  /* The game's rule requires the line to continue on BOTH SIDES: at the end, there is
     nothing to cross, and a terminal junction would just be one conveyor short. */
  const plateau = board([bande(4, 0, 1)]);
  const posee = withJunctions(ligne(0, 4), plateau, known);
  assert.equal(posee[4].block, "conveyor");
});

test("a conveyor facing the same way gets replaced, it does not become a junction", () => {
  const plateau = board([bande(2, 0, 0)]);
  const posee = withJunctions(ligne(0, 4), plateau, known);
  assert.equal(posee[2].block, "conveyor");
});

test("a conveyor facing the opposite way is not a crossing either", () => {
  // Rotation 2 against 0: two quarter turns apart, so not perpendicular.
  const plateau = board([bande(2, 0, 2)]);
  assert.equal(withJunctions(ligne(0, 4), plateau, known)[2].block, "conveyor");
});

test("an empty tile stays a conveyor", () => {
  const posee = withJunctions(ligne(0, 4), board(), known);
  assert.equal(posee.every((p) => p.block === "conveyor"), true);
});

test("a block with no junction replacement never places one", () => {
  // An Erekir duct has no `junctionReplacement` in the game.
  const plateau = board([{ x: 2, y: 0, block: "duct", rotation: 1 }]);
  const gaines = ligne(0, 4).map((p) => ({ ...p, block: "duct" }));
  assert.equal(withJunctions(gaines, plateau, known).every((p) => p.block === "duct"), true);
});

/* --- The side-placement guard ------------------------------------------------------------ */

test("a line placed sideways is left alone", () => {
  /* The first block faces north while the line runs east: this is not a line being
     extended, it's an input being connected. */
  assert.equal(isSidePlace(ligne(0, 4, 0, 1)), true);
  assert.equal(isSidePlace(ligne(0, 4, 0, 0)), false);
});

/* --- Automatic bridges ------------------------------------------------------------------- */

const franchir = (plans, plateau, block = "conveyor") => withBridges(plans, {
  blocked: blockerOf(plateau, known, block),
  reach: known.blocks[known.blocks[block].bridge_replacement].range,
  bridge: known.blocks[block].bridge_replacement,
});

test("with no obstacle, the line stays a line", () => {
  const posee = franchir(ligne(0, 6), board());
  assert.equal(posee.every((p) => p.block === "conveyor"), true);
});

test("a press in the middle of the line gets cleared with a bridge", () => {
  /* The move the game makes on the player's behalf: the line hits a block it cannot
     replace, and two bridges appear on either side to jump over it. */
  const plateau = board([{ x: 3, y: 0, block: "graphite-press", rotation: 0 }]);
  const posee = franchir(ligne(0, 6), plateau);
  const ponts = posee.filter((p) => p.block === "bridge-conveyor");
  assert.ok(ponts.length >= 2, `${ponts.length} bridge(s), at least two are needed`);
  const vise = ponts.find((p) => p.config);
  assert.ok(vise, "no bridge targets its counterpart");
  assert.equal(vise.config.type, 7);
});

test("a bridge does not open for nothing: an obstacle out of range leaves the line", () => {
  /* A belt bridge's range is four. A six-tile wall cannot be jumped, so the calculation
     must not fabricate an impossible bridge. */
  const mur = [];
  for (let x = 2; x <= 7; x++) mur.push({ x, y: 0, block: "graphite-press", rotation: 0 });
  const posee = franchir(ligne(0, 10), board(mur));
  const ponts = posee.filter((p) => p.block === "bridge-conveyor");
  for (const pont of ponts) {
    if (!pont.config) continue;
    const far = Math.max(Math.abs(pont.config.dx), Math.abs(pont.config.dy));
    assert.ok(far <= 4, `a bridge targets ${far} tiles away, its range is four`);
  }
});

test("the bridge prefers the shortest jump", () => {
  /* The per-empty-tile penalty is what prevents this: without it, a range-four bridge
     would always jump four, even to clear a single tile. */
  const plateau = board([{ x: 3, y: 0, block: "graphite-press", rotation: 0 }]);
  const posee = franchir(ligne(0, 8), plateau);
  const vise = posee.find((p) => p.config);
  const saut = Math.max(Math.abs(vise.config.dx), Math.abs(vise.config.dy));
  assert.ok(saut <= 3, `${saut}-tile jump to clear a size-two press`);
});

test("a line that is not straight is left untouched", () => {
  // The game only computes bridges over an orthogonal line.
  const coude = [bande(0, 0), bande(1, 0), bande(1, 1)];
  assert.deepEqual(withBridges(coude, { blocked: () => true, reach: 4, bridge: "bridge-conveyor" }),
                   coude);
});

test("a terrain wall blocks like a block does", () => {
  const plateau = board([], { "3,0": { floor: "stone", wall: "stone-wall" } });
  const gene = blockerOf(plateau, known, "conveyor");
  assert.equal(gene(3, 0), true);
  assert.equal(gene(2, 0), false);
});

test("a deep liquid blocks, except for what floats", () => {
  const plateau = board([], { "3,0": { floor: "deep-water" } });
  assert.equal(blockerOf(plateau, known, "conveyor")(3, 0), true);
  assert.equal(blockerOf(plateau, known, "thermal-generator")(3, 0), false);
});

test("a conveyor from the same group does not block, it gets replaced", () => {
  const plateau = board([bande(3, 0)]);
  assert.equal(blockerOf(plateau, known, "titanium-conveyor")(3, 0), false);
});

test("a junction only crosses a transporter, not a press", () => {
  /* The guard that makes the bridge possible. The game's `avoid` is
     `b instanceof Conveyor`: a junction only gets placed to cross a transporter. Without
     it, the calculation let an imaginary junction cross through a press for 30, against
     200 for a bridge, and no bridge ever won. Measured before the fix: seventeen
     conveyors and zero bridges over a line cut by a press. */
  const plateau = board([{ x: 3, y: 0, block: "graphite-press", rotation: 0 }]);
  const avec = withBridges(ligne(0, 8), {
    blocked: blockerOf(plateau, known, "conveyor"),
    reach: 4, bridge: "bridge-conveyor", hasJunction: true,
    avoid: (x, y) => {
      const under = plateau.at(x, y);
      return Boolean(under && known.blocks[under.block]?.conveyor_placement);
    },
  });
  assert.ok(avec.some((p) => p.block === "bridge-conveyor"),
            "a press must be cleared with a bridge");

  // And without the guard, the press let itself be crossed: the bridge never won.
  const sans = withBridges(ligne(0, 8), {
    blocked: blockerOf(plateau, known, "conveyor"),
    reach: 4, bridge: "bridge-conveyor", hasJunction: true,
    avoid: () => true,
  });
  assert.equal(sans.some((p) => p.block === "bridge-conveyor"), false);
});
