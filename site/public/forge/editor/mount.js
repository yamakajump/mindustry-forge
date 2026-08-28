/**
 * Editing mode: the board, the mouse, the keyboard.
 *
 * There is no toolbar for building, and that is deliberate. The game has none: a block in
 * hand places, right click breaks. Adding mode buttons would amount to inventing an
 * interface the player would have to unlearn to get their own back.
 *
 * The shortcuts are read off `Binding` in v159.7 rather than chosen: the wheel rotates,
 * ctrl places diagonally, F selects, Z and X mirror, middle click picks a block up, R held
 * rotates one already placed. A player arriving here already has those gestures in their
 * fingers, and imposing others would be asking them to unlearn their own to use a tool
 * that talks about their game.
 *
 * The departures are all listed in the help panel rather than hidden: the wheel zooms when
 * the hand is empty, a middle click drag pans the view, Q picks up the ground under the
 * cursor instead of emptying a build queue that does not exist here, and frames have no
 * equivalent in the game, whose board is never larger than a schematic.
 */

import { draw, itemIcon, spriteOf } from "../render.js";
import { createBoard, footprint, legalFrame, MAX_SIZE } from "./state.js";
import { lineOf, linksByConfig, reachOf } from "./lines.js";
import { canPlace } from "./rules.js";
import { flip, inBox, rotateBy, translate } from "./selection.js";
import { fromBase64, toBase64 } from "../schematic.js";
import { createCamera } from "./camera.js";
import { mountRail, showHelp, sizeGauge } from "./ui.js";
import { choicesFor, configFor, readsAs } from "./configure.js";
import { ageOf, describeDraft, dropDraft, keepDraft, readDraft } from "./draft.js";
import * as spacesApi from "./spaces.js";

const SHELL = `
  <div class="editor-bar">
    <a class="brand" href="/"><svg class="signe" viewBox="0 0 32 32" aria-hidden="true" fill="currentColor"><path d="M6 6h4v20H6z"/><path d="M10 6h12v4H10z"/><path d="M22 4l5 4-5 4z"/><path d="M10 14h10v4H10z"/></svg>Mindustry <span>Forge</span></a>
    <details class="menu editor-site">
      <summary>Site</summary>
      <div class="menu-list"></div>
    </details>
    <details class="menu editor-spaces" hidden>
      <summary>Mes plans</summary>
      <div class="menu-list"></div>
    </details>
    <span class="editor-modes">
      <button type="button" data-mode="analyse" aria-pressed="false">Analyser</button>
      <button type="button" data-mode="edit" aria-pressed="true">Éditer</button>
    </span>
    <span class="editor-undo">
      <button type="button" data-do="undo" title="Annuler (ctrl+Z)">↶</button>
      <button type="button" data-do="redo" title="Refaire (ctrl+Y)">↷</button>
    </span>
    <span class="editor-size"></span>
  </div>
  <div class="editor-rail"></div>
  <div class="editor-stage"><canvas tabindex="0" aria-label="Le plateau"></canvas>
    <div class="editor-frame-bars"></div>
    <div class="editor-picker" hidden></div>
    <button type="button" class="editor-turn" data-do="turn-held" hidden
            title="Tourner ce qu'on tient">↻</button>
    <div class="editor-pick" hidden>
      <button type="button" data-pick="copy" title="Copier (ctrl+C)">Copier</button>
      <button type="button" data-pick="turn" title="Tourner d un quart">↻</button>
      <button type="button" data-pick="flipx" title="Miroir gauche-droite">↔</button>
      <button type="button" data-pick="flipy" title="Miroir haut-bas">↕</button>
      <button type="button" data-pick="drop" title="Supprimer (suppr)">Supprimer</button>
    </div>
  </div>
  <div class="editor-foot">
    <span class="hints"></span>
    <span class="spacer"></span>
    <button type="button" class="ghost" data-do="help">? raccourcis</button>
  </div>`;

/**
 * Mount the editor into `host`.
 *
 * `onAnalyse` is called with the board when the player switches back to the analysis. The
 * board is not destroyed at that point: coming back to editing and pressing ctrl+Z has to
 * still work, otherwise the switch costs the history and nobody switches.
 */
export function mountEditor({ host, board: kept = null, tiles = [], ground = {},
                              catalogue, onAnalyse }) {
  const sizeOf = (name) => catalogue.blocks[name]?.size || 1;
  const roleOf = (name) => catalogue.blocks[name]?.role || "";
  /* A board can be handed back rather than rebuilt, and that is what makes coming back to
     editing keep the history: rebuilding from the blocks loses everything that is no
     longer in the blocks, which is to say everything there was to undo. */
  const board = kept || createBoard({ tiles, ground, sizeOf });
  const escapeText = (s) => String(s).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  host.className = "editor";
  host.innerHTML = SHELL;

  const stage = host.querySelector(".editor-stage");
  const canvas = host.querySelector("canvas");
  const hints = host.querySelector(".hints");
  const updateGauge = sizeGauge(host.querySelector(".editor-size"), MAX_SIZE);

  /*
   * The way out.
   *
   * `.editor` sits fixed over the whole document (see `.editor` in forge.css), so the
   * site's own `<header>` and its `<nav id="nav">` are still in the page, only covered.
   * `NavigationTest` holds `config/nav.php` against two hand-written mirrors already
   * (`public/index.html` and the tool pages); a third one, typed out here, is exactly what
   * that test's own comment says it exists to prevent. So this menu carries no entry of its
   * own: it reads the real `#nav` out of the document and rebuilds its links from it, on
   * every open rather than once at mount, so a reader who signs in mid-session still sees
   * "Mes schémas" the moment they check.
   */
  const siteMenu = host.querySelector(".editor-site");
  const siteMenuList = siteMenu.querySelector(".menu-list");

  function siteLinkFrom(source) {
    const link = document.createElement("a");
    link.href = source.getAttribute("href");
    link.textContent = source.textContent.trim();
    return link;
  }

  function renderSiteMenu() {
    siteMenuList.replaceChildren();
    const nav = document.getElementById("nav");
    if (!nav) return;
    for (const child of nav.children) {
      if (child.tagName === "A") {
        siteMenuList.appendChild(siteLinkFrom(child));
      } else if (child.tagName === "DETAILS") {
        const summary = child.querySelector("summary");
        if (!summary) continue;
        const heading = document.createElement("span");
        heading.className = "menu-heading";
        heading.textContent = summary.textContent.trim();
        siteMenuList.appendChild(heading);
        for (const link of child.querySelectorAll(".menu-list a")) {
          const item = siteLinkFrom(link);
          /* Not `.sub`: that class already means something else entirely, a subtitle's
             own grey and its own margin (see forge.css), and a link picking it up by
             accident inherited both. */
          item.classList.add("child");
          siteMenuList.appendChild(item);
        }
      }
    }
  }

  siteMenu.addEventListener("toggle", () => { if (siteMenu.open) renderSiteMenu(); });

  /* Native `<details>` does not close itself on an outside click, unlike the real header's
     own menus (see `nav.js`); this one is not inside `#nav`, so that behaviour is repeated
     here rather than reached for. */
  const closeSiteMenu = (event) => {
    if (siteMenu.open && !siteMenu.contains(event.target)) siteMenu.open = false;
  };
  document.addEventListener("click", closeSiteMenu);

  const camera = createCamera({ scale: 24 });
  /* The whole worksite at once when frames exist: framing on the active frame alone would
     leave the others off screen at open, as if they had been lost. */
  if (board.frames.length) camera.frame(board.framesBox(), viewportOf());
  else if (board.tiles.length) camera.frame(board.box(), viewportOf());

  let held = null;
  let rotation = 0;
  /** What the block in hand carries, when the pipette brought it along. */
  let heldConfig = null;
  let cursor = null;
  let refusal = null;
  let panning = null;
  let spacing = false;
  /** The tile a drag started on, for as long as it lasts. */
  let drawing = null;
  /** The corner a rectangular break started from, for as long as it lasts. */
  let erasing = null;
  /** The corner of a selection being drawn, then the box that was kept. */
  let picking = null;
  let selection = null;
  /** What has been copied, and what is waiting to be dropped on the next click. */
  let clipboard = null;
  let pasting = null;
  /* The held keys that change what a gesture means, on the game's own keys:
     ctrl for diagonal placement, F to select, R to rotate a block already placed. */
  let diagonal = false;
  let selecting = false;
  let turning = false;
  /* C held draws a frame, exactly as F draws a selection: the game does not have this
     gesture, but giving it the same shape as the ones it does have avoids inventing one
     more interface. */
  let framing = false;
  /** The corner a frame started being drawn from, for as long as the gesture lasts. */
  let drawingFrame = null;
  /** The active frame: the one the top gauge measures, and the one the dimming spares.
      Tracked by identifier rather than by reference, because renaming, moving or resizing
      a frame replaces it with another object carrying the same id. */
  let activeFrameId = null;
  /** A block placed outside every frame is said once, not on every gesture that places
      another: that is what a reminder says, not what an alarm says. */
  let orphanWarned = false;
  /** A selection move in progress: where it started from, and what it carries. */
  let moving = null;
  /** The bridge being re-aimed, for as long as its target has not been named. */
  let linking = null;
  /** Whether the ground tab is open, and with which brush. */
  let painting = false;
  let brush = { layer: "floor", block: null, tool: "pencil", size: 1 };
  /** What one brush stroke has already painted, so it counts as a single undo step. */
  let stroke = null;
  /** How far the blocks fade out, to see the ground underneath. */
  let opacity = 1;

  /**
   * Plans: the boards an account keeps on the server, one step above the local draft of
   * `draft.js`.
   *
   * An anonymous visitor never sees this menu: `spacesApi.whoAmI()` answers `null`, and
   * they keep exactly what they had before this feature, the local draft alone, on one
   * machine, for seven days. Signing in is what buys the plans; nothing here gates the
   * editor itself, which builds the same either way.
   */
  const spacesMenu = host.querySelector(".editor-spaces");
  const spacesMenuList = spacesMenu.querySelector(".menu-list");
  const spacesSummary = spacesMenu.querySelector("summary");

  /** The open space, or nothing while none has been chosen: the local draft serves then. */
  let currentSpace = null;
  /** The open space's deferred saver, stopped and replaced on every switch. */
  let saver = null;

  function spaceStatusWord(status, detail) {
    if (status === "saving") return "enregistrement…";
    if (status === "failed") return `échec : ${detail}`;
    return "enregistré";
  }

  /** The menu's summary carries the save state: a save that fails silently on a flaky
      connection would cost somebody an afternoon of work. */
  function updateSpacesSummary(status, detail) {
    spacesSummary.textContent = currentSpace
      ? `${currentSpace.name} · ${spaceStatusWord(status, detail)}`
      : "Mes plans";
    spacesSummary.classList.toggle("bad", status === "failed");
  }

  async function renderSpacesMenu() {
    let mine = [];
    try {
      mine = await spacesApi.listSpaces();
    } catch {
      /* Offline, or a session that expired in the meantime: the menu opens anyway, empty
         rather than failing loudly over a mere list. */
    }
    spacesMenuList.innerHTML = `<button type="button" class="space-new" data-space="new">
        + Nouveau plan</button>`
      + (mine.length ? "" : `<span class="menu-heading">Aucun plan encore</span>`)
      + mine.map((space) => `
        <div class="space-row" data-slug="${escapeText(space.slug)}">
          <button type="button" class="child" data-space="open">${escapeText(space.name)}</button>
          <button type="button" class="space-icon" data-space="rename" title="Renommer">✎</button>
          <button type="button" class="space-icon" data-space="delete" title="Supprimer">✕</button>
        </div>`).join("");
  }

  spacesMenu.addEventListener("toggle", () => { if (spacesMenu.open) renderSpacesMenu(); });

  /* Same reason as `closeSiteMenu` just above: `<details>` does not close itself on an
     outside click. */
  const closeSpacesMenu = (event) => {
    if (spacesMenu.open && !spacesMenu.contains(event.target)) spacesMenu.open = false;
  };
  document.addEventListener("click", closeSpacesMenu);

  /** Load a space into the already mounted editor, without unmounting and remounting it. */
  async function openSpaceBySlug(slug) {
    saver?.stop();
    let opened;
    try {
      opened = await spacesApi.openSpace(slug);
    } catch (error) {
      flash(`plan introuvable : ${error.message}`);
      return;
    }
    board.load(opened.board);
    currentSpace = { slug: opened.slug, name: opened.name };
    saver = spacesApi.autosave(slug, { onStatus: updateSpacesSummary });
    /* An opened space is a fresh context: the selection, the active frame and the orphan
       warning from another plan have nothing to say about this one. */
    activeFrameId = null;
    selection = null;
    picking = null;
    pasting = null;
    orphanWarned = false;
    camera.frame(board.frames.length ? board.framesBox() : board.box(), viewportOf());
    updateSpacesSummary("saved");
    say();
    paint();
  }

  /** Save the current board as a new plan, then open it. */
  async function createSpaceFromCurrent() {
    const name = window.prompt("Nom du plan", currentSpace?.name || "sans nom");
    if (!name) return;
    try {
      const created = await spacesApi.createSpace(name, board.snapshot());
      saver?.stop();
      currentSpace = { slug: created.slug, name: created.name };
      saver = spacesApi.autosave(created.slug, { onStatus: updateSpacesSummary });
      updateSpacesSummary("saved");
    } catch (error) {
      flash(`plan pas enregistré : ${error.message}`);
    }
  }

  async function renameSpaceBySlug(slug, row) {
    const label = row.querySelector('[data-space="open"]');
    const name = window.prompt("Nom du plan", label.textContent);
    if (!name || name === label.textContent) return;
    try {
      await spacesApi.renameSpace(slug, name);
      label.textContent = name;
      if (currentSpace?.slug === slug) {
        currentSpace.name = name;
        updateSpacesSummary("saved");
      }
    } catch (error) {
      flash(`pas renommé : ${error.message}`);
    }
  }

  async function deleteSpaceBySlug(slug, row) {
    // Asked once, because it is final: the same caution as deleting a schematic elsewhere
    // on this site.
    if (!window.confirm("Supprimer ce plan ? C'est définitif.")) return;
    try {
      await spacesApi.deleteSpace(slug);
      row.remove();
      if (currentSpace?.slug === slug) {
        saver?.stop();
        saver = null;
        currentSpace = null;
        updateSpacesSummary();
      }
    } catch (error) {
      flash(`pas supprimé : ${error.message}`);
    }
  }

  spacesMenuList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-space]");
    if (!button) return;
    const row = button.closest(".space-row");
    const slug = row?.dataset.slug;
    const action = button.dataset.space;
    if (action === "new") createSpaceFromCurrent();
    else if (action === "open" && slug) openSpaceBySlug(slug);
    else if (action === "rename" && slug) renameSpaceBySlug(slug, row);
    else if (action === "delete" && slug) deleteSpaceBySlug(slug, row);
    if (action !== "rename" && action !== "delete") spacesMenu.open = false;
  });

  /** Save now rather than waiting out the delay, for the tab that is closing. */
  const onBeforeUnload = () => { if (currentSpace) saver?.flush(board.snapshot()); };
  window.addEventListener("beforeunload", onBeforeUnload);

  function viewportOf() {
    return { width: stage.clientWidth || 800, height: stage.clientHeight || 600 };
  }

  const rail = mountRail({
    host: host.querySelector(".editor-rail"),
    catalogue,
    onPick(name) {
      held = name;
      rotation = 0;
      heldConfig = null;
      rail.setHeld(held, rotation);
      say();
      paint();
    },
    onTab(which, fade) {
      painting = which === "ground";
      opacity = fade;
      /* Moving to the ground tab puts down whatever was held: keeping a block in hand
         while painting would give a conveyor ghost on top of the brush, and a left click
         that no longer knows which of the two it serves. */
      if (painting && held) {
        held = null;
        rail.setHeld(null);
      }
      selection = null;
      linking = null;
      showPickBar();
      say();
      paint();
    },
    onBrush(state, what) {
      brush = state;
      if (what === "wipe" && Object.keys(board.ground).length) {
        const wipe = {};
        for (const cell of Object.keys(board.ground)) wipe[cell] = null;
        commit({ paint: wipe });
      }
      say();
      paint();
    },
  });

  /** The status bar says the gestures of the moment, not every gesture there is. */
  function say() {
    if (linking) {
      hints.innerHTML = isNode(linking)
        ? `<strong>${linking.block}</strong> armé · <kbd>clic</kbd> sur un bloc vert pour
           l'y relier, <kbd>reclic</kbd> pour couper · <kbd>échap</kbd> terminer`
        : `<strong>${linking.block}</strong> armé ·
           <kbd>clic</kbd> sur un pont vert pour le viser ·
           <kbd>clic dessus</kbd> pour couper sa liaison · <kbd>échap</kbd> annuler`;
      return;
    }
    if (pasting) {
      hints.innerHTML = `<strong>${pasting.length} blocs</strong> à poser ·
        <kbd>clic</kbd> poser · <kbd>maj+clic</kbd> poser en série · <kbd>échap</kbd> annuler`;
      return;
    }
    if (selection) {
      hints.innerHTML = `<strong>${picked().length} blocs</strong> sélectionnés ·
        <kbd>glisser dedans</kbd> déplacer · <kbd>Z</kbd> <kbd>X</kbd> miroirs ·
        <kbd>ctrl+C</kbd> copier · <kbd>suppr</kbd> supprimer · <kbd>échap</kbd> désélectionner`;
      return;
    }
    if (painting) {
      hints.innerHTML = brush.block || brush.tool === "eraser"
        ? `<strong>${brush.block || "gomme"}</strong> au pinceau ·
           <kbd>glisser</kbd> peindre · <kbd>ctrl+Z</kbd> annuler le trait ·
           les blocs sont fondus pour qu'on voie dessous`
        : `Choisis un sol, un minerai ou un mur à gauche · une case sans sol peint n'a
           aucune règle`;
      return;
    }
    if (turning) {
      hints.innerHTML = `<kbd>R</kbd> tenu · <strong>molette</strong> sur un bloc posé
        pour le tourner sur place`;
      return;
    }
    if (selecting) {
      hints.innerHTML = `<kbd>F</kbd> tenu · <strong>glisse</strong> pour sélectionner une zone`;
      return;
    }
    if (framing) {
      hints.innerHTML = `<kbd>C</kbd> tenu · <strong>glisse</strong> pour dessiner un cadre,
        ${MAX_SIZE} tuiles de côté au plus`;
      return;
    }
    hints.innerHTML = held
      ? `<strong>${held}</strong> en main · <kbd>molette</kbd> tourner ·
         <kbd>glisser</kbd> tracer · <kbd>ctrl</kbd> diagonale ·
         <kbd>clic droit</kbd> casser · <kbd>échap</kbd> reposer`
      : `Choisis un bloc à gauche · <kbd>F</kbd> sélectionner · <kbd>C</kbd> dessiner un cadre ·
         <kbd>clic milieu</kbd> reprendre un bloc · <kbd>ctrl+V</kbd> coller ·
         <kbd>ctrl+Z</kbd> annuler`;
  }

  /**
   * What the gesture in progress would place.
   *
   * A click without a drag and a drag are the same gesture seen at two moments: as long as
   * the button is not released, the line is recomputed under the cursor. Treating them
   * separately gave two code paths for one intention, and one of the two always ends up
   * diverging from the other.
   */
  function pending() {
    if (!held || !cursor) return [];
    const from = drawing || cursor;
    const plans = lineOf(from, cursor, held, catalogue, rotation, { diagonal, board });
    if (!heldConfig) return plans;
    /* The configuration only follows the blocks still of the type being held: a drag can
       have turned some plans into junctions or bridges, and pasting a sorter's
       configuration onto those would write nonsense into the file. */
    return plans.map((plan) => (plan.block === held ? { ...plan, config: heldConfig } : plan));
  }

  /** What a selection move would place, at its new position. */
  function moved() {
    if (!moving || !cursor) return [];
    return translate(moving.tiles, cursor.x - moving.from.x, cursor.y - moving.from.y);
  }

  /* ------------------------------------------------------------------------------------
     Frames: a named rectangle, drawn by hand, of at most 64 by 64.

     With no frame at all, the whole board stands in for one, capped at 64 exactly as
     before this feature: a player building a single thing never meets the word "cadre".
     As soon as a frame exists, placing a block is no longer bounded at 64 anywhere on the
     board: that ceiling now applies to the frame itself, checked while drawing and never
     while placing, and the board becomes the bounded unit, at 256.
     ------------------------------------------------------------------------------------ */

  /** The frame the gauge and the dimming should show: the active one, or failing that the
      last drawn, so the gauge is never left empty once a frame exists. */
  function currentFrame() {
    return board.frames.find((frame) => frame.id === activeFrameId)
      || board.frames[board.frames.length - 1]
      || null;
  }

  /** An identifier that survives a page reload is of no use here: it only serves to find a
      frame again across its own renamings, for the length of one session. */
  const nextFrameId = () => `cadre-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  /** Finish drawing a frame: a hard refusal beyond 64 by 64, as the game would do on
      opening a schematic that size. */
  function finishFrame(rect) {
    if (!legalFrame(rect)) {
      flash(`${MAX_SIZE} tuiles de côté au plus pour un cadre`);
      return;
    }
    const created = { id: nextFrameId(), name: `cadre ${board.frames.length + 1}`, ...rect };
    commit({ addFrames: [created] });
    activeFrameId = created.id;
  }

  /** Removing, renaming, moving or resizing a frame all go through remove then put back,
      like a block being replaced: there is no editing in place, and the frame's identity
      only survives through its `id`. */
  function replaceFrame(frame, changes) {
    const after = { ...frame, ...changes };
    commit({ removeFrames: [frame], addFrames: [after] });
    activeFrameId = after.id;
  }

  /* ------------------------------------------------------------------------------------
     Painting the ground.

     One brush stroke is **one** undo step, like a line of conveyors: the tiles touched
     are accumulated while the button is held and applied all at once on release. Applying
     them tile by tile would fill the history with three hundred entries for a single
     movement of the hand.
     ------------------------------------------------------------------------------------ */

  /** The tiles one stroke of the pencil covers, centred on the cursor. */
  function dab(point) {
    const reach = Math.floor(brush.size / 2);
    const cells = [];
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) cells.push([point.x + dx, point.y + dy]);
    }
    return cells;
  }

  /** The tiles of a rectangle, bounds included. */
  function area(from, to) {
    const cells = [];
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) {
      for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) cells.push([x, y]);
    }
    return cells;
  }

  /**
   * The paint bucket: the contiguous area carrying the same floor as the tile clicked.
   *
   * Bounded to the schematic's box widened by twenty tiles. Without a bound, a bucket
   * clicked on empty space sets off to fill an infinite plane and never returns: the
   * terrain has no edge, unlike a map in the game.
   */
  function fill(point) {
    const box = board.box();
    const margin = 20;
    const left = Math.min(box.left, point.x) - margin;
    const bottom = Math.min(box.bottom, point.y) - margin;
    const right = Math.max(box.left + box.width, point.x) + margin;
    const top = Math.max(box.bottom + box.height, point.y) + margin;

    const same = (x, y) => (board.ground[`${x},${y}`]?.[brush.layer] ?? null)
      === (board.ground[`${point.x},${point.y}`]?.[brush.layer] ?? null);

    const cells = [];
    const seen = new Set();
    const queue = [[point.x, point.y]];
    while (queue.length) {
      const [x, y] = queue.pop();
      const key = `${x},${y}`;
      if (seen.has(key) || x < left || x > right || y < bottom || y > top) continue;
      seen.add(key);
      if (!same(x, y)) continue;
      cells.push([x, y]);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return cells;
  }

  /** What painting these tiles would change, in the shape `board.apply` expects. */
  function strokeOf(cells) {
    const out = {};
    for (const [x, y] of cells) {
      const key = `${x},${y}`;
      if (brush.tool === "eraser") { out[key] = null; continue; }
      if (!brush.block) continue;
      /* Ore dropped on a bare tile brings stone along with it: the game has no floating
         ore, and an overlay with no floor under it does not exist. */
      const under = board.ground[key];
      out[key] = brush.layer === "overlay" && !under?.floor
        ? { floor: "stone", overlay: brush.block }
        : { [brush.layer]: brush.block };
    }
    return out;
  }

  /** Is the tile inside the selection that was kept? */
  const insideSelection = (point) => selection && point
    && point.x >= selection.left && point.x < selection.left + selection.width
    && point.y >= selection.bottom && point.y < selection.bottom + selection.height;

  /**
   * The longest start of a batch that still fits inside the 64 by 64.
   *
   * By bisection rather than by dropping one block at a time: measuring the box costs a
   * walk of the whole board, and a hundred-block drag on a four thousand block base would
   * take a hundred walks where seven are enough.
   */
  function fitting(plans) {
    if (board.fits(plans)) return plans.length;
    let low = 0;
    let high = plans.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (board.fits(plans.slice(0, middle))) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  /**
   * The verdict on each block of a batch.
   *
   * A drag that runs too long places what fits and refuses the rest, instead of refusing
   * the lot. Refusing everything was the first behaviour, and on a hundred-tile drag it
   * gave back an empty hand explaining nothing: the player made a gesture, and they should
   * get whatever was legal in it.
   */
  function judge(plans, ignore = null) {
    /* The blocks a move carries away are taken off the board for the length of the
       judgement. Without that, moving a selection by a single tile declares it illegal
       from end to end: every block trips over the copy of itself it is in the process of
       leaving, and the ghost is red everywhere with no way to tell why. */
    const kept = board.tiles;
    if (ignore && ignore.length) {
      const leaving = new Set(ignore);
      board.tiles = kept.filter((tile) => !leaving.has(tile));
    }
    try {
      const keep = fitting(plans);
      const batch = plans.slice(0, keep);
      return plans.map((plan, i) => ({
        plan,
        verdict: i < keep
          ? canPlace(board, plan, catalogue, batch)
          : { ok: false, why: "64 tuiles de côté, le jeu n'en accepte pas plus" },
      }));
    } finally {
      board.tiles = kept;
    }
  }

  /**
   * Give every bridge back the tile it aims at, so the renderer draws the span.
   *
   * `render.js` only draws a bridge if it carries a `link` field in absolute coordinates,
   * and it deliberately refuses to infer one from the raw offset: in real schematics, five
   * bridges claimed to reach 365 tiles and drew as bars across the whole image. The
   * analysis therefore validates it against the block's own reach.
   *
   * Here the editor creates the link itself, but setting it once is not enough: a bridge
   * that is moved, rotated or undone would keep a link to a tile where there is nothing
   * left. Recomputed every frame, against the reach, it cannot lie.
   */
  function relink() {
    for (const tile of board.tiles) {
      const block = catalogue.blocks[tile.block];
      if (!linksByConfig(block)) continue;
      const reach = reachOf(block);
      const config = tile.config;
      if (!config || config.type !== 7 || !reach) { tile.link = null; continue; }
      const far = Math.max(Math.abs(config.dx), Math.abs(config.dy));
      const target = board.at(tile.x + config.dx, tile.y + config.dy);
      tile.link = far <= reach && target?.block === tile.block
        ? [tile.x + config.dx, tile.y + config.dy] : null;
    }
  }

  /**
   * Where the continuous save goes: the open plan if there is one, the local draft
   * otherwise.
   *
   * Never both at once. Writing to the local draft as well while a plan is open would, on
   * the next visit, offer to pick that draft back up for content already safe in a named
   * plan: an offer that would make no sense.
   */
  function saveProgress() {
    if (currentSpace) saver?.schedule(board.snapshot());
    else keepDraft(board, Date.now());
  }

  /**
   * Everything that changes the board goes through here.
   *
   * A single entry point for applying a gesture, and therefore a single place where the
   * draft is updated. Scattering the save across the fifteen calls to `board.apply` would
   * guarantee that one gets forgotten, and that the draft lies about exactly that case.
   */
  function commit(change) {
    const done = board.apply(change);
    if (done) {
      saveProgress();
      /* Said once, on the first block that lands outside every frame, never again: it is a
         reminder, not an alarm coming back on every gesture that places another. With no
         frame at all the whole board stands in for one, and nothing is orphaned. */
      if (change.place?.length && !orphanWarned && board.orphans().length) {
        orphanWarned = true;
        flash("un bloc hors de tout cadre ne s'exportera pas");
      }
    }
    return done;
  }

  function paint() {
    relink();
    const viewport = viewportOf();
    draw(canvas, board.tiles, sizeOf, roleOf, {
      camera, viewport, ground: board.ground, grid: true, opacity,
    });
    /* With no frame at all, the gauge measures the whole board, exactly as before this
       feature. As soon as a frame exists, it measures what the frame holds, not what it
       was drawn to hold: the useful box, not the drawn box. */
    const active = board.frames.length ? currentFrame() : null;
    updateGauge(active ? board.frameBox(active) : board.box(), MAX_SIZE, active?.name || null);
    dimAroundFrame(viewport, active);
    drawFrames(viewport, active);
    turnButton.hidden = !(held && catalogue.blocks[held]?.rotate);
    outline(viewport);
    linkable(viewport);
    if (painting) brushGhost(viewport);
    else ghost(viewport);
    frameGhost(viewport);
    showPickBar();
    showFrameBars(viewport);
  }

  /**
   * The board dimmed around the active frame, so it stands out from the other worksites
   * without them disappearing: they stay visible, only duller.
   */
  function dimAroundFrame(viewport, active) {
    if (!active) return;
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    const { px, py } = camera.rectOf(active.left, active.bottom + active.height - 1, viewport);
    const w = active.width * camera.scale;
    const h = active.height * camera.scale;
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "rgba(6, 8, 14, .5)";
    context.fillRect(0, 0, viewport.width, Math.max(0, py));
    context.fillRect(0, py + h, viewport.width, Math.max(0, viewport.height - (py + h)));
    context.fillRect(0, Math.max(0, py), Math.max(0, px), h);
    context.fillRect(px + w, Math.max(0, py), Math.max(0, viewport.width - (px + w)), h);
    context.restore();
  }

  /** The outline of every frame, named, the active one marked harder than the others. */
  function drawFrames(viewport, active) {
    if (!board.frames.length) return;
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const frame of board.frames) {
      const isActive = frame === active;
      const { px, py } = camera.rectOf(frame.left, frame.bottom + frame.height - 1, viewport);
      const w = frame.width * camera.scale;
      const h = frame.height * camera.scale;
      context.strokeStyle = isActive ? "#7fd7ff" : "rgba(127, 215, 255, .5)";
      context.lineWidth = isActive ? 2 : 1;
      context.setLineDash(isActive ? [] : [5, 5]);
      context.strokeRect(px + 0.5, py + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    }
    context.restore();
  }

  /** The frame being drawn, for as long as C is held and the button is too. */
  function frameGhost(viewport) {
    if (!drawingFrame || !cursor) return;
    const zone = rectOf(drawingFrame, cursor);
    const legal = legalFrame(zone);
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    const { px, py } = camera.rectOf(zone.left, zone.bottom + zone.height - 1, viewport);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = legal ? "rgba(127, 215, 255, .18)" : "rgba(255, 139, 139, .18)";
    context.strokeStyle = legal ? "#7fd7ff" : "#ff8b8b";
    context.lineWidth = 2;
    context.fillRect(px, py, zone.width * camera.scale, zone.height * camera.scale);
    context.strokeRect(px + 1, py + 1,
                       zone.width * camera.scale - 2, zone.height * camera.scale - 2);
    context.restore();
    showWhy(legal ? null : `${MAX_SIZE} tuiles de côté au plus pour un cadre`);
  }

  /**
   * The schematic's box, dashed.
   *
   * Without it, the limit of 64 exists only as figures in a corner of the screen, and you
   * find out you have reached it at the moment a placement is refused. With it, you watch
   * your schematic grow towards its frame.
   */
  function outline(viewport) {
    if (!board.tiles.length) return;
    const box = board.box();
    const { px, py } = camera.rectOf(box.left, box.bottom + box.height - 1, viewport);
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const full = Math.max(box.width, box.height) >= MAX_SIZE;
    context.strokeStyle = full ? "rgba(255, 139, 139, .85)" : "rgba(255, 211, 127, .45)";
    context.lineWidth = 1;
    context.setLineDash([4, 4]);
    context.strokeRect(px - 0.5, py - 0.5,
                       box.width * camera.scale + 1, box.height * camera.scale + 1);
    context.restore();
  }

  /**
   * The ghosts of what the gesture would place, drawn over the render.
   *
   * Green or red, one per block, and the reason for the refusal just under the cursor. A
   * silent refusal is what the previous editor did, and nobody guessed that an occupied
   * tile was refusing the placement.
   */
  function ghost(viewport) {
    if (picking || selection) frame(viewport);
    const plans = moving ? moved() : pasting ? pastedAt() : pending();
    if (erasing) {
      erased(viewport);
      showWhy(null);
      return;
    }
    if (!plans.length) {
      showWhy(null);
      return;
    }
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;

    let why = null;
    for (const { plan, verdict } of judge(plans, moving?.tiles)) {
      if (!verdict.ok) why = verdict.why;

      const size = sizeOf(plan.block);
      const offset = Math.trunc(-(size - 1) / 2);
      const { px, py } = camera.rectOf(plan.x + offset, plan.y + offset + size - 1, viewport);
      const span = camera.scale * size;

      const art = spriteOf(plan.block);
      if (art) {
        context.globalAlpha = 0.55;
        context.drawImage(art.sheet, art.x, art.y, art.w, art.h, px, py, span, span);
        context.globalAlpha = 1;
      }
      context.fillStyle = verdict.ok ? "rgba(132, 217, 139, .25)" : "rgba(255, 139, 139, .35)";
      context.fillRect(px, py, span, span);
      context.strokeStyle = verdict.ok ? "#84d98b" : "#ff8b8b";
      context.lineWidth = 2;
      context.strokeRect(px + 1, py + 1, span - 2, span - 2);

      // The game's own arrow, for blocks that have a direction. On a drawn line it says
      // the direction of every segment, corners included.
      if (catalogue.blocks[plan.block]?.rotate && camera.scale >= 12) {
        context.fillStyle = verdict.ok ? "#84d98b" : "#ff8b8b";
        context.font = `${Math.max(10, camera.scale * 0.6)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(["→", "↑", "←", "↓"][plan.rotation % 4],
                         px + span / 2, py + span / 2);
      }
    }
    context.restore();
    showWhy(why);
  }

  /** The selection's amber box, whether being drawn or already kept. */
  function frame(viewport) {
    const zone = picking ? rectOf(picking, cursor) : selection;
    if (!zone) return;
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    const { px, py } = camera.rectOf(zone.left, zone.bottom + zone.height - 1, viewport);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "rgba(255, 211, 127, .12)";
    context.strokeStyle = "#ffd37f";
    context.lineWidth = 2;
    context.fillRect(px, py, zone.width * camera.scale, zone.height * camera.scale);
    context.strokeRect(px + 1, py + 1,
                       zone.width * camera.scale - 2, zone.height * camera.scale - 2);
    context.restore();
  }

  /**
   * The brush's footprint, under the cursor.
   *
   * A brush you cannot see is a brush used by guesswork: an adjustable size is worth
   * nothing if you do not know what it covers before clicking.
   */
  function brushGhost(viewport) {
    if (!cursor) return;
    const cells = stroke
      ? (brush.tool === "rect" ? area(stroke.from, cursor) : stroke.cells)
      : (brush.tool === "rect" || brush.tool === "bucket" ? [[cursor.x, cursor.y]] : dab(cursor));

    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gomme = brush.tool === "eraser";
    context.fillStyle = gomme ? "rgba(255, 139, 139, .25)" : "rgba(255, 211, 127, .22)";
    context.strokeStyle = gomme ? "#ff8b8b" : "#ffd37f";
    context.lineWidth = 1;
    for (const [x, y] of cells) {
      const { px, py, size } = camera.rectOf(x, y, viewport);
      context.fillRect(px, py, size, size);
    }
    // The outline only follows the edge of the gesture, not every tile: an amber grid over
    // three hundred tiles is unreadable.
    if (cells.length <= 81) {
      for (const [x, y] of cells) {
        const { px, py, size } = camera.rectOf(x, y, viewport);
        context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }
    }
    context.restore();
  }

  /** The red preview of a rectangular break, for as long as the right button is held. */
  function erased(viewport) {
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    const zone = rectOf(erasing, cursor);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { px, py } = camera.rectOf(zone.left, zone.bottom + zone.height - 1, viewport);
    context.fillStyle = "rgba(255, 139, 139, .2)";
    context.strokeStyle = "#ff8b8b";
    context.lineWidth = 2;
    context.fillRect(px, py, zone.width * camera.scale, zone.height * camera.scale);
    context.strokeRect(px + 1, py + 1,
                       zone.width * camera.scale - 2, zone.height * camera.scale - 2);
    context.restore();
  }

  function showWhy(text) {
    if (refusal && !text) {
      refusal.remove();
      refusal = null;
      return;
    }
    if (!text) return;
    if (!refusal) {
      refusal = document.createElement("div");
      refusal.className = "editor-why";
      stage.appendChild(refusal);
    }
    refusal.textContent = text;
    const viewport = viewportOf();
    const { px, py } = camera.rectOf(cursor.x, cursor.y, viewport);

    /* The bubble flips to the other side of the cursor when it would leave the view.
       Without that, the most useful refusal, the one triggered by pushing towards the
       edge, is also the only one that cannot be read. */
    const width = refusal.offsetWidth || 200;
    const height = refusal.offsetHeight || 24;
    const flipX = px + width + 28 > viewport.width;
    const flipY = py + height + 28 > viewport.height;
    refusal.style.left = `${flipX ? px - width - 28 : px}px`;
    refusal.style.top = `${flipY ? py - height - 28 : py}px`;
  }

  /** The box between two tiles, bounds included, whichever way the drag went. */
  function rectOf(a, b) {
    const left = Math.min(a.x, b.x);
    const bottom = Math.min(a.y, b.y);
    return {
      left, bottom,
      width: Math.abs(a.x - b.x) + 1,
      height: Math.abs(a.y - b.y) + 1,
    };
  }

  /** Everything an area touches, even by a single tile of a large block. */
  function inside(zone) {
    return board.tiles.filter((tile) => footprint(tile, sizeOf).some(([x, y]) =>
      x >= zone.left && x < zone.left + zone.width
      && y >= zone.bottom && y < zone.bottom + zone.height));
  }

  const tileUnder = (event) => {
    const rect = canvas.getBoundingClientRect();
    return camera.toTile(event.clientX - rect.left, event.clientY - rect.top, viewportOf());
  };

  /* Place, break, move. The middle button pans the view, the right one breaks, the left
     one places: the game's own split, minus the wheel, which zooms here. */
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    /* Hand control back to the board. Clicking a non-focusable element does not move the
       focus: after typing three letters into the search box, it stayed there, and the
       guard "do not intercept keys inside a text field" then killed **every** shortcut
       with nothing saying so. */
    canvas.focus({ preventScroll: true });
    cursor = tileUnder(event);

    /* The middle click does two things depending on whether it drags: pressed and released
       in place it picks up the block under it, pressed and pulled it pans the view. That is
       what the game does, and it saves one more key for the pipette. */
    if (event.button === 1 || spacing) {
      panning = { x: event.clientX, y: event.clientY, moved: false };
      return;
    }
    if (event.button === 2) {
      erasing = cursor;
      paint();
      return;
    }
    /* The pipette tool takes over the left click the same way the brush does below, and has
       to be checked first: it needs neither `brush.block` nor the eraser to be armed, which
       is exactly what the check below requires. */
    if (painting && event.button === 0 && brush.tool === "pipette") {
      pipetteGround();
      return;
    }
    /* The brush comes before everything else while the ground tab is open: there, a left
       click paints, and nothing else. */
    if (painting && event.button === 0 && (brush.block || brush.tool === "eraser")) {
      if (brush.tool === "bucket") {
        commit({ paint: strokeOf(fill(cursor)) });
        paint();
        return;
      }
      stroke = { from: cursor, cells: brush.tool === "rect" ? [] : dab(cursor) };
      paint();
      return;
    }
    if (event.button === 0 && pasting) {
      const posable = pastedAt().filter((plan) =>
        canPlace(board, plan, catalogue, pastedAt()).ok);
      if (posable.length) commit({ place: posable });
      if (!event.shiftKey) pasting = null;   // shift held: paste repeatedly
      say();
      paint();
      return;
    }
    /* Grabbing the selection itself moves it. That is the gesture expected everywhere else
       and it was missing: a selection could be turned and mirrored, but not moved, which
       is the number one reason to make one. */
    if (event.button === 0 && !selecting && insideSelection(cursor)) {
      moving = { from: cursor, tiles: picked() };
      paint();
      return;
    }
    if (event.button === 0 && selecting) {
      picking = cursor;
      selection = null;
      showPickBar();
      paint();
      return;
    }
    if (event.button === 0 && framing) {
      drawingFrame = cursor;
      paint();
      return;
    }
    if (event.button === 0 && held) {
      drawing = cursor;
      paint();
      return;
    }
    if (event.button === 0) poke(cursor);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panning) {
      camera.pan(event.clientX - panning.x, event.clientY - panning.y);
      panning = { x: event.clientX, y: event.clientY, moved: true };
      paint();
      return;
    }
    const was = cursor;
    cursor = tileUnder(event);
    if (was && was.x === cursor.x && was.y === cursor.y) return;
    /* The pencil accumulates as the stroke goes; the rectangle recomputes on every move,
       since its whole shape depends on where the cursor is now. */
    if (stroke && brush.tool !== "rect") stroke.cells.push(...dab(cursor));
    paint();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (panning) {
      if (!panning.moved) pipette();
      panning = null;
      return;
    }
    cursor = tileUnder(event);

    if (stroke) {
      const cells = brush.tool === "rect" ? area(stroke.from, cursor) : stroke.cells;
      stroke = null;
      const change = strokeOf(cells);
      if (Object.keys(change).length) commit({ paint: change });
      paint();
      return;
    }
    if (moving) {
      const after = moved();
      const before = moving.tiles;
      moving = null;
      /* Remove and place back in a single gesture: otherwise a one-tile move takes the
         blocks off and puts them back on themselves, and undoing it takes two. */
      if (after.length) {
        commit({ remove: before, place: after });
        selection = boxAround(after);
      }
      showPickBar();
      paint();
      return;
    }
    if (picking) {
      const zone = rectOf(picking, cursor);
      picking = null;
      selection = inBox(board.tiles, zone, sizeOf).length ? zone : null;
      showPickBar();
      say();
      paint();
      return;
    }
    if (drawingFrame) {
      const zone = rectOf(drawingFrame, cursor);
      drawingFrame = null;
      finishFrame(zone);
      say();
      paint();
      return;
    }
    if (erasing) {
      const gone = inside(rectOf(erasing, cursor));
      erasing = null;
      if (gone.length) commit({ remove: gone });
      paint();
      return;
    }
    if (drawing) {
      /* The whole line goes down as one gesture, and so as one history entry: a drag of
         thirty conveyors comes back with one ctrl+Z, not thirty. */
      const posable = judge(pending())
        .filter(({ verdict }) => verdict.ok)
        .map(({ plan }) => plan);
      drawing = null;
      if (posable.length) commit({ place: posable });
      paint();
    }
  });

  canvas.addEventListener("pointercancel", () => {
    panning = null;
    drawing = null;
    erasing = null;
    drawingFrame = null;
    paint();
  });

  canvas.addEventListener("pointerleave", () => {
    cursor = null;
    paint();
  });

  /* Without this, breaking a block opens the browser's context menu over the board. */
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  /**
   * The wheel, which does two things depending on what is held.
   *
   * The game decides it that way and it is well judged: `Binding.rotate` and `Binding.zoom`
   * are **both** on the wheel, and `DesktopInput` settles it by looking at whether a
   * rotatable block is in hand. Rotating is the gesture made a hundred times while
   * building; zooming, the one made between two builds.
   *
   * Ctrl forces the zoom, exactly as in the game, to pull back without putting down what
   * is held. And R held over a placed block rotates it in place, which the game calls
   * `rotatePlaced` and which only works on `quickRotate` blocks.
   */
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const way = event.deltaY > 0 ? -1 : 1;

    if (turning && cursor) {
      const under = board.at(cursor.x, cursor.y);
      const block = under && catalogue.blocks[under.block];
      if (block?.rotate && block?.quick_rotate) {
        commit({
          remove: [under],
          place: [{ ...under, rotation: ((((under.rotation || 0) + way) % 4) + 4) % 4 }],
        });
        paint();
        return;
      }
    }

    if (held && catalogue.blocks[held]?.rotate && !event.ctrlKey && !event.metaKey) {
      rotation = (((rotation + way) % 4) + 4) % 4;
      rail.setHeld(held, rotation);
      paint();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    camera.zoomAt(way > 0 ? 1.18 : 0.85,
                  event.clientX - rect.left, event.clientY - rect.top, viewportOf());
    paint();
  }, { passive: false });

  /* ----------------------------------------------------------------------------------
     The selection: ctrl and drag, then a floating bar set down beside it.

     Beside it rather than in the rail: a bar at the other end of the screen forces you to
     look away from what it acts on, and to cross a thousand pixels for every quarter
     turn.
     ---------------------------------------------------------------------------------- */

  const picked = () => (selection ? inBox(board.tiles, selection, sizeOf) : []);

  /** Replace the selection with its transformed version, as one history entry. */
  function reshape(change) {
    const before = picked();
    if (!before.length) return;
    const after = change(before);
    commit({ remove: before, place: after });
    selection = boxAround(after);
    paint();
  }

  /** The box around a group of blocks, footprints included. */
  function boxAround(tiles) {
    if (!tiles.length) return null;
    let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
    for (const tile of tiles) {
      for (const [x, y] of footprint(tile, sizeOf)) {
        left = Math.min(left, x); bottom = Math.min(bottom, y);
        right = Math.max(right, x); top = Math.max(top, y);
      }
    }
    return { left, bottom, width: right - left + 1, height: top - bottom + 1 };
  }

  /**
   * Copy blocks, into the editor and into the system clipboard.
   *
   * Both, because they are two uses: pasting elsewhere on the same board, and pasting into
   * the game. The second is what makes this editor something other than a toy, and
   * `schematic.js` already knows how to write the format the game reads. Shared between a
   * selection and a frame: both are only a list of blocks to write, and a name to put on
   * the label.
   */
  async function copyTiles(chosen, tag) {
    if (!chosen.length) return;
    clipboard = chosen.map((tile) => ({ ...tile }));
    /* The write is raced against one second: it is normally granted inside a user gesture,
       but a refusal that never comes must not leave the player in front of an interface
       that has stopped answering. */
    try {
      const code = await toBase64(clipboard, {
        tags: { name: tag },
        sizeOf,
        priorityOf: (name) => catalogue.blocks[name]?.schematic_priority || 0,
      });
      await Promise.race([
        navigator.clipboard.writeText(code),
        new Promise((_, fail) => setTimeout(() => fail(new Error("trop long")), 1000)),
      ]);
      flash(`${clipboard.length} blocs copiés, collables dans le jeu`);
    } catch {
      flash(`${clipboard.length} blocs copiés dans l'éditeur`);
    }
  }

  const copy = () => copyTiles(picked(), "selection");
  const copyFrame = (frame) => copyTiles(board.tilesIn(frame), frame.name);

  /**
   * Paste what was copied, from the editor or from the game.
   *
   * The system clipboard arrives through the browser's `paste` event, further down, and
   * not through `navigator.clipboard.readText()`. The difference is not cosmetic: the
   * direct read asks for a permission, and where it is neither granted nor refused it
   * **hangs the promise indefinitely**. Measured here: the first attempt froze the page on
   * every ctrl+V. The `paste` event asks for nothing, because the user is the one who
   * triggered it.
   *
   * This function therefore only serves as the fallback: pasting back what was copied
   * inside the editor, when the system clipboard has nothing for us.
   */
  function paste(coming = clipboard) {
    if (!coming || !coming.length) {
      flash("rien à coller");
      return;
    }
    pasting = coming.map((tile) => ({ ...tile, rotation: tile.rotation || 0 }));
    selection = null;
    showPickBar();
    say();
    paint();
  }

  /** What the paste would place, brought back under the cursor. */
  function pastedAt() {
    if (!pasting || !cursor) return [];
    const box = boxAround(pasting);
    return translate(pasting, cursor.x - box.left, cursor.y - box.bottom);
  }

  const pickBar = host.querySelector(".editor-pick");
  const picker = host.querySelector(".editor-picker");
  const frameBars = host.querySelector(".editor-frame-bars");

  function showPickBar() {
    if (!selection || !picked().length) {
      pickBar.hidden = true;
      return;
    }
    const viewport = viewportOf();
    const { px, py } = camera.rectOf(selection.left,
                                     selection.bottom + selection.height - 1, viewport);
    pickBar.hidden = false;
    pickBar.style.left = `${Math.max(4, px)}px`;
    pickBar.style.top = `${Math.max(4, py - 44)}px`;
  }

  pickBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pick]");
    if (!button) return;
    const what = button.dataset.pick;
    if (what === "copy") copy();
    if (what === "turn") reshape((tiles) => rotateBy(tiles, 1, catalogue));
    if (what === "flipx") reshape((tiles) => flip(tiles, "x", catalogue));
    if (what === "flipy") reshape((tiles) => flip(tiles, "y", catalogue));
    if (what === "drop") {
      const gone = picked();
      selection = null;
      if (gone.length) commit({ remove: gone });
      paint();
    }
  });

  /**
   * Each frame's action bar: analyse, copy, rename, delete, set down beside it rather than
   * in a panel of its own. Beside it and nowhere else, for the same reason as the
   * selection bar: looking away from what you are acting on costs more than one more
   * button on screen.
   */
  function showFrameBars(viewport) {
    const active = currentFrame();
    frameBars.innerHTML = board.frames.map((frame) => {
      const { px, py } = camera.rectOf(frame.left, frame.bottom + frame.height - 1, viewport);
      /* `editor-pick` is reused as it stands: it is already the floating bar set against a
         selection, and a frame needs nothing more than a second dressing of the same kind
         rather than one more stylesheet. */
      return `<div class="editor-pick editor-frame-bar${frame === active ? " active" : ""}"
          style="position:absolute;left:${Math.max(4, px)}px;top:${Math.max(4, py - 32)}px">
        <button type="button" data-frame="${frame.id}" data-frame-do="focus"
          title="Rendre actif">${escapeText(frame.name)}</button>
        <button type="button" data-frame="${frame.id}" data-frame-do="analyse"
          title="Analyser">Analyser</button>
        <button type="button" data-frame="${frame.id}" data-frame-do="copy"
          title="Copier, collable dans le jeu">Copier</button>
        <button type="button" data-frame="${frame.id}" data-frame-do="rename"
          title="Renommer">Renommer</button>
        <button type="button" data-frame="${frame.id}" data-frame-do="delete"
          title="Supprimer le cadre, garde ses blocs">Supprimer</button>
      </div>`;
    }).join("");
  }

  /**
   * Analysing a frame goes through a fresh board, made only of what that frame holds:
   * `onAnalyse` has only ever known a whole board, and a fresh board, valid the same way
   * as the editor's own, is what lets it go on not knowing.
   */
  function analyseFrame(frame) {
    const scoped = createBoard({
      tiles: board.tilesIn(frame), ground: board.ground, frames: [{ ...frame }], sizeOf,
    });
    onAnalyse(scoped);
  }

  function renameFrame(frame) {
    const chosen = window.prompt("Nom du cadre", frame.name);
    if (chosen === null) return;
    const name = chosen.trim();
    if (!name || name === frame.name) return;
    replaceFrame(frame, { name });
    paint();
  }

  function deleteFrame(frame) {
    commit({ removeFrames: [frame] });
    if (activeFrameId === frame.id) activeFrameId = null;
    paint();
  }

  frameBars.addEventListener("click", (event) => {
    const button = event.target.closest("[data-frame-do]");
    if (!button) return;
    const frame = board.frames.find((candidate) => candidate.id === button.dataset.frame);
    if (!frame) return;
    const what = button.dataset.frameDo;
    if (what === "focus") { activeFrameId = frame.id; paint(); }
    if (what === "analyse") analyseFrame(frame);
    if (what === "copy") copyFrame(frame);
    if (what === "rename") renameFrame(frame);
    if (what === "delete") deleteFrame(frame);
  });

  /** A word in the status bar, which clears itself. */
  let fading = null;
  function flash(message) {
    hints.innerHTML = `<strong>${message}</strong>`;
    clearTimeout(fading);
    fading = setTimeout(say, 2600);
  }

  /* ----------------------------------------------------------------------------------
     Re-aiming a bridge, as in the game.

     Clicking a placed bridge with an empty hand arms it; the next click on a bridge of the
     same type and within reach writes the link. Clicking the same bridge again cuts it.
     That is the game's own gesture, and without it there was no way to see which one talks
     to which, nor to change it: a chain laid down in one drag was frozen forever.
     ---------------------------------------------------------------------------------- */

  /** A node, which links several neighbours instead of aiming at a single one. */
  const isNode = (tile) => {
    const kind = catalogue.blocks[tile?.block]?.kind;
    return kind === "PowerNode" || kind === "BeamNode";
  };

  /**
   * The tiles an armed block can aim at.
   *
   * A bridge aims at a bridge of the same type; a node aims at **anything that consumes or
   * produces power**, which is half the game. That is the difference between aiming at a
   * twin and wiring a network, and it changes what the player is offered.
   */
  function targetsFor(tile) {
    const reach = reachOf(catalogue.blocks[tile.block]);
    const near = (other) =>
      Math.max(Math.abs(other.x - tile.x), Math.abs(other.y - tile.y)) <= reach;

    if (isNode(tile)) {
      return board.tiles.filter((other) => other !== tile && near(other)
        && (catalogue.blocks[other.block]?.consumes_power
            || catalogue.blocks[other.block]?.outputs_power_flag
            || isNode(other)));
    }
    return board.tiles.filter((other) => other !== tile && other.block === tile.block
      && near(other));
  }

  /** A position packed the way the format stores it: `(x << 16) | (y & 0xFFFF)`. */
  const packed = (tile) => ((tile.x << 16) | (tile.y & 0xFFFF));

  /**
   * Set what a block holds: a sorter's item, a source's liquid.
   *
   * A small floating palette set against the block, with each item's icon. A second click
   * on the same block clears its configuration, which the game calls `clearOnDoubleTap`
   * and which is the only way to reset a sorter without breaking it.
   */
  function offerContent(tile) {
    const choices = choicesFor(catalogue.blocks[tile.block], catalogue);
    if (!choices.length) return false;

    const already = readsAs(tile, catalogue);
    picker.innerHTML = choices.map((choice) => {
      const src = itemIcon(choice.name, 32, choice.family === "liquid" ? "liquid/" : "item/");
      return `<button type="button" data-pick-content="${choice.name}"
        title="${choice.name}" aria-pressed="${choice.name === already}">${
        src ? `<img src="${src}" alt="${choice.name}">` : choice.name.slice(0, 3)}</button>`;
    }).join("") + `<button type="button" data-pick-content="" title="Rien">∅</button>`;

    picker.dataset.at = `${tile.x},${tile.y}`;
    picker.hidden = false;
    const viewport = viewportOf();
    const { px, py } = camera.rectOf(tile.x, tile.y + 1, viewport);
    picker.style.left = `${Math.max(4, Math.min(px, viewport.width - 240))}px`;
    picker.style.top = `${Math.max(4, py - 4)}px`;
    return true;
  }

  picker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pick-content]");
    if (!button) return;
    const [x, y] = picker.dataset.at.split(",").map(Number);
    const tile = board.at(x, y);
    picker.hidden = true;
    if (!tile) return;

    const chosen = choicesFor(catalogue.blocks[tile.block], catalogue)
      .find((choice) => choice.name === button.dataset.pickContent);
    commit({
      remove: [tile],
      /* `raw` is cleared at the same time: it carries the original bytes read back from a
         file, and leaving them would replay the old configuration on write, over the one
         just chosen. */
      place: [{ ...tile, raw: undefined, config: chosen ? configFor(chosen) : null }],
    });
    say();
    paint();
  });

  /** A left click, with an empty hand, on a placed block. */
  function poke(point) {
    const under = board.at(point.x, point.y);
    picker.hidden = true;

    if (under && !linking && !isNode(under) && !linksByConfig(catalogue.blocks[under.block])
        && offerContent(under)) return;

    if (linking) {
      const armed = linking;
      linking = null;
      if (!under || under === armed) {
        /* Clicking again on the bridge just armed cuts its link, which is the only way to
           undo a link without breaking the bridge. */
        if (under === armed && armed.config) {
          commit({ remove: [armed], place: [{ ...armed, config: null, link: null }] });
        }
        say();
        paint();
        return;
      }
      if (targetsFor(armed).includes(under)) {
        if (isNode(armed)) {
          /* A node keeps a **list**: clicking a neighbour adds it, clicking the same one
             again removes it. A network is built neighbour by neighbour, not by naming a
             single chosen one the way a bridge does. */
          const links = [...(armed.config?.type === 8 ? armed.config.links : [])];
          const at = links.indexOf(packed(under));
          if (at >= 0) links.splice(at, 1);
          else links.push(packed(under));
          commit({
            remove: [armed],
            place: [{ ...armed, raw: undefined,
                      config: links.length ? { type: 8, links } : null }],
          });
          /* It stays armed: wiring a node to six machines would take the arming gesture
             six times, which is six times too many. */
          linking = board.at(armed.x, armed.y);
          say();
          paint();
          return;
        }
        commit({
          remove: [armed],
          place: [{ ...armed, link: null, raw: undefined,
                    config: { type: 7, dx: under.x - armed.x, dy: under.y - armed.y } }],
        });
      } else {
        flash("ce pont est hors de portée, ou n'est pas du même type");
      }
      say();
      paint();
      return;
    }

    if (under && (linksByConfig(catalogue.blocks[under.block]) || isNode(under))) {
      linking = under;
      say();
      paint();
    }
  }

  /** The possible targets and the line to the cursor, while a bridge is armed. */
  function linkable(viewport) {
    if (!linking) return;
    const context = canvas.getContext("2d");
    const dpr = canvas.width / (viewport.width || 1);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const middle = (tile) => {
      const { px, py, size } = camera.rectOf(tile.x, tile.y, viewport);
      return [px + size / 2, py + size / 2];
    };

    // The reach, as a square, the way the game measures it.
    const reach = reachOf(catalogue.blocks[linking.block]);
    const corner = camera.rectOf(linking.x - reach, linking.y + reach, viewport);
    context.strokeStyle = "rgba(255, 211, 127, .35)";
    context.setLineDash([3, 3]);
    context.lineWidth = 1;
    context.strokeRect(corner.px, corner.py,
                       (reach * 2 + 1) * camera.scale, (reach * 2 + 1) * camera.scale);
    context.setLineDash([]);

    for (const target of targetsFor(linking)) {
      const { px, py, size } = camera.rectOf(target.x, target.y, viewport);
      context.strokeStyle = "#84d98b";
      context.lineWidth = 2;
      context.strokeRect(px + 1, py + 1, size - 2, size - 2);
    }

    const [fromX, fromY] = middle(linking);
    context.strokeStyle = "#ffd37f";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(fromX, fromY);
    if (cursor) {
      const { px, py, size } = camera.rectOf(cursor.x, cursor.y, viewport);
      context.lineTo(px + size / 2, py + size / 2);
    }
    context.stroke();

    const { px, py, size } = camera.rectOf(linking.x, linking.y, viewport);
    context.strokeStyle = "#ffd37f";
    context.strokeRect(px + 1, py + 1, size - 2, size - 2);
    context.restore();
  }

  /**
   * Pick a block already placed back into the hand, with its rotation.
   *
   * The gesture that saves the most time when replicating a structure: without it the
   * block has to be found again in a palette of 245, then turned the right way round.
   */
  function pipette() {
    /* Gated on the ground tab: nothing is held there (`onTab` above already puts a held
       block down on the way in), and this used to fire regardless, quietly re-arming a
       phantom build block and, since Task 3, overwriting the ground status bar with it. */
    if (painting || !cursor) return;
    const under = board.at(cursor.x, cursor.y);
    if (!under) return;
    held = under.block;
    rotation = under.rotation || 0;
    /* `copyConfig`: the game brings the configuration along with the block, and 390 blocks
       allow it. Picking up a sorter set to copper only to put it back empty would be
       picking up something other than what was aimed at. */
    heldConfig = catalogue.blocks[under.block]?.copy_config ? under.config || null : null;
    rail.setHeld(held, rotation);
    say();
    paint();
  }

  /**
   * The ground pipette: samples whatever is stacked on the cursor's tile and hands it to
   * the rail, which decides which of the wall, the ore or the floor a pipette takes
   * (`pipetteLayerOf` in `ui.js`) and updates the brush, the swatches and the status bar.
   * `say()` picks the new floor up in its own hints through `brush`, already shared with
   * `mount.js` by reference.
   */
  function pipetteGround() {
    if (!cursor) return;
    if (rail.pipetteGround(board.ground[`${cursor.x},${cursor.y}`])) {
      say();
      paint();
    }
  }

  const onKey = (event) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
    if (typing) return;
    const ctrl = event.ctrlKey || event.metaKey;

    const key = event.key.toLowerCase();

    if (event.code === "Space") { spacing = true; event.preventDefault(); return; }
    /* The held keys, read off `Binding` in v159.7 rather than chosen: ctrl for the
       diagonal, F to select, R to rotate a placed block. A player arriving here already
       has those gestures in their fingers. */
    if ((event.key === "Control" || event.key === "Meta") && !diagonal) {
      diagonal = true;
      paint();
      return;
    }
    if (key === "f" && !selecting) { selecting = true; say(); return; }
    if (key === "r" && !turning) { turning = true; say(); return; }
    if (key === "c" && !framing && !ctrl) { framing = true; say(); return; }

    /* Z and X mirror the selection, like `schematicFlipX` and `schematicFlipY`. With no
       selection they do nothing, rather than mirroring the whole board. */
    if (key === "z" && !ctrl && selection) {
      reshape((tiles) => flip(tiles, "x", catalogue));
      return;
    }
    if (key === "x" && !ctrl && selection) {
      reshape((tiles) => flip(tiles, "y", catalogue));
      return;
    }
    if (ctrl && event.key.toLowerCase() === "z") {
      (event.shiftKey ? board.redo : board.undo)();
      settle();
      event.preventDefault();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "y") { board.redo(); settle(); return; }
    if (ctrl && event.key.toLowerCase() === "c") { copy(); event.preventDefault(); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && selection) {
      const gone = picked();
      selection = null;
      if (gone.length) commit({ remove: gone });
      paint();
      return;
    }
    if (event.key === "Escape" && linking) {
      linking = null;
      say();
      paint();
      return;
    }
    if (event.key === "Escape" && (selection || pasting)) {
      selection = null;
      pasting = null;
      showPickBar();
      say();
      paint();
      return;
    }
    if (event.key === "Escape" && held) {
      held = null;
      rail.setHeld(null);
      say();
      paint();
      return;
    }
    /* Q is idle in the game here, its own job (clearing a build queue) does not exist in
       this editor, so it is free to take the ground pipette: the wall, the ore or the floor
       under the cursor, wall first, in the order `ui.js`'s `pipetteLayerOf` reads a tile.
       Only on the ground tab, the one place a ground brush has anything to fill. */
    if (key === "q" && painting) { pipetteGround(); return; }
  };
  /**
   * What has to be forgotten when the board moves under your feet.
   *
   * An undo puts the blocks back where they were, but the selection stayed where they had
   * just been dragged: the amber box survived around an empty tile, with its action bar
   * acting on nothing at all. An armed bridge has the same problem if it disappears in the
   * meantime.
   */
  function settle() {
    saveProgress();
    selection = null;
    linking = null;
    showPickBar();
    say();
    paint();
  }

  const onKeyUp = (event) => {
    const key = event.key.toLowerCase();
    if (event.code === "Space") spacing = false;
    if ((event.key === "Control" || event.key === "Meta") && diagonal) {
      diagonal = false;
      paint();
    }
    if (key === "f" && selecting) { selecting = false; say(); }
    if (key === "r" && turning) { turning = false; say(); }
    if (key === "c" && framing) { framing = false; drawingFrame = null; say(); paint(); }
  };

  /**
   * What the player pastes, from the game or from anywhere else.
   *
   * It is the only channel that works without a permission, and it is also the one that
   * makes the bridge to the game real: copy a schematic in Mindustry, press ctrl+V here,
   * and watch it appear under the cursor.
   */
  const onPaste = async (event) => {
    if (/^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    const text = (event.clipboardData?.getData("text") || "").trim();
    event.preventDefault();
    if (!text) return paste();
    try {
      paste((await fromBase64(text)).tiles);
    } catch {
      /* A clipboard holding something other than a schematic is not the player's mistake:
         they may have copied a link. What was already held goes back down. */
      paste();
    }
  };

  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("paste", onPaste);

  host.querySelector('[data-do="undo"]').onclick = () => { board.undo(); settle(); };
  host.querySelector('[data-do="redo"]').onclick = () => { board.redo(); settle(); };
  host.querySelector('[data-mode="analyse"]').onclick = () => onAnalyse(board);
  host.querySelector('[data-do="help"]').onclick = () => showHelp(host);
  /* The rotation button for touch, where there is no wheel to stand in for it. It only
     appears when it is of use, which is while a rotatable block is held. */
  const turnButton = host.querySelector('[data-do="turn-held"]');
  turnButton.onclick = () => {
    rotation = (rotation + 1) % 4;
    rail.setHeld(held, rotation);
    paint();
  };

  const resize = window.ResizeObserver ? new ResizeObserver(() => paint()) : null;
  resize?.observe(stage);

  /**
   * The draft from a previous session, offered and never imposed.
   *
   * Overwriting what somebody has just pasted with a three day old draft is worse than
   * losing the draft: in one case work you knew you had is lost, in the other the work you
   * thought was in front of your eyes is.
   *
   * `signedIn` only adds a third choice, never a different behaviour from the first two:
   * an account can additionally turn that draft into a plan that will survive on another
   * device. Offered, like the rest of this bar, never done on its own at sign-in: see
   * `draft.js`'s module note at the head of that file, it still holds here.
   */
  function offerDraft(signedIn) {
    if (board.tiles.length || Object.keys(board.ground).length || board.frames.length) return;
    const kept = readDraft(Date.now());
    if (!kept) return;

    const bar = document.createElement("div");
    bar.className = "editor-draft";
    bar.innerHTML = `<span>Un brouillon de <strong>${describeDraft(kept)}</strong>
      attend, gardé ${ageOf(kept.at, Date.now())}.</span>
      <button type="button" class="primary" data-draft="take">Le reprendre</button>
      <button type="button" data-draft="drop">Repartir de zéro</button>`
      + (signedIn ? `<button type="button" data-draft="keep">Le garder comme un plan</button>` : "");
    bar.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-draft]");
      if (!button) return;
      if (button.dataset.draft === "take") {
        commit({ place: kept.tiles, paint: kept.ground, addFrames: kept.frames });
        camera.frame(board.frames.length ? board.framesBox() : board.box(), viewportOf());
      } else if (button.dataset.draft === "keep") {
        const name = window.prompt("Nom du plan", "sans nom");
        if (!name) return;
        try {
          const created = await spacesApi.importLocalDraft(name);
          currentSpace = { slug: created.slug, name: created.name };
          saver = spacesApi.autosave(created.slug, { onStatus: updateSpacesSummary });
          commit({ place: kept.tiles, paint: kept.ground, addFrames: kept.frames });
          camera.frame(board.frames.length ? board.framesBox() : board.box(), viewportOf());
          updateSpacesSummary("saved");
        } catch (error) {
          flash(`pas importé : ${error.message}`);
          return;
        }
      } else {
        dropDraft();
      }
      bar.remove();
      paint();
    });
    stage.appendChild(bar);
  }

  /**
   * Who is signed in, and therefore whether plans have a place in this session.
   *
   * An anonymous visitor comes out of here exactly as before this feature: the menu stays
   * hidden, and `offerDraft` offers only its two original choices. The editor itself is
   * never gated on this answer, only this top bar is.
   */
  async function initSpaces() {
    let me = null;
    try {
      me = await spacesApi.whoAmI();
    } catch {
      /* Offline at mount time: stay anonymous for this session rather than holding the
         editor up on a request that serves only this menu. */
    }
    spacesMenu.hidden = !me;
    offerDraft(!!me);
  }

  /* ------------------------------------------------------------------------------------
     Touch.

     This will not be the comfort of a desktop, and it does not have to be: what matters is
     that nothing is broken. One finger places, a long press breaks, two fingers pan and
     zoom. The rest goes through the buttons.
     ------------------------------------------------------------------------------------ */

  let longPress = null;
  let pinch = null;

  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      pinch = {
        gap: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
      /* A pinch cancels what one finger had started: without that, spreading two fingers
         to zoom draws a line of conveyors out to the edge of the screen. */
      drawing = null;
      stroke = null;
      longPress = clearTimeout(longPress) || null;
      return;
    }
    const touch = event.touches[0];
    longPress = setTimeout(() => {
      longPress = null;
      drawing = null;
      const rect = canvas.getBoundingClientRect();
      const at = camera.toTile(touch.clientX - rect.left, touch.clientY - rect.top,
                               viewportOf());
      const under = board.at(at.x, at.y);
      if (under) commit({ remove: [under] });
      paint();
    }, 480);
  }, { passive: true });

  canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinch) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const gap = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const x = (a.clientX + b.clientX) / 2;
    const y = (a.clientY + b.clientY) / 2;
    const rect = canvas.getBoundingClientRect();
    camera.pan(x - pinch.x, y - pinch.y);
    if (pinch.gap > 4) {
      camera.zoomAt(gap / pinch.gap, x - rect.left, y - rect.top, viewportOf());
    }
    pinch = { gap, x, y };
    paint();
  }, { passive: false });

  for (const kind of ["touchend", "touchcancel"]) {
    canvas.addEventListener(kind, () => {
      pinch = null;
      longPress = clearTimeout(longPress) || null;
    }, { passive: true });
  }

  say();
  paint();
  initSpaces();

  return {
    board,
    destroy() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("click", closeSiteMenu);
      document.removeEventListener("click", closeSpacesMenu);
      window.removeEventListener("beforeunload", onBeforeUnload);
      saver?.stop();
      clearTimeout(fading);
      resize?.disconnect();
      clearTimeout(longPress);
      rail.destroy();
      host.className = "";
      host.innerHTML = "";
    },
  };
}
