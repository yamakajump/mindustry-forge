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

import { DIRECTIONS, TICKS } from "./core.js";

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
    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && build.liquidAmount < build.liquidCapacity;
  },

  update(build, world, step) {
    if (build.liquidAmount <= 0.0001) return;
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
  acceptLiquid(build, source, liquid) {
    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && build.liquidAmount < build.liquidCapacity;
  },

  update(build, world) {
    if (build.liquidAmount <= 0.0001) return;
    const link = build.node.link;
    const target = link ? world.at(link[0], link[1]) : null;
    if (target) build.moveLiquid(target, build.liquid);
    else build.dumpLiquid(build.liquid);
  },
};

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
    build.liquid = liquid;
    build.liquidAmount = build.liquidCapacity;
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
  update(build, world, step) {
    const dug = build.node.dug;
    if (!dug) return;
    build.addLiquid(dug.resource, (dug.rate / TICKS) * build.delta(step));
    build.dumpLiquid(dug.resource);
  },

  acceptLiquid() { return false; },
};

export const LIQUIDS = {
  conduit,
  router: liquidRouter,
  junction: liquidJunction,
  bridge: liquidBridge,
  source: liquidSource,
  pump,
};
