/**
 * The rail, the top bar and the status bar.
 *
 * Everything that is not the board lives here, and takes little room: 280 pixels on the left
 * and two thin bars. The board is the product; the rest gives way to it.
 *
 * No list of blocks is written by hand. The categories, the worlds and the costs come out of
 * the catalogue, which comes out of the game: a second copy of the game's data is exactly
 * what this repository spends its time avoiding.
 */

import { itemIcon } from "../render.js";

/** A block's sprite, cached: the same chip is redrawn on every search. */
const icons = new Map();
function iconOf(name, pixels = 26) {
  const key = `${name}@${pixels}`;
  if (!icons.has(key)) icons.set(key, itemIcon(name, pixels * 2, "") || "");
  return icons.get(key);
}

const escape = (s) => String(s).replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/** What a block costs to build, said in the player's language. */
function costOf(block) {
  const parts = Object.entries(block?.cost || {});
  if (!parts.length) return "gratuit";
  return parts.map(([item, count]) => `${count} ${item}`).join(", ");
}

/**
 * The blocks a player can place.
 *
 * A floor is not a block you place, and a block with no build cost does not exist inside a
 * schematic: without this filter the palette offered air, the spawn markers and the tool
 * that erases ore.
 *
 * Sorted by the game's own id, which follows the order of its own registry: inside a
 * category, a conveyor comes before a titanium conveyor, as in the tech tree. Alphabetical
 * order would put "titanium-conveyor" before "conveyor", which is the order of nothing.
 */
export function buildables(catalogue) {
  return Object.entries(catalogue.blocks)
    /* The game's filter, and not the one we had invented. `buildVisibility` says what the
       build menu shows, and `placeablePlayer` whether a player can place it at all.
       Filtering on "it has a build cost" let through hidden blocks, reserved for the sandbox
       or the map editor, that nobody can place in a game. */
    .filter(([, block]) => block.build_visibility === "shown"
      && block.placeable_player !== false && block.cost)
    .map(([name, block]) => ({ name, block }))
    .sort((a, b) => (a.block.id || 0) - (b.block.id || 0));
}

/**
 * The French name of a game category.
 *
 * This is interface translation, not game data: the categories themselves come out of the
 * catalogue, and a category this table does not know is shown as it stands rather than
 * disappearing.
 */
const CATEGORIES = {
  turret: "Tourelles", production: "Production", distribution: "Distribution",
  liquid: "Liquides", power: "Énergie", defense: "Défense", crafting: "Usines",
  units: "Unités", effect: "Effets", logic: "Logique",
};

const PLANETS = { serpulo: "Serpulo", erekir: "Erekir" };

/**
 * The three layers of the ground, the way the game stacks them.
 *
 * An ore goes **over** a floor, not in its place, and a wall goes over both. Keeping them
 * apart in the interface is what saves somebody, looking at a copper chip, from having to
 * guess whether placing it will erase the stone underneath.
 */
const LAYERS = [
  { key: "floor", label: "Sols",
    of: (block) => block.floor && !block.overlay && !block.wall },
  { key: "overlay", label: "Minerais", of: (block) => block.overlay },
  { key: "wall", label: "Murs", of: (block) => block.wall },
];

/** The brush tools, the ones from the game's own map editor. */
const TOOLS = [
  { key: "pencil", label: "Crayon", hint: "peindre à la main, taille réglable" },
  { key: "rect", label: "Rectangle", hint: "remplir une zone d'un glissé" },
  { key: "bucket", label: "Pot", hint: "remplir la zone contiguë de même sol" },
  { key: "eraser", label: "Gomme", hint: "effacer le sol peint" },
];

/** What the catalogue offers to paint with, filed by layer. */
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
 * Mount the rail and return the handles that keep it up to date.
 *
 * `onPick` receives the name of the chosen block, or `null` when what was held is put down.
 */
export function mountRail({ host, catalogue, onPick, onTab, onBrush }) {
  const all = buildables(catalogue);
  const layers = grounds(catalogue);

  /* The categories and worlds that are actually present, taken from the catalogue rather
     than written here. A hand-kept list starts lying the day the game adds one. */
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

  /** What the brush holds: which layer, which block, which tool, which size. */
  const brush = { layer: "floor", block: null, tool: "pencil", size: 1 };

  /* The ground chips, drawn once: they are not filtered and they do not move. */
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

  /** A group of filters where only one choice holds at a time. */
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

  /* The category is a dropdown rather than chips, for want of room: the eleven chips took
     five rows, a third of the height of the rail, against one line here. The game shows them
     as icons on a single row, but its category icons are not in the atlas and fetching them
     out of the jar is a job of its own. A dropdown hides no option, unlike a row that
     scrolls. */
  host.querySelector("select.cats").addEventListener("change", (event) => {
    category = event.target.value;
    paint();
  });

  const rail = {
    /** What is held, spelled out: nothing teaches the shortcuts to somebody arriving. */
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
    /* Clicking the held block again puts it down. Without this, the only way to empty the
       hand is escape, and you have to know that. */
    onPick(chip.dataset.block === holding ? null : chip.dataset.block);
  });

  search.addEventListener("input", (event) => {
    needle = event.target.value.trim().toLowerCase();
    paint();
  });

  /* ------------------------------------------------------------------------------------
     The ground tab.

     Building and painting are two intentions, with two palettes and two sets of tools. There
     is no toolbar on the building side because the game has none; there is one here because
     the game's map editor has one. The asymmetry is deliberate.
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
    /* The fade switches on its own: moving to the ground tab melts the blocks so that what
       is being painted can be seen, and coming back makes them solid again. That is what
       removes painting blind without asking for one more gesture, and it was the main defect
       of the previous editing mode, where the cursor lived on a different map from the
       brush. */
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
 * The size gauge at the top.
 *
 * It is permanent, not merely present at the moment of refusal: a hard limit discovered when
 * it bites is a limit that feels like a bug.
 *
 * Reports the active frame once frames exist, not the board: `name` prefixes the reading
 * ("cadre fonderie - 22 x 14 / 64 x 64") so what is measured is never in doubt. Both
 * `cap` and `name` default to the board-wide reading used before frames existed, so the
 * one call site that still means "the whole board" needs no change.
 */
export function sizeGauge(host, MAX_SIZE) {
  host.innerHTML = `<span class="num"></span>
    <span class="bar"><i></i></span>`;
  const label = host.querySelector(".num");
  const fill = host.querySelector("i");
  return (box, cap = MAX_SIZE, name = null) => {
    const worst = Math.max(box.width, box.height);
    label.textContent = `${name ? `${name} - ` : ""}${box.width} × ${box.height} / ${cap} × ${cap}`;
    fill.style.width = `${Math.min(100, (worst / cap) * 100)}%`;
    host.classList.toggle("full", worst >= cap);
  };
}


/**
 * The list of shortcuts, on the game's own keys.
 *
 * Read out of `Binding` in v159.7, not chosen. A player arriving here already has those
 * gestures in their fingers: imposing different ones would be asking them to unlearn their
 * own in order to use a tool that talks about their game.
 *
 * The only three departures are listed separately and each has its reason. A help panel that
 * hides where it diverges is a panel that lies.
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
  ["Cadres", [
    ["C + glisser", "dessiner un cadre, 64 tuiles de côté au plus"],
    ["clic sur son nom", "le rendre actif"],
  ]],
];

/** What differs from the game, and why. Said rather than hidden. */
const DIVERGENCES = [
  ["La molette zoome aussi", "le jeu la réserve à la rotation et suit le joueur du regard ; "
    + "ici il n'y a personne à suivre, donc elle zoome dès qu'on n'a rien en main"],
  ["Déplacer la vue", "le jeu n'en a pas besoin, sa caméra suit le joueur"],
  ["Q ne fait rien", "le jeu s'en sert pour vider la file de construction, et il n'y a "
    + "pas de file ici"],
  ["Les cadres", "le jeu n'a pas de plateau plus grand qu'une schématique ; ici le plateau "
    + "est un établi, et un cadre en marque un chantier"],
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
      <section class="apart"><h3>Les écarts, et pourquoi</h3>
        ${DIVERGENCES.map(([what, why]) => `<div class="row">
          <b>${escape(what)}</b><span>${escape(why)}</span></div>`).join("")}
      </section>
      <button type="button" class="primary">Fermer</button>
    </div>`;
  panel.querySelector("button").onclick = () => panel.remove();
  panel.onclick = (event) => { if (event.target === panel) panel.remove(); };
  host.appendChild(panel);
}
