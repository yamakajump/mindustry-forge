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
import { lineOf } from "./lines.js";
import { canPlace } from "./rules.js";
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
  <div class="editor-stage"><canvas></canvas></div>
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
    hints.innerHTML = held
      ? `<strong>${held}</strong> en main · <kbd>glisser</kbd> tracer une ligne ·
         <kbd>R</kbd> tourner · <kbd>clic droit</kbd> casser · <kbd>Q</kbd> reprendre un bloc ·
         <kbd>échap</kbd> reposer`
      : `Choisis un bloc à gauche · <kbd>Q</kbd> en reprendre un pose ·
         <kbd>clic droit glisse</kbd> effacer une zone · <kbd>ctrl+Z</kbd> annuler`;
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
    return lineOf(from, cursor, held, catalogue, rotation);
  }

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
  function judge(plans) {
    const keep = fitting(plans);
    const batch = plans.slice(0, keep);
    return plans.map((plan, i) => ({
      plan,
      verdict: i < keep
        ? canPlace(board, plan, catalogue, batch)
        : { ok: false, why: "64 tuiles de côté, le jeu n'en accepte pas plus" },
    }));
  }

  function paint() {
    const viewport = viewportOf();
    draw(canvas, board.tiles, sizeOf, roleOf, {
      camera, viewport, ground: board.ground, grid: true,
    });
    updateGauge(board.box());
    outline(viewport);
    ghost(viewport);
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
    const plans = pending();
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
    for (const { plan, verdict } of judge(plans)) {
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
    if (event.button === 0 && held) {
      drawing = cursor;
      paint();
    }
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
    if (event.shiftKey && held) {
      rotation = (rotation + (event.deltaY > 0 ? 3 : 1)) % 4;
      rail.setHeld(held, rotation);
      paint();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    camera.zoomAt(event.deltaY > 0 ? 0.85 : 1.18,
                  event.clientX - rect.left, event.clientY - rect.top, viewportOf());
    paint();
  }, { passive: false });

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
    if (ctrl && event.key.toLowerCase() === "z") {
      (event.shiftKey ? board.redo : board.undo)();
      paint();
      event.preventDefault();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "y") { board.redo(); paint(); return; }
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
  const onKeyUp = (event) => { if (event.code === "Space") spacing = false; };

  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKeyUp);

  host.querySelector('[data-do="undo"]').onclick = () => { board.undo(); paint(); };
  host.querySelector('[data-do="redo"]').onclick = () => { board.redo(); paint(); };
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
      resize?.disconnect();
      rail.destroy();
      host.className = "";
      host.innerHTML = "";
    },
  };
}
