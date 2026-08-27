/**
 * Ce qu'on fait d'un groupe de blocs une fois qu'il est sélectionné.
 *
 * Tourner une sélection n'est pas tourner chaque bloc sur place : les **positions** tournent
 * aussi, autour de la boîte. Confondre les deux donne une sélection qui explose dès le
 * premier quart de tour, chaque bloc restant là où il était avec un sprite tourné.
 *
 * Les rotations sont celles du jeu, comptées dans le sens antihoraire depuis l'est : 0 est,
 * 1 nord, 2 ouest, 3 sud. Un quart de tour positif tourne donc dans ce sens là.
 *
 * Un gros bloc se range par son centre, avec le décalage `-(taille - 1) / 2` tronqué. Ce
 * n'est pas son centre qu'il faut tourner mais son empreinte, sinon une foreuse de deux
 * sort de la boîte d'une demi case à chaque quart de tour et le quatrième ne rend pas la
 * sélection de départ.
 */

import { boxOf, footprint } from "./state.js";

/** Le coin bas gauche de l'empreinte d'un bloc, et sa taille. */
function corner(tile, sizeOf) {
  const size = sizeOf(tile.block) || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  return { cx: tile.x + offset, cy: tile.y + offset, size, offset };
}

/** Les blocs dont l'empreinte touche la boîte, même d'une seule case. */
export function inBox(tiles, box, sizeOf) {
  return tiles.filter((tile) => footprint(tile, sizeOf).some(([x, y]) =>
    x >= box.left && x < box.left + box.width
    && y >= box.bottom && y < box.bottom + box.height));
}

/** Déplacer, ce qui est le seul cas où rien d'autre ne change. */
export function translate(tiles, dx, dy) {
  return tiles.map((tile) => ({ ...tile, x: tile.x + dx, y: tile.y + dy }));
}

/**
 * Tourner la sélection d'un ou plusieurs quarts de tour.
 *
 * La boîte est mesurée sur les blocs, la rotation se fait en coordonnées relatives à son
 * coin bas gauche, et la boîte tournée est reposée à ce même coin. Quatre quarts de tour
 * rendent donc exactement la sélection de départ, ce qu'un test vérifie.
 */
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
      /* Antihoraire : la colonne devient la ligne, et la ligne devient la colonne comptée
         depuis l'autre bord. Le `- (size - 1)` prend l'empreinte par son autre coin, celui
         qui devient le coin bas gauche après le quart de tour. */
      const nx = box.height - 1 - (ry + size - 1);
      const ny = rx;
      return {
        ...tile,
        x: box.left + nx - offset,
        y: box.bottom + ny - offset,
        rotation: catalogue.blocks[tile.block]?.rotate
          ? ((tile.rotation || 0) + 1) % 4 : (tile.rotation || 0),
      };
    });
  }
  return out;
}

/**
 * Retourner la sélection en miroir, sur l'axe `"x"` (gauche-droite) ou `"y"` (haut-bas).
 *
 * La rotation se reflète elle aussi : sur l'axe X, l'est devient l'ouest et le nord ne
 * bouge pas. Retourner les positions sans retourner les rotations donne une copie miroir
 * dont toutes les bandes coulent à l'envers, ce qui se voit à l'usage et pas à l'image.
 */
export function flip(tiles, axis, catalogue) {
  if (!tiles.length) return [];
  const sizeOf = (name) => catalogue.blocks[name]?.size || 1;
  const box = boxOf(tiles, sizeOf);
  const mirror = axis === "x" ? [2, 1, 0, 3] : [0, 3, 2, 1];

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
      rotation: catalogue.blocks[tile.block]?.rotate
        ? mirror[(tile.rotation || 0) % 4] : (tile.rotation || 0),
    };
  });
}
