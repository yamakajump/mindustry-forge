/**
 * The analysis run backwards: name a rate, and be told what to build.
 *
 * The rest of this site reads a schematic and says what it makes. This asks the question a
 * player actually starts from, which is "I want a hundred silicon a minute, what do I
 * need". The catalogue holds every recipe, so the chain unrolls: a silicon smelter needs
 * coal and sand, coal needs an ore patch or a centrifuge, and each step multiplies out into
 * a count of blocks, a build cost and a draw on the grid.
 *
 * Their ratio calculator divides one number by another. The difference is not arithmetic,
 * it is that this one follows the chain to the ground and stops at things you dig.
 *
 * Three rules hold this file together, and all three come from mistakes this repository has
 * already paid for.
 *
 * **Nothing is rounded quietly.** Three point two smelters is four smelters running at
 * eighty per cent, and those are different factories. The fraction is carried to the end and
 * both numbers are reported.
 *
 * **Every figure carries its assumptions.** "You need four smelters" is only true if they
 * are fed flat out, if the drill sits on a full patch, and if the power is there. Those
 * conditions travel with the answer in `assumptions`, so a page cannot print the number
 * without them.
 *
 * **What can be dug is dug.** Sand has a recipe and is still, nine times out of ten, a
 * drill on a beach. An item that comes out of the ground is treated as raw unless the
 * caller says otherwise, because a planner that answers "build eleven pulverisers" to
 * "I need sand" is answering a question nobody asked.
 */

import { producers } from "./needs.js";

/** Ticks in a second. The game states craft times in ticks; this file reports seconds. */
const TICKS = 60;

/** Below this, a rate is zero: a crumb at the end of a division, not a requirement. */
const SETTLED = 1e-9;

/**
 * How many times a second a block completes its recipe, fed perfectly.
 *
 * The same line as `analyse.js` and `needs.js`, which both carry their own copy for the
 * same reason: it is not exported, and exporting it would change that file's hash, which
 * marks every stored analysis on the site stale. `plan.test.js` checks this file against
 * the engine's own answer on every block in the catalogue.
 */
const craftsPerSecond = (block) => (block.craft_time ? TICKS / block.craft_time : 0);

/** Blocks a player can actually place. Hidden ones are the game's own furniture. */
const placeable = (block) => block.build_visibility !== "hidden";

/**
 * Whether a block belongs to the world being planned for.
 *
 * A block on neither belongs to both: the conveyor is on Serpulo and Erekir alike, and a
 * planner that dropped it when asked for Erekir would refuse to move anything.
 */
const onPlanet = (block, planet) =>
  !planet || !block.planet || block.planet === planet;

/**
 * Every block that makes a thing, best first.
 *
 * Ordered by the game's own block id rather than by any measure of merit. Merit would need
 * a weighting between build cost, footprint and power, and inventing one here would decide
 * for the player in a direction nothing in this file can defend. The caller picks; this
 * only offers, and it offers in a stable order so the same question gives the same answer.
 */
export function makersOf(catalogue, item, planet = null) {
  return Object.entries(catalogue.blocks || {})
    .filter(([, block]) => placeable(block) && onPlanet(block, planet))
    .filter(([, block]) => (block.output?.[item] || 0) > 0)
    .sort((a, b) => (a[1].id ?? Infinity) - (b[1].id ?? Infinity))
    .map(([name]) => name);
}

/**
 * The producers `needs.js` offers, minus the ones the chosen world cannot build.
 *
 * `producers` answers for the whole game: it matches on `role === "drill"`, which is the
 * four Serpulo drills and nothing else, and it filters by no world at all. So an Erekir
 * plan came back advising a blast drill, a block that cannot be placed there, and no plasma
 * bore at all because a bore's role is `beam-drill`.
 *
 * Filtered here rather than fixed there on purpose. `needs.js` is in `EngineVersion`, so
 * touching it restamps every stored analysis on the site, and the same gap is showing in
 * the analyser's own panel today. That is a repair to sequence with the pilot, not one to
 * slip into a tool's branch. Until then this refuses to advise a block a player cannot
 * build, which is the half of the bug that is mine to keep out of.
 */
function buildable(catalogue, options, planet) {
  return options.filter(({ block }) => onPlanet(catalogue.blocks[block] || {}, planet));
}

/** Everything that comes out of the ground somewhere, whatever else can also make it. */
export function minables(catalogue) {
  const found = new Set();
  for (const block of Object.values(catalogue.blocks || {})) {
    if (typeof block.drops === "string") found.add(block.drops);
  }
  return found;
}

/**
 * How a thing is going to be obtained: dug, made, or neither.
 *
 * `choices` is the caller's override, one entry per item, naming the block to use or the
 * string "mine". Without an override, anything the ground yields is dug, because that is
 * what a player does and because a drill on ore has no upstream chain to plan.
 */
function sourceOf(catalogue, item, { planet, choices, dug }) {
  const chosen = choices[item];
  if (chosen === "mine") return { kind: "raw" };
  if (typeof chosen === "string") return { kind: "craft", block: chosen };
  if (dug.has(item)) return { kind: "raw" };

  const makers = makersOf(catalogue, item, planet);
  return makers.length ? { kind: "craft", block: makers[0] } : { kind: "raw" };
}

/**
 * The order to work the chain in, deepest first, or the loop that stops it.
 *
 * Demand has to be totalled before a count is worked out, because two branches often want
 * the same thing: silicon and graphite both burn coal, and sizing the coal line off either
 * one alone builds half of it. So the graph is sorted first and the counts are worked out
 * afterwards, from the target down.
 *
 * Recipes that feed each other would loop forever. The game has a few chains close enough
 * to circular that this is not theoretical, so the walk reports the loop instead of
 * hanging, and the caller says so rather than printing half a plan.
 */
function order(catalogue, target, options) {
  const state = new Map();
  const sorted = [];
  const cycles = [];

  const walk = (item, trail) => {
    if (state.get(item) === "done") return;
    if (state.get(item) === "open") {
      cycles.push([...trail.slice(trail.indexOf(item)), item]);
      return;
    }

    state.set(item, "open");
    const source = sourceOf(catalogue, item, options);
    if (source.kind === "craft") {
      const block = catalogue.blocks[source.block];
      for (const input of Object.keys(block?.input || {})) {
        walk(input, [...trail, item]);
      }
    }
    state.set(item, "done");
    sorted.push(item);
  };

  walk(target, []);

  // Deepest first is the order they were finished in; the counts want the opposite, since
  // a smelter's coal demand is only known once the smelter has been counted.
  return { sorted: sorted.reverse(), cycles };
}

/**
 * What to build to get a rate, and everything that follows from it.
 *
 * `perMinute` because that is how a player states it and how the rest of the site prints
 * it; everything inside works per second, like the engine.
 */
export function plan(catalogue, { item, perMinute, planet = null, choices = {} }) {
  const wanted = Math.max(0, Number(perMinute) || 0) / 60;
  const dug = minables(catalogue);
  const options = { planet, choices, dug };

  if (!item || wanted <= SETTLED) {
    return empty(item, perMinute);
  }

  const { sorted, cycles } = order(catalogue, item, options);

  // Demand in items a second, totalled across every branch that wants the same thing.
  const demand = { [item]: wanted };
  const liquids = {};
  const steps = [];
  const raw = [];
  const cost = {};
  let power = 0;

  for (const current of sorted) {
    const need = demand[current] || 0;
    if (need <= SETTLED) continue;

    const source = sourceOf(catalogue, current, options);
    if (source.kind === "raw") {
      raw.push({
        resource: current,
        perSecond: need,
        perMinute: need * 60,
        // Drills and pumps, straight from `needs.js`, which already answers this and
        // already says that its figure is a best case on a full patch of ore.
        options: buildable(catalogue, producers(catalogue, current, need), planet),
      });
      continue;
    }

    const block = catalogue.blocks[source.block];
    const perBlock = (block.output?.[current] || 0) * craftsPerSecond(block);
    if (perBlock <= SETTLED) continue;

    const count = need / perBlock;
    const whole = Math.ceil(count - SETTLED);

    steps.push({
      item: current,
      block: source.block,
      perBlock,
      perBlockPerMinute: perBlock * 60,
      need,
      needPerMinute: need * 60,
      // Both, always. The fraction is what the factory actually runs at; the whole number
      // is what gets built. Reporting either one alone is reporting a different factory.
      count,
      whole,
      load: whole ? count / whole : 0,
      // Drawn at full tilt for every block placed, not averaged over the load. A grid
      // sized on the average dims the moment the line runs full, and a planner that
      // understates power is a planner that browns out a base.
      power: whole * (block.power || 0),
    });

    power += whole * (block.power || 0);

    for (const [part, amount] of Object.entries(block.cost || {})) {
      cost[part] = (cost[part] || 0) + amount * whole;
    }

    for (const [input, amount] of Object.entries(block.input || {})) {
      demand[input] = (demand[input] || 0) + amount * craftsPerSecond(block) * count;
    }
    // Liquid rates are stated per second already, so they scale with the count of blocks
    // and never with the craft rate. Multiplying them by crafts a second was how an early
    // reading of the catalogue asked for sixty times the water a line drinks.
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      liquids[liquid] = (liquids[liquid] || 0) + rate * count;
    }
  }

  for (const [liquid, rate] of Object.entries(liquids)) {
    raw.push({
      resource: liquid,
      perSecond: rate,
      perMinute: rate * 60,
      options: buildable(catalogue, producers(catalogue, liquid, rate), planet),
    });
  }

  return {
    target: { item, perSecond: wanted, perMinute: wanted * 60 },
    steps,
    raw: raw.sort((a, b) => b.perSecond - a.perSecond),
    power,
    cost,
    cycles,
    assumptions: assumptionsFor(steps, raw, power),
  };
}

/**
 * What has to be true for the plan to hold, listed with it and never as a footnote.
 *
 * Every one of these is a way the number is optimistic, and a player who builds against an
 * optimistic number builds a factory that underruns and cannot see why. They are keys
 * rather than sentences so the page can translate them, and they are derived from the plan
 * rather than written by hand so a plan cannot be printed without the ones that apply.
 */
function assumptionsFor(steps, raw, power) {
    const said = [];

    if (steps.length) said.push("fed");
    if (steps.some((step) => step.load < 1 - 1e-6)) said.push("partial");
    if (power > 0) said.push("power");
    if (raw.some((row) => row.options.some((option) => option.block))) said.push("patch");

    return said;
}

function empty(item, perMinute) {
    return {
        target: { item: item || null, perSecond: 0, perMinute: Number(perMinute) || 0 },
        steps: [],
        raw: [],
        power: 0,
        cost: {},
        cycles: [],
        assumptions: [],
    };
}
