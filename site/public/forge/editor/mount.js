/**
 * Le mode édition : le plateau, la souris, le clavier.
 *
 * Il n'y a pas de barre d'outils pour bâtir, et c'est voulu. Le jeu n'en a pas : un bloc en
 * main pose, le clic droit casse. Ajouter des boutons de mode reviendrait à inventer une
 * ergonomie que le joueur devrait désapprendre pour retrouver la sienne.
 *
 * Une seule divergence assumée avec le jeu : la molette zoome au lieu de tourner. Sur une
 * page web, une molette qui ne défile ni ne zoome est un piège. La rotation garde `R`, et
 * shift+molette pour ceux qui ont le geste dans les doigts.
 */

import { draw, spriteOf } from "../render.js";
import { createBoard, footprint, MAX_SIZE } from "./state.js";
import { lineOf, linksByConfig, reachOf } from "./lines.js";
import { canPlace } from "./rules.js";
import { flip, inBox, rotateBy, translate } from "./selection.js";
import { fromBase64, toBase64 } from "../schematic.js";
import { createCamera } from "./camera.js";
import { mountRail, sizeGauge } from "./ui.js";

const SHELL = `
  <div class="editor-bar">
    <span class="brand">Mindustry <span>Forge</span></span>
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
  <div class="editor-stage"><canvas></canvas>
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
    <span><kbd>molette</kbd> zoom · <kbd>clic milieu</kbd> déplacer</span>
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

  const camera = createCamera({ scale: 24 });
  if (board.tiles.length) camera.frame(board.box(), viewportOf());

  let held = null;
  let rotation = 0;
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
  /** La touche « placement diagonal », maintenue. */
  let diagonal = false;
  /** Un déplacement de sélection en cours : d'où il est parti, et ce qu'il emporte. */
  let moving = null;
  /** Le pont qu'on est en train de recibler, tant qu'on n'a pas désigné sa cible. */
  let linking = null;

  function viewportOf() {
    return { width: stage.clientWidth || 800, height: stage.clientHeight || 600 };
  }

  const rail = mountRail({
    host: host.querySelector(".editor-rail"),
    catalogue,
    onPick(name) {
      held = name;
      rotation = 0;
      rail.setHeld(held, rotation);
      say();
      paint();
    },
  });

  /** La barre d'état dit les gestes du moment, pas tous les gestes possibles. */
  function say() {
    if (linking) {
      hints.innerHTML = `<strong>${linking.block}</strong> armé ·
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
        <kbd>ctrl+C</kbd> copier · <kbd>suppr</kbd> supprimer · <kbd>échap</kbd> désélectionner`;
      return;
    }
    hints.innerHTML = held
      ? `<strong>${held}</strong> en main · <kbd>glisser</kbd> tracer une ligne ·
         <kbd>R</kbd> tourner · <kbd>clic droit</kbd> casser · <kbd>Q</kbd> reprendre un bloc ·
         <kbd>échap</kbd> reposer`
      : `Choisis un bloc à gauche · <kbd>Q</kbd> en reprendre un pose ·
         <kbd>ctrl+glisser</kbd> sélectionner · <kbd>ctrl+V</kbd> coller ·
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
    return lineOf(from, cursor, held, catalogue, rotation, { diagonal, board });
  }

  /** Ce qu'un déplacement de sélection poserait, à sa nouvelle place. */
  function moved() {
    if (!moving || !cursor) return [];
    return translate(moving.tiles, cursor.x - moving.from.x, cursor.y - moving.from.y);
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

  function paint() {
    relink();
    const viewport = viewportOf();
    draw(canvas, board.tiles, sizeOf, roleOf, {
      camera, viewport, ground: board.ground, grid: true,
    });
    updateGauge(board.box());
    outline(viewport);
    linkable(viewport);
    ghost(viewport);
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
    if (event.button === 0 && pasting) {
      const posable = pastedAt().filter((plan) =>
        canPlace(board, plan, catalogue, pastedAt()).ok);
      if (posable.length) board.apply({ place: posable });
      if (!event.shiftKey) pasting = null;   // shift maintenu : coller en série
      say();
      paint();
      return;
    }
    /* Attraper la sélection elle-même la déplace. C'est le geste attendu partout ailleurs
       et il manquait : on pouvait tourner et retourner une sélection, mais pas la bouger,
       ce qui est pourtant la raison numéro un d'en faire une. */
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && insideSelection(cursor)) {
      moving = { from: cursor, tiles: picked() };
      paint();
      return;
    }
    if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
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
    if (!was || was.x !== cursor.x || was.y !== cursor.y) paint();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (panning) {
      if (!panning.moved) pipette();
      panning = null;
      return;
    }
    cursor = tileUnder(event);

    if (moving) {
      const after = moved();
      const before = moving.tiles;
      moving = null;
      /* Retirer et reposer en un seul geste : sinon un déplacement d'une case retire les
         blocs puis les repose sur eux-mêmes, et l'annulation en demande deux. */
      if (after.length) {
        board.apply({ remove: before, place: after });
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
      if (gone.length) board.apply({ remove: gone });
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
      if (posable.length) board.apply({ place: posable });
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

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    camera.zoomAt(event.deltaY > 0 ? 0.85 : 1.18,
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
    board.apply({ remove: before, place: after });
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
      const code = await toBase64(clipboard, { tags: { name: "selection" }, sizeOf });
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
      if (gone.length) board.apply({ remove: gone });
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

  /** Les cases qu'un pont armé peut viser : même bloc, à portée, et pas lui-même. */
  function targetsFor(tile) {
    const reach = reachOf(catalogue.blocks[tile.block]);
    return board.tiles.filter((other) => other !== tile && other.block === tile.block
      && Math.max(Math.abs(other.x - tile.x), Math.abs(other.y - tile.y)) <= reach);
  }

  /** Le clic gauche, main vide, sur un bloc posé. */
  function poke(point) {
    const under = board.at(point.x, point.y);

    if (linking) {
      const armed = linking;
      linking = null;
      if (!under || under === armed) {
        /* Recliquer le pont qu'on venait d'armer coupe sa liaison, ce qui est la seule
           façon de défaire un lien sans casser le pont. */
        if (under === armed && armed.config) {
          board.apply({ remove: [armed], place: [{ ...armed, config: null, link: null }] });
        }
        say();
        paint();
        return;
      }
      if (targetsFor(armed).includes(under)) {
        board.apply({
          remove: [armed],
          place: [{ ...armed, link: null,
                    config: { type: 7, dx: under.x - armed.x, dy: under.y - armed.y } }],
        });
      } else {
        flash("ce pont est hors de portée, ou n'est pas du même type");
      }
      say();
      paint();
      return;
    }

    if (under && linksByConfig(catalogue.blocks[under.block])) {
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
    if (!cursor) return;
    const under = board.at(cursor.x, cursor.y);
    if (!under) return;
    held = under.block;
    rotation = under.rotation || 0;
    rail.setHeld(held, rotation);
    say();
    paint();
  }

  const onKey = (event) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
    if (typing) return;
    const ctrl = event.ctrlKey || event.metaKey;

    if (event.code === "Space") { spacing = true; event.preventDefault(); return; }
    /* Maj maintenue : placement diagonal, comme dans le jeu. La molette garde le zoom, qui
       est ce qu'une molette fait sur une page web, et la rotation garde R. */
    if (event.key === "Shift" && !diagonal) { diagonal = true; paint(); return; }
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
      if (gone.length) board.apply({ remove: gone });
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
    if (event.key.toLowerCase() === "q") { pipette(); return; }
    if (event.key.toLowerCase() === "r" && held) {
      rotation = (rotation + 1) % 4;
      rail.setHeld(held, rotation);
      paint();
    }
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
    selection = null;
    linking = null;
    showPickBar();
    say();
    paint();
  }

  const onKeyUp = (event) => {
    if (event.code === "Space") spacing = false;
    if (event.key === "Shift" && diagonal) { diagonal = false; paint(); }
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

  const resize = window.ResizeObserver ? new ResizeObserver(() => paint()) : null;
  resize?.observe(stage);

  say();
  paint();

  return {
    board,
    destroy() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("paste", onPaste);
      clearTimeout(fading);
      resize?.disconnect();
      rail.destroy();
      host.className = "";
      host.innerHTML = "";
    },
  };
}
