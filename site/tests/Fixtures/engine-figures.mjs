/*
 * Ask the engine itself for the figures the wiki repeats, and print them.
 *
 * Two of `Block`'s methods restate arithmetic that already lives in the browser modules,
 * because a Blade page cannot call one. This script exists so the repetition cannot drift:
 * it runs the real functions over the whole catalogue and the PHP side compares.
 *
 * The two are fetched differently, on purpose.
 *
 * `drillTimeOf` is exported from `engine/ground.js`, so it is imported. Nothing is copied
 * and nothing can go stale.
 *
 * `craftsPerSecond` is not exported from `bilan.js`, so its definition is lifted out of
 * the source text. Adding an `export` would change that file's hash, which changes
 * `EngineVersion`, which marks every stored analysis on the site stale: a wiki detail is not
 * worth re-analysing fifteen thousand schematics. If the line is ever reformatted the match
 * fails and this exits non-zero, which is the right failure, since somebody has touched the
 * arithmetic and the PHP copy needs reading.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [, , enginePath, cataloguePath, groundPath] = process.argv;

const source = readFileSync(enginePath, "utf8");

const ticks = source.match(/const TICKS = (\d+);/);
const definition = source.match(/const craftsPerSecond = ([^;]+);/);

if (!ticks || !definition) {
  process.stderr.write(
    "craftsPerSecond or TICKS not found in bilan.js: the shape has changed, "
    + "and the PHP copy in Block::craftsPerSecond needs reading again.\n",
  );
  process.exit(2);
}

const craftsPerSecond = new Function("TICKS", `return ${definition[1]};`)(Number(ticks[1]));

const { drillTimeOf } = await import(pathToFileURL(groundPath).href);

const catalogue = JSON.parse(readFileSync(cataloguePath, "utf8"));

const rates = {};
const drills = {};

for (const [name, block] of Object.entries(catalogue.blocks)) {
  rates[name] = craftsPerSecond(block);

  if (!block.drill_time) continue;

  // Every ore against every drill, including the ones the drill is too weak for. Whether it
  // may touch an ore is a separate question from how long it would take, and comparing both
  // sides on the arithmetic alone keeps this test about the arithmetic.
  const perOre = {};
  for (const [item, spec] of Object.entries(catalogue.items || {})) {
    perOre[item] = drillTimeOf(block, item, spec.hardness ?? 0);
  }
  drills[name] = perOre;
}

process.stdout.write(JSON.stringify({ rates, drills }));
