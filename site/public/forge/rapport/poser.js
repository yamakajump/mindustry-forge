/**
 * Putting a carrier down on an empty tile, without leaving the analysis.
 *
 * A schematic that makes something and has no way out is common, and the report says so, and
 * until now the only answer it offered was to mark an outlet. On a plan whose output circles
 * back into itself that answers nothing: nothing flows to the tile being marked, so the
 * outlet reads "lead, 0 / s" - a resource picked because it was first in a list, at a rate
 * of zero - and the plan is exactly as jammed as it was.
 *
 * The real fix is a belt. Not a declaration that something leaves here, a block that takes
 * it away, which the analysis then reads like any other block because it is one. So it is
 * placed rather than declared, and placed here rather than in the editor: switching to a
 * full screen mode to add one conveyor is a mode switch to answer a question the report has
 * just asked.
 *
 * Not imported by `bilan.js`: see the note at the top of `type.js`.
 */

/** Mindustry counts rotations anticlockwise from east. */
const SENS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Which way a block put down here should face.
 *
 * Away from the schematic, because an empty tile next to a plan is somewhere a player wants
 * something to leave by: that is the question the report asked to get them here. Worked out
 * from which side the plan is on, so a belt laid on the left edge points left and one laid
 * underneath points down, and neither has to be turned afterwards.
 *
 * Falls back to east when the tile touches the plan on no side at all, which is a tile
 * nobody clicked on purpose.
 */
export function sensDeFuite(x, y, occupe) {
  for (let rotation = 0; rotation < 4; rotation++) {
    const [dx, dy] = SENS[rotation];
    // The plan is on the opposite side, so this is the way out.
    if (occupe(x - dx, y - dy)) return rotation;
  }
  return 0;
}

/**
 * What to offer putting down, best first.
 *
 * The carriers the schematic already uses come first, and that is most of the answer: a plan
 * built out of titanium conveyors wants another titanium conveyor, and offering it the whole
 * catalogue in alphabetical order would be asking it to find its own belt among two hundred
 * and fifty blocks.
 *
 * Then the plain ones, so a plan that carries no belt at all still has something to place.
 * Four in total: this is a row of buttons in a bubble over a picture, not a palette.
 */
export function aPoser(held, catalogue, liquide = false) {
  const roles = liquide
    ? new Set(["conduit"])
    : new Set(["conveyor", "duct", "stack-conveyor"]);
  const porte = (name) => {
    const block = catalogue?.blocks?.[name];
    return block && roles.has(block.role) ? block : null;
  };

  const siens = Object.keys(held || {}).filter(porte);
  /* The ordinary ones, by the game's own numbering, which is the order a player meets them
     in: copper conveyor before titanium before plastanium. */
  const reste = Object.keys(catalogue?.blocks || {})
    .filter((name) => porte(name) && !siens.includes(name)
      && catalogue.blocks[name].build_visibility === "shown")
    .sort((a, b) => (catalogue.blocks[a].id ?? 0) - (catalogue.blocks[b].id ?? 0));

  return [...siens, ...reste].slice(0, 4);
}

/** The bubble offered on an empty tile, which asks one question and no more. */
export function poser(offert, outils) {
  const { escape, t, lisible, blockIcon } = outils;
  if (!offert.length) return "";

  return `<div class="bulle poser" role="dialog" aria-label="${
    escape(t("analyse.poser.titre"))}">
    <div class="bulle-tete">
      <span>${escape(t("analyse.poser.titre"))}</span>
      <button type="button" class="fermer" data-fermer aria-label="${
        escape(t("analyse.bulle.fermer"))}">&times;</button>
    </div>
    <div class="chips">${offert.map((name) =>
      `<button type="button" class="chip pick" data-poser="${escape(name)}"
        >${blockIcon(name, 15)}${escape(lisible(name))}</button>`).join("")}</div>
    <p class="quoi dim">${escape(t("analyse.poser.aide"))}</p>
  </div>`;
}
