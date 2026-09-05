/**
 * How far the solve is from the game, on the hundred and fifty shapes the game has answered.
 *
 *     node tools/gap.mjs            the table, worst gap first
 *     node tools/gap.mjs --all      every scenario, including the ones that deliver nothing
 *
 * This repository holds two models of the same thing in JavaScript. The tick engine under
 * `engine/` is a transcription of Mindustry's update loop, and `npm run oracle` holds it
 * against a real v159.7 headless server on every scenario in `bench/data/oracle`: it is at
 * zero per cent. The steady-state solve in `bilan.js` is a maximum flow, it answers a
 * different way, and it is the one whose numbers reach the player.
 *
 * Nobody had ever asked the second one the questions the first one has already answered.
 * This does that, and only that: it changes no behaviour and proposes no fix. The point is
 * to find out whether merging the two is plumbing or surgery before anyone starts.
 *
 * **What the gap is not.** The recordings are thirty seconds from a cold start, so they
 * carry the whole warm-up: belts filling, crafters reaching their first output, items still
 * in transit when the clock stops. The solve reports a steady state and knows none of that.
 * A few per cent of overshoot is therefore expected everywhere and means nothing. What is
 * worth reading is the tail: a scenario at forty per cent is not a warm-up.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { KEPT, groundOf, measured, paintedFor } = await import(
  new URL("./compare.mjs", import.meta.url));
const { analyse } = await import(new URL("../site/public/forge/bilan.js", import.meta.url));

const everything = process.argv.includes("--all");

/** Every scenario that was written down, in the order the directory lists them. */
const names = readdirSync(KEPT)
  .filter((file) => file.endsWith(".txt") && file !== "commands.txt")
  .map((file) => file.slice(0, -4))
  .sort();

/**
 * Both sides as a rate into the same containers.
 *
 * The comparable is not obvious and getting it wrong makes the whole table a lie. A first
 * pass held the solve's `perMinute`, what **leaves** the schematic, against the recording's
 * container contents, what stayed **inside** it: eighty-four scenarios came out at a
 * hundred per cent apart, and every one of them was a vault at the end of a belt doing
 * exactly what it was built to do. The number was not a disagreement, it was two different
 * questions.
 *
 * So: what arrives at each store, per second, on both sides. `detail[i].through` is what a
 * block passes on, and for a vault - which hands nothing on - that is what reached it.
 * Containers are lined up by position exactly as `compare.mjs` does it, normalised to the
 * lowest corner of the container list, so the two sides pair off the same way whatever the
 * schematic's own origin was.
 */
function lineUp(list) {
  if (!list.length) return [];
  const left = Math.min(...list.map((one) => one.x));
  const bottom = Math.min(...list.map((one) => one.y));
  return list
    .map((one) => ({ at: `${one.x - left},${one.y - bottom}`, items: one.items }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

const rows = [];
const broken = [];
const mismatched = [];

for (const name of names) {
  const kept = measured(name);
  if (!kept) continue;

  let report;
  try {
    const code = readFileSync(join(KEPT, `${name}.txt`), "utf8").trim();
    report = await analyse(code, {}, null, { ground: groundOf(paintedFor(name)) });
  } catch (error) {
    broken.push({ name, why: error.message });
    continue;
  }

  const seconds = kept.ticks / 60;
  const mine = lineUp(report.detail
    .filter((one) => one.role === "store" || one.role === "core")
    .map((one) => ({ x: one.x, y: one.y, items: one.through || {} })));

  if (mine.length !== kept.containers.length) {
    mismatched.push({ name, mine: mine.length, theirs: kept.containers.length });
    continue;
  }
  if (!mine.length && !everything) continue;

  for (let i = 0; i < mine.length; i++) {
    const items = new Set([...Object.keys(mine[i].items),
                           ...Object.keys(kept.containers[i].items)]);
    for (const item of items) {
      const ours = mine[i].items[item] || 0;
      const theirs = (kept.containers[i].items[item] || 0) / seconds;
      const scale = Math.max(ours, theirs);
      rows.push({ name, item, at: mine[i].at, ours, theirs,
                  gap: scale < 1e-9 ? 0 : Math.abs(ours - theirs) / scale });
    }
  }
}

/**
 * Two ways of being wrong that a per-container table cannot tell apart.
 *
 * A scenario whose totals match but whose containers do not is not producing the wrong
 * amount, it is putting the right amount in the wrong place - a junction that does not
 * cross, a sorter that does not sort. A scenario whose totals are wrong is a throughput
 * the page would print as a fact. Both are defects and they need different repairs, so
 * they are counted apart rather than summed into one alarming number.
 */
const scenarios = new Map();
for (const row of rows) {
  if (!scenarios.has(row.name)) scenarios.set(row.name, { ours: {}, theirs: {}, rows: [] });
  const one = scenarios.get(row.name);
  one.ours[row.item] = (one.ours[row.item] || 0) + row.ours;
  one.theirs[row.item] = (one.theirs[row.item] || 0) + row.theirs;
  one.rows.push(row);
}

const verdicts = [];
for (const [name, one] of scenarios) {
  let total = 0;
  let placed = 0;
  for (const item of new Set([...Object.keys(one.ours), ...Object.keys(one.theirs)])) {
    const a = one.ours[item] || 0;
    const b = one.theirs[item] || 0;
    const scale = Math.max(a, b);
    if (scale > 1e-9) total = Math.max(total, Math.abs(a - b) / scale);
  }
  for (const row of one.rows) placed = Math.max(placed, row.gap);
  verdicts.push({ name, total, placed,
                  kind: total > 0.20 ? "debit" : placed > 0.20 ? "place" : "" });
}
verdicts.sort((a, b) => (b.total - a.total) || (b.placed - a.placed));

console.log(`${"scenario".padEnd(32)} ${"total".padStart(9)} ${"per box".padStart(9)}   what it means`);
console.log("-".repeat(76));
for (const one of verdicts) {
  const label = one.kind === "debit" ? "the throughput is wrong"
    : one.kind === "place" ? "right throughput, wrong container" : "";
  console.log(`${one.name.padEnd(32)} ${(one.total * 100).toFixed(1).padStart(8)}% `
    + `${(one.placed * 100).toFixed(1).padStart(8)}%   ${label}`);
}
console.log("-".repeat(76));

const count = (kind) => verdicts.filter((one) => one.kind === kind).length;
console.log(`${verdicts.length} scenarios compared, of ${names.length} recorded`);
console.log(`  agree within 20%                  ${count("")}`);
console.log(`  the throughput is wrong           ${count("debit")}`);
console.log(`  right throughput, wrong container ${count("place")}`);
if (mismatched.length) {
  console.log(`
${mismatched.length} scenario(s) where the two sides do not see the same`
    + ` number of containers, so not compared:`);
  for (const one of mismatched) {
    console.log(`  ${one.name}: ${one.mine} against ${one.theirs}`);
  }
}
if (broken.length) {
  console.log(`
${broken.length} scenario(s) the solve refuses to read:`);
  for (const one of broken) console.log(`  ${one.name}: ${one.why}`);
}
