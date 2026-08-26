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
import { requirements } from "./needs.js";

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
export function solve(graph, supply = {}) {
  const through = graph.nodes.map(() => ({}));
  const fed = {};
  let settled = false;
  let rounds = 0;

  for (rounds = 1; rounds <= ROUNDS; rounds++) {
    const arriving = graph.nodes.map(() => ({}));

    for (const [index, rates] of Object.entries(supply)) {
      for (const [item, amount] of Object.entries(rates)) {
        addTo(arriving[index], item, amount);
      }
    }

    for (let index = 0; index < graph.nodes.length; index++) {
      const outgoing = graph.out[index];
      if (!outgoing.length) continue;
      // Split evenly. A router hands round-robin between its ways out and a drill offloads
      // the same way, which is what the game does when nothing downstream is backed up.
      const share = 1 / outgoing.length;
      for (const target of outgoing) {
        for (const [item, amount] of Object.entries(through[index])) {
          addTo(arriving[target], item, amount * share);
        }
      }
    }

    let changed = false;
    for (let index = 0; index < graph.nodes.length; index++) {
      if (advance(graph.nodes[index], index, arriving[index], through, fed)) changed = true;
    }
    if (!changed) { settled = true; break; }
  }

  return { through, fed, settled, rounds, delivered: delivered(graph, through) };
}

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
 * What a block will actually take of what was handed to it.
 *
 * A conveyor will not carry water and a conduit will not carry coal. Letting them read as
 * carrying anything made a belt deliver oil, which looks like a working factory and is
 * not one.
 */
function filtered(node, arriving) {
  const carries = node.block.carries;
  if (!carries) return arriving;
  const kept = {};
  for (const [name, rate] of Object.entries(arriving)) {
    if ((carries === "liquid") === isLiquid(name)) kept[name] = rate;
  }
  return kept;
}

function advance(node, index, arriving, through, fed) {
  const before = through[index];
  let now;
  arriving = filtered(node, arriving);

  if (node.role === "crafter" || node.role === "generator") {
    // A recipe runs at the pace of its scarcest ingredient, never faster than its own
    // craft time. Fed twice the coal it can use, a press still makes one graphite every
    // ninety ticks, and the extra coal backs up rather than becoming graphite.
    //
    // Liquids count exactly as items do here, and leaving them out was the bug that
    // mattered: a cultivator declared no inputs at all, so it made spore pods out of
    // nothing, and a schematic that turns water into power was reported as making coal.
    const wants = appetite(node.block);
    let share = 1;
    for (const [name, wanted] of Object.entries(wants)) {
      if (wanted <= 0) continue;
      share = Math.min(share, (arriving[name] || 0) / wanted);
    }

    // A generator that burns whatever flammable thing it is handed declares no input at
    // all, because the game filters by flammability rather than by name. It eats one item
    // every `craft_time` ticks, of whatever arrived.
    if (node.role === "generator" && !Object.keys(wants).length && node.block.craft_time) {
      const burn = TICKS / node.block.craft_time;
      const offered = Object.entries(arriving)
        .filter(([name]) => !isLiquid(name))
        .reduce((sum, [, rate]) => sum + rate, 0);
      share = Math.min(share, burn > 0 ? offered / burn : 1);
    }

    share = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
    fed[index] = share;
    now = {};
    for (const item of Object.keys(node.block.output || {})) {
      now[item] = produces(node.block, item) * share;
    }
    for (const [liquid, rate] of Object.entries(node.block.output_liquid || {})) {
      now[liquid] = rate * share;
    }
  } else if (node.role === "sink" || node.role === "power") {
    now = {};
  } else {
    // A belt is the commonest bottleneck in the game and the one players most often miss.
    // A conduit has no stated rate in the registry, so it is left unconstrained rather
    // than treated as zero: an invented limit is worse than an absent one.
    const cap = (node.role === "conveyor" || node.role === "junction"
                 || node.role === "bridge")
      ? (node.block.items_per_second || Infinity) : Infinity;
    const total = totalOf(arriving);
    now = {};
    const factor = total > cap && total > 0 ? cap / total : 1;
    for (const [item, amount] of Object.entries(arriving)) now[item] = amount * factor;
  }

  through[index] = now;
  const keys = new Set([...Object.keys(before), ...Object.keys(now)]);
  for (const key of keys) {
    if (Math.abs((now[key] || 0) - (before[key] || 0)) > SETTLED) return true;
  }
  return false;
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
function delivered(graph, through) {
  const total = {};
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role !== "sink" && graph.out[index].length) continue;
    const source = node.role === "sink" ? arrivingAt(graph, through, index) : through[index];
    for (const [item, amount] of Object.entries(source)) addTo(total, item, amount);
  }
  return total;
}

function arrivingAt(graph, through, index) {
  const total = {};
  for (const upstream of graph.into[index]) {
    const share = 1 / Math.max(1, graph.out[upstream].length);
    for (const [item, amount] of Object.entries(through[upstream])) {
      addTo(total, item, amount * share);
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
export async function analyse(text, supply = {}) {
  await loadCatalogue();
  noteLiquids();
  const parsed = await fromBase64(text);
  const graph = buildGraph(parsed.tiles);

  // Each resource enters on its own network, since water and coal do not share a pipe.
  //
  // Split across the entry points rather than repeated at each. "water=100" means a
  // hundred a second arrives, not a hundred a second per pipe: handed to all of them, a
  // schematic with fifteen edge conduits was fed fifteen hundred and duly reported
  // fifteen thousand water a minute coming back out.
  const feeds = {};
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
    const net = rate - (supply[item] || 0);
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
    // What it would make if it were fed all of that, which is the number a player is
    // really shopping for.
    potential: powerBudget(graph, { fed: {} }),
    settled: solved.settled,
    // What the reading had to work around, so the page can say it rather than quietly
    // reporting on a partial base as though it were the whole one.
    altered: parsed.altered,
    truncated: parsed.truncated,
    graph,
    // The nodes rather than the raw tiles: they carry the size, the role and the checked
    // bridge link, so the picture and the analysis cannot disagree about what is connected.
    tiles: graph.nodes,
  };
}
