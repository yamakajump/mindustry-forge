/**
 * The moving picture: a schematic drawn while it runs.
 *
 * Everything here is driven by a world that has actually been stepped, never by a clock of
 * its own. An item is drawn where the belt says it is, a channel is drawn as full as the
 * pipe says it is, a rotor is turned by the warmup the drill reached. That is the whole
 * point: the engine underneath is the one measured against a real headless server frame by
 * frame, so what a player watches here is what the game would do rather than an impression
 * of it. A belt animation that ran on `Date.now()` would look fine and mean nothing.
 *
 * The game draws in layers rather than in tile order - `mindustry.graphics.Layer`: a belt
 * goes down at `block - 0.2`, what rides it at `block - 0.1`, every other block at `block`.
 * Which is why the renderer makes three passes and not one, and why this module exists as
 * a seam rather than as a hundred lines wedged into the middle of `draw`.
 *
 * `Conveyor.draw`, `Duct.draw`, `Drill.draw`, `Drawf.liquid`, Mindustry v159.7.
 */

import { DIRECTIONS, TICKS, World, placeDrains } from "./engine/core.js";
import { behaviourOf } from "./engine/carriers.js";

/** The game's own units: eight pixels to a tile, five to an item. */
const GAME_TILE = 8;
const ITEM_SIZE = 5;

/** Which roles are drawn under the cargo layer rather than over it. */
export const CARRIER_ROLES = new Set(["conveyor", "conduit", "duct", "duct-router"]);

/* Two quantities the game keeps on a building that are only ever **drawn**: how long a
   drill has been turning, and how backed up a belt is. Kept here rather than in the
   engine, because the engine is checked against a server frame by frame and neither of
   these moves a single item anywhere. Nothing that changes a measured number is allowed to
   live in the renderer, and nothing that changes only a picture is allowed to live in the
   engine. */
const spun = new WeakMap();
const clogged = new WeakMap();
const warmed = new WeakMap();

/** A sprite in the colour of what is flowing through it, cached because tinting is slow. */
const tints = new Map();

function tinted(sheet, art, key, colour) {
  const id = `${key}|${colour}`;
  const had = tints.get(id);
  if (had) return had;

  const plate = document.createElement("canvas");
  plate.width = art.w;
  plate.height = art.h;
  const paint = plate.getContext("2d");
  paint.imageSmoothingEnabled = false;
  paint.drawImage(sheet, art.x, art.y, art.w, art.h, 0, 0, art.w, art.h);
  /* Keeps the sprite's own shape and replaces every colour in it, which is what
     `Draw.color` does to the white mask the game ships for exactly this. */
  paint.globalCompositeOperation = "source-in";
  paint.fillStyle = colour;
  paint.fillRect(0, 0, art.w, art.h);

  tints.set(id, plate);
  return plate;
}

/** Where a block's middle lands on the canvas, and how far a game pixel is from there. */
export function anchor(tile, size, box, scale) {
  const offset = Math.trunc(-(size - 1) / 2);
  return {
    cx: (tile.x + offset - box.left + size / 2) * scale,
    cy: (box.height - (tile.y + offset - box.bottom) - size / 2) * scale,
    // Screen y counts down where the game counts up, so anything vertical is negated.
    unit: scale / GAME_TILE,
  };
}

/**
 * `Conveyor.draw`'s frame: `(int)(Time.time * speed * 8 * efficiency) % 4`.
 *
 * A titanium belt scrolls half again as fast as a copper one because its `speed` is half
 * again as large, and a belt backed up long enough shows frame zero rather than a still
 * frame of the animation. Both come off the same numbers the throughput does.
 */
export function beltFrame(build, time, shape, ticks) {
  if (clogHeat(build, shape, ticks) > 0.5) return 0;
  const speed = build.block.speed || 0;
  return Math.abs(Math.trunc(time * speed * 8)) % 4;
}

/**
 * `Mathf.absin(in, scl, mag)`, which is every pulse in the game.
 *
 * `(sin(in / (scl * 2)) * mag + mag) / 2`, so it swings between nothing and `mag` rather
 * than around zero. A furnace's glow breathing at the wrong rate is more obviously wrong
 * than one that does not breathe at all, so the constants come out of the block.
 */
export const absin = (at, scale, magnitude) =>
  (Math.sin(at / (scale * 2)) * magnitude + magnitude) / 2;

/**
 * How hard a block is running, and for how long it has been.
 *
 * `warmup` is the game's, `Mathf.approachDelta(warmup, efficiency > 0 ? 1 : 0, warmupSpeed)`
 * in `GenericCrafter.updateTile`, and `totalProgress` is the clock every pulse and every
 * rotor is measured against. Neither belongs in the engine: `getProgressIncrease` reads
 * `edelta` and not `warmup`, so a furnace crafts at the same rate whether or not it has
 * finished lighting up. They are drawing quantities, and they live where the drawing does.
 */
export function running(build, ticks) {
  const known = warmed.get(build) || { warmup: 0, total: 0 };
  const wanted = build.state.warmup !== undefined
    ? build.state.warmup
    : ((build.state.efficiency ?? 0) > 0 ? 1 : 0);
  const rate = (build.block.warmup_speed ?? 0.019) * ticks;
  const warmup = known.warmup < wanted
    ? Math.min(wanted, known.warmup + rate)
    : Math.max(wanted, known.warmup - rate);
  const state = { warmup, total: known.total + warmup * ticks };
  warmed.set(build, state);
  return state;
}

/** `clogHeat`: a whole second of being backed up before a belt admits to it. */
function clogHeat(build, shape, ticks) {
  const minitem = build.state.minitem ?? 1;
  // A curve holds less than a straight run before it counts as blocked.
  const room = 0.4 + (shape === 1 ? 0.3 : 0);
  const heat = minitem < room
    ? Math.min(1, (clogged.get(build) || 0) + ticks / 60)
    : 0;
  clogged.set(build, heat);
  return heat;
}

/**
 * What rides the carriers: items on belts, items in ducts, liquid through conduits.
 *
 * The belt maths is the game's, vector for vector. `ys` runs from nothing at the back of
 * the belt to one at its front and `xs` from minus one to one across it, so an item handed
 * in from the left visibly slides back to the middle over the next half tile. Drawn down
 * the axis instead, a junction of four belts looks like four unrelated belts.
 */
export function drawCargo(context, gear, world, tiles, sizeOf, roleOf, box, scale) {
  const { atlas, sheet, catalogue } = gear;
  for (const tile of tiles) {
    const name = tile.name || tile.block;
    const role = roleOf(name);
    if (!CARRIER_ROLES.has(role)) continue;
    const build = world.at(tile.x, tile.y);
    if (!build || build.state.dead) continue;

    const size = sizeOf(name);
    const spot = anchor(tile, size, box, scale);
    const rotation = ((tile.rotation || 0) % 4 + 4) % 4;
    const [fx, fy] = DIRECTIONS[rotation];

    if (role === "conveyor") {
      for (let i = 0; i < (build.state.len || 0); i++) {
        const art = atlas?.sprites?.[`item/${build.state.ids[i]}`];
        if (!art) continue;
        const along = build.state.ys[i];
        const across = build.state.xs?.[i] || 0;
        /* `Tmp.v1.trns(rotation*90, tilesize, 0)` plus
           `Tmp.v2.trns(rotation*90, -tilesize/2, xs * tilesize/2)`. Turning a vector by a
           right angle is exact, so it is written out rather than run through a sine. */
        const gx = fx * GAME_TILE * along - fx * GAME_TILE / 2 - fy * across * GAME_TILE / 2;
        const gy = fy * GAME_TILE * along - fy * GAME_TILE / 2 + fx * across * GAME_TILE / 2;
        stamp(context, sheet, art, spot, gx, gy, ITEM_SIZE);
      }
      continue;
    }

    if (role === "duct" || role === "duct-router") {
      const item = build.state.current;
      const art = item && atlas?.sprites?.[`item/${item}`];
      if (!art) continue;
      /* `Duct.draw`: from the middle of the edge it came in by to the middle of the edge it
         points at, which is what makes an item visibly turn a corner in a duct rather than
         cross it in a straight line. */
      const speed = build.block.duct_speed || build.block.speed || 1;
      const along = Math.max(0, Math.min(1, (build.state.progress + 1) / (2 - 1 / speed)));
      const [bx, by] = DIRECTIONS[((build.state.from ?? rotation) % 4 + 4) % 4];
      const gx = (bx + (fx - bx) * along) * GAME_TILE / 2;
      const gy = (by + (fy - by) * along) * GAME_TILE / 2;
      stamp(context, sheet, art, spot, gx, gy, ITEM_SIZE);
      continue;
    }

    // A conduit: the channel takes the colour of what is running through it, as strongly
    // as it is full. `Drawf.liquid`, which is the rule for every liquid block in the game.
    const shape = tile.shape ?? 0;
    const plate = atlas?.sprites?.[`${name}#bottom-${shape}`];
    const held = fullest(build);
    if (!plate || !held) continue;
    const colour = catalogue?.liquids?.[held.liquid]?.color || "#4a6de5";
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, held.share));
    context.translate(spot.cx, spot.cy);
    context.rotate(-rotation * Math.PI / 2);
    context.scale(1, tile.flip || 1);
    const side = size * scale;
    context.drawImage(tinted(sheet, plate, `${name}#bottom-${shape}`, colour),
                      -side / 2, -side / 2, side, side);
    context.restore();
  }
}

/** One sprite, centred on a point given in the game's own pixels away from a block's middle. */
function stamp(context, sheet, art, spot, gx, gy, pixels) {
  const side = pixels * spot.unit;
  context.drawImage(sheet, art.x, art.y, art.w, art.h,
                    spot.cx + gx * spot.unit - side / 2,
                    spot.cy - gy * spot.unit - side / 2, side, side);
}

/** Which liquid a block is holding most of, and how full of it it is. */
function fullest(build) {
  let best = null;
  for (const [liquid, amount] of build.liquids.held()) {
    if (amount > 0.01 && (!best || amount > best.amount)) best = { liquid, amount };
  }
  if (!best) return null;
  return { ...best, share: best.amount / (build.liquidCapacity || 1) };
}

/**
 * The parts of a block that turn, fill or glow while it runs.
 *
 * Only what the simulation actually knows. A turret's barrel is deliberately left still:
 * nothing in a schematic gives it anything to aim at, and a barrel swinging for decoration
 * would be the one moving thing on the picture that is a lie.
 */
export function drawRunning(context, gear, build, tile, size, box, scale, ticks) {
  const { atlas, sheet } = gear;
  const name = tile.name || tile.block;
  const spot = anchor(tile, size, box, scale);
  const side = size * scale;
  const heat = running(build, ticks);

  /* A block with a turning part is drawn from its own three layers, never from the
     flattened sprite: `block-<name>-full` has the rotor baked into it standing still, and a
     turning copy over that leaves the still one showing through underneath.

     Two sources for the rotor and they do not overlap. A crafter names it in its drawing
     chain, with a speed. A drill has no chain at all - `Drill.draw` stacks its own layers
     rather than delegating to a `DrawBlock` - so there is nothing to dump and the sprite
     names are the only thing that says it has one.

     `Drill.draw`: the angle is `timeDrilled * rotateSpeed`, and `timeDrilled` only advances
     while the drill is warm, so one with nothing under it slows to a stop rather than
     freezing mid-turn. */
  const spins = (build.block.drawers || []).find((one) => one.kind === "rotator");
  const rotor = spins
    ? atlas?.sprites?.[`${name}#${spins.suffix.slice(1)}`]
    : (atlas?.sprites?.[`${name}#rotator`] || atlas?.sprites?.[`${name}#spinner`]);
  const plate = atlas?.sprites?.[`${name}#base`];
  if (!rotor || !plate) return false;

  const turned = (spun.get(build) || 0) + (build.state.warmup ?? heat.warmup) * ticks;
  spun.set(build, turned);

  context.drawImage(sheet, plate.x, plate.y, plate.w, plate.h,
                    spot.cx - side / 2, spot.cy - side / 2, side, side);
  context.save();
  context.translate(spot.cx, spot.cy);
  context.rotate(-turned * (spins?.rotate_speed ?? 2) * Math.PI / 180);
  context.drawImage(sheet, rotor.x, rotor.y, rotor.w, rotor.h,
                    -side / 2, -side / 2, side, side);
  context.restore();

  const cap = atlas?.sprites?.[`${name}#top`];
  if (cap) {
    context.drawImage(sheet, cap.x, cap.y, cap.w, cap.h,
                      spot.cx - side / 2, spot.cy - side / 2, side, side);
  }
  // The ore a drill is pulling out, in that ore's colour. `Drill.drawMineItem`.
  const seam = atlas?.sprites?.[`${name}#item`];
  const dug = build.node?.dug?.resource;
  if (seam && dug) {
    const colour = gear.catalogue?.items?.[dug]?.color || "#ffffff";
    context.drawImage(tinted(sheet, seam, `${name}#item`, colour),
                      spot.cx - side / 2, spot.cy - side / 2, side, side);
  }
  return true;
}

/**
 * The layers that go **over** a block, once its own plate is down.
 *
 * Separate from the rotor above because the order matters and is the game's: a rotor
 * replaces the flattened sprite, a glow goes on top of it. Painted before, every one of
 * them was covered by the very block it belongs to.
 */
export function drawLayers(context, gear, build, tile, size, box, scale, ticks) {
  const chain = build.block.drawers;
  if (!chain?.length) return;
  const spot = anchor(tile, size, box, scale);
  const heat = running(build, ticks);
  /* The block's own drawing chain, as the game flattened it: which layers, in what order,
     in what colour, breathing how fast. Read rather than guessed - an electrolyser's glow
     is lilac and a kiln's is red, and nothing in the file name says so. */
  for (const layer of chain) {
    // The rotor is already down, laid by `drawRunning` between the plate and the cap,
    // because that is the only place it does not cover a still copy of itself.
    if (layer.kind === "rotator") continue;
    paintLayer(context, gear, build, layer, spot, size * scale, heat, ticks);
  }
}

/**
 * One layer of a block's drawing chain.
 *
 * Four kinds carry motion and the rest are a still picture the composite already has. Each
 * one is the game's own arithmetic; the constants are the block's, out of the dump, because
 * a pulse at the wrong rate reads worse than no pulse at all.
 */
function paintLayer(context, gear, build, layer, spot, side, heat, ticks) {
  const { atlas, sheet, catalogue } = gear;
  const name = build.name;
  const key = `${name}#${(layer.suffix || "").slice(1)}`;
  const art = atlas?.sprites?.[key];

  if (layer.kind === "liquid") {
    // `Drawf.liquid`: the region in the colour of what is in it, as strong as it is full.
    const held = layer.liquid
      ? { liquid: layer.liquid, share: build.liquids.get(layer.liquid) / (build.liquidCapacity || 1) }
      : fullest(build);
    if (!art || !held || !(held.share > 0.001)) return;
    const colour = catalogue?.liquids?.[held.liquid]?.color || "#4a6de5";
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, held.share));
    context.drawImage(tinted(sheet, art, key, colour),
                      spot.cx - side / 2, spot.cy - side / 2, side, side);
    context.restore();
    return;
  }

  if (layer.kind === "glow") {
    /* `DrawGlowRegion`: additive, and breathing rather than steady.
       `(absin(totalProgress, scale, alpha) * intensity + 1 - intensity) * warmup * alpha`,
       and nothing at all below a thousandth of warmup. */
    if (!art || heat.warmup <= 0.001) return;
    const swing = layer.intensity ?? 0.5;
    const most = layer.alpha ?? 0.9;
    const strength = (absin(heat.total, layer.scale ?? 10, most) * swing + 1 - swing)
      * heat.warmup * most;
    additive(context, () => {
      context.globalAlpha *= Math.max(0, Math.min(1, strength));
      const turn = heat.total * (layer.rotate_speed || 0);
      context.translate(spot.cx, spot.cy);
      context.rotate(-turn * Math.PI / 180);
      context.drawImage(tinted(sheet, art, key, layer.color || "#ff0000"),
                        -side / 2, -side / 2, side, side);
    });
    return;
  }

  if (layer.kind === "heat") {
    /* `DrawHeatRegion`: how hot it is, times a pulse. The fraction is against what the
       block **asks for**, which is why a heater fed half its heat glows half as hard. */
    const held = build.state.heat || 0;
    const wanted = build.block.heat_requirement || build.block.heat_output || 1;
    if (!art || held <= 0) return;
    const pulse = layer.pulse ?? 0.3;
    const strength = Math.min(1, held / wanted)
      * ((layer.alpha ?? 0.8) * (1 - pulse + absin(heat.total, layer.scale ?? 10, pulse)));
    additive(context, () => {
      context.globalAlpha *= Math.max(0, Math.min(1, strength));
      context.drawImage(tinted(sheet, art, key, layer.color || "#ff3838"),
                        spot.cx - side / 2, spot.cy - side / 2, side, side);
    });
    return;
  }

  if (layer.kind === "flame") {
    /* `DrawFlame`: two discs at the block's middle, the outer one in the flame's colour and
       the inner one white, both breathing. The random jitter the game adds is left out on
       purpose: it is the one thing on this picture that would differ between two runs of
       the same schematic, and everything else here is reproducible. */
    if (heat.warmup <= 0) return;
    const swing = 0.3;
    const strength = ((1 - swing) + absin(heat.total, 8, swing)) * heat.warmup;
    const outer = (layer.radius ?? 3)
      + absin(heat.total, layer.scale ?? 5, layer.magnitude ?? 2);
    additive(context, () => {
      context.globalAlpha *= Math.max(0, Math.min(1, strength));
      disc(context, spot, outer, layer.color || "#ffc999");
      context.globalAlpha = Math.max(0, Math.min(1, heat.warmup));
      disc(context, spot, 1.9 + absin(heat.total, layer.scale ?? 5, 1), "#ffffff");
    });
    return;
  }

  if (layer.kind === "rotator" && art) {
    const turn = heat.total * (layer.rotate_speed || 0);
    context.save();
    context.translate(spot.cx, spot.cy);
    context.rotate(-turn * Math.PI / 180);
    context.drawImage(sheet, art.x, art.y, art.w, art.h,
                      -side / 2, -side / 2, side, side);
    context.restore();
  }
}

/** `Blending.additive`, which is what makes a glow read as light and not as paint. */
function additive(context, paint) {
  context.save();
  context.globalCompositeOperation = "lighter";
  paint();
  context.restore();
}

/** `Fill.circle`, in the game's own pixels. */
function disc(context, spot, radius, colour) {
  context.fillStyle = colour;
  context.beginPath();
  context.arc(spot.cx, spot.cy, radius * spot.unit, 0, Math.PI * 2);
  context.fill();
}

/**
 * The drones an assembler and a cargo loader keep in the air.
 *
 * Two blocks in the game have a rate that **is** a flight: an assembler advances by the
 * fraction of its drones that are in position, and a cargo loader's whole output is one
 * unit going back and forth. Drawing the schematic without them draws the two blocks whose
 * behaviour is least obvious as two blocks doing nothing.
 */
export function drawFlyers(context, gear, world, box, scale) {
  const { atlas, sheet } = gear;
  for (const build of world.builds) {
    const flying = build.state.drones || (build.state.flyer ? [build.state.flyer] : []);
    // The catalogue entry a drone carries has its numbers but not its name, and the block
    // that made it is the only thing that knows which unit it asked for.
    const kind = build.block.drone_type || build.block.unit_type;
    for (const flyer of flying) {
      const art = atlas?.sprites?.[`unit/${kind}`];
      const size = (flyer.type?.hit_size || 8) * (scale / GAME_TILE);
      /* Placed from the world's own pixel coordinates rather than from a tile, because a
         drone is between tiles nearly all the time and rounding it onto one is what makes
         a flight look like a slideshow. */
      const cx = (flyer.x / GAME_TILE - box.left) * scale;
      const cy = (box.height - (flyer.y / GAME_TILE - box.bottom)) * scale;

      context.save();
      context.translate(cx, cy);
      context.rotate(-(flyer.rotation - 90) * Math.PI / 180);
      if (art) {
        context.drawImage(sheet, art.x, art.y, art.w, art.h,
                          -size / 2, -size / 2, size, size);
      } else {
        // No sprite for this unit in the atlas: a marker, rather than nothing at all.
        context.fillStyle = "#ffd37f";
        context.beginPath();
        context.arc(0, 0, size / 3, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }
}

/**
 * A block that came apart, and the blast still spreading.
 *
 * The engine already kills a reactor that overheats and spends the blast on its
 * neighbours. Without something drawn, the block simply stopped existing between two
 * frames, which reads as a rendering fault rather than as the one thing a player most
 * needs to see about a reactor bank.
 */
export function drawWreck(context, tile, size, box, scale, age) {
  const spot = anchor(tile, size, box, scale);
  const side = size * scale;
  const left = Math.max(0, 1 - age / 30);
  if (left <= 0) return;
  context.save();
  context.globalAlpha *= left;
  context.fillStyle = "#ff8a3d";
  context.fillRect(spot.cx - side / 2, spot.cy - side / 2, side, side);
  context.restore();
}

/**
 * The loop: a world, stepped at the game's own rate, redrawn as often as the screen allows.
 *
 * The two rates are not the same and must not be confused. Mindustry runs at sixty ticks a
 * second and the port is exact **per tick**, so the clock here counts out whole ticks and
 * hands the leftover to the next frame. A monitor at 144 hertz gets 144 pictures of 60
 * ticks, not 144 ticks, and a monitor that stalls for a quarter of a second catches up by
 * stepping fifteen ticks at once rather than by running the factory in slow motion.
 *
 * `catch-up` is capped: a tab left in the background for a minute comes back to a factory
 * one minute further on, not to a browser locked solid working through 3600 ticks.
 */
export class Live {
  constructor(graph, { catalogue = null, stock = {}, feeds = {}, gridsOf = null } = {}) {
    this.world = new World(graph, behaviourOf);
    if (gridsOf) this.world.wire(gridsOf);
    this.world.catalogue = catalogue;
    this.rate = 1;
    this.owed = 0;
    this.last = 0;
    this.running = false;
    /* Hung on the world rather than kept here, because the renderer is handed the world and
       not this: `world.tick` is already the game's own frame counter, and what died and
       when belongs beside it. */
    this.world.gone = new Map();

    for (const [index, held] of Object.entries(stock)) {
      const build = this.world.builds[Number(index)];
      if (!build) continue;
      for (const [item, count] of Object.entries(held)) build.items.add(item, count);
    }

    /* Plugged in, where the schematic brought no generator of its own.

       Without this, pressing "Faire tourner" on a perfectly good silicon plant showed a
       factory doing nothing: every machine on a dead grid runs at zero efficiency, and the
       only hint on the page was a line, three cards down, saying it consumes power without
       making any - which reads as a remark about the design rather than as the reason the
       picture is frozen.

       A grid that has a producer is left alone, so a layout that browns out on its own
       current still browns out, exactly as the bench measures it. */
    this.plugged = [];
    for (const grid of this.world.grids || []) {
      if (grid.producers.length || !grid.consumers.length) continue;
      grid.mains = true;
      this.plugged.push(grid);
    }

    /* Where the design delivers. Without these a belt pointing out of the schematic fills
       up, backs up into the machines behind it and the whole thing seizes after a few
       seconds: what a player watched was a factory choking on its own output, which is not
       what that factory does in a base. The bench has had them from the start, so the
       measured answer and the watched one were running under different rules. */
    this.drains = placeDrains(this.world);

    this.taps = [];
    for (const [index, rates] of Object.entries(feeds)) {
      const build = this.world.builds[Number(index)];
      if (!build) continue;
      for (const [item, rate] of Object.entries(rates)) {
        if (rate > 0) this.taps.push({ build, item, rate, owed: 0 });
      }
    }
  }

  /** One tick of the game, taps included. */
  tick() {
    for (const tap of this.taps) {
      tap.owed += tap.rate / TICKS;
      while (tap.owed >= 1) {
        const source = feedFrom(tap.build);
        if (!tap.build.acceptItem(source, tap.item)) break;
        tap.build.handleItem(source, tap.item);
        tap.owed -= 1;
      }
    }
    this.world.step(1);
    // What died this tick, so the picture can show it coming apart rather than vanishing.
    for (const build of this.world.builds) {
      if (build.state.dead && !this.world.gone.has(build)) {
        this.world.gone.set(build, this.world.tick);
      }
    }
  }

  /**
   * Advance to now, and report how many ticks that was.
   *
   * The caller needs the count: a belt's frame and a rotor's angle move by elapsed time,
   * and handing them "one frame" when fifteen ticks went by would run the animation at a
   * fifteenth of the speed of the factory it is drawing.
   */
  advance(now) {
    if (!this.running) return 0;
    if (!this.last) { this.last = now; return 0; }
    const gap = Math.min(now - this.last, 250);
    this.last = now;
    this.owed += (gap / 1000) * TICKS * this.rate;

    let stepped = 0;
    while (this.owed >= 1) {
      this.tick();
      this.owed -= 1;
      stepped++;
    }
    return stepped;
  }

  play() { this.running = true; this.last = 0; }
  pause() { this.running = false; }
}

/** A source standing behind a block, so the block can tell which side an item came from. */
function feedFrom(build) {
  const [dx, dy] = DIRECTIONS[((build.rotation || 0) + 2) % 4];
  return { x: build.x + dx, y: build.y + dy, block: {}, role: "source" };
}
