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
 *
 * Panels that were in the page when it loaded are drawn on import, which is what every
 * caller needed until the comparison page started putting search results on screen. Those
 * arrive after a keystroke, so `watch` is exported: the scan is the same one, pointed at a
 * subtree rather than at the whole document.
 */

import { catalogueOf, loadCatalogue } from "./analyse.js";
import { bounds, draw, loadSprites } from "./render.js";
import { fromBase64 } from "./schematic.js";

/* Absolute, not relative. This module is loaded from /s/{slug} and from /blocs/{name}, so a
   relative "./forge/" would resolve against the page's own directory and ask the server for
   /s/forge/blocks.json. The analyser gets away with a relative base because it is served at
   the root; nothing else here is. */
const BASE = "/forge/";

/** How much of the panel the plan may take at most, leaving it room to breathe. */
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
export async function drawPlan(panel, fetched = null) {
  const code = fetched ?? panel.dataset.code ?? "";

  /* An early return here left the panel showing "drawing the plan..." for ever, which is
     the one thing this whole change exists to stop: a panel that says something untrue and
     never corrects it. Nothing that arrives without a code can be drawn, and saying so is
     cheaper than looking broken. */
  if (!code.trim()) {
    fail(panel, "Cette schématique n'a pas de code enregistré.");
    return;
  }

  let known;
  let parsed;
  try {
    known = await assets();
    parsed = await fromBase64(code);
  } catch (error) {
    fail(panel, "Cette schématique ne se dessine pas : son code est illisible.");
    return;
  }

  if (!parsed?.tiles?.length) {
    fail(panel, "Cette schématique est vide.");
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
    /* The breathing room is a share of the panel, capped, rather than a flat thirty-two
       pixels. A flat one is most of a thumbnail: the comparison page's search results are
       sixty-four pixels wide, and subtracting thirty-two from them left a plan drawn at
       half the width of its own box. Above three hundred pixels this is the number it
       always was, so nothing that was already measured moves. */
    const measured = panel.clientWidth;
    const padding = Math.min(PADDING, Math.round(measured * 0.1));
    /* A panel the browser has not laid out yet measures zero, and drawing a plan twenty
       pixels wide because of it would be a picture nobody can read that never gets
       corrected. The observer below repaints it once the panel has a size. */
    const roomWide = measured > 0 ? Math.max(24, measured - padding) : 120;
    const roomTall = panel.clientHeight;

    const { inputs, outputs } = markedOn(panel);

    draw(canvas, parsed.tiles, sizeOf, roleOf, {
      width: roomWide,
      maxScale: roomTall > 0 ? Math.max(4, Math.floor(roomTall / box.height)) : 48,
      margin: 0,
      inputs,
      outputs,
    });

    /* Then made to fit, on both axes at once and with one factor.
     *
     * The renderer never draws a tile smaller than eight pixels, which is right on a page
     * where the picture may scroll and wrong in a box that cannot: a 35 by 9 plan comes out
     * 280 pixels wide inside a tile that has 220, whatever scale is asked for. Two of the
     * twenty-four plans on the live list spilled over their neighbours that way.
     *
     * One factor for both dimensions is the whole point. Constraining the height alone,
     * which is what this did first, squashes anything wider than it is tall. And the
     * factor is applied to both styles rather than by setting one to `auto`: measured in
     * Chrome, a canvas with `height` fixed and `width: auto` in a grid cell does not fall
     * back on its own ratio the way a replaced element is supposed to. */
    const shown = canvas.getBoundingClientRect();
    if (shown.width > 0 && shown.height > 0) {
      const fit = Math.min(1, roomWide / shown.width,
        roomTall > 0 ? roomTall / shown.height : 1);
      if (fit < 1) {
        canvas.style.width = `${Math.round(shown.width * fit)}px`;
        canvas.style.height = `${Math.round(shown.height * fit)}px`;
      }
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

/**
 * What the author said goes in and comes out, if the panel carries it.
 *
 * The marks are stored with the schematic and were read back by nobody: the endpoint that
 * serves them says so in `routes/web.php`, and it has said so since the first day. Drawing
 * them here is the difference between a plan somebody described and a plan nobody has
 * touched, which is exactly what a reader is trying to tell.
 *
 * The shape stored is the analyser's own, `{"x,y": {side, resource}}`, and the renderer
 * wants two lists. Nothing else is needed to draw one: `marker` reads a position and a
 * resource, and the rest of a port - its rate, its block, what it carries - is analysis
 * this page has not run.
 *
 * Silent on anything it cannot read. A panel with no marks, a coordinate that is not a
 * pair of numbers, an attribute that is not JSON: the plan is still worth drawing.
 */
function markedOn(panel) {
  const inputs = [];
  const outputs = [];
  let marked;
  try {
    marked = JSON.parse(panel.dataset.marks || "{}");
  } catch {
    return { inputs, outputs };
  }
  for (const [at, mark] of Object.entries(marked || {})) {
    const [x, y] = String(at).split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const side = typeof mark === "string" ? mark : mark?.side;
    const port = { x, y, resource: (typeof mark === "object" && mark?.resource) || null };
    if (side === "in") inputs.push(port);
    else if (side === "out") outputs.push(port);
  }
  return { inputs, outputs };
}

/** The code of one schematic, for a panel too big to have carried its own. */
async function fetchAndDraw(panel) {
  try {
    const answer = await fetch(`/api/schematiques/${panel.dataset.slug}/code`);
    if (!answer.ok) throw new Error(String(answer.status));
    await drawPlan(panel, (await answer.text()).trim());
  } catch {
    fail(panel, "Cette schématique n'a pas pu être chargée.");
  }
}

/**
 * Draw every plan under `root`, and arrange for the heavy ones to draw themselves.
 *
 * Panels are marked done as they are taken, so calling this twice over overlapping ground
 * does not redraw what is already drawn. The comparison page does exactly that: it watches
 * a fresh list of results while the two chosen plans, drawn on load, are still on screen.
 */
export function watch(root = document) {
  for (const panel of root.querySelectorAll("[data-code]:not([data-drawn])")) {
    panel.dataset.drawn = "";
    drawPlan(panel);
  }

  /* Tiles whose code was too big to travel in the page ask for it themselves, and only when
     they are about to be looked at. Fetching all of them on load would put back exactly the
     weight the cap removed, on a visitor who may never scroll that far. */
  const waiting = [...root.querySelectorAll("[data-slug]:not([data-drawn])")];
  for (const panel of waiting) panel.dataset.drawn = "";

  if (!waiting.length) return;

  if (typeof IntersectionObserver === "function") {
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        watcher.unobserve(entry.target);
        fetchAndDraw(entry.target);
      }
    }, { rootMargin: "200px" });
    for (const panel of waiting) watcher.observe(panel);
  } else {
    for (const panel of waiting) fetchAndDraw(panel);
  }
}

watch();
