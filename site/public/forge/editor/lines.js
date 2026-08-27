/**
 * Ce qu'un glissé pose, d'après `Placement.calculateNodes` de la v159.7.
 *
 * Deux comportements, et le jeu choisit entre les deux avec un seul drapeau,
 * `Block.conveyorPlacement` :
 *
 * - **Les transporteurs** (bandes, conduits, gaines) suivent un **L à un coude**. Le
 *   premier segment part sur l'axe où le glissé est le plus long, le second termine. Chaque
 *   bloc prend la rotation qui regarde la case suivante, ce qui fait qu'une ligne tracée
 *   est une ligne qui marche, coude compris.
 * - **Tout le reste** se pose sur une **ligne droite**, sur ce même axe dominant, espacée
 *   de la taille du bloc pour que deux voisins ne se recouvrent pas.
 *
 * Sans ça, une ligne de trente convoyeurs coûte trente clics pour les poser et quatre-vingt
 * dix pour les orienter un par un. C'est très exactement ce que l'éditeur d'avant demandait,
 * et c'est pour ça que personne ne s'en servait.
 */

import { DIRECTIONS } from "../engine/core.js";

/** La rotation du jeu qui va de `a` vers `b`, ou `null` si les deux cases se confondent. */
function facing(a, b) {
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const found = DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
  return found === -1 ? null : found;
}

/** Les cases d'un segment, de `from` exclu à `to` inclus, par pas de `step`. */
function segment(from, to, axis, step) {
  const cells = [];
  const span = to[axis] - from[axis];
  const way = Math.sign(span);
  for (let i = step; i <= Math.abs(span); i += step) {
    const cell = [...from];
    cell[axis] = from[axis] + i * way;
    cells.push(cell);
  }
  return cells;
}

/**
 * Les blocs qu'un glissé de `from` à `to` pose.
 *
 * `rotation` est celle du bloc en main : elle sert quand rien dans le geste n'indique de
 * direction, c'est à dire pour un bloc qui ne trace pas en L, et pour un glissé qui n'a
 * pas bougé d'une case.
 */
export function lineOf(from, to, block, catalogue, rotation = 0) {
  const known = catalogue.blocks[block] || {};
  const size = known.size || 1;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  /* L'axe dominant, et l'égalité qui va à l'horizontale. Il faut trancher quelque part, et
     un glissé parfaitement diagonal est le seul cas où les deux réponses se valent. */
  const axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;

  const start = [from.x, from.y];
  let cells;

  if (known.conveyor_placement) {
    /* Le L : jusqu'au coude sur l'axe dominant, puis le reste sur l'autre. Un transporteur
       fait toujours une case de côté, donc le pas vaut un et le coude tombe juste. */
    const corner = [from.x, from.y];
    corner[axis] = to[axis === 0 ? "x" : "y"];
    cells = [start, ...segment(start, corner, axis, 1),
             ...segment(corner, [to.x, to.y], 1 - axis, 1)];
  } else {
    cells = [start, ...segment(start, [to.x, to.y], axis, size)];
  }

  return cells.map((cell, i) => ({
    x: cell[0],
    y: cell[1],
    block,
    /* Un transporteur regarde la case d'après ; le dernier garde le cap de son segment,
       sinon la ligne se termine par une bande tournée au hasard qui renvoie tout en
       arrière. Un bloc qui ne trace pas en L garde la rotation qu'il avait en main. */
    rotation: known.conveyor_placement
      ? (i + 1 < cells.length ? facing(cell, cells[i + 1]) : lastFacing(cells, rotation))
      : rotation,
  }));
}

/** Le cap du dernier bloc : celui du segment qui vient de l'amener là. */
function lastFacing(cells, fallback) {
  if (cells.length < 2) return fallback;
  const heading = facing(cells[cells.length - 2], cells[cells.length - 1]);
  return heading === null ? fallback : heading;
}
