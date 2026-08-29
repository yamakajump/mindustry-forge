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
    this.taking = 0;
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

  /**
   * `ItemModule.take`: the next one round a cursor that walks the **item ids**.
   *
   * Not `first()`, which is what a bridge used to call. The game keeps a `takeRotation` per
   * block and moves it past whatever it just handed over, so a bridge fed copper on one
   * side and coal on the other alternates strictly. Reading the first key of a Map instead,
   * whichever arrived first won for ever: the press at the far end of a phase conveyor lost
   * a third of its coal to copper that had no business being served first.
   */
  take(order) {
    for (let i = 0; i < order.length; i++) {
      const at = (i + this.taking) % order.length;
      const item = order[at];
      if (this.get(item) > 0) {
        this.remove(item, 1);
        this.taking = at + 1;
        return item;
      }
    }
    return null;
  }
  /** Everything at once, which is what `kill()` amounts to for whatever was inside. */
  clear() {
    this.counts.clear();
    this.total = 0;
  }
}

/**
 * What a building is holding, liquid by liquid.
 *
 * `mindustry.world.modules.LiquidModule`: a counter per liquid, plus a **current** one that
 * is simply whatever was added last. The two are easy to confuse and the difference is the
 * whole design. A block holds as many liquids as it likes; what `current` decides is what
 * it will **accept**, because `acceptLiquid` is `current == liquid || currentAmount < 0.2`.
 *
 * Held as one scalar for a long time here, which read as "a block holds one liquid" and is
 * a different rule. It cost nothing until it cost three Erekir generators, an oil extractor
 * and the boost on both burst drills, all of which want two liquids at once: an oil
 * extractor drinks water and makes oil, and with one slot it could do neither.
 */
/**
 * A single precision float, which is what every number in the game is.
 *
 * The port counts in double and the game in float, and most of the time nothing turns on
 * it. Three places it does: a counter compared against a threshold, an accumulator compared
 * against one, and a liquid amount, which is not compared against anything but is handed on
 * as a fraction of itself sixty times a second until the difference is a whole unit.
 */
const f32 = Math.fround;

export class Liquids {
  constructor() {
    this.amounts = new Map();
    /* Water, and not nothing. `LiquidModule` starts its cursor on liquid zero, so an empty
       block reads as holding water, and `acceptLiquid` on an empty block passes through the
       `currentAmount < 0.2` arm rather than the `current == liquid` one either way. */
    this.current = null;
  }

  get(liquid) { return this.amounts.get(liquid) || 0; }
  get currentAmount() { return this.current ? this.get(this.current) : 0; }
  get total() {
    let sum = 0;
    for (const amount of this.amounts.values()) sum += amount;
    return sum;
  }

  /* Stored in **float**, because `LiquidModule` is a `float[]`. A tank does not hold a
     rounder number in double, it holds a slightly different one, and the difference
     compounds: a pipe hands over a fraction of what it holds sixty times a second, so by
     the end of a run the two engines are a whole unit apart on a gradient. */
  add(liquid, amount) {
    if (amount <= 0) return 0;
    this.amounts.set(liquid, Math.fround(this.get(liquid) + amount));
    this.current = liquid;
    return amount;
  }

  /** `remove` moves the cursor too, which is `add` with a negative number underneath. */
  remove(liquid, amount) {
    const taken = Math.min(this.get(liquid), amount);
    if (taken <= 0) return 0;
    this.amounts.set(liquid, Math.fround(this.get(liquid) - taken));
    this.current = liquid;
    return taken;
  }

  clear() {
    this.amounts.clear();
    this.current = null;
  }

  /** Every liquid it actually holds, for the report. */
  *held() {
    for (const [liquid, amount] of this.amounts) {
      if (amount > 0.0001) yield [liquid, amount];
    }
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
    this.liquids = new Liquids();

    /** The rotating cursor `dump` walks `proximity` from. */
    this.cdump = 0;
    this.sleeping = false;
    this.sleepTime = 0;
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

  /* `liquids.current()` and `liquids.currentAmount()`, under the names the rest of this
     engine already used when a block could only hold one. Reading them is fine; anything
     that knows **which** liquid it means should say so and use `liquids.get`. */
  get liquid() { return this.liquids.current; }
  get liquidAmount() { return this.liquids.currentAmount; }

  /** `Building.delta()`: the frame, scaled by anything speeding this block up. */
  delta(step) { return step * this.timeScale; }

  /**
   * `Building.sleep`: a block with nothing to do drops out of the update list.
   *
   * It sounds like an optimisation and it is not, because **waking puts it back at the
   * end**. A belt that stood empty for a second and then got an item updates after
   * everything that was placed later, and a machine it feeds therefore reads last frame's
   * stock rather than this frame's.
   *
   * That is worth one frame of a press's ninety, once, and the two engines had sat a coal
   * apart on `crafter-two-presses` since the scenario was written.
   *
   * Two blocks in the game do it: a conveyor with nothing on it, and a conduit with
   * nothing in it. A second of quiet, not a frame: `timeToSleep` is sixty.
   */
  sleep(step) {
    this.sleepTime += step;
    if (!this.sleeping && this.sleepTime >= 60) {
      this.sleeping = true;
      this.world?.dropAwake(this);
    }
  }

  /** `Building.noSleep`, which is what puts it back at the end of the list. */
  noSleep() {
    this.sleepTime = 0;
    if (this.sleeping) {
      this.sleeping = false;
      this.world?.wake(this);
    }
  }

  /** `Building.acceptItem`: does this recipe call for it, and is there room. */
  acceptItem(source, item) {
    if (this.state.dead) return false;
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

  /**
   * Whether this block will take this item at all.
   *
   * The game's own filter, built when a block's consumers are declared and read straight
   * out of the dump. Inferred from the recipe instead, a generator that burns "anything"
   * accepted anything: a drill beside one fed it copper, it burned the copper, and half
   * of what the drill made never reached the vault.
   */
  wants(item) {
    if (this.block.accepts) return this.block.accepts.includes(item);
    const input = this.block.input || {};
    if (Object.keys(input).length) return item in input;
    if (this.role === "turret") return (this.block.ammo || []).includes(item);
    return false;
  }

  /* Cargo. Nothing takes it unless it says so: `Building.acceptPayload` is false by
     default, and a block that is not part of the payload family simply is not asked. */
  acceptPayload(source, payload) {
    return this.behaviour?.acceptPayload
      ? this.behaviour.acceptPayload(this, source, payload) : false;
  }

  handlePayload(source, payload) {
    this.behaviour?.handlePayload?.(this, source, payload);
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

    /* Asked for nothing in particular, the game walks `content.items()` **by id**: copper
       first, then lead, then metaglass, and so on down the list. Walking a Map in the order
       things happened to arrive, a separator buffering four metals handed on whichever it
       had received first where the game hands on the copper. It only shows when the way out
       is saturated, which is exactly when a reader is looking. */
    const items = todump ? [todump] : byItemId(this, [...this.items.counts.keys()]);

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

  /**
   * Take in a liquid, up to what there is room for.
   *
   * One at a time, which is the game's rule and not a simplification: `acceptLiquid` is
   * `liquids.current() == liquid || liquids.currentAmount() < 0.2f`. Holding the name and
   * the amount separately is what makes that fall out instead of having to be enforced.
   */
  addLiquid(liquid, amount) {
    // The cap is per liquid, as the game's is: `liquidCapacity - liquids.get(liquid)`.
    const room = Math.max(0, f32(this.liquidCapacity - this.liquids.get(liquid)));
    return this.liquids.add(liquid, Math.min(room, amount));
  }

  acceptLiquid(source, liquid) {
    /* A block that killed itself is **gone**, and the two blocks that can do it, a thorium
       reactor that overheated and a neoplasia reactor with nowhere to put its neoplasm,
       both stand next to the sources that were feeding them. Emptied but still willing, the
       dead reactor filled straight back up from its own supply and read as a live block
       holding a tankful. */
    if (this.state.dead) return false;
    if (this.behaviour?.acceptLiquid) {
      return this.behaviour.acceptLiquid(this, source, liquid);
    }
    /* `Building.acceptLiquid` starts with `block.hasLiquids`. Every block reports a
       liquid capacity, ten by default, so testing that instead makes a power node look
       like something that can hold water: a source beside one filled it, and a wire ended
       up with ten units of water in it. */
    if (!this.block.has_liquids) return false;
    /* A machine takes a liquid its recipe names and **nothing else**, which is what stops
       a press from filling up with water it cannot use - and, less obviously, what stops a
       water extractor from taking back the water it just pushed out. It consumes no liquid
       at all, so it accepts none: without that it and the pipe in front of it passed the
       same water back and forth and the tank at the end stayed empty.

       `drinks` is the game's own `liquidFilter`, which is exactly `consumesLiquid`. */
    if (!this.block.drinks?.includes(liquid)) return false;

    /* And that is the whole of `Building.acceptLiquid`: `hasLiquids && consumesLiquid`.

       The famous "one liquid at a time" rule is **not** here. It lives in the overrides -
       a pipe, a tank, a liquid turret - and those are the blocks a player notices it on.
       Applied to every block instead, an oil extractor could not take the water it drinks
       once it held a fifth of a unit of the oil it makes: it oscillated between the two
       and produced a sixth of what the game produces. */
    return this.liquids.get(liquid) < this.liquidCapacity;
  }

  /**
   * Push a liquid at one neighbour. `Building.moveLiquid`.
   *
   * It moves by pressure rather than by a rate: the fraction this block is holding, times
   * its own pressure, against the fraction the other is holding. A full pipe into an empty
   * one moves a lot; two pipes at the same level move nothing, which is why a settled line
   * has a gradient along it.
   */
  /**
   * Where a liquid handed to this block really ends up.
   *
   * A liquid junction has no tank: asked where a liquid should go, it answers with
   * whatever is on the far side, which may answer with the one beyond that. `moveLiquid`
   * asks before it moves anything, so a chain of junctions is crossed in one step and
   * never holds a drop.
   */
  liquidDestination(source, liquid, seen = 0) {
    if (this.behaviour?.liquidDestination && seen < 32) {
      return this.behaviour.liquidDestination(this, source, liquid, seen);
    }
    return this;
  }

  moveLiquid(target, liquid) {
    const next = target?.liquidDestination(this, liquid);
    if (!next || next === this) return 0;
    const held = this.liquids.get(liquid);
    if (held <= 0) return 0;

    /* Every step in **float**, because every step of the game's is. A pipe hands over a
       fraction of a fraction sixty times a second and the rounding compounds: measured on a
       meltdown draining a tank, the two engines ended a run a whole unit apart. */
    const theirs = next.liquids.get(liquid);
    const ofract = f32(theirs / (next.block.liquid_capacity || 10));
    const fract = f32(f32(held / this.liquidCapacity) * (this.block.liquid_pressure ?? 1));

    let flow = Math.min(
      f32(Math.max(0, Math.min(1, f32(fract - ofract))) * this.liquidCapacity), held);
    flow = Math.min(flow, f32((next.block.liquid_capacity || 10) - theirs));

    if (flow > 0 && ofract <= fract && next.acceptLiquid(this, liquid)) {
      const taken = next.addLiquid(liquid, flow);
      this.liquids.remove(liquid, taken);
      return taken;
    }
    return 0;
  }

  /**
   * `dumpLiquid`: offer it round the neighbours, cursor rotating, as items are.
   *
   * `outputDir` is for a block that pours its liquids out of named faces rather than
   * anywhere: an electrolyzer sends its ozone out of relative face one and its hydrogen out
   * of face three. Poured everywhere, a layout that separates the two gases mixes them, and
   * the tapped face receives a flow that does not exist.
   *
   * `scaling` is two for nearly everything and **one** for an unlinked liquid bridge, which
   * pours twice as hard as anything else.
   */
  dumpLiquid(liquid, scaling = 2, outputDir = -1) {
    if (this.liquids.get(liquid) <= 0.0001 || !this.proximity.length) return;

    const start = this.cdump;
    for (let i = 0; i < this.proximity.length; i++) {
      this.cdump = (this.cdump + 1) % this.proximity.length;
      let other = this.proximity[(i + start) % this.proximity.length];
      // Tested on the neighbour itself, before following any beam off it.
      if (outputDir !== -1 && (outputDir + this.rotation) % 4 !== this.relativeTo(other)) {
        continue;
      }
      other = other.liquidDestination?.(this, liquid);
      if (!other || !other.block.has_liquids || !other.liquids) continue;
      if (!this.canDumpLiquid(other, liquid)) continue;
      const ofract = f32(other.liquids.get(liquid) / (other.block.liquid_capacity || 10));
      const fract = f32(this.liquids.get(liquid) / this.liquidCapacity);
      if (ofract < fract) {
        this.transferLiquid(
          other, f32(f32(f32(fract - ofract) * this.liquidCapacity) / scaling), liquid);
      }
    }
  }

  /** `canDumpLiquid`, which a bridge overrides so it never pours back down its own beam. */
  canDumpLiquid(other, liquid) {
    return this.behaviour?.canDumpLiquid
      ? this.behaviour.canDumpLiquid(this, other, liquid) : true;
  }

  transferLiquid(next, amount, liquid) {
    const flow = Math.min(
      f32((next.block.liquid_capacity || 10) - next.liquids.get(liquid)), amount);
    if (next.acceptLiquid(this, liquid)) {
      next.liquids.add(liquid, flow);
      this.liquids.remove(liquid, flow);
    }
  }

  /** The one it points at, which is where a pipe sends its liquid. `moveLiquidForward`. */
  moveLiquidForward(world, liquid) {
    return this.moveLiquid(this.facing(world), liquid);
  }

  /**
   * Hand one item out, and keep it if nobody will take it.
   *
   * `Building.offload`, which a machine uses for what it just made. It differs from `dump`
   * in two ways that both matter: it never fails, because what is not handed on stays in
   * the machine, and it moves the cursor **before** trying rather than after, so the two
   * walk the same neighbours in a different order.
   */
  offload(item) {
    const start = this.cdump;
    for (let i = 0; i < this.proximity.length; i++) {
      this.cdump = (this.cdump + 1) % this.proximity.length;
      const other = this.proximity[(i + start) % this.proximity.length];
      if (other.acceptItem(this, item) && this.canDump(other, item)) {
        other.handleItem(this, item);
        return;
      }
    }
    this.handleItem(this, item);
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

  /**
   * Which side something was handed in from, measured to the **edge** it was handed over.
   *
   * `Edges.getFacingEdge(source.tile, tile).relativeTo(tile)`, which is what a conveyor, a
   * duct and an overflow duct all ask, and what this used to answer with the neighbour's
   * stored tile. `Tile.relativeTo` is a plain four way adjacency test that answers minus
   * one for anything else, and the edge tile is what makes it answerable at all when the
   * neighbour is bigger than one tile.
   *
   * The two agree for every neighbour of an odd sized block. For an even one they part on
   * the corner tiles: a two by two press beside a line of ducts hands on where the game
   * refuses, and its whole output appears in the middle of a line that carries none of it.
   */
  arrivedFrom(source) {
    if (!source) return (this.rotation + 2) % 4;
    const [ex, ey] = facingEdge(source, this);
    if (ex === this.x && ey === this.y - 1) return 1;
    if (ex === this.x && ey === this.y + 1) return 3;
    if (ex === this.x - 1 && ey === this.y) return 0;
    if (ex === this.x + 1 && ey === this.y) return 2;
    return -1;
  }

  /**
   * `Building.relativeTo(int, int)`, which is `Tile.absoluteRelativeTo` and a different
   * question: not "which of my four sides is that on" but "which way does that lie", at any
   * distance. A bridge asks it about a link twelve tiles away.
   */
  sideTowards(x, y) {
    return sideOf(this.size, this.x, this.y, x, y);
  }
}

/**
 * `Edges.getFacingEdge`: the tile of a block that is nearest another tile.
 *
 * A one tile block is its own edge. Anything bigger is clamped tile by tile into its own
 * footprint, with the game's own integer halves: a two wide block clamps into nought to
 * one, a three wide into minus one to one.
 */
/**
 * Where the line ends, counting what falls off it.
 *
 * A belt with nothing in front of it does not deliver in the game, it fills up and stops,
 * which is correct and useless for both watching and measuring. So the empty tile a line
 * points at gets something standing on it that takes everything and writes down what it
 * took: the same thing a player would learn by putting a container there.
 *
 * Lives here rather than in `run.js` because both sides of this repository need it and
 * there is one of it. The bench had it from the start; the page's own simulation did not,
 * so a schematic watched in the browser choked on its own output after a few seconds while
 * the same schematic measured against the game delivered. Two rules for one question.
 */
export class Drain {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.block = {};
    this.role = "drain";
    this.size = 1;
    this.rotation = 0;
    this.proximity = [];
    this.taken = new Map();
    this.items = { total: 0, counts: new Map(), get: () => 0, has: () => false };
  }
  acceptItem() { return true; }
  handleItem(source, item) { this.taken.set(item, (this.taken.get(item) || 0) + 1); }
  canDump() { return false; }
  relativeTo() { return 0; }
}

/**
 * Put one on every tile a line points at and nothing occupies.
 *
 * The rule is the schematic's own boundary rather than what the player marked: a belt torn
 * out of a base stops at the edge of what was copied, and what reaches that edge is what
 * the design delivers, whether or not anybody has said so on the picture. Marking an
 * output says where to read the figure, not where the belt ends.
 *
 * Written into `world.tiles` and deliberately not into `world.builds`: a drain is not a
 * block, nothing draws it, and nothing steps it.
 *
 * @returns {Drain[]} the drains, in the order they were placed, for whoever wants to read
 *   what came out.
 */
export function placeDrains(world) {
  const drains = [];
  for (const build of world.builds) {
    if (!build.block.carries || !build.block.rotate) continue;
    const [dx, dy] = DIRECTIONS[build.rotation];
    const ahead = [build.x + dx, build.y + dy];
    if (world.at(ahead[0], ahead[1])) continue;
    const drain = new Drain(ahead[0], ahead[1]);
    world.tiles.set(`${ahead[0]},${ahead[1]}`, drain);
    drains.push(drain);
  }
  return drains;
}

export function facingEdge(source, target) {
  if ((source.size || 1) <= 1) return [source.x, source.y];
  const low = -Math.trunc((source.size - 1) / 2);
  const high = Math.trunc(source.size / 2);
  const held = (value) => Math.min(high, Math.max(low, value));
  return [source.x + held(target.x - source.x), source.y + held(target.y - source.y)];
}

/**
 * `Tile.absoluteRelativeTo`: which way `(cx, cy)` lies from a tile of a block this size.
 *
 * Two branches, and the even one is not a rounding detail: it shifts the tile half a
 * square before comparing, because an even block's stored tile is its lower left middle
 * rather than its centre. `-1` when neither axis wins, which the game leaves as `-1` and
 * compares as such.
 */
function sideOf(size, x, y, cx, cy) {
  const shift = (size || 1) % 2 === 1 ? 0 : 0.5;
  const px = x + shift;
  const py = y + shift;
  if (Math.abs(px - cx) > Math.abs(py - cy)) {
    if (px <= cx - 1) return 0;
    if (px >= cx + 1) return 2;
  } else {
    if (py <= cy - 1) return 1;
    if (py >= cy + 1) return 3;
  }
  return -1;
}

/**
 * `ItemBridge.checkAccept`, which is most of what makes a bridge a bridge.
 *
 * Two rules, and the port had neither. **Without a link, a bridge accepts nothing at all**
 * except from another bridge pointing at it: it is the far end of somebody else's beam and
 * not a block a belt may push into. **With a link, it refuses whatever arrives from the
 * face it sends out of**, so a beam cannot be fed backwards through its own exit.
 *
 * Reading only the capacity, the terminal bridge of a chain swallowed whatever a belt
 * pushed onto it and spread it round with `dump`: up to thirteen items a second of traffic
 * that does not exist, and the jam upstream that a reader is looking for never appeared.
 */
export function bridgeAccepts(build, source) {
  if (!source) return true;
  // `linked(source)`: a bridge set to this one may always feed it.
  if (pointsAt(source, build)) return true;

  const target = bridgeTarget(build);
  if (!target) return false;
  // Both sides measured from this bridge: the way its beam points, against the way the
  // face the item came over lies. Same face, refused.
  const [ex, ey] = facingEdge(source, build);
  return build.sideTowards(target.x, target.y) !== build.sideTowards(ex, ey);
}

/** `ItemBridge.checkDump`. */
export function bridgeDumps(build, other) {
  const target = bridgeTarget(build);
  /* Linked, the game compares the far end against the receiver's **stored** tile with no
     edge in between, which is an asymmetry with `checkAccept` a few lines above it and is
     the game's own. */
  if (target) {
    return build.sideTowards(target.x, target.y) !== build.sideTowards(other.x, other.y);
  }

  // Unlinked, it still refuses to pour back towards anything that is feeding it.
  const [ex, ey] = facingEdge(other, build);
  const side = build.sideTowards(ex, ey);
  return !feedersOf(build).some(
    (feeder) => build.sideTowards(feeder.x, feeder.y) === side);
}

/**
 * Where a bridge sends, or nothing when it is not set or the far end is not a bridge.
 *
 * `ItemBridge.linkValid` asks two things beyond the reach that `bridgeLink` already
 * checked, and neither was asked here:
 *
 * - **the far end has to be the same block.** A schematic keeps a bridge's configuration
 *   even when someone has since built something else on the tile it pointed at. The game
 *   reads the link as dead, so the bridge stops being a bridge and pours round its own
 *   sides; this teleported the items twelve tiles instead, up to nine hundred of them over
 *   thirty seconds, and lost the spill upstream as well.
 * - **and it must not point back.** Two bridges set at each other are both invalid, both of
 *   them, and neither carries anything.
 */
export function bridgeTarget(build) {
  const link = build.node.link;
  const other = link ? build.world?.at(link[0], link[1]) || null : null;
  if (!other || other.name !== build.name) return null;
  return bridgeTargetTile(other) === build ? null : other;
}

/** The far end as the tile says it, without asking whether it points back. */
function bridgeTargetTile(build) {
  const link = build.node.link;
  return link ? build.world?.at(link[0], link[1]) || null : null;
}

/* `linked(source)`, which is `linkValid(source.tile, tile)` from the other side: a bridge
   pointing here may always feed it. Asked with `bridgeTarget`, a mutual pair would answer
   no from both ends, which is right for carrying and wrong for this. */
const pointsAt = (source, build) =>
  source.name === build.name && bridgeTargetTile(source) === build;

/**
 * `incoming`: which bridges are pointed at this one.
 *
 * Worked out once and kept, because nothing in a schematic moves: a bridge's link is read
 * off the tile and never changes while the clock runs.
 */
function feedersOf(build) {
  if (!build.state.feeders) {
    build.state.feeders = (build.world?.builds || [])
      .filter((other) => other !== build && pointsAt(other, build));
  }
  return build.state.feeders;
}

/** Every item in the game, in id order, which is the array `ItemModule` walks. */
export function itemOrder(build) {
  const world = build.world;
  if (!world) return [];
  if (!world.itemsById) {
    const known = world.catalogue?.items || {};
    world.itemsById = Object.keys(known).sort((a, b) => known[a].id - known[b].id);
  }
  return world.itemsById;
}

/** `content.items()` order, which is what `dump(null)` walks. */
export function byItemId(build, held) {
  const known = build.world?.catalogue?.items;
  if (!known) return held;
  return held.sort((a, b) => (known[a]?.id ?? 0) - (known[b]?.id ?? 0));
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

    /* `updateProximity`, and both halves of it were wrong.
    
       The offsets are relative to the tile a block is **stored** at, which is what
       `Edges.getEdges` returns and what `world.build(tile.x + point.x, ...)` adds them to.
       There was a middle and a rounding here instead, and for any block of even size that
       middle sits on a half tile: the whole ring slid one right and one up. A two by two
       press asked about the tile two to its right and never about the one touching it, so
       eighty blocks of the catalogue handed items across a gap.
    
       And the **order** is the order things were built, not the order of the ring. A block
       walks its ring when it is placed, so it sees whatever was there before in ring order;
       anything placed later simply appends itself to the end of that list. Since `dump` and
       `offload` walk from a rotating cursor, the order decides which branch is served
       first. */
    const placed = new Map(this.builds.map((build, at) => [build, at]));
    this.builds.forEach((build, at) => {
      for (const [dx, dy] of edgesOf(build.size)) {
        const other = this.at(build.x + dx, build.y + dy);
        if (!other || other === build) continue;
        if (placed.get(other) > at) continue;
        if (!build.proximity.includes(other)) build.proximity.push(other);
        if (!other.proximity.includes(build)) other.proximity.push(build);
      }
    });

    this.tick = 0;
    this.grids = [];

    /* `Time.run(delay, ...)`: what the game schedules for later rather than doing now. One
       thing uses it and it matters: an explosion goes off in waves, two frames apart, so a
       row of reactors comes down over a second rather than inside one call. */
    this.pending = [];

    /* Who is actually updated, which is not everybody: a block that fell asleep comes out
       of this list, and waking pushes it back on the **end**. */
    this.awake = this.builds.filter((build) => !build.block.no_update);
    /* Where `step` has got to, because the list moves while it is being walked. Not `at`,
       which is already the method that looks a tile up: an own property shadows it. */
    this.walking = 0;

    /* Where the bottom left of the schematic sits on the map.
    
       Almost nothing cares. A separator does: its draw is seeded from `tile.pos()`, so the
       mix a disassembler puts out is decided by **where on the map it was built**, and the
       same schematic laid down two tiles over sorts differently. Left at the origin here
       and set to what the bench uses when the two are being held against each other. */
    this.origin = [0, 0];

    /* The block registry, for the one block that needs to look another one up: a
       constructor's recipe is its configuration, so what it eats and how long it takes are
       properties of a block it was merely pointed at. */
    this.catalogue = null;
  }

  /** `Tile.pos()`: the world position of a block, packed into one int as the game packs it. */
  packed(build) {
    return ((build.x + this.origin[0]) << 16) | ((build.y + this.origin[1]) & 0xFFFF);
  }

  /** Work out the power grids, once the world is laid out. */
  wire(gridsOf) {
    this.grids = gridsOf(this);
    return this;
  }

  at(x, y) { return this.tiles.get(`${x},${y}`) || null; }

  /** One frame at sixty a second. `Time.delta` is 1. */
  /** `Time.run`: do this in `delay` frames. */
  later(delay, task) {
    this.pending.push({ left: delay, task });
  }

  step(delta = 1) {
    this.tick++;

    // Whatever came due, before anything else moves.
    if (this.pending.length) {
      const due = [];
      this.pending = this.pending.filter((one) => {
        one.left -= delta;
        if (one.left > 0) return true;
        due.push(one);
        return false;
      });
      for (const one of due) one.task();
    }

    /* The grids settle **first**, which is the order the game's own loop runs in:
       `Groups.powerGraph.update()` at `Logic.java:478`, `Groups.build.update()` at 482.

       So a block reads a real coverage on its first frame rather than a default, and what
       the grid hands out is worked out from what the generators made last frame and what
       the consumers said they wanted last frame. Run the other way round, every consumer
       got one free frame at full power: a pump on a dead grid pumped exactly one frame's
       worth of water, which is nothing and is not zero. */
    for (const grid of this.grids) grid.update(delta);
    /* Walked live and by index, cursor and all, because the list moves under it.
       `EntityGroup.update` is `for(index = 0; index < array.size; index++)`, and a block
       that falls asleep mid-walk is taken out of the array while the walk is going on. */
    for (this.walking = 0; this.walking < this.awake.length; this.walking++) {
      const build = this.awake[this.walking];
      if (build.behaviour?.update) build.behaviour.update(build, this, delta);
    }
  }

  /**
   * `EntityGroup.remove`: a block that fell asleep leaves the update list.
   *
   * And the list is **unordered**, which is the whole of it: `array = new Seq<>(false, ...)`,
   * so removing an entity drops the **last** one into its place rather than shifting
   * everything down. Two empty belts going to sleep on the same frame therefore reshuffle
   * the tail of the update order, and a press that was updated after a belt is updated
   * before it from then on.
   *
   * Which is worth exactly one frame of that press's ninety, once. `crafter-two-presses`
   * had been one coal apart since the day it was written.
   */
  dropAwake(build) {
    const at = this.awake.indexOf(build);
    if (at < 0) return;
    this.awake[at] = this.awake[this.awake.length - 1];
    this.awake.pop();
    // `if(index >= idx) index--`, so the one swapped into the hole is not stepped over.
    if (this.walking >= at) this.walking--;
  }

  /** `add()`, which appends, and is why waking up costs a block its place. */
  wake(build) {
    if (!this.awake.includes(build)) this.awake.push(build);
  }

  run(seconds) {
    const steps = Math.round(seconds * TICKS);
    for (let i = 0; i < steps; i++) this.step();
    return this;
  }
}

/**
 * `DirectionBridge.findLink`: the first block of the same kind along the way it points.
 *
 * Erekir's bridges carry no configuration at all, which is what makes them different from
 * Serpulo's: a bridge conveyor remembers a tile and a duct bridge simply looks. A bridge in
 * between shortens the reach of the one behind it, and a chain is built by pointing them at
 * each other rather than by wiring them.
 */
export function bridgeLink(build) {
  const [dx, dy] = DIRECTIONS[build.rotation];
  for (let i = 1; i <= (build.block.range || 4); i++) {
    const other = build.world?.at(build.x + dx * i, build.y + dy * i);
    if (other && other.name === build.name) return other;
  }
  return null;
}
