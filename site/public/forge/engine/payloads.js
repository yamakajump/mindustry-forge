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

import { DIRECTIONS } from "./core.js";

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
function turnToward(from, to, speed) {
  let apart = ((to - from) % 360 + 540) % 360 - 180;
  if (Math.abs(apart) <= speed) return to;
  return from + Math.sign(apart) * speed;
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
  if (front && (front.block.outputs_payload || front.block.accepts_payload)) {
    if (front.acceptPayload?.(build, state.payload)) {
      front.handlePayload(build, state.payload);
      state.payload = null;
    }
  }
  // A payload with nowhere to go and no room to be dropped simply stays put. Dropping a
  // unit on the ground is a thing the game does and this engine has no ground to drop on.
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
      build.state.payload = made;
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
      && Boolean(upgradeOf(build, payload));
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
      && Boolean(upgradeOf(build, build.state.payload));

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

    if (!upgradeOf(build, build.state.payload)) {
      // Nothing more to do with it: push it out and let something downstream have it.
      moveOutPayload(build, world);
      return;
    }

    if (!moveInPayload(build)) return;

    if (efficiency > 0) build.state.progress += delta * efficiency;

    if (build.state.progress >= (block.construct_time || 120)) {
      build.state.payload = upgradeOf(build, build.state.payload);
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

export const PAYLOADS = {
  "payload-conveyor": payloadConveyor,
  "payload-router": payloadRouter,
  "payload-source": payloadSource,
  "payload-void": payloadVoid,
  reconstructor,
};
