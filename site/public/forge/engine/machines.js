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

  // `HeatCrafterBuild.shouldConsume`: no heat at all means it does not run, however much
  // of everything else it is holding.
  if (block.heat_requirement > 0 && !(build.state.heat > 0)) return 0;

  let efficiency = 1;
  for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
    /* `ConsumeLiquid.efficiency`, worked out as the game does it, with efficiency taken as
       one for the purposes of the sum.

       The catalogue writes every liquid rate per second, because that is the unit the rest
       of the site reads them in; the game counts per frame. Sixty apart, and the mistake
       does not show as a stall: a tank still holds more than a frame's worth, so the
       machine runs and the tank drains sixty times too fast. */
    const wanted = (rate / TICKS) * build.delta(step);
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
 * How much heat reaches this block, from the faces touching it.
 *
 * `Building.calculateHeat`. Heat is Erekir's third network and it travels like neither of
 * the other two: not on a belt and not on a grid, but from one block's face to the face
 * pressed against it. A producer has to be **facing** the block it heats, and a heat
 * router has to be facing away, which is what stops a ring of them from feeding itself.
 *
 * Divided by the producer's size and multiplied by how many tiles of it are in contact, so
 * a small block against the side of a big one gets a share rather than the lot.
 */
function heatReaching(build) {
  let heat = 0;
  for (const other of build.proximity) {
    const made = other.state?.heat || 0;
    if (made <= 0) continue;

    const split = Boolean(other.block.split_heat);
    const towards = (build.relativeTo(other) + 2) % 4;
    // A producer must face us; a splitter must face away.
    if (other.block.rotate) {
      if (split ? build.relativeTo(other) === other.rotation
                : towards !== other.rotation) continue;
    }

    const gap = Math.min(Math.abs(other.x - build.x), Math.abs(other.y - build.y));
    const contact = Math.min(
      Math.trunc(build.size / 2 + other.size / 2 - gap),
      Math.min(other.size, build.size));

    heat += (made / other.size) * Math.max(1, contact) / (split ? 3 : 1);
  }
  return heat;
}

/**
 * A block that only passes heat on: a redirector, or a router that splits it three ways.
 *
 * It holds nothing and makes nothing. Whatever reaches its face leaves by the face it
 * points at, which is why a chain of them carries heat across a base.
 */
const heatConductor = {
  begin(build) { build.state.heat = 0; },
  update(build) { build.state.heat = heatReaching(build); },
};

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

    // Heat arrives before anything is decided, because it is what decides how fast this
    // runs and, for a crafter that needs it, whether it runs at all.
    if (block.heat_requirement) build.state.heat = heatReaching(build);

    const efficiency = efficiencyOf(build, step);

    if (efficiency > 0) {
      /* Two boosts that look alike and are not.
      
         Heat is `efficiencyScale`, and the game multiplies **`efficiency` itself** by it,
         so everything a crucible does scales together: it crafts faster, it drinks faster,
         it pours faster.
      
         The ground is not. `AttributeCrafter` overrides `getProgressIncrease` and nothing
         else, so a cultivator on spore moss crafts at 2.2 times the rate and still drinks
         its eighteen water a second. Told to scale both, the port had it drinking 2.2
         times as fast and settled four tenths of a unit low against the engine, which is
         what a tank in equilibrium is: one tick of its own consumption short of full. */
      const drink = build.delta(step) * efficiency * heatScale(build)
        * (block.scale_liquid_consumption ? groundScale(build) : 1);
      const delta = build.delta(step) * efficiency * heatScale(build) * groundScale(build);
      build.state.progress += delta / (block.craft_time || 1);

      // A liquid comes out continuously rather than in a batch: half a craft's worth of
      // progress is half a craft's worth of liquid, already in the tank.
      // `getProgressIncrease(1f)`, so it follows the craft and not the drink.
      for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
        build.addLiquid(liquid, (rate / TICKS) * delta);
      }
      // And what it drinks is drunk continuously too. `ConsumeLiquid.update`.
      for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
        if (build.liquid === liquid) {
          build.liquidAmount = Math.max(0, build.liquidAmount - (rate / TICKS) * drink);
        }
      }
    }

    if (build.state.progress >= 1) craft(build);
    dumpOutputs(build, step);

    // And a producer's own heat, which creeps towards what it makes at a fixed rate
    // whatever its efficiency: `heat = approachDelta(heat, heatOutput * efficiency, rate)`.
    if (block.heat_output) {
      build.state.heat = approach(build.state.heat || 0,
                                  block.heat_output * efficiency,
                                  (block.warmup_rate ?? 0.15) * build.delta(step));
    }
  },
};

/**
 * `AttributeCrafter.efficiencyMultiplier`: what the ground it stands on is worth.
 *
 * `baseEfficiency + min(maxBoost, boostScale * attrsum)`. Note that `maxBoost` caps the
 * boost and not the whole multiplier: a cultivator with a base of one and a maximum boost
 * of two tops out at three, not two. And a base of zero is a real value, not a missing
 * one: a vent condenser off a vent makes nothing at all.
 *
 * `attrsum` is worked out once, when the block is laid down, because that is when the game
 * works it out. Painting the ground under a block that is already standing changes
 * nothing, in the game or here.
 *
 * The game adds `attribute.env()` on top, which is a rule of the planet rather than of the
 * tile: on Erekir every heat attribute is worth another 0.8. No block in the game is both
 * an attribute crafter and on Erekir with the heat attribute, so there is nothing to add
 * here, and a schematic has no planet to read it from anyway.
 */
function groundScale(build) {
  if (!build.block.attribute) return 1;
  const boost = Math.min(build.block.max_boost ?? 1,
                         (build.block.boost_scale ?? 1) * (build.node.attrsum || 0));
  return (build.block.base_efficiency || 0) + boost;
}

/** `HeatCrafterBuild.efficiencyScale`: what the heat it is getting is worth. */
function heatScale(build) {
  const wanted = build.block.heat_requirement;
  if (!wanted) return 1;
  const heat = build.state.heat || 0;
  const over = Math.max(heat - wanted, 0);
  return Math.min(
    Math.min(heat, wanted) / wanted + (over / wanted) * (build.block.overheat_scale ?? 1),
    build.block.max_efficiency ?? 4);
}

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

/**
 * A separator, which pulls one item out of a weighted list per batch.
 *
 * Its draw is not a stream. Every draw re-seeds one shared generator from a counter the
 * block keeps, so what comes out of the nth batch is a pure function of n and of where the
 * block stands: `Mathf.randomSeed(seed++, 0, sum - 1)`, with the counter started from
 * `tile.pos()`. Reproducing the mix therefore means reproducing xorshift128+ exactly, in
 * sixty four bit integers.
 *
 * Reproducing the **total** does not: every batch yields exactly one item whatever it lands
 * on, so a disassembler's throughput is known even when its mix is not.
 *
 * Source: `mindustry.world.blocks.production.Separator`, v159.7.
 */
const separator = {
  begin(build) {
    build.state.progress = 0;
    build.state.dumpTimer = 0;
    build.state.seed = null;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    // `created()`, deferred: a block does not know where it stands until the world does.
    if (build.state.seed === null) {
      build.state.seed = randomSeed(BigInt(world.packed(build)), 0, 2147483646);
    }

    /* `shouldConsume` counts only what it has made, not what it was given: a disassembler
       holding twenty scrap is not a full disassembler. Counted naively it stops itself. */
    let held = build.items.total;
    for (const item of Object.keys(build.block.input || {})) held -= build.items.get(item);

    const efficiency = held < build.itemCapacity ? efficiencyOf(build, step) : 0;
    if (efficiency > 0) {
      build.state.progress += build.delta(step) * efficiency / (build.block.craft_time || 1);
    }

    if (build.state.progress >= 1) {
      build.state.progress %= 1;

      const results = build.block.results || [];
      const sum = results.reduce((total, one) => total + one.amount, 0);
      const drawn = randomSeed(BigInt(build.state.seed++), 0, sum - 1);

      let seen = 0;
      let picked = null;
      for (const one of results) {
        if (drawn >= seen && drawn < seen + one.amount) { picked = one.item; break; }
        seen += one.amount;
      }

      // The ingredients go whatever happens: a separator whose buffer is full for the item
      // it drew eats its scrap and its slag and puts nothing out.
      for (const [item, amount] of Object.entries(build.block.input || {})) {
        build.items.remove(item, amount);
      }
      if (picked && build.items.get(picked) < build.itemCapacity) build.offload(picked);
    }

    for (const [liquid, rate] of Object.entries(build.block.input_liquid || {})) {
      if (efficiency > 0 && build.liquid === liquid) {
        build.liquidAmount = Math.max(
          0, build.liquidAmount - (rate / TICKS) * build.delta(step) * efficiency);
      }
    }

    const every = build.block.dump_time || 5;
    build.state.dumpTimer += build.delta(step);
    if (build.state.dumpTimer >= every) {
      build.state.dumpTimer = 0;
      build.dump();
    }
  },

  /** `Separator.canDump`: it never hands its own ingredients back out. */
  canDump(build, other, item) {
    return !(item in (build.block.input || {}));
  },
};

/**
 * `Mathf.randomSeed`, bit for bit.
 *
 * The game re-seeds one shared `Rand` for every draw, so a draw is a pure function of its
 * seed. Reproducing it needs the exact murmur hash and the exact xorshift, in sixty four
 * bit integers: a double loses the low bits of a multiply, so this is `BigInt` throughout
 * and there is no shortcut.
 */
const MASK = (1n << 64n) - 1n;

/** `Rand.murmurHash3`, which is what turns one seed into a state. */
function murmur(x) {
  let value = x & MASK;
  value ^= value >> 33n;
  value = (value * 0xff51afd7ed558ccdn) & MASK;
  value ^= value >> 33n;
  value = (value * 0xc4ceb9fe1a85ec53n) & MASK;
  value ^= value >> 33n;
  return value;
}

/** `Mathf.isPowerOfTwo`. */
const powerOfTwo = (value) => value !== 0 && (value & (value - 1)) === 0;

function randomSeed(seed, min, max) {
  // `Rand.setSeed`: a seed of zero is replaced, because murmur of zero is zero and the
  // generator would be stuck on it forever.
  let s0 = murmur(seed === 0n ? (-(1n << 63n)) & MASK : seed & MASK);
  let s1 = murmur(s0);

  const nextLong = () => {
    let a = s0;
    const b = s1;
    s0 = b;
    a = (a ^ ((a << 23n) & MASK)) & MASK;
    s1 = (a ^ b ^ (a >> 17n) ^ (b >> 26n)) & MASK;
    return (s1 + b) & MASK;
  };

  // `Mathf.randomSeed` throws one draw away when the **bound** is a power of two, which
  // shifts every draw after it. Note it tests `max`, not the size of the range.
  if (powerOfTwo(max)) nextLong();

  const range = BigInt(max - min) + 1n;
  for (;;) {
    // `Rand.nextLong(n)`: rejection sampling, and the rejection test is a signed overflow
    // check, so it reads as "did the sum stay below two to the sixty three".
    const bits = nextLong() >> 1n;
    const value = bits % range;
    if (bits - value + (range - 1n) < (1n << 63n)) return Number(value) + min;
  }
}

export const MACHINES = {
  crafter,
  drill,
  separator,
  "heat-conductor": heatConductor,
  "unit-factory": unitFactory,
};
