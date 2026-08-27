/*
 * Ask the engine itself what every block crafts per second, and print it.
 *
 * `Block::craftsPerSecond()` in PHP repeats one line of `analyse.js`, because a Blade page
 * cannot call a browser module. This script exists so that the repetition cannot drift: it
 * reads the current source, lifts the definition out of it, runs it over the whole
 * catalogue, and the PHP side compares.
 *
 * The definition is extracted rather than imported, and that is deliberate. `analyse.js`
 * does not export it, and adding an `export` would change the file's hash, which changes
 * `EngineVersion`, which marks every stored analysis on the site stale. A wiki detail is
 * not worth re-analysing fifteen thousand schematics, so this reads the file instead of
 * asking it to change shape.
 *
 * If the line is ever reformatted the match fails and this exits non-zero, which is the
 * right failure: somebody has touched the arithmetic and the PHP copy needs looking at.
 */
import { readFileSync } from "node:fs";

const [, , enginePath, cataloguePath] = process.argv;

const source = readFileSync(enginePath, "utf8");

const ticks = source.match(/const TICKS = (\d+);/);
const definition = source.match(/const craftsPerSecond = ([^;]+);/);

if (!ticks || !definition) {
  process.stderr.write(
    "craftsPerSecond ou TICKS introuvable dans analyse.js : la forme a change, "
    + "et la copie PHP dans Block::craftsPerSecond doit etre relue.\n",
  );
  process.exit(2);
}

const craftsPerSecond = new Function("TICKS", `return ${definition[1]};`)(Number(ticks[1]));

const catalogue = JSON.parse(readFileSync(cataloguePath, "utf8"));

const rates = {};
for (const [name, block] of Object.entries(catalogue.blocks)) {
  rates[name] = craftsPerSecond(block);
}

process.stdout.write(JSON.stringify(rates));
