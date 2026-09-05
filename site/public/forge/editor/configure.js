/**
 * What a block holds, and what it can be made to hold.
 *
 * A sorter holds the item it lets through, a source the one it makes, an unloader the one
 * it pulls. It is written into the format and `bilan.js` can already read it back; the
 * editor could not write it, so a schematic built here came out with empty sorters, which
 * is to say with lines that sort nothing.
 *
 * The encoding comes from `TypeIO.writeObject` in v159.7: type 5, one byte of content
 * family, then the id over two bytes. The families are the ones `bilan.js` already reads,
 * and they live here rather than elsewhere so that there is only one list of them.
 */

export const CONTENT = { item: 0, block: 1, liquid: 4, unit: 6 };

/**
 * Which family of content a block is configured with, or `null` when it is not configured
 * that way at all.
 *
 * Read off the game's class rather than off the name: `Sorter` covers the sorter and the
 * inverted sorter, `ItemSource` covers the item source, and a hand-kept list of names
 * starts lying the moment the game adds one.
 */
export function contentKind(block) {
  const kind = block?.kind || "";
  if (kind === "Sorter" || kind === "ItemSource" || kind === "Unloader"
      || kind === "DuctUnloader") return "item";
  if (kind === "LiquidSource") return "liquid";
  return null;
}

/** What can be picked for this block, in the game's own order. */
export function choicesFor(block, catalogue) {
  const family = contentKind(block);
  if (!family) return [];
  const registry = family === "liquid" ? catalogue.liquids : catalogue.items;
  return Object.entries(registry || {})
    .map(([name, entry]) => ({ name, id: entry.id, family }))
    .filter((choice) => Number.isInteger(choice.id))
    .sort((a, b) => a.id - b.id);
}

/** The configuration a choice produces, in the shape `schematic.js` writes. */
export function configFor(choice) {
  return { type: 5, content: CONTENT[choice.family], id: choice.id };
}

/** What a block is configured to handle, in plain words, or `null`. */
export function readsAs(tile, catalogue) {
  const config = tile?.config;
  if (!config || config.type !== 5) return null;
  const registry = config.content === CONTENT.liquid ? catalogue.liquids
    : config.content === CONTENT.item ? catalogue.items
      : config.content === CONTENT.unit ? catalogue.units
        : config.content === CONTENT.block ? catalogue.blocks : null;
  if (!registry) return null;
  for (const [name, entry] of Object.entries(registry)) {
    if (entry.id === config.id) return name;
  }
  return null;
}
