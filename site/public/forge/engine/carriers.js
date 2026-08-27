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

import { bridgeAccepts, bridgeDumps, bridgeLink, bridgeTarget, DIRECTIONS, itemOrder,
  TICKS } from "./core.js";
import { MACHINES } from "./machines.js";
import { LIQUIDS } from "./liquids.js";
import { POWER } from "./power.js";
import { PAYLOADS } from "./payloads.js";
import { massDriver } from "./massdriver.js";

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
    /* And an armoured belt takes from a belt, or from directly behind, and from nothing
       else: a crafter beside one cannot feed it, which is the entire point of the block. */
    if (build.block.kind === "ArmoredConveyor"
        && !(source?.block?.carries === "item" && source?.block?.speed)
        && arrivesFrom(build, source) !== build.rotation) {
      return false;
    }
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

    /* How far up its own length the front item may go.
    
       Two belts pointing the same way are one line, and the game couples them: the item at
       the front of this belt cannot reach the end while the item at the back of the next
       one is still in the way. Left out, a belt hands on the moment an item reaches 1 and
       the pair runs faster than either could.
    
       It costs nothing on a slow belt, where items are far enough apart that the next one's
       back is always clear, and it is the whole difference on a fast one: measured against
       the engine, a copper line matched to the item and a titanium line ran 6.6% fast. */
    const aligned = next?.behaviour === conveyor && next.rotation === build.rotation;
    const nextMax = aligned
      ? 1 - Math.max(ITEM_SPACE - next.state.minitem, 0)
      : 1;

    for (let i = state.len - 1; i >= 0; i--) {
      const ahead = (i === state.len - 1 ? 100 : state.ys[i + 1]) - ITEM_SPACE;
      state.ys[i] += clamp(ahead - state.ys[i], 0, moved);
      if (state.ys[i] > nextMax) state.ys[i] = nextMax;

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
  return build.arrivedFrom(source);
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
  begin(build) {
    build.state.item = null;
    build.state.from = null;
    build.state.time = 0;
  },

  /** One item, and not one **stack**: `lastItem == null && items.total() == 0`. */
  acceptItem(build, source, item) {
    return build.state.item === null && build.items.total === 0;
  },

  handleItem(build, source, item) {
    build.items.add(item);
    build.state.item = item;
    build.state.time = 0;
    build.state.from = source;
  },

  update(build, world, step) {
    if (build.state.item === null && build.items.total > 0) {
      build.state.item = build.items.first();
    }
    if (build.state.item === null) return;

    /* Eight frames, and only towards another router or a block that transfers instantly.
       Towards a belt, a duct or a machine it lets go on the same frame it received.

       This was a plain `dump()` before, so a chain of routers carried eleven items a
       second where the game carries seven and a half: forty seven per cent too much, and
       invisible to every scenario because they all ended on a belt or a vault. */
    build.state.time += (1 / (build.block.speed || 8)) * build.delta(step);

    const target = routerTarget(build, build.state.item, false);
    if (!target) return;
    const waits = target.role === "router" || target.block.instant_transfer;
    if (waits && build.state.time < 1) return;

    // Walked twice: once to find, once to move the cursor. The second walk advances it
    // past every neighbour it looked at, refusals included.
    routerTarget(build, build.state.item, true);
    target.handleItem(build, build.state.item);
    build.items.remove(build.state.item);
    build.state.item = null;
  },
};

/**
 * `Router.getTileTarget`.
 *
 * The cursor is read once before the walk and advanced inside it, so the order is fixed
 * even as it moves. And an item handed in by an **overflow gate** is never handed back to
 * it, which is what stops the two of them passing one item to and fro for ever.
 */
function routerTarget(build, item, set) {
  const start = build.cdump;
  for (let i = 0; i < build.proximity.length; i++) {
    const other = build.proximity[(i + start) % build.proximity.length];
    if (set) build.cdump = (build.cdump + 1) % build.proximity.length;
    if (other === build.state.from && build.state.from?.block.overflow) continue;
    if (other.acceptItem(build, item)) return other;
  }
  return null;
}

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
  begin(build) { build.state.flip = 0; },

  acceptItem(build, source, item) {
    const target = sorterTarget(build, source, item, false);
    return target !== null && target.acceptItem(build, item);
  },

  handleItem(build, source, item) {
    // Asked twice: once without flipping to test, once with to move the bit. The game does
    // exactly this, and the bit only turns over on the pass that actually hands the item.
    const target = sorterTarget(build, source, item, true);
    if (target) target.handleItem(build, item);
  },
};

function sorterTarget(build, source, item, flip) {
  const world = build.world;
  if (!world) return null;
  const wanted = build.node.configured;
  // An inverted sorter passes everything except what it is set to.
  const inverted = build.name === "inverted-sorter";
  const matches = wanted ? (item === wanted) !== inverted : inverted;

  const from = build.relativeTo(source);
  const dir = (from + 2) % 4;
  const at = (turn) => {
    const [dx, dy] = DIRECTIONS[turn % 4];
    return world.at(build.x + dx, build.y + dy);
  };

  if (matches) {
    /* Straight through, unless this would make a chain of three instant blocks: a sorter
       handing to a sorter that hands to a sorter would move an item three tiles in one
       frame, and the game refuses the middle link rather than allow it. */
    const ahead = at(dir);
    if (source?.block.instant_transfer && ahead?.block.instant_transfer) return null;
    return ahead;
  }

  const a = at((dir + 3) % 4);
  const b = at((dir + 1) % 4);
  const open = (side) => side
    && !(side.block.instant_transfer && source?.block.instant_transfer)
    && side.acceptItem(build, item);
  const left = open(a);
  const right = open(b);

  if (left && !right) return a;
  if (right && !left) return b;
  if (!right) return null;

  /* Both sides will have it, so it alternates, and it keeps **one bit per direction of
     arrival**: a sorter fed from two sides shares each feed evenly rather than the two of
     them fighting over one cursor. Taking the first side that accepts, as this did, sends
     everything one way and reads as a design that works. */
  const bit = 1 << dir;
  const side = (build.state.flip & bit) === 0 ? a : b;
  if (flip) build.state.flip ^= bit;
  return side;
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
  begin(build) {
    build.state.timer = 0;
    build.state.rotations = 0;
    build.state.used = new Map();
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const speed = build.block.speed || 5.4545;
    build.state.timer += build.delta(step);
    /* Not a metronome. Below the threshold it returns and **keeps** the surplus, so the
       counter runs away while there is nothing to do; on a failed attempt it is clamped
       back to the threshold so it retries every frame until it works. The rate is a
       ceiling, not a cadence. */
    if (build.state.timer < speed || build.proximity.length < 2) return;

    const wanted = build.node.configured;
    const sides = neighboursOf(build);

    let moved = false;
    const item = wanted
      ? (pairFor(build, sides, wanted) ? wanted : null)
      : firstPossible(build, sides);

    if (item) {
      /* `rotations = item.id` even when the unloader is set to one item, which is a
         harmless oddity of the game's and is kept because the next unset walk starts from
         it. */
      build.state.rotations = itemId(build, item);

      for (const side of sides) {
        const most = side.build.getMaximumAccepted
          ? side.build.getMaximumAccepted(item) : side.build.itemCapacity;
        side.loadFactor = most === 0 ? 0 : side.build.items.get(item) / most;
        side.lastUsed = (build.state.used.get(side.build) || 0) + 1;
        build.state.used.set(side.build, side.lastUsed);
      }

      sides.sort(compareSides);

      const to = sides.find((one) => one.canLoad);
      const from = [...sides].reverse().find((one) => one.canUnload);

      /* The rule that stops two identical blocks passing one item back and forth for ever:
         if the source could also receive, and the two are equally full **in proportion**,
         nothing moves. */
      if (to && from && (from.loadFactor !== to.loadFactor || !from.canLoad)) {
        to.build.handleItem(build, item);
        from.build.items.remove(item);
        build.state.used.set(to.build, 0);
        build.state.used.set(from.build, 0);
        moved = true;
      }
    }

    build.state.timer = moved ? build.state.timer % speed
                              : Math.min(build.state.timer, speed);
  },
};

/**
 * Which neighbours an unloader may use, and for what.
 *
 * Two rules, both easy to get backwards. It may take out of **anything** whose block is
 * `unloadable`, which is nearly everything and includes a crafter and a drill: an unloader
 * against a graphite press really does pull graphite out of it. And it may never put into
 * a **store or a core**, whatever the numbers say: `canLoad` is
 * `!(other instanceof CoreBuild || other instanceof StorageBuild)`.
 *
 * Read as "out of a container, into anything emptier", an unloader against a press moved
 * nothing where the game moves eleven a second, and an unloader between two vaults moved
 * eleven a second where the game moves none.
 */
function neighboursOf(build) {
  const out = [];
  for (const other of build.proximity) {
    const storage = other.role === "store" || other.role === "core";
    const canTake = other.block.unloadable
      && (build.block.allow_core_unload || !storage);
    if (!storage || canTake) {
      out.push({ build: other, notStorage: !storage, canLoad: false,
                 canUnload: false, loadFactor: 0, lastUsed: 0 });
    }
  }
  return out;
}

/** `isPossibleItem`: is there a giver **and** a taker, and are they two different blocks. */
function pairFor(build, sides, item) {
  let giver = false;
  let taker = false;
  let distinct = false;
  for (const side of sides) {
    side.canLoad = side.notStorage && side.build.acceptItem(build, item);
    side.canUnload = side.build.block.unloadable && side.build.items.get(item) > 0;
    distinct = distinct || (giver && side.canLoad) || (taker && side.canUnload);
    giver = giver || side.canUnload;
    taker = taker || side.canLoad;
  }
  return distinct;
}

/**
 * Unset, it walks the item list from where it left off and takes the first that works.
 *
 * A rotation over **item kinds** and not over containers, which is why an unset unloader
 * between one vault holding two metals alternates evenly between them.
 */
function firstPossible(build, sides) {
  const order = build.world?.catalogue?.items;
  if (!order) return null;
  const names = Object.keys(order);
  for (let i = 0; i < names.length; i++) {
    const item = names[(build.state.rotations + i + 1) % names.length];
    if (pairFor(build, sides, item)) return item;
  }
  return null;
}

const itemId = (build, item) => build.world?.catalogue?.items?.[item]?.id ?? 0;

/**
 * `Unloader.comparator`, five criteria and every one of them load bearing.
 *
 * Ascending, so the bottom of the list is the destination and the top is the source. The
 * last one is a least-recently-used tiebreak, and it is what shares an unloader's output
 * evenly between two belts instead of saturating whichever came first.
 */
function compareSides(a, b) {
  const bool = (x, y) => (x === y ? 0 : x ? 1 : -1);
  return bool(!a.notStorage, !b.notStorage)
    || bool(a.canUnload && !a.canLoad, b.canUnload && !b.canLoad)
    || bool(a.canUnload || !a.canLoad, b.canUnload || !b.canLoad)
    || (a.loadFactor - b.loadFactor)
    || (b.lastUsed - a.lastUsed);
}

/**
 * A bridge.
 *
 * It carries to the tile it remembers, over whatever is in between, one item every
 * `transportTime` frames. Unlinked, it behaves as an ordinary block and hands round.
 */
const bridge = {
  begin(build) {
    build.state.timer = 0;
    build.state.accept = 0;
    // A buffered bridge is a delay line rather than a hand-off: what enters at one end
    // spends `speed` frames inside before it may leave the other.
    build.state.queue = [];
  },

  acceptItem(build, source, item) {
    return build.items.total < build.itemCapacity && bridgeAccepts(build, source);
  },

  /** `canDump` is `checkDump`: never back down a beam that feeds it. */
  canDump(build, other, item) {
    return bridgeDumps(build, other);
  },

  update(build, world, step) {
    // `linkValid`, and not just "is there something at the far end": the tile has to carry
    // the same bridge, and it must not be pointed back here.
    const target = bridgeTarget(build);

    /* Unlinked, it is an ordinary block and hands round whatever it holds, through
       `dumpAccumulate`: a **while**, so a bridge sped up by an overdrive dome hands on two
       or three times in one frame rather than once. */
    if (!target) {
      build.state.dumpAccum = (build.state.dumpAccum || 0) + build.delta(step);
      while (build.state.dumpAccum >= 1) {
        if (build.items.total) build.dump();
        build.state.dumpAccum -= 1;
      }
      return;
    }

    if (build.block.buffered) {
      buffered(build, target, step);
      return;
    }

    /* `ItemBridge.updateTransport`: the counter runs whether or not there is anything to
       send, because it counts game time and not attempts. Reset only on a successful
       hand-off, a bridge that had nothing to send for a moment then sent one immediately
       and ran fast. */
    const wait = build.block.transport_time || TICKS / (build.block.items_per_second || 11);
    /* And on `edelta()`, so a phase conveyor with no power carries nothing: it
       draws 0.3 a frame, and on `delta()` alone an unpowered bridge moved thirty
       items a second and a half covered grid moved thirty too. */
    build.state.wants = 1;
    build.state.timer += build.delta(step)
      * (build.block.power > 0 ? (build.state.power ?? 1) : 1);

    /* A **while**, and this was a modulo. The two agree while a frame is worth less than
       `transportTime`, which is every ordinary case; a phase conveyor under an overdrive
       dome runs at two and a half frames a frame against a transport time of two, and the
       modulo threw the surplus away. Seventy-five items a second in the game against sixty
       here. */
    while (build.state.timer >= wait) {
      build.state.timer -= wait;
      if (!build.items.total) continue;
      // `items.take()`, which both removes it and moves the cursor on.
      const item = build.items.take(itemOrder(build));
      if (item && target.acceptItem(build, item)) {
        target.handleItem(build, item);
      } else if (item) {
        /* Refused: the game never took it, so neither the stock nor the cursor moved.
           `take()` here has already moved both, so both go back. */
        build.items.add(item);
        build.items.taking = (build.items.taking + itemOrder(build).length - 1)
          % itemOrder(build).length;
      }
    }
  },
};

/**
 * A plastanium conveyor.
 *
 * Nothing like a belt. It moves a whole stack, a "crater", one tile at a time: the first
 * of a line gathers until it is full, the middle ones pass the stack along, and the last
 * one dumps it. That is why its rate is `itemCapacity * speed * 60` rather than anything
 * to do with spacing.
 *
 * `StackConveyor` shares no ancestor with `Conveyor`, which is how it came to be filed as
 * a sink and to swallow everything it was given.
 */
const stackConveyor = {
  begin(build) {
    build.state.cooldown = 0;
    build.state.loaded = false;
  },

  /** Which of the three the game put it in, from what is in front and behind. */
  role(build) {
    const world = build.world;
    const [fx, fy] = DIRECTIONS[build.rotation];
    const [bx, by] = DIRECTIONS[(build.rotation + 2) % 4];
    const front = world?.at(build.x + fx, build.y + fy);
    const back = world?.at(build.x + bx, build.y + by);

    const isStack = (other) => other?.behaviour === stackConveyor;
    if (!isStack(front)) return "unload";
    // A loading dock is one with nothing of its own kind behind it. One that another
    // stack conveyor points at is a middle instead, however empty its back is.
    if (!isStack(back) && !build.proximity.some((near) =>
        isStack(near) && near.behaviour.frontOf?.(near) === build)) {
      return "load";
    }
    return "move";
  },

  frontOf(build) {
    const [dx, dy] = DIRECTIONS[build.rotation];
    return build.world?.at(build.x + dx, build.y + dy) || null;
  },

  acceptItem(build, source, item) {
    const recharge = build.block.recharge || 2;
    if (build.state.cooldown > recharge - 1) return false;
    if (stackConveyor.role(build) !== "load") return false;
    if (build.items.total && !build.items.has(item)) return false;
    if (build.items.total >= build.itemCapacity) return false;
    return stackConveyor.frontOf(build) !== source;
  },

  update(build, world, step) {
    const speed = build.block.speed || 0;
    const recharge = build.block.recharge || 2;

    if (build.state.cooldown > 0) {
      build.state.cooldown = clamp(build.state.cooldown - speed * build.delta(step),
                                   0, recharge);
    }
    if (!build.items.total) return;
    if (build.state.cooldown > 0) return;

    const where = stackConveyor.role(build);
    const item = build.items.first();

    if (where === "unload") {
      while (build.items.total && build.dump(build.items.first())) {
        // `dump` takes the item out itself; the loop is the game's own `while`.
      }
      return;
    }

    // A loading dock waits until it is full; anything else passes what it has straight on.
    if (where === "load" && build.items.total < build.itemCapacity) return;

    const front = stackConveyor.frontOf(build);
    if (front?.behaviour !== stackConveyor || front.items.total) return;

    for (const [name, count] of [...build.items.counts]) {
      if (count > 0) front.items.add(name, count);
    }
    build.items.counts.clear();
    build.items.total = 0;
    build.state.cooldown = recharge;
    front.state.cooldown = 1;
  },
};

/**
 * A duct, which is what Erekir has instead of a belt.
 *
 * Nothing like a conveyor. It holds exactly one item, carries it across in `speed` frames,
 * and refuses everything else meanwhile. Its rate is therefore a plain division rather
 * than anything to do with spacing, and a line of them cannot buffer: one blocked duct
 * stops the whole run behind it immediately.
 */
const duct = {
  begin(build) {
    build.state.progress = 0;
    build.state.current = null;
  },

  acceptItem(build, source, item) {
    if (build.state.current || build.items.total) return false;
    const direction = Math.abs(arrivesFrom(build, source) - build.rotation) % 4;

    /* Armoured is not "the same but tougher". A plain duct takes from every side but the
       one it points at; an armoured duct takes only from **directly behind**, plus from
       other members of the duct family that are explicitly pointed at it. A crafter or a
       vault beside one cannot feed it at all, which is the whole point of the block and
       is invisible in any rate calculation.

       `isDuct` is true for exactly two classes in the game, `Duct` and `DuctBridge`. */
    if (build.block.armored) {
      const family = source?.block?.rotate && source?.block?.duct_speed
        && source.facing(build.world) === build;
      return Boolean(family) || arrivesFrom(build, source) === build.rotation;
    }

    // Never from the block it points at, and never head on.
    if (source?.block?.rotate && build.facing(build.world) === source) return false;
    return direction !== 2;
  },

  /* Only `handleStack` sets the item being carried; a plain `handleItem` just puts it in
     the duct and leaves `current` alone. It is picked up at the end of the duct's own
     update, one frame later, and that frame is most of the difference between a line of
     ducts carrying fifteen a second and thirty. */
  handleItem(build, source, item) {
    build.items.add(item);
  },

  update(build, world, step) {
    /* One item every `speed` frames, and the accounting for that is worth writing down.
    
       `DuctBuild.updateTile` reads `progress += edelta() / speed * 2` against a threshold
       of `1 - 1/speed`, and `handleItem` starts it at minus one. The number of updates
       between arriving and leaving is therefore

           ceil((1 - 1/speed - (-1)) / (2/speed)) = ceil(speed - 0.5)

       which for a whole `speed` is `speed` exactly. Four frames, fifteen items a second,
       and the game's own stat line agrees: `60f / speed`.

       This read as a three frame cycle for a while, on a `floor` where the game has a
       `ceil`, and the extra frame was blamed on update order and written down as measured
       rather than derived. It was arithmetic, and the `progress %= ...` leftover never
       survives either: it is overwritten next frame by the zero or the minus one.
    
       Note this is not a conveyor's `displayedSpeed`, which is a figure typed by hand and
       has to be distrusted. A duct's is computed from the field. */
    const speed = build.block.duct_speed || 5;
    const next = build.facing(world);

    if (!build.state.current || !next) {
      build.state.progress = 0;
      if (build.items.total) build.state.current = build.items.first();
      return;
    }

    build.state.progress += build.delta(step);
    if (build.state.progress < speed - 1) return;

    if (next.acceptItem(build, build.state.current)) {
      next.handleItem(build, build.state.current);
      build.items.remove(build.state.current);
      build.state.current = null;
      build.state.progress %= speed - 1;
    }
  },
};

/**
 * An overflow duct: straight on when it can, to the sides when it cannot.
 *
 * The same idea as an overflow gate on Serpulo's belts, and the same reason a maximum flow
 * cannot express it: it is right about the total and wrong about which branch carries it.
 */
const overflowDuct = {
  ...duct,

  begin(build) {
    build.state.progress = 0;
    build.state.current = null;
    build.state.flip = 0;
  },

  /* `OverflowDuct.acceptItem` is written from scratch rather than inherited, and it is
     stricter than a duct's in exactly one way: **only the rear face passes**. Inheriting
     the duct's rule, which takes from everywhere but the front, a duct laid against one of
     its sides pushed fifteen items a second through it where the game jams the side line
     completely. */
  acceptItem(build, source, item) {
    return !build.state.current && build.items.total === 0
      && arrivesFrom(build, source) === build.rotation;
  },

  /* Its own `handleItem`, which sets what it is carrying **and** starts the clock at minus
     one. Same arithmetic as a duct's in the end, `ceil(speed - 0.5)` updates to cross, and
     worth transcribing rather than reasoning about: read as starting from zero, this came
     out at thirty items a second where the game carries fifteen. */
  handleItem(build, source, item) {
    build.state.current = item;
    build.state.progress = -1;
    build.items.add(item);
  },

  update(build, world, step) {
    const speed = build.block.duct_speed || 5;
    const gate = 1 - 1 / speed;
    build.state.progress += (build.delta(step) / speed) * 2;

    if (!build.state.current) {
      build.state.progress = 0;
    } else if (build.state.progress >= gate) {
      const target = overflowTarget(build, world);
      if (target) {
        target.handleItem(build, build.state.current);
        // `cdump = cdump == 0 ? 2 : 0`, which is what alternates the two sides.
        build.state.flip = build.state.flip === 0 ? 2 : 0;
        build.items.remove(build.state.current);
        build.state.current = null;
        build.state.progress %= gate;
      }
    }

    // Picked up at the **end** of the update, so the item that arrived this frame does not
    // start moving until the next one.
    if (!build.state.current && build.items.total) {
      build.state.current = build.items.first();
    }
  },
};

/** `OverflowDuct.target`: straight on when it can, to the sides when it cannot. */
function overflowTarget(build, world) {
  const item = build.state.current;
  const invert = build.block.invert;
  const at = (turn) => {
    const [dx, dy] = DIRECTIONS[(build.rotation + turn) % 4];
    return world.at(build.x + dx, build.y + dy);
  };
  const takes = (other) => Boolean(other) && other.acceptItem(build, item);

  // An underflow duct prefers its sides, and only then what it points at.
  if (invert) {
    const left = at(1);
    const right = at(3);
    const lc = takes(left);
    const rc = takes(right);
    if (lc && !rc) return left;
    if (rc && !lc) return right;
    if (lc && rc) return build.state.flip === 0 ? left : right;
  }

  const front = build.facing(world);
  if (takes(front)) return front;
  // And it stops there: an underflow duct never falls back to what it points at twice.
  if (invert) return null;

  /* `mod(rotation + ((i + cdump + 1) % 3 - 1), 4)` for i in minus one to one, skipping the
     way it points. Which is the two sides, in an order the flip bit decides. */
  for (const turn of (build.state.flip === 0 ? [3, 1] : [1, 3])) {
    const side = at(turn);
    if (takes(side)) return side;
  }
  return null;
}

/**
 * A core.
 *
 * A container that counts. It takes anything up to its capacity and hands nothing back,
 * and it is where most schematics that are not self-contained are meant to deliver.
 */
const core = {
  acceptItem(build, source, item) {
    return build.items.total < build.itemCapacity;
  },
};

/**
 * A sandbox source.
 *
 * `ItemSourceBuild.updateTile` sets its own count to one, dumps it, and sets it back to
 * zero, `itemsPerSecond` times a second. It never holds anything: what a belt in front of
 * it actually takes is decided by the belt, which is the whole point of using one to feed
 * a measurement.
 */
const source = {
  begin(build) { build.state.counter = 0; },

  acceptItem() { return false; },

  update(build, world, step) {
    const item = build.node.configured;
    if (!item) return;
    const limit = TICKS / (build.block.output_per_second || 100);
    build.state.counter += build.delta(step);
    while (build.state.counter >= limit) {
      build.items.add(item);
      build.dump(item);
      build.items.remove(item, build.items.get(item));
      build.state.counter -= limit;
    }
  },
};

/**
 * `BufferedItemBridgeBuild.updateTransport`: a delay line with a gate at the far end.
 *
 * One item is taken off the block's own stock into the buffer per update. It may leave
 * once it has spent `speed` frames inside, and the far end takes at most one every four
 * frames. Both halves matter: the delay is why a line of them lags, and the gate is why
 * one carries fifteen a second and not sixty.
 */
function buffered(build, target, step) {
  const speed = build.block.buffer_speed ?? 40;
  const room = build.block.buffer_capacity ?? 50;

  build.state.age = (build.state.age || 0) + build.delta(step);

  if (build.state.queue.length < room && build.items.total) {
    const item = build.items.take(itemOrder(build));
    if (item) build.state.queue.push({ item, at: build.state.age });
  }

  /* The gate is checked first and spends itself when it fires, whether or not anything
     goes through. `timer(timerAccept, 4) && item != null && other.acceptItem(...)` reads
     left to right, so the timer is consumed before the rest is even looked at. Reset only
     on success, the bridge saved up its turns and handed one item too many over thirty
     seconds. */
  build.state.accept += build.delta(step);
  if (build.state.accept < 4) return;
  build.state.accept %= 4;

  const front = build.state.queue[0];
  if (!front || build.state.age - front.at < speed) return;

  if (target.acceptItem(build, front.item)) {
    target.handleItem(build, front.item);
    build.state.queue.shift();
  }
}

/** A machine, anything that swallows and gives nothing back. */
const sink = {
  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },
};

/**
 * A turret that eats items.
 *
 * Its ammunition is not in its item module: an item handed to it is converted into
 * `ammoMultiplier` units of ammunition and the item itself is gone. So a turret does not
 * hold graphite, it holds ammunition that used to be graphite, and it takes more until
 * `maxAmmo` is reached and then refuses.
 *
 * How fast it eats depends on how often it fires, which a still picture cannot know. What
 * a schematic can be told is the other half: how much it swallows before it stops, which
 * is what backs a belt up behind a row of turrets nobody is shooting at.
 */
const itemTurret = {
  begin(build) { build.state.ammo = 0; },

  acceptItem(build, source, item) {
    const worth = build.block.ammo_worth?.[item];
    if (!worth) return false;
    return build.state.ammo + worth <= (build.block.max_ammo || 30);
  },

  handleItem(build, source, item) {
    build.state.ammo += build.block.ammo_worth?.[item] || 0;
  },
};

/* The machines come last, so that a role they cover wins over the placeholder that
   swallowed everything before they existed. Spread first, `crafter: sink` two lines below
   quietly took it back and a press made nothing at all. */
/**
 * A duct router: one way in, three ways out.
 *
 * It takes only from **directly behind** - not "from anywhere but the front", which is
 * what a plain duct does - and hands on to the front and the two sides in a rotating
 * order, never backwards.
 *
 * The cursor advances on **every** neighbour it looks at, including the ones it refuses
 * and including the one it succeeds with. A power node parked on one of its faces is
 * looked at, refused, and still costs a turn, which is what shifts the phase and makes the
 * three-way split come out even. A cursor that only advances on success splits it
 * unevenly, which is exactly the sort of thing a rate calculation cannot see.
 */
const ductRouter = {
  begin(build) {
    build.state.progress = 0;
    build.state.current = null;
  },

  acceptItem(build, source, item) {
    return build.state.current === null && build.items.total === 0
      && source.relativeTo(build) === build.rotation;
  },

  handleItem(build, source, item) {
    build.state.current = item;
    build.state.progress = -1;
    build.items.add(item);
  },

  update(build, world, step) {
    const speed = build.block.duct_speed || 5;
    build.state.progress += (build.delta(step) / speed) * 2;

    if (build.state.current !== null) {
      if (build.state.progress >= 1 - 1 / speed) {
        const target = ductTarget(build, build.state.current);
        if (target) {
          target.handleItem(build, build.state.current);
          build.items.remove(build.state.current);
          build.state.current = null;
          build.state.progress %= 1 - 1 / speed;
        }
        // Blocked, `progress` keeps climbing with no modulo at all, so a router held up
        // for two hundred frames lets go on the very frame a way out appears.
      }
    } else {
      build.state.progress = 0;
    }

    if (build.state.current === null && build.items.total > 0) {
      build.state.current = build.items.first();
    }
  },
};

/** `DuctRouterBuild.target`, shared with the stack router that extends it. */
function ductTarget(build, item) {
  if (item === null) return null;
  const start = build.cdump;
  const sorted = build.node.configured;
  for (let i = 0; i < build.proximity.length; i++) {
    const other = build.proximity[(i + start) % build.proximity.length];
    const side = build.relativeTo(other);
    /* A sorted router sends the item it was set to straight ahead and everything else out
       the sides, which is one condition rather than two: "is this the sorted item" has to
       agree with "is this the front". */
    const wrongWay = sorted && (item === sorted) !== (side === build.rotation);
    const backwards = side === (build.rotation + 2) % 4;
    build.cdump = (build.cdump + 1) % build.proximity.length;
    if (!wrongWay && !backwards && other.acceptItem(build, item)) return other;
  }
  return null;
}

/**
 * A surge router: a duct router that saves up a stack and lets it go all at once.
 *
 * Its charge does not use `delta` at all. `progress += efficiency + baseEfficiency` per
 * **frame**, and `baseEfficiency` is one, so it works unpowered at a seventh of the speed
 * rather than not at all. Then the whole stack of ten leaves in a single frame, in a loop
 * that calls `target()` again after each item and so keeps advancing the cursor.
 *
 * The signature is that a vault behind one grows by exactly ten at a time and never by
 * one. A port that lets items through as they arrive gets the total roughly right and the
 * shape entirely wrong.
 */
const stackRouter = {
  begin(build) {
    build.state.progress = 0;
    build.state.current = null;
    build.state.unloading = false;
  },

  acceptItem(build, source, item) {
    return !build.state.unloading
      && (build.state.current === null || item === build.state.current)
      && build.items.total < build.itemCapacity
      && source.relativeTo(build) === build.rotation;
  },

  handleItem(build, source, item) {
    build.state.current = item;
    build.state.progress = -1;
    build.items.add(item);
  },

  update(build, world, step) {
    const cap = build.block.duct_speed || 5;
    const power = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    const rate = (build.block.base_efficiency ?? 0) + power;

    if (!build.state.unloading && build.state.current !== null
        && build.items.total >= build.itemCapacity) {
      if (build.state.progress < cap) build.state.progress += rate;
      if (build.state.progress >= cap) {
        build.state.unloading = true;
        build.state.progress %= cap;
      }
    }

    if (build.state.unloading && build.state.current !== null) {
      let target = ductTarget(build, build.state.current);
      while (target && build.items.get(build.state.current) > 0) {
        target.handleItem(build, build.state.current);
        build.items.remove(build.state.current);
        target = ductTarget(build, build.state.current);
      }
      if (build.items.get(build.state.current) === 0) {
        build.state.current = null;
        build.state.unloading = false;
      }
    }

    if ((build.state.current === null || build.items.get(build.state.current) === 0)
        && build.items.total > 0) {
      build.state.current = build.items.first();
    }
    if (build.items.total === 0) {
      build.state.unloading = false;
      build.state.current = null;
    }
  },
};

/**
 * A duct bridge, which is nothing like an item bridge.
 *
 * It has no configuration: it looks along the way it points and links to the **first**
 * bridge of its own kind within range, so a chain is built by pointing them at each other
 * and a bridge in between shortens the reach of the one behind it.
 *
 * Two consequences a rate cannot express. A bridge with nobody to link to refuses
 * everything, yet still receives from the bridge behind it, because that transfer goes
 * straight to `handleItem` and never asks. And the receiving end **blocks the face the
 * beam arrives on**: a duct trying to feed that side is refused forever, which looks like
 * a bug in the layout and is a rule of the block.
 */
const ductBridge = {
  begin(build) {
    build.state.progress = 0;
    build.state.occupied = [null, null, null, null];
  },

  acceptItem(build, source, item) {
    if (!bridgeLink(build)) return false;
    const side = build.relativeTo(source);
    return build.items.total < build.itemCapacity
      && side !== build.rotation
      && !build.state.occupied[(side + 2) % 4];
  },

  handleItem(build, source, item) {
    build.items.add(item);
  },

  update(build, world, step) {
    const speed = build.block.duct_speed || 5;
    const link = bridgeLink(build);
    build.state.link = link;

    if (link) {
      link.state.occupied[build.rotation % 4] = build;
      if (build.items.total > 0 && link.items.total < link.itemCapacity) {
        // No division by `speed` here, unlike a duct: the counter runs at one a frame and
        // the leftover is carried over, so the rate is exactly `60 / speed` with no
        // rounding anywhere.
        build.state.progress += build.delta(step);
        while (build.state.progress > speed) {
          const next = build.items.first();
          if (next && link.items.total < link.itemCapacity) {
            build.items.remove(next);
            link.handleItem(build, next);
          }
          build.state.progress -= speed;
        }
      }
    } else if (build.items.total > 0) {
      // Unlinked, it is an ordinary block pushing at whatever is in front of it, one item
      // a frame at most.
      const next = build.items.first();
      const front = build.facing(world);
      if (front && front.acceptItem(build, next)) {
        front.handleItem(build, next);
        build.items.remove(next);
      }
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
 * Everything defensive, in the only state a still schematic can be measured in: at rest.
 *
 * With nothing to shoot at, these blocks are not idle in the same way, and the differences
 * are exactly what a schematic needs to know. Four different answers:
 *
 * - A **liquid turret** swallows its whole tank once and never drinks again. Its water is
 *   a stock, not a rate: reading it as a consumer invents a demand that does not exist.
 * - A **power turret** draws until it has finished reloading, three seconds at most, and
 *   then stops dead. `shouldConsume()` is `isShooting || reloadCounter < reload`, and a
 *   block that consumes nothing asks the grid for nothing.
 * - A **meltdown** is the opposite: it starts fully reloaded and spends the next seven and
 *   a half seconds drinking two hundred and twenty five water to wind **down** to zero.
 *   That drain is scaled by `delta()` and not by `edelta()`, so it happens whether or not
 *   the turret has any power at all.
 * - A **projector** never stops. It draws its power every frame, damage or no damage, and
 *   eats one item every few seconds. A mender beside an undamaged wall eats silicon for
 *   ever, and that is a real leak in a schematic rather than a rounding error.
 *
 * Source: `mindustry.world.blocks.defense.turrets.*` and `..defense.*`, v159.7.
 */

/**
 * Anything with a barrel that has nothing to shoot at.
 *
 * `Turret.shouldConsume` is `isShooting || reloadCounter < reload`, and with no target
 * `isShooting` is false, so the only draw is the run up to a full reload. Coolant speeds
 * that up and is drunk while it lasts: a lancer finishes in fifty seven frames rather than
 * eighty and drinks eleven and a half water doing it.
 *
 * A build tower and a tractor beam have the same shape and never start: one needs a
 * rebuild plan, the other a target, and neither exists in a measurement.
 */
const turretIdle = {
  begin(build) {
    build.state.reload = 0;
    build.state.wants = 0;
  },

  acceptLiquid(build, source, liquid) {
    if (!build.block.has_liquids) return false;
    if (build.block.drinks && !build.block.drinks.includes(liquid)) return false;
    /* `LiquidTurret.acceptLiquid` swaps ammunition only once what it holds is down to a
       single shot's worth, which for a tsunami is two and a half units rather than one.
       Everything else is the ordinary rule. */
    return (!build.liquid || build.liquid === liquid || build.liquidAmount < 0.2)
      && build.liquidAmount < build.liquidCapacity;
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const block = build.block;
    const reload = block.reload || 0;

    // Only a power turret runs itself up. A tractor beam wants a target and a build tower
    // wants a plan, and with neither the answer is zero for the whole measurement.
    const runsUp = block.kind === "PowerTurret" && reload > 0;
    if (!runsUp || build.state.reload >= reload) {
      build.state.wants = 0;
      return;
    }

    build.state.wants = 1;
    const delta = build.delta(step);
    const efficiency = block.power > 0 ? (build.state.power ?? 1) : 1;
    build.state.reload += delta * efficiency;

    // `ReloadTurret.updateCooling`, which is a booster rather than a requirement: the
    // turret reloads without it, just slower.
    const coolant = block.coolant_amount || 0;
    const worth = block.coolant_worth?.[build.liquid] || 0;
    if (coolant > 0 && worth > 0 && efficiency > 0 && build.liquids.currentAmount > 0) {
      const used = Math.min(build.liquids.currentAmount, coolant * delta);
      build.liquids.remove(build.liquids.current, used);
      build.state.reload += used * worth * efficiency;
    }
  },
};

/**
 * A meltdown, which winds down instead of up.
 *
 * `placed()` sets its reload counter to full and `updateReload` is overridden to do
 * nothing, so the only thing that moves the counter is coolant being spent to lower it.
 * Two hundred and twenty five water on a tank that holds sixty, over seven and a half
 * seconds, and then it stops for good.
 *
 * The drain uses `delta()` rather than `edelta()`: an unpowered meltdown drinks exactly as
 * fast as a powered one. That is the fact worth measuring, because it is the one nobody
 * would guess.
 */
const laserTurret = {
  begin(build) {
    build.state.reload = build.block.reload || 0;
    build.state.wants = 0;
  },

  acceptLiquid: turretIdle.acceptLiquid,
  acceptItem() { return false; },

  update(build, world, step) {
    const block = build.block;
    if (build.state.reload <= 0) return;

    const held = build.liquids.currentAmount;
    const used = Math.min(held, block.coolant_amount || 0) * build.delta(step);
    if (used <= 0) return;
    build.state.reload -= used * (block.coolant_worth?.[build.liquids.current] || 0);
    build.liquids.remove(build.liquids.current, used);
  },
};

/**
 * A mender, and the mend projector that shares its class.
 *
 * It draws its power unconditionally: `shouldConsume` is not overridden, so a mender with
 * nothing to repair is a mender drawing power. And it eats one item every `useTime` ticks
 * for as long as it has both power and stock, again whether or not anything is damaged.
 *
 * The clock is the game's **global** one rather than a counter on the block, so every
 * mender on a map consumes on the same frame. Placed at time zero, as a measurement is,
 * the first item goes on the very first frame.
 */
const mendProjector = {
  begin(build) {
    build.state.timer = Infinity;
    build.state.wants = 1;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const every = build.block.use_time || 400;
    const powered = build.block.power > 0 ? (build.state.power ?? 1) > 0 : true;
    const stocked = Object.keys(build.block.boost_input || {})
      .every((item) => build.items.get(item) > 0);

    build.state.timer += build.delta(step);
    if (build.state.timer >= every && powered && stocked) {
      build.state.timer = 0;
      for (const [item, amount] of Object.entries(build.block.boost_input || {})) {
        build.items.remove(item, amount);
      }
    }
  },
};

/**
 * An overdrive projector, and the dome that shares its class.
 *
 * Same permanent power draw as a mender, but its item clock is a counter on the block
 * rather than the global one, so it is aligned to when it was placed. And the guard is
 * only `efficiency > 0`: it calls `consume()` on schedule **even with nothing in stock**,
 * which does nothing but must not be skipped, or the counter drifts.
 *
 * The dome is the odd one out: `hasBoost` is false and its two items are requirements
 * rather than bonuses, so without them it has no efficiency and boosts nothing at all.
 */
const overdriveProjector = {
  begin(build) {
    build.state.used = 0;
    build.state.wants = 1;
  },

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const block = build.block;
    const needed = Object.keys(block.input || {});
    const stocked = needed.every((item) => build.items.get(item) > 0);
    const powered = block.power > 0 ? (build.state.power ?? 1) > 0 : true;
    if (!powered || !stocked) return;

    build.state.used += build.delta(step);
    if (build.state.used >= (block.use_time || 400)) {
      build.state.used %= block.use_time || 400;
      for (const [item, amount] of Object.entries(block.input || {})) {
        build.items.remove(item, amount);
      }
      for (const [item, amount] of Object.entries(block.boost_input || {})) {
        build.items.remove(item, amount);
      }
    }
  },
};

/**
 * A force projector.
 *
 * Its coolant is the surprise: it accepts sixty units and drinks **none of it**. The only
 * place the coolant is spent sits inside `if (buildup > 0)`, and `buildup` only rises when
 * a bullet is absorbed. For a schematic that is a dead stock, not a supply line.
 *
 * The phase fabric is the opposite: one every three hundred and fifty ticks, for ever, on
 * the game's global clock. And `broken` starts true, so the very first frame is skipped
 * while the shield comes up.
 */
const forceProjector = {
  begin(build) {
    build.state.timer = Infinity;
    build.state.broken = true;
    build.state.wants = 1;
  },

  acceptLiquid: turretIdle.acceptLiquid,

  acceptItem(build, source, item) {
    return build.wants(item) && build.items.get(item) < build.itemCapacity;
  },

  update(build, world, step) {
    const every = build.block.use_time || 350;
    const powered = build.block.power > 0 ? (build.state.power ?? 1) > 0 : true;
    const stocked = Object.keys(build.block.boost_input || {})
      .every((item) => build.items.get(item) > 0);

    build.state.timer += build.delta(step);
    if (stocked && !build.state.broken && build.state.timer >= every && powered) {
      build.state.timer = 0;
      for (const [item, amount] of Object.entries(build.block.boost_input || {})) {
        build.items.remove(item, amount);
      }
    }
    // `if(broken && buildup <= 0) broken = false`, and buildup is zero until something
    // hits the shield.
    build.state.broken = false;
  },
};

/**
 * A block that draws power only when it has something to work on.
 *
 * A regen projector, a repair turret, a repair tower: `shouldConsume` is "are there any
 * targets", and a schematic has no damaged blocks and no units standing in it. So all
 * three are **free**, and counted as permanent consumers they invented four hundred and
 * twenty power a second between them. That dims a whole base in the report and in nothing
 * else, which is the worst kind of wrong: it looks like a finding.
 */
const idlePower = {
  begin(build) { build.state.wants = 0; },
  acceptItem() { return false; },
  acceptLiquid() { return false; },
};

/**
 * An incinerator: a sink with a condition, and a **wall** when it is unpowered.
 *
 * `acceptItem` is `heat > 0.5`, and `heat` creeps towards `efficiency` at 0.04 a frame:
 * thirteen frames of power before it will take anything, and nothing ever if the grid is
 * down. A belt into an unpowered incinerator backs up, which is the opposite of what a
 * sink does and exactly the sort of thing a player wants told.
 *
 * The slag one asks `efficiency > 0` rather than heat, and its efficiency is its slag
 * rather than its power.
 */
const incinerator = {
  begin(build) {
    build.state.heat = 0;
    build.state.wants = 1;
  },

  acceptItem(build) {
    return build.block.power > 0 ? build.state.heat > 0.5 : build.state.efficiency > 0;
  },

  handleItem(build) { build.state.burned = (build.state.burned || 0) + 1; },

  acceptLiquid(build, source, liquid) {
    const known = build.world?.catalogue?.liquids?.[liquid];
    if (!known?.incinerable) return false;
    return build.block.power > 0 ? build.state.heat > 0.5 : build.state.efficiency > 0;
  },

  update(build, world, step) {
    let efficiency = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    for (const [liquid, rate] of Object.entries(build.block.input_liquid || {})) {
      const wanted = (rate / TICKS) * build.delta(step);
      if (wanted <= 0) continue;
      efficiency = Math.min(efficiency, build.liquids.get(liquid) / wanted);
      build.liquids.remove(liquid, wanted * efficiency);
    }
    build.state.efficiency = Math.max(0, Math.min(1, efficiency));
    build.state.heat = approachTo(build.state.heat, build.state.efficiency,
                                  0.04 * build.delta(step));
    // Whatever it was handed is gone; it holds nothing.
    build.items.clear();
  },
};

/** `Mathf.approachDelta`, which several blocks here need and none of them shared. */
const approachTo = (from, to, speed) =>
  (from < to ? Math.min(to, from + speed) : Math.max(to, from - speed));

/**
 * A sandbox drain: whatever is handed to it is gone.
 *
 * Filed under items, a liquid void refused every drop and the pipe into it backed up
 * instead of emptying, which is the opposite of the one thing the block is for.
 */
const drain = {
  begin(build) { build.state.voided = 0; },
  acceptItem() { return true; },
  handleItem(build) { build.state.voided++; },
  acceptLiquid() { return true; },
  handleLiquid(build) { build.state.voided++; },
};

/** A radar: power, for ever, and nothing else. It takes no items and no liquids. */
const radar = {
  begin(build) { build.state.wants = 1; },
  acceptItem() { return false; },
  acceptLiquid() { return false; },
};

/**
 * Erekir's unloader, which does not unload the way Serpulo's does.
 *
 * Serpulo's stands between two things and shuffles items until their ratios match. This one
 * has a direction: it takes from the block **behind** it and hands to the block in
 * **front**, one item every `speed` frames, and cares nothing for how full either is. Two
 * blocks with the same word in their name and no behaviour in common.
 *
 * Left as a sink, it was a hole in the middle of every Erekir bus.
 */
const directionalUnloader = {
  begin(build) {
    build.state.timer = 0;
    build.state.offset = 0;
  },

  acceptItem() { return false; },

  update(build, world, step) {
    const speed = build.block.speed || 1;
    build.state.timer += build.delta(step);
    if (build.state.timer < speed) return;
    build.state.timer %= speed;

    const front = build.facing(world);
    const [dx, dy] = DIRECTIONS[(build.rotation + 2) % 4];
    const back = world.at(build.x + dx, build.y + dy);
    if (!front || !back || !back.block.unloadable) return;

    const wanted = build.node.configured;
    if (wanted) {
      if (back.items.get(wanted) > 0 && front.acceptItem(build, wanted)) {
        front.handleItem(build, wanted);
        back.items.remove(wanted);
      }
      return;
    }

    /* Unset, it walks the whole item list from wherever it left off and takes the first it
       can move, then starts the next walk one past that. Not a rotation over containers: a
       rotation over **item kinds**, which is why an unset one alternates evenly between
       two items in the same vault. */
    const items = [...back.items.counts.keys()];
    for (let i = 0; i < items.length; i++) {
      const item = items[(i + build.state.offset) % items.length];
      if (back.items.get(item) > 0 && front.acceptItem(build, item)) {
        front.handleItem(build, item);
        back.items.remove(item);
        build.state.offset = (i + build.state.offset + 1) % items.length;
        return;
      }
    }
  },
};

const BY_ROLE = {
  conveyor,
  "stack-conveyor": stackConveyor,
  source,
  router,
  junction,
  sorter,
  bridge,
  "mass-driver": massDriver,
  store,
  unloader,
  sink,
  turret: itemTurret,
  generator: sink,
  duct,
  core,
  "duct-router": ductRouter,
  "stack-router": stackRouter,
  "duct-bridge": ductBridge,
  "duct-unloader": directionalUnloader,
  "turret-idle": turretIdle,
  tractor: turretIdle,
  "laser-turret": laserTurret,
  "idle-power": idlePower,
  void: drain,
  incinerator,
  mender: mendProjector,
  projector: overdriveProjector,
  shield: forceProjector,
  radar,
  ...MACHINES,
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
  // An overflow duct is a duct with a preference, not a gate: it moves like a duct and
  // chooses like a gate, so it cannot be either of the two.
  if (node.block.overflow && node.role === "duct") return overflowDuct;
  if (node.block.overflow) return overflow;
  /* What a block carries picks the behaviour as much as its role does. A liquid router and
     an item router share the role "router" in the catalogue, because to a maximum flow
     they are the same shape, and to a simulation they are nothing alike. */
  if (node.block.carries === "liquid") return LIQUIDS[node.role] || null;
  // Cargo is a third network, and it moves like neither of the other two.
  if (node.block.carries === "payload") return PAYLOADS[node.role] || null;
  if (node.role === "pump") return LIQUIDS.pump;
  // The sandbox power tap is filed under the grid rather than under generators, because
  // that is what it is: a wire that never runs out.
  if (node.role === "diode") return POWER.diode;
  if (node.role === "power" && node.block.power_out > 0) return POWER.freeGenerator;
  if (node.role === "generator") {
    /* Six classes share the word "generator" and no behaviour whatsoever, so this goes by
       class rather than by whether a recipe was written down. A thermal generator reads
       the ground, an impact reactor reads its own warmup and pays for the privilege, a
       nuclear reactor reads how full it is, a flux reactor reads the heat pressed against
       it. Told apart by "does it name a fuel", four of the six were a burner. */
    const byKind = {
      ThermalGenerator: POWER.thermal,
      SolarGenerator: POWER.freeGenerator,
      ImpactReactor: POWER.impact,
      NuclearReactor: POWER.nuclear,
      VariableReactor: POWER.variable,
    };
    if (byKind[node.block.kind]) return byKind[node.block.kind];
    return Object.keys(node.block.input || {}).length
      || node.block.accepts || node.block.input_liquid
      ? POWER.burner : POWER.freeGenerator;
  }
  return BY_ROLE[node.role] || null;
}
