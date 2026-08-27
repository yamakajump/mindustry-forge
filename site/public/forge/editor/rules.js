/**
 * Une pose est-elle légale, et sinon pourquoi.
 *
 * LA RÈGLE QUI COMMANDE TOUTES LES AUTRES : **une case sans sol peint n'a aucune règle.**
 * Tant que rien n'est peint sous un bloc, la pose est légale. Les contraintes de terrain
 * n'existent qu'à mesure que le terrain est décrit. Autrement une toile vierge serait
 * inconstructible, et coller dans un éditeur vide une schématique venue du jeu deviendrait
 * impossible.
 *
 * Le corollaire vaut d'être dit : une case **peinte** est une affirmation sur le monde, et
 * elle est opposable. Peindre de la pierre sous une foreuse, c'est déclarer qu'il n'y a
 * pas de minerai là, et la foreuse est refusée. Ne rien peindre, c'est ne rien déclarer.
 *
 * Le reste vient de `Build.validPlace`, `Block.canReplace`, `Drill.canMine` et
 * `Pump.canPlaceOn` de la v159.7.
 *
 * L'ordre des vérifications n'est pas cosmétique : c'est lui qui décide quelle raison
 * s'affiche quand plusieurs s'appliquent, et la bonne est la plus actionnable. La taille
 * passe donc avant le sol, et le sol avant le remplacement.
 */

import { footprint } from "./state.js";

const ok = { ok: true };
const no = (why) => ({ ok: false, why });

/**
 * `Block.canReplace` de la v159.7, transcrit et non paraphrasé.
 *
 * C'est cette fonction qui décide qu'un convoyeur titane se pose sur un convoyeur alors
 * qu'une presse ne le peut pas. Elle lit six champs, et n'en connaître que la moitié donne
 * un éditeur qui refuse des gestes que le jeu accepte.
 */
export function canReplace(block, other) {
  if (other.always_replace) return true;
  if (other.privileged) return false;
  const same = other === block;
  return other.replaceable !== false
    && (!same || (block.rotate && block.quick_rotate))
    && ((block.group !== "none" && other.group === block.group) || same)
    && (block.size === other.size
        || (block.size >= other.size
            && ((block.subclass != null && block.subclass === other.subclass)
                || block.group_any_replace)));
}

/**
 * Ce qu'une foreuse tirerait d'une case, si elle sait la creuser.
 *
 * `Drill.canMine` compare le palier de la foreuse à la dureté de l'objet, et exclut ce que
 * le bloc porte dans `blocked_items`. Une foreuse mécanique sur du titane ne creuse pas
 * lentement, elle ne creuse pas du tout.
 */
function minable(block, layers, catalogue) {
  const ore = layers.overlay && catalogue.blocks[layers.overlay];
  const item = ore?.drops || (layers.floor && catalogue.blocks[layers.floor]?.drops);
  if (!item) return false;
  if ((block.blocked_items || []).includes(item)) return false;
  const hardness = catalogue.items[item]?.hardness ?? 0;
  return (block.tier ?? 0) >= hardness;
}

/** Le liquide qu'une pompe tirerait d'une case. */
const liquidOf = (layers, catalogue) =>
  (layers.floor && catalogue.blocks[layers.floor]?.drops_liquid) || null;

/**
 * Peut-on poser `plan` sur `board` ?
 *
 * Rend `{ ok: true }`, ou `{ ok: false, why }` où `why` est une phrase française destinée
 * à être affichée telle quelle sous le curseur. Un refus sans raison lisible est un refus
 * que le joueur vit comme un bug.
 */
export function canPlace(board, plan, catalogue) {
  const block = catalogue.blocks[plan.block];
  if (!block) return no(`${plan.block} n'existe pas dans le jeu`);

  if (!board.fits(plan)) {
    return no("64 tuiles de côté, le jeu n'en accepte pas plus");
  }

  const cells = footprint(plan, (name) => catalogue.blocks[name]?.size || 1);
  /* Les seules cases dont on sait quelque chose. Le reste du terrain n'est pas « vide »,
     il est inconnu, et on ne refuse pas une pose sur de l'inconnu. */
  const described = cells
    .map(([x, y]) => board.ground[`${x},${y}`])
    .filter(Boolean);

  for (const layers of described) {
    if (layers.wall) return no("rien ne se construit sur un mur");
    const floor = layers.floor && catalogue.blocks[layers.floor];
    if (!floor) continue;
    if (floor.deep && !block.floating && !block.requires_water && !block.placeable_liquid) {
      return no("un liquide profond ne porte que ce qui flotte");
    }
    if (floor.placeable_on === false) return no("on ne bâtit pas sur ce sol");
  }

  /* On ne refuse que ce que le sol peint **prouve** illégal, et les deux règles qui
     suivent ne se prouvent pas de la même façon.

     Une foreuse veut **au moins une** case de minerai : tant qu'une case de son empreinte
     n'est pas décrite, elle pourrait porter du minerai, et rien n'autorise à refuser. Il
     faut donc que l'empreinte entière soit peinte pour conclure.

     Une pompe veut **toutes** ses cases mouillées : une seule case peinte et sèche est un
     contre-exemple, et suffit à trancher même si le reste est inconnu.

     Confondre les deux donnait un éditeur qui refuse une foreuse dès qu'on peint une seule
     case de pierre à côté, ce qui punit exactement le geste qu'on veut encourager. */
  if (described.length) {
    const complete = described.length === cells.length;
    if (block.role === "drill" && complete
        && !described.some((layers) => minable(block, layers, catalogue))) {
      return no("il faut du minerai sous une foreuse, et qu'elle sache le creuser");
    }
    if (block.role === "pump") {
      const liquids = described.map((layers) => liquidOf(layers, catalogue));
      if (liquids.some((liquid) => liquid === null)) {
        return no("une pompe veut du liquide sous chacune de ses cases");
      }
      if (new Set(liquids).size > 1) {
        return no("une pompe ne tire qu'un liquide à la fois");
      }
    }
  }

  for (const [x, y] of cells) {
    const under = board.at(x, y);
    if (!under) continue;
    const other = catalogue.blocks[under.block];
    if (!other || !canReplace(block, other)) {
      return no(`${plan.block} ne peut pas remplacer ${under.block}`);
    }
  }

  return ok;
}
