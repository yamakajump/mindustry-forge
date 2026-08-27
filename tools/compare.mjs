/**
 * Running a scenario both ways, and lining the two answers up.
 *
 * Shared by `tools/oracle.mjs`, which prints the table, and `tests/js/oracle.test.js`,
 * which fails the build. They were briefly two copies of the same comparison and drifted
 * within the hour: the tool learned about painted ground and liquid pools and the test did
 * not, so `npm run oracle` said everything matched while `npm test` said four things did
 * not. One copy.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const KEPT = join(ROOT, "bench", "data", "oracle");

const { buildGraph, useCatalogue } = await import(
  new URL("../site/public/forge/analyse.js", import.meta.url));
const { fromBase64 } = await import(
  new URL("../site/public/forge/schematic.js", import.meta.url));
const { World } = await import(new URL("../site/public/forge/engine/core.js", import.meta.url));
const { behaviourOf } = await import(
  new URL("../site/public/forge/engine/carriers.js", import.meta.url));
const { gridsOf } = await import(new URL("../site/public/forge/engine/power.js", import.meta.url));
const { attributeOf, beamOf, dryTilesOf, wallSumOf, yieldOf } = await import(
  new URL("../site/public/forge/ground.js", import.meta.url));

/**
 * Which measured blocks count as machines, so both sides pick the same ones.
 *
 * Anything that holds a stock worth comparing. The defensive blocks earn their place here:
 * what a mender is holding after thirty seconds **is** the measurement, because it eats an
 * item every four hundred ticks whether or not anything near it is damaged.
 */
const MACHINE_ROLES = new Set([
  "crafter", "unit-factory", "generator", "drill", "separator",
  "mender", "projector", "shield", "turret-idle", "laser-turret",
  "beam-drill", "wall-crafter", "burst-drill", "reconstructor", "constructor",
]);

export const known = useCatalogue(JSON.parse(
  readFileSync(join(ROOT, "site", "public", "forge", "blocks.json"), "utf8")));

const MACHINE_BLOCKS = new Set(Object.entries(known.blocks)
  .filter(([, block]) => MACHINE_ROLES.has(block.role))
  .map(([name]) => name));

/**
 * Line things up so they can be compared one to one.
 *
 * Summed together, a sorter that sorts nothing passes: both items are there, just in the
 * wrong vaults. Told apart by where they stand, it does not. The two engines number the
 * world differently, so everything is placed relative to the leftmost and lowest of its
 * own kind and matched in that order.
 */
function lineUp(list, keys, tie = null) {
  if (!list.length) return [];
  const left = Math.min(...list.map((one) => one.x));
  const bottom = Math.min(...list.map((one) => one.y));
  const order = (one) => one.at + (tie ? `\u0000${one[tie]}` : "");
  return list
    .map((one) => {
      const out = { at: `${one.x - left},${one.y - bottom}` };
      for (const key of keys) out[key] = one[key];
      return out;
    })
    // A tiebreaker where one position can hold several rows, which a block holding two
    // liquids does: sorted by position alone the two sides pair them off differently.
    .sort((a, b) => order(a).localeCompare(order(b)));
}

/**
 * The ground a scenario is run on, in the shape the analysis paints it in.
 *
 * Two layers, not one. An ore is laid **over** whatever floor is there, a floor **is** the
 * floor: painting spore moss as an overlay would leave a cultivator standing on bare metal
 * as far as `sumAttribute` is concerned, and the boost it is there to measure would read
 * zero. The bench tells them apart the same way, by class.
 *
 * The bare floor is metal, because that is what `Measure` lays the map out in.
 */
export function groundOf(list) {
  const painted = {};
  for (const one of list) {
    const [block, at] = one.split("@");
    if (!at) continue;
    const layers = painted[at] || (painted[at] = { floor: "metal-floor" });
    // Three layers, not two: Erekir's ore is an overlay on a **wall**, and a wall is a
    // block rather than a layer of ground. A bore pointed at one reads nothing if the wall
    // is filed as a floor, because nothing there is solid.
    if (known.blocks[block]?.wall) layers.wall = block;
    else if (known.blocks[block]?.overlay) layers.overlay = block;
    else layers.floor = block;
  }
  return painted;
}

/**
 * What each block starts out holding, if the scenario said.
 *
 * Written `coal*10@3,0` for items and `water~60@3,0` for a liquid, in the same coordinates
 * as the ground and moved the same way. A sandbox source never runs out, so anything
 * measured beside one is never hungry; half the questions worth asking are the other kind,
 * and "does this block drink its coolant or merely hold it" is one of them.
 */
function fill(world, stock) {
  for (const one of stock) {
    const [what, at] = one.split("@");
    const [x, y] = at.split(",").map(Number);
    const build = world.at(x, y);
    if (!build) continue;
    if (what.includes("~")) {
      const [liquid, amount] = what.split("~");
      build.liquids.add(liquid, Number(amount));
    } else {
      const [item, count] = what.split("*");
      build.items.add(item, Number(count));
    }
  }
}

/** Run a schematic through the port, and report what settled where. */
export async function ported(code, ticks, ground = [], stock = []) {
  const parsed = await fromBase64(code);
  const graph = buildGraph(parsed.tiles);
  const painted = groundOf(ground);
  for (const node of graph.nodes) {
    node.dug = yieldOf(node, painted, known);
    node.attrsum = attributeOf(node, painted, known);
    node.beam = beamOf(node, painted, known);
    node.wallsum = wallSumOf(node, painted, known);
    node.dry = dryTilesOf(node, painted, known);
  }

  const world = new World(graph, behaviourOf).wire(gridsOf);
  /* Where the bench lays the schematic down, so that the one block whose behaviour depends
     on its map position - a separator, whose draw is seeded from `tile.pos()` - is asked
     the same question on both sides. `Measure.MARGIN`. */
  world.origin = [12, 12];
  world.catalogue = known;
  fill(world, stock);
  for (let i = 0; i < ticks; i++) world.step();

  const containers = world.builds
    .filter((build) => build.role === "store" || build.role === "core")
    .map((build) => ({
      x: build.x, y: build.y,
      items: Object.fromEntries([...build.items.counts].filter(([, n]) => n > 0)),
    }));

  const pools = world.builds.flatMap((build) =>
    [...build.liquids.held()].map(([liquid, amount]) => (
      { x: build.x, y: build.y, liquid, amount })));

  const batteries = world.builds
    .filter((build) => (build.block.power_capacity || 0) > 0)
    .map((build) => ({ x: build.x, y: build.y, charge: build.state.charge || 0 }));

  /* What the machines are holding when the clock stops.
  
     Not the belts: an item halfway along one is a sub-tile position and whether it has
     been handed on at frame eighteen hundred is a coin toss neither engine owes the other.
     A machine's stock is not: a factory that stalled with sixty silicon in it stalled with
     sixty silicon in it, and that is the whole result of a scenario about stalling. */
  const stocks = world.builds
    .filter((build) => MACHINE_ROLES.has(build.role))
    .filter((build) => build.items.total > 0)
    .map((build) => ({
      x: build.x, y: build.y,
      items: Object.fromEntries([...build.items.counts].filter(([, n]) => n > 0)),
    }));

  const ammo = world.builds
    .filter((build) => build.role === "turret" && (build.state.ammo || 0) > 0)
    .map((build) => ({ x: build.x, y: build.y, ammo: build.state.ammo }));

  const carried = world.builds
    .filter((build) => build.state.payload)
    .map((build) => ({ x: build.x, y: build.y, payload: build.state.payload }));

  const units = {};
  for (const build of world.builds) {
    const made = build.state.made || 0;
    if (!made) continue;
    const name = build.state.plan?.unit;
    if (name) units[name] = (units[name] || 0) + made;
  }

  return {
    containers: lineUp(containers, ["items"]),
    pools: lineUp(pools, ["liquid", "amount"], "liquid"),
    batteries: lineUp(batteries, ["charge"]),
    stocks: lineUp(stocks, ["items"]),
    ammo: lineUp(ammo, ["ammo"]),
    payloads: lineUp(carried, ["payload"]),
    units,
  };
}

/** What the engine wrote down last time, if it has been asked. */
export function measured(name) {
  const path = join(KEPT, `${name}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    ticks: raw.ticks,
    containers: lineUp(raw.containers || [], ["items"]),
    pools: lineUp(raw.pools || [], ["liquid", "amount"], "liquid"),
    batteries: lineUp(raw.batteries || [], ["charge"]),
    stocks: lineUp((raw.running || [])
      .filter((one) => one.holds && MACHINE_BLOCKS.has(one.block))
      .map((one) => ({ x: one.x, y: one.y, items: one.holds })), ["items"]),
    ammo: lineUp((raw.running || [])
      .filter((one) => (one.ammo || 0) > 0)
      .map((one) => ({ x: one.x, y: one.y, ammo: one.ammo })), ["ammo"]),
    payloads: lineUp(raw.payloads || [], ["payload"]),
    units: raw.units || {},
  };
}

/** The ground a scenario was measured on, written down beside it. */
export function paintedFor(name) {
  return listing(join(KEPT, `${name}.sol`));
}

/** And what its blocks started out holding. */
export function stockedFor(name) {
  return listing(join(KEPT, `${name}.stock`));
}

function listing(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split(/\s+/) : [];
}

/**
 * Every disagreement between the two, as a list.
 *
 * Items are counted whole, because "a hundred and eighty two both times" leaves nowhere to
 * hide. Liquids are compared to within a fiftieth, because a pipeline settles into a
 * gradient rather than a count and the last digit of a float added to three thousand times
 * is not a fact about the game.
 */
export function differences(mine, theirs) {
  const out = [];

  if (mine.containers.length !== theirs.containers.length) {
    out.push({ what: "coffres", mine: mine.containers.length,
               theirs: theirs.containers.length, gap: 1 });
  } else {
    for (let i = 0; i < mine.containers.length; i++) {
      const here = mine.containers[i];
      const there = theirs.containers[i];
      const items = new Set([...Object.keys(here.items), ...Object.keys(there.items)]);
      for (const item of items) {
        const a = here.items[item] || 0;
        const b = there.items[item] || 0;
        out.push({ what: `${here.at} ${item}`, mine: a, theirs: b,
                   gap: b ? Math.abs(a - b) / b : (a ? 1 : 0) });
      }
    }
  }

  if (mine.pools.length !== theirs.pools.length) {
    out.push({ what: "flaques", mine: mine.pools.length,
               theirs: theirs.pools.length, gap: 1 });
  } else {
    for (let i = 0; i < mine.pools.length; i++) {
      const here = mine.pools[i];
      const there = theirs.pools[i];
      /* Half a unit is the resolution of a settled pipeline, and it is not a tolerance
         granted out of kindness: it is the difference between asking "how much is there"
         and "which pipe is it in". A gradient is a fixed point the two engines approach
         from different sides, `moveLiquid` steps by fractions of a unit, and the residue
         in the first pipe of a run lands a few tenths apart while the **total** across the
         run comes out the same to a hundredth. So the total is checked exactly, below, and
         the distribution is checked to half a unit. */
      const size = Math.max(there.amount, 1);
      const apart = Math.abs(here.amount - there.amount);
      const gap = here.liquid !== there.liquid ? 1
        : apart <= 0.5 ? 0 : apart / size;
      out.push({ what: `${here.at} ${there.liquid}`,
                 mine: here.amount.toFixed(1), theirs: there.amount.toFixed(1), gap });
    }
  }

  /* And the total of each liquid, everywhere, compared to a hundredth.
  
     This is the half of the liquid comparison that has to be strict. Where a settled
     gradient puts its last half unit is the order two engines updated three tanks in;
     whether the run is holding six hundred units or five hundred and ninety is a fact
     about the blocks, and nothing may lose or invent a drop. */
  const liquids = new Set([...mine.pools.map((one) => one.liquid),
                           ...theirs.pools.map((one) => one.liquid)]);
  for (const liquid of liquids) {
    const sum = (pools) => pools
      .filter((one) => one.liquid === liquid)
      .reduce((total, one) => total + one.amount, 0);
    const a = sum(mine.pools);
    const b = sum(theirs.pools);
    const apart = Math.abs(a - b);
    out.push({ what: `${liquid} en tout`, mine: a.toFixed(2), theirs: b.toFixed(2),
               gap: apart <= 0.01 ? 0 : apart / Math.max(b, 1) });
  }

  if (mine.stocks.length !== theirs.stocks.length) {
    out.push({ what: "machines qui retiennent", mine: mine.stocks.length,
               theirs: theirs.stocks.length, gap: 1 });
  } else {
    for (let i = 0; i < mine.stocks.length; i++) {
      const here = mine.stocks[i];
      const there = theirs.stocks[i];
      const items = new Set([...Object.keys(here.items), ...Object.keys(there.items)]);
      for (const item of items) {
        const a = here.items[item] || 0;
        const b = there.items[item] || 0;
        out.push({ what: `${here.at} retient ${item}`, mine: a, theirs: b,
                   gap: b ? Math.abs(a - b) / b : (a ? 1 : 0) });
      }
    }
  }

  if (mine.payloads.length !== theirs.payloads.length) {
    out.push({ what: "charges portees", mine: mine.payloads.length,
               theirs: theirs.payloads.length, gap: 1 });
  } else {
    for (let i = 0; i < mine.payloads.length; i++) {
      const a = mine.payloads[i];
      const b = theirs.payloads[i];
      out.push({ what: `${a.at} porte`, mine: a.payload, theirs: b.payload,
                 gap: a.payload === b.payload ? 0 : 1 });
    }
  }

  if (mine.ammo.length !== theirs.ammo.length) {
    out.push({ what: "tourelles chargees", mine: mine.ammo.length,
               theirs: theirs.ammo.length, gap: 1 });
  } else {
    for (let i = 0; i < mine.ammo.length; i++) {
      const a = mine.ammo[i].ammo;
      const b = theirs.ammo[i].ammo;
      out.push({ what: `${mine.ammo[i].at} munitions`, mine: a, theirs: b,
                 gap: b ? Math.abs(a - b) / b : (a ? 1 : 0) });
    }
  }

  const madeUnits = new Set([...Object.keys(mine.units), ...Object.keys(theirs.units)]);
  for (const unit of madeUnits) {
    const a = mine.units[unit] || 0;
    const b = theirs.units[unit] || 0;
    out.push({ what: `${unit} sortis`, mine: a, theirs: b,
               gap: b ? Math.abs(a - b) / b : (a ? 1 : 0) });
  }

  if (mine.batteries.length !== theirs.batteries.length) {
    out.push({ what: "batteries", mine: mine.batteries.length,
               theirs: theirs.batteries.length, gap: 1 });
  } else {
    for (let i = 0; i < mine.batteries.length; i++) {
      const here = mine.batteries[i];
      const there = theirs.batteries[i];
      /* A thousandth is the resolution of this measurement and not a tolerance granted
         out of kindness: a battery's charge is a float added to eighteen hundred times, in
         a different order on each side, and the fourth decimal is the order rather than
         the physics. Anything a schematic would notice is three orders of magnitude
         larger. */
      const apart = Math.abs(here.charge - there.charge);
      out.push({ what: `${here.at} charge`,
                 mine: here.charge.toFixed(3), theirs: there.charge.toFixed(3),
                 gap: apart <= 0.001 ? 0 : apart });
    }
  }

  return out;
}
