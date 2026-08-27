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
import { moveOutPayload } from "./payloads.js";

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

  /* `shouldConsumePower` goes false as soon as any consumer that is **not** the power one
     reports nothing, and a block that is not consuming power asks the grid for **zero**
     rather than asking and going without.

     It matters more than it sounds. A smelter with no sand asked for its thirty six a
     second all the same, so three smelters of which two were dry read as a grid at two
     thirds coverage and the one that could run ran at two thirds. The game runs it at
     full. Written here rather than in each machine because every one of them goes through
     this function. */
  build.state.wants = 0;

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
    const held = build.liquids.get(liquid);
    efficiency = Math.min(efficiency, held / wanted);
    if (efficiency <= 0) return 0;
  }

  // Everything but the grid is satisfied, so it does ask for its power.
  build.state.wants = shouldConsume(build) ? 1 : 0;

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
  /* Un seul reservoir de sortie plein n'arrete pas la machine.

     `dumpExtraLiquid` vaut vrai par defaut : le bloc tourne tant qu'**un** de ses liquides
     a de la place, et le surplus des autres est perdu. Un seul bloc du jeu sort deux
     liquides, l'electrolyseur, et c'est le montage courant de ne taper que l'ozone : son
     hydrogene sature en huit secondes, apres quoi le jeu continue a quatre ozone la seconde
     pour toujours et le portage tombait a zero en bloquant tout l'aval. */
  const outputs = Object.keys(build.block.output_liquid || {});
  if (outputs.length && !build.block.ignore_liquid_fullness) {
    let allFull = true;
    for (const liquid of outputs) {
      if (build.liquids.get(liquid) >= build.liquidCapacity - 0.001) {
        if (build.block.no_dump_extra) return false;
      } else {
        allFull = false;
      }
    }
    if (allFull) return false;
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
export function heatReaching(build) {
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
      const delta = build.delta(step) * efficiency * heatScale(build) * groundScale(build)
        * liquidRoomScale(build, efficiency, step);
      build.state.progress += delta / (block.craft_time || 1);

      // A liquid comes out continuously rather than in a batch: half a craft's worth of
      // progress is half a craft's worth of liquid, already in the tank.
      // `getProgressIncrease(1f)`, so it follows the craft and not the drink.
      for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
        build.addLiquid(liquid, (rate / TICKS) * delta);
      }
      // And what it drinks is drunk continuously too. `ConsumeLiquid.update`.
      for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
        build.liquids.remove(liquid, (rate / TICKS) * drink);
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
 * What a booster liquid is worth this frame, between nothing and one.
 *
 * `optionalEfficiency` in the game, and it is **capped by the block's real efficiency**:
 * `optionalEfficiency = min(optionalEfficiency, minEfficiency)`, where the minimum runs
 * over every mandatory consumer and not only over the grid. A bore full of hydrogen on a
 * grid at half coverage gets half the boost, and a bore short of the liquid it actually
 * needs gets that fraction of it too.
 */
function boostShare(build, step, capped = null) {
  let share = 1;
  let any = false;
  for (const [liquid, rate] of Object.entries(build.block.boost_liquid || {})) {
    const wanted = (rate / TICKS) * build.delta(step);
    if (wanted <= 0) continue;
    any = true;
    share = Math.min(share, build.liquids.get(liquid) / wanted);
  }
  if (!any) return 0;
  const cap = capped ?? (build.block.power > 0 ? (build.state.power ?? 1) : 1);
  return Math.max(0, Math.min(share, cap));
}

/** And drinking it, at whatever share it got. */
function drinkBoost(build, step, share) {
  for (const [liquid, rate] of Object.entries(build.block.boost_liquid || {})) {
    build.liquids.remove(liquid, (rate / TICKS) * build.delta(step) * share);
  }
}

/**
 * How much a nearly full output tank slows a machine down.
 *
 * `getProgressIncrease` divides by how many frames' worth of room is left in each output
 * tank, and takes the **largest** of them when the block is willing to throw the surplus
 * away. So a crafter with one tank tapped and one full does not stop and does not run at
 * full pace either: it runs at whatever the tapped one can take.
 */
function liquidRoomScale(build, efficiency, step) {
  const outputs = Object.entries(build.block.output_liquid || {});
  if (!outputs.length || build.block.ignore_liquid_fullness) return 1;

  const edelta = build.delta(step) * efficiency;
  let smallest = 1;
  let largest = 0;
  for (const [liquid, rate] of outputs) {
    const room = build.liquidCapacity - build.liquids.get(liquid);
    const worth = room / ((rate / TICKS) * edelta);
    smallest = Math.min(smallest, worth);
    largest = Math.max(largest, worth);
  }
  return build.block.no_dump_extra ? smallest : Math.min(largest, 1);
}

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
  /* Chaque liquide par sa face, quand le bloc les nomme : l'ozone de l'electrolyseur sort
     par la face relative 1 et l'hydrogene par la 3. Verses partout, un plan qui separe
     correctement les deux gaz les melange. */
  const faces = build.block.liquid_output_directions || [];
  Object.keys(build.block.output_liquid || {}).forEach((liquid, at) => {
    build.dumpLiquid(liquid, 2, faces.length > at ? faces[at] : -1);
  });
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

    /* The dump comes **first** in `Drill.updateTile`, before anything is drilled. It reads
       like housekeeping and it is not: a full drill dumps and then has room again in the
       same frame, where a drill that dumps last is full for one frame longer every cycle.
       On a drill with power to spare that is one item in forty seven over thirty seconds,
       which is exactly the gap `power-plenty` had been carrying. */
    dumpDrill(build, step);

    if (!dug || build.items.total >= build.itemCapacity) {
      build.state.warmup = approach(build.state.warmup, 0, speedUp * delta);
      return;
    }

    const delay = dug.each;

    /* A drill on a grid that cannot keep up drills slower, it does not stop. `speed` in
       `Drill.updateTile` is `lerp(1, liquidBoostIntensity, optionalEfficiency) * efficiency`:
       the grid's fraction, times whatever the water is worth.

       The water half was missing entirely. A laser drill accepted it, filled up, never
       drank it and got nothing for it: a pipe laid over a drill farm changed no number in
       the report, where the game gives sixty per cent more. */
    const grid = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    const wet = boostShare(build, step, grid);
    const speed = (1 + ((build.block.liquid_boost ?? 1) - 1) * wet) * grid;
    drinkBoost(build, step, wet);
    if (speed <= 0) {
      build.state.warmup = approach(build.state.warmup, 0, speedUp * delta);
      return;
    }

    build.state.wants = 1;
    build.state.warmup = approach(build.state.warmup, speed, speedUp * delta);
    build.state.progress += delta * dug.covered * speed * build.state.warmup;

    /* The cap is checked **once**, before the batch, and not per item. A drill with one
       slot left and three items owed offloads all three and ends the frame over its own
       capacity: the game says `items.total() < itemCapacity` on the way in and then loops
       without looking again. Checked per item instead, a saturated drill loses one item
       every few cycles, which is the whole of the gap `power-plenty` was carrying. */
    if (build.state.progress >= delay && build.items.total < build.itemCapacity) {
      const batch = Math.floor(build.state.progress / delay);
      for (let i = 0; i < batch; i++) build.offload(dug.resource);
      build.state.progress %= delay;
    }
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

    /* `shouldConsume` is `payload == null`: a factory still holding a finished unit asks
       the grid for nothing at all. */
    build.state.wants = build.state.payload ? 0 : 1;

    /* Everything the plan asks for and the grid's share of the power are one `efficiency`
       between them, and `progress += edelta()` is that efficiency times the frame. */
    let efficiency = plan ? (build.block.power > 0 ? (build.state.power ?? 1) : 1) : 0;
    for (const [item, amount] of Object.entries(plan?.requirements || {})) {
      if (build.items.get(item) < amount) efficiency = 0;
    }
    if (efficiency > 0) build.state.progress += build.delta(step) * efficiency;

    /* The cargo slides out **before** the next unit is considered, and it is a real wait:
       half the block's own width at seven tenths of a pixel a frame. What is in front
       decides where it goes: a payload block takes it, anything that is not solid gets it
       dropped beside it, and only a wall keeps it. */
    moveOutPayload(build, world);

    if (!plan || build.state.payload) {
      /* And this is the branch that costs a factory its work: `progress = 0f` runs every
         frame the cargo is still sitting there. A factory waiting for room does not pause,
         it starts over. */
      build.state.progress = 0;
      return;
    }

    if (build.state.progress >= plan.time) {
      build.state.progress %= 1;
      for (const [item, amount] of Object.entries(plan.requirements)) {
        build.items.remove(item, amount);
      }
      build.state.payload = plan.unit;
      build.state.payVector = [0, 0];
      build.state.payRotation = build.rotation * 90;
      build.state.wants = 0;
    }
    build.state.progress = Math.max(0, Math.min(build.state.progress, plan.time));
  },
};

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
      if (efficiency > 0) build.liquids.remove(liquid, (rate / TICKS) * build.delta(step) * efficiency);
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

/**
 * A plasma bore: Erekir's drill, which stands beside its ore rather than on it.
 *
 * What it makes is decided once, when it is placed: one item per tile of its own width
 * that has an ore wall within range, and nothing behind the first solid tile in each line.
 * After that it is a timer, and `time += edelta() * multiplier` produces the **whole**
 * facing at once rather than one item per cycle.
 *
 * Its hydrogen is a booster and not an ingredient: `optionalBoostIntensity` is 2.5, so a
 * bore with no hydrogen runs at two fifths of the speed rather than stopping. Reading it as
 * a requirement makes a working layout report as starved.
 */
const beamDrill = {
  begin(build) {
    build.state.time = 0;
    /* Started full, because the game's `Interval` is not a counter on the block: it
       compares against a global clock that is already at some large number, so the very
       first call to `timer(timerDump, ...)` fires. A bore that waits five frames for its
       first dump ends thirty seconds one item behind. */
    build.state.dumpTimer = Infinity;
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const block = build.block;
    const beam = build.node.beam;
    const delta = build.delta(step);

    build.state.dumpTimer += delta;
    if (build.state.dumpTimer >= (block.dump_time || 5)) {
      build.state.dumpTimer = 0;
      build.dump();
    }

    // `shouldConsume`: full, or pointed at nothing, and it stops asking for anything.
    if (!beam || build.items.total >= build.itemCapacity) return;

    let efficiency = block.power > 0 ? (build.state.power ?? 1) : 1;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const held = build.liquids.get(liquid);
      efficiency = Math.min(efficiency, held / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));
    if (efficiency <= 0) return;

    // And the optional half, which speeds it up rather than gating it, capped by what the
    // mandatory half is already worth.
    const boost = boostShare(build, step, efficiency);
    const multiplier = 1 + ((block.optional_boost_intensity ?? 1) - 1) * boost;

    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
    }
    drinkBoost(build, step, boost);

    const each = (block.drill_time || 200)
      / (block.drill_multipliers?.[beam.resource] ?? 1);
    build.state.time += delta * efficiency * multiplier;
    if (build.state.time >= each) {
      // One per line of sight, all in the same frame, and each one checked against the
      // cap on its own: a bore with one slot left and four lines fills the slot and drops
      // the other three.
      for (let i = 0; i < beam.count; i++) {
        if (build.items.total < build.itemCapacity) build.items.add(beam.resource);
      }
      build.state.time %= each;
    }
  },
};

/**
 * A cliff crusher: a drill that eats the cliff rather than the ground.
 *
 * Its speed is the sand attribute of whatever solid block is pressed against each tile of
 * its face, summed rather than averaged and with no cap: a two by two crusher against two
 * dune walls runs at four, and against two carbon walls at 1.4. Turned the other way it
 * runs at nothing at all, which is a thing a rate table cannot say.
 *
 * Its graphite is a booster on a clock of its own: one every `boostItemUseTime` ticks while
 * it is running, worth 1.6 times the speed, and it runs perfectly well without.
 */
const wallCrafter = {
  begin(build) {
    build.state.time = 0;
    build.state.dumpTimer = 0;
    build.state.boostTimer = Infinity;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);
    const made = Object.keys(block.output || {})[0];

    build.state.dumpTimer += delta;
    if (build.state.dumpTimer >= (block.dump_time || 5)) {
      build.state.dumpTimer = 0;
      build.dump();
    }

    let efficiency = block.power > 0 ? (build.state.power ?? 1) : 1;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const held = build.liquids.get(liquid);
      efficiency = Math.min(efficiency, held / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));

    // The two boosters, which the game says outright are not meant to be used together.
    const wet = boostShare(build, step, efficiency);
    const stocked = Object.keys(block.boost_input || {}).length > 0
      && Object.entries(block.boost_input).every(([item, n]) => build.items.get(item) >= n);

    const eff = (build.node.wallsum || 0)
      * (1 + ((block.liquid_boost ?? 1) - 1) * wet)
      * (stocked ? (block.item_boost ?? 1) : 1);

    // `shouldConsume`: it stops when it has nowhere to put what it makes, and only then.
    const room = made ? build.items.get(made) < build.itemCapacity : false;

    if (stocked && eff * efficiency > 0) {
      build.state.boostTimer += delta;
      if (build.state.boostTimer >= (block.boost_time || 120)) {
        build.state.boostTimer = 0;
        for (const [item, n] of Object.entries(block.boost_input)) build.items.remove(item, n);
      }
    }

    drinkBoost(build, step, wet);
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
    }

    if (!room || !made) return;
    build.state.time += delta * efficiency * eff;
    if (build.state.time >= (block.drill_time || 150)) {
      build.offload(made);
      build.state.time %= block.drill_time || 150;
    }
  },
};

/**
 * A burst drill, which is a drill with the ore on the wrong side of the multiplication.
 *
 * An ordinary drill covering nine tiles of ore runs nine times as **often**; a burst drill
 * runs at the same pace and produces nine at a time. The average is close and the shape is
 * not: a belt behind one gets a lump of nine every twelve seconds and nothing in between,
 * which is exactly what backs a line up and what a rate cannot show.
 *
 * `hardnessDrillMultiplier` is zero for the class, so hardness costs it nothing: an
 * eruption drill takes the same time on thorium as on beryllium.
 */
const burstDrill = {
  begin(build) {
    build.state.progress = 0;
    build.state.dumpTimer = 0;
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const block = build.block;
    const dug = build.node.dug;
    const delta = build.delta(step);

    build.state.dumpTimer += delta;
    if (build.state.dumpTimer >= (block.dump_time || 5)) {
      build.state.dumpTimer = 0;
      build.dump();
    }
    if (!dug) return;

    const batch = dug.covered;
    // `shouldConsume`: room for a **whole** burst, not for one item. A drill with eight
    // slots left and a burst of nine does not drill at all.
    if (build.items.total > build.itemCapacity - batch || batch <= 0) return;

    let efficiency = block.power > 0 ? (build.state.power ?? 1) : 1;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const held = build.liquids.get(liquid);
      efficiency = Math.min(efficiency, held / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));
    if (efficiency <= 0) return;

    const wet = boostShare(build, step);
    const speed = (1 + ((block.liquid_boost ?? 1) - 1) * wet) * efficiency;

    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
    }
    drinkBoost(build, step, wet);

    // No `dominantItems` here, unlike an ordinary drill: the ore count multiplies the
    // batch and not the clock.
    build.state.progress += delta * speed;

    // `BurstDrill.getDrillTime` is `drillTime / multiplier`, with no hardness term: the
    // class sets `hardnessDrillMultiplier` to zero and both blocks halve their time on
    // beryllium. Worked out once by the ground, so both halves of the repository agree.
    const each = dug.each;
    if (build.state.progress >= each && build.items.total < build.itemCapacity) {
      for (let i = 0; i < batch; i++) build.offload(dug.resource);
      build.state.progress %= each;
    }
  },
};

export const MACHINES = {
  crafter,
  "beam-drill": beamDrill,
  "wall-crafter": wallCrafter,
  "burst-drill": burstDrill,
  drill,
  separator,
  "heat-conductor": heatConductor,
  "unit-factory": unitFactory,
};
