/**
 * Everything that moves a liquid, ported from the game's own classes.
 *
 * Liquids do not travel like items. An item is handed from one block to the next and
 * either fits or does not; a liquid moves by pressure, a fraction at a time, and a settled
 * line has a gradient along it rather than a flat rate. That is why a pipe is never quite
 * full and why the far end of a long run is thinner than the near end.
 *
 * The one rule that catches everyone: a block holds one liquid at a time. `acceptLiquid`
 * is `liquids.current() == liquid || liquids.currentAmount() < 0.2f`, so a tank with water
 * in it refuses oil until it is nearly empty, and a schematic that mixes two liquids in
 * one pipe does not work in the game either.
 *
 * Source: `mindustry.world.blocks.liquid.*`, Mindustry v159.7.
 */

import { bridgeAccepts, bridgeDumps, bridgeLink, bridgeTarget, DIRECTIONS, TICKS }
  from "./core.js";

/**
 * A pipe.
 *
 * `ConduitBuild.updateTile` is two lines: if it is holding anything, push it at whatever
 * it points at. Directional, exactly like a belt, which is the thing that was wrong about
 * it for a long time here: treated as handing to all four sides, a line of pipes fed
 * itself in both directions and the last pipe of a run was never the end of anything.
 */
const conduit = {
  acceptLiquid(build, source, liquid) {
    /* `Conduit.acceptLiquid`: never from the block it points at, and one liquid at a time.
    
       Compared by block rather than by coordinates, which is the whole point. A tank is
       three across and stored at its middle, so the tile a pipe points at is not the tile
       the tank is filed under: the check missed, the pipe took its own water back every
       frame, and a line that filled correctly emptied into nothing. */
    if (source && build.facing(build.world) === source) return false;

    /* An armoured pipe refuses anything that is not part of the plumbing: a pump, a tank
       or a crafter beside one cannot pour into it, only a pipe, a liquid bridge or a
       junction can, plus whatever stands directly behind it.

       Note it accepts a **plain** conduit as readily as another armoured one: the check is
       on the class of pipe, not on the armour. That reads like an oversight and is not. */
    if (build.block.kind === "ArmoredConduit" && source) {
      const plumbing = ["Conduit", "ArmoredConduit", "DirectionLiquidBridge",
                        "LiquidJunction"].includes(source.block.kind);
      const behind = source.relativeTo(build) === build.rotation;
      const apart = !build.proximity.includes(source);
      if (!plumbing && !behind && !apart) return false;
    }

    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && build.liquidAmount < build.liquidCapacity;
  },

  update(build, world, step) {
    if (build.liquidAmount <= 0.0001) return;

    /* `moveLiquidForward(leaks, ...)`: a pipe pointing at open ground **spills**, two
       thirds of what it holds every frame, so it never fills up.

       The flag was in the catalogue and read by nothing. An open pipe at the end of a
       layout blocked the whole line here and drains continuously in the game, which
       inverts everything upstream: the pump behind it runs flat out in the game and stops
       on a full tank here. A plated conduit is the one that does not leak, and the one
       case this had right. */
    if (build.block.leaks && !build.facing(world)) {
      build.liquids.remove(build.liquids.current, build.liquids.currentAmount / 1.5);
      return;
    }
    build.moveLiquidForward(world, build.liquid);
  },
};

/**
 * A liquid router, which is also a tank and a container.
 *
 * Six blocks share this class: the router, the container, the tank and their reinforced
 * twins. They differ only in how much they hold, and holding more is what makes a tank a
 * buffer rather than a junction.
 */
const liquidRouter = {
  acceptLiquid(build, source, liquid) {
    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && build.liquidAmount < build.liquidCapacity;
  },

  update(build) {
    if (build.liquidAmount <= 0.0001) return;
    build.dumpLiquid(build.liquid);
  },
};

/**
 * A liquid junction.
 *
 * It has no tank at all. Asked where a liquid should go it answers with whatever is on the
 * far side, which may answer with the one beyond that, so a chain of them is crossed in
 * one step and never holds a drop. That is `getLiquidDestination`, and it is why two pipes
 * can cross without their contents ever meeting.
 */
const liquidJunction = {
  acceptLiquid() { return false; },

  liquidDestination(build, source, liquid, seen) {
    if (!source) return build;
    const side = build.relativeTo(source);
    const [dx, dy] = DIRECTIONS[(side + 2) % 4];
    const next = build.world?.at(build.x + dx, build.y + dy);
    if (!next) return build;
    if (!next.acceptLiquid(build, liquid) && next.behaviour !== liquidJunction) {
      return build;
    }
    return next.liquidDestination(build, liquid, seen + 1);
  },
};

/**
 * A liquid bridge.
 *
 * The same span an item bridge throws, carrying a liquid instead. It pushes at the tile it
 * remembers rather than at the one it touches, and unlinked it behaves as an ordinary
 * block and pushes round.
 */
const liquidBridge = {
  begin(build) { build.state.warmup = 0; },

  /* And the same `checkAccept` an item bridge has, which nothing here read: without a link
     a bridge conduit accepts from nobody except a bridge pointed at it, and with one it
     refuses whatever comes back through its own exit. A stray bridge conduit beside a tank
     drained it and spread the liquid round, where in the game nothing enters it at all. */
  acceptLiquid(build, source, liquid) {
    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && build.liquidAmount < build.liquidCapacity
      && bridgeAccepts(build, source);
  },

  update(build, world, step) {
    // `linkValid`: the same bridge at the far end, and not one pointed back here.
    const target = bridgeTarget(build);

    /* Warmup, which was missing entirely: it creeps towards `efficiency` at a thirtieth a
       frame and the beam carries nothing below a quarter. A phase conduit with no power
       carried everything here and nothing in the game; a powered one started seven and a
       half frames early. */
    if (target) {
      build.state.wants = 1;
      build.state.warmup = approachTo(build.state.warmup || 0,
        build.block.power > 0 ? (build.state.power ?? 1) : 1, build.delta(step) / 30);
      if (build.state.warmup >= 0.25 && build.liquids.currentAmount > 0.0001) {
        build.moveLiquid(target, build.liquids.current);
      }
      return;
    }

    build.state.warmup = 0;
    /* `doDump` passes **one**, not the default two: unlinked, a liquid bridge pours twice
       as hard as anything else. The error used to be hidden by `dumpLiquid` borrowing
       `moveLiquid`'s formula, which is why the two had to be fixed together. */
    if (build.liquids.currentAmount > 0.0001) {
      build.dumpLiquid(build.liquids.current, 1);
    }
  },

  /** `canDumpLiquid` is `checkDump`, the same one an item bridge uses. */
  canDumpLiquid(build, other) {
    return bridgeDumps(build, other);
  },
};

/** `Mathf.approachDelta`, which this file needed its own copy of. */
const approachTo = (from, to, speed) =>
  (from < to ? Math.min(to, from + speed) : Math.max(to, from - speed));

/**
 * A sandbox liquid source.
 *
 * `LiquidSourceBuild.updateTile` refills itself to the brim every frame and pushes: what
 * comes out is decided entirely by the pipe in front of it, which is what makes one useful
 * for measuring a pipe.
 */
const liquidSource = {
  update(build) {
    const liquid = build.node.configured;
    if (!liquid) return;
    build.liquids.add(liquid, build.liquidCapacity - build.liquids.get(liquid));
    build.dumpLiquid(liquid);
  },

  acceptLiquid() { return false; },
};

/**
 * A pump.
 *
 * What it draws is decided by the ground under it, which the analysis already works out:
 * `pumpAmount` per tile of liquid it covers, summed. It fills its own tank and pushes.
 */
const pump = {
  begin(build) { build.state.wants = 0; },

  update(build, world, step) {
    const dug = build.node.dug;
    if (!dug) return;
    const delta = build.delta(step);

    /* `edelta()`, and it was `delta()`.

       A rotary pump with no current pumped forty eight a second here and none at all in
       the game; a reinforced pump with no hydrogen pumped eighty and none, and the
       hydrogen upstream never moved either. A pump is a consumer like any other and it
       reads the same `efficiency` as a smelter does. */
    let efficiency = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    for (const [liquid, rate] of Object.entries(build.block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      efficiency = Math.min(efficiency, build.liquids.get(liquid) / wanted);
    }
    for (const [item, amount] of Object.entries(build.block.input || {})) {
      if (build.items.get(item) < amount) efficiency = 0;
    }
    efficiency = Math.max(0, Math.min(1, efficiency));
    build.state.wants = efficiency > 0 ? 1 : 0;

    if (efficiency > 0) {
      for (const [liquid, rate] of Object.entries(build.block.input_liquid || {})) {
        build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
      }
      const room = build.liquidCapacity - build.liquids.get(dug.resource);
      build.addLiquid(dug.resource,
                      Math.min(room, (dug.rate / TICKS) * delta * efficiency));
    }
    build.dumpLiquid(dug.resource);
  },

  /* And it takes what its own recipe names, which is `Building.acceptLiquid` and not the
     blanket refusal that was here: a reinforced pump could never receive its hydrogen, so
     the pipe feeding it filled and blocked everything upstream. */
  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },
};

/**
 * A reinforced bridge conduit: a liquid bridge with no configuration.
 *
 * Same idea as the duct bridge and the same trap. It links to the first of its own kind in
 * the direction it points, it pushes every frame rather than on a timer, and the receiving
 * end blocks the face the beam arrives on. Unlinked it dribbles forward instead.
 */
const liquidSpan = {
  begin(build) {
    build.state.occupied = [null, null, null, null];
  },

  acceptLiquid(build, source, liquid) {
    const link = bridgeLink(build);
    // Only if it has somewhere to send it, or the sender is the bridge feeding it.
    if (!link && !(source && bridgeLink(source) === build)) return false;
    const side = build.relativeTo(source);
    const held = build.state.occupied[(side + 2) % 4];
    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && side !== build.rotation
      && (!held || held === source);
  },

  update(build, world, step) {
    const link = bridgeLink(build);
    build.state.link = link;

    if (link) {
      if (build.liquidAmount > 0) build.moveLiquid(link, build.liquid);
      link.state.occupied[build.rotation % 4] = build;
    } else if (build.liquidAmount > 0.0001) {
      build.moveLiquidForward(world, build.liquid);
    }

    for (let i = 0; i < 4; i++) {
      const held = build.state.occupied[i];
      if (held && (held.rotation !== i || held.state.link !== build)) {
        build.state.occupied[i] = null;
      }
    }
  },
};

/**
 * A solid pump: water and oil squeezed out of dry ground.
 *
 * `fraction = validTiles + boost`, where `validTiles` is the count of tiles it may work on
 * times `baseEfficiency` over its own area, and `boost` is the ground attribute summed and
 * divided the same way. One number decides which of the two halves matters: a water
 * extractor has `baseEfficiency` 1, so it works on any dry ground and wet ground is a
 * bonus; an oil extractor has 0, so the sand under it is the **whole** output and one off
 * the sand makes nothing at all.
 *
 * A fracker eats one sand every `itemUseTime` ticks on top, on a counter of its own that
 * only advances while it is running.
 */
const solidPump = {
  begin(build) {
    build.state.used = 0;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);
    const made = Object.keys(block.output_liquid || {})[0];
    if (!made) return;

    const area = (block.size || 1) ** 2;
    const fraction = Math.max(0,
      (build.node.dry || 0) * (block.base_efficiency || 0) / area
      + (build.node.attrsum || 0) / area);

    /* `shouldConsume` is "is there room for the result", so a blocked oil extractor stops
       eating sand and drinking water and stops asking the grid for its hundred and eighty.
       Kept filling but never stopped consuming, it burned both for nothing. */
    let efficiency = build.liquids.get(made) < build.liquidCapacity - 0.01 ? 1 : 0;
    if (efficiency > 0 && block.power > 0) {
      efficiency = Math.min(efficiency, build.state.power ?? 1);
    }
    for (const [item, amount] of Object.entries(block.input || {})) {
      if (build.items.get(item) < amount) efficiency = 0;
    }
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      const held = build.liquids.get(liquid);
      efficiency = Math.min(efficiency, held / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));
    build.state.wants = efficiency > 0 ? 1 : 0;

    if (efficiency > 0) {
      /* The item is taken **before** the pumping, on a counter that only moves while it is
         running: a fracker with no water does not burn sand waiting for some. */
      if (build.state.used >= (block.item_use_time || Infinity)) {
        build.state.used -= block.item_use_time;
        for (const [item, amount] of Object.entries(block.input || {})) {
          build.items.remove(item, amount);
        }
      }
      build.state.used += delta * efficiency;

      for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
        build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
      }
    }

    /* `maxPump = min(liquidCapacity - typeLiquid(), pumpAmount * delta * fraction *
       efficiency)`, and `typeLiquid()` is what it holds **of the result**: a fracker full
       of the water it drinks still has room for its oil. */
    if (efficiency > 0 && build.liquids.get(made) < build.liquidCapacity - 0.001) {
      const rate = block.output_liquid[made] / TICKS;
      build.addLiquid(made, rate * delta * fraction * efficiency);
    }
    build.dumpLiquid(made);
  },
};

/**
 * The sandbox liquid drain.
 *
 * `addLiquid` rather than a counter, then thrown away: what matters for a measurement is
 * that the pipe in front of it never backs up.
 */
const liquidVoid = {
  begin(build) { build.state.voided = 0; },
  acceptLiquid() { return true; },
  update(build) {
    build.state.voided += build.liquids.total;
    build.liquids.clear();
  },
};

export const LIQUIDS = {
  conduit,
  void: liquidVoid,
  "solid-pump": solidPump,
  "liquid-span": liquidSpan,
  router: liquidRouter,
  junction: liquidJunction,
  bridge: liquidBridge,
  source: liquidSource,
  pump,
};
