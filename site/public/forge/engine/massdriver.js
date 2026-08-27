/**
 * A mass driver, which does not hand items on: it shoots them.
 *
 * `mindustry.world.blocks.distribution.MassDriver`, Mindustry v159.7.
 *
 * Filed under `sink` for want of a branch of its own, it had no `accepts` and no `input` in
 * the catalogue, so `wants()` said no to everything: a linked pair carried nothing at all
 * and the belt feeding it jammed on the first frame instead of filling a hundred and
 * twenty deep.
 *
 * Three states, and both ends have to agree before anything leaves. The shooter turns to
 * face its target, the receiver turns to face the shooter, and only when both are within
 * two degrees, the queue names this shooter and the reload has run out does a salvo go.
 * That is the whole reason a pair is slower than its nameplate: the turning is real time,
 * and so is the flight.
 */

import { byItemId } from "./core.js";
import { turnToward } from "./payloads.js";

const TILE = 8;

export const massDriver = {
  begin(build) {
    build.state.driver = "idle";
    build.state.turn = 90;
    build.state.reload = 0;
    build.state.dumpAccum = 0;
    build.state.waiting = [];
    build.state.incoming = [];
  },

  acceptItem(build, source, item) {
    // `items.total() < itemCapacity && linkValid()`. An unlinked driver takes nothing,
    // which is what stops a half built line from swallowing a belt.
    return build.items.total < build.itemCapacity && !!linkedDriver(build);
  },

  update(build, world, step) {
    const block = build.block;
    const delta = build.delta(step);
    arrive(build, delta);

    const link = linkedDriver(build);
    if (build.state.reload > 0) {
      const spin = block.power > 0 ? (build.state.power ?? 1) : 1;
      build.state.reload = Math.max(0,
        build.state.reload - (delta * spin) / (block.reload || 100));
    }

    // A shooter that has been retargeted, unpowered or destroyed stops holding the queue.
    const waiting = build.state.waiting;
    if (waiting.length && !shooterValid(build, waiting[0])) waiting.shift();

    const min = block.min_distribute ?? 10;
    const room = () => build.itemCapacity - build.items.total;

    if (build.state.driver === "idle") {
      if (waiting.length && room() >= min) build.state.driver = "accepting";
      else if (link) build.state.driver = "shooting";
    }

    /* `dumpAccumulate` while idle or accepting, which is how a driver at the end of a line
       empties into whatever is against it. One attempt a frame, not one every tick of a
       timer of its own. */
    if (build.state.driver === "idle" || build.state.driver === "accepting") {
      build.state.dumpAccum += delta;
      while (build.state.dumpAccum >= 1) {
        build.dump();
        build.state.dumpAccum -= 1;
      }
    }

    build.state.wants = 1;
    const efficiency = block.power > 0 ? (build.state.power ?? 1) : 1;
    if (efficiency <= 0) return;

    // `rotateSpeed * efficiency`, and no `delta` anywhere: the game turns per update.
    const speed = (block.rotate_speed ?? 5) * efficiency;

    if (build.state.driver === "accepting") {
      if (!waiting.length || room() < min) {
        build.state.driver = "idle";
        return;
      }
      build.state.turn = turnToward(build.state.turn,
                                    angleBetween(build, waiting[0]), speed);
      return;
    }

    if (build.state.driver !== "shooting") return;
    // Someone wants to shoot at this one, so it gives way and becomes a receiver.
    if (!link || (waiting.length && room() >= min)) {
      build.state.driver = "idle";
      return;
    }

    const aim = angleBetween(build, link);
    if (build.items.total < min) return;
    if (link.itemCapacity - link.items.total < min) return;

    if (!link.state.waiting.includes(build)) link.state.waiting.push(build);
    if (build.state.reload > 0.0001) return;

    build.state.turn = turnToward(build.state.turn, aim, speed);
    if (link.state.waiting[0] !== build) return;
    if (link.state.driver !== "accepting") return;
    if (!nearAngle(build.state.turn, aim, 2)) return;
    if (!nearAngle(link.state.turn, aim + 180, 2)) return;

    fire(build, link);
    build.state.driver = "idle";
  },
};

/** The driver this one is set to, if it is one, in range, and not itself. */
function linkedDriver(build) {
  const link = build.node.link;
  if (!link || !build.world) return null;
  const other = build.world.at(link[0], link[1]);
  if (!other || other === build || other.name !== build.name) return null;
  /* `within(other, range)` is `dst2 < range * range`, **strictly**, and `range` is in
     tiles in the catalogue where the game holds it in pixels. The boundary is reachable: a
     mass driver reaches four hundred and forty pixels, which is fifty-five tiles exactly,
     and the game lets a player save a link there and then refuses it for ever. */
  const reach = (build.block.range || 0) * TILE;
  return distanceBetween(build, other) ** 2 < reach * reach ? other : null;
}

/** `shooterValid`: still powered, still pointed here, still in range. */
function shooterValid(build, other) {
  if (!other || other.name !== build.name) return false;
  if ((other.block.power > 0 ? (other.state.power ?? 1) : 1) <= 0) return false;
  return linkedDriver(other) === build;
}

/** Where a building sits in pixels: `Block.offset` is half a tile for an even size. */
function centreOf(build) {
  const off = ((build.size + 1) % 2) * (TILE / 2);
  return [build.x * TILE + off, build.y * TILE + off];
}

function distanceBetween(a, b) {
  const [ax, ay] = centreOf(a);
  const [bx, by] = centreOf(b);
  return Math.hypot(bx - ax, by - ay);
}

function angleBetween(a, b) {
  const [ax, ay] = centreOf(a);
  const [bx, by] = centreOf(b);
  return (Math.atan2(by - ay, bx - ax) * 180 / Math.PI + 360) % 360;
}

/** `Angles.near`, which compares the short way round. */
function nearAngle(a, b, within) {
  return Math.abs(((b - a) % 360 + 540) % 360 - 180) <= within;
}

/**
 * `fire`: everything it holds leaves at once, and spends real time in the air.
 *
 * The bolt starts `translation` pixels out and counts as arrived within seven of the far
 * end, so what it actually flies is the gap between the two blocks less fourteen pixels,
 * at `bulletSpeed` a frame. The queue is cleared on arrival and not on firing, which is
 * what keeps a receiver from being claimed by two shooters at once.
 */
function fire(build, target) {
  build.state.reload = 1;

  const packet = new Map();
  let used = 0;
  // `content.items()` order, which is the order a salvo is packed in.
  for (const item of byItemId(build, [...build.items.counts.keys()])) {
    const take = Math.min(build.items.get(item), build.itemCapacity - used);
    if (take <= 0) continue;
    packet.set(item, take);
    used += take;
    build.items.remove(item, take);
  }

  /* Two clocks, and this used to be one.

     The **items** land when the bolt gets within seven pixels of the far end, having left
     seven pixels out of this one: `MassDriverBolt.update`. The **queue** is cleared on a
     plain `Time.run(dst / bulletSpeed)`, with no seven pixels either side, at
     `MassDriver.java:210`. Two and a half frames apart, which a two hundred frame reload
     hides completely in vanilla and would not hide in a mod.

     And a bolt that runs out of lifetime before it arrives does not deliver: it despawns
     and scatters what it carried. Unreachable at four hundred and forty pixels against two
     hundred frames of life, and written down because the catalogue is the only thing
     keeping it unreachable. */
  const gap = distanceBetween(build, target);
  const speed = build.block.bullet_speed ?? 5.5;
  const life = build.block.bullet_lifetime ?? 200;
  const reach = build.block.translation ?? 7;

  const flight = Math.max(0, (gap - reach * 2) / speed);
  const freed = Math.min(life, gap / speed);
  target.state.incoming.push({
    items: flight <= life ? packet : new Map(), from: build, left: flight, freed,
  });
}

/** `handlePayload`: a salvo lands, and a receiver may hold twice its capacity. */
function arrive(build, delta) {
  const incoming = build.state.incoming;
  if (!incoming?.length) return;

  for (let i = incoming.length - 1; i >= 0; i--) {
    const salvo = incoming[i];
    salvo.left -= delta;
    salvo.freed -= delta;

    if (salvo.left <= 0 && !salvo.landed) {
      salvo.landed = true;
      let total = build.items.total;
      for (const [item, amount] of salvo.items) {
        const spare = build.itemCapacity * 2 - total;
        if (spare <= 0) break;
        const taken = Math.min(amount, spare);
        build.items.add(item, taken);
        total += taken;
      }
      if (salvo.items.size) build.state.reload = 1;
    }

    // `Time.run(dst / bulletSpeed, ...)`, which is not the same instant as the landing.
    if (salvo.freed <= 0) {
      const at = build.state.waiting.indexOf(salvo.from);
      if (at >= 0) build.state.waiting.splice(at, 1);
      build.state.driver = "idle";
      incoming.splice(i, 1);
    }
  }
}
