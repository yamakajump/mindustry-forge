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

import { DIRECTIONS, TICKS } from "./core.js";
import { heatReaching } from "./machines.js";

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
/**
 * What a generator actually puts on the grid, per second.
 *
 * Not `power_out`, which is the figure the game prints on the block's own card: a turbine
 * condenser's card divides by the nine tiles of vent it expects to be standing on, so the
 * field is a ninth of what is written. Reading the printed figure and then multiplying by
 * the ground again is multiplying by nine twice.
 */
const output = (block) => block.power_production ?? block.power_out ?? 0;

export function gridsOf(world) {
  const onGrid = world.builds.filter((build) =>
    isNode(build) || build.block.power > 0 || output(build.block) > 0);

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
    // And a beam node's four beams, which carry no configuration at all.
    for (const other of beamsOf(build, world)) {
      if (owner.has(other)) join(build, other);
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

/**
 * `BeamNode.updateDirections`: what a beam node reaches.
 *
 * Four straight lines, one per direction, and the **first** block with power in each is
 * the one it links to. Nothing about it is configured, which is why a schematic full of
 * beam nodes carries no link information and why reading only a power node's saved links
 * leaves an Erekir base entirely unpowered.
 *
 * Two rules that read backwards. A wall does **not** stop a beam: only insulation does, and
 * a titanium wall is not insulated, so a beam passes straight through it. And a power node
 * in the way is skipped rather than linked, without stopping the scan: the beam carries on
 * to whatever is behind it.
 */
function beamsOf(build, world) {
  if (!build.block.range || build.block.kind !== "BeamNode") return [];

  const found = [];
  const offset = Math.trunc(build.size / 2);
  for (const [dx, dy] of DIRECTIONS) {
    for (let i = 1 + offset; i <= build.block.range + offset; i++) {
      const other = world.at(build.x + dx * i, build.y + dy * i);
      if (other?.block.insulated) break;
      if (other && (other.block.power > 0 || other.block.power_out > 0
                    || other.block.power_production > 0 || other.role === "power")
          && other.block.kind !== "PowerNode") {
        found.push(other);
        break;
      }
    }
  }
  return found;
}

/** One grid, and what it does every frame. */
export class Grid {
  constructor(builds) {
    this.builds = builds;
    this.producers = builds.filter((build) => output(build.block) > 0);
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
      made += output(build.block) / 60 * build.delta(step) * (build.state.running ?? 1);
    }

    let needed = 0;
    for (const build of this.consumers) {
      /* `ConsumePower.requestedPower` is `usage * (shouldConsume() ? 1 : 0)`: a block that
         is not consuming asks for **nothing**, rather than asking and going without.

         It matters more than it sounds. A turret with nothing to shoot at draws no power
         at all once it has finished reloading, and a bank of them counted as consumers
         invents a demand that dims the whole base in the report and not in the game. */
      needed += build.block.power / 60 * build.delta(step) * (build.state.wants ?? 1);
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
 * `Mathf.lerpDelta`, which is how the game eases anything towards anything.
 *
 * Frame rate independent in name only: `a + (b - a) * clamp(rate * Time.delta)`, so it
 * approaches its target without ever reaching it. Several blocks then snap the last
 * thousandth by hand, because otherwise a reactor never quite reaches full warmup.
 */
const lerp = (from, to, rate, step) =>
  from + (to - from) * Math.min(1, Math.max(0, rate * step));

/** `Mathf.approachDelta`: the same idea at a fixed speed rather than a fixed fraction. */
const approach = (from, to, speed) =>
  (from < to ? Math.min(to, from + speed) : Math.max(to, from - speed));

/**
 * `ConsumeGenerator`: a generator that burns something.
 *
 * The part a rate cannot express, and that this had wrong: **what it makes is not its
 * nameplate**. `productionEfficiency = efficiency * efficiencyMultiplier`, and for anything
 * with an item filter the multiplier is the flammability of whatever it drew. A combustion
 * generator makes 1.0 on coal, 1.15 on spore pods and 1.4 on pyratite; an RTG makes 0.6 on
 * phase fabric, not 1.
 *
 * And the multiplier sticks: `if(m > 0) efficiencyMultiplier = m`, so when the stock runs
 * out the generator finishes burning at that item's rate rather than falling back to one.
 *
 * Two more things fall out of the class and out of no rate table:
 * - `itemDurationMultipliers`: pyratite lasts three times as long, phase fabric fifteen.
 * - `consumeTriggerValid()`: an item consumer answers "satisfied" while something is still
 *   burning, so the generator does not cut out for the frame between two items.
 */
const burner = {
  begin(build) {
    build.state.burning = 0;
    build.state.running = 0;
    build.state.multiplier = 1;
    build.state.durationScale = 1;
    build.state.warmup = 0;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);

    /* `updateConsumption`, in the order the game runs it: every consumer reports, the
       smallest wins, and an item consumer reports one either because the stock is there or
       because `consumeTriggerValid()` says something is already burning. */
    let efficiency = 1;

    const named = Object.keys(block.input || {});
    const alight = build.state.burning > 0;
    const fuel = firstFuel(build);

    if (named.length) {
      for (const [item, amount] of Object.entries(block.input)) {
        if (!alight && build.items.get(item) < amount) efficiency = 0;
      }
    } else if (!alight && !fuel) {
      efficiency = 0;
    }

    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const held = build.liquid === liquid ? build.liquidAmount : 0;
      efficiency = Math.min(efficiency, held / wanted);
    }
    if (block.power > 0) efficiency = Math.min(efficiency, build.state.power ?? 1);
    efficiency = Math.max(0, Math.min(1, efficiency));

    // `updateEfficiencyMultiplier`, before the tile is updated and only when there is
    // something to read: the last item's worth is kept when the stock runs out.
    if (fuel) {
      const found = worth(build, fuel);
      if (found > 0) build.state.multiplier = found;
      if (efficiency > 0 && block.item_duration_multipliers) {
        build.state.durationScale = block.item_duration_multipliers[fuel] ?? 1;
      }
    }

    build.state.warmup = lerp(build.state.warmup, efficiency > 0 ? 1 : 0,
                              block.warmup_speed ?? 0.05, step);
    build.state.running = efficiency * build.state.multiplier;

    /* The item is taken at the **start** of a burn: `generateTime <= 0` means nothing is
       alight, and `consume()` then fires every consumer's trigger at once. */
    if (efficiency > 0 && build.state.burning <= 0) {
      if (named.length) {
        for (const [item, amount] of Object.entries(block.input)) {
          build.items.remove(item, amount);
        }
        build.state.burning = 1;
      } else if (fuel) {
        build.items.remove(fuel);
        build.state.burning = 1;
      }
    }

    // A liquid ingredient, drunk by the frame and scaled by how well it is running.
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      if (build.liquid === liquid) {
        build.liquidAmount = Math.max(
          0, build.liquidAmount - (rate / TICKS) * delta * efficiency);
      }
    }

    // And one that comes out, which is what a pyrolysis generator is for. A neoplasia
    // reactor that cannot get rid of its neoplasm kills itself; here it simply fills up.
    for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
      build.addLiquid(liquid, (rate / TICKS) * delta * build.state.running);
      build.dumpLiquid(liquid);
    }

    // `generateTime` runs down as a fraction of one item, last of all.
    if (build.state.burning > 0) {
      build.state.burning -= delta
        / ((block.craft_time || 120) * (build.state.durationScale || 1));
    }

    // `HeaterGenerator`: a burner with a face that gets hot.
    if (block.heat_output) {
      build.state.heat = approach(build.state.heat || 0,
                                  block.heat_output * efficiency,
                                  (block.warmup_rate ?? 0.15) * delta);
    }
  },
};

/** The item a filtered generator would draw: the lowest id it holds that passes the filter. */
function firstFuel(build) {
  const filter = build.block.accepts;
  if (!filter) return build.items.first();
  for (const item of filter) {
    if (build.items.get(item) > 0) return item;
  }
  return null;
}

/**
 * What burning one item is worth.
 *
 * `ConsumeItemFlammable` and `ConsumeItemRadioactive` both hand back the property they
 * filter on, and that number **is** the generator's output multiplier. The catalogue
 * writes it out per item, so nothing here has to know which subclass a block declared: a
 * generator that names its ingredient outright has no filter and no table, and makes its
 * nameplate figure whatever it is fed.
 */
const worth = (build, item) => build.block.item_worth?.[item] ?? 1;

/**
 * `ThermalGenerator`: a generator that reads the ground and nothing else.
 *
 * No consumers at all, so it runs at one forever, and `productionEfficiency` is simply the
 * sum of its attribute over the tiles it covers. **Uncapped**: a turbine condenser on nine
 * tiles of vent runs at nine, which is exactly why its own card divides by nine before
 * showing a number.
 */
const thermal = {
  begin(build) { build.state.running = 0; },

  update(build, world, step) {
    build.state.running = build.node.attrsum || 0;
    for (const [liquid, rate] of Object.entries(build.block.output_liquid || {})) {
      build.addLiquid(liquid, (rate / TICKS) * build.delta(step) * build.state.running);
      build.dumpLiquid(liquid);
    }
  },

  acceptLiquid() { return false; },
};

/** A generator that needs nothing at all: a solar panel, an RTG with no fuel to name. */
const freeGenerator = {
  begin(build) { build.state.running = 1; },
};

/**
 * `ImpactReactor`: the one block that produces and consumes on the same grid.
 *
 * It asks for 25 power a frame and gives back `130 * warmup^5`, so it is a net drain for
 * the first twenty seconds and a net gain after. The warmup creeps at 0.001 a frame and
 * falls at 0.01: a one second outage costs ten seconds of warmup, and that asymmetry is
 * the whole reason a reactor bank needs batteries.
 *
 * It is all or nothing on its ingredients, unlike every other generator here: below
 * `efficiency >= 0.9999` it does not slow down, it cools.
 */
const impact = {
  begin(build) {
    build.state.warmup = 0;
    build.state.running = 0;
    build.state.timer = Infinity;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);

    let efficiency = 1;
    for (const [item, amount] of Object.entries(block.input || {})) {
      if (build.items.get(item) < amount) efficiency = 0;
    }
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const held = build.liquid === liquid ? build.liquidAmount : 0;
      efficiency = Math.min(efficiency, held / wanted);
    }
    const status = build.state.power ?? 1;
    efficiency = Math.min(efficiency, status);

    if (efficiency >= 0.9999 && status >= 0.99) {
      build.state.warmup = lerp(build.state.warmup, 1, block.warmup_speed ?? 0.001, step);
      // Snapped by hand, because a lerp never arrives and the fifth power of 0.999 is
      // visibly short of full.
      if (Math.abs(build.state.warmup - 1) <= 0.001) build.state.warmup = 1;

      build.state.timer += delta;
      if (build.state.timer >= (block.item_duration || 140)) {
        build.state.timer = 0;
        for (const [item, amount] of Object.entries(block.input || {})) {
          build.items.remove(item, amount);
        }
      }
    } else {
      // Ten times faster down than up. Not a slip of the game's, a deliberate asymmetry.
      build.state.warmup = lerp(build.state.warmup, 0, 0.01, step);
    }

    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      if (build.liquid === liquid && efficiency > 0) {
        build.liquidAmount = Math.max(
          0, build.liquidAmount - (rate / TICKS) * delta * efficiency);
      }
    }

    build.state.running = build.state.warmup ** 5;
  },
};

/**
 * `NuclearReactor`: output proportional to how full it is.
 *
 * `productionEfficiency = items.get(thorium) / itemCapacity`. A reactor holding fifteen
 * thorium of thirty makes **half** its rated power, which no rate table says and which is
 * an eleven per cent error over thirty seconds on a reactor left to empty.
 *
 * Its cooling is hand rolled and sits outside the consumer system: it takes whatever
 * liquid it happens to be holding rather than the one its filter names, and `.update(false)`
 * keeps the consumer from touching it. Uncooled it heats at 0.02 a frame and dies at one:
 * fifty frames from full power to gone.
 */
const nuclear = {
  begin(build) {
    build.state.heat = 0;
    build.state.running = 0;
    build.state.timer = Infinity;
    build.state.dead = false;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    if (build.state.dead) { build.state.running = 0; return; }

    const block = build.block;
    const delta = build.delta(step);
    const fuel = block.fuel_item || Object.keys(block.input || {})[0];
    const held = fuel ? build.items.get(fuel) : 0;

    if (held > 0) {
      const fullness = held / build.itemCapacity;
      build.state.running = fullness;
      build.state.heat += fullness * (block.heating || 0) * Math.min(delta, 4);
      build.state.timer += delta;
      if (build.state.timer >= (block.item_duration || 360)) {
        build.state.timer = 0;
        build.items.remove(fuel);
      }
    } else {
      build.state.running = 0;
      build.state.heat = Math.max(
        0, build.state.heat - delta / (block.ambient_cooldown_time || 1200));
    }

    // Cooling, by hand: whatever is in the tank, at `coolantPower` per unit.
    const power = block.coolant_power || 0.5;
    if (build.state.heat > 0 && build.liquidAmount > 0) {
      const used = Math.min(build.liquidAmount, build.state.heat / power);
      build.state.heat -= used * power;
      build.liquidAmount = Math.max(0, build.liquidAmount - used);
    }

    build.state.heat = Math.min(1, Math.max(0, build.state.heat));
    if (build.state.heat >= 0.999) {
      // `kill()`. The block is gone, and so is everything that was inside it: a reactor
      // that overheated does not sit there holding twenty five thorium.
      build.state.dead = true;
      build.state.running = 0;
      build.items.clear();
      build.liquidAmount = 0;
    }
  },
};

/**
 * `VariableReactor`: a flux reactor, which runs at whatever fraction of its heat it has.
 *
 * `efficiency *= clamp(heat / maxHeat)`, applied in `updateEfficiencyMultiplier`, so cold
 * it produces nothing **and drinks nothing**. Fed coolant but no heat it sits there
 * indefinitely; fed heat but no coolant it grows unstable at 1/180 a frame and kills itself
 * in three seconds.
 *
 * The heat it reads is last frame's, because consumption is worked out before the tile is
 * updated. One frame, and it shows at the moment it is placed.
 */
const variable = {
  begin(build) {
    build.state.heat = 0;
    build.state.instability = 0;
    build.state.running = 0;
    build.state.dead = false;
  },

  update(build, world, step) {
    if (build.state.dead) { build.state.running = 0; return; }

    const block = build.block;
    const delta = build.delta(step);
    const target = Math.min(1, Math.max(0, (build.state.heat || 0) / (block.max_heat || 1)));

    let efficiency = 1;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const has = build.liquid === liquid ? build.liquidAmount : 0;
      efficiency = Math.min(efficiency, has / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));

    const met = Math.min(1, target < 1e-7 ? 1 : efficiency / target);
    const happy = met >= 0.99999;
    build.state.instability = approach(build.state.instability, happy ? 0 : 1,
      (happy ? 0.5 : (block.unstable_speed || 0) * (1 - met)) * delta);

    efficiency *= target;

    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      if (build.liquid === liquid) {
        build.liquidAmount = Math.max(
          0, build.liquidAmount - (rate / TICKS) * delta * efficiency);
      }
    }

    build.state.running = efficiency;
    if (build.state.instability >= 1) {
      build.state.dead = true;
      build.state.running = 0;
      build.items.clear();
      build.liquidAmount = 0;
    }

    // Read for next frame, which is when the consumption pass will look at it.
    build.state.heat = heatReaching(build);
  },
};

export const POWER = {
  burner,
  freeGenerator,
  thermal,
  impact,
  nuclear,
  variable,
};
