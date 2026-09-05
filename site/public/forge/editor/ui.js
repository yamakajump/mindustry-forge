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

import { groundPlanets, itemIcon } from "../render.js";
import { loadNames, nameOf } from "../noms.js";
import { recall, recallNumber, remember } from "../settings.js";

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

/**
 * The build grid, filed the way the game's own build menu is: as tabs of icons by
 * category, not as one wall of 235 of them under a dropdown.
 *
 * `entries` is expected already sorted by the game's own id, as `buildables` returns it,
 * and that sort is what decides the order of the categories too: a group is opened the
 * moment its first block is met walking that order, so nothing here invents a tab order
 * the catalogue does not already carry. A category `CATEGORIES` does not know still gets
 * a group, titled as the game names it.
 */
export function buildGroups(entries) {
  const order = [];
  const byKey = new Map();
  for (const entry of entries) {
    const key = entry.block.category || "";
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key).push(entry);
  }
  return order.map((key) => ({ key, label: CATEGORIES[key] || key, blocks: byKey.get(key) }));
}

const PLANETS = { serpulo: "Serpulo", erekir: "Erekir" };

/**
 * The four families the ground grid sorts a block into, the way the game stacks and
 * distinguishes them.
 *
 * An ore goes **over** a floor, not in its place, and a wall goes over both. Keeping them
 * apart in the interface is what saves somebody, looking at a copper swatch, from having to
 * guess whether placing it will erase the stone underneath.
 *
 * The floor layer is split again by `floor_liquid`, the catalogue's own flag for a floor a
 * pump can draw from: a grid mixing water with sand is a grid nobody can scan. No family
 * here is a hand-kept list of names; each is a predicate over fields the catalogue already
 * carries, so a floor the game adds tomorrow files itself.
 */
const LAYERS = [
  { key: "floor", label: "Sols",
    of: (block) => block.floor && !block.floor_liquid && !block.overlay && !block.wall },
  { key: "floor-liquid", label: "Liquides",
    of: (block) => block.floor && block.floor_liquid && !block.overlay && !block.wall },
  { key: "overlay", label: "Minerais", of: (block) => block.overlay },
  { key: "wall", label: "Murs", of: (block) => block.wall },
];

/**
 * Where a family's picks actually land on the board.
 *
 * The grid above sorts a solid floor and a liquid one into two families so a search can
 * scan them apart, but the board keeps one ground slot per stacked layer, three of them
 * (`floor`, `overlay`, `wall`), not four: a liquid floor still paints into `floor`, the
 * same slot a solid one does. Nothing else in this repository ever reads a `floor-liquid`
 * key: not `rules.js`'s deep-liquid refusal, not its pump eligibility, not `ground.js`'s
 * yield, not `render.js`'s draw. Painting a lake through the family grid, before this,
 * wrote a key none of them looked at, so the lake did not render, could not be pumped, and
 * never refused a non-floating block standing on it.
 */
export function storageLayerOf(familyKey) {
  return familyKey === "floor-liquid" ? "floor" : familyKey;
}

/**
 * The brush tools, the ones from the game's own map editor.
 *
 * `icon` is the inside of a 24x24 `<svg>`, drawn plain rather than fetched: these five
 * gestures have no sprite in the game's own atlas, unlike every block this file otherwise
 * draws from it. The icon stays `aria-hidden` and `label` is written under it, which is
 * also what names the button: an `aria-label` alongside visible text would override the
 * text for a screen reader and give two names to maintain instead of one. `hint` stays in
 * `title`, where a longer sentence has room to say what the gesture actually does.
 */
const TOOLS = [
  { key: "pencil", label: "Crayon", hint: "peindre à la main, taille réglable",
    icon: `<path d="M4 20l1-5L15 5l4 4L9 19z"/><path d="M13 7l4 4"/>` },
  { key: "rect", label: "Rectangle", hint: "remplir une zone d'un glissé",
    icon: `<rect x="5" y="7" width="14" height="10" rx="1.5"/>` },
  { key: "bucket", label: "Pot", hint: "remplir la zone contiguë de même sol",
    icon: `<path d="M5 8h14l-1.6 10a2 2 0 01-2 1.7H8.6a2 2 0 01-2-1.7z"/><path d="M3.5 8h17"/>` },
  { key: "eraser", label: "Gomme", hint: "effacer le sol peint",
    icon: `<path d="M7 15l7-9 5 4-6.5 8H10z"/><path d="M12 8.5l5 4"/>` },
  { key: "pipette", label: "Pipette", hint: "reprendre le sol, le minerai ou le mur cliqué",
    icon: `<path d="M14.5 3.5l6 6-2.5 2.5-2-2-7.5 7.5H6v-2.5l7.5-7.5-2-2z"/>` },
];

/**
 * How many floors the recents row remembers.
 *
 * Six, because that is one full row of the grid the swatches are drawn in (Task 1 of the
 * palette rebuild measured six across at 280px). A seventh would spill onto a second row
 * and start pushing the families themselves down the page, which is the thing this row
 * exists to avoid doing.
 */
const RECENTS_CAP = 6;

const RECENTS_KEY = "forge:sol-recents";

/**
 * Move `entry` to the front of `list`, matched by name.
 *
 * Painting the same floor twice must move it to the front rather than duplicate it, and
 * the list never grows past `cap`: past it, the oldest entry (the last one) falls off.
 *
 * Pure on purpose, so the three rules above are each a one-line test rather than a click
 * nobody watches fail first.
 */
export function pushRecent(list, entry, cap = RECENTS_CAP) {
  return [entry, ...list.filter((item) => item.name !== entry.name)].slice(0, cap);
}

/**
 * The recents row, kept in the browser across a reload.
 *
 * Same storage as the draft, same failure handling: a browser that refuses to write
 * (private mode, a full quota) loses the row, which is a nuisance, not a reason to bring
 * the editor down.
 */
export function readRecents() {
  try {
    const kept = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(kept)
      ? kept.filter((entry) => entry && typeof entry.name === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeRecents(list) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    /* See readRecents: losing the row is fine, losing the editor is not. */
  }
}

/**
 * Whether a piece of ground belongs on the planet being filtered for.
 *
 * The build grid reads `block.planet`, stamped by walking each planet's tech tree. Terrain
 * is on no tech tree, so that field is empty for every floor, every ore and every static
 * wall, and this reads `sols.json`'s `planets` instead: which planets the game was measured
 * putting each one down on, by `bench`'s `dump-ground`. Same question as the build grid
 * answers, asked of the one source that can answer it for the ground.
 *
 * Two things are deliberately shown rather than hidden. A floor no planet places, such as
 * `air` or the editor's own coloured floor, stays visible under either filter: not knowing
 * where a floor belongs is not the same as knowing it belongs elsewhere. And a page whose
 * `sols.json` never arrived has no `homes` at all, which shows everything rather than
 * emptying the palette over a failed fetch.
 */
export function onPlanet(name, planet, homes) {
  if (!planet) return true;
  const where = homes?.[name];
  return !where || where.includes(planet);
}

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
 * Which layer a pipette takes off a stacked tile: the wall, then the ore, then the floor.
 *
 * Not assumed: `EditorTool.pick` in `mindustry.editor`, v159.7, reads a tile in exactly
 * this order, falling through only when the layer above is empty.
 *
 *     editor.drawBlock = tile.block() == Blocks.air || !tile.block().inEditor
 *       ? (tile.overlay() == Blocks.air ? tile.floor() : tile.overlay())
 *       : tile.block();
 *
 * https://github.com/Anuken/Mindustry/blob/v159.7/core/src/mindustry/editor/EditorTool.java
 *
 * Pure, so this is the one line of the pipette a test watches rather than a click: the
 * event handling around it stays untested, the way `pipette()` in `mount.js` already does
 * for the build side.
 */
export function pipetteLayerOf(layers) {
  if (!layers) return null;
  if (layers.wall) return { layer: "wall", block: layers.wall };
  if (layers.overlay) return { layer: "overlay", block: layers.overlay };
  if (layers.floor) return { layer: "floor", block: layers.floor };
  return null;
}

/**
 * The article an item or a liquid needs mid-sentence, since the catalogue states no
 * gender and the game's own French names are nouns, not phrases. Bounded to what a floor
 * can actually give a drill or a pump today (ten items, five liquids); a floor giving a
 * new one falls back to "du ", which is wrong roughly as often as a guess would be.
 */
const ARTICLE_OF = {
  water: "de l'", oil: "du ", cryofluid: "du ", slag: "des ", arkycite: "de l'",
  sand: "du ", copper: "du ", lead: "du ", scrap: "de la ", coal: "du ",
  titanium: "du ", thorium: "du ", beryllium: "du ", tungsten: "du ", graphite: "du ",
};

/**
 * What `Block.sumAttribute` reads off a floor or a wall, named the way a player would ask
 * for it. Six keys, the whole set: five read off a floor (`spores`, `heat`, `water`,
 * `oil`, `steam`) and one off a wall (`sand`, for a cliff crusher), and nothing in the
 * shipped catalogue reads a seventh.
 */
const ATTRIBUTE_LABEL = {
  spores: "spores", heat: "chaleur", water: "eau", oil: "pétrole", steam: "vapeur",
  sand: "sable",
};

const frenchNumber = (n) => (Math.round(n * 100) / 100).toString().replace(".", ",");

/**
 * The one-line rule a ground swatch is worth, read off the same catalogue fields
 * `rules.js` reads a placement against. Where the palette and a refusal talk about the
 * same constraint, they say it the same way: `canPlace` refuses a non-floating block on a
 * deep floor with the exact sentence reused below.
 *
 * Fewer, truer sentences beat one per field. Two of the nine fields this repository
 * catalogues for the ground are deliberately left unsaid:
 *
 * - `unmineable`: `DumpBlocks.java` writes it from `floor.playerUnmineable`, which gates a
 *   unit's own hand-mining. Neither `Drill.canMine` in the game nor `minable()` in
 *   `rules.js` reads it, so a drill still works on sand despite the name; saying "can't be
 *   mined" here would be false for the one reason the field sounds like it should be true.
 * - `wall_ore`: it says how an ore is drawn (out of a wall rather than a floor), not what
 *   changes for a player choosing a floor. The `drops` sentence below already says what
 *   comes out, regardless of which way the game draws it.
 */
export function groundRule(name, catalogue) {
  const block = catalogue.blocks[name];
  if (!block) return "";

  const clauses = [];

  if (block.wall) {
    clauses.push("rien ne se construit sur un mur");
  } else if (block.drops_liquid) {
    const liquid = `${ARTICLE_OF[block.drops_liquid] || "du "}${
      nameOf("liquid", block.drops_liquid).toLowerCase()}`;
    const rate = block.liquid_multiplier && block.liquid_multiplier !== 1
      ? ` (x${frenchNumber(block.liquid_multiplier)})` : "";
    clauses.push(block.deep
      ? `un liquide profond ne porte que ce qui flotte : ${liquid}${rate}`
      : `une pompe y tire ${liquid}${rate}`);
  } else if (block.drops) {
    const item = `${ARTICLE_OF[block.drops] || "du "}${nameOf("item", block.drops).toLowerCase()}`;
    clauses.push(`une foreuse peut y creuser ${item}, si elle sait le faire`);
  }

  const attrs = Object.entries(block.attributes || {});
  if (attrs.length) {
    const said = attrs
      .map(([key, value]) =>
        `${ATTRIBUTE_LABEL[key] || key} ${value > 0 ? "+" : ""}${frenchNumber(value)}`)
      .join(", ");
    clauses.push(`attributs : ${said}`);
  }

  return clauses.join(" ; ");
}

/**
 * Mount the rail and return the handles that keep it up to date.
 *
 * `onPick` receives the name of the chosen block, or `null` when what was held is put down.
 */
export function mountRail({ host, catalogue, onPick, onTab, onBrush }) {
  const all = buildables(catalogue);
  const groups = buildGroups(all);
  const layers = grounds(catalogue);
  /* Floors, ores and walls together: what the ground tab's search actually walks. */
  const groundCount = layers.reduce((total, layer) => total + layer.blocks.length, 0);

  /* Fetched once, here, so it has the best chance of being answered by the time anything
     asks for a name: the status bar reads it on a hover or a pick, never at mount, and
     both are gestures a page just drawn has not had time to receive yet. `nameOf` never
     leaves a caller waiting either way, an unanswered fetch degrades to the identifier. */
  loadNames();

  /* The worlds actually present, taken from the catalogue rather than written here. A
     hand-kept list starts lying the day the game adds one. The categories no longer need
     their own such list: `buildGroups` already reads them off `all`, in the game's own
     order, so the grid headings are that list. */
  const planets = [...new Set(all.map(({ block }) => block.planet))].filter(Boolean);

  /* Which of them the panel opens on. See the note beside `planet` below. */
  const started = recall("editeur.planete",
    planets.includes("serpulo") ? "serpulo" : "", ["", ...planets]);

  /* And the rest of what the panel is set to. Same rule throughout: a stored value is
     checked against what exists before anything is built from it, so a tool that was
     renamed or a size that came back as a string falls back to the default instead of
     leaving a control nobody can find again. */
  const startTool = recall("editeur.outil", TOOLS[0].key, TOOLS.map((t) => t.key));
  const startTab = recall("editeur.onglet", "build", ["build", "ground"]);
  const startSize = recallNumber("editeur.taille", 1, 1, 9);
  const startFade = recallNumber("editeur.transparence", 35, 0, 100);

  /* The same question for the ground, out of the one source that can answer it: a floor is
     on no tech tree, so `block.planet` is empty for every one of them (see `onPlanet`). One
     chip row drives both grids, so the two answers have to arrive here together. */
  const homes = groundPlanets();

  /**
   * A build swatch: the sprite and nothing else, same reasoning as `groundSwatch` below --
   * a texture reads faster than a name, so the name only travels in `title`.
   */
  const blockSwatch = (name, block) => {
    const src = iconOf(name);
    return `<button type="button" data-block="${escape(name)}"
      title="${escape(name)} · ${escape(costOf(block))}"
      aria-pressed="false">${
      src ? `<img src="${src}" alt="${escape(name)}">` : escape(name.slice(0, 3))}</button>`;
  };

  host.innerHTML = `
    <div class="editor-tabs">
      <button type="button" data-tab="build" aria-pressed="true">BÂTIR</button>
      <button type="button" data-tab="ground" aria-pressed="false">SOL</button>
    </div>
    <div class="editor-recents" hidden>
      <h3>Récents</h3>
      <div class="swatches"></div>
    </div>
    <div class="search">
      <div class="field">
        <svg class="i" aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg>
        <input type="search" placeholder="Chercher dans ${all.length} blocs"
               aria-label="Chercher un bloc">
        <button type="button" class="clear" hidden aria-label="Effacer la recherche">
          <svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <p class="count" aria-live="polite" hidden></p>
    </div>
    <div class="editor-filters">
      <div class="chips planets">
        <button type="button" class="chip" data-planet=""
                aria-pressed="${started === "" ? "true" : "false"}">Tout</button>
        ${planets.map((p) => `<button type="button" class="chip" data-planet="${escape(p)}"
           aria-pressed="${p === started ? "true" : "false"}">${escape(PLANETS[p] || p)}</button>`).join("")}
      </div>
    </div>
    <div class="editor-grid" role="listbox" aria-label="Blocs">
      <p class="empty grid-empty" hidden></p>
      ${groups.map((group) => `<section data-category="${escape(group.key)}">
        <h3>${escape(group.label)} <span class="num">${group.blocks.length}</span></h3>
        <div class="swatches"></div>
      </section>`).join("")}
    </div>
    <div class="editor-ground" hidden>
      <div class="tools">
        ${TOOLS.map((tool) => `<button type="button" class="tool" data-tool="${tool.key}"
          title="${escape(tool.label)} · ${escape(tool.hint)}"
          aria-pressed="${tool.key === startTool}"><svg class="i" aria-hidden="true" viewBox="0 0 24 24">${
          tool.icon}</svg><span>${escape(tool.label)}</span></button>`).join("")}
      </div>
      <div class="brushes">
        <label class="range size" title="Taille du crayon">
          <span class="line"><span class="tag">Taille</span>
            <span class="num">${startSize} × ${startSize}</span></span>
          <input type="range" min="1" max="9" step="2" value="${startSize}"></label>
        <label class="range fade" title="Transparence des blocs, sur l'onglet sol">
          <span class="line"><span class="tag">Transparence</span>
            <span class="num">${startFade} %</span></span>
          <input type="range" min="0" max="100" value="${startFade}"></label>
      </div>
      <p class="empty ground-empty" hidden>Aucun sol ne répond à ça.</p>
      ${layers.map((layer) => `<section data-layer="${layer.key}">
        <h3>${escape(layer.label)} <span class="num">${layer.blocks.length}</span></h3>
        <div class="swatches"></div>
      </section>`).join("")}
      <button type="button" class="wipe">Effacer tout le sol peint</button>
    </div>
    <div class="editor-held"><p class="empty">Rien en main. Choisis un bloc.</p></div>`;

  const grid = host.querySelector(".editor-grid");
  const gridEmpty = grid.querySelector(".grid-empty");
  const held = host.querySelector(".editor-held");
  const search = host.querySelector(".search input");
  const clearSearch = host.querySelector(".search .clear");
  const searchCount = host.querySelector(".search .count");
  const groundPanel = host.querySelector(".editor-ground");
  const groundEmpty = groundPanel.querySelector(".ground-empty");
  const filters = host.querySelector(".editor-filters");
  const recentsRow = host.querySelector(".editor-recents");
  const recentsBox = recentsRow.querySelector(".swatches");
  let holding = null;
  let needle = "";
  /* Serpulo on a first visit, and whatever was chosen on every one after that.
     
     "Tout" was the default and it is the wrong one to arrive on: a player builds on one
     planet at a time, so the opening view mixed in a whole world's worth of blocks they
     cannot place, and the first gesture in the editor was a filter they had to find.
     Serpulo because it is where most people play; the chip to widen it is right there.
     
     Validated against the planets the catalogue actually holds, because a stored value is
     untrusted input: a world that no longer exists would filter the grid down to nothing
     and leave a player looking at an empty palette. */
  let planet = started;
  let onGroundTab = false;

  /** What the brush holds: which layer, which block, which tool, which size. */
  const brush = { layer: "floor", block: null, tool: startTool, size: startSize };

  /** What was painted with last, most recent first. Kept across a reload. */
  let recents = readRecents();

  /**
   * A swatch: the sprite and nothing else. No text in the button, on purpose: a texture is
   * recognised faster than a name is read, and that is the entire point of a grid over a
   * list. The name still travels, in `title`, for the status line and for a mouse that
   * lingers.
   */
  const groundSwatch = (name, layerKey) => {
    const src = iconOf(name, 26);
    return `<button type="button" class="swatch" data-ground="${escape(name)}"
      data-of="${layerKey}" title="${escape(name)}" aria-pressed="${name === brush.block}">${
      src ? `<img src="${src}" alt="">` : ""}</button>`;
  };

  /* The ground swatches, drawn once per family: they do not move. */
  for (const layer of layers) {
    const box = groundPanel.querySelector(`[data-layer="${layer.key}"] .swatches`);
    box.innerHTML = layer.blocks.map((name) => groundSwatch(name, layer.key)).join("");
  }

  /* The build swatches, drawn once per category: same reasoning as the ground grid above,
     search and the planet filter only ever hide a swatch or a whole section, they do not
     redraw the grid. */
  for (const group of groups) {
    const box = grid.querySelector(`[data-category="${group.key}"] .swatches`);
    box.innerHTML = group.blocks.map(({ name, block }) => blockSwatch(name, block)).join("");
  }

  /**
   * The search box's result count, shown once a query narrows the grid and silent while it
   * does not: a count of everything is not a finding, and showing it either way would be
   * noise on every keystroke rather than an answer to one. Hidden rather than merely empty
   * while silent, so it costs no room either: a live region reserving a blank line above
   * the palette would be the exact defect this pass was asked to fix, repeated in miniature.
   */
  function sayCount(n) {
    searchCount.hidden = !needle;
    if (!needle) return;
    searchCount.textContent = n === 0 ? "Aucun résultat" : n === 1 ? "1 résultat" : `${n} résultats`;
  }

  /** Redraw the recents row from `recents`, and decide whether it is worth showing at all:
      empty on a fresh visit, and hidden outside the ground tab regardless. */
  function paintRecents() {
    recentsBox.innerHTML = recents.map(({ name, layer }) => groundSwatch(name, layer)).join("");
    recentsRow.hidden = !onGroundTab || recents.length === 0;
  }
  paintRecents();

  /**
   * Filter the ground swatches by the search box and by the planet, exactly as `paint`
   * filters the build grid by the same two.
   *
   * A floor's French name does exist, in `noms/fr.json`, and belongs in this match too, so
   * that both spellings find a floor: that is left to whoever wires up the rest of this
   * tab's search to match the build side's own filters, since matching on `name` alone is
   * what this pass found already working here and changing it is not this pass's task.
   *
   * A swatch hides rather than leaves the grid, so nothing is redrawn on every keystroke,
   * and a family with no match left hides its own heading rather than showing an empty
   * count.
   */
  function paintGround() {
    let shown = 0;
    for (const layer of layers) {
      const section = groundPanel.querySelector(`[data-layer="${layer.key}"]`);
      const box = section.querySelector(".swatches");
      let shownInLayer = 0;
      for (const chip of box.children) {
        const name = chip.dataset.ground;
        const match = (!needle || name.includes(needle)) && onPlanet(name, planet, homes);
        chip.hidden = !match;
        if (match) shownInLayer++;
      }
      section.hidden = shownInLayer === 0;
      shown += shownInLayer;
    }
    groundEmpty.hidden = shown > 0;
    groundEmpty.textContent = needle
      ? `Aucun sol ne répond à « ${needle} ».`
      : planet
        ? `Aucun sol de ${PLANETS[planet] || planet} ici.`
        : "Aucun sol ne répond à ça.";
    return shown;
  }
  paintGround();

  /**
   * Filter the build grid, the same way `paintGround` already filters the ground one: a
   * swatch hides rather than leaves the grid, and a category with nothing left to show
   * hides its own heading instead of standing empty under a live count that no longer
   * agrees with what it says.
   */
  const paint = () => {
    let shown = 0;
    for (const group of groups) {
      const section = grid.querySelector(`[data-category="${group.key}"]`);
      const box = section.querySelector(".swatches");
      let shownInGroup = 0;
      for (const chip of box.children) {
        const name = chip.dataset.block;
        const block = catalogue.blocks[name];
        const match = (!needle || name.includes(needle)) && (!planet || block.planet === planet);
        chip.hidden = !match;
        if (match) shownInGroup++;
      }
      section.hidden = shownInGroup === 0;
      shown += shownInGroup;
    }
    gridEmpty.hidden = shown > 0;
    gridEmpty.textContent = needle
      ? `Aucun bloc ne répond à « ${needle} ».` : "Aucun bloc ne répond à ça.";
    return shown;
  };

  /* A group of filters where only one choice holds at a time. The only one is the planet,
     and it acts on both tabs, the way the search box above it already does: one chip row
     that both grids read, rather than a second row on SOL that would let a player hold two
     different planets at once and have to notice which tab they had set. Both grids are
     repainted for the same reason the search box repaints both, and only the visible one's
     count is said out loud. */
  const wireFilter = (selector, attribute, set) => {
    host.querySelector(selector).addEventListener("click", (event) => {
      const chip = event.target.closest(`[data-${attribute}]`);
      if (!chip) return;
      set(chip.dataset[attribute]);
      for (const other of host.querySelectorAll(`${selector} [data-${attribute}]`)) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
      const built = paint();
      const found = paintGround();
      sayCount(onGroundTab ? found : built);
    });
  };
  wireFilter(".planets", "planet", (v) => { planet = v; remember("editeur.planete", v); });

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
    clearSearch.hidden = !search.value;
    /* Both tabs share one search box, so both are repainted: the one that is hidden costs
       nothing to keep correct, and it is what stays correct across a tab switch without a
       second hook to remember. The count said out loud is only ever the visible tab's. */
    const built = paint();
    const found = paintGround();
    sayCount(onGroundTab ? found : built);
  });

  clearSearch.addEventListener("click", () => {
    search.value = "";
    needle = "";
    clearSearch.hidden = true;
    sayCount(onGroundTab ? paintGround() : paint());
    search.focus();
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
    onGroundTab = onGround;
    for (const tab of host.querySelectorAll("[data-tab]")) {
      tab.setAttribute("aria-pressed", String(tab.dataset.tab === which));
    }
    groundPanel.hidden = !onGround;
    grid.hidden = onGround;
    /* The chip row stays up on both tabs. It used to be hidden here, which is what left
       somebody building on Erekir scrolling past grass, snow and ice to reach the floors
       that are actually under their feet. */
    filters.hidden = !homes && onGround;
    /* The search box is shared: only what it searches, and what it says while empty,
       changes with the tab. */
    /* Counted like the build tab's, and for the same reason: "Chercher un sol, un minerai
       ou un mur" is wider than the 260px rail and was cut mid-word, at "un miner". A
       placeholder the field cannot show is a placeholder that reads as broken. */
    search.placeholder = onGround
      ? `Chercher dans ${groundCount} sols` : `Chercher dans ${all.length} blocs`;
    search.setAttribute("aria-label", onGround ? "Chercher dans le sol" : "Chercher un bloc");
    sayCount(onGround ? paintGround() : paint());
    paintRecents();
    /* The status bar is shared too, and never hidden: BUILD writes it through `setHeld`,
       GROUND through `resetGroundInfo` below, each only while its own tab is open. Coming
       back to BUILD needs no call of its own here, `onTab`'s own caller already put the
       status bar back to "nothing in hand" the moment it left BUILD, by putting the held
       block down (see `mount.js`'s own `onTab`), and that is still what it says. */
    if (onGround) resetGroundInfo();
    /* The fade switches on its own: moving to the ground tab melts the blocks so that what
       is being painted can be seen, and coming back makes them solid again. That is what
       removes painting blind without asking for one more gesture, and it was the main defect
       of the previous editing mode, where the cursor lived on a different map from the
       brush. */
    onTab?.(which, onGround ? Number(fadeRange.value) / 100 : 1, brush);
  }

  host.querySelector(".editor-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    showTab(tab.dataset.tab);
    remember("editeur.onglet", tab.dataset.tab);
  });

  /* Somebody laying a field of sand opens on SOL every time and was sent to BÂTIR every
     time. Applied here rather than in the markup, so the two buttons still ship pressed and
     unpressed the way a page with no script would want them, and `showTab` does the whole
     switch it always did: the panel, the search, the fade, and the callback that melts the
     blocks. */
  if (startTab === "ground") showTab("ground");

  groundPanel.querySelector(".tools").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (!button) return;
    brush.tool = button.dataset.tool;
    remember("editeur.outil", brush.tool);
    for (const other of groundPanel.querySelectorAll("[data-tool]")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
    onBrush?.(brush);
  });

  /**
   * The status bar's ground half: the swatch's own name, and its rule if it has one.
   *
   * `nameOf` reads whatever `loadNames` has answered by the time this runs, which is a
   * hover or a pick, never mount: both happen well after the fetch this file kicked off
   * at the top of `mountRail`, so this is where the French name that does not exist for
   * `groundSwatch`'s own `title` (baked in before the fetch can possibly have answered)
   * actually reaches the player.
   */
  function groundStatusMarkup(name) {
    const src = iconOf(name, 22);
    const rule = groundRule(name, catalogue);
    return `
      <div class="name">${src ? `<img src="${src}" alt="">` : ""}
        <span>${escape(nameOf("block", name))}</span></div>
      ${rule ? `<div class="rule">${escape(rule)}</div>` : ""}`;
  }

  /** What the status bar falls back to once nothing is hovered: what is picked, if anything. */
  function resetGroundInfo() {
    held.innerHTML = brush.block
      ? groundStatusMarkup(brush.block)
      : `<p class="empty">Rien en main. Survole ou choisis un sol.</p>`;
  }

  /**
   * Select `name` from `layerKey`'s family into the brush, unconditionally: every swatch
   * showing it is marked pressed, the recents row remembers it, and the status bar updates
   * right away rather than waiting on a hover that may never come.
   *
   * `layerKey` is the family a swatch was drawn under ("floor", "floor-liquid", "overlay",
   * "wall"), kept as-is wherever it is remembered for redraw. `storageLayerOf` narrows it
   * to the three slots the board itself keeps, only where the brush paints.
   */
  function selectGround(name, layerKey) {
    brush.block = name;
    brush.layer = storageLayerOf(layerKey);
    for (const chip of host.querySelectorAll("[data-ground]")) {
      chip.setAttribute("aria-pressed", String(chip.dataset.ground === brush.block));
    }
    recents = pushRecent(recents, { name, layer: layerKey }, RECENTS_CAP);
    writeRecents(recents);
    paintRecents();
    resetGroundInfo();
    onBrush?.(brush);
  }

  /**
   * Pick (or put down) a ground swatch, wherever it was clicked from: a family section or
   * the recents row draw the same buttons, so one function decides for both.
   *
   * Clicking the swatch already in hand puts it down, the same courtesy the build grid
   * gives; a pipette landing on the floor already in hand is not that gesture; it goes
   * straight through `selectGround`, in `pipetteGround` below.
   */
  function pickGround(name, layerKey) {
    if (brush.block === name) {
      brush.block = null;
      for (const chip of host.querySelectorAll("[data-ground]")) {
        chip.setAttribute("aria-pressed", "false");
      }
      resetGroundInfo();
      onBrush?.(brush);
      return;
    }
    selectGround(name, layerKey);
  }

  for (const zone of [groundPanel, recentsBox]) {
    zone.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-ground]");
      if (!chip) return;
      pickGround(chip.dataset.ground, chip.dataset.of);
    });
  }

  /* The name and the rule under the cursor: hover and focus both update the status bar,
     so a keyboard user reaches the same information a mouse gets from lingering. Delegated
     on `host` rather than on each swatch, since the grid is redrawn by search and the
     recents row is redrawn on every pick; a listener on a node that gets replaced is a
     listener that silently stops firing. */
  host.addEventListener("mouseover", (event) => {
    if (!onGroundTab) return;
    const chip = event.target.closest("[data-ground]");
    if (chip) held.innerHTML = groundStatusMarkup(chip.dataset.ground);
  });
  host.addEventListener("mouseout", (event) => {
    if (!onGroundTab) return;
    const chip = event.target.closest("[data-ground]");
    if (!chip) return;
    const to = event.relatedTarget?.closest?.("[data-ground]");
    if (chip !== to) resetGroundInfo();
  });
  host.addEventListener("focusin", (event) => {
    if (!onGroundTab) return;
    const chip = event.target.closest("[data-ground]");
    if (chip) held.innerHTML = groundStatusMarkup(chip.dataset.ground);
  });
  host.addEventListener("focusout", (event) => {
    if (!onGroundTab) return;
    if (event.target.closest("[data-ground]")) resetGroundInfo();
  });

  sizeRange.addEventListener("input", () => {
    brush.size = Number(sizeRange.value);
    sizeLabel.textContent = `${brush.size} × ${brush.size}`;
    remember("editeur.taille", brush.size);
    onBrush?.(brush);
  });

  fadeRange.addEventListener("input", () => {
    fadeLabel.textContent = `${fadeRange.value} %`;
    remember("editeur.transparence", fadeRange.value);
    onTab?.("ground", Number(fadeRange.value) / 100, brush);
  });

  groundPanel.querySelector(".wipe").addEventListener("click", () => onBrush?.(brush, "wipe"));

  /**
   * The ground pipette: `tileLayers` is a board tile's raw `{ floor, overlay, wall }`,
   * `mount.js`'s own shape for it. `pipetteLayerOf` decides which of the three the pipette
   * takes; this only has to turn that storage layer back into the family a floor's own
   * swatch is filed under, since a liquid floor and a solid one share the `floor` slot on
   * the board (see `storageLayerOf`) but not a family in this rail.
   *
   * Returns whether anything was picked, so a caller on an undescribed tile can say so
   * rather than silently doing nothing.
   */
  rail.pipetteGround = (tileLayers) => {
    const picked = pipetteLayerOf(tileLayers);
    if (!picked) return false;
    const family = picked.layer === "floor" && catalogue.blocks[picked.block]?.floor_liquid
      ? "floor-liquid" : picked.layer;
    selectGround(picked.block, family);
    return true;
  };

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
  ["Q reprend le sol survolé", "le jeu s'en sert pour vider une file de construction "
    + "absente ici ; sur l'onglet sol, la touche recharge plutôt le pinceau avec la case "
    + "survolée (mur, sinon minerai, sinon sol), ce que fait le pick de l'éditeur du jeu, "
    + "lui sur la touche I"],
  ["Les cadres", "le jeu n'a pas de plateau plus grand qu'un schéma ; ici le plateau "
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
