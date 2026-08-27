/**
 * Ce qu'un glissé pose, transcrit de `InputHandler.iterateLine` et de `Placement` de la
 * v159.7.
 *
 * La première version de ce fichier inventait un coude en L, sur la foi du souvenir qu'on
 * a de la pose de convoyeurs. **Ce coude n'existe nulle part dans le jeu.** Voici ce qui
 * existe vraiment, dans l'ordre où `iterateLine` en décide :
 *
 *     diagonal = touche « placement diagonal » enfoncée
 *     si bloc.swapDiagonalPlacement            -> diagonal = !diagonal
 *
 *     si diagonal et bloc.allowDiagonal
 *         si départ et arrivée sont une chaîne que le bloc peut remplacer
 *                                              -> upgradeLine : suivre la chaîne existante
 *         sinon                                -> pathfindLine : escalier de Bresenham,
 *                                                 ou A* pour les blocs conveyorPlacement
 *     sinon si bloc.allowRectanglePlacement    -> normalizeRectangle, espacé de la taille
 *     sinon                                    -> normalizeLine : ligne DROITE, axe dominant
 *
 *     puis bloc.changePlacementPath(points)    -> les ponts espacent leurs nœuds de leur portée
 *     puis bloc.handlePlacementLine(plans)     -> les ponts se lient au suivant
 *
 * Les deux dernières lignes sont ce qui fait qu'un glissé de ponts, dans le jeu, produit
 * une chaîne de ponts liés et non une file de ponts collés qui ne se parlent pas.
 */

import { DIRECTIONS } from "../engine/core.js";
import { blockerOf, withBridges, withJunctions } from "./smart.js";

/** La rotation du jeu qui va de `a` vers `b`, ou `null` si les deux cases se confondent. */
function facing(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  const found = DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
  return found === -1 ? null : found;
}

/**
 * `Placement.normalizeLine` : une ligne droite sur l'axe où le glissé est le plus long.
 *
 * C'est le tracé **par défaut**, celui qu'on obtient sans toucher à aucune touche, et donc
 * de très loin le plus utilisé.
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
 * `Placement.normalizeRectangle` : remplir toute la **zone**, pas une ligne.
 *
 * C'est le geste qui pose un pan de mur de vingt blocs d'un coup, et il concerne 139 blocs
 * du jeu. Le pas vaut la taille du bloc, sinon chaque bloc posé détruit le précédent et il
 * ne reste qu'une seule case au bout du geste.
 *
 * Le nom prête à confusion et j'y suis tombé : « rectangle » ici veut dire une surface
 * remplie, et non le contour d'un rectangle. Lu dans la source plutôt que deviné.
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
 * `Bresenham2.lineNoDiagonal` : l'escalier qui colle à la vraie diagonale.
 *
 * Un pas sur un seul axe à la fois, jamais les deux ensemble, sinon deux convoyeurs se
 * toucheraient par le coin et ne se passeraient rien.
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
    /* Le `else if` est tout le sujet : avec deux `if`, les deux axes avancent sur la même
       itération et la ligne se met à sauter en diagonale. */
    if (twice >= dy) { error += dy; x += sx; }
    else if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

/**
 * `Placement.upgradeLine` : suivre une chaîne déjà posée au lieu de tracer à travers.
 *
 * C'est le geste qui remplace une ligne de convoyeurs par des convoyeurs titane en un
 * glissé, en épousant ses virages. Tracer droit à la place couperait à travers l'usine.
 *
 * Le jeu suit `ChainedBuilding.next()`. Ici on n'a pas de bâtiments, on a des tuiles : la
 * chaîne se suit en allant de proche en proche dans le sens de chaque bloc.
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
 * `Placement.calculateNodes` : ne garder que les nœuds qui se voient encore.
 *
 * Parcourt les points et, depuis chacun, saute au **plus lointain** qui reste à portée.
 * C'est ce qui fait qu'un glissé de ponts sur douze cases pose deux ponts et non douze, et
 * que la portée d'un conduit de phase, de douze cases, se sent vraiment à l'usage.
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

/** La portée d'un bloc en tuiles, qu'il la range dans `range` ou dans `laser_range`. */
export function reachOf(block) {
  if (block?.range) return block.range;
  if (block?.laser_range) return Math.floor(block.laser_range);
  return 0;
}

/** Un bloc qui saute par dessus le terrain : pont, gaine à pont, pylône. */
export function jumps(block) {
  const kind = block?.kind || "";
  return kind.includes("Bridge") || kind === "PowerNode" || kind === "BeamNode";
}

/**
 * Un pont qui **retient** sa cible, par opposition à un qui la cherche devant lui.
 *
 * Le jeu a deux familles et elles ne se lient pas pareil. `ItemBridge` et `LiquidBridge`
 * gardent le décalage vers leur cible dans leur configuration, et c'est
 * `handlePlacementLine` qui le pose. `DirectionBridge`, dont sortent la gaine à pont et le
 * conduit renforcé, ne configure rien du tout : son `findLink()` balaie droit devant lui,
 * dans le sens où il est tourné, jusqu'à sa portée.
 *
 * Leur donner à tous une configuration reviendrait à écrire dans le fichier une liaison que
 * le jeu ignore, et à laisser une gaine tournée n'importe comment se prétendre reliée.
 */
export function linksByConfig(block) {
  const kind = block?.kind || "";
  return kind.includes("Bridge") && !kind.includes("Direction") && !kind.includes("Duct");
}

/**
 * Les blocs qu'un glissé de `from` à `to` pose.
 *
 * `diagonal` est l'état de la touche « placement diagonal ». `board` sert à `upgradeLine`,
 * qui a besoin de savoir ce qui est déjà là ; sans plateau, ce mode est simplement sauté.
 */
export function lineOf(from, to, block, catalogue, rotation = 0,
                       { diagonal = false, board = null } = {}) {
  const known = catalogue.blocks[block] || {};
  const size = known.size || 1;

  /* Quelques blocs inversent le basculement pour que leur comportement le plus utile soit
     celui qu'on obtient sans rien enfoncer. Les pylônes en font partie : on les veut
     presque toujours en escalier. */
  let wants = diagonal;
  if (known.swap_diagonal_placement) wants = !wants;

  let points;
  if (wants && known.allow_diagonal !== false) {
    const chain = board ? upgradeLine(from, to, board) : null;
    points = chain || bresenham(from, to);
  } else if (known.allow_rectangle_placement) {
    points = normalizeRectangle(from, to, size);
  } else {
    points = normalizeLine(from, to);
  }

  /* `changePlacementPath` : les blocs qui portent loin ne se posent pas case par case, ils
     se posent aussi loin qu'ils se voient encore. */
  const reach = reachOf(known);
  if (jumps(known) && reach > 0) {
    points = calculateNodes(points,
      (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= reach);
  } else if (size > 1 && !known.allow_rectangle_placement) {
    /* Un gros bloc posé case par case se détruit lui-même à chaque pas. Le jeu l'évite par
       `allowRectanglePlacement` là où il l'a réglé ; ailleurs, l'espacer de sa taille est
       la seule lecture qui ne jette pas la moitié du geste. */
    points = points.filter((_, i) => i % size === 0);
  }

  /* `planRotation` du jeu : un bloc qui ne tourne pas et que `lockRotation` verrouille
     sort toujours a zero, quoi que la main tienne. Et `ignoreLineRotation` dit qu un bloc
     ne suit pas le sens du glisse, meme s il tourne. */
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

  /* Ce que le jeu decide a la place du joueur, et qui demande de savoir ce qui est deja
     pose : la jonction au croisement, puis les ponts qui franchissent un obstacle. */
  if (board) {
    if (known.junction_replacement) plans = withJunctions(plans, board, catalogue);
    const relay = known.bridge_replacement && catalogue.blocks[known.bridge_replacement];
    if (relay) {
      plans = withBridges(plans, {
        blocked: blockerOf(board, catalogue, block),
        reach: reachOf(relay),
        bridge: known.bridge_replacement,
        hasJunction: Boolean(known.junction_replacement),
        /* Ce qu'une jonction sait traverser. Le jeu passe `b -> b instanceof Conveyor`
           pour une bande et `b -> b instanceof Duct || b instanceof Conveyor` pour une
           gaine ; `conveyor_placement` est le drapeau publié qui recouvre les deux
           familles, et c'est celui qu'on lit plutôt que de tester des noms de classes. */
        avoid: (x, y) => {
          const under = board.at(x, y);
          return Boolean(under && catalogue.blocks[under.block]?.conveyor_placement);
        },
      });
    }
  }

  /* `handlePlacementLine` : chaque pont reçoit en configuration le décalage vers le
     suivant. C'est ce qui fait qu'un glissé de ponts donne une chaîne qui transporte, et
     non une file de ponts qui s'ignorent. */
  if (linksByConfig(known) && reach > 0) {
    for (let i = 0; i < plans.length - 1; i++) {
      const here = plans[i];
      const next = plans[i + 1];
      if (Math.max(Math.abs(here.x - next.x), Math.abs(here.y - next.y)) <= reach) {
        /* Le type 7 du format est un point relatif écrit en deux entiers. C'est la forme
           que `schematic.js` lit et écrit, et que `analyse.js` suit pour tracer le lien :
           inventer une autre forme ici aurait donné trois idées différentes du même lien. */
        here.config = { type: 7, dx: next.x - here.x, dy: next.y - here.y };
      }
    }
  }
  return plans;
}

/** Le cap du dernier bloc : celui du segment qui vient de l'amener là. */
function lastFacing(points, fallback) {
  if (points.length < 2) return fallback;
  const heading = facing(points[points.length - 2], points[points.length - 1]);
  return heading === null ? fallback : heading;
}
