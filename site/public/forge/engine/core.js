/**
 * The game's own update loop, transcribed rather than approximated.
 *
 * A first attempt at simulating a schematic was written from intuition and deleted: it
 * reported -408 energy a second where the real figure is +2,402, with the generators
 * sitting at nothing. The lesson was not "do not simulate", it was "do not guess". What is
 * here is a port, class by class, from Mindustry v159.7, and every rule cites where it
 * came from so that a disagreement with the game has one place to look.
 *
 * It is not the game. There are no units, no combat, no waves, no pathfinding, no map
 * generation and no network here: only the production loop, which is what a schematic is.
 *
 * Sources: `mindustry.entities.comp.BuildingComp` for the base behaviour, `mindustry.world.Edges`
 * for the order neighbours are visited in, and one class per block kind alongside.
 */

/** One second of game time. `Time.delta` is 1 at sixty frames a second. */
export const TICKS = 60;

/** Mindustry counts rotations anticlockwise from east. */
export const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * The ring of tiles around a block, in the order the game visits them.
 *
 * From `Edges`: the ring is built bottom, top, left, right and then **sorted by angle**,
 * which for a one by one block gives east, north, west, south. The order matters because
 * `dump` walks `proximity` from a rotating cursor, so it decides which branch of a split
 * is served first when a router cannot serve both.
 */
export function edgesOf(size) {
  // The game indexes this table by `size - 1`, and using the size itself puts the ring of
  // a two by two block around a one by one one.
  const i = size - 1;
  const bottom = -Math.trunc(i / 2) - 1;
  const top = Math.trunc(i / 2 + 0.5) + 1;
  const ring = [];
  for (let j = 0; j < i + 1; j++) {
    ring.push([bottom + 1 + j, bottom]);
    ring.push([bottom + 1 + j, top]);
    ring.push([bottom, bottom + j + 1]);
    ring.push([top, bottom + j + 1]);
  }
  // `Mathf.angle` measures anticlockwise from east and returns 0 to 360.
  const angle = ([x, y]) => {
    const found = Math.atan2(y, x) * 180 / Math.PI;
    return found < 0 ? found + 360 : found;
  };
  return ring.sort((a, b) => angle(a) - angle(b));
}

/** What a building is holding. `ItemModule` in the game: counts, and a total. */
export class Held {
  constructor() {
    this.counts = new Map();
    this.total = 0;
  }
  get(item) { return this.counts.get(item) || 0; }
  has(item) { return this.get(item) > 0; }
  add(item, amount = 1) {
    this.counts.set(item, this.get(item) + amount);
    this.total += amount;
  }
  remove(item, amount = 1) {
    const taken = Math.min(this.get(item), amount);
    this.counts.set(item, this.get(item) - taken);
    this.total -= taken;
    return taken;
  }
  first() {
    for (const [item, count] of this.counts) if (count > 0) return item;
    return null;
  }
}

/**
 * One building.
 *
 * Behaviour lives in a table of roles rather than in a class hierarchy, because the thing
 * being ported is a set of `updateTile` methods and a flat table reads closer to them than
 * six levels of inheritance would.
 */
export class Build {
  constructor(node, behaviour) {
    this.node = node;
    this.block = node.block;
    this.name = node.name;
    this.role = node.role;
    this.x = node.x;
    this.y = node.y;
    this.rotation = (node.rotation | 0) % 4;
    this.size = node.block.size || 1;

    this.items = new Held();
    this.liquid = null;
    this.liquidAmount = 0;

    /** The rotating cursor `dump` walks `proximity` from. */
    this.cdump = 0;
    this.proximity = [];

    /** How much of the tick this block gets, which an overdrive projector raises. */
    this.timeScale = node.boost || 1;

    this.behaviour = behaviour || null;
    /** Whatever the block kind needs to remember between ticks. */
    this.state = {};
    if (this.behaviour?.begin) this.behaviour.begin(this);
  }

  get itemCapacity() { return this.block.item_capacity || 10; }
  get liquidCapacity() { return this.block.liquid_capacity || 10; }

  /** `Building.delta()`: the frame, scaled by anything speeding this block up. */
  delta(step) { return step * this.timeScale; }

  /** `Building.acceptItem`: does this recipe call for it, and is there room. */
  acceptItem(source, item) {
    if (this.behaviour?.acceptItem) return this.behaviour.acceptItem(this, source, item);
    return this.wants(item) && this.items.get(item) < this.itemCapacity;
  }

  handleItem(source, item) {
    if (this.behaviour?.handleItem) {
      this.behaviour.handleItem(this, source, item);
      return;
    }
    this.items.add(item);
  }

  /** Whether the recipe names this item at all. `Block.consumesItem`. */
  wants(item) {
    const input = this.block.input || {};
    if (Object.keys(input).length) return item in input;
    if (this.role === "turret") return (this.block.ammo || []).includes(item);
    // A generator that burns anything states a duration and no ingredient.
    return this.role === "generator" && Boolean(this.block.craft_time);
  }

  /** `Building.canDump`, which an overflow gate overrides to refuse going backwards. */
  canDump(other, item) {
    return this.behaviour?.canDump ? this.behaviour.canDump(this, other, item) : true;
  }

  /**
   * Hand one item to a neighbour, walking `proximity` from the rotating cursor.
   *
   * Transcribed from `Building.dump`. The cursor is what makes a router split evenly over
   * time without anything anywhere computing a share: each call starts one further along
   * than the last, and moves on whether or not it succeeded.
   */
  dump(todump = null) {
    if (!this.items.total || !this.proximity.length) return false;
    if (todump && !this.items.has(todump)) return false;

    const items = todump ? [todump] : [...this.items.counts.keys()];

    // The cursor is read once and then walked, which is `int dump = this.cdump` in the
    // game with `incrementDump` moving the field. Reading the field inside the loop
    // instead made the offset grow with the index, so it stepped over every other
    // neighbour: a router with three ways out reliably served two of them and never the
    // third, and the branch it skipped depended on which side the item came in from.
    const start = this.cdump;

    for (let i = 0; i < this.proximity.length; i++) {
      const other = this.proximity[(i + start) % this.proximity.length];
      for (const item of items) {
        if (!this.items.has(item)) continue;
        if (other.acceptItem(this, item) && this.canDump(other, item)) {
          other.handleItem(this, item);
          this.items.remove(item);
          this.cdump = (this.cdump + 1) % this.proximity.length;
          return true;
        }
      }
      this.cdump = (this.cdump + 1) % this.proximity.length;
    }
    return false;
  }

  /** The building this one faces, for the blocks that hand forward rather than around. */
  facing(world) {
    const [dx, dy] = DIRECTIONS[this.rotation];
    const offset = Math.trunc(-(this.size - 1) / 2);
    // From the far edge of its own footprint, so a three by three drill hands on from its
    // own side rather than from its middle.
    const from = this.size === 1
      ? [this.x, this.y]
      : [this.x + offset + (dx > 0 ? this.size - 1 : 0),
         this.y + offset + (dy > 0 ? this.size - 1 : 0)];
    return world.at(from[0] + dx, from[1] + dy);
  }

  /** Which side a neighbour is on, as a rotation. `Tile.relativeTo`. */
  relativeTo(other) {
    // Handed in from nowhere in particular counts as handed in from behind, which is what
    // a block placed by hand in a test means and what a tap standing off the edge means.
    if (!other) return (this.rotation + 2) % 4;
    for (let r = 0; r < 4; r++) {
      const [dx, dy] = DIRECTIONS[r];
      if (other.x === this.x + dx && other.y === this.y + dy) return r;
    }
    // Not touching edge to edge, which happens with blocks bigger than one tile: fall
    // back to the direction of the line between their middles.
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 0 : 2;
    return dy > 0 ? 1 : 3;
  }
}

/**
 * The world one schematic sits in, and the loop that runs it.
 *
 * Buildings update in the order they were placed, which for a pasted schematic is the
 * order the file lists them. The game updates `Groups.build` in insertion order, and
 * placing a schematic inserts in file order, so the two agree.
 */
export class World {
  constructor(graph, pick) {
    this.builds = graph.nodes.map((node) => new Build(node, pick(node)));
    this.tiles = new Map();
    // Every building can reach the world, because half the game's own methods do: a
    // sorter passes to the tile opposite the one it was handed from, and it has to be
    // able to look it up.
    for (const build of this.builds) build.world = this;

    for (const build of this.builds) {
      const offset = Math.trunc(-(build.size - 1) / 2);
      for (let dx = 0; dx < build.size; dx++) {
        for (let dy = 0; dy < build.size; dy++) {
          this.tiles.set(`${build.x + offset + dx},${build.y + offset + dy}`, build);
        }
      }
    }

    // `updateProximity`: every neighbour on the ring, deduplicated, and both ways round.
    for (const build of this.builds) {
      const offset = Math.trunc(-(build.size - 1) / 2);
      const midX = build.x + offset + (build.size - 1) / 2;
      const midY = build.y + offset + (build.size - 1) / 2;
      for (const [dx, dy] of edgesOf(build.size)) {
        const other = this.at(Math.round(midX + dx), Math.round(midY + dy));
        if (!other || other === build) continue;
        if (!build.proximity.includes(other)) build.proximity.push(other);
        if (!other.proximity.includes(build)) other.proximity.push(build);
      }
    }

    this.tick = 0;
  }

  at(x, y) { return this.tiles.get(`${x},${y}`) || null; }

  /** One frame at sixty a second. `Time.delta` is 1. */
  step(delta = 1) {
    this.tick++;
    for (const build of this.builds) {
      if (build.behaviour?.update) build.behaviour.update(build, this, delta);
    }
  }

  run(seconds) {
    const steps = Math.round(seconds * TICKS);
    for (let i = 0; i < steps; i++) this.step();
    return this;
  }
}
