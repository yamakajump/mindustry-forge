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
import { createBoard,  MAX_SIZE } from "./state.js";
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
      ? `<strong>${held}</strong> en main · <kbd>R</kbd> tourner ·
         <kbd>clic droit</kbd> casser · <kbd>échap</kbd> reposer · <kbd>ctrl+Z</kbd> annuler`
      : `Choisis un bloc à gauche · <kbd>clic droit</kbd> casser ·
         <kbd>ctrl+Z</kbd> annuler`;
  }

  /** Le plan qui serait posé si on cliquait maintenant. */
  const planAt = () => (cursor && held
    ? { x: cursor.x, y: cursor.y, block: held, rotation } : null);

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
   * Le fantôme du bloc en main, dessiné par dessus le rendu.
   *
   * Vert ou rouge, et la raison du refus juste sous le curseur. Un refus muet est ce que
   * l'éditeur d'avant faisait, et personne ne devinait qu'une case occupée refusait la pose.
   */
  function ghost(viewport) {
    let why = null;
    const plan = planAt();
    if (plan) {
      const verdict = canPlace(board, plan, catalogue);
      const context = canvas.getContext("2d");
      const dpr = canvas.width / (viewport.width || 1);
      context.save();
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;

      const size = sizeOf(held);
      const offset = Math.trunc(-(size - 1) / 2);
      const { px, py } = camera.rectOf(plan.x + offset, plan.y + offset + size - 1, viewport);
      const span = camera.scale * size;

      const art = spriteOf(held);
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

      // La flèche du jeu, pour les blocs qui ont un sens.
      if (catalogue.blocks[held]?.rotate) {
        context.fillStyle = verdict.ok ? "#84d98b" : "#ff8b8b";
        context.font = `${Math.max(10, camera.scale * 0.6)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(["→", "↑", "←", "↓"][rotation % 4], px + span / 2, py + span / 2);
      }
      context.restore();
      if (!verdict.ok) why = verdict.why;
    }
    showWhy(why);
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
    refusal.style.left = `${px}px`;
    refusal.style.top = `${py}px`;
  }

  const tileUnder = (event) => {
    const rect = canvas.getBoundingClientRect();
    return camera.toTile(event.clientX - rect.left, event.clientY - rect.top, viewportOf());
  };

  /* Poser, casser, déplacer. Le bouton du milieu déplace la vue, le droit casse, le gauche
     pose : c'est la répartition du jeu, moins la molette qui zoome ici. */
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || spacing) {
      panning = { x: event.clientX, y: event.clientY };
      return;
    }
    cursor = tileUnder(event);
    if (event.button === 2) {
      const under = board.at(cursor.x, cursor.y);
      if (under) board.apply({ remove: [under] });
      paint();
      return;
    }
    if (event.button === 0 && held) {
      const plan = planAt();
      if (canPlace(board, plan, catalogue).ok) board.apply({ place: [plan] });
    }
    paint();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panning) {
      camera.pan(event.clientX - panning.x, event.clientY - panning.y);
      panning = { x: event.clientX, y: event.clientY };
      paint();
      return;
    }
    const was = cursor;
    cursor = tileUnder(event);
    if (!was || was.x !== cursor.x || was.y !== cursor.y) paint();
  });

  for (const kind of ["pointerup", "pointercancel"]) {
    canvas.addEventListener(kind, () => { panning = null; });
  }

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
