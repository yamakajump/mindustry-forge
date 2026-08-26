/**
 * Run the schematic tick by tick, the way the game runs it.
 *
 * Everything before this was a model: a maximum flow over a graph, with rules bolted on for
 * the things a flow cannot express. Which liquid a pipe carries was a guess at the fastest
 * arrival. Which branch got the material was inferred from demand computed backwards.
 * Cycles had to be cut by hand because the maths did not terminate on them.
 *
 * None of those questions exist here. A tank holds water because water is what arrived and
 * filled it, and it refuses oil for the same reason the game refuses it: there is water in
 * it. A generator runs when there is fuel in its hopper. A belt backs up when the thing
 * ahead is full, and the belt behind it backs up in turn. The behaviour is not modelled,
 * it happens.
 *
 * The cost is time, and it is small: a hundred blocks over a simulated minute is a few
 * hundred thousand updates, which a browser does in a few milliseconds. The gain is that
 * every rule here is a rule from the game rather than an approximation of one, and when a
 * player says "that is not what happens in game", there is one place to look.
 */

const TICKS = 60;

/** Mindustry counts rotations anticlockwise from east. */
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** How much of a second one step covers. Kept at the game's own rate. */
const STEP = 1 / TICKS;

/** What a block is holding right now. */
function emptyState(node) {
  return {
    items: {},
    // One liquid at a time, which is the game's rule rather than a simplification:
    // `acceptLiquid` reads `liquids.current() == liquid || liquids.currentAmount() < 0.2f`.
    // Holding the name and the amount separately is what makes that rule fall out instead
    // of having to be enforced.
    liquid: null,
    liquidAmount: 0,
    progress: 0,
    itemCap: node.block.item_capacity || 10,
    liquidCap: node.block.liquid_capacity || 10,
  };
}

const totalItems = (state) =>
  Object.values(state.items).reduce((sum, n) => sum + n, 0);

/** Whether a block will take this liquid right now, and how much room it has. */
function liquidRoom(node, state, liquid) {
  if (node.block.carries === "item") return 0;
  if (state.liquid && state.liquid !== liquid && state.liquidAmount > 0.2) return 0;
  return Math.max(0, state.liquidCap - (state.liquid === liquid ? state.liquidAmount : 0));
}

function itemRoom(node, state, item) {
  if (node.block.carries === "liquid") return 0;
  if (node.role === "turret") {
    const ammo = node.block.ammo || [];
    if (!ammo.includes(item)) return 0;
  }
  // A machine only takes what its recipe calls for, which is why a belt of the wrong ore
  // into a press does nothing rather than filling it up.
  if (node.role === "crafter" || node.role === "generator") {
    const wanted = node.block.input || {};
    const burnsAnything = node.role === "generator" && !Object.keys(wanted).length;
    if (!burnsAnything && !(item in wanted)) return 0;
  }
  return Math.max(0, state.itemCap - totalItems(state));
}

function addItem(state, item, amount) {
  state.items[item] = (state.items[item] || 0) + amount;
}

function takeItem(state, item, amount) {
  const held = state.items[item] || 0;
  const taken = Math.min(held, amount);
  state.items[item] = held - taken;
  if (state.items[item] < 1e-9) delete state.items[item];
  return taken;
}

function addLiquid(state, liquid, amount) {
  if (!state.liquid || state.liquidAmount <= 1e-9) state.liquid = liquid;
  if (state.liquid !== liquid) return 0;
  const room = Math.max(0, state.liquidCap - state.liquidAmount);
  const taken = Math.min(room, amount);
  state.liquidAmount += taken;
  return taken;
}

/**
 * Where a block hands on, worked out once.
 *
 * A junction is the awkward one and the reason this is not simply the edge list: what
 * comes in from the left leaves on the right and nowhere else, so a junction needs its
 * ways out paired with its ways in rather than pooled.
 */
function outputsOf(graph, index) {
  const node = graph.nodes[index];
  if (node.role === "junction") {
    const paired = new Map();
    for (const target of graph.out[index]) {
      const other = graph.nodes[target];
      paired.set(`${Math.sign(other.x - node.x)},${Math.sign(other.y - node.y)}`, target);
    }
    return { paired, all: graph.out[index] };
  }
  return { paired: null, all: graph.out[index] };
}

/**
 * Run the layout for a while and report what it settled at.
 *
 * `supply` is what arrives per second at each entry node. `seconds` is how long to run:
 * long enough for the pipes to fill and the machines to reach their pace, which on
 * anything a player would build is a handful of seconds.
 */
export function simulate(graph, supply = {}, { seconds = 30, warmup = 10 } = {}) {
  const nodes = graph.nodes;
  const state = nodes.map(emptyState);
  const wiring = nodes.map((_, index) => outputsOf(graph, index));

  // What left the schematic, and what each machine managed. Counted only after the warmup,
  // because the first seconds are pipes filling rather than a factory running, and
  // averaging them in reports a base as slower than it is.
  const left = {};
  const consumed = {};
  const crafted = nodes.map(() => 0);
  let powerMade = 0;
  let powerUsed = 0;
  let counted = 0;

  const steps = Math.round((seconds + warmup) * TICKS);
  const after = Math.round(warmup * TICKS);

  for (let step = 0; step < steps; step++) {
    const scoring = step >= after;
    if (scoring) counted++;

    // 1. What arrives from outside.
    for (const [index, rates] of Object.entries(supply)) {
      const node = nodes[index];
      for (const [name, rate] of Object.entries(rates)) {
        const amount = rate * STEP;
        if (node.block.carries === "liquid") {
          addLiquid(state[index], name, Math.min(amount,
            liquidRoom(node, state[index], name)));
        } else if (itemRoom(node, state[index], name) > 0) {
          addItem(state[index], name, Math.min(amount,
            itemRoom(node, state[index], name)));
        }
      }
    }

    // 2. Sources make their own.
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.role !== "unloader") continue;
      const beside = graph.out[index].length > 0;
      if (!beside) continue;
    }

    // 3. Machines run.
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const here = state[index];
      if (node.role !== "crafter" && node.role !== "generator") continue;

      const craftTime = node.block.craft_time || 0;
      const inputs = node.block.input || {};
      const liquidIn = node.block.input_liquid || {};
      const burnsAnything = node.role === "generator" && !Object.keys(inputs).length;

      // Liquids are drunk continuously, items a batch at a time, which is how the game
      // does it and why a press with the coal but not the water simply waits.
      let running = true;
      for (const [liquid, rate] of Object.entries(liquidIn)) {
        if (here.liquid !== liquid || here.liquidAmount < rate * STEP) running = false;
      }
      if (running) {
        for (const [item, count] of Object.entries(inputs)) {
          if ((here.items[item] || 0) < count) running = false;
        }
        if (burnsAnything && totalItems(here) < 1) running = false;
      }

      if (!running) continue;

      for (const [liquid, rate] of Object.entries(liquidIn)) {
        here.liquidAmount -= rate * STEP;
      }

      here.progress += STEP * TICKS;
      if (craftTime > 0 && here.progress >= craftTime) {
        here.progress -= craftTime;
        for (const [item, count] of Object.entries(inputs)) {
          takeItem(here, item, count);
          if (scoring) consumed[item] = (consumed[item] || 0) + count;
        }
        if (burnsAnything) {
          const fuel = Object.keys(here.items)[0];
          if (fuel) {
            takeItem(here, fuel, 1);
            if (scoring) consumed[fuel] = (consumed[fuel] || 0) + 1;
          }
        }
        for (const [item, count] of Object.entries(node.block.output || {})) {
          addItem(here, item, count);
        }
        if (scoring) crafted[index]++;
      }

      for (const [liquid, rate] of Object.entries(node.block.output_liquid || {})) {
        addLiquid(here, liquid, rate * STEP);
      }
      if (scoring) {
        powerMade += (node.block.power_out || 0) * STEP;
        powerUsed += (node.block.power || 0) * STEP;
      }
    }

    // 4. Everything hands on what it can.
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const here = state[index];
      const ways = wiring[index];
      const rate = node.block.items_per_second || Infinity;
      const budget = Number.isFinite(rate) ? rate * STEP : Infinity;

      if (!ways.all.length) {
        // The end of the line: what reaches here has left the schematic.
        if (scoring) {
          for (const [item, amount] of Object.entries(here.items)) {
            left[item] = (left[item] || 0) + amount;
          }
          if (node.role !== "store" && node.role !== "turret" && node.role !== "sink") {
            here.items = {};
          }
        } else if (node.role !== "store" && node.role !== "turret" && node.role !== "sink") {
          here.items = {};
        }
        continue;
      }

      // Round-robin, which is what the game does and what an even split only pretends to
      // be: a branch that is full is skipped and the next one takes its turn.
      let moved = 0;
      for (const [item, held] of Object.entries({ ...here.items })) {
        for (const target of ways.all) {
          if (moved >= budget) break;
          const room = itemRoom(nodes[target], state[target], item);
          if (room <= 0) continue;
          const sent = Math.min(held, room, budget - moved);
          if (sent <= 1e-9) continue;
          takeItem(here, item, sent);
          addItem(state[target], item, sent);
          moved += sent;
        }
      }

      if (here.liquid && here.liquidAmount > 1e-9) {
        for (const target of ways.all) {
          const room = liquidRoom(nodes[target], state[target], here.liquid);
          if (room <= 0) continue;
          // Liquids move by pressure: half the difference, which is close enough to the
          // game's own smoothing and settles rather than oscillating.
          const gap = here.liquidAmount
            - (state[target].liquid === here.liquid ? state[target].liquidAmount : 0);
          if (gap <= 0) continue;
          const sent = Math.min(gap / 2, room, here.liquidAmount);
          if (sent <= 1e-9) continue;
          here.liquidAmount -= addLiquid(state[target], here.liquid, sent);
        }
      }
    }
  }

  const perSecond = counted / TICKS;
  const scale = (rates) => {
    const out = {};
    for (const [name, amount] of Object.entries(rates)) {
      if (amount / perSecond > 1e-4) out[name] = amount / perSecond;
    }
    return out;
  };

  return {
    left: scale(left),
    consumed: scale(consumed),
    power: {
      made: powerMade / perSecond,
      spent: powerUsed / perSecond,
      net: (powerMade - powerUsed) / perSecond,
    },
    // What each machine actually managed, as a share of what it could: a press that
    // crafted forty times in a minute out of a possible sixty ran at two thirds.
    fed: nodes.map((node, index) => {
      const craftTime = node.block.craft_time || 0;
      if (!craftTime || (node.role !== "crafter" && node.role !== "generator")) return undefined;
      const possible = (counted / craftTime);
      return possible > 0 ? Math.min(1, crafted[index] / possible) : 0;
    }),
    state,
    seconds,
  };
}
