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
import { demand, fuels, requirements } from "./needs.js";
import { candidates, feedFrom, markable, marksOf, readMarks } from "./marks.js";
import { attributeOf, beamOf, dryTilesOf, wallSumOf, yieldOf } from "./ground.js";
import { centre, footprint } from "./geometry.js";
import { logicOf, readProgram } from "./logic.js";
import { throughput } from "./maxflow.js";
import { World } from "./engine/core.js";
import { behaviourOf } from "./engine/carriers.js";
import { gridsOf } from "./engine/power.js";

/** Mindustry counts rotations anticlockwise from east. */
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Ticks in a second. The game states craft times and drill times in ticks. */
const TICKS = 60;

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

/** The block registry, for the parts of the page that place blocks rather than read them. */
export function catalogueOf() {
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

/** The tiles this block tries to hand items to. */
function outputsOf(node) {
  // A conduit points somewhere, exactly like a belt: `ConduitBuild.updateTile` calls
  // `moveLiquidForward`, which is `tile.nearby(rotation)` and nothing else. Treated as
  // handing to all four sides, a line of pipes fed itself in both directions, and the last
  // pipe of a run was never the end of anything: it pointed back at its neighbour, so the
  // solver could find no exit at all and the whole line carried nothing.
  if (node.role === "conveyor" || node.role === "conduit"
      || node.role === "stack-conveyor") {
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
  // A container hands nothing to anybody. It holds, and an unloader beside it pulls: the
  // edge goes from the container to the unloader and is added once the graph is laid out,
  // because it is the unloader that decides it exists.
  if (node.role === "power" || node.role === "sink" || node.role === "turret"
      || node.role === "store") return [];
  if ((node.role === "crafter" || node.role === "generator")
      && !Object.keys(node.block.output || {}).length
      && !Object.keys(node.block.output_liquid || {}).length) {
    return [];
  }

  /* A mass driver hands on **both** ways and this had it as one or the other. Down the
     barrel when it is set to something, and out of every side it touches whenever it is
     idle or receiving, which is `dumpAccumulate` at `MassDriver.java:164`. Written as "the
     barrel and nowhere else", a relay with a vault against its middle driver read as
     delivering nothing there where the game puts a hundred and eight items in it; and the
     four neighbours of a three wide block centre tile are inside its own footprint, so an
     unlinked driver had no way out at all.

     Falls through to the ring below, with the link added in front of it. */
  const barrel = node.role === "mass-driver" && node.link ? [node.link] : [];

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
  return [...barrel, ...around];
}

/**
 * Whether this block takes an item handed in from that tile.
 *
 * The rule that matters and is easy to get backwards: a conveyor refuses anything pushed
 * against its own direction of travel. Belt facing right, something to its right pushing
 * left, and nothing moves. Built without this, a graph reports a working loop between two
 * belts pointing at each other.
 */
function accepts(node, fromTile, from = null) {
  if (node.role === "unknown" || node.role === "power") return false;
  // A belt and a pipe both refuse what is pushed against their own direction of travel.
  // `Conduit.acceptLiquid` ends in a check that the source is not the tile it points at,
  // which is the same rule as a conveyor's.
  if (node.role === "conveyor" || node.role === "conduit"
      || node.role === "stack-conveyor") {
    const [dx, dy] = DIRECTIONS[node.rotation % 4];
    return !(fromTile[0] === node.x + dx && fromTile[1] === node.y + dy);
  }
  if (node.role === "junction" || node.role === "router"
      || node.role === "bridge" || node.role === "sorter") {
    return true;
  }
  /* `acceptItem` is `items.total() < itemCapacity && linkValid()`: a mass driver set to
     nothing takes nothing at all, which is what jams the belt feeding a half built line.
     With no branch here it fell through to the last line, which asks for a recipe it does
     not have, so no driver accepted anything and a linked pair carried zero.

     A salvo is the exception, and it has to be: it lands through `handlePayload` and never
     asks. The far end of a pair is exactly the driver that has no link of its own. */
  if (node.role === "mass-driver") {
    if (from?.role === "mass-driver"
        && from.link?.[0] === node.x && from.link?.[1] === node.y) {
      return true;
    }
    return Boolean(node.link);
  }
  // A drill makes its own ore and takes nothing. Feeding one is a wasted belt.
  if (node.role === "drill") return false;
  // A store takes anything and an unloader takes nothing: it pulls, it is not pushed to.
  if (node.role === "store") return true;
  if (node.role === "unloader" || node.role === "source") return false;
  if (node.role === "turret") return true;
  // A machine takes what its recipe calls for and nothing else. Accepting anything gave a
  // cultivator an edge into another cultivator, because both are crafters: neither eats
  // spore pods, and the graph said one fed the other.
  if (node.role === "crafter") {
    return Object.keys(node.block.input || {}).length > 0
      || Object.keys(node.block.input_liquid || {}).length > 0;
  }
  return node.role === "sink" || node.role === "generator" ||
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
  // The catalogue now carries the game's own liquid registry. The fallback below is what
  // it did before, and it was right until a schematic configured a source with a liquid
  // that no block in it consumes: nothing in any recipe, so nothing recognised it.
  for (const name of Object.keys(catalogue.liquids || {})) LIQUIDS.add(name);
  if (LIQUIDS.size) return;
  for (const block of Object.values(catalogue.blocks)) {
    for (const name of Object.keys(block.input_liquid || {})) LIQUIDS.add(name);
    for (const name of Object.keys(block.output_liquid || {})) LIQUIDS.add(name);
  }
}
const isLiquid = (name) => LIQUIDS.has(name);

/**
 * The colour the game paints a configured block with.
 *
 * A sorter, a source and an unloader are drawn as a coloured square with the block's frame
 * over it, and that colour is the only thing telling twelve identical sources apart.
 */
function tintOf(resource) {
  if (!resource) return null;
  const found = catalogue.items?.[resource] || catalogue.liquids?.[resource];
  return found?.color || null;
}

/**
 * Mindustry's own content numbering, which is never rearranged.
 *
 * Items and liquids were enough while the only configured blocks were sorters and sources.
 * A payload source is configured with a **unit** or a **block**, and read as neither it
 * came back as unset: the source made nothing and the whole line downstream measured empty.
 */
const CONTENT_ITEM = 0;
const CONTENT_BLOCK = 1;
const CONTENT_LIQUID = 4;
const CONTENT_UNIT = 6;

/**
 * What a block was configured to handle: the item a sorter passes, the liquid a source
 * pours. Stored as a content type and a number, which only means something against the
 * game's registry.
 */
function configuredContent(config) {
  if (!config || config.type !== 5) return null;
  const registry = config.content === CONTENT_LIQUID ? catalogue.liquids
    : config.content === CONTENT_ITEM ? catalogue.items
    : config.content === CONTENT_UNIT ? catalogue.units
    : config.content === CONTENT_BLOCK ? catalogue.blocks : null;
  if (!registry) return null;
  for (const [name, entry] of Object.entries(registry)) {
    if (entry.id === config.id) return name;
  }
  return null;
}

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

  /* A mass driver keeps the same kind of relative point and obeys neither of the two
     rules: it shoots across open ground in any direction at all, and its reach is a
     radius rather than a count of tiles. */
  if (block.role === "mass-driver") {
    /* `within` is `dst2 < dst * dst`, strictly. The game lets a player set the link at
       exactly the range and saves it, then refuses it for ever: at fifty-five tiles the
       driver never fires and, having no valid link, stops accepting from the belt as well.
       Read as inclusive, the port carried a full thirty-six a second down a barrel that
       does not work. */
    return dx * dx + dy * dy < (block.range || 0) ** 2 ? [tile.x + dx, tile.y + dy] : null;
  }

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
      configured: configuredContent(tile.config),
      tint: tintOf(configuredContent(tile.config)),
      link: bridgeLink(tile, block),
      footprint: footprint(tile.x, tile.y, block.size || 1),
    };
    const index = nodes.length;
    nodes.push(node);
    for (const [fx, fy] of node.footprint) at.set(`${fx},${fy}`, index);
  }

  speedUp(nodes);

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
      if (!accepts(nodes[target], leaving, node)) continue;
      const key = `${index}>${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([index, target]);
    }
  }

  // An unloader is the one block that pulls instead of being pushed to, so its ways in
  // are not among the edges above: nothing points at it. It draws from every container it
  // touches, which is what makes a vault a buffer in the middle of a line rather than the
  // end of one.
  //
  // Before this, a container swallowed whatever reached it and an unloader beside one was
  // handed an invented supply out of nowhere, of whatever resource was being solved for.
  // The two halves of the same belt had nothing to do with each other.
  for (let index = 0; index < nodes.length; index++) {
    if (nodes[index].role !== "unloader") continue;
    const touching = new Set();
    for (const [cx, cy] of nodes[index].footprint) {
      for (const [dx, dy] of DIRECTIONS) {
        const found = at.get(`${cx + dx},${cy + dy}`);
        if (found !== undefined && nodes[found].role === "store") touching.add(found);
      }
    }
    for (const store of touching) {
      edges.push([store, index]);
      // The container is no longer where the line ends: what arrives keeps going.
      nodes[store].drained = true;
    }
  }

  const out = nodes.map(() => []);
  const into = nodes.map(() => []);
  for (const [a, b] of edges) { out[a].push(b); into[b].push(a); }

  return { nodes, edges, out, into };
}

/**
 * How much faster each block runs, because of the projectors standing over it.
 *
 * The game's own schematic panel ignores this entirely, and on a reactor farm that is not
 * a rounding error: forty-one thorium reactors under five overdrive projectors read as
 * 36,900 energy a second in game and make 55,350. The author of one such layout wrote
 * "53-55k max power generated" in its description, which is the boosted figure, and the
 * game contradicted them in their own preview.
 *
 * Rule taken from `OverdriveProjector.updateTile` and `BlockIndexer.eachBlock`: every
 * building whose centre is within the projector's range plus its own half-width is sped
 * up, walls and power blocks excepted, and two projectors do not stack - the strongest
 * wins, because `applyBoost` keeps the larger of the two.
 *
 * The phase fabric bonus is deliberately left out of the number. Whether a projector is
 * being fed phase depends on the solve, which depends on the speeds, which depends on the
 * boost; rather than iterate a circle for a bonus a player switches on knowingly, the
 * plain boost is reported and the extra is named alongside it.
 */
function speedUp(nodes) {
  for (const node of nodes) node.boost = 1;

  for (const projector of nodes) {
    if (projector.role !== "projector") continue;
    const reach = projector.block.range || 0;
    const strength = projector.block.boost || 1;
    const [px, py] = centre(projector);

    for (const node of nodes) {
      if (node === projector) continue;
      // A wall, a battery, a conduit: the game marks them itself, and reading the flag
      // beats keeping a list here that the next balance patch makes wrong.
      if (node.block.no_overdrive || node.block.privileged) continue;
      const [x, y] = centre(node);
      const half = (node.block.size || 1) / 2;
      /* Strictly inside, never on the line. `BlockIndexer.eachBlock` calls
         `build.within(x, y, range + build.hitSize() / 2f)`, and `Mathf.within` is `fcmpg`
         then `ifge`: true only when `dst2 < dst * dst`. A block whose centre falls exactly
         on the circle is left alone by the game, and was sped up here.

         Read in the v159.7 bytecode, alongside `hitSize()`, which returns `block.size * 8`
         for every building in the game - so the half width in tiles is `size / 2` and this
         line needs no separate figure from the catalogue. */
      if (Math.hypot(x - px, y - py) < reach + half) {
        node.boost = Math.max(node.boost, strength);
      }
    }
  }
}

const addTo = (rates, item, amount) => {
  rates[item] = (rates[item] || 0) + amount;
};

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
 * Which power grid each node sits on, borrowed from the engine rather than found again.
 *
 * `engine/power.js` already ports `PowerGraph`: grids found rather than declared, nodes and
 * their saved links, beam nodes, and the autolinking a node does when it is placed without
 * links of its own. Every one of those was a bug once. Writing a second finder here would
 * be a second thing to have wrong, and the wrong half would be the one the player reads.
 *
 * The world is built and wired but never stepped: `gridsOf` needs the proximity ring and
 * the links, which the constructor lays out, and nothing else.
 */
function powerGrids(graph) {
  const world = new World(graph, behaviourOf).wire(gridsOf);
  const indexOf = new Map(graph.nodes.map((node, index) => [node, index]));
  return world.grids.map((grid) => grid.builds
    .map((build) => indexOf.get(build.node))
    .filter((index) => index !== undefined));
}

/**
 * What fraction of the current each consumer on a grid actually gets.
 *
 * `PowerGraph.getPowerNeeded` sums `ConsumePower.requestedPower`, which is the flat
 * `usage`, over the buildings whose `shouldConsumePower` is true - and that flag is false
 * only when a **non-power** consumer is unsatisfied. So the game asks how much a machine
 * *wants*, never how much it is currently getting.
 *
 * That distinction is the whole of this function, and getting it wrong does not merely give
 * a wrong number, it never settles. Demand measured on the throttled rate falls as coverage
 * falls, which raises coverage, which raises demand: the solve oscillates between flat out
 * and starved for ever. Measured on the rate the items alone allow, demand is a fixed
 * quantity within a round and the coverage that comes out of it is stable.
 *
 * A machine stopped for want of items draws nothing, which is `shouldConsumePower` being
 * false; in a rate model, running a third of the time means drawing a third of the current
 * on average, so the item share is the right weight rather than a flag.
 */
function coverageOf(graph, grids, itemShare) {
  const coverage = graph.nodes.map(() => 1);
  const running = (index) => (itemShare[index] === undefined ? 1 : itemShare[index])
    * (graph.nodes[index].boost || 1);

  for (const members of grids) {
    let made = 0;
    let wanted = 0;
    for (const index of members) {
      const block = graph.nodes[index].block;
      made += (block.power_out || 0) * running(index);
      wanted += (block.power || 0) * running(index);
    }
    if (wanted <= SETTLED) continue;
    const share = Math.min(1, made / wanted);
    for (const index of members) {
      if ((graph.nodes[index].block.power || 0) > 0) coverage[index] = share;
    }
  }
  return coverage;
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
  piecesOf = pieces(graph);
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
    // A sandbox source pours whatever it was set to, and what it was set to is in the
    // schematic. Left out, a test layout built on twelve liquid sources read as a factory
    // fed nothing, because nothing in it produced water and no water was declared.
    if (node.role === "source" && node.configured) resources.add(node.configured);
    if (node.dug) resources.add(node.dug.resource);
  }

  // Machines make things that other machines eat, so the chain is walked in order: what a
  // press produces becomes a source for whatever the press feeds. Bounded by the number of
  // stages a real recipe tree has, and stopped when a round adds nothing.
  const made = graph.nodes.map(() => ({}));
  // What passes through a block without stopping there, which is the whole of what a
  // carrier does and was missing from the report entirely.
  const carrying = graph.nodes.map(() => ({}));
  const fed = {};

  /* The grids, found once: they come from the shape of the schematic and nothing the solve
     does can move a wire. The coverage does change from round to round, and it starts at
     one so that the first round asks what the layout would do with all the current it
     wants - which is the question the second round then answers. */
  const grids = powerGrids(graph);
  let coverage = graph.nodes.map(() => 1);
  let wanted = {};

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
      for (let index = 0; index < nodes; index++) {
        const node = graph.nodes[index];
        if (node.role === "source" && node.configured === resource) {
          sources[index] = (sources[index] || 0) + sourceRate(graph, index, resource);
        }
        if (node.dug?.resource === resource) {
          // A laser drill on a dim grid turns slower, and what it pulls up is the one
          // thing about it the rest of the layout can see.
          sources[index] = (sources[index] || 0)
            + node.dug.rate * (node.boost || 1) * coverage[index];
        }
      }
      if (!Object.keys(sources).length) continue;

      const out = throughput(graph, {
        supply: sources,
        capacity: (index) => capacityFor(graph.nodes[index], resource, liquid),
        wants: (index) => appetiteFor(graph.nodes[index], resource,
                                      !graph.out[index].length),
      });

      shareOut(graph, resource, out.received);

      for (let index = 0; index < nodes; index++) {
        const before = arriving[index][resource] || 0;
        if (Math.abs(out.received[index] - before) > SETTLED) moved = true;
        arriving[index][resource] = out.received[index];
        if (out.carried[index] > SETTLED) carrying[index][resource] = out.carried[index];
      }
    }

    /* What the items alone allow, before the grid has its say. Kept apart from what the
       machine ends up running at, because the grid is asked how much the layout *wants*,
       and what it wants is what its items would let it do. */
    const itemShare = {};
    for (let index = 0; index < nodes; index++) {
      const node = graph.nodes[index];
      if (node.role !== "crafter" && node.role !== "generator") continue;
      // A machine under a projector wants more per second and makes more per second, in
      // the same proportion, so the share it runs at is the honest one either way.
      const speed = node.boost || 1;
      const wants = appetite(node.block);
      let share = 1;
      for (const [name, wanted] of Object.entries(wants)) {
        if (wanted <= 0) continue;
        share = Math.min(share, (arriving[index][name] || 0) / (wanted * speed));
      }
      if (node.role === "generator" && !Object.keys(wants).length && node.block.craft_time) {
        const burn = TICKS / node.block.craft_time * speed;
        const offered = Object.entries(arriving[index])
          .filter(([name]) => !isLiquid(name))
          .reduce((sum, [, rate]) => sum + rate, 0);
        share = Math.min(share, burn > 0 ? offered / burn : 1);
      }
      itemShare[index] = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
    }

    /* And then the grid, on the demand those shares imply. A machine's realised rate is the
       two multiplied and not the smaller of the two: in the game the items decide whether a
       frame happens at all and the current decides how far that frame gets, so a machine
       with half its coal on a grid at half strength runs at a quarter. */
    coverage = coverageOf(graph, grids, itemShare);

    for (let index = 0; index < nodes; index++) {
      const node = graph.nodes[index];
      if (node.role !== "crafter" && node.role !== "generator") continue;
      const speed = node.boost || 1;
      const share = itemShare[index] * coverage[index];
      fed[index] = share;

      const now = {};
      for (const item of Object.keys(node.block.output || {})) {
        now[item] = produces(node.block, item) * share * speed;
      }
      for (const [liquid, rate] of Object.entries(node.block.output_liquid || {})) {
        now[liquid] = rate * share * speed;
      }
      for (const name of new Set([...Object.keys(now), ...Object.keys(made[index])])) {
        if (Math.abs((now[name] || 0) - (made[index][name] || 0)) > SETTLED) moved = true;
      }
      made[index] = now;
    }

    wanted = itemShare;
    if (!moved) {
      return { arriving, carrying, made, fed, wanted, coverage,
               settled: true, rounds: round + 1 };
    }
  }
  return { arriving, carrying, made, fed, wanted, coverage, settled: false, rounds: 12 };
}

/**
 * Which blocks can reach which, ignoring direction. Two machines in the same piece of the
 * graph draw on the same supply; two machines in different pieces never do.
 */
function pieces(graph) {
  const owner = graph.nodes.map((_, index) => index);
  const find = (index) => {
    while (owner[index] !== index) index = owner[index] = owner[owner[index]];
    return index;
  };
  for (const [a, b] of graph.edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) owner[ra] = rb;
  }
  return graph.nodes.map((_, index) => find(index));
}

let piecesOf = null;

/**
 * Spread what arrived over the machines that were waiting for it.
 *
 * A maximum flow answers "how much can get through" and has no opinion on who gets it: it
 * is free to fill some machines and abandon others, and on a reactor farm it did exactly
 * that, reporting seven of forty-one thorium reactors as fed nothing while the other
 * thirty-four ran flat out. The total was right and the picture was a lie, and the page
 * built on it named a perfectly ordinary reactor as the layout's bottleneck.
 *
 * The game hands material out round by round, so twenty machines behind one belt all run
 * at a fraction rather than fifteen running and five starving. Reproduced here by pooling
 * what reached machines of the same kind in the same piece of the graph and dividing it
 * the way they asked for it. Same total, and a share per machine that matches what a
 * player watching the base would see.
 *
 * Machines nothing feeds are left out of the pool: a reactor wired to no pipe at all is a
 * fault worth seeing, not a number to average away.
 */
function shareOut(graph, resource, received) {
  const groups = new Map();

  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role !== "crafter" && node.role !== "generator"
        && node.role !== "sink" && node.role !== "turret") continue;
    if (!graph.into[index].length) continue;
    const wants = appetiteFor(node, resource, false);
    if (!(wants > 0) || !Number.isFinite(wants)) continue;

    const key = `${piecesOf[index]}|${node.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([index, wants]);
  }

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let pool = members.reduce((sum, [index]) => sum + received[index], 0);
    if (pool <= SETTLED) continue;

    // Nobody is handed more than they can use, so what a full machine cannot take goes
    // round again. Two passes settle any real layout; the cap stops a rounding loop.
    let open = members.slice();
    for (let pass = 0; pass < 4 && open.length && pool > SETTLED; pass++) {
      const asked = open.reduce((sum, [, wants]) => sum + wants, 0);
      const share = Math.min(1, pool / asked);
      const next = [];
      for (const member of open) {
        const give = member[1] * share;
        received[member[0]] = give;
        pool -= give;
        if (share >= 1 - 1e-9) continue;
        next.push(member);
      }
      if (share >= 1 - 1e-9) break;
      open = next;
      break;
    }
  }
}

/**
 * What a sandbox source hands over.
 *
 * Its declared rate is a firehose: a liquid source refills itself to ten thousand every
 * tick, which is six hundred thousand a second, and a maximum flow will push all of it
 * into whatever pipe ends in the air. A reactor farm built on twelve of them reported
 * producing five hundred and fifty-seven million cryofluid a minute.
 *
 * A source is a tap the builder put inside the schematic, so it gives the factory what the
 * factory asks for: the appetite of every machine it can reach, and no more. Its own rate
 * stays the ceiling, which is what holds an item source to a hundred a second.
 */
function sourceRate(graph, index, resource) {
  const node = graph.nodes[index];
  const declared = (node.block.output_per_second || 0) * (node.boost || 1);

  let asked = 0;
  let taps = 0;
  for (let other = 0; other < graph.nodes.length; other++) {
    if (piecesOf[other] !== piecesOf[index]) continue;
    const node2 = graph.nodes[other];
    if (node2.role === "source" && node2.configured === resource) taps++;
    const wants = appetiteFor(node2, resource, false);
    if (Number.isFinite(wants)) asked += wants;
  }
  // Shared out between the taps rather than each one promising the whole demand. Capped
  // one by one, twelve sources feeding a reactor farm supplied twelve times what it
  // wanted, and the eleven-twelfths nobody drank ran out of the nearest open pipe and was
  // reported as a hundred thousand cryofluid a minute of production.
  return asked > 0 ? Math.min(declared, asked / Math.max(1, taps)) : declared;
}

/** Everything the sandbox taps inside a schematic pour of one resource, per second. */
function poured(graph, resource) {
  let total = 0;
  for (let index = 0; index < graph.nodes.length; index++) {
    if (graph.nodes[index].role !== "source") continue;
    if (graph.nodes[index].configured !== resource) continue;
    total += sourceRate(graph, index, resource);
  }
  return total;
}

/** What one block can pass per second, for one resource. */
function capacityFor(node, resource, liquid) {
  const speed = node.boost || 1;
  const carries = node.block.carries;
  if (carries && (carries === "liquid") !== liquid) return 0;
  // A drill hands on what it pulled up, and only that.
  if (node.role === "drill" || node.role === "pump") {
    return node.dug?.resource === resource
      ? node.dug.rate * speed * (node.block.size || 1) ** 2 : 0;
  }
  if (node.role === "conveyor" || node.role === "junction" || node.role === "bridge"
      || node.role === "unloader" || node.role === "stack-conveyor") {
    // A liquid junction and a liquid bridge state no item rate, because they carry no
    // items. Their ceiling is the same as a pipe's.
    if (node.block.carries === "liquid") return (node.block.liquid_capacity || 10) * TICKS;
    return (node.block.items_per_second || Infinity) * speed;
  }
  if (node.role === "source") {
    return node.configured === resource ? (node.block.output_per_second || 0) * speed : 0;
  }
  // A pipe is not infinite. `moveLiquid` never hands over more than the receiving block's
  // whole capacity in one tick, so that capacity a second is the ceiling, and it sits far
  // above any pump: it never binds on a real layout, it only stops a sandbox source from
  // flooding the model with numbers no pipe could carry.
  if (node.role === "conduit") {
    return (node.block.liquid_capacity || 10) * TICKS;
  }
  /* A salvo of `itemCapacity` every `reload` frames, which is the figure on the block own
     card: thirty-six a second. Read as infinite, a driver fed by five titanium belts
     passed fifty-five a second. */
  if (node.role === "mass-driver") {
    return (node.block.items_per_second || Infinity) * speed;
  }
  // A container holds and hands back whatever is pulled out of it.
  if (node.role === "store") return Infinity;
  // An unloader moves eleven items a second and no more, whatever the container behind it
  // holds, and only the item it was set to if it was set to one.
  if (node.role === "unloader" && node.configured && node.configured !== resource) return 0;
  // A machine passes nothing on: what leaves it is what it makes, which is a separate
  // source rather than the same flow continuing.
  if (node.role === "crafter" || node.role === "generator" || node.role === "sink"
      || node.role === "turret") {
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
  const speed = node.boost || 1;
  if (isExit && node.block.carries) {
    const carries = node.block.carries;
    if ((carries === "liquid") !== isLiquid(resource)) return 0;
    if (carries === "liquid") return (node.block.liquid_capacity || 10) * TICKS;
    return (node.block.items_per_second || Infinity) * speed;
  }
  // A turret eats what it is loaded with, at the rate it fires. How often it fires is not
  // in a still picture, so this is the rate while firing and the report says so rather
  // than pretending a schematic knows when a wave arrives.
  if (node.role === "turret") {
    const ammo = node.block.ammo || [];
    if (!ammo.includes(resource)) return 0;
    return (node.block.shots_per_second || 0) * (node.block.ammo_per_shot || 1) * speed;
  }
  // A container swallows whatever reaches it, which is what makes a line into a vault a
  // line that delivers rather than one that ends in the air. Unless something unloads from
  // it, in which case it is a buffer in the middle and the items carry on.
  if (node.role === "store") return node.drained ? 0 : Infinity;

  if (node.role === "crafter" || node.role === "generator" || node.role === "sink") {
    const wants = appetite(node.block);
    if (wants[resource] > 0) return wants[resource] * speed;
    if (node.role === "generator" && !Object.keys(wants).length && node.block.craft_time
        && !isLiquid(resource)) {
      return TICKS / node.block.craft_time * speed;
    }
    return 0;
  }
  return 0;
}

export function solve(graph, supply = {}) {
  const solved = solveFlow(graph, supply);

  // What each block passes on, in the shape the rest of this file already reads: a carrier
  // hands on what reached it, a machine hands on what it made.
  const through = graph.nodes.map((node, index) => {
    if (node.role === "crafter" || node.role === "generator") return solved.made[index];
    if (node.role === "sink" || node.role === "power") return {};
    // A carrier passes things on rather than keeping them, so what it holds is what went
    // through it. Read off what stopped there, every belt but the last one of a line
    // reported carrying nothing at all.
    const moving = solved.carrying[index];
    return Object.keys(moving).length ? moving : solved.arriving[index];
  });

  return {
    through,
    fed: solved.fed,
    /* What the items alone would allow, which is what the layout **asks** the grid for.
       Kept apart from `fed` because the two answer different questions and the report needs
       both: `fed` is what actually runs, `wanted` is the demand that decides whether it
       can. A smelter on a grid with no generator runs at nothing and still needs its thirty
       a second, and a report carrying only the first would have quietly deleted the one
       figure that tells the player what to build. */
    wanted: solved.wanted,
    coverage: solved.coverage,
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
    if (node.role === "sink" || node.role === "turret" || node.role === "store") {
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
export function powerBudget(graph, solved, { boosted = true } = {}) {
  let made = 0;
  let spent = 0;
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    /* Production on what actually ran, demand on what the items would have allowed.
       `PowerGraph.getPowerNeeded` asks every building whose non-power consumers are
       satisfied for its flat `usage`, whatever the grid is giving it at that moment, and
       that is the number a player needs: a smelter on a dead grid runs at nothing and still
       wants its thirty a second. Measured on what it managed to run at instead, a deficit
       would report itself as zero, and this card would come to agree with the rest of the
       page by deleting the only figure that says what to build. */
    const supplied = solved.fed[index] === undefined ? 1 : solved.fed[index];
    const asked = solved.wanted?.[index] === undefined ? 1 : solved.wanted[index];
    // A boosted generator makes more and a boosted consumer draws more, both because the
    // game multiplies by `delta()` and `delta()` carries the time scale.
    const speed = boosted ? (node.boost || 1) : 1;
    made += (node.block.power_out || 0) * supplied * speed;
    spent += (node.block.power || 0) * asked * speed;
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
  // Everything that drinks, not only the crafters, and liquids as well as items.
  //
  // Counted on `block.input` alone, a liquid ingredient was never counted as eaten at all:
  // a layout fed exactly the water its cultivators drink reported wasting all of it, while
  // the same page said the cultivators were running flat out. Never more than what
  // actually reached the block, so a machine handed half of what it wants is not credited
  // with drinking the other half.
  const eaten = {};
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (node.role !== "crafter" && node.role !== "generator" && node.role !== "sink"
        && node.role !== "turret") continue;
    const speed = node.boost || 1;
    for (const [name, rate] of Object.entries(appetite(node.block))) {
      addTo(eaten, name, Math.min(rate * speed, solved.arriving[index]?.[name] || 0));
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
export async function analyse(text, supply = {}, chosen = null,
                              { sealed = false, ground = null } = {}) {
  await loadCatalogue();
  noteLiquids();
  const parsed = await fromBase64(text);
  const graph = buildGraph(parsed.tiles);

  /* What each processor is set to, decoded once. A processor consumes nothing, so it never
     enters the flow; what it is worth to a reader is which blocks it drives, and whether it
     drives them at all. */
  for (const node of graph.nodes) {
    if (node.block.kind !== "LogicBlock") continue;
    node.program = node.config?.type === 14 ? await readProgram(node.config.bytes) : null;
  }

  // What the ground gives each drill and each pump, worked out once. Nothing here is a
  // guess: the game decides what a drill makes from the tiles under it, and until there
  // was a ground to look at, a drill in this graph made nothing at all.
  for (const node of graph.nodes) {
    node.dug = yieldOf(node, ground, catalogue);
    node.attrsum = attributeOf(node, ground, catalogue);
    node.beam = beamOf(node, ground, catalogue);
    node.wallsum = wallSumOf(node, ground, catalogue);
    node.dry = dryTilesOf(node, ground, catalogue);
  }

  // Plugged in by itself when nobody said otherwise.
  //
  // A belt that starts from nowhere is where something arrives, and the machines behind it
  // say what. Asking the player instead was asking them to state what the schematic
  // already says, and it meant a layout nobody had described analysed to nothing at all.
  const { outside, wanted, made: atFullSpeed } = demand(graph);
  const marks = readMarks(chosen);
  const marked = Object.keys(marks).length ? marks : null;

  // A build with its own sandbox taps in it feeds itself, and there is nothing to ask: the
  // player already answered by placing the sources. Fed through its edge pipes as well, a
  // reactor farm was handed cryofluid twice over.
  const selfFed = graph.nodes.some((node) => node.role === "source" && node.configured);
  // Nothing arrives unless somebody says where from.
  //
  // The version before this guessed: it fed the layout through whichever boundary carrier
  // looked likeliest, and everything on the page was computed from that choice. On a real
  // schematic that is a coin toss, and a wrong coin toss produced a full page of
  // throughputs that looked computed. Sealed is the other answer, for a sandbox build or
  // a piece of pixel art: nothing goes in, and that is a fact rather than a failure.
  const feeds = sealed || (selfFed && !marked) ? {}
    : marked ? feedFrom(graph, marked, outside, isLiquid, supply)
    : {};

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
  /* The dimmest grid in the plan, which is what the throughput above has already been
     multiplied by. Reported rather than left implicit: a figure that has been throttled and
     a figure that has not look exactly alike on the page, and the difference is the whole
     reason the player is reading it. */
  const coverage = Math.min(1, ...graph.nodes.map((node, index) =>
    ((node.block.power || 0) > 0 ? solved.coverage[index] : 1)));
  const power = { ...powerBudget(graph, solved), coverage };

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
    //
    // A sandbox source counts as handed in, because it is: it is a tap the builder put
    // inside the schematic, not a thing the schematic makes. Left out, a reactor farm
    // standing on twelve cryofluid sources was credited with the cryofluid that ran
    // straight through it and out of the nearest open pipe.
    const given = Object.values(feeds)
      .reduce((sum, rates) => sum + (rates[item] || 0), 0)
      + poured(graph, item);
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

  /**
   * Ce qu'elle rendrait si tout ce qui lui manque arrivait : un plafond, pas une mesure.
   *
   * Le chiffre au-dessus est vide tant que personne n'a dit par ou la schematique se
   * branche, et c'est la bonne reponse pour quelqu'un qui colle la sienne. Elle est fausse
   * a l'echelle d'un catalogue de quinze mille conceptions que personne ne marquera jamais
   * une par une : une usine a silicium parfaitement decrite y figure comme ne produisant
   * rien, ce qui n'aide personne a la trouver.
   *
   * **Ceci n'est pas le retour de la devinette d'entrees.** `ports.js` a ete supprime pour
   * une bonne raison : il choisissait le transporteur du bord le plus probable par
   * ressource, toute la page decoulait de ce choix, et un choix rate donnait des debits qui
   * avaient l'air calcules. Ici rien n'est choisi. Aucune arrivee n'est designee, aucun
   * flux n'est route : c'est la soustraction de ce que les machines fabriquent a plein
   * regime moins ce qu'elles se mangent entre elles. Il n'y a pas de coup de de parce qu'il
   * n'y a pas de tirage.
   *
   * C'est aussi exactement la convention que ce fichier applique deja a l'energie deux
   * lignes plus bas - `potential: powerBudget(graph, { fed: {} })`, toutes les machines a
   * fond - et le miroir exact de `needs`, qui est la meme soustraction dans l'autre sens.
   * Les deux ne peuvent pas se contredire : ils sont les deux signes d'une seule difference.
   * Verifie contre le solveur : une presse a graphite marquee a la main rend 40 graphite/min,
   * et ce plafond en annonce 40.
   *
   * Un plafond ne s'affiche jamais sans dire qu'il en est un, ni sans `needs` a cote pour
   * dire a quelles conditions. Un debit sorti de son contrat finit cite comme une mesure.
   */
  const potentialPerMinute = {};
  for (const [item, rate] of Object.entries(atFullSpeed)) {
    // `*combustible` is a hole in a shopping list, not something that comes out.
    if (item.startsWith("*")) continue;
    const spare = (rate - (wanted[item] || 0)) * 60;
    if (spare >= 0.1) potentialPerMinute[item] = spare;
  }

  /* A generator that burns anything names no material, so `demand()` counts its hunger
     under `*combustible` and nothing above took it out of the subtraction. Without this
     deduction a centrifuge feeding its own burners shows up with all the coal they eat -
     measured on one centrifuge and two combustion generators: 120 coal/min announced where
     there are 60.

     Taken off what those burners actually accept, which is the game's own per-block list
     and the same rule `demand()` now uses. It used to be a flammability threshold typed
     here, and a threshold cannot express an RTG generator, which eats thorium, phase
     fabric and fissile matter - all three with a flammability of zero. Split pro rata,
     because fuel is fungible to a burner that states a duration and no recipe. */
  const fuel = (wanted["*combustible"] || 0) * 60;
  const accepted = fuels(graph);
  const burnable = Object.keys(potentialPerMinute).filter((item) => accepted.has(item));
  const spareFuel = burnable.reduce((sum, item) => sum + potentialPerMinute[item], 0);

  if (fuel > 0 && spareFuel > 0) {
    // What is short beyond what the layout burns itself stays a need, and `needs` already
    // carries it. Nothing goes below zero here.
    const share = Math.min(spareFuel, fuel) / spareFuel;
    for (const item of burnable) {
      const left = potentialPerMinute[item] * (1 - share);
      if (left >= 0.1) {
        potentialPerMinute[item] = left;
      } else {
        delete potentialPerMinute[item];
      }
    }
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
    /* The processors, declared and not simulated: how many there are, how many of them
       drive anything rather than merely watch, and which blocks those drive. A layout whose
       three processors all only `sensor` and `print` changes no number, and saying so is
       worth more than a rate nobody can check. */
    logic: logicOf(graph.nodes),
    // What the player marked, with what each tile handles: not "it needs water" but "this
    // pipe has to bring 8,640 water a minute", which is the difference between a fact and
    // an instruction.
    ports: marksOf(graph, marks, feeds, solved),
    marks,
    // What could be picked on each tile, so the panel offers a short list rather than the
    // whole catalogue. A pipe is never offered coal.
    offers: Object.fromEntries(graph.nodes
      .filter(markable)
      .map((node) => [`${node.x},${node.y}`,
                      candidates(node, outside, wanted, catalogue, isLiquid)])),
    // Whether anything has been said yet. Nothing that depends on where it plugs in is
    // worth showing until it has.
    awaiting: !marked && !sealed && !selfFed,
    fedItself: !Object.keys(supply).length,
    sealed,
    // Whether it holds its own taps, which is what makes the question of where it plugs in
    // answer itself: a sandbox build feeds itself and nothing arrives from outside.
    selfFed,
    // What it would make if it were fed all of that, which is the number a player is
    // really shopping for. `potentialPerMinute` is the same question asked about matter:
    // one convention, two quantities, so a page never has to explain them twice.
    potential: powerBudget(graph, { fed: {} }),
    potentialPerMinute,
    // The same sum done the game's way, so the two can be held side by side. It is what
    // `Schematic.powerProduction` and `powerConsumption` return, and the build cost above
    // is `Schematic.requirements`: on every schematic tried so far this matches the panel
    // in game to the last unit, which is what makes the places it is beaten worth stating.
    // The game's own numbering, so the build cost can be listed in the order the panel in
    // game lists it rather than sorted by quantity.
    itemOrder: Object.fromEntries(
      Object.entries(catalogue.items || {}).map(([name, item]) => [name, item.id])),
    asTheGameSaysIt: {
      ...powerBudget(graph, { fed: {} }, { boosted: false }),
      // How many blocks are being sped up, which is the whole of the difference.
      boosted: graph.nodes.filter((node) => (node.boost || 1) > 1).length,
      projectors: graph.nodes.filter((node) => node.role === "projector").length,
    },
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
      dug: node.dug || null,
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
    /* What the player said arrives, per block per second. The analytic side has already
       used it; the moving picture needs the same thing, and needs it to be the **same**
       thing: a schematic watched running on one supply and reported on another would be
       two answers to one question. */
    feeds,
    // The nodes rather than the raw tiles: they carry the size, the role and the checked
    // bridge link, so the picture and the analysis cannot disagree about what is connected.
    tiles: graph.nodes,
  };
}
