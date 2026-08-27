/**
 * A unit assembler, and the module that raises what it can build.
 *
 * The one block in the game whose rate is a question of **flight**. It builds four drones,
 * one every four seconds, and they fly out to the four corners of the square it works in;
 * `progress` then advances by the fraction of them that are in position, so an assembler
 * whose drones have just spawned runs at a quarter speed and one whose drones were shot
 * down runs at none.
 *
 * What it eats is its plan: other units, brought to it whole as cargo, plus walls, plus a
 * liquid. `shouldConsume` is false until all of that is there, which is why an assembler
 * with no cargo drinks nothing at all rather than drinking while it waits.
 *
 * `mindustry.world.blocks.units.UnitAssembler`, Mindustry v159.7.
 */

import { DIRECTIONS, TICKS } from "./core.js";
import { facing, Flyer, driftOn, flyTo, lookAt, within } from "./units.js";

const TILE = 8;

const unitAssembler = {
  begin(build) {
    build.state.drones = [];
    build.state.droneProgress = 0;
    build.state.progress = 0;
    build.state.made = 0;
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    // `PayloadSeq blocks`: what it has swallowed towards its plan.
    build.state.stored = {};
    build.state.wants = 1;
  },

  acceptPayload(build, source, payload) {
    if (build.state.payload) return false;
    const plan = planOf(build);
    if (!plan) return false;
    // It takes only what its plan calls for, and only until it has enough.
    const wanted = plan.payloads?.[payload.name] || 0;
    return (build.state.stored[payload.name] || 0) < wanted;
  },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.payVector = [0, 0];
  },

  acceptItem(build, source, item) {
    return false;
  },

  acceptLiquid(build, source, liquid) {
    return Boolean(build.block.drinks?.includes(liquid))
      && build.liquids.get(liquid) < build.liquidCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);
    const plan = planOf(build);
    const share = block.power > 0 ? (build.state.power ?? 1) : 1;

    /* One drone every `droneConstructTime / powerStatus` frames, and the counter runs on
       the plain frame rather than on `edelta`: an assembler with no cargo still builds its
       drones, it simply has nothing for them to do. */
    if (build.state.drones.length < (block.drones_created ?? 4)) {
      // In float, because six hundred additions of a two-hundred-and-fortieth land on
      // 0.99999994 and not on one: the game builds its second drone a frame later than a
      // double would.
      build.state.droneProgress = Math.fround(build.state.droneProgress
        + Math.fround(delta * share / (block.drone_construct_time || 240)));
      if (build.state.droneProgress >= 1) {
        build.state.droneProgress = 0;
        build.state.drones.push(new Flyer(droneType(build), build.x * TILE, build.y * TILE));
      }
    } else {
      build.state.droneProgress = 0;
    }

    // The square it works in sits `(areaSize + size) / 2` tiles out the way it points.
    const [dx, dy] = DIRECTIONS[build.rotation % 4];
    const reach = TILE * ((block.area_size ?? 11) + build.size) / 2;
    const spawnX = build.x * TILE + dx * reach;
    const spawnY = build.y * TILE + dy * reach;

    // Whatever it was handed goes into the pile, once it has slid all the way in.
    if (build.state.payload && arrived(build, delta)) {
      const name = build.state.payload.name;
      build.state.stored[name] = (build.state.stored[name] || 0) + 1;
      build.state.payload = null;
    }

    /* The drones take their places at the four corners, and `inPosition` wants both: within
       ten pixels of the corner **and** within fifteen degrees of facing inwards. */
    let ready = 0;
    const corner = TILE * (block.area_size ?? 11) / 2 * Math.SQRT2;
    build.state.drones.forEach((drone, at) => {
      const angle = at * 90 + 45;
      const tx = spawnX + Math.cos(angle * Math.PI / 180) * corner;
      const ty = spawnY + Math.sin(angle * Math.PI / 180) * corner;

      driftOn(drone, delta);
      flyTo(drone, tx, ty, 1, 3, delta);
      if (within(drone, tx, ty, 5)) lookAt(drone, angle + 180, delta);
      if (within(drone, tx, ty, 10) && facing(drone, angle + 180, 15)) ready++;
    });

    const eff = ready / (block.drones_created ?? 4);

    /* `shouldConsume`: everything the plan asks for has to be **there**, and only then does
       it drink. An assembler waiting on its cargo drinks nothing at all. */
    let efficiency = plan && stocked(build, plan) ? share : 0;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      const wanted = (rate / TICKS) * delta;
      if (wanted <= 0) continue;
      efficiency = Math.min(efficiency, build.liquids.get(liquid) / wanted);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));
    /* It asks the grid for its full share **whatever** it is doing, which is not what a unit
       factory does: `shouldConsumePower` only goes false when a non-power consumer reports
       zero, and an assembler's payload consumer reports one even with an empty pile.
       Measured: an assembler with no cargo on a grid that covers two fifths of it reads
       0.4, not 1, and builds two drones in thirty seconds rather than four. */
    build.state.wants = 1;

    if (efficiency <= 0) return;
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      build.liquids.remove(liquid, (rate / TICKS) * delta * efficiency);
    }

    build.state.progress = Math.fround(
      build.state.progress + Math.fround(delta * efficiency * eff / (plan.time || 1)));
    if (build.state.progress >= 1) {
      build.state.progress = 0;
      build.state.made++;
      for (const [name, count] of Object.entries(plan.payloads || {})) {
        build.state.stored[name] -= count;
      }
    }
  },
};

/** `moveInPayload`: the cargo slides to the middle before it counts as swallowed. */
function arrived(build, delta) {
  const speed = build.block.payload_speed ?? 0.7;
  const [px, py] = build.state.payVector;
  const away = Math.hypot(px, py);
  if (away <= speed * delta) {
    build.state.payVector = [0, 0];
    return true;
  }
  build.state.payVector = [px - (px / away) * speed * delta,
                           py - (py / away) * speed * delta];
  return false;
}

/** Which plan it is on: the highest tier its modules unlock, clamped to what it knows. */
function planOf(build) {
  const plans = build.block.plans || [];
  if (!plans.length) return null;
  return plans[Math.min(tierOf(build), plans.length - 1)];
}

/**
 * `checkTier`: the modules count only if their tiers run up without a gap.
 *
 * Sorted by tier, each one has to be either the tier already reached or one above it: two
 * tier-two modules and no tier-one module raise nothing at all.
 */
function tierOf(build) {
  const tiers = build.proximity
    .filter((other) => other.role === "assembler-module")
    .map((other) => other.block.tier || 1)
    .sort((a, b) => a - b);
  let reached = 0;
  for (const tier of tiers) if (tier === reached || tier === reached + 1) reached = tier;
  return reached;
}

/** Whether everything the plan asks for is standing in the pile. */
function stocked(build, plan) {
  for (const [name, count] of Object.entries(plan.payloads || {})) {
    if ((build.state.stored[name] || 0) < count) return false;
  }
  return true;
}

function droneType(build) {
  return build.world?.catalogue?.units?.[build.block.drone_type] || {};
}

/** A module: it carries nothing and does nothing except stand next to an assembler. */
const assemblerModule = {
  acceptPayload() { return false; },
  acceptItem() { return false; },
  begin(build) { build.state.wants = 1; },
};

export const ASSEMBLERS = {
  "unit-assembler": unitAssembler,
  "assembler-module": assemblerModule,
};
