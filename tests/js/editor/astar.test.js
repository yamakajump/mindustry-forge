/**
 * Le trace qui contourne, transcrit de `Placement.astar` de la v159.7.
 *
 * Une usine au milieu du passage se contourne au lieu de se faire ecraser. Le virage a 8
 * est le detail qui compte : sans lui, le chemin rend un escalier en marches d un pas, joli
 * sur le papier et catastrophique en convoyeurs, chaque virage coutant un objet de debit.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { astar } from "../../../site/public/forge/editor/astar.js";

const bounds = { left: -20, right: 20, bottom: -20, top: 20 };
const chemin = (from, to, blocked = () => false) =>
  astar(from, to, { blocked, bounds });
const cases = (path) => path?.map((p) => [p.x, p.y]);

test("sans obstacle, le chemin va tout droit", () => {
  /* C est le virage a 8 qui le garantit : a cout de case egal, tourner coute huit fois
     plus cher que continuer, donc le chemin ne tourne que lorsqu il y est force. */
  assert.deepEqual(cases(chemin({ x: 0, y: 0 }, { x: 4, y: 0 })),
                   [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test("un chemin en diagonale ne fait qu un coude", () => {
  const path = chemin({ x: 0, y: 0 }, { x: 3, y: 3 });
  const virages = path.filter((p, i) => i > 0 && i < path.length - 1
    && Math.sign(p.x - path[i - 1].x) !== Math.sign(path[i + 1].x - p.x));
  assert.ok(virages.length <= 1, `${virages.length} virages, un seul suffit`);
  assert.deepEqual(cases(path)[path.length - 1], [3, 3]);
});

test("une usine au milieu se contourne au lieu de se faire ecraser", () => {
  // Un mur vertical de trois cases, perce nulle part : le chemin doit passer autour.
  const mur = new Set(["2,-1", "2,0", "2,1"]);
  const path = chemin({ x: 0, y: 0 }, { x: 4, y: 0 }, (x, y) => mur.has(`${x},${y}`));
  assert.ok(path, "aucun chemin trouve");
  assert.deepEqual(cases(path)[path.length - 1], [4, 0]);
  const traverse = path.filter((p) => mur.has(`${p.x},${p.y}`));
  assert.equal(traverse.length, 0, "le chemin passe au travers du mur");
});

test("un obstacle infranchissable se traverse quand meme, faute de mieux", () => {
  /* Le jeu ne rend pas une case occupee interdite, il la rend chere : vingt contre un.
     Enfermer le depart doit donner un chemin qui coute, pas une absence de chemin. */
  const partout = () => true;
  const path = chemin({ x: 0, y: 0 }, { x: 3, y: 0 }, partout);
  assert.ok(path, "un chemin cher reste un chemin");
  assert.deepEqual(cases(path)[path.length - 1], [3, 0]);
});

test("le depart et l arrivee confondus donnent une seule case", () => {
  assert.deepEqual(cases(chemin({ x: 2, y: 2 }, { x: 2, y: 2 })), [[2, 2]]);
});

test("chaque pas est orthogonal, jamais en diagonale", () => {
  const path = chemin({ x: 0, y: 0 }, { x: 5, y: 4 });
  for (let i = 1; i < path.length; i++) {
    const pas = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    assert.equal(pas, 1, `saut de ${pas} entre ${i - 1} et ${i}`);
  }
});

test("hors des bornes, la recherche renonce plutot que de partir a l infini", () => {
  // Le jeu n en a pas besoin, sa carte a des bords ; ici le terrain est infini.
  assert.equal(astar({ x: 0, y: 0 }, { x: 500, y: 0 },
                     { blocked: () => false, bounds }), null);
});
