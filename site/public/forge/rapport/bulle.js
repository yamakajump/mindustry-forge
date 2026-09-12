/**
 * Marking a block, on the block.
 *
 * The gesture used to be split across the page: you clicked the picture on the left, the
 * two buttons appeared in a panel below it, and the result showed up in a card on the
 * right, with a third pair of buttons of its own. One gesture, three places, and the eyes
 * crossing the page for each of them.
 *
 * So it happens where the block is. The rule the whole report now follows is that the
 * picture is what you act on and the column beside it is what you read, and this is the
 * acting half: a small panel anchored on the tile that was clicked, asking the two
 * questions in order and nothing else.
 *
 * Two questions, and the second only when the first says "in". What comes OUT of a
 * schematic is not a choice - it is whatever reaches that tile - so asking would be
 * theatre. What comes in is a choice, and it is offered as a short list rather than the
 * whole catalogue, because a pipe can only ever hold a liquid the layout is short of.
 *
 * Not imported by `bilan.js`: see the note at the top of `type.js`.
 */

/**
 * Where the panel sits, in pixels inside the stage.
 *
 * The same arithmetic `index.html` runs to turn a click into a tile, run backwards. It is
 * kept here rather than there so that the anchoring can be tested without a browser: the
 * one thing that goes visibly wrong with a floating panel is landing in the wrong place,
 * and that is not something a screenshot catches reliably at every zoom.
 *
 * Clamped to the stage. Anchored blindly, a mark on the right-hand column of a wide
 * schematic put half the panel outside the picture and the resource chips off the page.
 */
export function ancrage(tile, drawn, stage) {
  const size = tile.size || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  const left = (tile.x + offset - drawn.box.left) * drawn.scale;
  const top = (drawn.box.bottom + drawn.box.height - (tile.y + offset + size))
    * drawn.scale;

  const largeur = stage.bulle?.width ?? 210;
  const hauteur = stage.bulle?.height ?? 120;
  const milieu = left + (size * drawn.scale) / 2 - largeur / 2;

  return {
    left: Math.max(4, Math.min(milieu, Math.max(4, stage.width - largeur - 4))),
    /* Above the block when there is room, below it when there is not. A panel that always
       opened downwards covered the rest of the schematic on a mark near the top, which is
       where an intake usually is. */
    top: top - hauteur - 8 >= 0
      ? top - hauteur - 8
      : top + size * drawn.scale + 8,
  };
}

/**
 * The panel's markup.
 *
 * `outils` rather than imports, for the reason written over `verdict`: the helpers live in
 * the page with the sprite atlas and the name table, and passing them keeps this a pure
 * function that a test can run under Node.
 */
export function bulle(tile, mark, offert, outils) {
  const { escape, t, lisible, withIcon } = outils;

  const cote = (which, key) => `<button type="button" data-side="${which}"
    class="${mark?.side === which ? "primary" : ""}">${escape(t(key))}</button>`;

  const choix = mark?.side === "in"
    ? (offert.length
      ? `<p class="quoi">${escape(t("analyse.bulle.qui-arrive"))}</p>
         <div class="chips">${offert.map((resource) =>
           /* The identifier in the attribute and the name in the button: the handler puts
              what it finds here straight into the mark, and the engine looks that up in a
              catalogue keyed by identifier. Sending the French name stored "Titane" where
              "titanium" was expected, so nothing matched and the marked intake fed
              nothing. */
           `<button type="button" class="chip pick ${
             mark.resource === resource ? "on" : ""}" data-resource="${escape(resource)}"
             >${withIcon(resource, 15)}${escape(lisible(resource))}</button>`).join("")}
         </div>`
      : `<p class="quoi dim">${escape(t("analyse.bulle.rien-a-offrir"))}</p>`)
    : mark?.side === "out"
      ? `<p class="quoi dim">${escape(t("analyse.bulle.sortie-imposee"))}</p>`
      : "";

  return `<div class="bulle" role="dialog" aria-label="${escape(t("analyse.bulle.titre"))}">
    <div class="bulle-tete">
      <span>${escape(lisible(tile.name))}</span>
      <button type="button" class="fermer" data-fermer aria-label="${
        escape(t("analyse.bulle.fermer"))}">&times;</button>
    </div>
    <div class="row">
      ${cote("in", "analyse.bulle.ca-entre")}${cote("out", "analyse.bulle.ca-sort")}
      ${mark ? `<button type="button" data-side="">${
        escape(t("analyse.bulle.retirer"))}</button>` : ""}
    </div>
    ${choix}
  </div>`;
}
