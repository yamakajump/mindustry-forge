/**
 * Everything that moves items around, ported from the game's own classes.
 *
 * The conveyor is the one that matters and the one that had to be right. It does not hold
 * a count of items: it holds their positions along its own length, and its throughput
 * falls out of how fast they slide and how close they are allowed to get. That is why a
 * belt carries 6.5 items a second rather than some round number, and why a belt that is
 * backed up refuses more at exactly the right moment rather than at a moment somebody
 * chose.
 *
 * Source: `mindustry.world.blocks.distribution.*` and `mindustry.world.blocks.storage.Unloader`,
 * Mindustry v159.7.
 */

import { DIRECTIONS, TICKS } from "./core.js";

/** `Conveyor.itemSpace` and `Conveyor.capacity`, both private constants in the game. */
const ITEM_SPACE = 0.4;
const BELT_CAPACITY = 3;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * A belt.
 *
 * `ConveyorBuild` keeps three parallel arrays: the item, and its position across and along
 * the belt. `ys` runs from 0 at the back to 1 at the front, items are pushed forward by
 * `speed * edelta()` a frame and may never come closer than `itemSpace` to the one ahead.
 * The loop runs from the front backwards, so the one in front moves first and the one
 * behind sees the room it left.
 */
const conveyor = {
  begin(build) {
    build.state.ids = [];
    build.state.ys = [];
    build.state.len = 0;
    build.state.minitem = 1;
  },

  acceptItem(build, source, item) {
    const state = build.state;
    if (state.len >= BELT_CAPACITY) return false;
    // `direction` is which way the item is travelling as it arrives, against where the
    // belt points: 0 is from behind, 1 and 3 from the sides, 2 is head on and refused.
    //
    // The game asks `facing.relativeTo(tile)`, which is the direction from the source to
    // the belt, not from the belt to the source. Taken the other way round every belt
    // refused everything, because a source behind a belt pointing east sits to its west
    // and `2` is the code for head on.
    const direction = Math.abs(arrivesFrom(build, source) - build.rotation) % 4;
    if (direction === 2) return false;
    // A belt never hands back to the block it points at, which is what stops two belts
    // facing each other from passing one item back and forth for ever.
    if (source?.block?.rotate && build.facing(build.world) === source) return false;
    return (direction === 0 && state.minitem >= ITEM_SPACE)
      || (direction % 2 === 1 && state.minitem > 0.7);
  },

  handleItem(build, source, item) {
    const state = build.state;
    if (state.len >= BELT_CAPACITY) return;
    const direction = Math.abs(arrivesFrom(build, source) - build.rotation) % 4;
    // Handed in from behind it starts at the back; handed in from a side it starts in the
    // middle, which is what makes a side feed cost a belt less than a head-on one.
    const start = direction === 0 ? 0 : 0.5;
    state.ids.unshift(item);
    state.ys.unshift(start);
    state.len++;
  },

  update(build, world, step) {
    const state = build.state;
    state.minitem = 1;
    if (!state.len) return;

    const next = build.facing(world);
    const speed = build.block.speed || 0;
    const moved = speed * build.delta(step);

    for (let i = state.len - 1; i >= 0; i--) {
      const ahead = (i === state.len - 1 ? 100 : state.ys[i + 1]) - ITEM_SPACE;
      state.ys[i] += clamp(ahead - state.ys[i], 0, moved);
      if (state.ys[i] > 1) state.ys[i] = 1;

      if (state.ys[i] >= 1 && pass(build, next, state.ids[i])) {
        state.ids.splice(i, state.len - i);
        state.ys.splice(i, state.len - i);
        state.len = Math.min(i, state.len);
      } else if (state.ys[i] < state.minitem) {
        state.minitem = state.ys[i];
      }
    }
  },
};

/** Which way an item is travelling as it lands here. `facing.relativeTo(tile)`. */
function arrivesFrom(build, source) {
  return (build.relativeTo(source) + 2) % 4;
}

/** `ConveyorBuild.pass`: hand it on if the thing in front will have it. */
function pass(build, next, item) {
  if (!item || !next) return false;
  if (!next.acceptItem(build, item)) return false;
  next.handleItem(build, item);
  return true;
}

/**
 * A router.
 *
 * `Router.RouterBuild` holds exactly one item and offers it round its neighbours, cursor
 * rotating, refusing to hand it back where it came from. It is the plainest use of `dump`
 * there is, and it is why a router splits evenly without anything computing a half.
 */
const router = {
  begin(build) { build.state.from = null; },

  acceptItem(build, source, item) {
    return build.items.total === 0;
  },

  handleItem(build, source, item) {
    build.items.add(item);
    build.state.from = source;
  },

  canDump(build, other, item) {
    return other !== build.state.from;
  },

  update(build) {
    if (build.items.total) build.dump();
  },
};

/**
 * A junction.
 *
 * Four queues, one per side, each coming out of the opposite side after a fixed delay.
 * This is what lets two lines cross without merging, and modelling it as a router that
 * hands to all four sides merged the very lines it exists to keep apart.
 *
 * `Junction.speed` is the delay in frames and `capacity` how many can be in flight.
 */
const junction = {
  begin(build) {
    build.state.queues = [[], [], [], []];
  },

  acceptItem(build, source, item) {
    const side = build.relativeTo(source);
    return build.state.queues[side].length < (build.block.junction_capacity || 6);
  },

  handleItem(build, source, item) {
    const side = build.relativeTo(source);
    build.state.queues[side].push({ item, at: 0 });
  },

  update(build, world, step) {
    const speed = build.block.junction_speed || 26;
    // Straight through and only straight through, one queue per side.
    for (let side = 0; side < 4; side++) {
      const queue = build.state.queues[side];
      if (!queue.length) continue;

      for (const held of queue) held.at += build.delta(step);
      const front = queue[0];
      if (front.at < speed) continue;

      // Straight out of the far side, and nowhere else.
      const [dx, dy] = DIRECTIONS[(side + 2) % 4];
      const next = world.at(build.x + dx, build.y + dy);
      if (next && next.acceptItem(build, front.item)) {
        next.handleItem(build, front.item);
        queue.shift();
      }
    }
  },
};

/**
 * A sorter.
 *
 * It holds nothing. An item offered to it is passed straight through to whatever is on the
 * far side if it matches the filter, and to the sides if it does not. Modelled as a block
 * that stores, a sorter became a one item buffer that changed the timing of everything
 * behind it.
 */
const sorter = {
  acceptItem(build, source, item) {
    const target = sorterTarget(build, source, item);
    return target !== null && target.acceptItem(build, item);
  },

  handleItem(build, source, item) {
    const target = sorterTarget(build, source, item);
    if (target) target.handleItem(build, item);
  },
};

function sorterTarget(build, source, item) {
  const world = build.world;
  if (!world) return null;
  const wanted = build.node.configured;
  // An inverted sorter passes everything except what it is set to.
  const inverted = build.name === "inverted-sorter";
  const matches = wanted ? (item === wanted) !== inverted : inverted;

  const from = build.relativeTo(source);
  if (matches) {
    const [dx, dy] = DIRECTIONS[(from + 2) % 4];
    return world.at(build.x + dx, build.y + dy);
  }
  // Not a match: out of the sides, alternating.
  for (const turn of [1, 3]) {
    const [dx, dy] = DIRECTIONS[(from + turn) % 4];
    const side = world.at(build.x + dx, build.y + dy);
    if (side && side.acceptItem(build, item)) return side;
  }
  return null;
}

/**
 * An overflow gate, and its underflow twin.
 *
 * Straight on when the thing in front will take it, out of the sides when it will not.
 * That priority is the whole point of the block, and modelling it as a router lost it:
 * the total throughput came out right and the branch it went down was wrong.
 */
const overflow = {
  begin(build) { build.state.from = null; },

  acceptItem(build, source, item) {
    return build.items.total === 0;
  },

  handleItem(build, source, item) {
    build.items.add(item);
    build.state.from = source;
  },

  update(build, world) {
    if (!build.items.total) return;
    const item = build.items.first();
    const from = build.state.from;

    const ahead = from ? opposite(build, world, from) : null;
    if (ahead && ahead !== from && ahead.acceptItem(build, item)) {
      ahead.handleItem(build, item);
      build.items.remove(item);
      return;
    }
    // Otherwise round the sides, which is `dump` refusing to go back where it came from.
    build.dump();
  },

  canDump(build, other, item) {
    return other !== build.state.from;
  },
};

function opposite(build, world, source) {
  const [dx, dy] = DIRECTIONS[(build.relativeTo(source) + 2) % 4];
  return world.at(build.x + dx, build.y + dy);
}

/**
 * A container or a vault.
 *
 * It takes anything with room and hands nothing on: nothing is pushed out of a container,
 * an unloader pulls out of it. Modelled as a block that dumps, a vault in the middle of a
 * base pushed its contents back down every belt that touched it.
 */
const store = {
  acceptItem(build, source, item) {
    return build.items.total < build.itemCapacity;
  },
};

/**
 * An unloader.
 *
 * It pulls out of whatever it touches and hands to whatever else it touches, one item
 * every `speed` frames, taking from the fullest and giving to the emptiest. Its rate is
 * `60 / speed`, which is eleven a second for the plain one.
 */
const unloader = {
  begin(build) { build.state.timer = 0; },

  acceptItem() { return false; },

  update(build, world, step) {
    const speed = TICKS / (build.block.items_per_second || 11);
    build.state.timer += build.delta(step);
    if (build.state.timer < speed) return;
    build.state.timer -= speed;

    const wanted = build.node.configured;
    const froms = build.proximity.filter((other) => other.role === "store");
    if (!froms.length) return;

    // Out of the fullest, into anything else that will have it.
    froms.sort((a, b) => b.items.total - a.items.total);
    for (const from of froms) {
      const items = wanted ? [wanted] : [...from.items.counts.keys()];
      for (const item of items) {
        if (!from.items.has(item)) continue;
        for (const to of build.proximity) {
          if (to === from || to.role === "store" && to.items.total >= from.items.total) {
            continue;
          }
          if (!to.acceptItem(build, item)) continue;
          from.items.remove(item);
          to.handleItem(build, item);
          return;
        }
      }
    }
  },
};

/**
 * A bridge.
 *
 * It carries to the tile it remembers, over whatever is in between, one item every
 * `transportTime` frames. Unlinked, it behaves as an ordinary block and hands round.
 */
const bridge = {
  begin(build) { build.state.timer = 0; },

  acceptItem(build, source, item) {
    return build.items.total < build.itemCapacity;
  },

  update(build, world, step) {
    if (!build.items.total) return;
    const wait = build.block.transport_time || TICKS / (build.block.items_per_second || 11);
    build.state.timer += build.delta(step);
    if (build.state.timer < wait) return;

    const link = build.node.link;
    const target = link ? world.at(link[0], link[1]) : null;
    const item = build.items.first();

    if (target) {
      if (target.acceptItem(build, item)) {
        target.handleItem(build, item);
        build.items.remove(item);
        build.state.timer = 0;
      }
      return;
    }
    if (build.dump()) build.state.timer = 0;
  },
};

/** A machine, a turret, anything that swallows and gives nothing back. Slice two. */
const sink = {
  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },
};

const BY_ROLE = {
  conveyor,
  router,
  junction,
  sorter,
  bridge,
  store,
  unloader,
  sink,
  turret: sink,
  crafter: sink,
  generator: sink,
};

/**
 * Which behaviour a block gets.
 *
 * By role, except for the overflow gate, which the catalogue files under routers because a
 * maximum flow cannot express its priority and reads it as one. A simulation can, so it is
 * picked out by the flag the dump carries rather than by inventing a role the analytic
 * side has no use for.
 */
export function behaviourOf(node) {
  if (node.block.overflow) return overflow;
  return BY_ROLE[node.role] || null;
}
