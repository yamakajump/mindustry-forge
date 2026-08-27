/**
 * Ce que le jeu décide à la place du joueur quand il trace une ligne.
 *
 * Deux mécaniques, et ce sont celles qui font qu'on trace à travers son usine sans y
 * penser. Toutes deux transcrites de la v159.7.
 *
 * **La jonction au croisement**, `Conveyor.getReplacement`. Une ligne qui coupe une ligne
 * perpendiculaire ne la coupe pas : le croisement devient une jonction, et les deux lignes
 * continuent chacune leur route.
 *
 * **Le pont automatique**, `Placement.calculateBridges`. Une ligne qui rencontre un
 * obstacle le franchit toute seule. Ce n'est pas un « si bloqué, alors pont » : c'est une
 * programmation dynamique sur toute la ligne, qui arbitre trois coûts et choisit le chemin
 * le moins cher de bout en bout.
 *
 * Les coûts sont ceux du jeu, et leur rapport est tout le comportement : un pont vaut
 * soixante-six convoyeurs, donc il n'apparaît que là où rien d'autre ne passe, et le
 * malus par case vide enjambée le fait préférer le saut le plus court.
 */

import { footprint } from "./state.js";

const CONVEYOR_COST = 3;
const JUNCTION_COST = 30;
const BRIDGE_COST = 200;
const BRIDGE_OVER_EMPTY = 5;
const INFINITE = Number.MAX_SAFE_INTEGER / 2;

/**
 * `Placement.isSidePlace` : le premier bloc est-il posé de travers par rapport à la ligne ?
 *
 * Garde-fou du pont automatique. Une ligne dont le premier bloc regarde de côté n'est pas
 * une ligne qu'on prolonge, c'est une entrée qu'on branche, et y insérer des ponts défait
 * exactement ce que le joueur venait de faire.
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
 * La jonction au croisement.
 *
 * Trois conditions ensemble, et c'est leur conjonction qui évite les faux positifs : la
 * ligne continue **des deux côtés** de cette case, la case porte **déjà** un convoyeur, et
 * ce convoyeur est **perpendiculaire** au nôtre. Un convoyeur dans le même sens se remplace
 * normalement ; c'est seulement le croisement qui appelle une jonction.
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
    /* Perpendiculaire, c'est à dire une rotation qui diffère d'un nombre impair de quarts
       de tour. Un convoyeur à l'envers du nôtre n'est pas un croisement. */
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
 * Les ponts automatiques, `Placement.smartCalculateBridges`.
 *
 * `blocked(x, y)` dit si la case refuse le convoyeur, `reach` est la portée du pont, et
 * `bridge` son nom. Rend une nouvelle liste de plans où les segments infranchissables ont
 * été remplacés par des ponts liés deux à deux.
 *
 * Le tableau `dp` a deux moitiés : la première est le meilleur coût pour arriver à `i` **au
 * sol**, la seconde pour y arriver **au bout d'un pont**. C'est ce dédoublement qui permet
 * de comparer les deux à chaque case, et de n'ouvrir un pont que là où il paye.
 */
export function withBridges(plans, { blocked, reach, bridge, hasJunction = false,
                                     avoid = () => false }) {
  if (plans.length < 2 || !bridge || !reach) return plans;
  /* Ligne orthogonale seulement, et pas une pose de côté : les deux garde-fous du jeu,
     avant même de calculer quoi que ce soit. */
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
    /* `needJunction` du jeu : `hasJunction && avoid.get(cur.tile().block())`. Une jonction
       ne traverse qu'un **transporteur**, pas n'importe quel obstacle.

       Aplatir ça en « tout obstacle se traverse en jonction » condamnait le pont à ne
       jamais gagner : la jonction coûte 30 et le pont 200, donc le calcul faisait passer
       une jonction imaginaire au travers d'une presse et n'ouvrait aucun pont. Mesuré sur
       une ligne de dix-sept convoyeurs coupée par une presse : zéro pont posé. */
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
        if (far > reach) break;   // plus loin en arrière ne sera pas plus proche
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
      // Rien ne relie cette case au début : on repart d'un segment neuf.
      cost[i] = 0;
      cost[n + i] = BRIDGE_COST;
    }
  }

  /* Remonter le chemin retenu. `mode` dit si on est arrivé ici au sol ou par un pont, ce
     qui n'est pas la même case du tableau et donc pas le même parent. */
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

/** Ce qu'une case refuse : un mur, un liquide profond, ou un bloc qu'on ne remplace pas. */
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
    /* Un bloc du même groupe se remplace, donc il ne bloque pas. Tout le reste bloque, et
       c'est ce qui déclenche le pont : une presse au milieu d'une ligne de convoyeurs. */
    const other = catalogue.blocks[under.block] || {};
    if (other.always_replace) return false;
    return !(known.group && known.group !== "none" && other.group === known.group
             && footprint(under, sizeOf).length === 1);
  };
}
