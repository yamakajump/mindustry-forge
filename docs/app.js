// The catalogue, drawn.
//
// Two rules run through this file, and both were paid for.
//
// It never ranks anything. The catalogue arrives in the order the bench put it in, and an
// earlier version re-sorted it here with a simplified copy of the objectives that quietly
// disagreed: `compact` refuses anything under a delivery rate, the copy had no gate, and a
// design the bench had eliminated sat in first place on the day the site went up.
//
// It never stores a second copy of a layout. The picture is decoded from the very string
// the copy button hands you. A second copy is a thing that can disagree with the first,
// and this project has already shipped three bugs of exactly that shape. A wrong picture
// here means a wrong schematic, not merely a wrong picture.

const OBJECTIVES = {
  throughput: "most delivered",
  density: "most delivered per block",
  compact: "smallest that works",
  budget: "most delivered inside a block budget",
};

const board = document.getElementById("board");

fetch("catalogue.json", { cache: "no-cache" })
  .then(response => response.ok ? response.json() : Promise.reject(response.status))
  .then(render)
  .catch(problem => {
    board.innerHTML = `<p class="empty">The catalogue could not be loaded (${problem}).</p>`;
  });

function render(payload) {
  const entries = payload.entries || [];
  if (!entries.length) {
    board.innerHTML = `<p class="empty">Nothing in the catalogue yet.</p>`;
    return;
  }

  const conditions = entries[0].conditions;
  const specs = [...new Set(entries.map(entry => entry.spec))].sort();

  board.innerHTML = specs.map(spec => {
    const mine = entries.filter(entry => entry.spec === spec);
    const objectives = [...new Set(mine.map(entry => entry.objective))].sort();
    return `<h2>${escape(spec)}</h2>` + objectives
      .map(objective => table(mine.filter(entry => entry.objective === objective), objective))
      .join("");
  }).join("") + conditionsBar(conditions);

  document.getElementById("stamp").textContent =
    `${entries.length} entries, measured on Mindustry ${conditions.engine}.`;

  board.querySelectorAll("button[data-schematic]").forEach(button => {
    button.addEventListener("click", () => copy(button));
  });
  board.querySelectorAll("button.view").forEach(button => {
    button.addEventListener("click", () => reveal(button));
  });
}

// Rows are drawn in the order they arrive. See the note at the top of this file.
function table(rows, objective) {
  return `
    <section class="board">
      <h3>${escape(objective)} &middot; ${OBJECTIVES[objective] || ""}</h3>
      <table>
        <thead><tr>
          <th class="rank">#</th><th>by</th><th>delivered</th><th>blocks</th>
          <th>per block</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((entry, index) => `
            <tr class="${index === 0 ? "top" : ""}">
              <td class="rank">${index + 1}</td>
              <td class="who ${entry.author === "mindustry-forge" ? "forge" : ""}"
                  title="${escape(entry.notes || "")}">${escape(entry.author)}</td>
              <td>${entry.delivered}</td>
              <td>${entry.blocks}</td>
              <td>${(entry.delivered / Math.max(1, entry.blocks)).toFixed(2)}</td>
              <td class="doing">
                <button class="view">view</button>
                <button data-schematic="${escape(entry.schematic)}">copy</button>
              </td>
            </tr>
            <tr class="shot" hidden><td colspan="6"></td></tr>`).join("")}
        </tbody>
      </table>
    </section>`;
}

function conditionsBar(conditions) {
  return `<div class="conditions">
    <span>map <b>${escape(conditions.map)}</b></span>
    <span>seed <b>${conditions.world_seed}</b></span>
    <span>time <b>${(conditions.ticks / 60).toFixed(0)}s</b></span>
    <span>engine <b>${escape(conditions.engine)}</b></span>
    <span>ore cleared within <b>${conditions.keep_out}</b> of the core</span>
  </div>`;
}

// Reading a schematic ---------------------------------------------------------------

// Sizes read off the engine (`Block.size`) rather than eyeballed. A drill drawn one tile
// wide is a picture of a factory that would not fit.
const SIZES = {
  "distributor": 2, "mechanical-drill": 2, "pneumatic-drill": 2, "laser-drill": 3,
  "graphite-press": 2, "silicon-smelter": 2, "kiln": 2, "thermal-generator": 2,
};

const CARRIERS = new Set([
  "conveyor", "titanium-conveyor", "plastanium-conveyor", "armored-conveyor", "duct",
  "junction", "router", "distributor", "bridge-conveyor", "phase-conveyor",
  "overflow-gate", "underflow-gate", "sorter", "inverted-sorter", "unloader", "duct-router",
]);

// Blocks whose rotation the game actually reads. A router faces every way at once, so
// turning its sprite would invent a direction the design does not have.
const ROTATES = new Set([
  "conveyor", "titanium-conveyor", "plastanium-conveyor", "armored-conveyor", "duct",
  "duct-router", "sorter", "inverted-sorter", "overflow-gate", "underflow-gate",
  "unloader", "bridge-conveyor", "phase-conveyor",
]);

function colourOf(block) {
  if (/drill/.test(block)) return "#c98a3e";
  if (/generator|node|battery/.test(block)) return "#c9b23e";
  if (/press|smelter|kiln|melter|mixer/.test(block)) return "#6f9f5e";
  if (block === "router" || block === "distributor") return "#5b7fa8";
  if (block === "junction") return "#7a6da8";
  if (CARRIERS.has(block)) return "#6d6a64";
  return "#8b8781";
}

// Mindustry anchors a block at `sizeOffset = -(size - 1) / 2`, truncated toward zero, so
// an even-sized block sits with its corner on the stored tile and an odd-sized one
// straddles it. Backwards, this draws every drill one tile off its ore.
function footprint(tile) {
  const size = SIZES[tile.block] || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  return { x: tile.x + offset, y: tile.y + offset, size };
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decode(base64) {
  const raw = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  if (String.fromCharCode(...raw.slice(0, 4)) !== "msch") {
    throw new Error("not a schematic");
  }

  const bytes = await inflate(raw.slice(5));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;

  const byte = () => bytes[at++];
  const short = () => { const value = view.getInt16(at); at += 2; return value; };
  const int = () => { const value = view.getInt32(at); at += 4; return value; };
  const text = () => {
    const length = view.getUint16(at);
    at += 2;
    const value = new TextDecoder().decode(bytes.subarray(at, at + length));
    at += length;
    return value;
  };

  const width = short();
  const height = short();

  const tags = {};
  for (let left = byte(); left > 0; left--) {
    const key = text();
    tags[key] = text();
  }

  const palette = [];
  for (let left = byte(); left > 0; left--) palette.push(text());

  const tiles = [];
  for (let left = int(); left > 0; left--) {
    const block = palette[byte()];
    const packed = int();
    // Only a null config is understood. Anything else is followed by a variable-length
    // value this reader cannot skip, so it says so instead of drawing rubbish.
    if (byte() !== 0) throw new Error(`${block} carries a configuration`);
    tiles.push({ block, x: (packed >> 16) & 0xffff, y: packed & 0xffff, rotation: byte() });
  }

  return { width, height, tags, tiles };
}

// Drawing it -------------------------------------------------------------------------

// One world tile is 32 pixels of Mindustry art, and the picture is drawn at exactly that,
// so nothing is resampled and the pixels land where the artist put them. The page scales
// the whole thing down if it has to, which is one smooth reduction rather than a blurry
// one per sprite.
const TILE = 32;

// Which files make up each block, written by tools/sprites.py out of the game's own asset
// jar. Fetched rather than hard-coded, so adding a schematic with a new block in it is a
// matter of rerunning that tool and not of editing this file.
let ART = null;

async function art() {
  if (ART === null) {
    ART = fetch("sprites/index.json")
      .then(response => response.ok ? response.json() : { blocks: {} })
      .then(payload => payload.blocks || {})
      .catch(() => ({}));
  }
  return ART;
}

function draw(design, sprites) {
  const pad = 4;
  const width = design.width * TILE + pad * 2;
  const height = design.height * TILE + pad * 2;

  // Game coordinates count upwards and SVG counts downwards, so y is flipped once here and
  // nowhere else. Flipping it twice prints a working design upside down.
  const top = (y, size) => pad + (design.height - y - size) * TILE;

  const grid = [];
  for (let x = 0; x <= design.width; x++) {
    const at = pad + x * TILE;
    grid.push(`<line x1="${at}" y1="${pad}" x2="${at}" y2="${height - pad}"/>`);
  }
  for (let y = 0; y <= design.height; y++) {
    const at = pad + y * TILE;
    grid.push(`<line x1="${pad}" y1="${at}" x2="${width - pad}" y2="${at}"/>`);
  }

  const blocks = design.tiles.map(tile => {
    const place = footprint(tile);
    const left = pad + place.x * TILE;
    const up = top(place.y, place.size);
    const span = place.size * TILE;
    const layers = sprites[tile.block];

    // Rotation 0 is right, and every sprite is drawn facing right, so a quarter turn
    // anticlockwise per step. Anticlockwise on screen is negative in SVG, where y grows
    // downwards.
    const turn = ROTATES.has(tile.block) && tile.rotation
      ? ` transform="rotate(${-90 * (tile.rotation % 4)} ${left + span / 2} ${up + span / 2})"`
      : "";

    if (!layers || !layers.length) return plain(tile, left, up, span, turn);

    const stack = layers.map(file =>
      `<image href="sprites/${file}" x="${left}" y="${up}" width="${span}"
              height="${span}"/>`).join("");
    return `<g${turn}><title>${escape(tile.block)}</title>${stack}</g>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
               role="img" aria-label="schematic layout">
    <g stroke="#1c1b19" stroke-width="1">${grid.join("")}</g>
    ${blocks.join("")}
  </svg>`;
}

// What a block looks like when the game's art for it was never fetched. Readable rather
// than pretty, and it says which block it is on hover.
function plain(tile, left, up, span, turn) {
  const body = `<rect x="${left + 1}" y="${up + 1}" width="${span - 2}" ` +
               `height="${span - 2}" rx="3" fill="${colourOf(tile.block)}" ` +
               `fill-opacity="0.88"/>`;
  const arrow = ROTATES.has(tile.block)
    ? `<polygon points="${left + span * 0.72},${up + span / 2} ` +
      `${left + span * 0.38},${up + span * 0.3} ${left + span * 0.38},${up + span * 0.7}" ` +
      `fill="#0b0a09" fill-opacity="0.8"/>`
    : "";
  return `<g${turn}><title>${escape(tile.block)}</title>${body}${arrow}</g>`;
}

async function reveal(button) {
  const row = button.closest("tr");
  const shot = row.nextElementSibling;
  const holder = shot.firstElementChild;

  if (!shot.hidden) {
    shot.hidden = true;
    button.textContent = "view";
    return;
  }

  shot.hidden = false;
  button.textContent = "hide";
  if (holder.dataset.drawn) return;

  const source = row.querySelector("button[data-schematic]").dataset.schematic;
  try {
    const [design, sprites] = await Promise.all([decode(source), art()]);
    const missing = [...new Set(design.tiles.map(tile => tile.block))]
      .filter(block => !sprites[block]);
    holder.innerHTML = `<div class="shot-inner">${draw(design, sprites)}
      <div class="legend">
        <span class="size"><b>${design.width} &times; ${design.height}</b>,
              ${design.tiles.length} blocks</span>
        ${missing.length
          ? `<span>no art for ${missing.map(escape).join(", ")}</span>`
          : ""}
      </div></div>`;
  } catch (problem) {
    holder.innerHTML = `<p class="note">This one could not be drawn (${escape(problem.message)}).
      The copy button still hands you the original.</p>`;
  }
  holder.dataset.drawn = "yes";
}

// Copying it ---------------------------------------------------------------------------

async function copy(button) {
  try {
    await navigator.clipboard.writeText(button.dataset.schematic);
  } catch {
    const box = document.createElement("textarea");
    box.value = button.dataset.schematic;
    document.body.appendChild(box);
    box.select();
    document.execCommand("copy");
    box.remove();
  }
  button.textContent = "copied";
  button.classList.add("done");
  setTimeout(() => {
    button.textContent = "copy";
    button.classList.remove("done");
  }, 1600);
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}
