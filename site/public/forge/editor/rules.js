/**
 * Whether a placement is legal, and if not, why.
 *
 * THE RULE THAT GOVERNS ALL THE OTHERS: **a tile with no painted ground has no rules.**
 * As long as nothing is painted under a block, the placement is legal. Terrain constraints
 * only come into being as the terrain is described. Otherwise a blank canvas would be
 * unbuildable, and pasting a schematic from the game into an empty editor would become
 * impossible.
 *
 * The corollary is worth saying out loud: a **painted** tile is a claim about the world, and
 * it can be held against you. Painting stone under a drill is declaring that there is no ore
 * there, and the drill is refused. Painting nothing is declaring nothing.
 *
 * The rest comes from `Build.validPlace`, `Block.canReplace`, `Drill.canMine` and
 * `Pump.canPlaceOn` in v159.7.
 *
 * The order of the checks is not cosmetic: it decides which reason is shown when several
 * apply, and the right one is the most actionable. Size therefore comes before ground, and
 * ground before replacement.
 */

import { BOARD_SIZE, footprint, MAX_SIZE } from "./state.js";

const ok = { ok: true };
const no = (why) => ({ ok: false, why });

/**
 * `Block.canReplace` from v159.7, transcribed and not paraphrased.
 *
 * This is the function that decides a titanium conveyor drops onto a conveyor while a press
 * cannot. It reads six fields, and knowing only half of them gives an editor that refuses
 * gestures the game accepts.
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
 * What a drill would pull from a tile, if it can dig it at all.
 *
 * `Drill.canMine` compares the drill's tier against the item's hardness, and excludes what
 * the block carries in `blocked_items`. A mechanical drill on titanium does not dig slowly,
 * it does not dig.
 */
function minable(block, layers, catalogue) {
  const ore = layers.overlay && catalogue.blocks[layers.overlay];
  const item = ore?.drops || (layers.floor && catalogue.blocks[layers.floor]?.drops);
  if (!item) return false;
  if ((block.blocked_items || []).includes(item)) return false;
  const hardness = catalogue.items[item]?.hardness ?? 0;
  return (block.tier ?? 0) >= hardness;
}

/** The liquid a pump would pull from a tile. */
const liquidOf = (layers, catalogue) =>
  (layers.floor && catalogue.blocks[layers.floor]?.drops_liquid) || null;

/**
 * Can `plan` be placed on `board`?
 *
 * Returns `{ ok: true }`, or `{ ok: false, why }` where `why` is a French sentence meant to
 * be shown as it stands under the cursor. A refusal with no readable reason is a refusal the
 * player experiences as a bug.
 *
 * Those sentences stay French on purpose: a player reads them, and this repository is
 * English for whoever contributes to it and French for whoever plays with it.
 */
export function canPlace(board, plan, catalogue, batch = null) {
  const block = catalogue.blocks[plan.block];
  if (!block) return no(`${plan.block} n'existe pas dans le jeu`);

  /* The size limit is judged on the whole batch when there is one. A drag of a hundred
     conveyors sees each of its blocks fit on its own, since a block measured alone is one
     tile wide: without the batch, the editor would let somebody build a schematic a hundred
     long that the game refuses to open.

     Which cap `board.fits` is enforcing depends on whether a frame exists: 64, the game's
     own ceiling on the whole board, as long as nothing has carved it into frames; 256, the
     board's own ceiling, once a frame carries the 64 on its own. The message names whichever
     one just refused, so a player never reads "64" while standing nowhere near it. */
  if (!board.fits(batch || plan)) {
    return board.frames.length
      ? no(`${BOARD_SIZE} tuiles de côté, le plateau n'en accepte pas plus`)
      : no(`${MAX_SIZE} tuiles de côté, le jeu n'en accepte pas plus`);
  }

  const cells = footprint(plan, (name) => catalogue.blocks[name]?.size || 1);
  /* The only tiles anything is known about. The rest of the ground is not "empty", it is
     unknown, and a placement is not refused over the unknown. */
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

  /* Only what the painted ground **proves** illegal is refused, and the two rules that
     follow are not proved the same way.

     A drill wants **at least one** tile of ore: as long as one tile of its footprint is
     undescribed, that tile could hold ore, and nothing licenses a refusal. The whole
     footprint therefore has to be painted before anything can be concluded.

     A pump wants **all** of its tiles wet: a single painted, dry tile is a counter-example,
     and settles it even when the rest is unknown.

     Confusing the two gave an editor that refused a drill the moment one tile of stone was
     painted beside it, which punishes exactly the gesture we want to encourage. */
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
