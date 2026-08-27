/**
 * Draw a schematic's plan in the page, from the code the page already carries.
 *
 * Fifteen thousand five hundred schematics came in from other catalogues, and none of them
 * arrived with a picture: a preview is a PNG the browser renders and uploads while somebody
 * saves their own work, and an import never goes down that path. Every one of those pages
 * showed an empty black panel where the plan belongs, and the showcase was a grid of grey
 * rectangles.
 *
 * Nothing had to be stored to fix it. The plan is drawn from the schematic's own code by the
 * same renderer the analyser uses, in the visitor's browser, which is where this site does
 * its work anyway. Measured at 126 ms once the sprite sheet is in cache.
 *
 * The sheet is the whole cost: 1.28 MB, downloaded once and then cached across every page
 * that draws anything. That is why this module is loaded by the schematic page, whose entire
 * point is one schematic, and not by the list, where twenty-four plans would be twenty-four
 * renders for pictures the size of a thumbnail.
 */

import { catalogueOf, loadCatalogue } from "./analyse.js";
import { bounds, draw, loadSprites } from "./render.js";
import { fromBase64 } from "./schematic.js";

/* Absolute, not relative. This module is loaded from /s/{slug} and from /blocs/{name}, so a
   relative "./forge/" would resolve against the page's own directory and ask the server for
   /s/forge/blocks.json. The analyser gets away with a relative base because it is served at
   the root; nothing else here is. */
const BASE = "/forge/";

/** How much of the panel the plan may take, leaving it room to breathe. */
const PADDING = 32;

let loading = null;

/** The catalogue and the sprite sheet, fetched once however many plans are drawn. */
function assets() {
  loading ??= Promise.all([
    loadCatalogue(`${BASE}blocks.json`),
    loadSprites(BASE),
  ]).then(([known]) => known ?? catalogueOf());
  return loading;
}

/**
 * Draw one plan into its panel, or say why it could not be drawn.
 *
 * A schematic whose code does not decode has to say something true rather than stay grey.
 * These came from two other catalogues without anybody reading them, some were built for a
 * version of the game that is no longer ours, and a panel that stays empty tells a visitor
 * that the site is broken when it is the schematic that is.
 */
async function plan(panel) {
  const code = panel.dataset.code || "";

  /* An early return here left the panel showing "drawing the plan..." for ever, which is
     the one thing this whole change exists to stop: a panel that says something untrue and
     never corrects it. Nothing that arrives without a code can be drawn, and saying so is
     cheaper than looking broken. */
  if (!code.trim()) {
    fail(panel, "Cette schematique n'a pas de code enregistre.");
    return;
  }

  let known;
  let parsed;
  try {
    known = await assets();
    parsed = await fromBase64(code);
  } catch (error) {
    fail(panel, "Cette schematique ne se dessine pas : son code est illisible.");
    return;
  }

  if (!parsed?.tiles?.length) {
    fail(panel, "Cette schematique est vide.");
    return;
  }

  const canvas = document.createElement("canvas");

  panel.replaceChildren(canvas);

  /* Straight off the catalogue, and not through the Map the analyser builds: that one is
     made of the analysis graph's nodes, and there is no analysis here. Drawing a plan needs
     two facts per block, how many tiles it covers and what it does, and blocks.json states
     both. Running the solver to learn them would be a second and much slower way of reading
     a file that is already open. */
  const blocks = known.blocks || {};
  const sizeOf = (name) => blocks[name]?.size || 1;
  const roleOf = (name) => blocks[name]?.role || "";

  /* Sized from the room the panel actually has rather than from a number written here, and
     drawn again when that room changes. The analyser learned the same lesson: a hardcoded
     width made the picture half the panel on a desktop and overflowed it on a phone. */
  const box = bounds(parsed.tiles, sizeOf);

  const paint = () => {
    /* The scale is derived from the height the panel has, not only from its width. The
       renderer sizes a plan on its longest side, so a 5 by 13 schematic drawn 220 wide comes
       out 570 tall, and a list gives its thumbnails 150.

       `max-height: 100%` was tried first and does not work: measured in Chrome, a canvas in
       a 150 pixel grid cell with that rule still computes to 195. The height is decided
       here instead, where it can be. */
    const room = Math.max(120, panel.clientWidth - PADDING);
    const tall = panel.clientHeight;
    const maxScale = tall > 0 ? Math.max(4, Math.floor(tall / box.height)) : 48;

    draw(canvas, parsed.tiles, sizeOf, roleOf, { width: room, maxScale, margin: 0 });

    /* A net, for the plans too tall for arithmetic to save: the renderer never goes below
       eight pixels a tile, so anything past nineteen tiles high still overflows a 150 pixel
       box. Fixing the height and freeing the width keeps the proportions, because a canvas
       carries its ratio in its own attributes. */
    if (tall > 0 && canvas.getBoundingClientRect().height > tall) {
      canvas.style.height = `${tall}px`;
      canvas.style.width = "auto";
    }
  };

  paint();
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(paint).observe(panel);
  }
}

function fail(panel, message) {
  const line = document.createElement("p");
  line.className = "empty";
  line.textContent = message;
  panel.replaceChildren(line);
}

for (const panel of document.querySelectorAll("[data-code]")) {
  plan(panel);
}
