/**
 * Ce qui est posé, ce qui est peint, et ce qu'on peut défaire.
 *
 * Un geste est une entrée d'historique, pas un bloc. Une ligne de trente convoyeurs se
 * défait d'un coup, parce que c'est d'un coup qu'elle a été tracée. L'inverse oblige à
 * marteler ctrl+Z trente fois pour réparer un glissé raté, ce qui n'est pas une annulation
 * mais une punition.
 *
 * Une entrée garde **ce qui a changé**, pas une photo du plateau : les blocs retirés, les
 * blocs ajoutés, et le sol d'avant des seules cases repeintes. Une copie complète par
 * geste sur un plateau de quatre mille blocs coûterait un mégaoctet par clic, pour une
 * information dont on n'utilise que la différence.
 *
 * La limite de 64 est `Vars.maxSchematicSize` de la v159.7. Elle porte sur la boîte
 * englobante, murs des gros blocs compris, et pas sur le nombre de blocs.
 */

export const MAX_SIZE = 64;

/**
 * Toutes les cases qu'un bloc couvre.
 *
 * Mindustry range un bloc par son centre et décale de `-(taille - 1) / 2`, tronqué. Une
 * foreuse de deux rangée en (5, 5) couvre donc (5, 5) à (6, 6), et non (4, 4) à (5, 5).
 * Mesurer sur la position rangée plutôt que sur l'empreinte est ce qui fait sortir la
 * moitié d'un gros bloc de sa propre boîte.
 */
export function footprint(tile, sizeOf) {
  const size = sizeOf(tile.block) || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  const cells = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      cells.push([tile.x + offset + dx, tile.y + offset + dy]);
    }
  }
  return cells;
}

/** La boîte englobante d'une liste de blocs, mesurée sur ce qu'ils couvrent. */
export function boxOf(tiles, sizeOf) {
  if (!tiles.length) return { left: 0, bottom: 0, width: 0, height: 0 };
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const tile of tiles) {
    for (const [x, y] of footprint(tile, sizeOf)) {
      if (x < left) left = x;
      if (y < bottom) bottom = y;
      if (x > right) right = x;
      if (y > top) top = y;
    }
  }
  return { left, bottom, width: right - left + 1, height: top - bottom + 1 };
}

const key = (x, y) => `${x},${y}`;

export function createBoard({ tiles = [], ground = {}, sizeOf }) {
  const board = {
    tiles: tiles.map((tile) => ({ rotation: 0, ...tile })),
    ground: { ...ground },
    /* Ce qui a été fait, et ce qui a été défait et pourrait être refait. */
    done: [],
    undone: [],
  };

  /** Les cases qu'un bloc couvre, en clés de sol. */
  const cellsOf = (tile) => footprint(tile, sizeOf).map(([x, y]) => key(x, y));

  board.at = (x, y) => board.tiles.find(
    (tile) => cellsOf(tile).includes(key(x, y))) || null;

  board.box = () => boxOf(board.tiles, sizeOf);

  board.fits = (plan) => {
    const box = boxOf([...board.tiles, plan], sizeOf);
    return box.width <= MAX_SIZE && box.height <= MAX_SIZE;
  };

  /**
   * Applique un geste et l'empile.
   *
   * `change` vaut `{ place, remove, paint }`, chacun facultatif. Un `paint` à `null` sur
   * une case l'efface, au lieu de la laisser vide : une case vide et une case absente se
   * dessinent pareil mais ne se lisent pas pareil, et les règles de sol ne s'appliquent
   * qu'aux cases décrites.
   *
   * Rend `false` si le geste ne changeait rien, auquel cas rien n'est empilé : un clic qui
   * n'a rien fait ne doit pas consommer un ctrl+Z.
   */
  board.apply = ({ place = [], remove = [], paint = null }) => {
    const plans = place.map((plan) => ({ rotation: 0, ...plan }));

    /* Ce qu'une pose chasse : tout ce que son empreinte touche, et pas seulement le bloc
       rangé sur la même case. Une foreuse de deux posée sur quatre convoyeurs en retire
       quatre ; n'en retirer qu'un laissait trois fantômes sous elle, invisibles à l'écran
       et bien présents dans le fichier exporté. */
    const covered = new Set(plans.flatMap(cellsOf));
    const chased = board.tiles.filter(
      (tile) => cellsOf(tile).some((cell) => covered.has(cell)));
    const removed = [...new Set([...remove, ...chased])];

    const before = {};
    if (paint) {
      for (const cell of Object.keys(paint)) before[cell] = board.ground[cell];
    }

    if (!plans.length && !removed.length && !paint) return false;

    board.tiles = board.tiles.filter((tile) => !removed.includes(tile)).concat(plans);
    if (paint) applyPaint(board.ground, paint);

    board.done.push({ removed, added: plans, before, paint });
    board.undone.length = 0;
    return true;
  };

  board.undo = () => {
    const entry = board.done.pop();
    if (!entry) return false;
    board.tiles = board.tiles
      .filter((tile) => !entry.added.includes(tile))
      .concat(entry.removed);
    restore(board.ground, entry.before);
    board.undone.push(entry);
    return true;
  };

  board.redo = () => {
    const entry = board.undone.pop();
    if (!entry) return false;
    board.tiles = board.tiles
      .filter((tile) => !entry.removed.includes(tile))
      .concat(entry.added);
    if (entry.paint) applyPaint(board.ground, entry.paint);
    board.done.push(entry);
    return true;
  };

  return board;
}

/** Peindre : un minerai va **par dessus** le sol, comme le jeu empile ses couches. */
function applyPaint(ground, paint) {
  for (const [cell, layers] of Object.entries(paint)) {
    if (layers === null) delete ground[cell];
    else ground[cell] = { ...ground[cell], ...layers };
  }
}

/** Remettre le sol d'avant, en distinguant « c'était vide » de « c'était autre chose ». */
function restore(ground, before) {
  for (const [cell, layers] of Object.entries(before)) {
    if (layers === undefined) delete ground[cell];
    else ground[cell] = layers;
  }
}
