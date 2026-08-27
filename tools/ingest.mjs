/**
 * Faire tourner l'analyse du navigateur sur un lot de schematiques, sous Node.
 *
 *     echo '{"id":1,"code":"bXNjaAF4nD..."}' | node tools/ingest.mjs
 *
 * Une ligne JSON entre, une ligne JSON sort. Ce depot n'a qu'une implementation de
 * l'analyse et c'est `site/public/forge/analyse.js` : ce fichier ne calcule rien, il
 * l'importe telle quelle et lui donne le catalogue que le navigateur irait chercher par
 * `fetch`. Le cote PHP orchestre et tient la base, l'arithmetique reste ici.
 *
 * Une schematique qui explose sort une ligne `{"id":..,"erreur":".."}` et le lot continue.
 * Sur quinze mille entrees collectees ailleurs, il y aura des blocs de mods jamais vus et
 * des fichiers tronques : un lot qui meurt sur la premiere ferait recommencer les mille
 * neuf cent quatre-vingt-dix-neuf autres.
 */

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORGE = join(ROOT, "site", "public", "forge");

const { analyse, useCatalogue } = await import(
  new URL("../site/public/forge/analyse.js", import.meta.url));

useCatalogue(JSON.parse(readFileSync(join(FORGE, "blocks.json"), "utf8")));

/**
 * Ce qu'on garde de la reponse de l'analyse.
 *
 * Une liste blanche, pas une liste noire, et pour deux raisons. La premiere est qu'elle
 * rend `JSON.stringify` possible du tout : la reponse porte `graph` et `tiles`, ou les
 * noeuds se pointent les uns les autres, et serialiser ca part en boucle. La seconde est
 * la taille : `offers` propose un choix de ressources par case, `detail` decrit chaque
 * bloc, et quinze mille lignes de ca sont des centaines de megaoctets de JSON que personne
 * ne relit jamais.
 *
 * Ce qui reste est ce que la base cherche (`perMinute`, `needs`, `potential`, les
 * dimensions) et ce qu'une page a besoin de dire sans refaire le calcul. Le reste est
 * recalculable a partir de `code`, qui est garde entier.
 */
const KEPT = [
  "name", "width", "height", "blocks", "gameVersion",
  "perMinute", "produced", "internal", "surplus",
  "bottleneck", "idle", "unknown", "cost", "needs",
  // `potential` is the power ceiling and `potentialPerMinute` the matter one. They were
  // written together and only the first was listed here, so every collected schematic got
  // a power ceiling and no item ceiling: 317 of 15 533 rows carried a production figure,
  // two per cent, on a site whose promise is "search by what it makes". A whitelist is the
  // right shape for this file - the analysis returns a graph that cannot be serialised -
  // but it is also a list somebody has to remember to add to, and nobody did.
  "power", "potential", "potentialPerMinute", "asTheGameSaysIt", "logic",
  "awaiting", "sealed", "selfFed", "settled", "altered", "truncated",
];

const kept = (found) => Object.fromEntries(
  KEPT.filter((key) => found[key] !== undefined).map((key) => [key, found[key]]));

const say = (answer) => process.stdout.write(`${JSON.stringify(answer)}\n`);

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  let asked;
  try {
    asked = JSON.parse(trimmed);
  } catch {
    // Sans identifiant, personne ne peut rattacher l'erreur a une ligne de la base. On le
    // dit quand meme plutot que de laisser le lot revenir avec une reponse en moins.
    say({ id: null, erreur: "ligne illisible" });
    continue;
  }

  try {
    say({ id: asked.id, analyse: kept(await analyse(String(asked.code ?? ""))) });
  } catch (raison) {
    say({ id: asked.id, erreur: String(raison?.message || raison) });
  }
}
