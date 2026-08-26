/**
 * The blocks that turn one thing into another, ported from the game's own classes.
 *
 * A factory is not a rate. It is a progress bar that fills at `edelta / craftTime`, empties
 * into a batch of output, and stops when it has nowhere to put the batch. That distinction
 * is the whole reason for simulating: a machine that is fed in bursts and a machine that is
 * fed steadily come out at the same rate on paper and behave nothing alike.
 *
 * Source: `mindustry.world.blocks.production.GenericCrafter` and the consumers under
 * `mindustry.world.consumers`, Mindustry v159.7.
 */

import { DIRECTIONS, TICKS } from "./core.js";

/**
 * How much of a frame this machine gets.
 *
 * `Building.updateConsumption`: the smallest of what each of its consumers reports, and
 * zero if it has nowhere to put what it would make. An item consumer answers all or
 * nothing; a liquid consumer answers the fraction of a frame's worth it is holding, which
 * is what makes a half-fed machine run at half speed rather than stopping.
 */
export function efficiencyOf(build, step) {
  const block = build.block;

  for (const [item, amount] of Object.entries(block.input || {})) {
    if (build.items.get(item) < amount) return 0;
  }

  let efficiency = 1;
  for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
    // `ConsumeLiquid.efficiency`, worked out as the game does it, with efficiency taken as
    // one for the purposes of the sum.
    const wanted = rate * build.delta(step);
    if (wanted <= 0) continue;
    const held = build.liquid === liquid ? build.liquidAmount : 0;
    efficiency = Math.min(efficiency, held / wanted);
    if (efficiency <= 0) return 0;
  }

  // And the grid, which hands every consumer the same fraction. A smelter on a grid at
  // seventy per cent smelts at seventy per cent: it slows down rather than stopping.
  if (block.power > 0) {
    efficiency = Math.min(efficiency, build.state.power ?? 1);
  }

  return shouldConsume(build) ? Math.min(1, efficiency) : 0;
}

/**
 * Whether there is room for what it would make.
 *
 * `GenericCrafterBuild.shouldConsume`. A press whose graphite has nowhere to go stops
 * eating coal, rather than eating it and losing the graphite, and a line behind a stopped
 * press backs up for exactly that reason.
 */
function shouldConsume(build) {
  for (const [item, amount] of Object.entries(build.block.output || {})) {
    if (build.items.get(item) + amount > build.itemCapacity) return false;
  }
  for (const liquid of Object.keys(build.block.output_liquid || {})) {
    const held = build.liquid === liquid ? build.liquidAmount : 0;
    if (held >= build.liquidCapacity - 0.001) return false;
  }
  return true;
}

/**
 * Any factory in the game.
 *
 * Seventeen blocks share this class on Serpulo alone, from a graphite press to a
 * cryofluid mixer, and they differ only in what they eat, how long they take and what they
 * leave behind.
 */
const crafter = {
  begin(build) {
    build.state.progress = 0;
    build.state.dumpTimer = 0;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const efficiency = efficiencyOf(build, step);

    if (efficiency > 0) {
      const delta = build.delta(step) * efficiency;
      build.state.progress += delta / (block.craft_time || 1);

      // A liquid comes out continuously rather than in a batch: half a craft's worth of
      // progress is half a craft's worth of liquid, already in the tank.
      for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
        build.addLiquid(liquid, rate * delta);
      }
      // And what it drinks is drunk continuously too. `ConsumeLiquid.update`.
      for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
        if (build.liquid === liquid) {
          build.liquidAmount = Math.max(0, build.liquidAmount - rate * delta);
        }
      }
    }

    if (build.state.progress >= 1) craft(build);
    dumpOutputs(build, step);
  },
};

/** One batch: eat the ingredients, hand out what was made, keep the remainder. */
function craft(build) {
  for (const [item, amount] of Object.entries(build.block.input || {})) {
    build.items.remove(item, amount);
  }
  for (const [item, amount] of Object.entries(build.block.output || {})) {
    for (let i = 0; i < amount; i++) build.offload(item);
  }
  // The remainder carries over rather than being thrown away, which is what stops a
  // machine from losing a fraction of a craft every batch.
  build.state.progress %= 1;
}

/** `dumpOutputs`: try to hand on, at most once every `dumpTime` frames. */
function dumpOutputs(build, step) {
  const every = build.block.dump_time || 5;
  build.state.dumpTimer += build.delta(step);
  if (build.state.dumpTimer < every) return;
  build.state.dumpTimer = 0;

  for (const item of Object.keys(build.block.output || {})) build.dump(item);
  for (const liquid of Object.keys(build.block.output_liquid || {})) {
    build.dumpLiquid(liquid);
  }
}

/**
 * A drill.
 *
 * What it pulls up is decided by the ground under it: the analysis works out which ore the
 * most of its tiles hold and how many, and the rest is the game's own arithmetic. One item
 * comes out every `(drillTime + hardnessDrillMultiplier * hardness) / covered` frames.
 *
 * `warmup` is the part worth transcribing rather than rounding off. A drill does not start
 * at full speed: it creeps up at `warmupSpeed` a frame, so the first second and a bit is
 * spent getting there, and a short measurement that ignores it reads a few per cent fast.
 */
const drill = {
  begin(build) {
    build.state.progress = 0;
    build.state.warmup = 0;
    build.state.dumpTimer = 0;
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const dug = build.node.dug;
    const delta = build.delta(step);
    const speedUp = build.block.warmup_speed ?? 0.015;

    if (!dug || build.items.total >= build.itemCapacity) {
      build.state.warmup = approach(build.state.warmup, 0, speedUp * delta);
      dumpDrill(build, step);
      return;
    }

    // `getDrillTime` over the covered tiles, which is what `yieldOf` already worked out:
    // its rate is `60 * covered / time`, so the delay between two items is the reciprocal.
    const delay = (60 * dug.covered) / dug.rate;

    /* A drill on a grid that cannot keep up drills slower, it does not stop. `speed` in
       `Drill.updateTile` is the consumption efficiency, and for a laser drill that is
       whatever fraction the grid is handing out. */
    const speed = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    if (speed <= 0) {
      build.state.warmup = approach(build.state.warmup, 0, speedUp * delta);
      dumpDrill(build, step);
      return;
    }

    build.state.warmup = approach(build.state.warmup, speed, speedUp * delta);
    build.state.progress += delta * dug.covered * speed * build.state.warmup;

    if (build.state.progress >= delay) {
      const batch = Math.floor(build.state.progress / delay);
      for (let i = 0; i < batch && build.items.total < build.itemCapacity; i++) {
        build.offload(dug.resource);
      }
      build.state.progress %= delay;
    }
    dumpDrill(build, step);
  },
};

function dumpDrill(build, step) {
  const every = build.block.dump_time || 5;
  build.state.dumpTimer += build.delta(step);
  if (build.state.dumpTimer < every) return;
  build.state.dumpTimer = 0;
  build.dump(build.items.first());
}

/** `Mathf.approachDelta`: move towards a target without overshooting it. */
function approach(from, to, by) {
  return from < to ? Math.min(to, from + by) : Math.max(to, from - by);
}

/**
 * A factory that makes units.
 *
 * The same shape as any other factory, with one difference that matters: what comes out is
 * not an item. It never reaches a belt and never reaches a container, so the only way to
 * count it is to count what is standing on the map afterwards.
 *
 * It carries a list of plans, one per unit it can make, and the schematic says which is
 * selected. A plan is a unit, how long it takes, and what it costs, so a factory's rate is
 * `60 / time` a second at best and whatever its ingredients allow in practice: the answer
 * to "how fast does this make daggers, and does my silicon keep up".
 */
const unitFactory = {
  begin(build) {
    build.state.progress = 0;
    build.state.made = 0;
    build.state.payload = null;
    build.state.plan = planOf(build);
  },

  acceptItem(build, source, item) {
    const plan = build.state.plan;
    if (!plan) return false;
    return item in plan.requirements && build.items.get(item) < roomFor(build, item);
  },

  update(build, world, step) {
    const plan = build.state.plan;
    if (!plan) return;

    /* A finished unit is held as a payload until there is somewhere to put it down, and
       the factory stops dead while it waits. `shouldConsume` is `payload == null`.
    
       This is not a detail. Measured against the engine, a factory boxed in on the side it
       faces built exactly one dagger and then sat on sixty silicon and forty lead for the
       rest of the run, and the port that ignored the payload happily built a second. */
    if (build.state.payload) {
      if (releasePayload(build, world)) build.state.made++;
      return;
    }

    // Everything the plan asks for, and the grid's share of the power.
    for (const [item, amount] of Object.entries(plan.requirements)) {
      if (build.items.get(item) < amount) return;
    }
    const power = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    if (power <= 0) return;

    build.state.progress += build.delta(step) * power;
    if (build.state.progress < plan.time) return;

    for (const [item, amount] of Object.entries(plan.requirements)) {
      build.items.remove(item, amount);
    }
    build.state.progress %= plan.time;
    build.state.payload = plan.unit;
    if (releasePayload(build, world)) build.state.made++;
  },
};

/**
 * Put a finished unit down, if there is room.
 *
 * `moveOutPayload` walks it out of the side the factory faces, which has to be clear of
 * buildings. A factory pointed into a wall builds one unit and stops.
 */
function releasePayload(build, world) {
  const [dx, dy] = DIRECTIONS[build.rotation];
  const size = build.size;
  const offset = Math.trunc(-(size - 1) / 2);
  const from = [build.x + offset + (dx > 0 ? size - 1 : 0),
                build.y + offset + (dy > 0 ? size - 1 : 0)];
  if (world.at(from[0] + dx, from[1] + dy)) return false;

  build.state.payload = null;
  return true;
}

/**
 * How much of one item a factory will hold.
 *
 * `getMaximumAccepted` reads a table built in `init` from **every** plan, not from the one
 * that is selected: twice the largest amount any of them asks for. A ground factory
 * building daggers therefore stops at sixty silicon and forty lead, because a nova wants
 * thirty silicon and twenty lead and a dagger wants ten of each.
 *
 * Capped at the block's own capacity instead, the port held sixty of both and a scenario
 * about a stalled factory disagreed by exactly those twenty lead.
 */
function roomFor(build, item) {
  let most = 0;
  for (const plan of build.block.plans || []) {
    most = Math.max(most, (plan.requirements[item] || 0) * 2);
  }
  return most;
}

/**
 * Which plan a factory is set to.
 *
 * The first one when nobody has said, which is a claim the measurement had to settle
 * twice. `currentPlan` is declared as -1 in the source, which reads like "an unconfigured
 * factory builds nothing", and on that reading the default was changed to none. The engine
 * then built a dagger out of a factory with no configuration at all, so the field is set
 * somewhere between placement and the first frame and the plain reading was wrong.
 *
 * Written down because it is the second time in this file that reading the source beat
 * measuring it, and lost.
 */
function planOf(build) {
  const plans = build.block.plans || [];
  if (!plans.length) return null;

  const config = build.node.config;
  if (config?.type === 1) return plans[config.value] || plans[0];
  if (config?.type === 5 && config.content === 6) {
    return plans.find((plan) => plan.unit_id === config.id) || plans[0];
  }
  return plans[0];
}

export const MACHINES = {
  crafter,
  drill,
  "unit-factory": unitFactory,
};
