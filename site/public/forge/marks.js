/**
 * What the player says goes in, and what comes out.
 *
 * This replaced a guess, and the guess is worth describing because it is the reason there
 * is a module here at all. It looked at every carrier on the boundary of the schematic,
 * worked out what the machines behind each one were waiting for, picked the likeliest per
 * resource and fed the layout through it. Everything downstream was computed from that
 * choice: the throughput, the bottleneck, the waste.
 *
 * It was wrong often enough to poison the whole page, and worse, it was wrong invisibly.
 * A design has one intake and a dozen pipes that could physically be it, and nothing in
 * the file says which the author meant. On a real schematic the picture came back with
 * fourteen green rings, one of them solid, and no way for a reader to tell whether the
 * solid one was right. A guess that produces a blank is annoying; a guess that produces a
 * full page of numbers that look computed is worse than producing nothing at all.
 *
 * So it is asked. The player marks a belt as an intake and says what arrives on it, and
 * everything else follows from that. What is left here is bookkeeping, not inference:
 * turning marks into feeds, and saying how much each marked intake has to carry.
 */

/** A mark, normalised: older saves wrote a bare "in" or "out" with no resource. */
const readMark = (value) =>
  typeof value === "string" ? { side: value, resource: null } : value;

/** Every mark, keyed by tile, with the shape the rest of this file expects. */
export function readMarks(marks) {
  const out = {};
  for (const [at, value] of Object.entries(marks || {})) {
    const mark = readMark(value);
    if (mark && (mark.side === "in" || mark.side === "out")) out[at] = mark;
  }
  return out;
}

/** The blocks a mark can go on: the ones that carry something from one tile to another. */
export function markable(node) {
  return Boolean(node.block.carries)
    && node.role !== "source" && node.role !== "unknown";
}

/**
 * What could plausibly arrive on this block, offered as a short list to pick from.
 *
 * Not a guess at which one: a list of what the layout is short of, narrowed to what this
 * carrier can physically hold. A pipe is never offered coal.
 */
export function candidates(node, shortOf, everything, catalogue, isLiquid) {
  const liquid = node.block.carries === "liquid";
  const fits = (name) => isLiquid(name) === liquid;

  const named = Object.keys(shortOf).filter((name) => !name.startsWith("*") && fits(name));
  if (named.length) return named;

  // A generator that burns anything states a duration and no ingredient, so the layout is
  // short of "a fuel" rather than of coal. Expanded into what actually burns, from the
  // game's own flammability, rather than from a list typed here.
  if (!liquid && Object.keys(shortOf).some((name) => name.startsWith("*"))) {
    return Object.entries(catalogue.items || {})
      .filter(([, item]) => item.flammability > 0.1)
      .map(([name]) => name);
  }

  return Object.keys(everything).filter((name) => !name.startsWith("*") && fits(name));
}

/**
 * Turn the marks into what arrives where, per second.
 *
 * A marked intake with a resource on it carries that resource. Several marked for the
 * same one share the demand between them: two water pipes marked means two water pipes,
 * not two schematics.
 *
 * A marked intake with nothing named on it takes whatever the layout is short of and that
 * it can hold, which is what an older save looks like and what a player who clicked
 * without picking means.
 */
export function feedFrom(graph, marks, shortOf, isLiquid, supply = {}) {
  const wanted = {};
  for (const [at, mark] of Object.entries(readMarks(marks))) {
    if (mark.side !== "in") continue;
    const index = graph.nodes.findIndex((node) => `${node.x},${node.y}` === at);
    if (index < 0) continue;
    (wanted[mark.resource || "?"] = wanted[mark.resource || "?"] || []).push(index);
  }
  if (!Object.keys(wanted).length) return {};

  // What the layout asks for, unless the player typed a rate of their own: "what does this
  // do on half the water I have" is a different question from "what does it do fed".
  const asked = { ...shortOf, ...supply };

  const feeds = {};
  for (const [resource, rate] of Object.entries(asked)) {
    if (resource.startsWith("*") || !(rate > 0)) continue;
    const carries = isLiquid(resource) ? "liquid" : "item";

    const named = wanted[resource] || [];
    const loose = (wanted["?"] || [])
      .filter((index) => (graph.nodes[index].block.carries || "item") === carries);
    const able = named.length ? named : loose;
    if (!able.length) continue;

    for (const index of able) {
      feeds[index] = { ...(feeds[index] || {}), [resource]: rate / able.length };
    }
  }
  return feeds;
}

/**
 * What each marked tile handles: a rate, and what it is a rate of.
 *
 * This is what turns "you marked this pipe" into "this pipe has to bring 8,640 water a
 * minute, which is two impulse pumps".
 */
export function marksOf(graph, marks, feeds, solved) {
  const inputs = [];
  const outputs = [];

  for (const [at, mark] of Object.entries(readMarks(marks))) {
    const index = graph.nodes.findIndex((node) => `${node.x},${node.y}` === at);
    if (index < 0) continue;
    const node = graph.nodes[index];
    const common = {
      index, x: node.x, y: node.y, name: node.name,
      carries: node.block.carries || "item",
    };

    if (mark.side === "in") {
      const rates = feeds[index] || {};
      const [resource, rate] = Object.entries(rates)[0]
        || [mark.resource || null, 0];
      inputs.push({ ...common, resource, rate });
    } else {
      // What comes out is not a choice: it is whatever reaches the tile. The player says
      // where, the layout says what.
      const rates = solved?.through?.[index] || {};
      const [resource, rate] = Object.entries(rates)
        .sort((a, b) => b[1] - a[1])[0] || [mark.resource || null, 0];
      outputs.push({ ...common, resource, rate });
    }
  }
  return { inputs, outputs };
}
