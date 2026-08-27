/**
 * Le tracé qui contourne, transcrit de `Placement.astar` de la v159.7.
 *
 * Quand on tient un convoyeur et qu'on demande le placement diagonal, le jeu ne trace pas
 * une ligne : il cherche un chemin. Une usine au milieu du passage se contourne au lieu de
 * se faire écraser, et c'est ce qui permet de tirer une bande d'un bout à l'autre d'une
 * base sans la démonter.
 *
 * Trois heuristiques, et ce sont elles tout le comportement :
 *
 * | Ce qu'on traverse | Coût |
 * |---|---|
 * | une case libre, dans le même sens | 1 |
 * | une case libre, mais qui fait tourner | 8 |
 * | une case occupée ou un liquide profond | 20 |
 *
 * Le virage à 8 est le détail qui compte : sans lui, l'A\* rend un escalier en marches d'un
 * pas, joli sur le papier et catastrophique en convoyeurs, chaque virage coûtant un objet
 * de débit. Avec lui, le chemin va tout droit aussi longtemps qu'il peut.
 *
 * La limite de mille nœuds est celle du jeu, et le repli aussi : sans chemin trouvé, on
 * rend `null` et l'appelant retombe sur la ligne droite.
 */

const NODE_LIMIT = 1000;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const key = (x, y) => `${x},${y}`;

/**
 * `tileHeuristic` : ce que coûte d'entrer dans `other` en venant de `from`.
 *
 * `blocked(x, y)` dit qu'une case refuse le bloc, ce qui recouvre le
 * `!canReplace && !alwaysReplace` du jeu et son `floor().isDeep()`.
 */
function stepCost(from, other, parents, blocked) {
  if (blocked(other.x, other.y)) return 20;
  const came = parents.get(key(from.x, from.y));
  if (came) {
    const inbound = `${Math.sign(from.x - came.x)},${Math.sign(from.y - came.y)}`;
    const outbound = `${Math.sign(other.x - from.x)},${Math.sign(other.y - from.y)}`;
    if (inbound !== outbound) return 8;
  }
  return 1;
}

const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Le chemin de `from` à `to`, ou `null` si le calcul n'en trouve pas.
 *
 * `bounds` borne la recherche. Le jeu n'en a pas besoin, sa carte a des bords ; ici le
 * terrain est infini et une recherche sans borne part explorer le vide jusqu'à sa limite de
 * mille nœuds à chaque mouvement de souris.
 */
export function astar(from, to, { blocked, bounds }) {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];

  const costs = new Map([[key(from.x, from.y), 0]]);
  const parents = new Map();
  const closed = new Set([key(from.x, from.y)]);
  /* Une file triée à chaque tour plutôt qu'un tas : mille nœuds au maximum, et un tas de
     mille éléments écrit à la main est plus de code à se tromper que de temps gagné. */
  let queue = [{ ...from }];
  let visited = 0;
  let found = false;

  while (queue.length && visited++ < NODE_LIMIT) {
    queue.sort((a, b) =>
      (costs.get(key(a.x, a.y)) + distance(a, to))
      - (costs.get(key(b.x, b.y)) + distance(b, to)));
    const next = queue.shift();
    if (next.x === to.x && next.y === to.y) { found = true; break; }

    const base = costs.get(key(next.x, next.y)) ?? 0;
    for (const [dx, dy] of DIRECTIONS) {
      const child = { x: next.x + dx, y: next.y + dy };
      if (child.x < bounds.left || child.x > bounds.right) continue;
      if (child.y < bounds.bottom || child.y > bounds.top) continue;
      const at = key(child.x, child.y);
      if (closed.has(at)) continue;
      closed.add(at);
      parents.set(at, { x: next.x, y: next.y });
      costs.set(at, base + stepCost(next, child, parents, blocked));
      queue.push(child);
    }
  }
  if (!found) return null;

  const path = [{ x: to.x, y: to.y }];
  let current = { x: to.x, y: to.y };
  let steps = 0;
  while (!(current.x === from.x && current.y === from.y) && steps++ < NODE_LIMIT) {
    const came = parents.get(key(current.x, current.y));
    if (!came) return null;
    path.push(came);
    current = came;
  }
  path.reverse();
  return path;
}
