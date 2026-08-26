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

    for (const [item, count] of Object.entries(block.input || {})) {
      wanted[item] = (wanted[item] || 0) + count * crafts;
    }
    for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
      wanted[liquid] = (wanted[liquid] || 0) + rate;
    }
    // A generator that burns whatever it is handed states a duration and no ingredient.
    if (node.role === "generator" && !Object.keys(block.input || {}).length && crafts) {
      wanted["*combustible"] = (wanted["*combustible"] || 0) + crafts;
    }

    for (const [item, count] of Object.entries(block.output || {})) {
      made[item] = (made[item] || 0) + count * crafts;
    }
    for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
      made[liquid] = (made[liquid] || 0) + rate;
    }
  }

  const outside = {};
  for (const [name, rate] of Object.entries(wanted)) {
    // A generator that burns anything is covered by anything the layout burns. Counted
    // against its own name, it stayed on the shopping list of a schematic whose own
    // centrifuges already made exactly the coal its generators ate.
    const covered = name === "*combustible"
      ? Object.entries(made).reduce((sum, [item, r]) =>
          item.startsWith("*") ? sum : sum + r, 0)
      : (made[name] || 0);
    const short = rate - covered;
    if (short > 1e-4) outside[name] = short;
  }
  return { outside, wanted, made };
}

/**
 * How many of each producer it takes to cover a rate.
 *
 * A drill's speed depends on the ore under it, so the figure here is the best case: a full
 * footprint of that ore. Said as a best case rather than as a promise, because a drill on
 * half a patch does half as much and a player who is told otherwise will build half a
 * factory.
 */
export function producers(catalogue, resource, rate) {
  const options = [];
  const item = catalogue.items?.[resource];

  for (const [name, block] of Object.entries(catalogue.blocks)) {
    if (block.role === "pump" && block.output_per_second) {
      // A pump only pumps what is under it, so it covers any liquid; which one is the
      // map's business, not the schematic's.
      if (!item) {
        options.push({ block: name, each: block.output_per_second,
                       count: Math.ceil(rate / block.output_per_second) });
      }
      continue;
    }
    if (block.role !== "drill" || !item) continue;
    // The game's own formula: harder ore takes a drill longer, and a bigger drill covers
    // more tiles of it.
    if (block.tier < item.hardness) continue;
    const time = (block.drill_time || 0) + (block.hardness_multiplier || 0) * item.hardness;
    if (time <= 0) continue;
    const tiles = (block.size || 1) ** 2;
    const each = (tiles * TICKS) / time;
    options.push({ block: name, each, count: Math.ceil(rate / each) });
  }

  return options.sort((a, b) => a.count - b.count);
}

/** What it takes to feed the whole layout, ready to show. */
export function requirements(graph, catalogue) {
  const { outside } = demand(graph);
  const rows = [];
  for (const [resource, rate] of Object.entries(outside)) {
    rows.push({
      resource,
      rate,
      perMinute: rate * 60,
      options: resource.startsWith("*") ? [] : producers(catalogue, resource, rate),
    });
  }
  return rows.sort((a, b) => b.rate - a.rate);
}
