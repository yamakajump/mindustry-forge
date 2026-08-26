/**
 * What a schematic produces, where it chokes and what it wastes, computed in the browser.
 *
 * Every other Mindustry calculator on the web answers a different question: how many
 * machines for a clean ratio. That is arithmetic about a factory nobody has built. This is
 * about the one in front of you.
 *
 * Running here rather than on a server is not only cheaper, it is the difference between a
 * page anybody can host and a service somebody has to pay for. The visitor's machine does
 * the work, and a schematic is a few hundred blocks, so the work is nothing.
 *
 * There is exactly one implementation of this analysis and it is this file. The Python
 * side of the repository runs the real game and measures the same schematic; the two are
 * compared in CI. A second implementation of the calculation would be a second thing to be
 * wrong, which is the failure this repository is built around avoiding.
 */

import { fromBase64 } from "./schematic.js";
import { demand, requirements } from "./needs.js";
import { ports, feedPorts, mainPorts } from "./ports.js";
import { throughput } from "./maxflow.js";

/** Mindustry counts rotations anticlockwise from east. */
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Ticks in a second. The game states craft times and drill times in ticks. */
const TICKS = 60;

/** Rounds of pushing supply forward before a layout is called unsettled. */
const ROUNDS = 200;

/** Below this, two rates are the same number, in items a second. */
const SETTLED = 1e-4;

let catalogue = null;

/** Load the block registry the game itself printed. Cached, since it never changes. */
export async function loadCatalogue(url = "./forge/blocks.json") {
  if (catalogue) return catalogue;
  const answer = await fetch(url);
  if (!answer.ok) throw new Error("catalogue de blocs introuvable");
  catalogue = await answer.json();
  return catalogue;
}

export function useCatalogue(data) {
  catalogue = data;
  return catalogue;
}

function blockOf(name) {
  const found = catalogue.blocks[name];
  // A schematic can hold a block from a mod this catalogue has never seen. Refusing the
  // whole thing over one tile would make the tool useless on exactly the creative builds
  // worth looking at, so an unknown block becomes a wall and is reported as unknown.
  if (!found) return { name, size: 1, role: "unknown" };
  return { name, size: 1, ...found };
}

const craftsPerSecond = (block) => (block.craft_time ? TICKS / block.craft_time : 0);
const produces = (block, item) =>
  (block.output?.[item] || 0) * craftsPerSecond(block);
const consumes = (block, item) =>
  (block.input?.[item] || 0) * craftsPerSecond(block);

/**
 * The tiles a block covers, given the tile it is stored on.
 *
 * Mindustry stores a block by its centre and offsets by `-(size - 1) / 2`, truncating
 * towards zero. A two-wide drill stored at (4, 4) covers (4, 4) to (5, 5).
 */
function footprint(x, y, size) {
  const offset = Math.trunc(-(size - 1) / 2);
  const out = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) out.push([x + offset + dx, y + offset + dy]);
  }
  return out;
}

/** The tiles this block tries to hand items to. */
function outputsOf(node) {
  if (node.role === "conveyor") {
    const [dx, dy] = DIRECTIONS[node.rotation % 4];
    return [[node.x + dx, node.y + dy]];
  }
  if (node.role === "junction") {
    // Straight through, and only straight through. A junction exists so two lines can
    // cross without merging: what comes in from the left leaves on the right and never
    // turns. Modelled as handing to all four sides, it merged the very lines it is there
    // to keep apart.
    //
    // Which of the four pairs an item takes depends on the side it arrived from, so the
    // four ways out are all offered here and `pairedThrough` sorts them out when the flow
    // is pushed.
    return DIRECTIONS.map(([dx, dy]) => [node.x + dx, node.y + dy]);
  }
  if (node.role === "bridge") {
    // A bridge carries over a gap to the tile it remembers, and that memory is the whole
    // point of it: without reading the link, a line that jumps a wall reads as two
    // separate lines, both of which end in the air.
    if (node.link) return [node.link];
    // Unlinked, it behaves as an ordinary block and hands to whatever touches it.
    return DIRECTIONS.map(([dx, dy]) => [node.x + dx, node.y + dy]);
  }
  // Nothing leaves a block that makes nothing. A battery, a power node, a turret and a
  // generator all sit in the middle of a base and hand nothing on, and treating them as
  // offloaders gave the first real schematic 39 outgoing links from its batteries and 49
  // from its steam generators: every drop of water supplied to it drained into a battery
  // and the layout reported producing nothing at all.
  if (node.role === "power" || node.role === "sink") return [];
  if ((node.role === "crafter" || node.role === "generator")
      && !Object.keys(node.block.output || {}).length
      && !Object.keys(node.block.output_liquid || {}).length) {
    return [];
  }

  // Routers, drills, crafters and anything else that offloads: every tile touching the
  // footprint, minus the footprint itself.
  const covered = new Set(node.footprint.map(([x, y]) => `${x},${y}`));
  const around = [];
  const seen = new Set();
  for (const [cx, cy] of node.footprint) {
    for (const [dx, dy] of DIRECTIONS) {
      const key = `${cx + dx},${cy + dy}`;
      if (covered.has(key) || seen.has(key)) continue;
      seen.add(key);
      around.push([cx + dx, cy + dy]);
    }
  }
  return around;
}

/**
 * Whether this block takes an item handed in from that tile.
 *
 * The rule that matters and is easy to get backwards: a conveyor refuses anything pushed
 * against its own direction of travel. Belt facing right, something to its right pushing
 * left, and nothing moves. Built without this, a graph reports a working loop between two
 * belts pointing at each other.
 */
function accepts(node, fromTile) {
  if (node.role === "unknown" || node.role === "power") return false;
  if (node.role === "conveyor") {
    const [dx, dy] = DIRECTIONS[node.rotation % 4];
    return !(fromTile[0] === node.x + dx && fromTile[1] === node.y + dy);
  }
  if (node.role === "junction" || node.role === "router" || node.role === "conduit"
      || node.role === "bridge" || node.role === "sorter") {
    return true;
  }
  // A drill makes its own ore and takes nothing. Feeding one is a wasted belt.
  if (node.role === "drill") return false;
  return node.role === "crafter" || node.role === "sink" || node.role === "generator" ||
    Object.keys(node.block.input || {}).length > 0 ||
    Object.keys(node.block.input_liquid || {}).length > 0;
}

/**
 * Which resources are liquids, taken from the catalogue rather than listed here.
 *
 * It matters because the two travel on separate networks: a conveyor will not carry water
 * and a conduit will not carry coal. Mixing them lets a belt deliver oil, which reads as a
 * working factory and is not one.
 */
const LIQUIDS = new Set();
function noteLiquids() {
  if (LIQUIDS.size) return;
  for (const block of Object.values(catalogue.blocks)) {
    for (const name of Object.keys(block.input_liquid || {})) LIQUIDS.add(name);
    for (const name of Object.keys(block.output_liquid || {})) LIQUIDS.add(name);
  }
}
const isLiquid = (name) => LIQUIDS.has(name);

/**
 * Where a bridge actually reaches, checked against what the game allows.
 *
 * The stored offset cannot simply be believed. A schematic copied out of a base keeps the
 * links of bridges whose far end was not copied, and those come back as nonsense: measured
 * on one real schematic, five bridges claimed to reach 365 tiles left and 394 down. Drawn
 * as given, they were long diagonal bars across the whole picture.
 *
 * The game's own two rules settle it. A bridge reaches along one axis, never diagonally,
 * and never further than its range. Anything else is a bridge that is not linked.
 */
function bridgeLink(tile, block) {
  const config = tile.config;
  if (!config || config.type !== 7) return null;
  const { dx, dy } = config;
  if (!dx && !dy) return null;
  if (dx !== 0 && dy !== 0) return null;
  const reach = Math.abs(dx) + Math.abs(dy);
  if (reach > (block.range || 4)) return null;
  return [tile.x + dx, tile.y + dy];
}

/** Build the network a list of tiles describes. */
export function buildGraph(tiles) {
  const nodes = [];
  const at = new Map();

  for (const tile of tiles) {
    const block = blockOf(tile.block);
    const node = {
      x: tile.x, y: tile.y, rotation: tile.rotation | 0,
      block, name: block.name, role: block.role || "",
      config: tile.config || null,
      link: bridgeLink(tile, block),
      footprint: footprint(tile.x, tile.y, block.size || 1),
    };
    const index = nodes.length;
    nodes.push(node);
    for (const [fx, fy] of node.footprint) at.set(`${fx},${fy}`, index);
  }

  const edges = [];
  const seen = new Set();
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    for (const tile of outputsOf(node)) {
      const target = at.get(`${tile[0]},${tile[1]}`);
      if (target === undefined || target === index) continue;
      // Which of this block's own tiles the item left from, since a conveyor cares which
      // side it was handed on.
      const leaving = node.footprint.reduce((best, cell) =>
        Math.abs(cell[0] - tile[0]) + Math.abs(cell[1] - tile[1]) <
        Math.abs(best[0] - tile[0]) + Math.abs(best[1] - tile[1]) ? cell : best);
      if (!accepts(nodes[target], leaving)) continue;
      const key = `${index}>${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([index, target]);
    }
  }

  const out = nodes.map(() => []);
  const into = nodes.map(() => []);
  for (const [a, b] of edges) { out[a].push(b); into[b].push(a); }

  return { nodes, edges, out, into };
}

const addTo = (rates, item, amount) => {
  rates[item] = (rates[item] || 0) + amount;
};
const totalOf = (rates) => Object.values(rates).reduce((a, b) => a + b, 0);

/**
 * Push supply forward to a fixed point.
 *
 * A single forward pass is only right on a graph with no loops, and a router pointed back
 * into its own line makes one out of an ordinary belt. A layout that has not settled is
 * reported as unsettled rather than quietly rounded off.
 */
/**
 * How much of each resource each node can usefully absorb, counting everything behind it.
 *
 * Worked out backwards from the machines, once, before anything is pushed. It is what
 * turns "split evenly" into "send it where it is wanted", and it is the difference between
 * describing a factory and describing its blueprint.
 *
 * Capped by what a carrier can move, since a belt behind ten presses still only carries
 * six and a half items a second and promising the presses more would invent throughput.
 */

/** How much of everything a block needs per second to run flat out. */
function appetite(block) {
  const wants = {};
  for (const item of Object.keys(block.input || {})) wants[item] = consumes(block, item);
  for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
    wants[liquid] = rate;
  }
  return wants;
}

/**
 * How much of each resource reaches each machine, solved rather than approached.
 *
 * One maximum flow per resource, because the networks do not share: water and coal travel
 * on different carriers, and a pipe full of water is not a belt with room for coal.
 *
 * This replaced a solver that pushed supply forward round after round until the numbers
 * stopped moving. That is fine on a line and wrong on anything with a loop, and it was
 * wrong in the worst way: every round re-applied each carrier's rate cap, so a network
 * that loops multiplied by a fraction below one on every pass. A schematic worth 2,402
 * power a second came out at 648, and an earlier version of the same idea at 1e-103.
 */
function solveFlow(graph, supply) {
  const nodes = graph.nodes.length;
  const arriving = graph.nodes.map(() => ({}));

  const resources = new Set();
  for (const rates of Object.values(supply)) {
    for (const name of Object.keys(rates)) resources.add(name);
  }
  for (const node of graph.nodes) {
    for (const [item, count] of Object.entries(node.block.output || {})) {
      if (count > 0) resources.add(item);
    }
    for (const item of Object.keys(node.block.output_liquid || {})) resources.add(item);
  }

  // Machines make things that other machines eat, so the chain is walked in order: what a
  // press produces becomes a source for whatever the press feeds. Bounded by the number of
  // stages a real recipe tree has, and stopped when a round adds nothing.
  const made = graph.nodes.map(() => ({}));
  const fed = {};

  for (let round = 0; round < 12; round++) {
    let moved = false;

    for (const resource of resources) {
      const liquid = isLiquid(resource);
      const sources = {};
      for (const [index, rates] of Object.entries(supply)) {
        if (rates[resource] > 0) sources[index] = rates[resource];
      }
      for (let index = 0; index < nodes; index++) {
        const rate = made[index][resource] || 0;
        if (rate > SETTLED) sources[index] = (sources[index] || 0) + rate;
      }
      if (!Object.keys(sources).length) continue;

      const out = throughput(graph, {
        supply: sources,
        capacity: (index) => capacityFor(graph.nodes[index], resource, liquid),
        wants: (index) => appetiteFor(graph.nodes[index], resource,
                                      !graph.out[index].length),
      });

      for (let index = 0; index < nodes; index++) {
        const before = arriving[index][resource] || 0;
        if (Math.abs(out.received[index] - before) > SETTLED) moved = true;
        arriving[index][resource] = out.received[index];
      }
    }

    // What each machine makes with what it just received.
    for (let index = 0; index < nodes; index++) {
      const node = graph.nodes[index];
      if (node.role !== "crafter" && node.role !== "generator") continue;
      const wants = appetite(node.block);
      let share = 1;
      for (const [name, wanted] of Object.entries(wants)) {
        if (wanted <= 0) continue;
        share = Math.min(share, (arriving[index][name] || 0) / wanted);
      }
      if (node.role === "generator" && !Object.keys(wants).length && node.block.craft_time) {
        const burn = TICKS / node.block.craft_time;
        const offered = Object.entries(arriving[index])
          .filter(([name]) => !isLiquid(name))
          .reduce((sum, [, rate]) => sum + rate, 0);
        share = Math.min(share, burn > 0 ? offered / burn : 1);
      }
      share = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
      fed[index] = share;

      const now = {};
      for (const item of Object.keys(node.block.output || {})) {
        now[item] = produces(node.block, item) * share;
      }
      for (const [liquid, rate] of Object.entries(node.block.output_liquid || {})) {
        now[liquid] = rate * share;
      }
      for (const name of new Set([...Object.keys(now), ...Object.keys(made[index])])) {
        if (Math.abs((now[name] || 0) - (made[index][name] || 0)) > SETTLED) moved = true;
      }
      made[index] = now;
    }

    if (!moved) return { arriving, made, fed, settled: true, rounds: round + 1 };
  }
  return { arriving, made, fed, settled: false, rounds: 12 };
}

/** What one block can pass per second, for one resource. */
function capacityFor(node, resource, liquid) {
  const carries = node.block.carries;
  if (carries && (carries === "liquid") !== liquid) return 0;
  if (node.role === "conveyor" || node.role === "junction" || node.role === "bridge") {
    return node.block.items_per_second || Infinity;
  }
  // A machine passes nothing on: what leaves it is what it makes, which is a separate
  // source rather than the same flow continuing.
  if (node.role === "crafter" || node.role === "generator" || node.role === "sink") {
    return Infinity;
  }
  if (node.role === "power" || node.role === "unknown") return 0;
  return Infinity;
}

/**
 * What one block will take of one resource per second.
 *
 * A carrier with nowhere left to hand on counts too. It is where the schematic ends: a
 * belt torn out of a base stops at the edge of what was copied, and treating that as a
 * wall rather than as an exit made every line report nothing at all, because a maximum
 * flow with no sink is a maximum flow of zero.
 */
function appetiteFor(node, resource, isExit) {
  if (isExit && node.block.carries) {
    const carries = node.block.carries;
    if ((carries === "liquid") !== isLiquid(resource)) return 0;
    return node.block.items_per_second || Infinity;
  }
  if (node.role === "crafter" || node.role === "generator" || node.role === "sink") {
    const wants = appetite(node.block);
    if (wants[resource] > 0) return wants[resource];
    if (node.role === "generator" && !Object.keys(wants).length && node.block.craft_time
        && !isLiquid(resource)) {
      return TICKS / node.block.craft_time;
    }
    return 0;
  }
  return 0;
}

export function solve(graph, supply = {}) {
  const solved = solveFlow(graph, supply);

  // What each block passes on, in the shape the rest of this file already reads: a carrier
  // hands on what reached it, a machine hands on what it made.
  const through = graph.nodes.map((node, index) =>
    (node.role === "crafter" || node.role === "generator")
      ? solved.made[index]
      : (node.role === "sink" || node.role === "power" ? {} : solved.arriving[index]));

  return {
    through,
    fed: solved.fed,
    settled: solved.settled,
    rounds: solved.rounds,
    arriving: solved.arriving,
    delivered: deliveredFlow(graph, solved),
  };
}

/**
 * What leaves: what a sink swallowed, and what a carrier with nowhere left to hand on is
 * holding. The second case is the honest one for a schematic torn out of a base, whose
 * belt ends at the edge because the rest of the factory was not copied.
 */
function deliveredFlow(graph, solved) {
  const total = {};
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role === "sink") {
      for (const [item, rate] of Object.entries(solved.arriving[index])) {
        addTo(total, item, rate);
      }
      continue;
    }
    if (graph.out[index].length) continue;
    const held = (node.role === "crafter" || node.role === "generator")
      ? solved.made[index] : solved.arriving[index];
    for (const [item, rate] of Object.entries(held)) addTo(total, item, rate);
  }
  return total;
}


/**
 * Power made and power spent, per second.
 *
 * Not routed through the grid. A power node has a reach and a schematic can hold two
 * networks that never touch, so this is a budget rather than a simulation, and it is
 * stated as one. It is also the number the schematic that exposed all this was named
 * after: "Water power 2306 energy".
 */
export function powerBudget(graph, solved) {
  let made = 0;
  let spent = 0;
  for (let index = 0; index < graph.nodes.length; index++) {
    const block = graph.nodes[index].block;
    const running = solved.fed[index] === undefined ? 1 : solved.fed[index];
    made += (block.power_out || 0) * running;
    spent += (block.power || 0) * running;
  }
  return { made, spent, net: made - spent };
}

/**
 * What reaches somewhere it is meant to stop: a sink, or a carrier with nowhere left to
 * hand on. The second case is the honest one for a schematic torn out of a base, whose
 * belt ends at the edge because the rest of the factory was not copied.
 */
function delivered(graph, through, pull) {
  const total = {};
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role !== "sink" && graph.out[index].length) continue;
    const source = node.role === "sink"
      ? arrivingAt(graph, through, index, pull) : through[index];
    for (const [item, amount] of Object.entries(source)) addTo(total, item, amount);
  }
  return total;
}

/**
 * The ways out of a junction that face a way in.
 *
 * A junction crosses two lines without merging them, so a side only leads anywhere if
 * something feeds the opposite side. Offering all four made two lines that merely cross
 * pour into each other.
 */
function pairedThrough(graph, index) {
  const node = graph.nodes[index];
  const out = [];
  for (const target of graph.out[index]) {
    const other = graph.nodes[target];
    const dx = Math.sign(other.x - node.x);
    const dy = Math.sign(other.y - node.y);
    const behind = graph.into[index].some((source) => {
      const from = graph.nodes[source];
      return Math.sign(from.x - node.x) === -dx && Math.sign(from.y - node.y) === -dy;
    });
    if (behind) out.push(target);
  }
  return out;
}

function arrivingAt(graph, through, index, pull) {
  const total = {};
  for (const upstream of graph.into[index]) {
    const siblings = graph.out[upstream];
    for (const [item, amount] of Object.entries(through[upstream])) {
      // The same rule as the forward pass. Two different splits between the same two
      // nodes is how a sink comes to receive something the network never sent it.
      const appetites = siblings.map((target) => pull?.[target]?.[item] || 0);
      const sum = appetites.reduce((a, b) => a + b, 0);
      const mine = sum > SETTLED
        ? (pull?.[index]?.[item] || 0) / sum
        : 1 / Math.max(1, siblings.length);
      addTo(total, item, amount * mine);
    }
  }
  return total;
}

/**
 * Blocks nothing inside the schematic feeds, which is where the outside comes in.
 *
 * A block leading nowhere is not one of them. Feeding an orphan belt handed it the full
 * supply and counted every item straight back out as delivered: the first real schematic
 * this ran on reported 240 coal a minute out of one stranded conveyor.
 */
function entrances(graph, resource) {
  const carries = isLiquid(resource) ? "liquid" : "item";
  const on = graph.nodes.filter((n) => n.block.carries === carries);

  // A belt from outside arrives at the edge of what was copied, so the entry points are
  // the carriers on the boundary. Asking instead for blocks with nothing feeding them
  // finds none at all in a layout whose network loops, which is most power schematics:
  // the first one tried this way had nineteen entry points, every one of them a battery,
  // and every drop of water supplied drained into one.
  if (!on.length) return [];
  const left = Math.min(...on.map((n) => n.x));
  const right = Math.max(...on.map((n) => n.x));
  const bottom = Math.min(...on.map((n) => n.y));
  const top = Math.max(...on.map((n) => n.y));

  const edge = [];
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.block.carries !== carries || !graph.out[index].length) continue;
    if (node.x === left || node.x === right || node.y === bottom || node.y === top) {
      edge.push(index);
    }
  }
  // A network entirely inside its own box still has to be fed somewhere, and the head of
  // it is as good a place as any.
  return edge.length ? edge
    : graph.nodes.map((_, i) => i).filter((i) =>
        graph.nodes[i].block.carries === carries && graph.out[i].length);
}

/** Blocks that neither receive nor deliver anything. */
function orphans(graph) {
  const connected = new Set();
  for (const [a, b] of graph.edges) { connected.add(a); connected.add(b); }
  const out = [];
  for (let i = 0; i < graph.nodes.length; i++) if (!connected.has(i)) out.push(i);
  return out;
}

/**
 * The starved machine holding the layout back.
 *
 * A machine nothing feeds at all is not the bottleneck, it is a machine somebody forgot to
 * connect, and it is reported as waste instead. Naming it here pointed at the wrong block
 * on the first real schematic this ran on.
 */
function bottleneckOf(graph, solved) {
  let worst = null;
  for (const [index, share] of Object.entries(solved.fed)) {
    if (share >= 0.999 || !graph.into[index].length) continue;
    if (!worst || share < worst[1]) worst = [Number(index), share];
  }
  return worst;
}

/** What was handed in and neither came out nor was turned into something else. */
function surplusOf(graph, solved, feeds) {
  const putIn = {};
  for (const rates of Object.values(feeds)) {
    for (const [item, rate] of Object.entries(rates)) addTo(putIn, item, rate);
  }
  const eaten = {};
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role !== "crafter") continue;
    const share = solved.fed[index] || 0;
    for (const item of Object.keys(node.block.input || {})) {
      addTo(eaten, item, consumes(node.block, item) * share);
    }
  }
  const out = {};
  for (const [item, rate] of Object.entries(putIn)) {
    const left = rate - (solved.delivered[item] || 0) - (eaten[item] || 0);
    if (left > SETTLED) out[item] = left;
  }
  return out;
}

/**
 * The whole answer, from the string a player copied.
 *
 * `supply` is what arrives from outside, per item per second, and it is asked for rather
 * than guessed. A schematic torn out of a base is a middle: a press with no drill in the
 * picture makes nothing at all, and calling that a broken design would be wrong.
 */
/**
 * Flag the socket to actually use, so the picture can say which one rather than ringing
 * fourteen tiles in the same colour and leaving the reader to guess.
 */
function markMain(found, marked) {
  // A player's choice wins over the guess, and silences it: showing thirteen suggestions
  // beside the one they picked is arguing with them.
  if (marked) {
    return {
      ...found,
      inputs: found.inputs
        .filter((port) => marked[`${port.x},${port.y}`] === "in")
        .map((port) => ({ ...port, main: true })),
    };
  }
  const best = new Set(
    [...mainPorts(found.inputs).values()].map(({ port }) => port.index));
  return {
    ...found,
    inputs: found.inputs.map((port) => ({ ...port, main: best.has(port.index) })),
  };
}

/**
 * Feed exactly the tiles the player marked as inputs.
 *
 * Each gets what the machines behind it are waiting for, and when several are marked for
 * the same resource the demand is shared: two water pipes marked means two water pipes,
 * not two schematics.
 */
function feedMarked(graph, marked, outside, liquid) {
  const wanted = [];
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (marked[`${node.x},${node.y}`] !== "in") continue;
    wanted.push(index);
  }
  if (!wanted.length) return {};

  const feeds = {};
  for (const [resource, rate] of Object.entries(outside)) {
    if (resource.startsWith("*")) continue;
    const carries = liquid(resource) ? "liquid" : "item";
    const able = wanted.filter((i) => (graph.nodes[i].block.carries || "item") === carries);
    if (!able.length) continue;
    for (const index of able) {
      feeds[index] = { ...(feeds[index] || {}), [resource]: rate / able.length };
    }
  }
  return feeds;
}

/**
 * Analyse a schematic.
 *
 * `chosen` is what the player marked by hand: `{ "4,15": "in", "9,3": "out" }`. Guessing
 * where a schematic plugs in is genuinely hard, and the guess is a default rather than an
 * answer: a design has one intake and eleven pipes that could physically take one, and
 * nothing in the file says which the author meant. So the tool proposes and the player
 * decides, and what they decide is kept with the schematic.
 */
export async function analyse(text, supply = {}, chosen = null) {
  await loadCatalogue();
  noteLiquids();
  const parsed = await fromBase64(text);
  const graph = buildGraph(parsed.tiles);

  // Plugged in by itself when nobody said otherwise.
  //
  // A belt that starts from nowhere is where something arrives, and the machines behind it
  // say what. Asking the player instead was asking them to state what the schematic
  // already says, and it meant a layout nobody had described analysed to nothing at all.
  const outside = demand(graph).outside;
  const marked = chosen && Object.keys(chosen).length ? chosen : null;
  const socketed = marked
    ? feedMarked(graph, marked, outside, isLiquid)
    : feedPorts(graph, isLiquid, outside);

  // A stated supply overrides it, for "what does this do on half the water I have".
  // Split across the entry points rather than repeated at each: handed to all of them, a
  // schematic with fifteen edge conduits was fed fifteen hundred and duly reported
  // fifteen thousand water a minute coming back out.
  const feeds = Object.keys(supply).length ? {} : socketed;
  for (const [resource, rate] of Object.entries(supply)) {
    const where = entrances(graph, resource);
    if (!where.length) continue;
    const each = rate / where.length;
    for (const index of where) {
      feeds[index] = { ...(feeds[index] || {}), [resource]: each };
    }
  }

  const solved = solve(graph, feeds);

  // A block on the power grid is not a block somebody forgot to connect. Batteries and
  // nodes carry nothing on the item or liquid network by design, and calling twenty-one
  // batteries "connected to nothing" buries the two bridges that really were.
  const idle = {};
  for (const index of orphans(graph)) {
    const node = graph.nodes[index];
    if (node.role === "power" || node.role === "generator") continue;
    idle[node.name] = (idle[node.name] || 0) + 1;
  }

  const unknown = {};
  const cost = {};
  for (const node of graph.nodes) {
    if (node.role === "unknown") unknown[node.name] = (unknown[node.name] || 0) + 1;
    for (const [item, amount] of Object.entries(node.block.cost || {})) {
      cost[item] = (cost[item] || 0) + amount;
    }
  }

  const culprit = bottleneckOf(graph, solved);
  const power = powerBudget(graph, solved);

  // What leaves, and separately what is made and eaten inside. A schematic that turns
  // water into power makes coal on the way and none of it comes out, so reporting the coal
  // as its output describes a factory that does not exist. Told apart rather than dropped:
  // knowing the chain runs through coal is worth saying, it is just not the answer to
  // "what does this produce".
  const produced = {};
  const internal = {};
  for (const [item, rate] of Object.entries(solved.delivered)) {
    // What was handed in and came back out is not production. A layout fed water and
    // returning water made nothing; saying it produced fifteen thousand water a minute
    // would bury the one number that mattered, which was the power.
    const given = Object.values(feeds)
      .reduce((sum, rates) => sum + (rates[item] || 0), 0);
    const net = rate - given;
    if (net > SETTLED) produced[item] = net;
  }
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role !== "crafter" && node.role !== "generator") continue;
    const running = solved.fed[index] || 0;
    for (const [item, count] of Object.entries(node.block.output || {})) {
      const made = count * craftsPerSecond(node.block) * running;
      if (made > SETTLED && !produced[item]) internal[item] = (internal[item] || 0) + made;
    }
    for (const [liquid, rate] of Object.entries(node.block.output_liquid || {})) {
      const made = rate * running;
      if (made > SETTLED && !produced[liquid]) {
        internal[liquid] = (internal[liquid] || 0) + made;
      }
    }
  }

  // Below a tenth of an item a minute, a rate rounds to zero on screen and reads as a
  // product the layout does not make. It is a rounding crumb at a dead end, not an output.
  const perMinute = {};
  for (const [item, rate] of Object.entries(produced)) {
    if (rate * 60 >= 0.1) perMinute[item] = rate * 60;
  }

  return {
    name: parsed.tags.name || "sans nom",
    width: parsed.width,
    height: parsed.height,
    blocks: parsed.tiles.length,
    gameVersion: catalogue.game_version,
    produced,
    perMinute,
    bottleneck: culprit ? [graph.nodes[culprit[0]].name, culprit[1]] : null,
    idle,
    surplus: surplusOf(graph, solved, feeds),
    unknown,
    cost,
    internal,
    power,
    // What has to arrive for the layout to run flat out, said in pumps and drills rather
    // than in rates. Computed rather than asked for: nobody knows offhand that a layout
    // drinks eighteen water a second, and everybody can picture two mechanical pumps.
    needs: requirements(graph, catalogue),
    // Where to plug it in, named by tile. Not "it needs water" but "the pipe at 0,7 wants
    // water", which is the difference between a fact and an instruction.
    ports: markMain(ports(graph, isLiquid, outside), marked),
    marked: marked || {},
    fedItself: !Object.keys(supply).length,
    // What it would make if it were fed all of that, which is the number a player is
    // really shopping for.
    potential: powerBudget(graph, { fed: {} }),
    settled: solved.settled,
    // What the reading had to work around, so the page can say it rather than quietly
    // reporting on a partial base as though it were the whole one.
    altered: parsed.altered,
    truncated: parsed.truncated,
    // Everything the solver worked out, per block, so a click on one can say what it is
    // doing rather than only what it is.
    detail: graph.nodes.map((node, index) => ({
      x: node.x, y: node.y, name: node.name, role: node.role,
      size: node.block.size || 1, rotation: node.rotation,
      fed: solved.fed[index],
      through: solved.through[index],
      feeds: graph.out[index].length,
      fedBy: graph.into[index].length,
      needs: node.block.input || {},
      needsLiquid: node.block.input_liquid || {},
      makes: node.block.output || {},
      makesLiquid: node.block.output_liquid || {},
      power: node.block.power || 0,
      powerOut: node.block.power_out || 0,
      cost: node.block.cost || {},
    })),
    graph,
    // The nodes rather than the raw tiles: they carry the size, the role and the checked
    // bridge link, so the picture and the analysis cannot disagree about what is connected.
    tiles: graph.nodes,
  };
}
