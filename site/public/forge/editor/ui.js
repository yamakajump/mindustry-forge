/**
 * Le rail, la barre du haut et la barre d'état.
 *
 * Tout ce qui n'est pas le plateau tient ici, et tient peu de place : 280 pixels à gauche
 * et deux barres fines. Le plateau est le produit, le reste lui cède la place.
 *
 * Aucune liste de blocs n'est écrite à la main. Les catégories, les planètes et les coûts
 * sortent du catalogue, qui sort du jeu : une deuxième copie de la donnée du jeu est
 * exactement ce que ce dépôt passe son temps à éviter.
 */

import { itemIcon } from "../render.js";

/** Le sprite d'un bloc, mis en cache : la même pastille est redessinée à chaque recherche. */
const icons = new Map();
function iconOf(name, pixels = 26) {
  const key = `${name}@${pixels}`;
  if (!icons.has(key)) icons.set(key, itemIcon(name, pixels * 2, "") || "");
  return icons.get(key);
}

const escape = (s) => String(s).replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/** Ce qu'un bloc coûte à construire, dit dans la langue du joueur. */
function costOf(block) {
  const parts = Object.entries(block?.cost || {});
  if (!parts.length) return "gratuit";
  return parts.map(([item, count]) => `${count} ${item}`).join(", ");
}

/**
 * Les blocs qu'un joueur peut poser.
 *
 * Un sol n'est pas un bloc qu'on pose, et un bloc sans coût de construction n'existe pas
 * dans une schématique : sans ce tri, la palette proposait l'air, les marqueurs d'apparition
 * et l'outil qui efface le minerai.
 */
export function buildables(catalogue) {
  return Object.entries(catalogue.blocks)
    .filter(([, block]) => block.cost && !block.floor && !block.wall)
    .map(([name, block]) => ({ name, block }));
}

/**
 * Monte le rail et rend de quoi le tenir à jour.
 *
 * `onPick` reçoit le nom du bloc choisi, ou `null` quand on repose ce qu'on avait en main.
 */
export function mountRail({ host, catalogue, onPick }) {
  const all = buildables(catalogue);

  host.innerHTML = `
    <div class="editor-tabs">
      <button type="button" data-tab="build" aria-pressed="true">BÂTIR</button>
      <button type="button" data-tab="ground" aria-pressed="false">SOL</button>
    </div>
    <div class="search">
      <input type="search" placeholder="Chercher dans ${all.length} blocs"
             aria-label="Chercher un bloc">
    </div>
    <div class="editor-grid" role="listbox" aria-label="Blocs"></div>
    <div class="editor-held"><p class="empty">Rien en main. Choisis un bloc.</p></div>`;

  const grid = host.querySelector(".editor-grid");
  const held = host.querySelector(".editor-held");
  const search = host.querySelector(".search input");
  let holding = null;

  const paint = (needle = "") => {
    const shown = needle
      ? all.filter(({ name }) => name.includes(needle.toLowerCase()))
      : all;
    grid.innerHTML = shown.map(({ name }) => {
      const src = iconOf(name);
      return `<button type="button" data-block="${escape(name)}" title="${escape(name)}"
        aria-pressed="${name === holding}">${
        src ? `<img src="${src}" alt="${escape(name)}">` : escape(name.slice(0, 3))}</button>`;
    }).join("");
  };

  const rail = {
    /** Ce qui est en main, dit en toutes lettres : rien n'apprend les raccourcis à celui qui arrive. */
    setHeld(name, rotation = 0) {
      holding = name;
      for (const chip of grid.querySelectorAll("[data-block]")) {
        chip.setAttribute("aria-pressed", String(chip.dataset.block === name));
      }
      if (!name) {
        held.innerHTML = `<p class="empty">Rien en main. Choisis un bloc.</p>`;
        return;
      }
      const block = catalogue.blocks[name] || {};
      const src = iconOf(name, 22);
      const arrow = block.rotate ? ["→", "↑", "←", "↓"][rotation % 4] : "";
      held.innerHTML = `
        <div class="name">${src ? `<img src="${src}" alt="">` : ""}
          <span>${escape(name)}</span>${arrow ? `<span class="num">${arrow}</span>` : ""}</div>
        <div class="cost">${escape(costOf(block))}</div>`;
    },
    destroy() {
      host.innerHTML = "";
    },
  };

  grid.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-block]");
    if (!chip) return;
    /* Recliquer le bloc qu'on tient le repose. Sans ça, la seule façon de vider la main est
       échap, et il faut le savoir. */
    onPick(chip.dataset.block === holding ? null : chip.dataset.block);
  });

  search.addEventListener("input", (event) => paint(event.target.value.trim()));

  paint();
  return rail;
}

/**
 * La jauge de taille du haut.
 *
 * Elle est permanente et pas seulement présente au moment du refus : une limite dure qu'on
 * découvre quand elle mord est une limite qui donne l'impression d'un bug.
 */
export function sizeGauge(host, MAX_SIZE) {
  host.innerHTML = `<span class="num"></span>
    <span class="bar"><i></i></span>`;
  const label = host.querySelector(".num");
  const fill = host.querySelector("i");
  return (box) => {
    const worst = Math.max(box.width, box.height);
    label.textContent = `${box.width} × ${box.height} / ${MAX_SIZE} × ${MAX_SIZE}`;
    fill.style.width = `${Math.min(100, (worst / MAX_SIZE) * 100)}%`;
    host.classList.toggle("full", worst >= MAX_SIZE);
  };
}
