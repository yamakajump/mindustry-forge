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
 * What this block draws out of the ground, per second.
 *
 * Null when it draws nothing: not a drill, nothing under it, or ore it cannot break. A
 * mechanical drill on titanium is not slow, it is unable, and saying so beats reporting a
 * rate nobody will ever see.
 */
export function yieldOf(node, ground, catalogue) {
  if (!ground || !catalogue) return null;
  if (node.role !== "drill" && node.role !== "pump") return null;

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
