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

  /* A sorter has two paths and each gets a scenario of its own.
  
     Merging two lines to test both at once did not work: a sandbox source pours a hundred
     a second, so whichever item is on the main line floods every round of the merge and
     three lead got through in thirty seconds. One item, one path, no ambiguity.
  
     Set to copper and carrying copper: everything goes straight on and the side vault
     stays empty. Set to copper and carrying lead: everything is turned aside and the
     vault in front stays empty. Compared container by container, so "the side vault is
     empty" is part of the answer rather than lost in a total. */
  "sorter-passes": () => sorter("copper"),
  "sorter-diverts": () => sorter("lead"),

  /* A vault that starts empty, filled by a source, emptied by an unloader into another
     vault. Eleven a second is the unloader's own stat line. */
  "unloader-drains": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "vault", rotation: 0 },
    { x: 5, y: 0, block: "unloader", rotation: 0, raw: item("copper") },
    { x: 6, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 7, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 9, y: 0, block: "vault", rotation: 0 },
  ],

  /* A press. Two coal in, one graphite out, ninety frames a batch, so at most two thirds
     of a graphite a second whatever it is fed. Fed a hundred a second by a sandbox source,
     what comes out is the machine's own pace and nothing else.
  
     A press is two across and stored at its corner, so it covers x..x+1 and y..y+1. The
     first go at this left a gap of one tile between the belt and the press and measured a
     factory that was never connected: both engines agreed on nothing at all, which is the
     right answer to the wrong question. */
  "crafter-press": () => [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 0 },
    { x: 3, y: 1, block: "graphite-press", rotation: 0 },
    { x: 5, y: 1, block: "conveyor", rotation: 0 },
    { x: 6, y: 1, block: "conveyor", rotation: 0 },
    { x: 8, y: 1, block: "vault", rotation: 0 },
  ],

  /* Four presses along one belt, which carries 6.5 coal a second where they want 5.33
     between them. They should all run, and what the belt does not deliver ends in the
     vault as coal: both numbers have to match, not just the graphite. */
  "crafter-starved": () => {
    const tiles = [
      { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 11, y: 1, block: "vault", rotation: 0 },
      { x: 11, y: 4, block: "vault", rotation: 0 },
    ];
    for (let x = 1; x <= 9; x++) tiles.push({ x, y: 1, block: "conveyor", rotation: 0 });
    for (let x = 1; x <= 9; x++) tiles.push({ x, y: 4, block: "conveyor", rotation: 0 });
    for (const x of [2, 4, 6, 8]) {
      tiles.push({ x, y: 2, block: "graphite-press", rotation: 0 });
    }
    return tiles;
  },

  /* Two presses off one router, each with its own vault, so the split is visible. */
  "crafter-two-presses": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },

    // East of the router: covers 3..4 by 0..1.
    { x: 3, y: 0, block: "graphite-press", rotation: 0 },
    { x: 5, y: 0, block: "conveyor", rotation: 0 },
    { x: 7, y: 0, block: "vault", rotation: 0 },

    // North of the router: covers 2..3 by 2..3, which clears the first press by a tile.
    { x: 2, y: 2, block: "graphite-press", rotation: 0 },
    { x: 2, y: 4, block: "conveyor", rotation: 1 },
    { x: 2, y: 6, block: "vault", rotation: 0 },
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

/** A sorter set to copper, on a line carrying whatever is asked for. */
function sorter(carried) {
  return [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item(carried) },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 0 },
    { x: 3, y: 1, block: "sorter", rotation: 0, raw: item("copper") },
    { x: 4, y: 1, block: "conveyor", rotation: 0 },
    { x: 6, y: 1, block: "vault", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 3 },
    { x: 3, y: -2, block: "vault", rotation: 0 },
  ];
}

/**
 * Refuse a scenario whose blocks stand on each other.
 *
 * Written after losing an hour to two presses sharing a tile. The game silently kept one
 * of them, so the measurement was of a schematic nobody had described, and the port and
 * the engine disagreed about a layout neither of them should have been given. Blocks are
 * stored at a corner and reach up and right by their size, which is exactly the sort of
 * arithmetic worth having checked rather than remembered.
 */
function check(name, tiles) {
  const taken = new Map();
  for (const tile of tiles) {
    const size = sizeOf(tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        const at = `${tile.x + offset + dx},${tile.y + offset + dy}`;
        if (taken.has(at)) {
          throw new Error(`${name} : ${tile.block} et ${taken.get(at)} se chevauchent `
            + `en ${at}`);
        }
        taken.set(at, tile.block);
      }
    }
  }
  return tiles;
}

function line(block, length) {
  const tiles = [{ x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") }];
  for (let x = 1; x <= length; x++) tiles.push({ x, y: 0, block, rotation: 0 });
  tiles.push({ x: length + 2, y: 0, block: "vault", rotation: 0 });
  return tiles;
}

/**
 * Line the containers up so they can be compared one to one.
 *
 * Summed together, a sorter that sorts nothing passes: the copper and the lead are both
 * there, just in the wrong vaults. Told apart by where they stand, it does not. The two
 * engines number the world differently, so the containers are sorted by position relative
 * to the leftmost and lowest of them and matched in that order.
 */
function lineUp(containers) {
  const left = Math.min(...containers.map((one) => one.x));
  const bottom = Math.min(...containers.map((one) => one.y));
  return containers
    .map((one) => ({ at: `${one.x - left},${one.y - bottom}`, items: one.items }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Run a schematic through the port, and report what each of its vaults holds. */
async function port(code, ticks) {
  const graph = buildGraph((await fromBase64(code)).tiles);
  const world = new World(graph, behaviourOf);
  for (let i = 0; i < ticks; i++) world.step();

  const containers = world.builds
    .filter((build) => build.role === "store")
    .map((build) => ({
      x: build.x, y: build.y,
      items: Object.fromEntries([...build.items.counts].filter(([, n]) => n > 0)),
    }));
  return containers.length ? lineUp(containers) : [];
}

/** What the engine wrote down last time, if it has been asked. */
function measured(name) {
  const path = join(KEPT, `${name}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const containers = raw.containers || [];
  return { ticks: raw.ticks, containers: containers.length ? lineUp(containers) : [] };
}

const SECONDS = 30;
const TICKS = SECONDS * 60;

mkdirSync(KEPT, { recursive: true });

if (process.argv.includes("--measure")) {
  const commands = [];
  for (const [name, build] of Object.entries(SCENARIOS)) {
    const code = await toBase64(check(name, build()), { tags: { name }, sizeOf });
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
console.log(`scenario / coffre / objet      portage      jeu   ecart`);
console.log(`${"-".repeat(62)}`);

for (const [name, build] of Object.entries(SCENARIOS)) {
  const code = await toBase64(check(name, build()), { tags: { name }, sizeOf });
  const mine = await port(code, TICKS);
  const theirs = measured(name);

  if (!theirs) {
    missing++;
    console.log(`${name.padEnd(20)} pas encore mesure`);
    continue;
  }

  if (mine.length !== theirs.containers.length) {
    worst = 1;
    console.log(`${name.padEnd(20)} ${mine.length} coffres contre `
      + `${theirs.containers.length}`);
    continue;
  }

  for (let i = 0; i < mine.length; i++) {
    const here = mine[i];
    const there = theirs.containers[i];
    const items = new Set([...Object.keys(here.items), ...Object.keys(there.items)]);
    for (const item of items) {
      const a = here.items[item] || 0;
      const b = there.items[item] || 0;
      const gap = b ? Math.abs(a - b) / b : (a ? 1 : 0);
      worst = Math.max(worst, gap);
      const label = `${name} ${here.at} ${item}`;
      console.log(`${label.padEnd(30)} ${String(a).padStart(6)} ${String(b).padStart(8)}`
        + `   ${a === b ? "exact" : `${(gap * 100).toFixed(1)}%`}`);
    }
  }
}

console.log(`${"-".repeat(62)}`);
if (missing) {
  console.log(`${missing} scenario(s) jamais mesures : relance avec --measure`);
}
console.log(`ecart maximum : ${(worst * 100).toFixed(2)}%`);
process.exitCode = worst > 0.02 ? 1 : 0;
