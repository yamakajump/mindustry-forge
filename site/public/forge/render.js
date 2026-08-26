/**
 * Draw a schematic the way the game draws it.
 *
 * A list of block names and a throughput figure does not tell anyone what a schematic is.
 * A picture does, in a second, and that is why every schematic site shows one. Drawing it
 * in anything other than the game's own art would make a player translate between two
 * visual languages to read their own base, so the sprites come straight out of the jar.
 *
 * The diagonal hatching behind the build is the game's own schematic preview background.
 * It is not decoration: it marks the tiles the schematic occupies, so an L-shaped build
 * reads as an L rather than as a rectangle with holes.
 */

const TILE = 32;

let atlas = null;
let sheet = null;

export async function loadSprites(base = "./forge/") {
  if (atlas && sheet) return { atlas, sheet };
  const [index, image] = await Promise.all([
    fetch(base + "atlas.json").then((r) => {
      if (!r.ok) throw new Error("atlas introuvable");
      return r.json();
    }),
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("sprites introuvables"));
      img.src = base + "atlas.png";
    }),
  ]);
  atlas = index;
  sheet = image;
  return { atlas, sheet };
}

/** The box a schematic occupies, from its tiles rather than from its declared size. */
export function bounds(tiles, sizeOf) {
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const tile of tiles) {
    const size = sizeOf(tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    left = Math.min(left, tile.x + offset);
    bottom = Math.min(bottom, tile.y + offset);
    right = Math.max(right, tile.x + offset + size - 1);
    top = Math.max(top, tile.y + offset + size - 1);
  }
  if (!Number.isFinite(left)) return { left: 0, bottom: 0, width: 1, height: 1 };
  return { left, bottom, width: right - left + 1, height: top - bottom + 1 };
}

/**
 * Which blocks turn with their rotation.
 *
 * Turning a router or a press would be wrong and obvious; not turning a conveyor is wrong
 * and invisible, and a belt drawn pointing the wrong way is a picture that lies about the
 * one thing a player is reading it for.
 */
const TURNS = new Set(["conveyor", "junction", "duct", "sorter", "unloader",
                       "overflow-gate", "underflow-gate", "bridge-conveyor",
                       "bridge-conduit", "conduit", "drill", "turret", "crafter"]);

function turns(name, role) {
  if (TURNS.has(role)) return true;
  return /conveyor|conduit|duct|sorter|gate|bridge|unloader/.test(name);
}

/**
 * Paint the hatched backing the game shows behind a schematic.
 *
 * Drawn once into an offscreen pattern rather than stroked per tile: a two hundred block
 * schematic is two hundred clipped strokes otherwise, on every zoom and every resize.
 */
function hatching(context, scale) {
  const step = Math.max(6, Math.round(scale * 0.5));
  const patch = document.createElement("canvas");
  patch.width = patch.height = step * 2;
  const pen = patch.getContext("2d");
  pen.fillStyle = "#6b7280";
  pen.fillRect(0, 0, patch.width, patch.height);
  pen.strokeStyle = "#7c8494";
  pen.lineWidth = step * 0.7;
  pen.beginPath();
  pen.moveTo(-patch.width, patch.height);
  pen.lineTo(patch.width, -patch.height);
  pen.moveTo(0, patch.height * 2);
  pen.lineTo(patch.width * 2, 0);
  pen.stroke();
  return context.createPattern(patch, "repeat");
}

/**
 * Draw the schematic onto a canvas, sized to fit the space it is given.
 *
 * Returns the scale used, so a caller can map a click back to a tile.
 */
export function draw(canvas, tiles, sizeOf, roleOf, options = {}) {
  const context = canvas.getContext("2d");
  const box = bounds(tiles, sizeOf);
  const room = options.width || canvas.clientWidth || 480;

  // Whole pixels per tile. A fractional scale makes 32 pixel art shimmer along its own
  // grid lines, which reads as a rendering fault rather than as pixel art.
  const fit = Math.floor(room / Math.max(box.width, box.height));
  const scale = Math.max(8, Math.min(options.maxScale || 48, fit));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(box.width * scale * dpr);
  canvas.height = Math.round(box.height * scale * dpr);
  canvas.style.width = `${box.width * scale}px`;
  canvas.style.height = `${box.height * scale}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  // Pixel art, so no smoothing. Left on, every block turns into a blur at any scale that
  // is not exactly one to one.
  context.imageSmoothingEnabled = false;

  const backing = hatching(context, scale);
  for (const tile of tiles) {
    const size = sizeOf(tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    context.fillStyle = backing;
    context.fillRect((tile.x + offset - box.left) * scale,
                     (box.height - (tile.y + offset - box.bottom) - size) * scale,
                     size * scale, size * scale);
  }

  const missing = [];
  for (const tile of tiles) {
    const size = sizeOf(tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    const found = atlas?.sprites?.[tile.block];
    // Screen coordinates count down from the top; the game counts up from the bottom.
    const px = (tile.x + offset - box.left) * scale;
    const py = (box.height - (tile.y + offset - box.bottom) - size) * scale;

    if (!found) {
      missing.push(tile.block);
      context.fillStyle = "rgba(255, 128, 128, .35)";
      context.fillRect(px, py, size * scale, size * scale);
      continue;
    }

    const spins = turns(tile.block, roleOf(tile.block));
    if (spins && tile.rotation) {
      context.save();
      context.translate(px + (size * scale) / 2, py + (size * scale) / 2);
      // Mindustry counts rotations anticlockwise from east; a canvas turns clockwise.
      context.rotate(-(tile.rotation % 4) * Math.PI / 2);
      context.drawImage(sheet, found.x, found.y, found.w, found.h,
                        -(size * scale) / 2, -(size * scale) / 2, size * scale, size * scale);
      context.restore();
    } else {
      context.drawImage(sheet, found.x, found.y, found.w, found.h,
                        px, py, size * scale, size * scale);
    }
  }

  return { scale, box, missing: [...new Set(missing)] };
}

/** One item icon, for saying what a layout makes in the game's own pictures. */
export function itemIcon(item, pixels = 20) {
  const found = atlas?.sprites?.[`item/${item}`];
  if (!found || !sheet) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(sheet, found.x, found.y, found.w, found.h, 0, 0, pixels, pixels);
  return canvas.toDataURL();
}
