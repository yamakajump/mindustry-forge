/**
 * Cargo: a unit or a block being carried around whole.
 *
 * A third network, after items and liquids, and nothing like either. An item is handed on
 * and either fits or does not; a liquid moves by pressure. A payload **slides**: it has a
 * position inside the block holding it, it takes real time to arrive, and the block waiting
 * on it does nothing until it has. A reconstructor does not start on the frame the conveyor
 * hands the unit over, it starts eighteen frames later.
 *
 * The whole family was filed as sinks, so every one of them was a hole: a reconstructor
 * swallowed what a conveyor gave it, and its silicon and its power were counted as consumed
 * by nobody.
 *
 * Source: `mindustry.world.blocks.payloads.*` and `..blocks.units.Reconstructor`, v159.7.
 */

import { byItemId, DIRECTIONS, Held, Liquids } from "./core.js";

/** Pixels to a tile, which is the unit `payVector` is measured in. */
const TILE = 8;

/** `PayloadBlock.payloadSpeed` and `payloadRotateSpeed`, both fixed on the class. */
const speedOf = (build) => build.block.payload_speed ?? 0.7;
const turnOf = (build) => build.block.payload_rotate_speed ?? 5;

/** Degrees, as the game counts them: zero is east and it goes anticlockwise. */
const facingDegrees = (build) => (build.rotation % 4) * 90;

/**
 * `Vec2.approach`: step towards a point by at most `speed`, and land on it exactly.
 *
 * Not a lerp. A payload arrives at a fixed number of pixels a frame however far it has to
 * go, which is why a big block takes longer to load than a small one.
 */
function approachPoint(from, to, speed) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const away = Math.hypot(dx, dy);
  if (away <= speed || away === 0) return [to[0], to[1]];
  return [from[0] + (dx / away) * speed, from[1] + (dy / away) * speed];
}

/** `Angles.moveToward`, the short way round. */
export function turnToward(from, to, speed) {
  let apart = ((to - from) % 360 + 540) % 360 - 180;
  if (Math.abs(apart) <= speed) return to;
  return from + Math.sign(apart) * speed;
}

/**
 * What a block carries: a `Payload`.
 *
 * A name was enough while nothing looked inside one, and three blocks do: a loader fills
 * the block it holds, an unloader empties it, and a deconstructor gives it back as its own
 * build cost. A `BuildPayload` is a whole building, and it brings its stock with it.
 */
export class Cargo {
  constructor(name) {
    this.name = name;
    this.items = new Held();
    this.liquids = new Liquids();
  }
}

/**
 * `PayloadBlockBuild.moveInPayload`: pull the cargo to the middle, and say when it is there.
 *
 * `hasArrived()` is `payVector.isZero(0.01f)`, and `Vec2.isZero(margin)` compares the
 * **square** of the length: the real threshold is a tenth of a pixel, not a hundredth. A
 * factor of ten, in the direction that makes a port look slower than the game.
 */
export function moveInPayload(build, rotate = true) {
  const state = build.state;
  if (!state.payload) return false;
  state.payVector = approachPoint(state.payVector, [0, 0], speedOf(build) * build.delta(1));
  if (rotate) {
    state.payRotation = turnToward(state.payRotation,
      build.block.rotate ? facingDegrees(build) : 90, turnOf(build) * build.delta(1));
  }
  return Math.hypot(state.payVector[0], state.payVector[1]) < 0.1;
}

/**
 * `PayloadBlockBuild.moveOutPayload`: push the cargo to the front edge, then hand it on.
 *
 * The target is half the block's own width along the way it points, so a nine wide
 * tetrative reconstructor spends fifty frames pushing a unit out before anything downstream
 * sees it.
 */
export function moveOutPayload(build, world) {
  const state = build.state;
  if (!state.payload) return;

  const reach = (build.size * TILE) / 2;
  const [dx, dy] = DIRECTIONS[build.rotation % 4];
  const target = [dx * reach, dy * reach];

  state.payRotation = turnToward(state.payRotation, facingDegrees(build),
                                 turnOf(build) * build.delta(1));
  state.payVector = approachPoint(state.payVector, target, speedOf(build) * build.delta(1));

  const arrived = Math.hypot(state.payVector[0] - target[0],
                             state.payVector[1] - target[1]) < 0.001;
  if (!arrived) return;

  const front = payloadFront(build, world);
  const canMove = !!front
    && (front.block.outputs_payload || front.block.accepts_payload);

  if (canMove) {
    if (front.acceptPayload?.(build, state.payload)) {
      front.handlePayload(build, state.payload);
      state.payload = null;
    }
    return;
  }

  /* `canDump = front == null || !front.tile.solid()`, and the cargo is set down on the
     ground.

     Anything at all in front used to count as a wall here. A ground factory pointed at a
     conveyor is the ordinary layout, and it built exactly one dagger before sitting on
     sixty silicon and forty lead for the rest of the run. A conveyor, a duct, a pipe, a
     router: none of them are solid, so the game drops the unit beside them and carries on.

     What the game does next, this does not: a `dump` is refused while another ground unit
     is still standing on the spot, and whether it has walked off by then is its own AI's
     business. */
  if (!front || !front.block.solid) {
    state.payload = null;
    state.made = (state.made || 0) + 1;
  }
}

/**
 * `Building.movePayload` and `PayloadConveyor.onProximityUpdate`: what is in front.
 *
 * `size/2 + 1` tiles along the way it points, which for two blocks of the same size is the
 * next one along and not the tile touching it. A three wide conveyor reaches two tiles past
 * its own edge, so a chain of them has to be laid three apart exactly.
 */
export function payloadFront(build, world) {
  const reach = Math.trunc(build.size / 2) + 1;
  const [dx, dy] = DIRECTIONS[build.rotation % 4];
  return world.at(build.x + dx * reach, build.y + dy * reach);
}

/**
 * A payload conveyor, whose clock is not its own.
 *
 * `curStep = (int)(Time.time / moveTime)`: every payload conveyor on the map steps on the
 * same frame, and a payload spends exactly `moveTime` frames on each one however long the
 * line is. `acceptPayload` then only says yes in the first five frames of a step, which is
 * what stops two conveyors handing the same cargo twice in one step.
 */
const payloadConveyor = {
  begin(build) {
    build.state.payload = null;
    build.state.step = -1;
    build.state.accepted = -1;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
  },

  acceptPayload(build, source, payload) {
    return build.state.payload === null
      && (source === build || (build.world.tick % moveTime(build)) <= 5);
  },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.accepted = step(build);
    build.state.payVector = offsetFrom(build, source);
  },

  update(build, world, step_) {
    const now = step(build);
    if (now <= build.state.step) return;

    const valid = build.state.step !== -1;
    build.state.step = now;
    if (!valid || build.state.accepted === now || !build.state.payload) return;

    const next = payloadFront(build, world);
    if (!next) return;

    /* "Trigger update forward", and it is not an optimisation.

       The game updates the **next** conveyor before offering to it, so a whole line
       advances in one step: the far end empties, then the one behind it, back to here.
       Without it each conveyor waits for the one in front to have moved on its own, and a
       line of four carries a payload at a quarter of the rate. `updateTile` is idempotent
       within a step, so calling it early costs nothing when the outer loop arrives. */
    next.behaviour?.update?.(next, world, step_);

    if (next.acceptPayload?.(build, build.state.payload)) {
      next.handlePayload(build, build.state.payload);
      build.state.payload = null;
    }
  },
};

const moveTime = (build) => build.block.move_time || 45;
const step = (build) => Math.floor(build.world.tick / moveTime(build));

/** Where the cargo starts inside the receiving block: the direction it came from. */
function offsetFrom(build, source) {
  if (!source || source === build) return [0, 0];
  const half = (build.size * TILE) / 2;
  const dx = Math.max(-half, Math.min(half, (source.x - build.x) * TILE));
  const dy = Math.max(-half, Math.min(half, (source.y - build.y) * TILE));
  return [dx, dy];
}

/**
 * A payload router, which is a conveyor that turns.
 *
 * Same clock, same five frame window, and one extra rule: it sends the cargo out of a face
 * chosen by a rotating cursor rather than always forward. Set to a unit type it sends that
 * one forward and everything else out the sides, exactly as a duct router does with items.
 */
const payloadRouter = {
  begin: payloadConveyor.begin,
  acceptPayload: payloadConveyor.acceptPayload,
  handlePayload: payloadConveyor.handlePayload,

  update(build, world) {
    const now = step(build);
    if (now <= build.state.step) return;

    const valid = build.state.step !== -1;
    build.state.step = now;
    if (!valid || build.state.accepted === now || !build.state.payload) return;

    // Every face but the one it came in by, walked from the rotating cursor.
    const reach = Math.trunc(build.size / 2) + 1;
    for (let i = 0; i < 4; i++) {
      const side = (build.cdump + i) % 4;
      const [dx, dy] = DIRECTIONS[side];
      const next = world.at(build.x + dx * reach, build.y + dy * reach);
      if (next && next.acceptPayload?.(build, build.state.payload)) {
        next.handlePayload(build, build.state.payload);
        build.state.payload = null;
        build.cdump = (side + 1) % 4;
        return;
      }
    }
  },
};

/**
 * A sandbox payload source: it conjures whatever it is set to, for ever.
 *
 * The only way to feed a reconstructor in a measurement, because nothing else in a
 * schematic makes units out of nothing.
 */
const payloadSource = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
  },

  acceptPayload() { return false; },

  update(build, world) {
    if (!build.state.payload) {
      const made = build.node.configured;
      if (!made) return;
      build.state.payload = new Cargo(made);
      build.state.payVector = [0, 0];
      build.state.payRotation = facingDegrees(build);
    }
    moveOutPayload(build, world);
  },
};

/**
 * A sandbox payload void: it takes anything, and burns it once it has arrived.
 *
 * Not instant, which matters for a measurement: five wide, so the cargo slides twenty
 * pixels at 1.2 a frame before it goes. A void fed every forty five frames is holding
 * something about a third of the time, and at any given instant it probably is.
 */
const payloadVoid = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    build.state.voided = 0;
  },

  acceptPayload(build) { return build.state.payload === null; },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.payVector = offsetFrom(build, source);
  },

  update(build) {
    if (build.state.payload && moveInPayload(build, false)) {
      build.state.payload = null;
      build.state.voided++;
    }
  },
};

/**
 * A reconstructor: a unit goes in, a better unit comes out.
 *
 * Three cadences in one block, and getting any of them onto the wrong clock makes the
 * stocks diverge immediately:
 * - **items**, in one batch when the build finishes, through `consume()`;
 * - **liquid**, every frame, proportional to how well it is running;
 * - **power**, every frame, through the grid.
 *
 * And `shouldConsume()` reads a **cached** flag rather than asking the question: the field
 * is refreshed at the top of `updateTile`, and consumption is worked out before that, so on
 * the frame a unit arrives the reconstructor is still officially doing nothing. One frame,
 * and it is the game's own.
 */
const reconstructor = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    build.state.progress = 0;
    build.state.constructing = false;
  },

  acceptItem(build, source, item) {
    // Per item, not per block: `capacities[item.id]`, which is not `itemCapacity`.
    return build.wants(item) && build.items.get(item) < roomFor(build, item);
  },

  acceptPayload(build, source, payload) {
    return build.state.payload === null
      && build.relativeTo(source) !== build.rotation
      && Boolean(upgradeOf(build, payload.name));
  },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.payVector = offsetFrom(build, source);
  },

  update(build, world, step_) {
    const block = build.block;
    const delta = build.delta(step_);

    /* Read before it is refreshed, which is what the game does: `updateConsumption` runs
       before `updateTile` and looks at the field, not the method. */
    const consuming = build.state.constructing;
    build.state.constructing = Boolean(build.state.payload)
      && Boolean(upgradeOf(build, build.state.payload.name));

    let efficiency = consuming ? 1 : 0;
    if (efficiency > 0) {
      for (const [item, amount] of Object.entries(block.input || {})) {
        if (build.items.get(item) < amount) efficiency = 0;
      }
      for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
        const wanted = (rate / 60) * delta;
        if (wanted <= 0) continue;
        efficiency = Math.min(efficiency, build.liquids.get(liquid) / wanted);
      }
      if (block.power > 0) efficiency = Math.min(efficiency, build.state.power ?? 1);
    }
    efficiency = Math.max(0, Math.min(1, efficiency));
    build.state.wants = consuming ? 1 : 0;

    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      build.liquids.remove(liquid, (rate / 60) * delta * efficiency);
    }

    if (!build.state.payload) return;

    if (!upgradeOf(build, build.state.payload.name)) {
      // Nothing more to do with it: push it out and let something downstream have it.
      moveOutPayload(build, world);
      return;
    }

    if (!moveInPayload(build)) return;

    if (efficiency > 0) build.state.progress += delta * efficiency;

    if (build.state.progress >= (block.construct_time || 120)) {
      build.state.payload = new Cargo(upgradeOf(build, build.state.payload.name));
      // `progress %= 1f`, which is the game's own oddity: not zero, and not one craft's
      // worth taken off. The leftover is thrown away and the next build starts from a
      // fraction of a frame.
      build.state.progress %= 1;
      for (const [item, amount] of Object.entries(block.input || {})) {
        build.items.remove(item, amount);
      }
      build.state.made = (build.state.made || 0) + 1;
    }
  },
};

/** What this reconstructor turns that unit into, or nothing. */
function upgradeOf(build, unit) {
  const found = (build.block.upgrades || []).find((pair) => pair.from === unit);
  return found ? found.to : null;
}

/** `getMaximumAccepted`: the cap for **this** item, which differs from the block's own. */
function roomFor(build, item) {
  return build.block.capacities?.[item] ?? build.itemCapacity;
}

/**
 * A constructor: items in, a block out as cargo.
 *
 * The only block in the game whose ingredients **and** whose clock are both its
 * configuration. What it eats is the build cost of whatever it was set to, and how long it
 * takes is that block's build time, which is itself derived from the cost rather than
 * written down anywhere.
 *
 * Its cap is twice the recipe, per ingredient, and zero for anything the recipe does not
 * name: a constructor set to nothing accepts nothing at all.
 */
const constructor = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    build.state.progress = 0;
  },

  acceptItem(build, source, item) {
    return build.items.get(item) < recipeRoom(build, item);
  },

  acceptPayload() { return false; },

  update(build, world, step_) {
    const made = allowedRecipe(build);
    const recipe = made ? build.world.catalogue?.blocks?.[made] : null;
    const cost = recipe?.cost || {};

    let efficiency = made ? 1 : 0;
    for (const [item, amount] of Object.entries(cost)) {
      if (build.items.get(item) < amount) efficiency = 0;
    }
    if (build.block.power > 0) efficiency = Math.min(efficiency, build.state.power ?? 1);
    build.state.wants = made && build.state.payload === null ? 1 : 0;

    if (made && efficiency > 0 && build.state.payload === null) {
      build.state.progress += (build.block.build_speed ?? 0.4) * efficiency * build.delta(step_);
      if (build.state.progress >= (recipe.build_time || 1)) {
        for (const [item, amount] of Object.entries(cost)) build.items.remove(item, amount);
        build.state.payload = new Cargo(made);
        build.state.payVector = [0, 0];
        // `progress %= 1f` again, and again it throws the leftover away.
        build.state.progress %= 1;
        build.state.made = (build.state.made || 0) + 1;
      }
    }

    moveOutPayload(build, world);
  },
};

/**
 * What it was set to, if it is allowed to make it.
 *
 * `canProduce`: a constructor carries a list of seven blocks and refuses a configuration
 * outside it. Set to something it will not make it reports no recipe at all, `shouldConsume`
 * is false, and it sits at zero looking perfectly healthy.
 */
function allowedRecipe(build) {
  const made = build.node.configured;
  if (!made) return null;
  const list = build.block.produces;
  return !list || list.includes(made) ? made : null;
}

/** `getMaximumAccepted`: twice the recipe, and nothing for what the recipe does not name. */
function recipeRoom(build, item) {
  const made = allowedRecipe(build);
  const recipe = made ? build.world.catalogue?.blocks?.[made] : null;
  const amount = recipe?.cost?.[item];
  return amount ? amount * 2 : 0;
}


/**
 * A payload loader: items and liquid off a belt and into the block it is holding.
 *
 * The whole point of a `BuildPayload` is that it is a **building**, stock and all, and the
 * three blocks below are the only ones that look inside one. A loader fills a vault it is
 * carrying, an unloader empties it, and a deconstructor gives it back as its own build
 * cost. Until now a payload here was a name and nothing else.
 *
 * `exporting` is the flag that makes it usable: the moment the block it holds will not take
 * any more, the loader pushes it out and waits for the next one. Without it a loader with a
 * full vault sits there for ever and the belt behind it backs up.
 *
 * Not modelled, and said rather than hidden: a battery as cargo. `consumePowerDynamic` and
 * `power.status` on a carried building are a second power model on top of the one the grid
 * already runs, for the one exotic case of ferrying charge about.
 */
const payloadLoader = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    build.state.timer = -Infinity;
    build.state.exporting = false;
    build.state.wants = 0;
  },

  acceptPayload(build, source, payload) {
    if (build.state.payload) return false;
    const held = build.world?.catalogue?.blocks?.[payload.name];
    if (!held) return false;
    // A container, a tank or a battery, and nothing bigger than it can hold.
    if ((held.size || 1) > (build.block.max_block_size ?? 3)) return false;
    return (held.unloadable && (held.item_capacity || 0) >= 10)
      || (held.has_liquids && (held.liquid_capacity || 0) >= 10)
      || (held.power_capacity || 0) > 0;
  },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.payVector = offsetFrom(build, source);
    build.state.exporting = false;
  },

  /* `items.total() < itemCapacity && !(source instanceof PayloadUnloaderBuild)`: a loader
     refuses a **decharger**, and only a decharger. Without it a loader and an unloader
     standing side by side pass the same items back and forth for ever, and the pair reads
     as carrying twice what it carries. */
  acceptItem(build, source, item) {
    return build.items.total < build.itemCapacity
      && source?.behaviour !== payloadUnloader;
  },

  acceptLiquid(build, source, liquid) {
    return build.liquids.get(liquid) < build.liquidCapacity;
  },

  update(build, world, step) {
    const cargo = build.state.payload;
    build.state.wants = cargo ? 1 : 0;
    if (!cargo) return;

    const held = world.catalogue?.blocks?.[cargo.name];
    if (shouldExport(build, cargo, held)) {
      moveOutPayload(build, world);
      return;
    }
    if (!moveInPayload(build)) return;

    const efficiency = build.block.power > 0 ? (build.state.power ?? 1) : 1;
    const delta = build.delta(step);

    /* Items, in batches on a timer that runs faster the better the block is fed. An
       `Interval` against the **map clock**, and not a stopwatch on the block: it keeps
       running while the loader waits for a payload, so the first batch goes in on the very
       frame a fresh container arrives rather than two frames later. */
    if (held?.item_capacity && build.items.total > 0 && efficiency > 0.01) {
      const every = (build.block.load_time ?? 2) / efficiency;
      if (world.tick - build.state.timer >= every) {
        build.state.timer = world.tick;
        let moved = false;
        for (let i = 0; i < (build.block.items_loaded ?? 8) && build.items.total; i++) {
          const item = byItemId(build, [...build.items.counts.keys()])
            .find((one) => build.items.get(one) > 0);
          if (!item) break;
          if (cargo.items.total < (held.item_capacity || 0)) {
            cargo.items.add(item);
            build.items.remove(item);
            moved = true;
          } else {
            build.state.exporting = true;
            break;
          }
        }
        if (!moved) build.state.exporting = true;
      }
    }

    // And liquid, continuously.
    if (held?.has_liquids && build.liquids.currentAmount >= 0.001) {
      const liquid = build.liquids.current;
      const room = (held.liquid_capacity || 10) - cargo.liquids.get(liquid);
      const flow = Math.min((build.block.liquids_loaded ?? 40) * delta * efficiency,
                            room, build.liquids.currentAmount);
      if (room <= 0) build.state.exporting = true;
      else if (flow > 0) {
        cargo.liquids.add(liquid, flow);
        build.liquids.remove(liquid, flow);
      }
    }
  },
};

/** `shouldExport`: the cargo is full, or it refused something. */
function shouldExport(build, cargo, held) {
  if (build.state.exporting) return true;
  if (held?.has_liquids && build.liquids.currentAmount >= 0.1
      && cargo.liquids.currentAmount >= (held.liquid_capacity || 10) - 0.001) {
    return true;
  }
  return false;
}

/**
 * A payload unloader, which is a loader run backwards and is **not** symmetrical.
 *
 * It refuses items and liquid from its sides outright, empties whatever it is holding into
 * itself, and pushes the block out the moment it is dry. And it dumps four times a frame
 * rather than once, which is what makes it faster than the belt it feeds.
 */
const payloadUnloader = {
  ...payloadLoader,

  acceptItem() { return false; },
  acceptLiquid() { return false; },

  update(build, world, step) {
    const cargo = build.state.payload;
    build.state.wants = cargo ? 1 : 0;

    if (cargo) {
      const held = world.catalogue?.blocks?.[cargo.name];
      if (emptyEnough(cargo, held)) {
        moveOutPayload(build, world);
      } else if (moveInPayload(build)) {
        const efficiency = build.block.power > 0 ? (build.state.power ?? 1) : 1;
        const delta = build.delta(step);

        if (held?.item_capacity && build.items.total < build.itemCapacity
            && efficiency > 0.01) {
          const every = (build.block.load_time ?? 2) / efficiency;
          if (world.tick - build.state.timer >= every) {
            build.state.timer = world.tick;
            for (let i = 0; i < (build.block.items_loaded ?? 8); i++) {
              if (build.items.total >= build.itemCapacity) break;
              const item = byItemId(build, [...cargo.items.counts.keys()])
                .find((one) => cargo.items.get(one) > 0);
              if (!item) break;
              cargo.items.remove(item);
              build.items.add(item);
            }
          }
        }

        if (held?.has_liquids && cargo.liquids.currentAmount >= 0.01
            && (build.liquids.current === cargo.liquids.current
                || build.liquids.currentAmount <= 0.2)) {
          const liquid = cargo.liquids.current;
          const flow = Math.min((build.block.liquids_loaded ?? 40) * delta * efficiency,
                                build.liquidCapacity - build.liquids.currentAmount,
                                cargo.liquids.currentAmount);
          if (flow > 0) {
            build.liquids.add(liquid, flow);
            cargo.liquids.remove(liquid, flow);
          }
        }
      }
    }

    if (build.liquids.currentAmount > 0.0001) build.dumpLiquid(build.liquids.current);
    // `for(int i = 0; i < offloadSpeed; i++) dumpAccumulate();`, four times a frame.
    for (let i = 0; i < (build.block.offload_speed ?? 4); i++) {
      build.state.dumpAccum = (build.state.dumpAccum || 0) + build.delta(step);
      while (build.state.dumpAccum >= 1) {
        build.dump();
        build.state.dumpAccum -= 1;
      }
    }
  },
};

/** `PayloadUnloader.shouldExport`: nothing left in it worth taking. */
function emptyEnough(cargo, held) {
  if (held?.item_capacity && cargo.items.total > 0) return false;
  if (held?.has_liquids && cargo.liquids.currentAmount > 0.011) return false;
  return true;
}

/**
 * A deconstructor: a block in, its own build cost out, over time.
 *
 * `deconstructSpeed / buildTime` a frame, and the items appear as the running total crosses
 * whole numbers rather than all at the end. It dumps four times a frame like an unloader,
 * and it stops dead when it has nowhere to put what it is making.
 */
const payloadDeconstructor = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    build.state.taking = null;
    build.state.progress = 0;
    build.state.accum = null;
    build.state.wants = 0;
  },

  acceptPayload(build, source, payload) {
    if (build.state.payload || build.state.taking) return false;
    const held = build.world?.catalogue?.blocks?.[payload.name];
    return Boolean(held?.cost) && Object.keys(held.cost).length > 0;
  },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.payVector = offsetFrom(build, source);
  },

  update(build, world, step) {
    const delta = build.delta(step);

    if (build.items.total > 0) {
      for (let i = 0; i < (build.block.dump_rate ?? 4); i++) {
        build.state.dumpAccum = (build.state.dumpAccum || 0) + delta;
        while (build.state.dumpAccum >= 1) {
          build.dump();
          build.state.dumpAccum -= 1;
        }
      }
    }

    if (!build.state.taking) {
      build.state.progress = 0;
      build.state.wants = build.state.payload ? 1 : 0;
      // Swallowed whole first, and only then taken apart: the cargo stops being cargo.
      if (build.state.payload && moveInPayload(build, false)) {
        build.state.taking = build.state.payload;
        build.state.payload = null;
        build.state.accum = {};
        build.state.progress = 0;
      }
      return;
    }

    build.state.wants = 1;
    const held = world.catalogue?.blocks?.[build.state.taking.name];
    const cost = held?.cost || {};
    const efficiency = build.block.power > 0 ? (build.state.power ?? 1) : 1;

    /* It stops when it has nowhere to put what it is making, and the test is on the
       **accumulators** as much as on the stock: a whole item owed and no room for it holds
       the whole run up. */
    let room = build.items.total <= build.itemCapacity;
    for (const owed of Object.values(build.state.accum)) if (owed >= 1) room = false;

    if (room) {
      const shift = delta * efficiency * (build.block.deconstruct_speed ?? 2.5)
        / (held?.build_time || 1);
      const real = Math.min(shift, 1 - build.state.progress);
      build.state.progress += shift;
      for (const [item, amount] of Object.entries(cost)) {
        build.state.accum[item] = (build.state.accum[item] || 0) + amount * real;
      }
    }

    for (const [item, owed] of Object.entries(build.state.accum)) {
      const taken = Math.min(Math.trunc(owed), build.itemCapacity - build.items.total);
      if (taken > 0) {
        build.items.add(item, taken);
        build.state.accum[item] = owed - taken;
      }
    }

    if (build.state.progress >= 1) {
      // The last whole item of each kind, and only once there is room for all of them.
      let done = true;
      for (const [item, owed] of Object.entries(build.state.accum)) {
        if (Math.abs(owed - 1) >= 0.0001) continue;
        if (build.items.total < build.itemCapacity) {
          build.items.add(item);
          build.state.accum[item] = 0;
        } else {
          done = false;
          break;
        }
      }
      if (done) {
        build.state.taking = null;
        build.state.accum = null;
      }
    }
  },
};


/**
 * A payload mass driver: the same idea as the item one, for a block carried whole.
 *
 * Both ends have to agree, again, and there is one more gate than the item driver has: the
 * cargo has to have **slid to the end of the barrel** before anything can be fired, and the
 * shot itself takes a hundred frames of charging on top of the thirty of reload. That is
 * what its own card means by one payload every two and a bit seconds: the turning, the
 * sliding and the charging are all real time and none of them is the reload.
 *
 * The charge is lost the instant the two fall out of alignment: `charge -= Time.delta * 10`
 * every frame it is not charging, so ten frames of interruption cost a hundred of charge.
 */
const payloadDriver = {
  begin(build) {
    build.state.payload = null;
    build.state.payVector = [0, 0];
    build.state.payRotation = 0;
    build.state.driver = "idle";
    build.state.turn = 90;
    build.state.reload = 0;
    build.state.charge = 0;
    build.state.length = 0;
    build.state.loaded = false;
    build.state.waiting = [];
    build.state.arriving = 0;
    build.state.charging = false;
    build.state.wants = 1;
  },

  acceptPayload(build, source, payload) {
    return build.state.payload === null;
  },

  handlePayload(build, source, payload) {
    build.state.payload = payload;
    build.state.payVector = offsetFrom(build, source);
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);
    const link = linkedDriver(build, world);

    /* The charge drains on **last** frame's flag, because the game reads `charging` at the
       top of the update and clears it a few lines later. One frame of lag, and the frame
       after a shot is one of them. */
    if (!build.state.charging) {
      build.state.charge = Math.max(0, build.state.charge - build.delta(step) * 10);
    }
    build.state.charging = false;

    // The transfer effect landing, which is what starts the receiver's own reload.
    if (build.state.arriving > 0) {
      build.state.arriving -= build.delta(step);
      if (build.state.arriving <= 0) build.state.reload = 1;
    }

    // `reloadCounter -= edelta() / reload`, whatever state it is in.
    const efficiency = block.power > 0 ? (build.state.power ?? 1) : 1;
    build.state.reload = Math.max(0, Math.fround(
      build.state.reload - Math.fround((delta * efficiency) / (block.reload || 30))));

    const waiting = build.state.waiting;
    if (waiting.length && !payloadShooterValid(build, waiting[0], world)) waiting.shift();

    if (build.state.driver === "idle") {
      if (waiting.length && !build.state.payload) build.state.driver = "accepting";
      else if (link) build.state.driver = "shooting";
    }

    // Idle or receiving, it pushes whatever it holds out of the front like any other
    // payload block, sliding it back down the barrel first if it was loaded.
    if ((build.state.driver === "idle" || build.state.driver === "accepting")
        && build.state.payload) {
      if (build.state.loaded) {
        // In float, like everything else the game adds up frame by frame.
        build.state.length = Math.fround(build.state.length - speedOf(build) * delta);
        if (build.state.length <= 0) {
          build.state.loaded = false;
          build.state.payVector = [0, 0];
        }
      } else {
        moveOutPayload(build, world);
      }
    }

    if (efficiency <= 0) return;
    const turn = (block.rotate_speed ?? 5) * efficiency;

    if (build.state.driver === "accepting") {
      if (!waiting.length || build.state.payload) {
        build.state.driver = "idle";
        return;
      }
      build.state.turn = turnToward(build.state.turn,
                                    angleBetween(build, waiting[0]), turn);
      return;
    }

    if (build.state.driver !== "shooting") return;
    if (!link || (waiting.length && !build.state.payload)) {
      build.state.driver = "idle";
      return;
    }

    const aim = angleBetween(build, link);
    let out = false;
    if (build.state.loaded) {
      // The barrel shortens as the reload runs down, which is the recoil.
      const reach = Math.fround((block.length ?? 11.125)
        - build.state.reload * (block.knockback ?? 5));
      build.state.length = Math.fround(build.state.length + speedOf(build) * delta);
      if (build.state.length >= reach) {
        build.state.length = reach;
        out = true;
      }
    } else if (moveInPayload(build)) {
      build.state.length = 0;
      build.state.loaded = true;
    }

    if (!out || !build.state.payload || link.state.payload) return;

    if (!link.state.waiting.includes(build)) link.state.waiting.push(build);
    if (build.state.reload > 0) return;

    build.state.turn = turnToward(build.state.turn, aim, turn);
    const ready = link.state.waiting[0] === build
      && link.state.driver === "accepting"
      && link.state.reload <= 0
      && nearAngle(build.state.turn, aim, 1)
      && nearAngle(link.state.turn, aim + 180, 1);

    if (!ready) return;

    build.state.charging = true;
    build.state.charge += delta * efficiency;
    if (build.state.charge < (block.charge_time ?? 100)) return;

    // And across it goes, whole, with whatever is inside it.
    link.state.payload = build.state.payload;
    link.state.payVector = [0, 0];
    link.state.payRotation = build.state.turn;
    link.state.length = block.length ?? 11.125;
    link.state.loaded = true;
    /* The receiver does not start reloading now: it starts when the transfer effect ends,
       eleven frames later. `other.effectDelayTimer = transferEffect.lifetime`, and the
       `reloadCounter = 1f` lives in the branch that watches that timer run out. */
    link.state.arriving = block.transfer_time ?? 11;
    const at = link.state.waiting.indexOf(build);
    if (at >= 0) link.state.waiting.splice(at, 1);
    link.state.driver = "idle";

    build.state.payload = null;
    build.state.length = 0;
    build.state.loaded = false;
    build.state.driver = "idle";
    build.state.reload = 1;
    /* And the charge is **not** reset: nothing in `updateTile` clears it after a shot, so
       it sits at its full hundred and drains at ten a frame like any other idle frame. */
  },
};

/** The far end, if it is one of these, set to nothing else, and in range. */
function linkedDriver(build, world) {
  const link = build.node.link;
  if (!link) return null;
  const other = world.at(link[0], link[1]);
  if (!other || other === build || other.name !== build.name) return null;
  return withinRange(build, other) ? other : null;
}

function payloadShooterValid(build, other, world) {
  if (!other || other.name !== build.name) return false;
  if ((other.block.power > 0 ? (other.state.power ?? 1) : 1) <= 0) return false;
  return linkedDriver(other, world) === build;
}

/** `within(other, range)`, strictly, with the range in tiles rather than pixels. */
function withinRange(build, other) {
  const reach = (build.block.range || 0) * TILE;
  const dx = (other.x - build.x) * TILE;
  const dy = (other.y - build.y) * TILE;
  return dx * dx + dy * dy < reach * reach;
}

function angleBetween(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 360;
}

/** `Angles.within`, the short way round. */
function nearAngle(a, b, within) {
  return Math.abs(((b - a) % 360 + 540) % 360 - 180) <= within;
}

export const PAYLOADS = {
  constructor,
  "payload-conveyor": payloadConveyor,
  "payload-router": payloadRouter,
  "payload-source": payloadSource,
  "payload-void": payloadVoid,
  "payload-loader": payloadLoader,
  "payload-unloader": payloadUnloader,
  "payload-deconstructor": payloadDeconstructor,
  "payload-driver": payloadDriver,
  reconstructor,
};
