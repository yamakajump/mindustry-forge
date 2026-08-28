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

import {
  beltFrame, CARRIER_ROLES, drawCargo, drawFlyers, drawLayers, drawRunning, drawWreck,
} from "./live.js";
import { variantOf, blendersAt, D8 } from "./tiling.js";

/** Mindustry counts rotations anticlockwise from east. */
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

let atlas = null;
let sheet = null;
/** The blend group data from `sols.json`: which floor bleeds onto which, and with what sheet. */
let soils = null;
/** How many sprites each floor has, filled on first sight and kept for the page's life. */
const variantCounts = new Map();

export async function loadSprites(base = "./forge/") {
  if (atlas && sheet) return { atlas, sheet };
  const [index, image, blends] = await Promise.all([
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
    // A missing sols.json must not break the page: the report and the editor drew ground
    // fine before boundary blending existed, so a failed fetch here costs the soft edges
    // between floors, not the ground itself.
    fetch(base + "sols.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  atlas = index;
  sheet = image;
  soils = blends;
  return { atlas, sheet };
}

/** The box a schematic occupies, from its tiles rather than from its declared size. */
export function bounds(tiles, sizeOf) {
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const tile of tiles) {
    const size = sizeOf(tile.name || tile.block);
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
const TURNS = new Set(["conveyor", "junction", "conduit"]);

function turns(name, role) {
  return TURNS.has(role);
}

/**
 * The hatched backing the game shows behind a schematic, taken from the game.
 *
 * It was drawn by hand at first, with strokes chosen to look like the real thing. Looking
 * like it is not the same as being it, and the difference is exactly what makes a tool
 * feel bolted onto a game rather than part of it. `schematic-background.png` ships in the
 * jar; there was never anything to imitate.
 */
function backing(context, scale) {
  const found = atlas?.sprites?.["ui/schematic-background"];
  if (!found) return "#6b7280";

  const patch = document.createElement("canvas");
  patch.width = patch.height = Math.max(8, Math.round(scale));
  const pen = patch.getContext("2d");
  pen.imageSmoothingEnabled = false;
  pen.drawImage(sheet, found.x, found.y, found.w, found.h,
                0, 0, patch.width, patch.height);
  return context.createPattern(patch, "repeat");
}

/**
 * The span a bridge throws, and the arrow along it.
 *
 * Without it, a line that hops a wall reads as two lines that both end in the air, which
 * is what Corentin saw and said was wrong. The bridge remembers where it reaches, so this
 * is drawing what the schematic already says rather than inferring anything.
 */
/**
 * Mindustry's own units: eight world pixels to a tile. The bridge's measurements are
 * stated in them, so they are converted here rather than eyeballed as fractions.
 */
const WORLD = 8;

/**
 * A bridge, drawn the way `ItemBridge.draw` draws it.
 *
 * Three things were missing and all three showed. The rounded end caps, which the game
 * puts at *both* ends and which are what make a bridge look like a bridge rather than a
 * bar. The transparency, `Renderer.bridgeOpacity`, without which the span hides whatever
 * it flies over. And the width: the span is six and a half world pixels of eight, so
 * drawing it a full tile wide made it a slab.
 *
 * The span also runs edge to edge, not centre to centre: half a tile is taken off each
 * end, which is exactly the room the end caps occupy.
 */
function drawBridge(context, node, box, scale) {
  // The link the analysis already checked against the game's rules, rather than the raw
  // offset. Believed as stored, five bridges in one real schematic claimed to reach 365
  // tiles away and were drawn as bars across the whole picture.
  if (!node.link) return;

  /* `name` du côté de l'analyse, `block` du côté de l'éditeur : le reste de `draw` accepte
     déjà les deux et celui-ci ne le faisait pas. La travée cherchait alors le sprite
     `undefined-bridge`, ne le trouvait pas, et sortait sans rien dire : les ponts posés
     dans l'éditeur s'affichaient sans aucune travée, donc sans qu'on puisse voir qui était
     relié à qui. */
  const name = node.name || node.block;
  const span = atlas?.sprites?.[`${name}-bridge`];
  const arrow = atlas?.sprites?.[`${name}-arrow`];
  const cap = atlas?.sprites?.[`${name}-end`];
  if (!span) return;

  const at = (x, y) => [(x - box.left) * scale + scale / 2,
                        (box.height - (y - box.bottom) - 1) * scale + scale / 2];
  const [fromX, fromY] = at(node.x, node.y);
  const [toX, toY] = at(node.link[0], node.link[1]);
  const length = Math.hypot(toX - fromX, toY - fromY);
  if (length < 1) return;

  const angle = Math.atan2(toY - fromY, toX - fromX);
  const width = scale * 6.5 / WORLD;

  context.save();
  // The game's own default. Opaque, a span hides the belts and drills it flies over, and
  // a picture that hides half a schematic is not showing the schematic.
  context.globalAlpha = 0.75;

  context.translate(fromX, fromY);
  context.rotate(angle);

  // Edge to edge rather than centre to centre: half a tile off each end, which is the
  // room the caps take.
  const half = scale / 2;
  context.drawImage(sheet, span.x, span.y, span.w, span.h,
                    half, -width / 2, Math.max(0, length - scale), width);

  if (arrow) {
    // Repeated along the way, every four world pixels, rather than one in the middle.
    const step = scale * 4 / WORLD;
    const offset = scale * 2 / WORLD;
    for (let along = half + offset; along < length - half; along += step) {
      context.drawImage(sheet, arrow.x, arrow.y, arrow.w, arrow.h,
                        along - scale / 2, -scale / 2, scale, scale);
    }
  }
  context.restore();

  if (cap) {
    // Both ends, each turned to face along the span. The game turns one by ninety degrees
    // and the other by two hundred and seventy, which is what rounds off both sides.
    for (const [x, y, turn] of [[fromX, fromY, Math.PI / 2], [toX, toY, -Math.PI / 2]]) {
      context.save();
      context.globalAlpha = 0.75;
      context.translate(x, y);
      context.rotate(angle + turn);
      context.drawImage(sheet, cap.x, cap.y, cap.w, cap.h,
                        -scale / 2, -scale / 2, scale, scale);
      context.restore();
    }
  }
}

/**
 * A ring on a tile, for a socket.
 *
 * Drawn rather than listed. A player reading "the pipe at 0,7 wants water" beside a
 * picture has to count tiles to find it; a mark on the tile itself is the same fact
 * without the counting.
 */
function marker(context, port, box, scale, colour) {
  const x = (port.x - box.left) * scale;
  const y = (box.height - (port.y - box.bottom) - 1) * scale;
  const width = Math.max(2, scale * 0.11);

  context.save();
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.strokeRect(x + width / 2, y + width / 2, scale - width, scale - width);

  // What travels through it, drawn on it. A ring says "here"; a ring with a drop of water
  // in it says "water, here", which is the whole of what the mark is for. Drawn at a bit
  // over half a tile and floated above the block, so the block underneath stays readable.
  const icon = port.resource && atlas?.sprites?.[`item/${port.resource}`];
  if (icon && sheet) {
    const size = scale * 0.62;
    const left = x + (scale - size) / 2;
    const top = y + (scale - size) / 2;
    context.fillStyle = "rgba(10, 12, 16, .72)";
    context.beginPath();
    context.arc(x + scale / 2, y + scale / 2, size * 0.62, 0, Math.PI * 2);
    context.fill();
    context.drawImage(sheet, icon.x, icon.y, icon.w, icon.h, left, top, size, size);
  }
  context.restore();
}

/**
 * Which of a carrier's five shapes to draw, following the game's own autotiler.
 *
 * Ported from `Autotiler.buildBlending` and `transformCase` in v159.7 rather than guessed.
 * A belt is drawn straight, as a curve, or as a merge depending on which of its three
 * back-and-side neighbours hand into it, and drawing only the straight one made every line
 * in a picture look straight, including the ones that turn.
 *
 * Returns the shape and the vertical flip, because the game distinguishes a curve from its
 * mirror by scaling y to minus one rather than by holding a sixth sprite.
 */
function carrierShape(node, feeds) {
  // Relative directions, as the game counts them: 1 and 3 are the sides, 2 is behind.
  const side1 = feeds(node, 1);
  const back = feeds(node, 2);
  const side3 = feeds(node, 3);

  const which =
    (back && side1 && side3) ? 0 :
    (side1 && side3) ? 1 :
    (side1 && back) ? 2 :
    (side3 && back) ? 3 :
    side1 ? 4 :
    side3 ? 5 : -1;

  switch (which) {
    case 0: return { shape: 3, flip: 1 };
    case 1: return { shape: 4, flip: 1 };
    case 2: return { shape: 2, flip: 1 };
    case 3: return { shape: 2, flip: -1 };
    case 4: return { shape: 1, flip: -1 };
    case 5: return { shape: 1, flip: 1 };
    default: return { shape: 0, flip: 1 };
  }
}

/**
 * Whether the neighbour in a relative direction hands into this carrier.
 *
 * The game's rule, kept: a neighbour blends if it puts items out at all, and if one of the
 * two is facing the other. A block that does not rotate is always taken to be facing.
 */
function blender(tiles, sizeOf, roleOf) {
  const at = new Map();
  for (const tile of tiles) {
    const name = tile.name || tile.block;
    const size = sizeOf(name);
    const offset = Math.trunc(-(size - 1) / 2);
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        at.set(`${tile.x + offset + dx},${tile.y + offset + dy}`, tile);
      }
    }
  }

  const carries = (role) => role === "conveyor" || role === "junction" ||
    role === "router" || role === "bridge" || role === "sorter" || role === "conduit";
  const turnsToo = (role) => role === "conveyor" || role === "conduit" ||
    role === "drill" || role === "crafter" || role === "generator" || role === "sorter";

  return (node, direction) => {
    const real = ((node.rotation - direction) % 4 + 4) % 4;
    const [dx, dy] = DIRECTIONS[real];
    const other = at.get(`${node.x + dx},${node.y + dy}`);
    if (!other) return false;

    const name = other.name || other.block;
    const role = roleOf(name);
    if (role === "power" || role === "unknown") return false;

    // Whether this carrier points at the neighbour.
    const [fx, fy] = DIRECTIONS[node.rotation % 4];
    const facingThem = node.x + fx === other.x && node.y + fy === other.y;
    if (facingThem) return true;

    // Or the neighbour points at this one. A block that does not rotate counts as facing.
    const rotates = role === "conveyor" || role === "conduit" || role === "bridge";
    if (!rotates) return carries(role) || turnsToo(role);
    const [ox, oy] = DIRECTIONS[(other.rotation || 0) % 4];
    return other.x + ox === node.x && other.y + oy === node.y;
  };
}

/**
 * Which region of the world the drawing covers, in tiles.
 *
 * Two callers, two ways of deciding. The report has no camera: it frames the build itself,
 * plus an apron when a block is waiting to be put down. The editor has one: it frames
 * whatever the player is looking at, and the build may be half off screen or lost in the
 * middle of an empty plain.
 *
 * Everything downstream is written against this box, so making the editor work is a matter
 * of handing `draw` a different box rather than a second `draw`. That mattered: this
 * repository has already paid for a second implementation of one question, deleted
 * `simulate.js` over it, and said so in `docs/known-gaps.md`.
 *
 * The camera box is deliberately fractional. Rounding it to whole tiles would leave the
 * canvas a few pixels short of its own frame, which reads as a thin dead border that moves
 * when you pan.
 */
export function viewportBox({ tight, apron = 0, camera = null, viewport = null }) {
  if (camera && viewport) {
    const width = viewport.width / camera.scale;
    const height = viewport.height / camera.scale;
    return {
      left: camera.x - width / 2,
      bottom: camera.y - height / 2,
      width,
      height,
    };
  }
  if (!apron) return tight;
  return {
    left: tight.left - apron, bottom: tight.bottom - apron,
    width: tight.width + apron * 2, height: tight.height + apron * 2,
  };
}

/**
 * Draw the schematic onto a canvas, sized to fit the space it is given.
 *
 * Returns the scale used, so a caller can map a click back to a tile.
 *
 * Pass `camera` and `viewport` to draw a view of the world instead of a portrait of the
 * schematic: the canvas then takes the size of the viewport, the scale comes from the
 * camera, and the build is drawn wherever it happens to be.
 */
export function draw(canvas, tiles, sizeOf, roleOf, options = {}) {
  const context = canvas.getContext("2d");
  const tight = bounds(tiles, sizeOf);

  /* An apron of empty tiles around the build, for putting blocks down beyond its edge.

     Without it a packed schematic cannot be extended at all: the first one tried had not a
     single free tile inside its own box, so every click landed on something and the
     palette had nowhere to put anything. Only asked for while a block is waiting to be
     placed, because the rest of the time it is empty space around a picture. */
  const apron = Math.max(0, options.margin || 0);
  const camera = options.camera || null;
  const viewport = options.viewport || null;
  const box = viewportBox({ tight, apron, camera, viewport });
  const room = options.width || canvas.clientWidth || 480;

  // Whole pixels per tile. A fractional scale makes 32 pixel art shimmer along its own
  // grid lines, which reads as a rendering fault rather than as pixel art.
  const fit = Math.floor(room / Math.max(box.width, box.height));
  const scale = camera
    ? camera.scale
    : Math.max(8, Math.min(options.maxScale || 48, fit));
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

  /* The grid, under everything else and only for the editor.

     The report draws a portrait of a build and needs no grid: the build is the picture. An
     editor draws a plain, and a plain without a grid gives a player nothing to aim at. The
     first version had none and placing a block was guesswork until the ghost appeared.

     Every eighth line is brighter, which is the spacing the game uses for its own chunk
     lines, so counting eight tiles is a glance rather than an arithmetic. */
  if (options.grid && scale >= 6) {
    context.save();
    context.lineWidth = 1;
    const from = Math.ceil(box.left);
    const upto = box.left + box.width;
    for (let x = from; x <= upto; x++) {
      context.strokeStyle = x % 8 === 0 ? "rgba(255,255,255,.085)" : "rgba(255,255,255,.035)";
      const px = Math.round((x - box.left) * scale) + 0.5;
      context.beginPath();
      context.moveTo(px, 0);
      context.lineTo(px, box.height * scale);
      context.stroke();
    }
    const low = Math.ceil(box.bottom);
    const high = box.bottom + box.height;
    for (let y = low; y <= high; y++) {
      context.strokeStyle = y % 8 === 0 ? "rgba(255,255,255,.085)" : "rgba(255,255,255,.035)";
      const py = Math.round((box.height - (y - box.bottom)) * scale) + 0.5;
      context.beginPath();
      context.moveTo(0, py);
      context.lineTo(box.width * scale, py);
      context.stroke();
    }
    context.restore();
  }

  /* The ground, under everything.

     Painted tiles win over the game's hatched schematic background, because a schematic
     standing on a patch of copper ore is standing on copper ore and the hatching is only
     there to say "this tile belongs to the build". An ore is an overlay: it goes over the
     floor rather than instead of it, exactly as the game stacks them. */
  const ground = options.ground || null;
  const painted = new Set();
  if (ground && sheet) {
    for (const [at, layers] of Object.entries(ground)) {
      const [x, y] = at.split(",").map(Number);
      if (x < box.left || x >= box.left + box.width) continue;
      if (y < box.bottom || y >= box.bottom + box.height) continue;
      painted.add(at);

      const px = (x - box.left) * scale;
      const py = (box.height - (y - box.bottom) - 1) * scale;
      for (const name of [layers.floor, layers.overlay]) {
        if (!name) continue;
        /* How many sprites this floor has, counted once per floor rather than per tile: a
           64 by 64 board asks this 4096 times a frame. */
        let count = variantCounts.get(name);
        if (count === undefined) {
          count = 0;
          while (atlas?.sprites?.[`floor/${name}#${count + 1}`]) count++;
          variantCounts.set(name, count);
        }
        const art = count > 1
          ? atlas.sprites[`floor/${name}#${variantOf(x, y, count) + 1}`]
          : atlas?.sprites?.[`floor/${name}`];
        if (art) {
          context.drawImage(sheet, art.x, art.y, art.w, art.h, px, py, scale, scale);
        }
      }

      /* The boundary, drawn over this tile rather than over its neighbour: the game bleeds
         inwards, so a patch of grass beside stone has grass creeping onto the stone tile. */
      if (soils) {
        for (const blender of blendersAt(ground, x, y, soils.floors)) {
          const edgeArt = atlas?.sprites?.[`floor/${blender.sheet}#edge`];
          if (!edgeArt) continue;
          // Nine cells in a 96 pixel sheet, so a cell is a third of its width.
          const cell = edgeArt.w / 3;
          for (const dir of blender.dirs) {
            const [dx, dy] = D8[dir];
            // `Floor.edge(x, y, i, j)` is `edges[i][2 - j]`: column from dx, row flipped
            // because the board's y grows upwards and the sheet's grows downwards.
            const col = dx + 1;
            const row = 2 - (dy + 1);
            context.drawImage(sheet,
              edgeArt.x + col * cell, edgeArt.y + row * cell, cell, cell,
              px, py, scale, scale);
          }
        }
      }
    }
  }

  const pattern = backing(context, scale);
  for (const tile of tiles) {
    const size = sizeOf(tile.name || tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        const x = tile.x + offset + dx;
        const y = tile.y + offset + dy;
        if (painted.has(`${x},${y}`)) continue;
        context.fillStyle = pattern;
        context.fillRect((x - box.left) * scale,
                         (box.height - (y - box.bottom) - 1) * scale, scale, scale);
      }
    }
  }

  // The apron, drawn as a grid so it reads as somewhere blocks go rather than as padding.
  if (apron) {
    context.save();
    context.strokeStyle = "rgba(255, 211, 127, .22)";
    context.lineWidth = 1;
    for (let x = 0; x < box.width; x++) {
      for (let y = 0; y < box.height; y++) {
        const tx = box.left + x;
        const ty = box.bottom + y;
        const inside = tx >= tight.left && tx < tight.left + tight.width
          && ty >= tight.bottom && ty < tight.bottom + tight.height;
        if (inside) continue;
        context.strokeRect(x * scale + 0.5, (box.height - y - 1) * scale + 0.5,
                           scale - 1, scale - 1);
      }
    }
    context.restore();
  }

  const feeds = blender(tiles, sizeOf, roleOf);
  const missing = [];

  /* How solid the build is drawn.
     
     Painting the ground under a finished schematic is painting blind: the blocks cover
     it. Fading them out is what makes the brush usable, and it answers a question of its
     own besides - "what is this thing standing on" is not obvious from a picture where
     the thing covers everything. */
  context.save();
  context.globalAlpha = options.opacity === undefined ? 1 : options.opacity;

  /* What is running, if anything is.

     `world` is a simulation that has already been stepped this frame; `stepped` is how many
     of the game's own ticks that was. Both are absent for a still picture, and every branch
     below reduces to what it drew before. */
  const world = options.world || null;
  const stepped = options.stepped || 0;
  const gear = { atlas, sheet, catalogue: options.catalogue || null };

  /* Three passes over the tiles rather than one, because the game draws in layers and not
     in tile order (`mindustry.graphics.Layer`): a belt goes down at `block - 0.2`, what
     rides it at `block - 0.1`, and every other block at `block`. Drawn in tile order, an
     item riding a belt past a smelter disappears behind the smelter on one side of it and
     not on the other. */
  const drawn = [];
  for (const tile of tiles) {
    const name = tile.name || tile.block;
    const size = sizeOf(name);
    const offset = Math.trunc(-(size - 1) / 2);
    drawn.push({
      tile, name, size, role: roleOf(name),
      // Screen coordinates count down from the top; the game counts up from the bottom.
      px: (tile.x + offset - box.left) * scale,
      py: (box.height - (tile.y + offset - box.bottom) - size) * scale,
    });
  }

  const one = (part) => {
    const { tile, name, size, role, px, py } = part;
    const found = atlas?.sprites?.[name];
    if (!found) {
      missing.push(name);
      context.fillStyle = "rgba(255, 128, 128, .35)";
      context.fillRect(px, py, size * scale, size * scale);
      return;
    }

    const build = world?.at(tile.x, tile.y) || null;
    if (build?.state.dead) {
      // Gone, and drawn coming apart for half a second rather than vanishing between two
      // frames, which reads as a rendering fault instead of as a reactor going up.
      const died = world.gone?.get(build);
      drawWreck(context, tile, size, box, scale,
                died === undefined ? 0 : world.tick - died);
      return;
    }

    const spins = turns(name, role);

    // The square of colour under a configured block, which is how the game says what a
    // sorter passes and what a source pours. `Fill.square(x, y, tilesize/2)` in
    // `Sorter.draw` and `ItemSourceBuild.draw`: a whole tile, with the frame over it.
    // Without it twelve sources side by side are twelve identical blank frames.
    let art = found;
    if (tile.tint) {
      const plain = atlas?.sprites?.[`${name}#plain`];
      if (plain) {
        // The bare frame rather than the composite, whose middle is the cross the game
        // draws when nothing is set: painted under that, the colour never showed.
        art = plain;
        context.fillStyle = tile.tint;
        context.fillRect(px, py, size * scale, size * scale);
      }
    }

    // A carrier picks one of five shapes from its neighbours, so a corner draws as a
    // corner. Everything else keeps its single sprite.
    let flip = 1;
    if (role === "conveyor" || role === "conduit") {
      const chosen = carrierShape(tile, feeds);
      /* Kept on the tile for the cargo pass, which has to lay a conduit's liquid into the
         same shape the plate was drawn in. */
      part.shape = chosen.shape;
      part.flip = chosen.flip;
      /* A belt that is running is four sprites and not one: `Conveyor.draw` picks between
         them with `(Time.time * speed * 8 * efficiency) % 4`, so the scroll is the belt's
         own speed and a stalled belt stands still. */
      const frame = build && role === "conveyor"
        ? beltFrame(build, world.tick, chosen.shape, stepped) : 0;
      const variant = atlas?.sprites?.[`${name}#${chosen.shape}-${frame}`]
        || atlas?.sprites?.[`${name}#${chosen.shape}`];
      if (variant) { art = variant; flip = chosen.flip; }
    }

    // A drill draws itself out of its own layers instead, because the flattened sprite has
    // its rotor baked into it standing still.
    if (build && drawRunning(context, gear, build, tile, size, box, scale, stepped)) return;

    if (spins || flip !== 1) {
      context.save();
      context.translate(px + (size * scale) / 2, py + (size * scale) / 2);
      // Mindustry counts rotations anticlockwise from east; a canvas turns clockwise.
      context.rotate(-(tile.rotation % 4) * Math.PI / 2);
      context.scale(1, flip);
      context.drawImage(sheet, art.x, art.y, art.w, art.h,
                        -(size * scale) / 2, -(size * scale) / 2, size * scale, size * scale);
      context.restore();
    } else {
      context.drawImage(sheet, art.x, art.y, art.w, art.h,
                        px, py, size * scale, size * scale);
    }

    // And what glows, heats or burns on top of it, once the plate is down.
    if (build) drawLayers(context, gear, build, tile, size, box, scale, stepped);
  };

  for (const part of drawn) if (CARRIER_ROLES.has(part.role)) one(part);
  if (world) {
    drawCargo(context, gear, world,
              drawn.filter((part) => CARRIER_ROLES.has(part.role))
                   .map((part) => Object.assign(part.tile,
                        { shape: part.shape ?? 0, flip: part.flip ?? 1 })),
              sizeOf, roleOf, box, scale);
  }
  for (const part of drawn) if (!CARRIER_ROLES.has(part.role)) one(part);
  if (world) drawFlyers(context, gear, world, box, scale);

  // Faded with the build, not with the marks: a mark on a half transparent block is still
  // an answer the player gave, and it is the one thing on the picture that has to stay
  // legible while the ground underneath is being painted.
  context.restore();

  // The marks, so the picture says where things go in and out. A list of coordinates
  // beside a picture makes a reader count tiles; a mark on the tile does not.
  //
  // Only what the player said, drawn solid. There used to be a second, faded ring on every
  // tile that could have been an intake, which on a real schematic meant fourteen green
  // squares with one of them slightly brighter, and no way to tell which was which.
  for (const port of options.inputs || []) {
    marker(context, port, box, scale, "#84d98b");
  }
  for (const port of options.outputs || []) {
    marker(context, port, box, scale, "#ffd37f");
  }

  drawPowerLinks(context, tiles, sizeOf, box, scale);

  // Spans last, so a bridge draws over the tiles it flies past rather than under them.
  for (const tile of tiles) {
    if (roleOf(tile.name || tile.block) === "bridge") drawBridge(context, tile, box, scale);
  }

  return { scale, box, missing: [...new Set(missing)] };
}

/**
 * The wires between power nodes, which were not drawn at all.
 *
 * They are most of what a power schematic looks like: a picture of a reactor farm with the
 * pylons and no lines between them is a picture of some reactors. The game draws them from
 * `PowerNode.drawPlanConfigTop`, centre to centre, trimmed by half of each block plus a
 * pixel and a half so the line starts at the frame rather than under it.
 *
 * The link list is stored on both ends, so each wire is offered twice and drawn once.
 */
function drawPowerLinks(context, tiles, sizeOf, box, scale) {
  const at = new Map();
  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index];
    const size = sizeOf(tile.name || tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        at.set(`${tile.x + offset + dx},${tile.y + offset + dy}`, index);
      }
    }
  }

  const centre = (tile) => {
    const size = sizeOf(tile.name || tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    return [(tile.x + offset - box.left) * scale + size * scale / 2,
            (box.height - (tile.y + offset - box.bottom) - size) * scale + size * scale / 2];
  };

  const drawn = new Set();
  context.save();
  // White with a breath of the game's power yellow, which is `setupColor(1f)` on a fed
  // network, and see-through enough not to bury what it flies over.
  context.strokeStyle = "#fdf3d0";
  context.globalAlpha = 0.55;
  context.lineWidth = Math.max(1, scale * 1.6 / WORLD);
  context.lineCap = "round";

  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index];
    const links = tile.config?.type === 8 ? tile.config.links : null;
    if (!links) continue;

    for (const packed of links) {
      // `Point2.pack`: the x in the high half, the y in the low half as a signed short.
      const dx = packed >> 16;
      const dy = (packed << 16) >> 16;
      const other = at.get(`${tile.x + dx},${tile.y + dy}`);
      if (other === undefined || other === index) continue;

      const key = index < other ? `${index}-${other}` : `${other}-${index}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const [x1, y1] = centre(tile);
      const [x2, y2] = centre(tiles[other]);
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length < 1) continue;

      // Trimmed at each end by half the block it leaves, less a pixel and a half, which
      // is `len1` and `len2` in `PowerNode.drawLaser`.
      const ux = (x2 - x1) / length;
      const uy = (y2 - y1) / length;
      const trim = (tile2) =>
        (sizeOf(tile2.name || tile2.block) * scale) / 2 - 1.5 * scale / WORLD;
      const from = trim(tile);
      const to = trim(tiles[other]);
      if (from + to >= length) continue;

      context.beginPath();
      context.moveTo(x1 + ux * from, y1 + uy * from);
      context.lineTo(x2 - ux * to, y2 - uy * to);
      context.stroke();
    }
  }
  context.restore();
}

/**
 * One sprite's place in the atlas, for drawing straight onto a canvas.
 *
 * `itemIcon` below answers a neighbouring question and answers it with a data URL, which
 * is a base64 round trip through a second canvas. Fine once per chip in a palette, absurd
 * for a ghost that follows the cursor at sixty frames a second.
 */
export function spriteOf(name) {
  const found = atlas?.sprites?.[name];
  return found && sheet ? { sheet, ...found } : null;
}

/**
 * One sprite as an image, for saying what a layout makes in the game's own pictures.
 *
 * `folder` picks which set: items live under `item/` and blocks under their own name, so
 * the same helper draws the chip beside "coal" and the chip beside "conveyor".
 */
export function itemIcon(item, pixels = 20, folder = "item/") {
  const found = atlas?.sprites?.[`${folder}${item}`];
  if (!found || !sheet) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(sheet, found.x, found.y, found.w, found.h, 0, 0, pixels, pixels);
  return canvas.toDataURL();
}
