/**
 * What a schematic needs to run flat out, said in what a player installs.
 *
 * The first version asked the question the other way round: "tell me what arrives, and I
 * will tell you what comes out". That is the tool making its own homework the player's
 * problem. Nobody knows offhand that a layout drinks eighteen water a second; what they
 * want to know is that it takes two mechanical pumps, or one rotary.
 *
 * So the demand is computed rather than asked for, and then divided by what each pump and
 * each drill actually produces, straight out of the game's own numbers.
 */

import { drillTimeOf } from "./ground.js";

const TICKS = 60;

/**
 * Everything the layout consumes at full speed, minus everything it makes for itself.
 *
 * A schematic that grows its own spore pods and presses them into oil does not need oil
 * delivered; it needs water. Subtracting internal production is what turns a list of every
 * ingredient in the chain into the short list of things that actually have to arrive.
 */
export function demand(graph) {
  const wanted = {};
  const made = {};

  for (const node of graph.nodes) {
    const block = node.block;
    const crafts = block.craft_time ? TICKS / block.craft_time : 0;

    // A block under an overdrive projector eats and makes more per second, and the
    // shopping list is a list of rates.
    const speed = node.boost || 1;

    for (const [item, count] of Object.entries(block.input || {})) {
      wanted[item] = (wanted[item] || 0) + count * crafts * speed;
    }
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      wanted[liquid] = (wanted[liquid] || 0) + rate * speed;
    }
    // A generator that burns whatever it is handed states a duration and no ingredient.
    if (node.role === "generator" && !Object.keys(block.input || {}).length && crafts) {
      wanted["*combustible"] = (wanted["*combustible"] || 0) + crafts * speed;
    }

    for (const [item, count] of Object.entries(block.output || {})) {
      made[item] = (made[item] || 0) + count * crafts * speed;
    }
    for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
      made[liquid] = (made[liquid] || 0) + rate * speed;
    }
    // A sandbox source is a tap the builder put inside the schematic. Left out, a test
    // layout standing on twelve liquid sources was told to go and find a pump.
    if (node.role === "source" && node.configured) {
      made[node.configured] = (made[node.configured] || 0)
        + (block.output_per_second || 0) * speed;
    }
    // And a drill standing on ore is not something to go and find either: it is already
    // there, pulling out exactly what the tiles under it hold.
    if (node.dug) {
      made[node.dug.resource] = (made[node.dug.resource] || 0) + node.dug.rate * speed;
    }
  }

  const burnable = fuels(graph);

  const outside = {};
  for (const [name, rate] of Object.entries(wanted)) {
    // A generator that burns anything is covered by what this layout makes **and it can
    // actually burn**. Counted against its own name it stayed on the shopping list of a
    // schematic whose own centrifuges already made exactly the coal its generators ate;
    // counted against everything, a silicon line was told its silicon would feed them.
    const covered = name === "*combustible"
      ? Object.entries(made).reduce((sum, [item, r]) =>
          burnable.has(item) ? sum + r : sum, 0)
      : (made[name] || 0);
    const short = rate - covered;
    if (short > 1e-4) outside[name] = short;
  }
  return { outside, wanted, made };
}

/**
 * Whether a block pulls an item out of the ground at all.
 *
 * Asked of the catalogue rather than matched against a list of roles. The list was
 * `role === "drill"`, which is the four Serpulo drills and nothing else, so a plasma bore
 * (`beam-drill`) and an impact drill (`burst-drill`) were never offered and Erekir's
 * tungsten had no source at all. Replacing one list with a longer one only moves the day it
 * goes stale to the next time the game adds a class.
 *
 * A block that takes time to bring something up and states how hard an ore it can reach is
 * a drill, whatever the game calls its class. The tier is what keeps the cliff crushers
 * out: they carry a `drill_time` and eat cliffs rather than ore, so they have no tier, and
 * they already appear as makers of sand through their recipe.
 */
const extractsOre = (block) => (block.drill_time || 0) > 0 && (block.tier || 0) > 0;

/**
 * Whether a block is a tap on the ground rather than something fed from elsewhere.
 *
 * `shown` is doing real work here: the sandbox item and liquid sources also state an output
 * a second, and telling a player to plan their base around a block the game only hands them
 * in a sandbox would be worse than saying nothing.
 */
const isTap = (block) => (block.output_per_second || 0) > 0 && block.build_visibility === "shown";

/**
 * Whether the world being planned for can build it.
 *
 * A block on neither world belongs to both. Without this an Erekir schematic was told to
 * install a blast drill, which is a correct rate attached to a block that cannot be placed
 * there, and that is the worst shape a wrong answer can take: it reads as an instruction.
 */
const buildableOn = (block, planet) => !planet || !block.planet || block.planet === planet;

/**
 * How many tiles of ore a drill works at once.
 *
 * Two shapes, and the game's, not a rounding. An ordinary drill and a burst drill both
 * cover their whole footprint, so a three by three works nine tiles. A beam drill fires one
 * line out of each tile across the face it points at, so it works its width and not its
 * area: `Block.nearbySide` in the game, and `beamOf` here.
 *
 * Told apart by the reach they state rather than by their class name, for the same reason
 * as `extractsOre`: only a drill that fires at a distance has a `range`.
 */
const oreTilesOf = (block) => {
  const size = block.size || 1;
  return block.range ? size : size * size;
};

/**
 * Which world a layout belongs to, when it says so.
 *
 * Read off the blocks that are actually placed. Most blocks belong to a world and a few
 * belong to none, so a schematic made of Erekir blocks is an Erekir schematic and the
 * shopping list should not offer it Serpulo drills. A layout built only of blocks that
 * belong to neither, or of both at once, gets no filter rather than a guess.
 */
export function planetOf(graph) {
  const seen = new Set();
  for (const node of graph?.nodes || []) {
    if (node.block?.planet) seen.add(node.block.planet);
  }
  return seen.size === 1 ? [...seen][0] : null;
}

/**
 * What this layout's fuel burners will actually take, straight from the game's own list.
 *
 * A generator that burns "anything" states a duration and no recipe, so its hunger has no
 * item name and is counted under `*combustible`. Deciding what covers that hunger used to
 * be done twice in this repository, and both answers were wrong.
 *
 * `needs.js` counted everything the layout made. A chain producing silicon and burning
 * coal was therefore told its silicon fed its generators, so coal never appeared on the
 * shopping list. The player builds it, it stops, and the page had said it would run.
 *
 * `marks.js` filtered on `flammability > 0.1`, which is closer but still invented here: an
 * RTG generator eats thorium, phase fabric and fissile matter, and all three have a
 * flammability of zero. A threshold cannot express that, because it is not what the game
 * checks.
 *
 * What the game checks is a list per block, and the bench already dumps it as `accepts`.
 * So there is no threshold and no list typed in this file: the rule is read from the same
 * catalogue the rest of the analysis is read from, and it changes when the game changes.
 */
export function fuels(graph) {
  const burnable = new Set();
  for (const node of graph.nodes) {
    const block = node.block;
    if (node.role !== "generator" || !block.craft_time) continue;
    // Only the ones with no recipe. A thorium reactor names its ingredients, so its demand
    // is already counted under those names and has nothing to do with this.
    if (Object.keys(block.input || {}).length) continue;
    for (const item of block.accepts || []) burnable.add(item);
  }
  return burnable;
}

/**
 * How many of each producer it takes to cover a rate.
 *
 * A drill's speed depends on the ore under it, so the figure here is the best case: a full
 * footprint of that ore. Said as a best case rather than as a promise, because a drill on
 * half a patch does half as much and a player who is told otherwise will build half a
 * factory.
 *
 * `planet` narrows the answer to what can actually be placed. It is optional so that a
 * caller who genuinely wants the whole game can have it, and every caller inside this
 * repository passes one.
 */
export function producers(catalogue, resource, rate, planet = null) {
  const options = [];
  const item = catalogue.items?.[resource];

  for (const [name, block] of Object.entries(catalogue.blocks)) {
    if (!buildableOn(block, planet)) continue;

    if (isTap(block)) {
      // A pump only pumps what is under it, so it covers any liquid; which one is the
      // map's business, not the schematic's.
      if (!item) {
        options.push({ block: name, each: block.output_per_second,
                       count: Math.ceil(rate / block.output_per_second) });
      }
      continue;
    }
    if (!item || !extractsOre(block)) continue;
    if (block.tier < item.hardness) continue;

    // The game's own formula, and the engine's own function rather than a second copy of
    // it. `drillTimeOf` knows that a burst drill pays no hardness at all and that a couple
    // of drills halve their time on one ore, neither of which a transcription here had.
    const time = drillTimeOf(block, resource, item.hardness);
    if (time <= 0) continue;

    const each = (oreTilesOf(block) * TICKS) / time;
    options.push({ block: name, each, count: Math.ceil(rate / each) });
  }

  // Fewest blocks first, then the game's own numbering, so that two options needing the
  // same count come back in the same order every time rather than in whatever order the
  // catalogue was walked in.
  return options.sort((a, b) => a.count - b.count
    || (catalogue.blocks[a.block]?.id ?? Infinity) - (catalogue.blocks[b.block]?.id ?? Infinity));
}

/** What it takes to feed the whole layout, ready to show. */
export function requirements(graph, catalogue) {
  const { outside } = demand(graph);
  // Worked out once for the whole list rather than per row: it is a property of the
  // schematic, not of the thing being asked for.
  const world = planetOf(graph);
  const rows = [];
  for (const [resource, rate] of Object.entries(outside)) {
    rows.push({
      resource,
      rate,
      perMinute: rate * 60,
      options: resource.startsWith("*") ? [] : producers(catalogue, resource, rate, world),
    });
  }
  return rows.sort((a, b) => b.rate - a.rate);
}
