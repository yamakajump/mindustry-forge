/**
 * Ce qu'un bloc retient, et ce qu'on peut lui faire retenir.
 *
 * Un trieur retient l'objet qu'il laisse passer, une source celui qu'elle fabrique, un
 * déchargeur celui qu'il tire. C'est écrit dans le format, `analyse.js` sait le relire, et
 * l'éditeur ne savait pas le poser : une schématique construite ici sortait avec ses
 * trieurs vides, donc avec ses lignes qui ne trient rien.
 *
 * Le codage vient de `TypeIO.writeObject` de la v159.7 : type 5, un octet de famille de
 * contenu, puis l'identifiant sur deux octets. Les familles sont celles que `analyse.js`
 * lit déjà, et elles sont ici plutôt qu'ailleurs pour qu'il n'y en ait qu'une liste.
 */

export const CONTENT = { item: 0, block: 1, liquid: 4, unit: 6 };

/**
 * De quelle famille de contenu un bloc se configure, ou `null` s'il ne se configure pas
 * comme ça.
 *
 * Lu sur la classe du jeu plutôt que sur le nom : `Sorter` couvre le trieur et le trieur
 * inverse, `ItemSource` la source d'objets, et une liste de noms tenue à la main se met à
 * mentir dès que le jeu en ajoute un.
 */
export function contentKind(block) {
  const kind = block?.kind || "";
  if (kind === "Sorter" || kind === "ItemSource" || kind === "Unloader"
      || kind === "DuctUnloader") return "item";
  if (kind === "LiquidSource") return "liquid";
  return null;
}

/** Les choix possibles pour ce bloc, dans l'ordre du jeu. */
export function choicesFor(block, catalogue) {
  const family = contentKind(block);
  if (!family) return [];
  const registry = family === "liquid" ? catalogue.liquids : catalogue.items;
  return Object.entries(registry || {})
    .map(([name, entry]) => ({ name, id: entry.id, family }))
    .filter((choice) => Number.isInteger(choice.id))
    .sort((a, b) => a.id - b.id);
}

/** La configuration qu'un choix produit, dans la forme que `schematic.js` écrit. */
export function configFor(choice) {
  return { type: 5, content: CONTENT[choice.family], id: choice.id };
}

/** Ce qu'un bloc est configuré pour manipuler, en clair, ou `null`. */
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
