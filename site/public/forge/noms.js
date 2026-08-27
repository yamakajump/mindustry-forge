/**
 * What the game calls a block, an item or a liquid, in the reader's language.
 *
 * The pages showed `silicon-smelter`, and the best any of them did was `Silicon smelter`:
 * an identifier with its dashes taken out, offered to a French reader.
 *
 * Nothing here is written by hand. Mindustry is translated by its own community and ships
 * every translation inside the jar; `tools/build_names.py` reads that and writes one file
 * per language. Four hundred and eleven names for French, a hundred and seventy-five of
 * them carrying an accent, and eighteen kilobytes.
 *
 * The same file the server reads, and not a second copy for the browser: two lists of four
 * hundred names would be two lists to keep in step.
 */

/* Absolute, because this module is loaded from /outils/planificateur and from the analyser
   at the root. A relative base would ask the server for /outils/forge/lang. */
const BASE = "/forge/noms/";

let table = null;

/** Load the names once, for a language. Silent on failure, because a name is not vital. */
export async function loadNames(locale = document.documentElement.lang || "fr") {
  if (table) return table;
  try {
    const answer = await fetch(`${BASE}${locale}.json`);
    table = answer.ok ? await answer.json() : {};
  } catch {
    table = {};
  }
  return table;
}

/* The site says `bloc`, `objet`, `liquide`, because that is what its icon address says. The
   generated file is keyed the way the game keys its own bundles. Mapped here so that a page
   only ever has to know one vocabulary, its own. */
const FAMILIES = { bloc: "block", objet: "item", liquide: "liquid" };

/**
 * The name to show, with the identifier tidied up as a fallback.
 *
 * The fallback is reached by seventeen blocks: `air`, three removed unit factories and
 * thirteen ore floors, none of which the game names in any of its thirty-seven languages.
 * It is also what shows before `loadNames` has answered, which is why it is never empty.
 */
export function nameOf(family, id) {
  const said = table?.[`${FAMILIES[family] ?? family}.${id}`];
  if (said) return said;
  return String(id).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}
