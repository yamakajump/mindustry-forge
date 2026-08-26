/**
 * Hold the port against the engine it was transcribed from.
 *
 *     node tools/oracle.mjs            build the scenarios and compare
 *     node tools/oracle.mjs --measure  re-run them in the real game first
 *
 * The browser now carries a transcription of Mindustry's update loop. A transcription is
 * worth nothing unless something can tell it apart from a plausible invention, and the
 * only thing that can is the engine it came from. So each scenario is one schematic, run
 * both ways for the same number of ticks, and the two answers are counted in items rather
 * than compared as rates: "a hundred and eighty two both times" leaves nowhere to hide,
 * where "about six and a half" hides a six per cent error.
 *
 * A scenario feeds itself. It carries its own sandbox source at one end and its own vault
 * at the other, so neither side has to be told where things go in or come out, and the
 * string that goes into the game is the string that goes into the browser.
 *
 * Measuring needs a provisioned server, which is why it is a flag rather than the default:
 *
 *     cd _run && echo "measure <base64> 30 ../bench/data/<name>.json" | java -jar server-release.jar
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEPT = join(ROOT, "bench", "data", "oracle");

const { analyse, buildGraph, useCatalogue } = await import(
  new URL("../site/public/forge/analyse.js", import.meta.url));
const { fromBase64, toBase64 } = await import(
  new URL("../site/public/forge/schematic.js", import.meta.url));
const { World } = await import(new URL("../site/public/forge/engine/core.js", import.meta.url));
const { behaviourOf } = await import(
  new URL("../site/public/forge/engine/carriers.js", import.meta.url));

const known = useCatalogue(JSON.parse(
  readFileSync(join(ROOT, "site", "public", "forge", "blocks.json"), "utf8")));
const sizeOf = (name) => known.blocks[name]?.size || 1;

/** A content configuration, as the game writes it: type 5, a content kind, an id. */
const held = (kind, id) => Uint8Array.from([5, kind, (id >> 8) & 255, id & 255]);
const item = (name) => held(0, known.items[name].id);

/**
 * The scenarios.
 *
 * Small on purpose. A big schematic that disagrees tells you that something is wrong; a
 * line of eight belts that disagrees tells you which line of which class.
 */
const SCENARIOS = {
  /* A source, a line, a vault. The plainest question there is: how fast does a belt go. */
  "belt-copper": () => line("conveyor", 8),
  "belt-titanium": () => line("titanium-conveyor", 8),
  "belt-plastanium": () => line("plastanium-conveyor", 8),

  /* A short line and a long one, because a belt's rate should not depend on its length. */
  "belt-short": () => line("conveyor", 2),
  "belt-long": () => line("conveyor", 20),

  /* One in, three out. Nothing in `dump` divides by three: the even split is what a
     rotating cursor comes to, and getting the cursor wrong skips a branch entirely. */
  "router-three-ways": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
    { x: 2, y: -1, block: "conveyor", rotation: 3 },
    { x: 2, y: -3, block: "vault", rotation: 0 },
  ],

  /* Straight on first, sideways only when it cannot. A maximum flow gets the total right
     and the branch wrong, which is exactly what a simulation is for. */
  "overflow-priority": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "overflow-gate", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* Two lines crossing. If they merge, both vaults hold both items. */
  "junction-cross": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "junction", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: -2, block: "item-source", rotation: 0, raw: item("lead") },
    { x: 2, y: -1, block: "conveyor", rotation: 1 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* A bridge over a gap. Unmodelled, a line that jumps a wall reads as two dead ends. */
  "bridge-span": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "bridge-conveyor", rotation: 0,
      raw: Uint8Array.from([7, 0, 0, 0, 3, 0, 0, 0, 0]) },
    { x: 5, y: 0, block: "bridge-conveyor", rotation: 0 },
    { x: 6, y: 0, block: "conveyor", rotation: 0 },
    { x: 8, y: 0, block: "vault", rotation: 0 },
  ],
};

function line(block, length) {
  const tiles = [{ x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") }];
  for (let x = 1; x <= length; x++) tiles.push({ x, y: 0, block, rotation: 0 });
  tiles.push({ x: length + 2, y: 0, block: "vault", rotation: 0 });
  return tiles;
}

/** Run a schematic through the port, and report what its vaults hold. */
async function port(code, ticks) {
  const graph = buildGraph((await fromBase64(code)).tiles);
  const world = new World(graph, behaviourOf);
  for (let i = 0; i < ticks; i++) world.step();

  const out = {};
  for (const build of world.builds) {
    if (build.role !== "store") continue;
    for (const [name, count] of build.items.counts) {
      if (count > 0) out[name] = (out[name] || 0) + count;
    }
  }
  return out;
}

/** What the engine wrote down last time, if it has been asked. */
function measured(name) {
  const path = join(KEPT, `${name}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const out = {};
  for (const store of raw.containers || []) {
    for (const [item, count] of Object.entries(store.items || {})) {
      out[item] = (out[item] || 0) + count;
    }
  }
  return { ticks: raw.ticks, items: out };
}

const SECONDS = 30;
const TICKS = SECONDS * 60;

mkdirSync(KEPT, { recursive: true });

if (process.argv.includes("--measure")) {
  const commands = [];
  for (const [name, build] of Object.entries(SCENARIOS)) {
    const code = await toBase64(build(), { tags: { name }, sizeOf });
    writeFileSync(join(KEPT, `${name}.txt`), code);
    commands.push(`measure ${code} ${SECONDS} ../bench/data/oracle/${name}.json`);
  }
  writeFileSync(join(KEPT, "commands.txt"), `${commands.join("\n")}\n`);
  console.log(`${commands.length} scenarios ecrits dans ${KEPT}`);
  console.log("Pour les mesurer dans le vrai jeu :");
  console.log("  cd _run && (cat ../bench/data/oracle/commands.txt; sleep 20; echo exit)"
    + " | java -jar server-release.jar");
  process.exit(0);
}

let worst = 0;
let missing = 0;
console.log(`scenario              portage        jeu     ecart`);
console.log(`${"-".repeat(56)}`);

for (const [name, build] of Object.entries(SCENARIOS)) {
  const code = await toBase64(build(), { tags: { name }, sizeOf });
  const mine = await port(code, TICKS);
  const theirs = measured(name);

  if (!theirs) {
    missing++;
    console.log(`${name.padEnd(20)} ${JSON.stringify(mine).padEnd(24)} pas encore mesure`);
    continue;
  }

  const items = new Set([...Object.keys(mine), ...Object.keys(theirs.items)]);
  for (const item of items) {
    const a = mine[item] || 0;
    const b = theirs.items[item] || 0;
    const gap = b ? Math.abs(a - b) / b : (a ? 1 : 0);
    worst = Math.max(worst, gap);
    const label = `${name}/${item}`;
    console.log(`${label.padEnd(20)} ${String(a).padStart(8)} ${String(b).padStart(10)}`
      + `   ${a === b ? "exact" : `${(gap * 100).toFixed(1)}%`}`);
  }
}

console.log(`${"-".repeat(56)}`);
if (missing) {
  console.log(`${missing} scenario(s) jamais mesures : relance avec --measure`);
}
console.log(`ecart maximum : ${(worst * 100).toFixed(2)}%`);
process.exitCode = worst > 0.02 ? 1 : 0;
