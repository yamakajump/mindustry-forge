/**
 * A unit in flight, which is the last thing in this engine that is not a block.
 *
 * Four classes need it and nothing else does: an assembler only advances by the fraction of
 * its drones that are **in position**, so its rate is a question of flight before it is a
 * question of a recipe, and a cargo loader's whole output is one unit ferrying items back
 * and forth. Everything else in the game that makes a unit puts it on the ground and forgets
 * about it.
 *
 * So this is the smallest honest model: position, velocity, drag and a facing. No collision,
 * no pathfinding, no ground units. The two blocks that need it fly tethered drones over open
 * ground in a straight line, which is exactly the case the game's own `moveTo` reduces to.
 *
 * `mindustry.entities.comp.VelComp`, `mindustry.entities.units.AIController`,
 * Mindustry v159.7.
 */

const f32 = Math.fround;

export class Flyer {
  constructor(type, x, y, rotation = 90) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = rotation;
  }
}

/**
 * `VelComp.update`, which runs **before** the controller.
 *
 * Position first, then drag: `vel.scl(max(1 - drag * delta, 0))`. Applied the other way
 * round a drone overshoots its perch and oscillates for ever.
 */
export function driftOn(flyer, delta) {
  flyer.x = f32(flyer.x + f32(flyer.vx * delta));
  flyer.y = f32(flyer.y + f32(flyer.vy * delta));
  const kept = Math.max(f32(1 - (flyer.type.drag || 0) * delta), 0);
  flyer.vx = f32(flyer.vx * kept);
  flyer.vy = f32(flyer.vy * kept);
}

/**
 * `AIController.moveTo`: aim at a point, and slow down as it gets there.
 *
 * `circleLength` is how far out it means to stop and `smooth` is over how many pixels it
 * eases off. The negative arm is not decoration: inside `circleLength - smooth` the length
 * goes past minus a half and the vector is turned right round, which is how a drone pushed
 * too close backs off rather than sitting on top of what it is circling.
 */
export function flyTo(flyer, tx, ty, circle, smooth, delta) {
  let dx = tx - flyer.x;
  let dy = ty - flyer.y;
  const away = Math.hypot(dx, dy);

  const length = circle <= 0.001
    ? 1
    : Math.max(-1, Math.min(1, f32((away - circle) / smooth)));

  const speed = f32((flyer.type.speed || 0) * length);
  if (away > 0.0001) {
    dx = f32(dx / away * speed);
    dy = f32(dy / away * speed);
  } else {
    dx = 0;
    dy = 0;
  }

  if (length < -0.5) { dx = -dx; dy = -dy; }
  else if (length < 0) { dx = 0; dy = 0; }

  pushAt(flyer, dx, dy, delta);
}

/**
 * `Velc.moveAt`: approach the wanted velocity, at `accel` times its own length a frame.
 *
 * Which means a unit asked to stand still stops **instantly** rather than coasting: the
 * limit is proportional to the length of what it was asked for, and that length is zero.
 */
function pushAt(flyer, wx, wy, delta) {
  const dx = wx - flyer.vx;
  const dy = wy - flyer.vy;
  const away = Math.hypot(dx, dy);
  const most = f32((flyer.type.accel || 0) * Math.hypot(wx, wy) * delta);
  if (away <= most || away === 0) {
    flyer.vx = wx;
    flyer.vy = wy;
    return;
  }
  flyer.vx = f32(flyer.vx + f32(dx / away * most));
  flyer.vy = f32(flyer.vy + f32(dy / away * most));
}

/** `Unit.lookAt`: turn towards an angle at `rotateSpeed` a frame. */
export function lookAt(flyer, angle, delta) {
  const speed = (flyer.type.rotate_speed || 0) * delta;
  const apart = ((angle - flyer.rotation) % 360 + 540) % 360 - 180;
  flyer.rotation = Math.abs(apart) <= speed
    ? angle
    : f32(flyer.rotation + Math.sign(apart) * speed);
}

/** `Position.within`, which is strict and compares squares. */
export const within = (flyer, x, y, range) =>
  (flyer.x - x) ** 2 + (flyer.y - y) ** 2 < range * range;

/** `Angles.within`, the short way round. */
export const facing = (flyer, angle, margin) =>
  Math.abs(((angle - flyer.rotation) % 360 + 540) % 360 - 180) < margin;
