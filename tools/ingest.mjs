/**
 * Run the browser's analysis over a batch of schematics, under Node.
 *
 *     echo '{"id":1,"code":"bXNjaAF4nD..."}' | node tools/ingest.mjs
 *
 * One JSON line in, one JSON line out. This repository has a single implementation of the
 * analysis and it is `site/public/forge/bilan.js`: this file computes nothing, it
 * imports that one as it stands and hands it the catalogue the browser would have fetched.
 * The PHP side orchestrates and holds the database; the arithmetic stays here.
 *
 * A schematic that blows up produces one `{"id":..,"erreur":".."}` line and the batch
 * carries on. Across fifteen thousand entries collected elsewhere there will be blocks
 * from mods never seen before and truncated files: a batch that dies on the first would
 * make the other one thousand nine hundred and ninety-nine start over.
 */

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORGE = join(ROOT, "site", "public", "forge");

const { analyse, useCatalogue } = await import(
  new URL("../site/public/forge/bilan.js", import.meta.url));

useCatalogue(JSON.parse(readFileSync(join(FORGE, "blocks.json"), "utf8")));

/**
 * What is kept out of the analysis's answer.
 *
 * An allowlist rather than a blocklist, for two reasons. The first is that it makes
 * `JSON.stringify` possible at all: the answer carries `graph` and `tiles`, where the
 * nodes point at each other, and serialising that runs in circles. The second is size:
 * `offers` proposes a choice of resources per tile and `detail` describes every block, and
 * fifteen thousand rows of that are hundreds of megabytes of JSON nobody ever reads back.
 *
 * What remains is what the database searches on (`perMinute`, `needs`, `potential`, the
 * dimensions) and what a page needs to say without redoing the computation. The rest is
 * recomputable from `code`, which is kept whole.
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
  // `held` and not `detail`. The analysis carries both, and `detail` is one object per
  // block: keeping it would store two and a half thousand of them for one schematic to
  // answer a question a thirty-entry dictionary answers. `schematic_blocks` was empty on
  // all 15,533 rows because neither was on this list.
  "held",
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
    // With no identifier, nobody can tie the error back to a row in the database. It is
    // still reported, rather than letting the batch come back one answer short.
    say({ id: null, erreur: "ligne illisible" });
    continue;
  }

  try {
    say({ id: asked.id, analyse: kept(await analyse(String(asked.code ?? ""))) });
  } catch (raison) {
    say({ id: asked.id, erreur: String(raison?.message || raison) });
  }
}
