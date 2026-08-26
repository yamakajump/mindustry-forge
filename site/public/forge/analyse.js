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
  if (node.role === "unknown") return false;
  if (node.role === "conveyor") {
    const [dx, dy] = DIRECTIONS[node.rotation % 4];
    return !(fromTile[0] === node.x + dx && fromTile[1] === node.y + dy);
  }
  if (node.role === "junction" || node.role === "router") return true;
  // A drill makes its own ore and takes nothing. Feeding one is a wasted belt.
  if (node.role === "drill") return false;
  return node.role === "crafter" || node.role === "sink" ||
    Object.keys(node.block.input || {}).length > 0;
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

function advance(node, index, arriving, through, fed) {
  const before = through[index];
  let now;

  if (node.role === "crafter") {
    // A recipe runs at the pace of its scarcest ingredient, never faster than its own
    // craft time. Fed twice the coal it can use, a press still makes one graphite every
    // ninety ticks, and the extra coal backs up rather than becoming graphite.
    let share = 1;
    for (const item of Object.keys(node.block.input || {})) {
      const wanted = consumes(node.block, item);
      if (wanted <= 0) continue;
      share = Math.min(share, (arriving[item] || 0) / wanted);
    }
    share = Math.max(0, Math.min(1, share));
    fed[index] = share;
    now = {};
    for (const item of Object.keys(node.block.output || {})) {
      now[item] = produces(node.block, item) * share;
    }
  } else if (node.role === "sink") {
    now = {};
  } else {
    // A belt is the commonest bottleneck in the game and the one players most often miss.
    const cap = (node.role === "conveyor" || node.role === "junction")
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
function entrances(graph) {
  const out = [];
  for (let index = 0; index < graph.nodes.length; index++) {
    if (!graph.into[index].length && graph.out[index].length &&
        graph.nodes[index].role !== "drill") out.push(index);
  }
  return out;
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
  const parsed = await fromBase64(text);
  const graph = buildGraph(parsed.tiles);

  const feeds = {};
  if (Object.keys(supply).length) {
    for (const index of entrances(graph)) feeds[index] = { ...supply };
  }

  const solved = solve(graph, feeds);

  const idle = {};
  for (const index of orphans(graph)) {
    const name = graph.nodes[index].name;
    idle[name] = (idle[name] || 0) + 1;
  }

  const unknown = {};
  const cost = {};
  let power = 0;
  for (const node of graph.nodes) {
    if (node.role === "unknown") unknown[node.name] = (unknown[node.name] || 0) + 1;
    for (const [item, amount] of Object.entries(node.block.cost || {})) {
      cost[item] = (cost[item] || 0) + amount;
    }
    power += node.block.power || 0;
  }

  const culprit = bottleneckOf(graph, solved);
  const produced = {};
  for (const [item, rate] of Object.entries(solved.delivered)) {
    if (rate > SETTLED) produced[item] = rate;
  }
  const perMinute = {};
  for (const [item, rate] of Object.entries(produced)) perMinute[item] = rate * 60;

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
    power,
    settled: solved.settled,
    graph,
    tiles: parsed.tiles,
  };
}
