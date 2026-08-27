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
 *
 * Triés par l'identifiant du jeu, qui suit l'ordre de son propre registre : à l'intérieur
 * d'une catégorie, un convoyeur arrive avant un convoyeur titane, comme dans l'arbre
 * technologique. L'ordre alphabétique mettrait « titanium-conveyor » avant « conveyor »,
 * ce qui n'est l'ordre de rien.
 */
export function buildables(catalogue) {
  return Object.entries(catalogue.blocks)
    /* Le tri du jeu, et non celui qu'on avait inventé. `buildVisibility` dit ce que le menu
       de construction montre, et `placeablePlayer` si un joueur peut le poser du tout.
       Trier sur « il a un coût de construction » laissait passer des blocs cachés, réservés
       au bac à sable ou à l'éditeur de carte, que personne ne peut poser dans une partie. */
    .filter(([, block]) => block.build_visibility === "shown"
      && block.placeable_player !== false && block.cost)
    .map(([name, block]) => ({ name, block }))
    .sort((a, b) => (a.block.id || 0) - (b.block.id || 0));
}

/**
 * Le nom français d'une catégorie du jeu.
 *
 * C'est de la traduction d'interface, pas de la donnée de jeu : les catégories elles-mêmes
 * sortent du catalogue, et une catégorie inconnue de cette table s'affiche telle quelle
 * plutôt que de disparaître.
 */
const CATEGORIES = {
  turret: "Tourelles", production: "Production", distribution: "Distribution",
  liquid: "Liquides", power: "Énergie", defense: "Défense", crafting: "Usines",
  units: "Unités", effect: "Effets", logic: "Logique",
};

const PLANETS = { serpulo: "Serpulo", erekir: "Erekir" };

/**
 * Monte le rail et rend de quoi le tenir à jour.
 *
 * `onPick` reçoit le nom du bloc choisi, ou `null` quand on repose ce qu'on avait en main.
 */
export function mountRail({ host, catalogue, onPick }) {
  const all = buildables(catalogue);

  /* Les catégories et les planètes présentes, prises au catalogue plutôt qu'écrites ici.
     Une liste tenue à la main se met à mentir le jour où le jeu en ajoute une. */
  const categories = [...new Set(all.map(({ block }) => block.category))].filter(Boolean);
  const planets = [...new Set(all.map(({ block }) => block.planet))].filter(Boolean);

  host.innerHTML = `
    <div class="editor-tabs">
      <button type="button" data-tab="build" aria-pressed="true">BÂTIR</button>
      <button type="button" data-tab="ground" aria-pressed="false">SOL</button>
    </div>
    <div class="search">
      <input type="search" placeholder="Chercher dans ${all.length} blocs"
             aria-label="Chercher un bloc">
    </div>
    <div class="editor-filters">
      <div class="chips planets">
        <button type="button" class="chip" data-planet="" aria-pressed="true">Tout</button>
        ${planets.map((p) => `<button type="button" class="chip" data-planet="${escape(p)}"
           aria-pressed="false">${escape(PLANETS[p] || p)}</button>`).join("")}
      </div>
      <select class="cats" aria-label="Categorie de blocs">
        <option value="">Toutes categories</option>
        ${categories.map((c) => `<option value="${escape(c)}">${
          escape(CATEGORIES[c] || c)}</option>`).join("")}
      </select>
    </div>
    <div class="editor-grid" role="listbox" aria-label="Blocs"></div>
    <div class="editor-held"><p class="empty">Rien en main. Choisis un bloc.</p></div>`;

  const grid = host.querySelector(".editor-grid");
  const held = host.querySelector(".editor-held");
  const search = host.querySelector(".search input");
  let holding = null;
  let needle = "";
  let planet = "";
  let category = "";

  const paint = () => {
    const shown = all.filter(({ name, block }) =>
      (!needle || name.includes(needle))
      && (!planet || block.planet === planet)
      && (!category || block.category === category));

    if (!shown.length) {
      grid.innerHTML = `<p class="empty">Aucun bloc ne répond à ça.</p>`;
      return;
    }
    grid.innerHTML = shown.map(({ name, block }) => {
      const src = iconOf(name);
      return `<button type="button" data-block="${escape(name)}"
        title="${escape(name)} — ${escape(costOf(block))}"
        aria-pressed="${name === holding}">${
        src ? `<img src="${src}" alt="${escape(name)}">` : escape(name.slice(0, 3))}</button>`;
    }).join("");
  };

  /** Un groupe de filtres où un seul choix vaut à la fois. */
  const wireFilter = (selector, attribute, set) => {
    host.querySelector(selector).addEventListener("click", (event) => {
      const chip = event.target.closest(`[data-${attribute}]`);
      if (!chip) return;
      set(chip.dataset[attribute]);
      for (const other of host.querySelectorAll(`${selector} [data-${attribute}]`)) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
      paint();
    });
  };
  wireFilter(".planets", "planet", (v) => { planet = v; });

  /* La categorie est une liste deroulante et non des pastilles, faute de place : les onze
     pastilles occupaient cinq rangees, soit un tiers de la hauteur du rail, contre une
     ligne ici. Le jeu les montre en icones sur une seule rangee, mais ses icones de
     categorie ne sont pas dans l atlas et aller les chercher dans le jar est un chantier
     a lui seul. Une liste deroulante ne cache aucune option, contrairement a une rangee
     qui defile. */
  host.querySelector("select.cats").addEventListener("change", (event) => {
    category = event.target.value;
    paint();
  });

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

  search.addEventListener("input", (event) => {
    needle = event.target.value.trim().toLowerCase();
    paint();
  });

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
