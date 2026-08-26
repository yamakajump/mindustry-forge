/**
 * The power grid, ported from `mindustry.world.blocks.power.PowerGraph`.
 *
 * A grid is not a sum. Every frame it works out what is asked for and what is made, tops
 * one up from the batteries or tops the batteries up from the other, and then hands every
 * consumer the same fraction: `coverage`. That fraction is what a block's `efficiency`
 * means, so a smelter on a grid at seventy per cent smelts at seventy per cent, and it
 * slows down rather than stopping.
 *
 * The bit that surprises people, and that a sum cannot express: a battery is not a
 * reserve one machine draws on. It is charged and drained as a proportion of the whole
 * bank, so twenty batteries at half full behave as one big battery at half full, and a
 * base that dips below its demand dims **everything** at once rather than switching some
 * machines off.
 *
 * Grids are found rather than declared: anything with power that touches, plus whatever a
 * power node links to. A schematic can hold two grids that never meet, and reporting one
 * number for both is how a design with an isolated reactor reads as fine.
 */

import { TICKS } from "./core.js";

/** Blocks whose class is a wire or a battery: they carry the grid but ask nothing of it. */
const isNode = (build) => build.role === "power";

/**
 * A battery is a consumer with a buffer rather than a draw.
 *
 * `consumePowerBuffered` writes a usage of zero and a capacity, which is what tells the
 * two apart: a battery asks for nothing and holds a lot.
 */
const isBattery = (build) => isNode(build) && (build.block.power_capacity || 0) > 0;

/**
 * Which blocks are on the same grid.
 *
 * Two rules, both the game's: anything with power that touches is joined, and a power node
 * joins whatever it was linked to however far away that is. A node's links are stored on
 * both ends, so walking them from either side finds the same grid.
 */
export function gridsOf(world) {
  const onGrid = world.builds.filter((build) =>
    isNode(build) || build.block.power > 0 || build.block.power_out > 0);

  const owner = new Map(onGrid.map((build) => [build, build]));
  const find = (build) => {
    let at = build;
    while (owner.get(at) !== at) at = owner.get(at);
    return at;
  };
  const join = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) owner.set(ra, rb);
  };

  for (const build of onGrid) {
    // Touching, which is how a reactor beside a battery ends up on one grid.
    for (const near of build.proximity) {
      if (owner.has(near)) join(build, near);
    }
    // And whatever a node reaches, which is the other half and the one a schematic
    // usually relies on: a node in the middle wiring six things that touch nothing.
    const links = build.node.config?.type === 8 ? build.node.config.links : null;
    for (const packed of links || []) {
      const other = world.at(build.x + (packed >> 16), build.y + ((packed << 16) >> 16));
      if (other && owner.has(other)) join(build, other);
    }
  }

  const grids = new Map();
  for (const build of onGrid) {
    const root = find(build);
    if (!grids.has(root)) grids.set(root, []);
    grids.get(root).push(build);
  }
  return [...grids.values()].map((builds) => new Grid(builds));
}

/** One grid, and what it does every frame. */
export class Grid {
  constructor(builds) {
    this.builds = builds;
    this.producers = builds.filter((build) => build.block.power_out > 0);
    this.consumers = builds.filter((build) => build.block.power > 0);
    this.batteries = builds.filter(isBattery);

    for (const build of this.batteries) build.state.charge = 0;
    this.coverage = 0;
    this.made = 0;
    this.needed = 0;
  }

  get capacity() {
    return this.batteries.reduce(
      (sum, build) => sum + (build.block.power_capacity || 0), 0);
  }

  get stored() {
    return this.batteries.reduce(
      (sum, build) => sum + (build.state.charge || 0) * (build.block.power_capacity || 0), 0);
  }

  /**
   * `PowerGraph.update`, once a frame.
   *
   * Everything here is per frame rather than per second, because that is how the game
   * counts it: a generator's `powerProduction` is what it makes in one tick, and the whole
   * balance is struck sixty times a second.
   */
  update(step) {
    let made = 0;
    for (const build of this.producers) {
      // A generator only makes power when it is running, which for a burner means when it
      // has something to burn. `productionEfficiency` in the game; here it is whatever the
      // block's own behaviour worked out.
      made += build.block.power_out / 60 * build.delta(step) * (build.state.running ?? 1);
    }

    let needed = 0;
    for (const build of this.consumers) {
      needed += build.block.power / 60 * build.delta(step);
    }

    this.made = made;
    this.needed = needed;

    let produced = made;
    let charged = false;
    if (Math.abs(needed - produced) > 1e-7) {
      if (needed > produced) {
        produced += this.useBatteries(needed - produced);
      } else {
        charged = true;
        produced -= this.chargeBatteries(produced - needed);
      }
    }

    // `distributePower`: one fraction for everybody. This is the line that makes a whole
    // base dim together rather than some machines stopping.
    this.coverage = needed <= 1e-7 && produced <= 1e-7 && !charged && this.stored <= 1e-7
      ? 0
      : needed <= 1e-7 ? 1 : Math.min(1, produced / needed);

    for (const build of this.consumers) build.state.power = this.coverage;
  }

  /**
   * Drain the bank, evenly by proportion.
   *
   * Not "take from the fullest": every battery loses the same **share** of what it holds,
   * so a bank behaves as one battery however it is spread out.
   */
  useBatteries(needed) {
    const stored = this.stored;
    if (stored <= 1e-7) return 0;
    const used = Math.min(stored, needed);
    const share = Math.min(1, needed / stored);
    for (const build of this.batteries) build.state.charge *= 1 - share;
    return used;
  }

  /** And the other way: every battery gains the same share of the room it has left. */
  chargeBatteries(excess) {
    const room = this.batteries.reduce((sum, build) =>
      sum + (1 - (build.state.charge || 0)) * (build.block.power_capacity || 0), 0);
    if (room <= 1e-7) return 0;
    const share = Math.min(excess / room, 1);
    for (const build of this.batteries) {
      build.state.charge += (1 - build.state.charge) * share;
    }
    return Math.min(excess, room);
  }
}

/**
 * A generator that burns something.
 *
 * `ConsumeGenerator`: it holds an item, burns it over `itemDuration` frames, and makes
 * power the whole time. What it makes is its nameplate figure times how well it is running,
 * which is one while it has fuel and nothing when it does not.
 */
const burner = {
  begin(build) {
    build.state.burning = 0;
    build.state.running = 0;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const delta = build.delta(step);
    const duration = build.block.craft_time || 120;

    if (build.state.burning > 0) {
      build.state.burning -= delta;
      build.state.running = 1;
    } else if (build.items.total > 0) {
      // Whatever it was given: a burner names no ingredient, it takes anything flammable.
      const fuel = Object.keys(build.block.input || {})[0] || build.items.first();
      if (build.items.has(fuel)) {
        build.items.remove(fuel);
        build.state.burning = duration;
        build.state.running = 1;
      } else {
        build.state.running = 0;
      }
    } else {
      build.state.running = 0;
    }

    // A liquid ingredient, which a steam generator has alongside its coal. Per second in
    // the catalogue, per frame in the game: sixty apart, so the rate is converted here.
    for (const [liquid, rate] of Object.entries(build.block.input_liquid || {})) {
      const held = build.liquid === liquid ? build.liquidAmount : 0;
      const wanted = (rate / TICKS) * delta;
      if (held < wanted) {
        build.state.running = 0;
      } else {
        build.liquidAmount -= wanted;
      }
    }
  },
};

/** A generator that needs nothing at all: a solar panel, an RTG. */
const freeGenerator = {
  begin(build) { build.state.running = 1; },
};

export const POWER = {
  burner,
  freeGenerator,
};
