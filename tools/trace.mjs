/**
 * The same scenario, one line per frame, on both engines.
 *
 *     node tools/trace.mjs <scenario>          write the port's trace and compare
 *     node tools/trace.mjs <scenario> --write  write only the port's, for a game run
 *
 * Two of the bench's scenarios sat one item apart for weeks, and a total after eighteen
 * hundred frames cannot say which frame it was. This can. The game writes the same shape
 * with the bench's own `trace` command:
 *
 *     cd _run && echo "trace <base64> 30 ../bench/data/trace/<name>.game" \
 *       | java -jar server-release.jar
 *
 * and the first line where the two differ names the block and the frame, which is a bug
 * report rather than a discrepancy.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEPT = join(ROOT, "bench", "data", "trace");

const { known, ported } = await import(new URL("./compare.mjs", import.meta.url));

const name = process.argv[2];
if (!name) {
  console.error("usage: node tools/trace.mjs <scenario> [--write]");
  process.exit(1);
}

const oracle = join(ROOT, "bench", "data", "oracle");
const code = readFileSync(join(oracle, `${name}.txt`), "utf8");
const painted = readFileSync(join(oracle, `${name}.sol`), "utf8").split(" ").filter(Boolean);
const filled = readFileSync(join(oracle, `${name}.stock`), "utf8").split(" ").filter(Boolean);

/**
 * One frame, as one line, in the bench's own format.
 *
 * Tile order rather than placement order, because that is what the game walks and the two
 * have to write the same line for the same state. Liquids to a thousandth: below that the
 * two are comparing floating point noise.
 */
function snapshot(world, tick) {
  const parts = [String(tick)];
  const order = [...world.builds].sort((a, b) =>
    (a.y - b.y) || (a.x - b.x));
  const items = Object.keys(known.items).sort((a, b) => known.items[a].id - known.items[b].id);
  const liquids = Object.keys(known.liquids)
    .sort((a, b) => known.liquids[a].id - known.liquids[b].id);

  for (const build of order) {
    let held = "";
    for (const item of items) {
      const count = build.items.get(item);
      if (count > 0) held += ` ${item}:${count}`;
    }
    for (const liquid of liquids) {
      const amount = build.liquids.get(liquid);
      if (amount > 0.0005) held += ` ${liquid}:${amount.toFixed(3)}`;
    }
    /* And the counter of a source, which decides whether it pours once or twice in the
       same frame. */
    if (build.role === "source" && build.state.counter !== undefined) {
      held += ` ~${build.state.counter.toFixed(3)}`;
    }
    // And a machine's progress, which says which frame the batch lands on.
    if (build.role === "crafter" && build.state.progress !== undefined) {
      const share = build.block.power > 0 ? (build.state.power ?? 1) : 1;
      held += ` ~${build.state.progress.toFixed(4)}/${(build.state.wants ? share : 0).toFixed(3)}`;
    }
    /* What a belt is really holding, which is not in its item module: how many are in
       flight and where the one furthest back has got to. */
    if (build.state.ids) {
      held += ` ~${build.state.len}:${(build.state.minitem ?? 1).toFixed(3)}`;
    }
    /* And its place in the update list, because a block that falls asleep leaves it and
       the list is unordered: the last one drops into the hole. Minus one means asleep, or
       a block the game never updates at all. */
    held += ` @${world.awake.indexOf(build)}`;
    parts.push(`| ${build.x},${build.y}${held}`);
  }
  return parts.join(" ");
}

const lines = [];
await ported(code, 30 * 60, painted, filled, (world, tick) => {
  lines.push(snapshot(world, tick));
});

mkdirSync(KEPT, { recursive: true });
const mine = join(KEPT, `${name}.port`);
writeFileSync(mine, `${lines.join("\n")}\n`);
console.log(`${lines.length} images ecrites dans ${mine}`);

if (process.argv.includes("--write")) process.exit(0);

const theirs = join(KEPT, `${name}.game`);
if (!existsSync(theirs)) {
  console.log("Pour la trace du jeu :");
  console.log(`  cd _run && (echo "trace ${code.trim()} 30 ../bench/data/trace/${name}.game`
    + `${[...painted, ...filled].length ? " " + [...painted, ...filled].join(" ") : ""}"`
    + "; sleep 20; echo exit) | java -jar server-release.jar");
  process.exit(0);
}

const game = readFileSync(theirs, "utf8").trim().split("\n");
for (let at = 0; at < Math.max(game.length, lines.length); at++) {
  if (game[at] === lines[at]) continue;
  console.log(`Premiere divergence a l'image ${at + 1} :`);
  console.log(`  jeu     ${game[at] ?? "(rien)"}`);
  console.log(`  portage ${lines[at] ?? "(rien)"}`);
  process.exit(1);
}
console.log(`${game.length} images identiques.`);
