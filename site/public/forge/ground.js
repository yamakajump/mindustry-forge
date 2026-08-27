/**
 * What a drill or a pump pulls out of the ground it is standing on.
 *
 * Until there was a ground, a drill was reported at its best case: "full patch, best
 * case", which is the tool admitting it does not know what the drill is on. Worse, since
 * the block registry gives a drill no output at all - what it makes is decided by the
 * tiles under it - a drill in the graph produced nothing whatsoever, and a schematic that
 * was all drills and belts analysed to silence.
 *
 * The formulas are the game's, from `Drill.updateTile` and `Pump.PumpBuild.updateTile`:
 *
 *     drill:  60 * covered / (drillTime + hardnessDrillMultiplier * hardness)
 *     pump:   60 * pumpAmount * sum of liquidMultiplier over the covered tiles
 *
 * `covered` is the count of tiles under the block holding the dominant ore, which is what
 * the game calls `dominantItems`. A drill half on a patch really is half as fast, and
 * that is the number a player wants before they build.
 */

import { DIRECTIONS } from "./engine/core.js";

/** Every tile a block covers, given where it is stored and how big it is. */
export function footprintOf(node) {
  const size = node.block.size || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  const tiles = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      tiles.push([node.x + offset + dx, node.y + offset + dy]);
    }
  }
  return tiles;
}

/** The floor and the ore on one tile, as the game stacks them. */
const layersAt = (ground, x, y) => ground[`${x},${y}`] || {};

/**
 * What a beam drill can see, and how much of it.
 *
 * Erekir has no ore patches: the ore is in the cliffs, and a plasma bore points at one and
 * eats sideways. So this is not "what am I standing on" but "what is in front of me", one
 * question per tile of the bore's own width, each answered by the **first solid tile**
 * within range and by nothing behind it.
 *
 * A wall that drops nothing still stops the scan. That is what makes a bore fussy to place
 * and is the difference between a bore reading four ore and reading one.
 */
export function beamOf(node, ground, catalogue) {
  if (node.role !== "beam-drill" || !ground || !catalogue) return null;

  const size = node.block.size || 1;
  const corner = Math.trunc(-(size - 1) / 2);
  const cornerX = node.x + corner;
  const cornerY = node.y + corner;
  const [dx, dy] = DIRECTIONS[node.rotation % 4];
  const blocked = node.block.blocked_items || [];

  let item = null;
  let count = 0;
  for (let i = 0; i < size; i++) {
    // `Block.nearbySide`: the i-th tile across the face it points out of, just outside its
    // own footprint.
    const start = [
      [cornerX + size, cornerY + i],
      [cornerX + i, cornerY + size],
      [cornerX - 1, cornerY + i],
      [cornerX + i, cornerY - 1],
    ][node.rotation % 4];

    for (let j = 0; j < (node.block.range || 5); j++) {
      const layers = layersAt(ground, start[0] + dx * j, start[1] + dy * j);
      const wall = catalogue.blocks[layers.wall];
      if (!wall) continue;

      // `Tile.wallDrop`: the wall's own drop, or the ore laid over it if that ore is the
      // kind that lives in walls. An ordinary ground ore over a wall gives nothing.
      const over = catalogue.blocks[layers.overlay];
      const drop = wall.drops || (over?.wall_ore ? over.drops : null);
      const hardness = drop ? (catalogue.items[drop]?.hardness ?? 99) : 99;
      if (drop && hardness <= (node.block.tier ?? 0) && !blocked.includes(drop)) {
        item = drop;
        count++;
      }
      break;
    }
  }

  return count ? { resource: item, count } : null;
}

/**
 * How many of the tiles under a solid pump it can work on.
 *
 * `canPump` for a solid pump is `!floor.isLiquid`, which reads backwards until you see
 * what the block is: a water extractor squeezes water out of **dry** ground, so standing
 * it in a lake is what stops it.
 */
export function dryTilesOf(node, ground, catalogue, bare = "metal-floor") {
  if (node.role !== "solid-pump" || !ground || !catalogue) return 0;
  let dry = 0;
  for (const [x, y] of footprintOf(node)) {
    /* A tile nobody painted is bare floor, and bare floor is dry. Read as "unknown, so
       not countable", a water extractor on an unpainted map made nothing at all, which is
       the opposite of the truth: it is the one block that works **anywhere** dry. */
    const floor = catalogue.blocks[layersAt(ground, x, y).floor || bare];
    if (floor && !floor.floor_liquid) dry++;
  }
  return dry;
}

/**
 * How much sand is in the cliff a wall crafter is pressed against.
 *
 * The same geometry as a beam drill and a shorter reach: only the tile **immediately** in
 * front of each tile of its width, and what it is worth is the attribute of the solid block
 * standing there rather than anything it drops. A dune wall is worth twice a rhyolite one,
 * so the same crusher on the same map runs at two different speeds depending on which cliff
 * it was turned towards.
 */
export function wallSumOf(node, ground, catalogue) {
  if (node.role !== "wall-crafter" || !ground || !catalogue) return 0;

  const size = node.block.size || 1;
  const corner = Math.trunc(-(size - 1) / 2);
  const cornerX = node.x + corner;
  const cornerY = node.y + corner;
  const wanted = node.block.attribute;

  let sum = 0;
  for (let i = 0; i < size; i++) {
    const at = [
      [cornerX + size, cornerY + i],
      [cornerX + i, cornerY + size],
      [cornerX - 1, cornerY + i],
      [cornerX + i, cornerY - 1],
    ][node.rotation % 4];
    const wall = catalogue.blocks[layersAt(ground, at[0], at[1]).wall];
    sum += wall?.attributes?.[wanted] || 0;
  }
  return sum;
}

/**
 * What the ground under a block is worth to it.
 *
 * `Block.sumAttribute`: the sum over every tile it covers, not an average, which is why a
 * two by two cultivator on four tiles of spore moss reads 1.2 rather than 0.3. Read off
 * the **floor** and never the ore laid over it, and a deep floor counts for nothing at all
 * unless the block floats.
 */
export function attributeOf(node, ground, catalogue) {
  const wanted = node.block.attribute;
  if (!wanted || !ground || !catalogue) return 0;

  let sum = 0;
  for (const [x, y] of footprintOf(node)) {
    const floor = catalogue.blocks[layersAt(ground, x, y).floor];
    if (!floor || floor.deep) continue;
    sum += floor.attributes?.[wanted] || 0;
  }
  return sum;
}

/**
 * What this block draws out of the ground, per second.
 *
 * Null when it draws nothing: not a drill, nothing under it, or ore it cannot break. A
 * mechanical drill on titanium is not slow, it is unable, and saying so beats reporting a
 * rate nobody will ever see.
 */
export function yieldOf(node, ground, catalogue) {
  if (!ground || !catalogue) return null;
  // A burst drill reads the same ore in the same way; only what it does with it differs.
  if (!["drill", "burst-drill", "pump"].includes(node.role)) return null;

  const tiles = footprintOf(node);

  if (node.role === "pump") {
    // One liquid at a time: the game refuses to pump at all when the tiles under it hold
    // two different ones, rather than picking a favourite.
    let liquid = null;
    let amount = 0;
    for (const [x, y] of tiles) {
      const layers = layersAt(ground, x, y);
      const floor = catalogue.blocks[layers.overlay] || catalogue.blocks[layers.floor];
      const drop = floor?.drops_liquid;
      if (!drop) continue;
      if (liquid && drop !== liquid) return null;
      liquid = drop;
      amount += floor.liquid_multiplier || 1;
    }
    if (!liquid) return null;
    return { resource: liquid, rate: (node.block.pump_amount || 0) * amount * 60 };
  }

  // The dominant ore, which is the one the most tiles hold. Ties go to whichever the game
  // would have found first, and a tie is a layout nobody builds on purpose.
  const counts = {};
  for (const [x, y] of tiles) {
    const layers = layersAt(ground, x, y);
    const floor = catalogue.blocks[layers.overlay] || catalogue.blocks[layers.floor];
    const drop = floor?.drops;
    if (drop) counts[drop] = (counts[drop] || 0) + 1;
  }

  let best = null;
  for (const [item, covered] of Object.entries(counts)) {
    const hardness = catalogue.items?.[item]?.hardness ?? 99;
    // Too hard for this drill: not slow, unable.
    if ((node.block.tier ?? 0) < hardness) continue;
    if (!best || covered > best.covered) best = { item, covered, hardness };
  }
  if (!best) return null;

  const time = (node.block.drill_time || 0)
    + (node.block.hardness_multiplier || 0) * best.hardness;
  if (time <= 0) return null;

  return {
    resource: best.item,
    rate: (60 * best.covered) / time,
    covered: best.covered,
    of: (node.block.size || 1) ** 2,
  };
}
