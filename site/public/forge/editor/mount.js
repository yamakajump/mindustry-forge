/**
 * Le mode édition : le plateau, la souris, le clavier.
 *
 * Il n'y a pas de barre d'outils pour bâtir, et c'est voulu. Le jeu n'en a pas : un bloc en
 * main pose, le clic droit casse. Ajouter des boutons de mode reviendrait à inventer une
 * ergonomie que le joueur devrait désapprendre pour retrouver la sienne.
 *
 * Les raccourcis sont relevés dans `Binding` de la v159.7, pas choisis : molette pour
 * tourner, ctrl pour le placement diagonal, F pour sélectionner, Z et X pour les miroirs,
 * clic milieu pour reprendre un bloc, R maintenu pour en tourner un déjà posé. Un joueur
 * qui arrive ici a déjà ces gestes dans les doigts, et lui en imposer d'autres serait lui
 * demander de désapprendre les siens pour se servir d'un outil qui parle de son jeu.
 *
 * Trois écarts seulement, tous listés dans le panneau d'aide plutôt que cachés : la molette
 * zoome quand la main est vide, la vue se déplace au clic milieu glissé, et Q, qui vide une
 * file de construction absente ici, reprend plutôt le sol survolé sur l'onglet sol.
 */

import { draw, itemIcon, spriteOf } from "../render.js";
import { createBoard, footprint, MAX_SIZE } from "./state.js";
import { lineOf, linksByConfig, reachOf } from "./lines.js";
import { canPlace } from "./rules.js";
import { flip, inBox, rotateBy, translate } from "./selection.js";
import { fromBase64, toBase64 } from "../schematic.js";
import { createCamera } from "./camera.js";
import { mountRail, showHelp, sizeGauge } from "./ui.js";
import { choicesFor, configFor, readsAs } from "./configure.js";
import { ageOf, dropDraft, keepDraft, readDraft } from "./draft.js";

const SHELL = `
  <div class="editor-bar">
    <a class="brand" href="/"><svg class="signe" viewBox="0 0 32 32" aria-hidden="true" fill="currentColor"><path d="M6 6h4v20H6z"/><path d="M10 6h12v4H10z"/><path d="M22 4l5 4-5 4z"/><path d="M10 14h10v4H10z"/></svg>Mindustry <span>Forge</span></a>
    <details class="menu editor-site">
      <summary>Site</summary>
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
 * Monte l'éditeur dans `host`.
 *
 * `onAnalyse` est appelé avec le plateau quand le joueur repasse sur l'analyse. Le plateau
 * n'est pas détruit à ce moment là : revenir en édition et faire ctrl+Z doit encore marcher,
 * sinon la bascule coûte l'historique et personne ne bascule.
 */
export function mountEditor({ host, board: kept = null, tiles = [], ground = {},
                              catalogue, onAnalyse }) {
  const sizeOf = (name) => catalogue.blocks[name]?.size || 1;
  const roleOf = (name) => catalogue.blocks[name]?.role || "";
  /* Un plateau peut être rendu plutôt que reconstruit, et c'est ce qui fait que revenir en
     édition n'efface pas l'historique : reconstruire depuis les blocs perd ce qui n'est
     plus dans les blocs, c'est à dire tout ce qu'on pourrait défaire. */
  const board = kept || createBoard({ tiles, ground, sizeOf });

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
  if (board.tiles.length) camera.frame(board.box(), viewportOf());

  let held = null;
  let rotation = 0;
  /** Ce que le bloc en main retient, quand la pipette l'a rapporté avec. */
  let heldConfig = null;
  let cursor = null;
  let refusal = null;
  let panning = null;
  let spacing = false;
  /** La case où un glissé a commencé, tant qu'il dure. */
  let drawing = null;
  /** Le coin où une casse en rectangle a commencé, tant qu'elle dure. */
  let erasing = null;
  /** Le coin d'une sélection en cours, puis la boîte retenue. */
  let picking = null;
  let selection = null;
  /** Ce qui a été copié, et ce qui attend d'être posé au prochain clic. */
  let clipboard = null;
  let pasting = null;
  /* Les touches maintenues qui changent le sens d'un geste, aux touches du jeu :
     ctrl pour le placement diagonal, F pour sélectionner, R pour tourner un bloc posé. */
  let diagonal = false;
  let selecting = false;
  let turning = false;
  /** Un déplacement de sélection en cours : d'où il est parti, et ce qu'il emporte. */
  let moving = null;
  /** Le pont qu'on est en train de recibler, tant qu'on n'a pas désigné sa cible. */
  let linking = null;
  /** L'onglet sol est-il ouvert, et avec quel pinceau. */
  let painting = false;
  let brush = { layer: "floor", block: null, tool: "pencil", size: 1 };
  /** Ce qu'un trait de pinceau a déjà peint, pour n'en faire qu'un geste d'historique. */
  let stroke = null;
  /** À quel point les blocs s'effacent, pour voir le sol dessous. */
  let opacity = 1;

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
      /* Passer sur le sol repose ce qu'on tenait : garder un bloc en main pendant qu'on
         peint donnerait un fantôme de convoyeur au dessus du pinceau, et un clic gauche qui
         ne sait plus lequel des deux il sert. */
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

  /** La barre d'état dit les gestes du moment, pas tous les gestes possibles. */
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
    hints.innerHTML = held
      ? `<strong>${held}</strong> en main · <kbd>molette</kbd> tourner ·
         <kbd>glisser</kbd> tracer · <kbd>ctrl</kbd> diagonale ·
         <kbd>clic droit</kbd> casser · <kbd>échap</kbd> reposer`
      : `Choisis un bloc à gauche · <kbd>F</kbd> sélectionner ·
         <kbd>clic milieu</kbd> reprendre un bloc · <kbd>ctrl+V</kbd> coller ·
         <kbd>ctrl+Z</kbd> annuler`;
  }

  /**
   * Ce que le geste en cours poserait.
   *
   * Un clic sans glissé et un glissé sont le même geste vu à deux instants : tant que le
   * bouton n'est pas relâché, la ligne se recalcule sous le curseur. Les traiter séparément
   * donnait deux chemins de code pour une seule intention, et l'un des deux finit toujours
   * par diverger de l'autre.
   */
  function pending() {
    if (!held || !cursor) return [];
    const from = drawing || cursor;
    const plans = lineOf(from, cursor, held, catalogue, rotation, { diagonal, board });
    if (!heldConfig) return plans;
    /* La configuration ne suit que les blocs restés du type qu'on tient : un glissé peut
       avoir transformé certains plans en jonctions ou en ponts, et leur coller la
       configuration d'un trieur écrirait n'importe quoi dans le fichier. */
    return plans.map((plan) => (plan.block === held ? { ...plan, config: heldConfig } : plan));
  }

  /** Ce qu'un déplacement de sélection poserait, à sa nouvelle place. */
  function moved() {
    if (!moving || !cursor) return [];
    return translate(moving.tiles, cursor.x - moving.from.x, cursor.y - moving.from.y);
  }

  /* ------------------------------------------------------------------------------------
     Peindre le sol.

     Un trait de pinceau est **un** geste d'historique, comme une ligne de convoyeurs : on
     accumule les cases touchées pendant que le bouton est tenu et on applique tout au
     relâchement. Appliquer case par case remplirait l'historique de trois cents entrées
     pour un seul mouvement de la main.
     ------------------------------------------------------------------------------------ */

  /** Les cases qu'un coup de crayon couvre, centré sur le curseur. */
  function dab(point) {
    const reach = Math.floor(brush.size / 2);
    const cells = [];
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) cells.push([point.x + dx, point.y + dy]);
    }
    return cells;
  }

  /** Les cases d'un rectangle, bornes comprises. */
  function area(from, to) {
    const cells = [];
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) {
      for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) cells.push([x, y]);
    }
    return cells;
  }

  /**
   * Le pot de peinture : la zone contiguë qui porte le même sol que la case visée.
   *
   * Bornée à la boîte du schéma élargie de vingt cases. Sans borne, un pot cliqué sur du
   * vide part remplir un plan infini et ne revient jamais : le terrain n'a pas de bord,
   * contrairement à une carte du jeu.
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

  /** Ce que peindre ces cases changerait, dans la forme que `board.apply` attend. */
  function strokeOf(cells) {
    const out = {};
    for (const [x, y] of cells) {
      const key = `${x},${y}`;
      if (brush.tool === "eraser") { out[key] = null; continue; }
      if (!brush.block) continue;
      /* Un minerai posé sur une case nue emmène de la pierre avec lui : le jeu n'a pas de
         minerai flottant, et une surcouche sans sol dessous n'existe pas. */
      const under = board.ground[key];
      out[key] = brush.layer === "overlay" && !under?.floor
        ? { floor: "stone", overlay: brush.block }
        : { [brush.layer]: brush.block };
    }
    return out;
  }

  /** La case est-elle dans la sélection retenue ? */
  const insideSelection = (point) => selection && point
    && point.x >= selection.left && point.x < selection.left + selection.width
    && point.y >= selection.bottom && point.y < selection.bottom + selection.height;

  /**
   * Le plus long début d'une fournée qui tient encore dans les 64 × 64.
   *
   * Par dichotomie plutôt qu'en retirant un bloc à la fois : mesurer la boîte coûte un
   * parcours de tout le plateau, et un glissé de cent blocs sur une base de quatre mille
   * ferait cent parcours là où sept suffisent.
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
   * Le verdict de chaque bloc d'une fournée.
   *
   * Un glissé trop long pose ce qui tient et refuse le reste, au lieu de tout refuser en
   * bloc. Tout refuser était le premier comportement, et sur un glissé de cent cases il
   * rendait la main vide sans rien expliquer : le joueur a fait un geste, il doit obtenir
   * ce que ce geste avait de légal.
   */
  function judge(plans, ignore = null) {
    /* Les blocs qu'un déplacement emporte sont retirés du plateau le temps du jugement.
       Sans ça, bouger une sélection d'une seule case la déclare illégale d'un bout à
       l'autre : chaque bloc bute sur l'exemplaire de lui-même qu'il est en train de
       quitter, et le fantôme est rouge partout sans qu'on comprenne pourquoi. */
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
   * Redonner à chaque pont la case qu'il vise, pour que le rendu dessine la travée.
   *
   * `render.js` ne dessine un pont que s'il porte un champ `link` en coordonnées absolues,
   * et il refuse volontairement de le déduire du décalage brut : dans de vraies
   * schématiques, cinq ponts prétendaient porter à 365 cases et se dessinaient en barres
   * d'un bout à l'autre de l'image. L'analyse le valide donc contre la portée du bloc.
   *
   * Ici l'éditeur crée le lien lui-même, mais il ne suffit pas de le poser une fois : un
   * pont qu'on déplace, qu'on tourne ou qu'on annule garderait un lien vers une case où il
   * n'y a plus rien. Recalculé à chaque image, contre la portée, il ne peut pas mentir.
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
   * Tout ce qui change le plateau passe par ici.
   *
   * Un seul point d'entrée pour appliquer un geste, et donc un seul endroit où le brouillon
   * se met à jour. Éparpiller la sauvegarde sur les quinze appels à `board.apply`
   * garantirait qu'on en oublie un, et que le brouillon mente sur ce cas là précisément.
   */
  function commit(change) {
    const done = board.apply(change);
    if (done) keepDraft(board, Date.now());
    return done;
  }

  function paint() {
    relink();
    const viewport = viewportOf();
    draw(canvas, board.tiles, sizeOf, roleOf, {
      camera, viewport, ground: board.ground, grid: true, opacity,
    });
    updateGauge(board.box());
    turnButton.hidden = !(held && catalogue.blocks[held]?.rotate);
    outline(viewport);
    linkable(viewport);
    if (painting) brushGhost(viewport);
    else ghost(viewport);
    showPickBar();
  }

  /**
   * La boîte du schéma, en pointillés.
   *
   * Sans elle, la limite de 64 n'existe qu'en chiffres dans un coin de l'écran, et on
   * découvre qu'on l'a atteinte au moment où une pose est refusée. Avec elle, on voit son
   * schéma grandir vers son cadre.
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
   * Les fantômes de ce que le geste poserait, dessinés par dessus le rendu.
   *
   * Vert ou rouge, un par bloc, et la raison du refus juste sous le curseur. Un refus muet
   * est ce que l'éditeur d'avant faisait, et personne ne devinait qu'une case occupée
   * refusait la pose.
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

      // La flèche du jeu, pour les blocs qui ont un sens. Sur une ligne tracée, elle dit
      // le sens de chaque segment, coude compris.
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

  /** Le cadre ambre de la sélection, en cours de tracé ou retenue. */
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
   * L'empreinte du pinceau, sous le curseur.
   *
   * Un pinceau qu'on ne voit pas est un pinceau qu'on utilise au jugé : la taille réglable
   * ne sert à rien si on ne sait pas ce qu'elle couvre avant de cliquer.
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
    // Le contour ne suit que le tour du geste, pas chaque case : un quadrillage ambre sur
    // trois cents cases est illisible.
    if (cells.length <= 81) {
      for (const [x, y] of cells) {
        const { px, py, size } = camera.rectOf(x, y, viewport);
        context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }
    }
    context.restore();
  }

  /** L'aperçu rouge d'une casse en rectangle, tant que le bouton droit est tenu. */
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

    /* La bulle bascule de l'autre côté du curseur quand elle sortirait de la vue. Sans ça,
       le refus le plus utile, celui qu'on déclenche en poussant vers le bord, est aussi le
       seul qu'on ne peut pas lire. */
    const width = refusal.offsetWidth || 200;
    const height = refusal.offsetHeight || 24;
    const flipX = px + width + 28 > viewport.width;
    const flipY = py + height + 28 > viewport.height;
    refusal.style.left = `${flipX ? px - width - 28 : px}px`;
    refusal.style.top = `${flipY ? py - height - 28 : py}px`;
  }

  /** La boîte entre deux cases, bornes comprises, quel que soit le sens du glissé. */
  function rectOf(a, b) {
    const left = Math.min(a.x, b.x);
    const bottom = Math.min(a.y, b.y);
    return {
      left, bottom,
      width: Math.abs(a.x - b.x) + 1,
      height: Math.abs(a.y - b.y) + 1,
    };
  }

  /** Tout ce qu'une zone touche, même d'une seule case d'un gros bloc. */
  function inside(zone) {
    return board.tiles.filter((tile) => footprint(tile, sizeOf).some(([x, y]) =>
      x >= zone.left && x < zone.left + zone.width
      && y >= zone.bottom && y < zone.bottom + zone.height));
  }

  const tileUnder = (event) => {
    const rect = canvas.getBoundingClientRect();
    return camera.toTile(event.clientX - rect.left, event.clientY - rect.top, viewportOf());
  };

  /* Poser, casser, déplacer. Le bouton du milieu déplace la vue, le droit casse, le gauche
     pose : c'est la répartition du jeu, moins la molette qui zoome ici. */
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    /* Rendre la main au plateau. Cliquer un élément non focusable ne déplace pas le focus :
       après avoir tapé trois lettres dans la recherche, il y restait, et le garde-fou « ne
       pas intercepter les touches dans un champ de saisie » tuait alors **tous** les
       raccourcis sans que rien ne le dise. */
    canvas.focus({ preventScroll: true });
    cursor = tileUnder(event);

    /* Le clic milieu fait deux choses selon qu'il glisse ou non : appuyé et relâché sur
       place il reprend le bloc visé, appuyé et tiré il déplace la vue. C'est ce que fait le
       jeu, et ça évite une touche de plus pour la pipette. */
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
    /* Le pinceau passe avant tout le reste quand l'onglet sol est ouvert : là, un clic
       gauche peint, et rien d'autre. */
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
      if (!event.shiftKey) pasting = null;   // shift maintenu : coller en série
      say();
      paint();
      return;
    }
    /* Attraper la sélection elle-même la déplace. C'est le geste attendu partout ailleurs
       et il manquait : on pouvait tourner et retourner une sélection, mais pas la bouger,
       ce qui est pourtant la raison numéro un d'en faire une. */
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
    /* Le crayon accumule pendant le trait ; le rectangle, lui, se recalcule à chaque
       mouvement puisque sa forme entière dépend de là où on en est. */
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
      /* Retirer et reposer en un seul geste : sinon un déplacement d'une case retire les
         blocs puis les repose sur eux-mêmes, et l'annulation en demande deux. */
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
    if (erasing) {
      const gone = inside(rectOf(erasing, cursor));
      erasing = null;
      if (gone.length) commit({ remove: gone });
      paint();
      return;
    }
    if (drawing) {
      /* Toute la ligne part en un seul geste, donc en une seule entrée d'historique : un
         glissé de trente convoyeurs se défait d'un ctrl+Z, pas de trente. */
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
    paint();
  });

  canvas.addEventListener("pointerleave", () => {
    cursor = null;
    paint();
  });

  /* Sans ça, casser un bloc ouvre le menu contextuel du navigateur par dessus le plateau. */
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  /**
   * La molette, qui fait deux choses selon ce qu'on tient.
   *
   * C'est le jeu qui en décide ainsi et c'est bien vu : `Binding.rotate` et `Binding.zoom`
   * sont **tous les deux** sur la molette, et `DesktopInput` tranche en regardant si un bloc
   * orientable est en main. Tourner est le geste qu'on fait cent fois en construisant ;
   * zoomer, celui qu'on fait entre deux constructions.
   *
   * Ctrl force le zoom, exactement comme dans le jeu, pour reculer sans reposer ce qu'on
   * tient. Et R maintenu au dessus d'un bloc posé le tourne sur place, ce que le jeu appelle
   * `rotatePlaced` et qui ne marche que sur les blocs `quickRotate`.
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
     La sélection : ctrl+glisser, puis une barre flottante posée à côté d'elle.

     À côté d'elle et non dans le rail : une barre à l'autre bout de l'écran oblige à
     quitter des yeux ce sur quoi elle agit, et à traverser mille pixels pour chaque quart
     de tour.
     ---------------------------------------------------------------------------------- */

  const picked = () => (selection ? inBox(board.tiles, selection, sizeOf) : []);

  /** Remplacer la sélection par sa version transformée, en un seul geste d'historique. */
  function reshape(change) {
    const before = picked();
    if (!before.length) return;
    const after = change(before);
    commit({ remove: before, place: after });
    selection = boxAround(after);
    paint();
  }

  /** La boîte d'un groupe de blocs, empreintes comprises. */
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
   * Copier la sélection, dans l'éditeur et dans le presse-papiers du système.
   *
   * Les deux, parce que ce sont deux usages : recoller ailleurs sur le même plateau, et
   * coller dans le jeu. Le second est ce qui fait de cet éditeur autre chose qu'un jouet,
   * et `schematic.js` sait déjà écrire le format que le jeu lit.
   */
  async function copy() {
    const chosen = picked();
    if (!chosen.length) return;
    clipboard = chosen.map((tile) => ({ ...tile }));
    /* L'écriture est courue contre une seconde : elle est normalement accordée dans un
       geste utilisateur, mais un refus qui ne vient jamais ne doit pas laisser le joueur
       devant une interface qui ne répond plus. */
    try {
      const code = await toBase64(clipboard, {
        tags: { name: "selection" },
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

  /**
   * Coller ce qu'on a copié, dans l'éditeur ou dans le jeu.
   *
   * Le presse-papiers du système arrive par l'événement `paste` du navigateur, plus bas, et
   * non par `navigator.clipboard.readText()`. La différence n'est pas cosmétique : la
   * lecture directe demande une permission, et là où elle n'est ni accordée ni refusée elle
   * **suspend la promesse indéfiniment**. Mesuré ici : le premier essai figeait la page à
   * chaque ctrl+V. L'événement `paste`, lui, ne demande rien, parce que c'est l'utilisateur
   * qui l'a déclenché.
   *
   * Cette fonction-ci ne sert donc qu'au repli : recoller ce qu'on avait copié dans
   * l'éditeur, quand le presse-papiers du système n'a rien pour nous.
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

  /** Ce que le collage poserait, ramené sous le curseur. */
  function pastedAt() {
    if (!pasting || !cursor) return [];
    const box = boxAround(pasting);
    return translate(pasting, cursor.x - box.left, cursor.y - box.bottom);
  }

  const pickBar = host.querySelector(".editor-pick");
  const picker = host.querySelector(".editor-picker");

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

  /** Un mot dans la barre d'état, qui s'efface tout seul. */
  let fading = null;
  function flash(message) {
    hints.innerHTML = `<strong>${message}</strong>`;
    clearTimeout(fading);
    fading = setTimeout(say, 2600);
  }

  /* ----------------------------------------------------------------------------------
     Recibler un pont, comme dans le jeu.

     Cliquer un pont posé, main vide, l'arme ; le clic suivant sur un pont du même type et
     à portée écrit la liaison. Recliquer le même pont la coupe. C'est le geste du jeu, et
     sans lui on ne pouvait ni voir qui parle à qui, ni le changer : une chaîne posée d'un
     glissé était figée pour toujours.
     ---------------------------------------------------------------------------------- */

  /** Un pylône, qui relie plusieurs voisins au lieu d'en viser un seul. */
  const isNode = (tile) => {
    const kind = catalogue.blocks[tile?.block]?.kind;
    return kind === "PowerNode" || kind === "BeamNode";
  };

  /**
   * Les cases qu'un bloc armé peut viser.
   *
   * Un pont vise un pont du même type ; un pylône vise **tout ce qui consomme ou produit du
   * courant**, ce qui est la moitié du jeu. C'est la différence entre viser son jumeau et
   * relier un réseau, et elle change ce qu'on propose au joueur.
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

  /** Une position empaquetée comme le format la range : `(x << 16) | (y & 0xFFFF)`. */
  const packed = (tile) => ((tile.x << 16) | (tile.y & 0xFFFF));

  /**
   * Régler ce qu'un bloc retient : l'objet d'un trieur, le liquide d'une source.
   *
   * Une petite palette flottante posée contre le bloc, avec l'icône de chaque objet. Un
   * deuxième clic sur le même bloc efface sa configuration, ce que le jeu appelle
   * `clearOnDoubleTap` et qui est la seule façon de remettre un trieur à zéro sans le
   * casser.
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
      /* `raw` est effacé en même temps : il porte les octets d'origine relus d'un fichier,
         et les laisser ferait rejouer l'ancienne configuration à l'écriture, par dessus
         celle qu'on vient de choisir. */
      place: [{ ...tile, raw: undefined, config: chosen ? configFor(chosen) : null }],
    });
    say();
    paint();
  });

  /** Le clic gauche, main vide, sur un bloc posé. */
  function poke(point) {
    const under = board.at(point.x, point.y);
    picker.hidden = true;

    if (under && !linking && !isNode(under) && !linksByConfig(catalogue.blocks[under.block])
        && offerContent(under)) return;

    if (linking) {
      const armed = linking;
      linking = null;
      if (!under || under === armed) {
        /* Recliquer le pont qu'on venait d'armer coupe sa liaison, ce qui est la seule
           façon de défaire un lien sans casser le pont. */
        if (under === armed && armed.config) {
          commit({ remove: [armed], place: [{ ...armed, config: null, link: null }] });
        }
        say();
        paint();
        return;
      }
      if (targetsFor(armed).includes(under)) {
        if (isNode(armed)) {
          /* Un pylône garde une **liste** : cliquer un voisin l'ajoute, recliquer le même
             le retire. Un réseau se construit voisin par voisin, pas en désignant un
             unique élu comme le fait un pont. */
          const links = [...(armed.config?.type === 8 ? armed.config.links : [])];
          const at = links.indexOf(packed(under));
          if (at >= 0) links.splice(at, 1);
          else links.push(packed(under));
          commit({
            remove: [armed],
            place: [{ ...armed, raw: undefined,
                      config: links.length ? { type: 8, links } : null }],
          });
          /* On reste armé : relier un pylône à six machines demanderait six fois le geste
             d'armement, ce qui est six fois trop. */
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

  /** Les cibles possibles et le trait vers le curseur, tant qu'un pont est armé. */
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

    // La portée, en carré, comme le jeu la mesure.
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
   * Reprendre en main un bloc déjà posé, avec sa rotation.
   *
   * Le geste qui fait gagner le plus de temps quand on réplique une structure : sans lui il
   * faut retrouver le bloc dans une palette de 245, puis le retourner dans le bon sens.
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
    /* `copyConfig` : le jeu ramene la configuration avec le bloc, et 390 blocs l autorisent.
       Reprendre un trieur regle sur du cuivre pour le reposer vide serait reprendre autre
       chose que ce qu on a vise. */
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
    /* Les touches maintenues, relevées dans `Binding` de la v159.7 plutôt que choisies :
       ctrl pour la diagonale, F pour sélectionner, R pour tourner un bloc posé. Un joueur
       qui arrive ici a déjà ces gestes dans les doigts. */
    if ((event.key === "Control" || event.key === "Meta") && !diagonal) {
      diagonal = true;
      paint();
      return;
    }
    if (key === "f" && !selecting) { selecting = true; say(); return; }
    if (key === "r" && !turning) { turning = true; say(); return; }

    /* Z et X retournent la sélection, comme `schematicFlipX` et `schematicFlipY`. Sans
       sélection ils ne font rien, plutôt que de retourner tout le plateau. */
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
   * Ce qu'il faut oublier quand le plateau bouge sous nos pieds.
   *
   * Une annulation remet les blocs où ils étaient, mais la sélection, elle, était restée où
   * on venait de les traîner : le cadre ambre survivait autour d'une case vide, avec sa
   * barre d'actions qui n'agissait plus sur rien. Un pont armé a le même problème s'il
   * disparaît entre temps.
   */
  function settle() {
    keepDraft(board, Date.now());
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
  };

  /**
   * Ce que le joueur colle, venu du jeu ou d'ailleurs.
   *
   * C'est le seul canal qui marche sans permission, et c'est aussi celui qui rend la
   * passerelle avec le jeu réelle : copier une schématique dans Mindustry, faire ctrl+V
   * ici, et la voir apparaître sous le curseur.
   */
  const onPaste = async (event) => {
    if (/^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    const text = (event.clipboardData?.getData("text") || "").trim();
    event.preventDefault();
    if (!text) return paste();
    try {
      paste((await fromBase64(text)).tiles);
    } catch {
      /* Un presse-papiers qui contient autre chose qu'une schématique n'est pas une erreur
         du joueur : il avait peut-être copié un lien. On repose ce qu'on avait. */
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
  /* Le bouton de rotation du tactile, sans molette pour le remplacer. Il n'apparaît que
     quand il sert, c'est à dire quand on tient un bloc qui tourne. */
  const turnButton = host.querySelector('[data-do="turn-held"]');
  turnButton.onclick = () => {
    rotation = (rotation + 1) % 4;
    rail.setHeld(held, rotation);
    paint();
  };

  const resize = window.ResizeObserver ? new ResizeObserver(() => paint()) : null;
  resize?.observe(stage);

  /**
   * Le brouillon d'une session précédente, proposé et jamais imposé.
   *
   * Écraser d'office ce que quelqu'un vient de coller par un brouillon vieux de trois jours
   * est pire que de perdre le brouillon : dans un cas on perd du travail qu'on savait avoir,
   * dans l'autre on perd celui qu'on croyait avoir devant les yeux.
   */
  function offerDraft() {
    if (board.tiles.length || Object.keys(board.ground).length) return;
    const kept = readDraft(Date.now());
    if (!kept) return;

    const bar = document.createElement("div");
    bar.className = "editor-draft";
    bar.innerHTML = `<span>Un brouillon de <strong>${kept.tiles.length} blocs</strong>
      attend, gardé ${ageOf(kept.at, Date.now())}.</span>
      <button type="button" class="primary" data-draft="take">Le reprendre</button>
      <button type="button" data-draft="drop">Repartir de zéro</button>`;
    bar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-draft]");
      if (!button) return;
      if (button.dataset.draft === "take") {
        commit({ place: kept.tiles, paint: kept.ground });
        camera.frame(board.box(), viewportOf());
      } else {
        dropDraft();
      }
      bar.remove();
      paint();
    });
    stage.appendChild(bar);
  }

  /* ------------------------------------------------------------------------------------
     Le tactile.

     Ce ne sera pas le confort du bureau, et ça n'a pas à l'être : ce qui compte est que
     rien ne soit cassé. Un doigt pose, un appui long casse, deux doigts déplacent et
     zooment. Le reste passe par les boutons.
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
      /* Un pincement annule ce qu'un doigt avait commencé : sans ça, écarter deux doigts
         pour zoomer trace une ligne de convoyeurs jusqu'au bord de l'écran. */
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
  offerDraft();

  return {
    board,
    destroy() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("click", closeSiteMenu);
      clearTimeout(fading);
      resize?.disconnect();
      clearTimeout(longPress);
      rail.destroy();
      host.className = "";
      host.innerHTML = "";
    },
  };
}
