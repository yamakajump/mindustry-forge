/**
 * Running a schematic, tick by tick, and writing down what came out.
 *
 * The analytic side of this repository answers "what does this settle at" in a
 * millisecond and is checked three ways against the game. This answers what it cannot:
 * how long the pipes take to fill, where a buffer backs up, which branch of a split
 * actually gets served. The two have to agree in the steady state, and each is the
 * other's check.
 */

import { DIRECTIONS, TICKS, World } from "./core.js";
import { behaviourOf } from "./carriers.js";

/**
 * A source of items, standing where the player said things arrive.
 *
 * Handed in whole items at the stated rate rather than fractions of one, because that is
 * what the game moves: a belt fed 6.5 items a second receives six on one second and seven
 * on the next, and a model that hands over 0.108 of an item every frame reports a
 * throughput no belt ever achieves.
 */
export function behind(build) {
  const [dx, dy] = DIRECTIONS[(build.rotation + 2) % 4];
  return { x: build.x + dx, y: build.y + dy, block: {}, role: "source" };
}

/** Hand one item to a block as though a belt behind it had. */
export function feed(build, item) {
  const source = behind(build);
  if (!build.acceptItem(source, item)) return false;
  build.handleItem(source, item);
  return true;
}

/**
 * Where the line ends, counting what falls off it.
 *
 * A belt with nothing in front of it does not deliver in the game, it fills up and stops,
 * which is correct and useless for measuring. So the empty tile a line points at gets
 * something standing on it that takes everything and writes down what it took: the same
 * thing a player would learn by putting a container there.
 */
class Drain {
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

class Tap {
  constructor(build, item, perSecond) {
    this.build = build;
    this.item = item;
    this.perSecond = perSecond;
    this.owed = 0;
    this.given = 0;
    this.refused = 0;

    /* Standing behind whatever it feeds, so that the block it feeds can tell which side it
       came from. A belt refuses anything handed in head on and takes anything handed in
       from behind, so a source that is nowhere at all is a source a belt cannot answer
       about. */
    this.source = behind(build);
  }

  offer(step) {
    this.owed += (this.perSecond * step) / TICKS;
    while (this.owed >= 1) {
      if (!this.build.acceptItem(this.source, this.item)) {
        this.refused++;
        return;
      }
      this.build.handleItem(this.source, this.item);
      this.owed -= 1;
      this.given++;
    }
  }
}

/**
 * Run it, and report what each marked exit received.
 *
 * `warmup` is thrown away rather than averaged in. The first seconds are pipes filling
 * rather than a factory running, and counting them reports a design as slower than it is
 * for as long as the measurement is short.
 */
export function simulate(graph, { feeds = {}, stock = {}, seconds = 20, warmup = 5 } = {}) {
  const world = new World(graph, behaviourOf);

  // What a container starts out holding. A vault full of copper with an unloader beside it
  // is an ordinary thing to want to measure, and it cannot be expressed as a rate.
  for (const [index, held] of Object.entries(stock)) {
    const build = world.builds[Number(index)];
    if (!build) continue;
    for (const [item, count] of Object.entries(held)) build.items.add(item, count);
  }

  const taps = [];
  for (const [index, rates] of Object.entries(feeds)) {
    const build = world.builds[Number(index)];
    if (!build) continue;
    for (const [item, rate] of Object.entries(rates)) {
      if (rate > 0) taps.push(new Tap(build, item, rate));
    }
  }

  /* A drain on every tile a line points at and nothing occupies. That is where the
     schematic ends: a belt torn out of a base stops at the edge of what was copied, and
     what reaches that edge is what the design delivers. */
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

  const total = Math.round((seconds + warmup) * TICKS);
  const after = Math.round(warmup * TICKS);
  let counted = 0;
  const held = new Map();

  for (let step = 0; step < total; step++) {
    for (const tap of taps) tap.offer(1);
    world.step(1);

    if (step === after) {
      // The line is full: what was delivered before now was the filling of it.
      for (const drain of drains) held.set(drain, new Map(drain.taken));
    }
    if (step >= after) counted++;
  }

  const out = new Map();
  for (const drain of drains) {
    const before = held.get(drain) || new Map();
    for (const [item, count] of drain.taken) {
      const since = count - (before.get(item) || 0);
      if (since > 0) out.set(item, (out.get(item) || 0) + since);
    }
  }

  const perSecond = {};
  for (const [item, count] of out) perSecond[item] = count / (counted / TICKS);

  return {
    world,
    seconds,
    delivered: perSecond,
    offered: Object.fromEntries(taps.map((tap) => [tap.item, tap.given])),
    refused: taps.reduce((sum, tap) => sum + tap.refused, 0),
  };
}

/**
 * What one block is carrying right now, for a picture that moves.
 *
 * A belt reports the position of each item along it, which is what makes it possible to
 * draw them sliding rather than to draw a number.
 */
export function snapshot(world) {
  return world.builds.map((build) => ({
    x: build.x,
    y: build.y,
    name: build.name,
    items: Object.fromEntries([...build.items.counts].filter(([, n]) => n > 0)),
    // `ys` runs from 0 at the back of the belt to 1 at the front.
    along: build.state.ys ? build.state.ys.slice() : null,
    carrying: build.state.ids ? build.state.ids.slice() : null,
  }));
}
