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
const { yieldOf } = await import(new URL("../site/public/forge/ground.js", import.meta.url));

/** Which measured blocks count as machines, so both sides pick the same ones. */
const MACHINE_ROLES = new Set(["crafter", "unit-factory", "generator", "drill"]);

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
function lineUp(list, keys) {
  if (!list.length) return [];
  const left = Math.min(...list.map((one) => one.x));
  const bottom = Math.min(...list.map((one) => one.y));
  return list
    .map((one) => {
      const out = { at: `${one.x - left},${one.y - bottom}` };
      for (const key of keys) out[key] = one[key];
      return out;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** The ground a scenario is run on, in the shape the analysis paints it in. */
export function groundOf(list) {
  const painted = {};
  for (const one of list) {
    const [block, at] = one.split("@");
    if (at) painted[at] = { floor: "stone", overlay: block };
  }
  return painted;
}

/** Run a schematic through the port, and report what settled where. */
export async function ported(code, ticks, ground = []) {
  const parsed = await fromBase64(code);
  const graph = buildGraph(parsed.tiles);
  const painted = groundOf(ground);
  for (const node of graph.nodes) node.dug = yieldOf(node, painted, known);

  const world = new World(graph, behaviourOf).wire(gridsOf);
  for (let i = 0; i < ticks; i++) world.step();

  const containers = world.builds
    .filter((build) => build.role === "store" || build.role === "core")
    .map((build) => ({
      x: build.x, y: build.y,
      items: Object.fromEntries([...build.items.counts].filter(([, n]) => n > 0)),
    }));

  const pools = world.builds
    .filter((build) => build.liquid && build.liquidAmount > 0.001)
    .map((build) => ({ x: build.x, y: build.y,
                       liquid: build.liquid, amount: build.liquidAmount }));

  const batteries = world.builds
    .filter((build) => (build.block.power_capacity || 0) > 0)
    .map((build) => ({ x: build.x, y: build.y, charge: build.state.charge || 0 }));

  /* What the machines are holding when the clock stops.
  
     Not the belts: an item halfway along one is a sub-tile position and whether it has
     been handed on at frame eighteen hundred is a coin toss neither engine owes the other.
     A machine's stock is not: a factory that stalled with sixty silicon in it stalled with
     sixty silicon in it, and that is the whole result of a scenario about stalling. */
  const stocks = world.builds
    .filter((build) => ["crafter", "unit-factory", "generator", "drill"].includes(build.role))
    .filter((build) => build.items.total > 0)
    .map((build) => ({
      x: build.x, y: build.y,
      items: Object.fromEntries([...build.items.counts].filter(([, n]) => n > 0)),
    }));

  const units = {};
  for (const build of world.builds) {
    const made = build.state.made || 0;
    if (!made) continue;
    const name = build.state.plan?.unit;
    if (name) units[name] = (units[name] || 0) + made;
  }

  return {
    containers: lineUp(containers, ["items"]),
    pools: lineUp(pools, ["liquid", "amount"]),
    batteries: lineUp(batteries, ["charge"]),
    stocks: lineUp(stocks, ["items"]),
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
    pools: lineUp(raw.pools || [], ["liquid", "amount"]),
    batteries: lineUp(raw.batteries || [], ["charge"]),
    stocks: lineUp((raw.running || [])
      .filter((one) => one.holds && MACHINE_BLOCKS.has(one.block))
      .map((one) => ({ x: one.x, y: one.y, items: one.holds })), ["items"]),
    units: raw.units || {},
  };
}

/** The ground a scenario was measured on, written down beside it. */
export function paintedFor(name) {
  const path = join(KEPT, `${name}.sol`);
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
      const size = Math.max(there.amount, 1);
      const gap = here.liquid !== there.liquid
        ? 1 : Math.abs(here.amount - there.amount) / size;
      out.push({ what: `${here.at} ${there.liquid}`,
                 mine: here.amount.toFixed(1), theirs: there.amount.toFixed(1), gap });
    }
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
      out.push({ what: `${here.at} charge`,
                 mine: here.charge.toFixed(3), theirs: there.charge.toFixed(3),
                 gap: Math.abs(here.charge - there.charge) });
    }
  }

  return out;
}
