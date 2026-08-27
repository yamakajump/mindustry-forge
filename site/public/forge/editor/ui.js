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
 * Les trois couches du sol, comme le jeu les empile.
 *
 * Un minerai va **par dessus** un sol, pas à sa place, et un mur va par dessus les deux.
 * Les séparer dans l'interface est ce qui évite d'avoir à deviner, en voyant une pastille
 * de cuivre, si la poser effacera la pierre qui est dessous.
 */
const LAYERS = [
  { key: "floor", label: "Sols",
    of: (block) => block.floor && !block.overlay && !block.wall },
  { key: "overlay", label: "Minerais", of: (block) => block.overlay },
  { key: "wall", label: "Murs", of: (block) => block.wall },
];

/** Les outils du pinceau, ceux de l'éditeur de carte du jeu. */
const TOOLS = [
  { key: "pencil", label: "Crayon", hint: "peindre à la main, taille réglable" },
  { key: "rect", label: "Rectangle", hint: "remplir une zone d'un glissé" },
  { key: "bucket", label: "Pot", hint: "remplir la zone contiguë de même sol" },
  { key: "eraser", label: "Gomme", hint: "effacer le sol peint" },
];

/** Ce que le catalogue offre pour peindre, rangé par couche. */
export function grounds(catalogue) {
  return LAYERS.map((layer) => ({
    ...layer,
    blocks: Object.entries(catalogue.blocks)
      .filter(([, block]) => layer.of(block))
      .map(([name]) => name)
      .sort(),
  }));
}

/**
 * Monte le rail et rend de quoi le tenir à jour.
 *
 * `onPick` reçoit le nom du bloc choisi, ou `null` quand on repose ce qu'on avait en main.
 */
export function mountRail({ host, catalogue, onPick, onTab, onBrush }) {
  const all = buildables(catalogue);
  const layers = grounds(catalogue);

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
    <div class="editor-ground" hidden>
      <div class="tools">
        ${TOOLS.map((tool, i) => `<button type="button" class="chip" data-tool="${tool.key}"
          title="${escape(tool.hint)}" aria-pressed="${i === 0}">${escape(tool.label)}</button>`)
          .join("")}
      </div>
      <label class="size">Taille du crayon
        <input type="range" min="1" max="9" step="2" value="1">
        <span class="num">1 × 1</span></label>
      <label class="fade">Transparence des blocs
        <input type="range" min="0" max="100" value="35">
        <span class="num">35 %</span></label>
      ${layers.map((layer) => `<section data-layer="${layer.key}">
        <h3>${escape(layer.label)} <span class="num">${layer.blocks.length}</span></h3>
        <div class="chips"></div>
      </section>`).join("")}
      <button type="button" class="wipe">Effacer tout le sol peint</button>
    </div>
    <div class="editor-held"><p class="empty">Rien en main. Choisis un bloc.</p></div>`;

  const grid = host.querySelector(".editor-grid");
  const held = host.querySelector(".editor-held");
  const search = host.querySelector(".search input");
  const groundPanel = host.querySelector(".editor-ground");
  const filters = host.querySelector(".editor-filters");
  const searchRow = host.querySelector(".search");
  let holding = null;
  let needle = "";
  let planet = "";
  let category = "";

  /** Ce que le pinceau tient : quelle couche, quel bloc, quel outil, quelle taille. */
  const brush = { layer: "floor", block: null, tool: "pencil", size: 1 };

  /* Les pastilles de sol, dessinées une fois : elles ne se filtrent pas et ne bougent pas. */
  for (const layer of layers) {
    const box = groundPanel.querySelector(`[data-layer="${layer.key}"] .chips`);
    box.innerHTML = layer.blocks.map((name) => {
      const src = iconOf(name, 20);
      return `<button type="button" class="chip pick" data-ground="${escape(name)}"
        data-of="${layer.key}" title="${escape(name)}" aria-pressed="false">${
        src ? `<img src="${src}" alt="">` : ""}${escape(name.replace(/-/g, " "))}</button>`;
    }).join("");
  }

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

  /* ------------------------------------------------------------------------------------
     L'onglet sol.

     Bâtir et peindre sont deux intentions, avec deux palettes et deux jeux d'outils. Il n'y
     a pas de barre d'outils du côté bâtir parce que le jeu n'en a pas ; il y en a une ici
     parce que l'éditeur de carte du jeu en a une. L'asymétrie est voulue.
     ------------------------------------------------------------------------------------ */

  const sizeRange = groundPanel.querySelector(".size input");
  const sizeLabel = groundPanel.querySelector(".size .num");
  const fadeRange = groundPanel.querySelector(".fade input");
  const fadeLabel = groundPanel.querySelector(".fade .num");

  function showTab(which) {
    const onGround = which === "ground";
    for (const tab of host.querySelectorAll("[data-tab]")) {
      tab.setAttribute("aria-pressed", String(tab.dataset.tab === which));
    }
    groundPanel.hidden = !onGround;
    grid.hidden = onGround;
    filters.hidden = onGround;
    searchRow.hidden = onGround;
    held.hidden = onGround;
    /* La transparence bascule toute seule : passer sur le sol fond les blocs pour qu'on
       voie ce qu'on peint, revenir les rend opaques. C'est ce qui supprime la peinture à
       l'aveugle sans demander un geste de plus, et c'était le défaut principal de l'édition
       d'avant, où le curseur vivait dans une autre carte que le pinceau. */
    onTab?.(which, onGround ? Number(fadeRange.value) / 100 : 1, brush);
  }

  host.querySelector(".editor-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) showTab(tab.dataset.tab);
  });

  groundPanel.querySelector(".tools").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (!button) return;
    brush.tool = button.dataset.tool;
    for (const other of groundPanel.querySelectorAll("[data-tool]")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
    onBrush?.(brush);
  });

  groundPanel.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-ground]");
    if (!chip) return;
    const same = brush.block === chip.dataset.ground;
    brush.block = same ? null : chip.dataset.ground;
    brush.layer = chip.dataset.of;
    for (const other of groundPanel.querySelectorAll("[data-ground]")) {
      other.setAttribute("aria-pressed", String(!same && other === chip));
    }
    onBrush?.(brush);
  });

  sizeRange.addEventListener("input", () => {
    brush.size = Number(sizeRange.value);
    sizeLabel.textContent = `${brush.size} × ${brush.size}`;
    onBrush?.(brush);
  });

  fadeRange.addEventListener("input", () => {
    fadeLabel.textContent = `${fadeRange.value} %`;
    onTab?.("ground", Number(fadeRange.value) / 100, brush);
  });

  groundPanel.querySelector(".wipe").addEventListener("click", () => onBrush?.(brush, "wipe"));

  rail.brush = brush;
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


/**
 * La liste des raccourcis, aux touches du jeu.
 *
 * Relevée dans `Binding` de la v159.7, et pas choisie. Un joueur qui arrive ici a déjà ces
 * gestes dans les doigts : lui en imposer d'autres, ce serait lui demander de désapprendre
 * les siens pour se servir d'un outil qui parle de son jeu.
 *
 * Les trois seuls écarts sont listés à part et chacun a sa raison. Un panneau d'aide qui
 * cache ses divergences est un panneau qui ment.
 */
const SHORTCUTS = [
  ["Bâtir", [
    ["clic gauche", "poser"],
    ["glisser", "tracer une ligne, ou remplir une zone"],
    ["molette", "tourner ce qu'on tient"],
    ["ctrl", "placement diagonal, en escalier"],
    ["clic droit", "casser"],
    ["clic droit glissé", "casser une zone"],
    ["clic milieu", "reprendre le bloc visé, avec sa rotation"],
    ["R tenu + molette", "tourner un bloc déjà posé"],
    ["échap", "reposer ce qu'on tient"],
  ]],
  ["Sélection", [
    ["F + glisser", "sélectionner une zone"],
    ["glisser dedans", "la déplacer"],
    ["Z", "miroir gauche-droite"],
    ["X", "miroir haut-bas"],
    ["ctrl+C", "copier, collable dans le jeu"],
    ["ctrl+V", "coller, y compris depuis le jeu"],
    ["suppr", "supprimer"],
  ]],
  ["Vue et historique", [
    ["molette, main vide", "zoomer"],
    ["ctrl+molette", "zoomer même en tenant un bloc"],
    ["clic milieu glissé", "déplacer la vue"],
    ["espace + glisser", "déplacer la vue"],
    ["ctrl+Z", "annuler"],
    ["ctrl+Y", "refaire"],
  ]],
];

/** Ce qui diffère du jeu, et pourquoi. Dit plutôt que caché. */
const DIVERGENCES = [
  ["La molette zoome aussi", "le jeu la réserve à la rotation et suit le joueur du regard ; "
    + "ici il n'y a personne à suivre, donc elle zoome dès qu'on n'a rien en main"],
  ["Déplacer la vue", "le jeu n'en a pas besoin, sa caméra suit le joueur"],
  ["Q ne fait rien", "le jeu s'en sert pour vider la file de construction, et il n'y a "
    + "pas de file ici"],
];

export function showHelp(host) {
  const already = host.querySelector(".editor-help");
  if (already) return already.remove();

  const panel = document.createElement("div");
  panel.className = "editor-help";
  panel.innerHTML = `
    <div class="sheet">
      <h2>Les raccourcis, comme dans le jeu</h2>
      ${SHORTCUTS.map(([title, rows]) => `<section><h3>${escape(title)}</h3>
        ${rows.map(([keys, what]) => `<div class="row">
          <kbd>${escape(keys)}</kbd><span>${escape(what)}</span></div>`).join("")}
      </section>`).join("")}
      <section class="apart"><h3>Les trois écarts, et pourquoi</h3>
        ${DIVERGENCES.map(([what, why]) => `<div class="row">
          <b>${escape(what)}</b><span>${escape(why)}</span></div>`).join("")}
      </section>
      <button type="button" class="primary">Fermer</button>
    </div>`;
  panel.querySelector("button").onclick = () => panel.remove();
  panel.onclick = (event) => { if (event.target === panel) panel.remove(); };
  host.appendChild(panel);
}
