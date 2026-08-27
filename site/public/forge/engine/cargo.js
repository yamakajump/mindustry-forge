/**
 * A cargo loader and its unload points: items ferried through the air.
 *
 * The loader builds exactly one unit and then stops consuming anything at all
 * (`shouldConsume` is `unit == null`), and that one unit is the whole throughput. It flies
 * to the loader, takes as much of one item as it can hold, flies to an unload point set to
 * that item, and drops it in bursts every ninety frames. So the rate is a round trip, and a
 * pair of blocks eight tiles apart carries several times what a pair thirty apart does.
 *
 * Which is exactly the fact a schematic reader wants and no rate table can hold.
 *
 * `mindustry.world.blocks.units.UnitCargoLoader`, `UnitCargoUnloadPoint` and
 * `mindustry.ai.types.CargoAI`, Mindustry v159.7.
 */

import { byItemId, TICKS } from "./core.js";
import { Flyer, driftOn, flyTo, within } from "./units.js";

const TILE = 8;

/** `CargoAI`'s constants, which are on the class rather than on any block. */
const TRANSFER_RANGE = 20;
const MOVE_RANGE = 6;
const MOVE_SMOOTHING = 20;
const DROP_SPACING = 90;
const RETARGET = 20;

const cargoLoader = {
  begin(build) {
    build.state.flyer = null;
    build.state.progress = 0;
    build.state.wants = 1;
    build.state.retarget = -Infinity;
    build.state.dropping = -Infinity;
    build.state.carrying = null;
    build.state.amount = 0;
    build.state.target = null;
  },

  acceptItem(build, source, item) {
    return build.items.total < build.itemCapacity;
  },

  acceptLiquid(build, source, liquid) {
    return Boolean(build.block.drinks?.includes(liquid))
      && build.liquids.get(liquid) < build.liquidCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);

    // `shouldConsume` is `unit == null`: once its unit is up, it asks for nothing.
    const building = !build.state.flyer;
    build.state.wants = building ? 1 : 0;

    let efficiency = building ? (block.power > 0 ? (build.state.power ?? 1) : 1) : 0;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      efficiency = Math.min(efficiency, build.liquids.get(liquid) / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));

    if (building) {
      for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
        build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
      }
      build.state.progress = Math.fround(build.state.progress
        + Math.fround(delta * efficiency / (block.unit_build_time || 480)));
      if (build.state.progress >= 1) {
        build.state.progress = 0;
        build.state.flyer = new Flyer(
          world.catalogue?.units?.[block.unit_type] || {},
          build.x * TILE, build.y * TILE);
      }
      return;
    }

    ferry(build, world, step);
  },
};

/** `CargoAI.updateMovement`, which is the whole of what this pair is worth. */
function ferry(build, world, step) {
  const flyer = build.state.flyer;
  const delta = build.delta(step);
  driftOn(flyer, delta);

  if (!build.state.carrying) {
    flyTo(flyer, build.x * TILE, build.y * TILE, MOVE_RANGE, MOVE_SMOOTHING, delta);
    if (!build.items.total) return;
    if (!within(flyer, build.x * TILE, build.y * TILE, TRANSFER_RANGE)) return;
    if (world.tick - build.state.retarget < RETARGET) return;
    build.state.retarget = world.tick;

    const found = pickUp(build, world);
    if (!found) return;
    build.state.target = found.at;
    build.state.carrying = found.item;
    build.state.amount = Math.min(flyer.type.item_capacity || 0,
                                  build.items.get(found.item));
    build.items.remove(found.item, build.state.amount);
    return;
  }

  const at = build.state.target;
  if (!at) { build.state.carrying = null; return; }

  flyTo(flyer, at.x * TILE, at.y * TILE, MOVE_RANGE, MOVE_SMOOTHING, delta);
  if (!within(flyer, at.x * TILE, at.y * TILE, TRANSFER_RANGE)) return;
  if (world.tick - build.state.dropping < DROP_SPACING) return;
  build.state.dropping = world.tick;

  // `acceptStack`, which is however much of it the point has room for.
  const room = Math.max(0, at.itemCapacity - at.items.total);
  const moved = Math.min(room, build.state.amount);
  if (moved > 0) {
    at.items.add(build.state.carrying, moved);
    build.state.amount -= moved;
  }
  if (build.state.amount <= 0) {
    build.state.carrying = null;
    build.state.target = null;
  }
}

/**
 * `findAnyTarget`: the item the loader has **most** of that some point is set to.
 *
 * Sorted descending by how much is held, and among the points set to that item the first
 * one that is not stale. A point nobody has configured is a point no unit will ever fly to,
 * which is the mistake this block is famous for.
 */
function pickUp(build, world) {
  const points = world.builds.filter((other) => other.role === "cargo-unload");
  if (!points.length) return null;

  const held = byItemId(build, [...build.items.counts.keys()])
    .filter((item) => build.items.get(item) > 0)
    .sort((a, b) => build.items.get(b) - build.items.get(a));

  for (const item of held) {
    const open = points.filter((one) => one.node.configured === item);
    for (const one of open) if (!one.state.stale) return { item, at: one };
    if (open.length) return { item, at: open[0] };
  }
  return null;
}

/**
 * An unload point: it holds what was flown in and hands it round.
 *
 * `stale` is the interesting half. A point that has been full for six seconds is marked and
 * the units stop flying to it, so a blocked branch of a base stops starving the others
 * rather than sending every load into the same dead end.
 */
const cargoUnload = {
  begin(build) {
    build.state.stale = false;
    build.state.staleTimer = 0;
    build.state.dumpAccum = 0;
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const delta = build.delta(step);
    if (build.items.total < build.itemCapacity) {
      build.state.staleTimer = 0;
      build.state.stale = false;
    }

    let moved = false;
    build.state.dumpAccum += delta;
    while (build.state.dumpAccum >= 1) {
      moved = build.dump() || moved;
      build.state.dumpAccum -= 1;
    }

    if (moved) {
      build.state.staleTimer = 0;
      build.state.stale = false;
    } else if (build.items.total >= build.itemCapacity) {
      build.state.staleTimer += delta;
      if (build.state.staleTimer >= (build.block.stale_time || 360)) {
        build.state.stale = true;
      }
    }
  },
};

export const CARGO = {
  "cargo-loader": cargoLoader,
  "cargo-unload": cargoUnload,
};
